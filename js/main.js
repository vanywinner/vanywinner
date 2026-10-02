(function () {
  const { breaking, articles, videos } = SITE_DATA;
  const CATEGORIES = ["News", "Business", "Sports", "Opinion"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function thumb(a) {
    return a.image
      ? `<img class="thumb" src="${esc(a.image)}" alt="" loading="lazy">`
      : `<div class="thumb thumb--${a.category.toLowerCase()}"></div>`;
  }
  function storyCard(a) {
    return `<article class="story-card"><a class="story-card__link" href="${esc(a.link || "#")}">
      ${thumb(a)}<span class="chip">${esc(a.category)}</span>
      <h3 class="story-card__title">${esc(a.title)}</h3>
      <p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p></a></article>`;
  }
  function sideStory(a) {
    return `<article class="side-story"><a class="side-story__link" href="${esc(a.link || "#")}">
      ${thumb(a)}<div><span class="chip">${esc(a.category)}</span>
      <h3 class="side-story__title">${esc(a.title)}</h3>
      <p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p></div></a></article>`;
  }

  function renderTop() {
    const [lead, ...rest] = articles;
    $("lead-story").innerHTML = `<a class="lead-story__link" href="${esc(lead.link || "#")}">
      <span class="chip chip--light">${esc(lead.category)}</span>
      <h1 class="lead-story__title">${esc(lead.title)}</h1>
      <p class="lead-story__summary">${esc(lead.summary)}</p>
      <p class="lead-story__meta">By ${esc(lead.author)}, ${esc(lead.time)}</p></a>`;
    $("side-stories").innerHTML = rest.slice(0, 3).map(sideStory).join("");
    const top = [...articles].sort((a, b) => b.views - a.views).slice(0, 5);
    $("trending-list").innerHTML = top.map((a) =>
      `<li class="trending__item"><a class="trending__link" href="${esc(a.link || "#")}">${esc(a.title)}</a></li>`).join("");
  }

  function renderVideos() {
    $("video-grid").innerHTML = videos.map((v, i) =>
      `<button class="video-card" type="button" data-video-index="${i}">
        <span class="video-card__thumb"><span class="video-card__play" aria-hidden="true"></span><span class="video-card__length">${esc(v.length)}</span></span>
        <span class="video-card__title">${esc(v.title)}</span></button>`).join("");
  }

  function renderCategories() {
    $("category-sections").innerHTML = CATEGORIES.map((cat) => {
      const items = articles.filter((a) => a.category === cat).slice(0, 4);
      if (!items.length) return "";
      return `<section id="${cat.toLowerCase()}" class="category-section">
        <h2 class="section-title">${cat}</h2>
        <div class="card-grid">${items.map(storyCard).join("")}</div></section>`;
    }).join("");
  }

  function renderSearch(q) {
    const found = articles.filter((a) => (a.title + " " + a.summary).toLowerCase().includes(q));
    $("category-sections").innerHTML = `<section class="category-section"><h2 class="section-title">Results for "${esc(q)}"</h2>` +
      (found.length ? `<div class="card-grid">${found.map(storyCard).join("")}</div>` : `<p class="empty-note">No stories match that search. Try a shorter word.</p>`) + `</section>`;
  }

  function setSearchMode(on) {
    $("top-stories").hidden = on;
    $("videos").hidden = on;
  }

  function openVideo(i) {
    const v = videos[i];
    $("video-player").innerHTML = v.youtubeId
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?autoplay=1" title="${esc(v.title)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`
      : `<p class="modal__empty">This video has no YouTube ID yet. Add one in js/data.js.</p>`;
    $("video-modal").hidden = false;
  }
  function closeVideo() { $("video-modal").hidden = true; $("video-player").innerHTML = ""; }

  /* init */
  $("today-date").textContent = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("footer-year").textContent = new Date().getFullYear();
  let b = 0;
  const showBreaking = () => { $("breaking-text").textContent = breaking[b++ % breaking.length]; };
  showBreaking();
  if (breaking.length > 1) setInterval(showBreaking, 5000);

  renderTop(); renderVideos(); renderCategories();

  $("video-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-video-index]");
    if (btn) openVideo(Number(btn.dataset.videoIndex));
  });
  $("video-close").addEventListener("click", closeVideo);
  $("video-modal").addEventListener("click", (e) => { if (e.target.id === "video-modal") closeVideo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeVideo(); });

  $("menu-toggle").addEventListener("click", (e) => {
    const open = $("main-nav").classList.toggle("is-open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  $("main-nav").addEventListener("click", (e) => {
    if (!e.target.closest("a")) return;
    $("main-nav").classList.remove("is-open");
    document.querySelectorAll(".main-nav__link").forEach((l) => l.classList.toggle("is-active", l === e.target));
  });
  $("search-toggle").addEventListener("click", () => {
    $("search-panel").hidden = !$("search-panel").hidden;
    if (!$("search-panel").hidden) $("search-input").focus();
  });
  $("search-panel").addEventListener("submit", (e) => e.preventDefault());
  $("search-input").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (q) { setSearchMode(true); renderSearch(q); } else { setSearchMode(false); renderCategories(); }
  });
})();
