(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = "vanywinner-admin";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
  const ytId = (u) => (u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1];
  let cfg = JSON.parse(localStorage.getItem(KEY) || "null"), data = null, sha = null;

  const say = (m, bad) => { $("status").textContent = m; $("status").className = "status" + (bad ? " status--error" : ""); };

  function gh(path, opt = {}) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}` + (opt.method ? "" : `?ref=${cfg.branch}`);
    return fetch(url, { ...opt, headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message || r.status); return j; });
  }
  async function load() {
    const j = await gh("data/posts.json");
    sha = j.sha; data = JSON.parse(unb64(j.content)); renderList();
  }
  async function save(message) {
    const j = await gh("data/posts.json", { method: "PUT", body: JSON.stringify({ message, content: b64(JSON.stringify(data, null, 2)), sha, branch: cfg.branch }) });
    sha = j.content.sha; renderList();
  }
  function shrink(file) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = img.width * k; c.height = img.height * k;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.src = URL.createObjectURL(file);
    });
  }
  function renderList() {
    const rows = [...data.breaking.map((t, i) => ["breaking", String(i), t, "Breaking"]), ...data.articles.map((a) => ["articles", a.id, a.title, "Story"]), ...data.videos.map((v) => ["videos", v.id, v.title, "Video"])];
    $("post-list").innerHTML = rows.map(([k, id, t, label]) =>
      `<li class="post-list__item"><span><span class="post-list__kind">${label}</span>${esc(t)}</span><span class="post-list__actions">${k === "articles" ? `<button class="btn btn--ghost btn--edit" type="button" data-edit="${esc(id)}">Edit</button>` : ""}<button class="btn btn--ghost" type="button" data-kind="${k}" data-id="${esc(id)}">Delete</button></span></li>`).join("") || "<li>No posts yet.</li>";
  }
  /* ---- editing a story: the composer is filled with the story, "Save changes" updates it in place ---- */
  let editingId = null;
  function startEdit(id) {
    const a = data.articles.find((x) => x.id === id); if (!a) return;
    editingId = id;
    document.querySelector("input[name=post-type][value=story]").checked = true; syncType();
    $("post-title").value = a.title || ""; $("post-body").value = a.body || ""; $("post-summary").value = a.summary || "";
    $("post-category").value = a.category || "News"; $("post-author").value = a.author || "";
    $("post-photo").value = "";
    if (a.image) { $("photo-preview").src = a.image; $("photo-preview").hidden = false; } else { $("photo-preview").hidden = true; }
    $("photo-label").textContent = a.image ? "Change photo" : "Add photo";
    $("edit-title").textContent = a.title; $("edit-banner").hidden = false; $("type-pills").hidden = true;
    $("post-btn").textContent = "Save changes"; say("");
    $("composer").scrollIntoView({ behavior: "smooth", block: "start" }); $("post-title").focus({ preventScroll: true });
  }
  function stopEdit() {
    editingId = null; $("composer").reset(); $("photo-preview").hidden = true; $("photo-label").textContent = "Add photo";
    $("edit-banner").hidden = true; $("type-pills").hidden = false; $("post-btn").textContent = "Post"; syncType();
  }
  function show() {
    const on = !!cfg;
    $("setup-form").hidden = on; $("composer").hidden = !on; $("posts-panel").hidden = !on; $("logout-btn").hidden = !on;
    if (on) load().catch((e) => say("Could not connect: " + e.message, true));
  }
  function syncType() {
    const t = document.querySelector("input[name=post-type]:checked").value;
    document.querySelectorAll("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").includes(t); });
    $("post-title").placeholder = t === "breaking" ? "Type the breaking line" : "What is the headline?";
  }

  $("setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    cfg = { owner: $("cfg-owner").value.trim(), repo: $("cfg-repo").value.trim(), branch: $("cfg-branch").value.trim(), token: $("cfg-token").value.trim() };
    localStorage.setItem(KEY, JSON.stringify(cfg)); show();
  });
  $("logout-btn").addEventListener("click", () => { localStorage.removeItem(KEY); cfg = null; location.reload(); });
  document.querySelectorAll("input[name=post-type]").forEach((r) => r.addEventListener("change", syncType));
  $("post-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("photo-preview").src = URL.createObjectURL(f); $("photo-preview").hidden = false;
  });

  $("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.querySelector("input[name=post-type]:checked").value, title = $("post-title").value.trim();
    $("post-btn").disabled = true; say(editingId ? "Saving changes..." : "Publishing...");
    try {
      await load();
      if (editingId) {
        const a = data.articles.find((x) => x.id === editingId);
        if (!a) throw new Error("This story no longer exists. Cancel the edit and refresh.");
        const f = $("post-photo").files[0], body = $("post-body").value.trim();
        if (f) { say("Uploading photo..."); const image = `images/${editingId}-${Date.now()}.jpg`; await gh(image, { method: "PUT", body: JSON.stringify({ message: "Replace photo", content: await shrink(f), branch: cfg.branch }) }); a.image = image; }
        Object.assign(a, { category: $("post-category").value, title, summary: $("post-summary").value.trim() || body.slice(0, 160), body, author: $("post-author").value.trim() || "Newsroom", updated: new Date().toISOString() });
        await save("Edit post: " + title);
        stopEdit();
        say("Saved. The live site updates in a minute or two.");
        $("post-btn").disabled = false; return;
      }
      const when = new Date().toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), id = String(Date.now());
      if (type === "breaking") { data.breaking = [title, ...data.breaking].slice(0, 8); }
      else if (type === "video") {
        const yt = ytId($("post-video-url").value);
        if (!yt) throw new Error("Paste a valid YouTube link.");
        data.videos.unshift({ id, title, youtubeId: yt });
      } else {
        let image; const f = $("post-photo").files[0];
        if (f) { say("Uploading photo..."); image = `images/${id}.jpg`; await gh(image, { method: "PUT", body: JSON.stringify({ message: "Add photo", content: await shrink(f), branch: cfg.branch }) }); }
        const body = $("post-body").value.trim();
        data.articles.unshift({ id, category: $("post-category").value, title, summary: $("post-summary").value.trim() || body.slice(0, 160), body, author: $("post-author").value.trim() || "Newsroom", time: when, date: new Date().toISOString(), image });
      }
      await save("Post: " + title);
      $("composer").reset(); $("photo-preview").hidden = true; syncType();
      say("Published. The live site updates in a minute or two.");
    } catch (err) { say(err.message, true); }
    $("post-btn").disabled = false;
  });

  $("cancel-edit").addEventListener("click", () => { stopEdit(); say(""); });
  $("post-list").addEventListener("click", async (e) => {
    const ed = e.target.closest("button[data-edit]");
    if (ed) { startEdit(ed.dataset.edit); return; }
    const b = e.target.closest("button[data-id]"); if (!b || !confirm("Delete this post?")) return;
    try { await load(); if (b.dataset.kind === "articles" && b.dataset.id === editingId) stopEdit(); if (b.dataset.kind === "breaking") data.breaking.splice(Number(b.dataset.id), 1); else data[b.dataset.kind] = data[b.dataset.kind].filter((x) => x.id !== b.dataset.id); await save("Delete post"); say("Deleted."); }
    catch (err) { say(err.message, true); }
  });

  syncType(); show();
})();
