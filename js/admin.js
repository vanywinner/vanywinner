(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = "vanywinner-admin";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
  const ytId = (u) => (u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1];
  let cfg = JSON.parse(localStorage.getItem(KEY) || "null"), data = null, sha = null, settingsSha = null;

  const say = (m, bad) => { $("status").textContent = m; $("status").className = "status" + (bad ? " status--error" : ""); };
  const saySet = (m, bad) => { $("settings-status").textContent = m; $("settings-status").className = "status" + (bad ? " status--error" : ""); };

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
  const inlineUploadAttempts = new Map();
  let inlineImageCounter = 0;
  let pendingNewArticleId = null;
  function uniqueInlineImageId() {
    inlineImageCounter += 1;
    const crypto = window.crypto;
    if (crypto && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${inlineImageCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  async function webpContent(file) {
    if (!file || !/^image\/(?:jpeg|png|webp)$/i.test(file.type) || !file.size) {
      throw new Error("An inline image is invalid. Choose a non-empty JPEG, PNG or WebP file.");
    }
    let bitmap, image, objectUrl;
    try {
      let source, width, height;
      if (window.createImageBitmap) {
        try {
          bitmap = await window.createImageBitmap(file);
          source = bitmap; width = bitmap.width; height = bitmap.height;
        } catch {
          bitmap = null;
        }
      }
      if (!source) {
        objectUrl = URL.createObjectURL(file);
        image = await new Promise((resolve, reject) => {
          const loaded = new Image();
          loaded.onload = () => resolve(loaded);
          loaded.onerror = () => reject(new Error("The selected inline image could not be decoded."));
          loaded.src = objectUrl;
        });
        source = image; width = image.naturalWidth; height = image.naturalHeight;
      }
      if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error("The selected inline image has invalid dimensions.");
      }
      const scale = Math.min(1, 2000 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare the inline image.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
      if (!blob || !blob.size || blob.type !== "image/webp") {
        throw new Error("Your browser could not convert this image to WebP.");
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The optimized inline image could not be read."));
        reader.readAsDataURL(blob);
      });
      const content = typeof dataUrl === "string" ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
      if (!content || !/^data:image\/webp;base64,/.test(dataUrl)) {
        throw new Error("The optimized inline image was empty or had an invalid format.");
      }
      return content;
    } finally {
      if (bitmap) bitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  async function uploadInlineImage(articleId, pendingImage, index, total) {
    const articleSegment = String(articleId);
    if (!/^[A-Za-z0-9_-]+$/.test(articleSegment)) throw new Error("This story has an invalid ID for inline image storage.");
    let attempt = inlineUploadAttempts.get(pendingImage.id);
    if (!attempt) {
      attempt = { content: await webpContent(pendingImage.file), path: "" };
      inlineUploadAttempts.set(pendingImage.id, attempt);
    }
    if (!attempt.path) attempt.path = `images/inline/${articleSegment}/${uniqueInlineImageId()}.webp`;
    say(`Optimizing and uploading inline image ${index} of ${total}...`);
    try {
      await gh(attempt.path, {
        method: "PUT",
        body: JSON.stringify({ message: "Add inline article image", content: attempt.content, branch: cfg.branch })
      });
    } catch (uploadError) {
      try {
        const existing = await gh(attempt.path);
        if (typeof existing.content === "string" && existing.content.replace(/\s/g, "") === attempt.content) {
          return attempt.path;
        }
        attempt.path = `images/inline/${articleSegment}/${uniqueInlineImageId()}.webp`;
      } catch (verifyError) {
        throw new Error(`Could not upload inline image ${index} of ${total}: ${uploadError.message}`);
      }
      try {
        await gh(attempt.path, {
          method: "PUT",
          body: JSON.stringify({ message: "Add inline article image", content: attempt.content, branch: cfg.branch })
        });
      } catch (retryError) {
        throw new Error(`Could not upload inline image ${index} of ${total}: ${retryError.message}`);
      }
    }
    return attempt.path;
  }
  async function uploadPendingImages(articleId) {
    const pending = ed.getPendingImages();
    for (let i = 0; i < pending.length; i += 1) {
      const image = pending[i], path = await uploadInlineImage(articleId, image, i + 1, pending.length);
      ed.replacePendingImages({ [image.id]: path });
      inlineUploadAttempts.delete(image.id);
    }
  }
  function keepInlineImagesInTextBlocks() {
    const editor = ed.editor;
    const textBlocks = Array.from(editor.querySelectorAll("p, h2, h3, h4, blockquote, li"))
      .filter((block) => block.textContent.trim());
    const emptyParagraphs = new Set();
    const insertionPoints = new Map();
    editor.querySelectorAll('img[src^="images/inline/"]').forEach((image) => {
      const parentBlock = image.closest("p, h2, h3, h4, blockquote, li");
      if (parentBlock && parentBlock.textContent.trim()) return;
      if (parentBlock && parentBlock.tagName === "P") emptyParagraphs.add(parentBlock);
      const followingBlock = textBlocks.find((block) => image.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING);
      const previousBlock = textBlocks.slice().reverse().find((block) => block.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING);
      const target = followingBlock || previousBlock;
      if (target) {
        if (target === followingBlock) {
          if (!insertionPoints.has(target)) insertionPoints.set(target, target.firstChild);
          target.insertBefore(image, insertionPoints.get(target));
        } else target.appendChild(image);
      }
    });
    emptyParagraphs.forEach((paragraph) => {
      if (!paragraph.textContent.trim() && !paragraph.querySelector("img")) paragraph.remove();
    });
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

  /* ---------- story file names come from the title ---------- */
  function slugify(title) {
    const base = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/['\u2019`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return base.length > 80 ? base.slice(0, 80).replace(/-[^-]*$/, "") : base;
  }
  function uniqueSlug(title) {
    let s = slugify(title) || "story";
    if (/^\d+$/.test(s)) s = "story-" + s;
    const taken = new Set(data.articles.map((a) => a.slug));
    let cand = s, n = 2;
    while (taken.has(cand)) cand = s + "-" + n++;
    return cand;
  }

  /* ---------- word-processor style editor (shared code in js/editor.js) ---------- */
  const ed = VWEditor({ editor: $("post-body"), toolbar: $("editor-toolbar"), wordCount: $("word-count") });
  const { getBody, setBody, cleanHtml, textToHtml, plainOf, summaryOf, isHtmlBody, sync } = ed;


  /* ---------- lists, editing ---------- */
  function renderList() {
    const rows = [...data.breaking.map((t, i) => ["breaking", String(i), t, "Breaking"]), ...data.articles.map((a) => ["articles", a.id, a.title, "Story"]), ...data.videos.map((v) => ["videos", v.id, v.title, "Video"])];
    $("post-list").innerHTML = rows.map(([k, id, t, label]) =>
      `<li class="post-list__item"><span><span class="post-list__kind">${label}</span>${esc(t)}</span><span class="post-list__actions">${k === "articles" ? `<button class="btn btn--ghost btn--edit" type="button" data-edit="${esc(id)}">Edit</button>` : ""}<button class="btn btn--ghost" type="button" data-kind="${k}" data-id="${esc(id)}">Delete</button></span></li>`).join("") || "<li>No posts yet.</li>";
  }
  let editingId = null;
  function startEdit(id) {
    const a = data.articles.find((x) => x.id === id); if (!a) return;
    editingId = id;
    document.querySelector("input[name=post-type][value=story]").checked = true; syncType();
    $("post-title").value = a.title || ""; setBody(isHtmlBody(a) ? cleanHtml(a.body, true) : textToHtml(a.body)); $("post-summary").value = a.summary || "";
    $("post-category").value = a.category || "News"; $("post-author").value = a.author || "";
    $("post-photo").value = "";
    if (a.image) { $("photo-preview").src = a.image; $("photo-preview").hidden = false; } else { $("photo-preview").hidden = true; }
    $("photo-label").textContent = a.image ? "Change photo" : "Add photo";
    $("edit-title").textContent = a.title; $("edit-banner").hidden = false; $("type-pills").hidden = true;
    $("post-btn").textContent = "Save changes"; say("");
    $("composer").scrollIntoView({ behavior: "smooth", block: "start" }); $("post-title").focus({ preventScroll: true });
  }
  function stopEdit() {
    editingId = null; $("composer").reset(); setBody(""); $("photo-preview").hidden = true; $("photo-label").textContent = "Add photo";
    $("edit-banner").hidden = true; $("type-pills").hidden = false; $("post-btn").textContent = "Post"; syncType();
  }
  /* ---------- opinion submissions (kept in a private repository) ---------- */
  const subRepo = () => (cfg.subRepo || "vanywinner-submissions").trim();
  function ghSub(path, opt = {}) {
    return fetch(`https://api.github.com/repos/${cfg.owner}/${subRepo()}/contents/${path}`, { ...opt, headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message || r.status); return j; });
  }
  let subs = [], reviewing = null;
  const subStatus = (m, bad) => { $("subs-status").textContent = m || ""; $("subs-status").className = "status" + (bad ? " status--error" : ""); };
  async function loadSubmissions() {
    subStatus("");
    let files = [];
    try { files = await ghSub("submissions"); }
    catch (e) { subs = []; renderSubs(); if (!/not found/i.test(e.message)) subStatus("Could not load submissions: " + e.message + ". Check that your token can access the submissions repository.", true); return; }
    files = files.filter((f) => /\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 60);
    subs = (await Promise.all(files.map(async (f) => { try { const j = await ghSub(f.path); const d = JSON.parse(unb64(j.content)); d._sha = j.sha; d._path = f.path; return d; } catch (e) { return null; } }))).filter(Boolean);
    renderSubs();
  }
  function renderSubs() {
    subs.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || String(b.id).localeCompare(String(a.id)));
    const pending = subs.filter((x) => x.status === "pending").length;
    $("subs-count").hidden = !pending; $("subs-count").textContent = pending + " pending";
    $("subs-list").innerHTML = subs.length ? subs.map((x) => {
      const tag = x.status === "published" ? '<span class="tag tag--published">Published</span>' : x.status === "rejected" ? '<span class="tag tag--rejected">Rejected</span>' : '<span class="tag tag--pending">Pending review</span>';
      const when = x.submittedAt ? new Date(x.submittedAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
      const acts = x.status === "pending" ? `<button class="btn btn--ghost" type="button" data-review="${esc(x.id)}">Review</button><button class="btn btn--ghost" type="button" data-reject="${esc(x.id)}">Reject</button>` : `<button class="btn btn--ghost" type="button" data-delete-sub="${esc(x.id)}">Delete</button>`;
      return `<li><div class="subs-item"><div class="subs-item__top">${tag}<span class="subs-item__title">${esc(x.title)}</span></div><div class="subs-item__meta">By ${esc(x.author)}${x.topic ? " | " + esc(x.topic) : ""} | ${x.words || "?"} words | ${when}</div><div class="subs-item__actions">${acts}</div></div></li>`;
    }).join("") : '<li class="subs-empty">No submissions yet. They appear here when someone sends an article from the Write with us page.</li>';
  }
  async function markSubmission(x, status, extra = {}) {
    const rec = Object.assign({}, x, extra, { status, reviewedAt: new Date().toISOString() }); delete rec._sha; delete rec._path;
    const j = await ghSub(x._path, { method: "PUT", body: JSON.stringify({ message: `Mark submission ${status}: ${String(x.title).slice(0, 50)}`, content: b64(JSON.stringify(rec, null, 2)), sha: x._sha }) });
    Object.assign(x, extra, { status }); x._sha = j.content.sha;
  }
  function startReview(id) {
    const x = subs.find((y) => y.id === id); if (!x) return;
    if (editingId) stopEdit();
    reviewing = x;
    document.querySelector("input[name=post-type][value=story]").checked = true; syncType(); $("type-pills").hidden = true;
    $("post-title").value = x.title; setBody(cleanHtml(x.body, true)); $("post-summary").value = ""; $("post-category").value = "Opinion"; $("post-author").value = x.author;
    $("post-photo").value = ""; $("photo-preview").hidden = true; $("photo-label").textContent = "Add photo";
    $("review-author").textContent = x.author;
    $("review-contact").textContent = [x.email && "Email: " + x.email, x.phone && "Phone: " + x.phone, "(contact details are never published)"].filter(Boolean).join("   ");
    $("review-banner").hidden = false; $("post-btn").textContent = "Publish opinion"; say("");
    $("composer").scrollIntoView({ behavior: "smooth", block: "start" }); $("post-title").focus({ preventScroll: true });
  }
  function stopReview() {
    reviewing = null; $("review-banner").hidden = true; $("composer").reset(); setBody(""); $("photo-preview").hidden = true; $("type-pills").hidden = false; $("post-btn").textContent = "Post"; syncType();
  }
  $("subs-refresh").addEventListener("click", () => { subStatus("Refreshing..."); loadSubmissions().then(() => { if ($("subs-status").textContent === "Refreshing...") subStatus(""); }); });
  $("cancel-review").addEventListener("click", () => { stopReview(); say(""); });
  $("subs-list").addEventListener("click", async (e) => {
    const rv = e.target.closest("[data-review]"), rj = e.target.closest("[data-reject]"), dl = e.target.closest("[data-delete-sub]");
    try {
      if (rv) { startReview(rv.dataset.review); return; }
      if (rj) { const x = subs.find((y) => y.id === rj.dataset.reject); if (!x || !confirm("Reject this submission? It will not be published.")) return; subStatus("Saving..."); await markSubmission(x, "rejected"); if (reviewing && reviewing.id === x.id) stopReview(); renderSubs(); subStatus("Rejected."); }
      if (dl) { const x = subs.find((y) => y.id === dl.dataset.deleteSub); if (!x || !confirm("Delete this submission record permanently?")) return; subStatus("Deleting..."); await ghSub(x._path, { method: "DELETE", body: JSON.stringify({ message: "Delete submission record", sha: x._sha }) }); subs = subs.filter((y) => y !== x); renderSubs(); subStatus("Deleted."); }
    } catch (err) { subStatus(err.message, true); }
  });

  function show() {
    const on = !!cfg;
    $("setup-form").hidden = on; $("composer").hidden = !on; $("posts-panel").hidden = !on; $("settings-panel").hidden = !on; $("breaking-switch").hidden = !on; $("subs-panel").hidden = !on; $("logout-btn").hidden = !on;
    if (on) { load().catch((e) => say("Could not connect: " + e.message, true)); loadSettings(); loadSubmissions(); }
  }
  function syncType() {
    const t = document.querySelector("input[name=post-type]:checked").value;
    document.querySelectorAll("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").includes(t); });
    $("post-title").placeholder = t === "breaking" ? "Type the breaking line" : "What is the headline?";
  }

  /* ---------- site settings (data/settings.json) ---------- */
  const DEFAULTS = { showBreaking: true, showCountdown: true, electionLabel: "Kenya General Election", electionDate: "2027-08-10T06:00:00+03:00", submitEndpoint: "", turnstileSiteKey: "" };
  let current = Object.assign({}, DEFAULTS);
  async function fetchSettings() {
    settingsSha = null; current = Object.assign({}, DEFAULTS);
    try { const j = await gh("data/settings.json"); settingsSha = j.sha; current = Object.assign({}, DEFAULTS, JSON.parse(unb64(j.content))); } catch (e) {}
    return current;
  }
  async function writeSettings(next, message) {
    const body = { message, content: b64(JSON.stringify(next, null, 2) + "\n"), branch: cfg.branch };
    if (settingsSha) body.sha = settingsSha;
    const j = await gh("data/settings.json", { method: "PUT", body: JSON.stringify(body) });
    settingsSha = j.content.sha; current = next;
  }
  function paintBreaking() {
    const on = !!current.showBreaking;
    $("breaking-state").textContent = on ? "ON: the bar is showing to all visitors" : "OFF: the bar is hidden from all visitors";
    $("breaking-state").className = "switch-card__state " + (on ? "is-on" : "is-off");
    $("breaking-toggle").textContent = on ? "Turn off" : "Turn on";
    $("breaking-toggle").classList.toggle("btn--off", on);
    $("breaking-toggle").disabled = false;
  }
  async function loadSettings() {
    try { await fetchSettings(); } catch (e) {}
    paintBreaking();
    $("set-countdown").checked = !!current.showCountdown;
    $("set-endpoint").value = current.submitEndpoint || ""; $("set-turnstile").value = current.turnstileSiteKey || "";
    $("set-label").value = current.electionLabel || ""; $("set-date").value = String(current.electionDate || DEFAULTS.electionDate).slice(0, 16);
  }
  $("breaking-toggle").addEventListener("click", async () => {
    const st = $("breaking-status"); st.className = "status"; st.textContent = "Checking the latest setting...";
    $("breaking-toggle").disabled = true;
    try {
      await fetchSettings();
      const turnOff = !!current.showBreaking;
      if (turnOff && !confirm("Hide the breaking news bar for everyone on the website?")) { paintBreaking(); st.textContent = ""; return; }
      st.textContent = "Saving...";
      await writeSettings(Object.assign({}, current, { showBreaking: !turnOff }), turnOff ? "Turn off breaking news bar" : "Turn on breaking news bar");
      paintBreaking(); st.textContent = turnOff ? "Turned off. The website updates in a minute or two." : "Turned on. The website updates in a minute or two.";
    } catch (err) { st.className = "status status--error"; st.textContent = err.message; paintBreaking(); }
  });
  $("settings-save").addEventListener("click", async () => {
    saySet("Saving...");
    try {
      await fetchSettings();
      const d = $("set-date").value || DEFAULTS.electionDate.slice(0, 16);
      await writeSettings(Object.assign({}, current, { showCountdown: $("set-countdown").checked, electionLabel: $("set-label").value.trim() || DEFAULTS.electionLabel, submitEndpoint: $("set-endpoint").value.trim(), turnstileSiteKey: $("set-turnstile").value.trim(), electionDate: d + ":00+03:00" }), "Update site settings");
      saySet("Saved. The live site updates in a minute or two.");
    } catch (err) { saySet(err.message, true); }
  });

  $("setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    cfg = { owner: $("cfg-owner").value.trim(), repo: $("cfg-repo").value.trim(), branch: $("cfg-branch").value.trim(), token: $("cfg-token").value.trim(), subRepo: $("cfg-subrepo").value.trim() || "vanywinner-submissions" };
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
      const articleId = type === "story" ? (editingId || (pendingNewArticleId || (pendingNewArticleId = String(Date.now())))) : null;
      if (type === "story" && editingId && !data.articles.some((article) => article.id === editingId)) {
        throw new Error("This story no longer exists. Cancel the edit and refresh.");
      }
      if (type === "story" && ed.getPendingImages().length) {
        await uploadPendingImages(articleId);
      }
      if (type === "story") keepInlineImagesInTextBlocks();
      const body = type === "story" ? getBody() : "";
      if (type === "story" && !plainOf(body)) throw new Error("Write the story text before posting.");
      const summary = type === "story" ? ($("post-summary").value.trim() || summaryOf(body)) : "";
      if (editingId) {
        const a = data.articles.find((x) => x.id === editingId);
        if (!a) throw new Error("This story no longer exists. Cancel the edit and refresh.");
        const f = $("post-photo").files[0];
        if (f) { say("Uploading photo..."); const image = `images/${editingId}-${Date.now()}.jpg`; await gh(image, { method: "PUT", body: JSON.stringify({ message: "Replace photo", content: await shrink(f), branch: cfg.branch }) }); a.image = image; }
        Object.assign(a, { category: $("post-category").value, title, summary, body, format: "html", author: $("post-author").value.trim() || "Newsroom", updated: new Date().toISOString() });
        await save("Edit post: " + title);
        stopEdit();
        say("Saved. The live site updates in a minute or two.");
        $("post-btn").disabled = false; return;
      }
      const when = new Date().toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), id = type === "story" ? articleId : String(Date.now());
      if (type === "breaking") { data.breaking = [title, ...data.breaking].slice(0, 8); }
      else if (type === "video") {
        const yt = ytId($("post-video-url").value);
        if (!yt) throw new Error("Paste a valid YouTube link.");
        data.videos.unshift({ id, title, youtubeId: yt });
      } else {
        let image; const f = $("post-photo").files[0];
        if (f) { say("Uploading photo..."); image = `images/${id}.jpg`; await gh(image, { method: "PUT", body: JSON.stringify({ message: "Add photo", content: await shrink(f), branch: cfg.branch }) }); }
        data.articles.unshift(Object.assign({ id, slug: uniqueSlug(title), category: $("post-category").value, title, summary, body, format: "html", author: $("post-author").value.trim() || "Newsroom", time: when, date: new Date().toISOString(), image }, reviewing ? { guest: true, topic: reviewing.topic || "", submissionId: reviewing.id } : {}));
      }
      await save("Post: " + title);
      if (type === "story") pendingNewArticleId = null;
      if (reviewing) {
        const art = data.articles[0], sub = reviewing;
        try { await markSubmission(sub, "published", { publishedSlug: art.slug, publishedAt: new Date().toISOString() }); renderSubs(); }
        catch (er) { say("Published, but the submission could not be marked as published: " + er.message, true); }
        stopReview(); $("post-btn").disabled = false;
        if (!$("status").classList.contains("status--error")) say("Opinion published. The live site updates in a minute or two.");
        return;
      }
      $("composer").reset(); setBody(""); $("photo-preview").hidden = true; syncType();
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

  syncType(); sync(); show();
})();
