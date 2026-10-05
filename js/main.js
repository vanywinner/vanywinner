(function () {
  let breaking = [], articles = [], videos = [];
  const CATEGORIES = ["News", "Business", "Sports", "Opinion"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const href = (a) => a.link || (a.id ? "stories/" + encodeURIComponent(a.id) + ".html" : "#");
  /* cards use a small WebP copy (images/thumbs/); falls back to the original if it does not exist yet */
  function thumbSrc(img) { return /^(https?:)?\/\//.test(img) ? img : img.replace(/^images\//, "images/thumbs/").replace(/\.[a-z0-9]+$/i, ".webp"); }
  function thumb(a) {
    return a.image
      ? `<img class="thumb" src="${esc(thumbSrc(a.image))}" onerror="this.onerror=null;this.src='${esc(a.image)}'" alt="" loading="lazy" decoding="async">`
      : `<div class="thumb thumb--${a.category.toLowerCase()}"></div>`;
  }
  function storyCard(a) {
    return `<article class="story-card"><a class="story-card__link" href="${esc(href(a))}">
      ${thumb(a)}<span class="chip">${esc(a.category)}</span>
      <h3 class="story-card__title">${esc(a.title)}</h3>
      <p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p></a></article>`;
  }
  function sideStory(a) {
    return `<article class="side-story"><a class="side-story__link" href="${esc(href(a))}">
      ${thumb(a)}<div><span class="chip">${esc(a.category)}</span>
      <h3 class="side-story__title">${esc(a.title)}</h3>
      <p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p></div></a></article>`;
  }

  function renderTop() {
    const [lead, ...rest] = articles;
    $("lead-story").innerHTML = `<a class="lead-story__link" href="${esc(href(lead))}">
      <span class="chip chip--light">${esc(lead.category)}</span>
      <h1 class="lead-story__title">${esc(lead.title)}</h1>
      <p class="lead-story__summary">${esc(lead.summary)}</p>
      <p class="lead-story__meta">By ${esc(lead.author)}, ${esc(lead.time)}</p></a>`;
    $("side-stories").innerHTML = rest.slice(0, 3).map(sideStory).join("");
    const top = articles.slice(0, 6);
    $("trending-list").innerHTML = top.map((a) =>
      `<li class="trending__item"><a class="trending__link" href="${esc(href(a))}">${esc(a.title)}</a></li>`).join("");
  }

  function renderVideos() {
    $("video-grid").innerHTML = videos.map((v, i) =>
      `<button class="video-card" type="button" data-video-index="${i}">
        <span class="video-card__thumb">${v.youtubeId ? `<img class="video-card__img" src="https://i.ytimg.com/vi/${esc(v.youtubeId)}/mqdefault.jpg" alt="" width="320" height="180" loading="lazy" decoding="async">` : ""}<span class="video-card__play" aria-hidden="true"></span>${v.length ? `<span class="video-card__length">${esc(v.length)}</span>` : ""}</span>
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

  /* open connections to YouTube before the click, so the player starts sooner */
  let warmed = false;
  function warmUp() {
    if (warmed) return; warmed = true;
    ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://www.google.com"].forEach((u) => {
      const l = document.createElement("link"); l.rel = "preconnect"; l.href = u; if (u.includes("youtube")) l.crossOrigin = ""; document.head.appendChild(l);
    });
  }

  function openVideo(i) {
    const v = videos[i];
    const box = $("video-player");
    if (!v.youtubeId) { box.innerHTML = `<p class="modal__empty">This video has no YouTube ID yet. Add one in js/data.js.</p>`; $("video-modal").hidden = false; return; }
    warmUp();
    const id = encodeURIComponent(v.youtubeId);
    box.innerHTML = `<div class="modal__loading" id="video-loading"><span class="modal__spinner" aria-hidden="true"></span>
        <span>Loading video...</span>
        <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">Taking long? Watch on YouTube</a></div>
      <iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="${esc(v.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    box.querySelector("iframe").addEventListener("load", () => { const l = $("video-loading"); if (l) l.remove(); });
    $("video-modal").hidden = false;
  }
  function closeVideo() { $("video-modal").hidden = true; $("video-player").innerHTML = ""; }

  /* init */
  $("today-date").textContent = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("footer-year").textContent = new Date().getFullYear();
  function start(data) {
    ({ breaking, articles, videos } = data);
    $("breaking-bar").hidden = !breaking.length;
    if (!breaking.length) document.body.classList.remove("has-breaking");
    $("videos").hidden = !videos.length;
    if (!articles.length) { $("top-stories").hidden = true; $("category-sections").innerHTML = '<p class="empty-note">No stories yet. Post the first one from the admin page.</p>'; return; }
    if (breaking.length) {
      const group = `<div class="breaking-bar__group">${breaking.map((t) => `<span class="breaking-bar__item">${esc(t)}</span>`).join("")}</div>`;
      $("breaking-track").innerHTML = group + group;
      $("breaking-track").style.animationDuration = Math.max(25, breaking.join(" ").length * 0.3) + "s";
      document.body.classList.add("has-breaking");
    }
    renderTop(); renderVideos(); renderCategories();
  }
  fetch("data/posts.json").then((r) => r.json()).then(start)
    .catch(() => { $("breaking-bar").hidden = true; document.body.classList.remove("has-breaking"); $("category-sections").innerHTML = '<p class="empty-note">Stories could not load. If you opened this file directly, run a local server or view the live site.</p>'; });

  $("video-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-video-index]");
    if (btn) openVideo(Number(btn.dataset.videoIndex));
  });
  ["pointerover", "touchstart", "focusin"].forEach((ev) => $("video-grid").addEventListener(ev, warmUp, { once: true, passive: true }));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en, ob) => { if (en.some((x) => x.isIntersecting)) { warmUp(); ob.disconnect(); } }, { rootMargin: "400px" }).observe($("videos"));
  }
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
