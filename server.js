const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const API_BASE = "https://api.bilibili.com";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const cache = new Map();

const VIDEO_MODES = {
  movie: {
    sources: [
      { source: "电影分区排行", path: "/x/web-interface/ranking/region?rid=23&day=3" },
      { source: "电影分区最新", path: "/x/web-interface/dynamic/region?ps=50&rid=23" }
    ]
  },
  commentary: {
    sources: [
      { source: "影视杂谈排行", path: "/x/web-interface/ranking/region?rid=182&day=3" },
      { source: "影视杂谈最新", path: "/x/web-interface/dynamic/region?ps=30&rid=182" },
      {
        source: "电影解说热门",
        path:
          "/x/web-interface/search/type?search_type=video&keyword=%E7%94%B5%E5%BD%B1%E8%A7%A3%E8%AF%B4&order=click&duration=0&page=1"
      },
      {
        source: "电影解说最新",
        path:
          "/x/web-interface/search/type?search_type=video&keyword=%E7%94%B5%E5%BD%B1%E8%A7%A3%E8%AF%B4&order=pubdate&duration=0&page=1"
      }
    ]
  }
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function getShanghaiDateKey(seconds = Date.now() / 1000) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(seconds * 1000));
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function parseStatValue(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) return 0;
  if (text.endsWith("万")) return Math.round(Number(text.slice(0, -1)) * 10000) || 0;
  return Number(text) || 0;
}

function normalizeVideo(item, source) {
  const stat = item.stat || {};
  const owner = item.owner || item.author || {};
  const pubdate = Number(item.pubdate || item.created || 0);
  const pic = item.pic ? String(item.pic).replace(/^\/\//, "https://").replace(/^http:\/\//, "https://") : "";
  const bvid = item.bvid || "";
  const aid = item.aid || "";

  return {
    id: bvid || aid,
    bvid,
    title: stripHtml(item.title) || "未命名视频",
    desc: stripHtml(item.desc || item.description || ""),
    author: owner.name || item.author || "未知 UP 主",
    cover: pic,
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : `https://www.bilibili.com/video/av${aid}`,
    pubdate,
    pubdateText: pubdate ? new Date(pubdate * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "",
    duration: item.duration || "",
    source,
    stats: {
      view: parseStatValue(stat.view || item.play),
      danmaku: parseStatValue(stat.danmaku || item.video_review),
      like: parseStatValue(stat.like),
      coin: parseStatValue(stat.coin),
      favorite: parseStatValue(stat.favorite || item.favorites),
      share: parseStatValue(stat.share),
      reply: parseStatValue(stat.reply)
    }
  };
}

function hotScore(video) {
  const s = video.stats;
  const freshness = video.pubdate && getShanghaiDateKey(video.pubdate) === getShanghaiDateKey() ? 1.18 : 1;
  return Math.round(
    freshness *
      (s.view + s.danmaku * 6 + s.like * 18 + s.coin * 24 + s.favorite * 16 + s.share * 30 + s.reply * 12)
  );
}

async function bilibiliFetch(pathname) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Referer: "https://www.bilibili.com/",
      Accept: "application/json,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`Bilibili API returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.code !== 0) {
    throw new Error(payload.message || `Bilibili API code ${payload.code}`);
  }

  return payload;
}

async function collectMovieVideos(type = "movie") {
  const today = getShanghaiDateKey();
  const mode = VIDEO_MODES[type] || VIDEO_MODES.movie;
  const endpoints = mode.sources;

  const videos = [];

  for (const endpoint of endpoints) {
    try {
      const result = await bilibiliFetch(endpoint.path);
      const data = result.data || {};
      const list = Array.isArray(data) ? data : data.archives || data.list || data.result || [];
      list.forEach((item) => videos.push(normalizeVideo(item, endpoint.source)));
    } catch (error) {
      console.warn(`${endpoint.source} failed: ${error.message}`);
    }
  }

  const deduped = Array.from(new Map(videos.filter((video) => video.id).map((video) => [video.id, video])).values());
  const ranked = deduped
    .map((video) => ({
      ...video,
      isToday: video.pubdate ? getShanghaiDateKey(video.pubdate) === today : false,
      hotScore: hotScore(video)
    }))
    .sort((a, b) => {
      if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
      return b.hotScore - a.hotScore;
    });

  return {
    updatedAt: new Date().toISOString(),
    dateKey: today,
    videos: ranked.slice(0, 60),
    sources: endpoints.map((endpoint) => endpoint.source)
  };
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const type = requestUrl.searchParams.get("type") === "commentary" ? "commentary" : "movie";
  const key = `hot-${type}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < 3 * 60 * 1000) {
    sendJson(res, 200, { ...cached.payload, cached: true });
    return;
  }

  try {
    const payload = await collectMovieVideos(type);
    cache.set(key, { createdAt: Date.now(), payload });
    sendJson(res, 200, { ...payload, cached: false });
  } catch (error) {
    sendJson(res, 502, {
      error: "暂时无法连接 B 站公开接口",
      detail: error.message,
      updatedAt: new Date().toISOString(),
      dateKey: getShanghaiDateKey(),
      videos: []
    });
  }
}

async function handleCover(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const src = requestUrl.searchParams.get("src");

  try {
    if (!src) throw new Error("Missing cover URL");

    const imageUrl = new URL(src);
    if (!/(^|\.)hdslb\.com$/i.test(imageUrl.hostname)) {
      throw new Error("Unsupported cover host");
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Referer: "https://www.bilibili.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) throw new Error(`Cover returned ${response.status}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400"
    });
    res.end(buffer);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message);
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/hot-movies") {
    handleApi(req, res);
    return;
  }
  if (url.pathname === "/api/cover") {
    handleCover(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Bilibili movie app running at http://localhost:${PORT}`);
});
