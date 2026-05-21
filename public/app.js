const state = {
  videos: [],
  mode: "commentary",
  filter: "all",
  sort: "hot",
  query: ""
};

const modeMeta = {
  movie: {
    title: "B站热门电影",
    eyebrow: "",
    loading: "正在抓取 B 站今日电影热度...",
    empty: "暂无电影数据。"
  },
  commentary: {
    title: "B站解说",
    eyebrow: "",
    loading: "正在抓取 B 站今日电影解说热度...",
    empty: "暂无电影解说数据。"
  },
  classic: {
    title: "B站经典电影",
    eyebrow: "",
    loading: "正在抓取 B 站经典电影热度...",
    empty: "暂无经典电影数据。"
  },
  usDrama: {
    title: "B站美剧",
    eyebrow: "",
    loading: "正在抓取 B 站美剧热度...",
    empty: "暂无美剧数据。"
  },
  cnDrama: {
    title: "B站国剧",
    eyebrow: "",
    loading: "正在抓取 B 站国剧热度...",
    empty: "暂无国剧数据。"
  },
  krDrama: {
    title: "B站韩剧",
    eyebrow: "",
    loading: "正在抓取 B 站韩剧热度...",
    empty: "暂无韩剧数据。"
  },
  jpDrama: {
    title: "B站日剧",
    eyebrow: "",
    loading: "正在抓取 B 站日剧热度...",
    empty: "暂无日剧数据。"
  },
  variety: {
    title: "B站综艺",
    eyebrow: "",
    loading: "正在抓取 B 站综艺热度...",
    empty: "暂无综艺数据。"
  },
  huaqiang: {
    title: "B站华强买瓜",
    eyebrow: "",
    loading: "正在抓取 B 站华强买瓜 AI 二创...",
    empty: "暂无华强买瓜 AI 二创数据。"
  }
};

const grid = document.querySelector("#grid");
const statusBox = document.querySelector("#status");
const template = document.querySelector("#videoCardTemplate");
const refreshBtn = document.querySelector("#refreshBtn");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const pageTitle = document.querySelector("#pageTitle");
const pageEyebrow = document.querySelector("#pageEyebrow");
const todayCount = document.querySelector("#todayCount");
const totalCount = document.querySelector("#totalCount");
const updateTime = document.querySelector("#updateTime");

function formatNumber(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  return String(value || 0);
}

function formatTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function coverUrl(src) {
  return src ? `/api/cover?src=${encodeURIComponent(src)}` : "";
}

function getShanghaiNow() {
  const now = new Date();
  const shanghaiText = now.toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false
  });
  return new Date(shanghaiText.replace(" ", "T"));
}

function getWeekStart(date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start;
}

function matchesTimeFilter(video, filter) {
  if (filter === "all") return true;
  if (!video.pubdate) return false;

  const now = getShanghaiNow();
  const publishedAt = new Date(video.pubdate * 1000);

  if (filter === "today") return video.isToday;

  if (filter === "week") {
    return publishedAt >= getWeekStart(now);
  }

  if (filter === "month") {
    return (
      publishedAt.getFullYear() === now.getFullYear() &&
      publishedAt.getMonth() === now.getMonth()
    );
  }

  if (filter === "year") {
    return publishedAt.getFullYear() === now.getFullYear();
  }

  return true;
}

function updatePageMeta() {
  const meta = modeMeta[state.mode] || modeMeta.commentary;
  pageTitle.textContent = meta.title;
  pageEyebrow.textContent = meta.eyebrow;
  document.title = meta.title;
}

function getSortedVideos() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.videos.filter((video) => {
    const matchesFilter = matchesTimeFilter(video, state.filter);
    const haystack = `${video.title} ${video.author} ${video.desc}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });

  return filtered.sort((a, b) => {
    if (state.sort === "view") return b.stats.view - a.stats.view;
    if (state.sort === "like") return b.stats.like - a.stats.like;
    if (state.sort === "new") return b.pubdate - a.pubdate;
    return b.hotScore - a.hotScore;
  });
}

function render() {
  const videos = getSortedVideos();
  grid.innerHTML = "";

  if (!videos.length) {
    statusBox.hidden = false;
    statusBox.textContent = state.videos.length
      ? "没有匹配的视频，换个关键词试试。"
      : (modeMeta[state.mode] || modeMeta.commentary).empty;
    return;
  }

  statusBox.hidden = true;
  const fragment = document.createDocumentFragment();

  videos.forEach((video, index) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const link = node.querySelector(".coverLink");
    const img = node.querySelector(".cover");

    link.href = video.url;
    img.src = coverUrl(video.cover);
    img.alt = video.title;
    node.querySelector(".rank").textContent = `#${index + 1}`;
    node.querySelector(".badge").textContent = video.isToday ? "今日" : "近期";
    node.querySelector(".source").textContent = video.source;
    node.querySelector("h2").textContent = video.title;
    node.querySelector(".desc").textContent = video.desc || "这个视频没有简介。";
    node.querySelector(".author").textContent = `${video.author} · ${video.pubdateText || "发布时间未知"}`;
    node.querySelector(".stats").innerHTML = `
      <span>播放 ${formatNumber(video.stats.view)}</span>
      <span>点赞 ${formatNumber(video.stats.like)}</span>
      <span>弹幕 ${formatNumber(video.stats.danmaku)}</span>
      <span>热度 ${formatNumber(video.hotScore)}</span>
    `;

    if (index === 0) card.classList.add("featured");
    fragment.appendChild(node);
  });

  grid.appendChild(fragment);
}

async function loadData() {
  updatePageMeta();
  refreshBtn.disabled = true;
  statusBox.hidden = false;
  statusBox.textContent = (modeMeta[state.mode] || modeMeta.commentary).loading;

  try {
    const response = await fetch(`/api/hot-movies?type=${state.mode}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "请求失败");

    state.videos = payload.videos || [];
    totalCount.textContent = state.videos.length;
    todayCount.textContent = state.videos.filter((video) => video.isToday).length;
    updateTime.textContent = formatTime(payload.updatedAt);
    render();
  } catch (error) {
    state.videos = [];
    totalCount.textContent = "0";
    todayCount.textContent = "0";
    updateTime.textContent = "--";
    grid.innerHTML = "";
    statusBox.hidden = false;
    statusBox.textContent = `加载失败：${error.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    render();
  });
});

document.querySelectorAll(".pageTabs button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.mode === state.mode) return;
    document.querySelectorAll(".pageTabs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    state.filter = "all";
    state.query = "";
    searchInput.value = "";
    document.querySelectorAll(".segmented button").forEach((item) => {
      item.classList.toggle("active", item.dataset.filter === "all");
    });
    loadData();
  });
});

refreshBtn.addEventListener("click", loadData);
sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});
searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

loadData();
