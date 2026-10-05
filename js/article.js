(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const box = document.getElementById("story-page");
  const id = new URLSearchParams(location.search).get("id");
  fetch("data/posts.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    const a = d.articles.find((x) => x.id === id);
    if (!a) { box.innerHTML = '<p class="empty-note">Story not found.</p><a class="story-page__back" href="index.html">Back to home</a>'; return; }
    document.title = a.title + " | Vanywinner News";
    const paras = (a.body || a.summary || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
    box.innerHTML = `<a class="story-page__back" href="index.html">Back to home</a>
      <h1 class="story-page__title">${esc(a.title)}</h1><span class="chip">${esc(a.category)}</span>
      <p class="story-page__meta">By ${esc(a.author)}, ${esc(a.time)}</p>
      ${a.image ? `<img class="story-page__image" src="${esc(a.image)}" alt="">` : ""}
      <div class="story-page__body">${paras}</div>`;
  }).catch(() => { box.innerHTML = '<p class="empty-note">Story could not load.</p>'; });
})();
