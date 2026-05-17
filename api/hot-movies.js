const API_BASE = "https://api.bilibili.com";

const cache = {
  createdAt: 0,
  payload: null
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
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
    title: item.title || "未命名视频",
    desc: item.desc || item.description || "",
    author: owner.name || item.author || "未知 UP 主",
    cover: pic,
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : `https://www.bilibili.com/video/av${aid}`,
    pubdate,
    pubdateText: pubdate ? new Date(pubdate * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "",
    duration: item.duration || "",
    source,
    stats: {
      view: Number(stat.view || item.play || 0),
      danmaku: Number(stat.danmaku || item.video_review || 0),
      like: Number(stat.like || 0),
      coin: Number(stat.coin || 0),
      favorite: Number(stat.favorite || 0),
      share: Number(stat.share || 0),
      reply: Number(stat.reply || 0)
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

async function collectMovieVideos() {
  const today = getShanghaiDateKey();
  const endpoints = [
    { source: "电影分区排行", path: "/x/web-interface/ranking/region?rid=23&day=3" },
    { source: "电影分区最新", path: "/x/web-interface/dynamic/region?ps=50&rid=23" }
  ];

  const results = await Promise.allSettled(endpoints.map((endpoint) => bilibiliFetch(endpoint.path)));
  const videos = [];

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const source = endpoints[index].source;
    const data = result.value.data || {};
    const list = Array.isArray(data) ? data : data.archives || data.list || data.result || [];
    list.forEach((item) => videos.push(normalizeVideo(item, source)));
  });

  const ranked = Array.from(new Map(videos.filter((video) => video.id).map((video) => [video.id, video])).values())
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (cache.payload && Date.now() - cache.createdAt < 3 * 60 * 1000) {
    sendJson(res, 200, { ...cache.payload, cached: true });
    return;
  }

  try {
    const payload = await collectMovieVideos();
    cache.createdAt = Date.now();
    cache.payload = payload;
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
};
