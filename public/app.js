const state = {
  videos: [],
  filter: "all",
  sort: "hot",
  query: ""
};

const grid = document.querySelector("#grid");
const statusBox = document.querySelector("#status");
const template = document.querySelector("#videoCardTemplate");
const refreshBtn = document.querySelector("#refreshBtn");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
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

function getSortedVideos() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.videos.filter((video) => {
    const matchesFilter = state.filter === "all" || video.isToday;
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
    statusBox.textContent = state.videos.length ? "没有匹配的视频，换个关键词试试。" : "暂无数据。";
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
  refreshBtn.disabled = true;
  statusBox.hidden = false;
  statusBox.textContent = "正在抓取 B 站今日电影热度...";

  try {
    const response = await fetch("/api/hot-movies");
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
