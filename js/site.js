/* Runs on every page: date and year, election countdown, menu button, search, and the video player (on the Videos page). */
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.body.dataset.root || "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const href = (a) => a.link || (a.slug ? root + "stories/" + encodeURIComponent(a.slug) + ".html" : a.id ? root + "stories/" + encodeURIComponent(a.id) + ".html" : "#");

  if ($("today-date")) $("today-date").textContent = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if ($("footer-year")) $("footer-year").textContent = new Date().getFullYear();


  /* election countdown: days, hours and minutes left, updated every second */
  const cd = $("election-countdown");
  if (cd) {
    const target = new Date(cd.dataset.target).getTime();
    const nums = { days: cd.querySelector('[data-unit="days"]'), hours: cd.querySelector('[data-unit="hours"]'), minutes: cd.querySelector('[data-unit="minutes"]') };
    let done = false;
    const set = (el, v) => { if (el.textContent !== v) el.textContent = v; };
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        if (!done) { done = true; cd.innerHTML = '<span class="cd cd--today">Election day</span>'; }
        if (ms < -864e5 * 2) { const bar = $("election-bar"), l = bar && bar.querySelector(".election-bar__label"); cd.hidden = true; if (l) l.hidden = true; }
        return;
      }
      set(nums.days, String(Math.floor(ms / 864e5)));
      set(nums.hours, String(Math.floor(ms % 864e5 / 36e5)).padStart(2, "0"));
      set(nums.minutes, String(Math.floor(ms % 36e5 / 6e4)).padStart(2, "0"));
    };
    tick(); setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }

  /* menu button on phones */
  $("menu-toggle").addEventListener("click", (e) => {
    const open = $("main-nav").classList.toggle("is-open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  /* search: finds stories from every section and lists them under the search box */
  const panel = $("search-panel"), input = $("search-input"), out = $("search-results");
  let articles = null, loading = null;
  const load = () => loading || (loading = fetch(root + "data/posts.json").then((r) => r.json()).then((d) => (articles = d.articles || [])).catch(() => { loading = null; return null; }));
  function showResults() {
    const q = input.value.trim().toLowerCase();
    if (!q) { out.hidden = true; out.innerHTML = ""; return; }
    out.hidden = false;
    if (!articles) { out.innerHTML = '<p class="search-results__empty">Search could not load. Check your connection and try again.</p>'; return; }
    const found = articles.filter((a) => ((a.title || "") + " " + (a.summary || "")).toLowerCase().includes(q));
    out.innerHTML = found.length
      ? `<p class="search-results__count">${found.length} ${found.length === 1 ? "story" : "stories"} found</p>` +
        found.map((a) => `<a class="search-results__item" href="${esc(href(a))}"><span class="chip">${esc(a.category)}</span><span class="search-results__title">${esc(a.title)}</span></a>`).join("")
      : '<p class="search-results__empty">No stories match that search. Try a shorter word.</p>';
  }
  $("search-toggle").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { input.focus(); load(); }
  });
  panel.addEventListener("submit", (e) => e.preventDefault());
  input.addEventListener("input", async () => { if (input.value.trim() && !articles) await load(); showResults(); });

  /* video player (only on the Videos page) */
  const grid = $("video-grid");
  if (grid) {
    let warmed = false;
    const warmUp = () => {
      if (warmed) return; warmed = true;
      ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://www.google.com"].forEach((u) => {
        const l = document.createElement("link"); l.rel = "preconnect"; l.href = u; if (u.includes("youtube")) l.crossOrigin = ""; document.head.appendChild(l);
      });
    };
    const box = $("video-player"), modal = $("video-modal");
    const open = (btn) => {
      const yt = btn.dataset.yt, title = btn.dataset.title || "Video";
      if (!yt) { box.innerHTML = '<p class="modal__empty">This video is not available yet.</p>'; modal.hidden = false; return; }
      warmUp();
      const id = encodeURIComponent(yt);
      box.innerHTML = `<div class="modal__loading" id="video-loading"><span class="modal__spinner" aria-hidden="true"></span>
        <span>Loading video...</span>
        <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">Taking long? Watch on YouTube</a></div>
      <iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="${esc(title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      box.querySelector("iframe").addEventListener("load", () => { const l = $("video-loading"); if (l) l.remove(); });
      modal.hidden = false;
    };
    const close = () => { modal.hidden = true; box.innerHTML = ""; };
    grid.addEventListener("click", (e) => { const b = e.target.closest(".video-card"); if (b) open(b); });
    ["pointerover", "touchstart", "focusin"].forEach((ev) => grid.addEventListener(ev, warmUp, { once: true, passive: true }));
    $("video-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target.id === "video-modal") close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
})();
