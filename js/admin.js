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
      `<li class="post-list__item"><span><span class="post-list__kind">${label}</span>${esc(t)}</span><button class="btn btn--ghost" type="button" data-kind="${k}" data-id="${esc(id)}">Delete</button></li>`).join("") || "<li>No posts yet.</li>";
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
    $("post-btn").disabled = true; say("Publishing...");
    try {
      await load();
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

  $("post-list").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]"); if (!b || !confirm("Delete this post?")) return;
    try { await load(); if (b.dataset.kind === "breaking") data.breaking.splice(Number(b.dataset.id), 1); else data[b.dataset.kind] = data[b.dataset.kind].filter((x) => x.id !== b.dataset.id); await save("Delete post"); say("Deleted."); }
    catch (err) { say(err.message, true); }
  });

  syncType(); show();
})();
