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
  /* same rule as scripts/build.js: whole words only, up to 110 characters, never ending on "and", "of", "the"... */
  function slugify(title) {
    const base = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/['\u2019`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (base.length <= 110) return base;
    let s = base.slice(0, 111); s = s.slice(0, s.lastIndexOf("-"));
    while (/-(a|an|and|the|of|to|in|on|at|by|for|from|with|as|is|or|but|his|her|its|their|after|over)$/.test(s)) s = s.replace(/-[^-]*$/, "");
    return s;
  }
  function uniqueSlug(title) {
    let s = slugify(title) || "story";
    if (/^\d+$/.test(s)) s = "story-" + s;
    const taken = new Set(data.articles.map((a) => a.slug));
    let cand = s, n = 2;
    while (taken.has(cand)) cand = s + "-" + n++;
    return cand;
  }

  /* ---------- word-processor style editor ---------- */
  const editor = $("post-body"), toolbar = $("editor-toolbar");
  const ICONS = {
    undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
    left: '<path d="M3 5h18M3 10h12M3 15h18M3 20h12"/>', center: '<path d="M3 5h18M6 10h12M3 15h18M6 20h12"/>',
    right: '<path d="M3 5h18M9 10h12M3 15h18M9 20h12"/>', full: '<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/>',
    ul: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    ol: '<path d="M10 6h11M10 12h11M10 18h11M4 4v4M3 8h2M3 14h2l-2 3h2"/>',
    outdent: '<path d="M3 5h18M11 10h10M11 15h10M3 20h18M7 9l-3 3 3 3"/>', indent: '<path d="M3 5h18M11 10h10M11 15h10M3 20h18M4 9l3 3-3 3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18"/>',
    quote: '<path d="M7 17c-2 0-3-1.5-3-3.5S5.5 9 8 8M17 17c-2 0-3-1.5-3-3.5S15.5 9 18 8"/>', hr: '<path d="M3 12h18"/>',
    clear: '<path d="M6 5h12M12 5l-2 7M5 20l14-14"/>'
  };
  const GROUPS = [
    [{ cmd: "undo", icon: "undo", title: "Undo (Ctrl+Z)" }, { cmd: "redo", icon: "redo", title: "Redo (Ctrl+Y)" }],
    [{ select: "block", title: "Paragraph style", options: [["p", "Paragraph"], ["h2", "Heading 1"], ["h3", "Heading 2"], ["h4", "Heading 3"], ["blockquote", "Quote"]] },
     { select: "size", title: "Text size", options: [["3", "Normal"], ["2", "Small"], ["5", "Large"], ["6", "Huge"]] }],
    [{ cmd: "bold", label: "B", cls: "tb--b", title: "Bold (Ctrl+B)", state: true }, { cmd: "italic", label: "I", cls: "tb--i", title: "Italic (Ctrl+I)", state: true },
     { cmd: "underline", label: "U", cls: "tb--u", title: "Underline (Ctrl+U)", state: true }, { cmd: "strikeThrough", label: "S", cls: "tb--s", title: "Strikethrough", state: true }],
    [{ color: "foreColor", title: "Text colour", init: "#C0392B", text: "A" }, { color: "hiliteColor", title: "Highlight colour", init: "#FFE066", text: "ab" }],
    [{ cmd: "justifyLeft", icon: "left", title: "Align left", state: true }, { cmd: "justifyCenter", icon: "center", title: "Centre", state: true },
     { cmd: "justifyRight", icon: "right", title: "Align right", state: true }, { cmd: "justifyFull", icon: "full", title: "Justify", state: true }],
    [{ cmd: "insertUnorderedList", icon: "ul", title: "Bulleted list", state: true }, { cmd: "insertOrderedList", icon: "ol", title: "Numbered list", state: true },
     { cmd: "outdent", icon: "outdent", title: "Decrease indent" }, { cmd: "indent", icon: "indent", title: "Increase indent" }],
    [{ act: "link", icon: "link", title: "Insert link (Ctrl+K)" }, { cmd: "unlink", icon: "unlink", title: "Remove link" }, { act: "quote", icon: "quote", title: "Quote" },
     { cmd: "insertHorizontalRule", icon: "hr", title: "Horizontal line" }, { act: "clear", icon: "clear", title: "Clear formatting" }]
  ];
  toolbar.innerHTML = GROUPS.map((g) => `<div class="tb-group">${g.map((b) => {
    if (b.select) return `<select class="tb-select" data-select="${b.select}" title="${b.title}" aria-label="${b.title}">${b.options.map((o) => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>`;
    if (b.color) return `<label class="tb-color" title="${b.title}"><span class="tb-color__a" style="color:${b.init}">${b.text}</span><input type="color" value="${b.init}" data-color="${b.color}" aria-label="${b.title}"></label>`;
    return `<button type="button" class="tb ${b.cls || ""}" data-cmd="${b.cmd || ""}" data-act="${b.act || ""}" data-state="${b.state ? 1 : ""}" title="${b.title}" aria-label="${b.title}">${b.icon ? `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[b.icon]}</svg>` : b.label}</button>`;
  }).join("")}</div>`).join("");

  let saved = null, busy = false;
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (s.rangeCount && editor.contains(s.anchorNode)) { saved = s.getRangeAt(0).cloneRange(); refresh(); }
  });
  function restore() {
    const cur = getSelection();
    if (document.activeElement === editor && cur.rangeCount && editor.contains(cur.anchorNode)) return;
    editor.focus();
    if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); }
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
  }
  const CSS_CMDS = ["foreColor", "hiliteColor", "fontSize"];
  const KEEP_CARET = ["insertUnorderedList", "insertOrderedList", "indent", "outdent", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull", "formatBlock", "bold", "italic", "underline", "strikeThrough"];
  /* some browsers jump the cursor to the start of the line after list/align commands: remember it by character position and put it back */
  function caretPos() {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed || !editor.contains(s.anchorNode)) return null;
    const r = document.createRange(); r.selectNodeContents(editor); r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }
  function setCaret(pos) {
    const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT); let n, left = pos;
    while ((n = w.nextNode())) { if (left <= n.nodeValue.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } left -= n.nodeValue.length; }
  }
  function run(cmd, val) {
    restore();
    const pos = KEEP_CARET.includes(cmd) ? caretPos() : null;
    try { document.execCommand("styleWithCSS", false, CSS_CMDS.includes(cmd)); } catch (e) {}
    document.execCommand(cmd, false, val);
    try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
    if (pos !== null && caretPos() !== pos) setCaret(pos);
    sync();
  }
  function refresh() {
    toolbar.querySelectorAll("[data-state]").forEach((b) => { if (b.dataset.state) { let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {} b.classList.toggle("is-on", on); } });
    let blk = ""; try { blk = String(document.queryCommandValue("formatBlock")).replace(/[<>]/g, "").toLowerCase(); } catch (e) {}
    const sel = toolbar.querySelector('[data-select="block"]'); if (sel) sel.value = ["h2", "h3", "h4", "blockquote"].includes(blk) ? blk : "p";
  }
  function sync() {
    const text = editor.innerText.replace(/\u200b/g, "").trim();
    editor.classList.toggle("is-empty", !text && !editor.querySelector("hr"));
    const n = text ? text.split(/\s+/).length : 0;
    $("word-count").textContent = n + (n === 1 ? " word" : " words");
    refresh();
  }
  function addLink() {
    restore();
    const url = prompt("Web address (for example https://example.com)", "https://");
    if (!url || url === "https://") return;
    let u = url.trim(); if (!/^(https?:\/\/|mailto:)/i.test(u)) u = "https://" + u;
    if (getSelection().isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(u)}">${esc(u)}</a>`);
    else document.execCommand("createLink", false, u);
    sync();
  }
  toolbar.addEventListener("mousedown", (e) => { if (e.target.closest(".tb")) e.preventDefault(); });
  toolbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tb"); if (!b) return;
    if (b.dataset.act === "link") addLink();
    else if (b.dataset.act === "quote") { restore(); let blk = ""; try { blk = String(document.queryCommandValue("formatBlock")).replace(/[<>]/g, "").toLowerCase(); } catch (er) {} document.execCommand("formatBlock", false, blk === "blockquote" ? "<p>" : "<blockquote>"); sync(); }
    else if (b.dataset.act === "clear") { restore(); document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "<p>"); sync(); }
    else run(b.dataset.cmd);
  });
  toolbar.addEventListener("change", (e) => {
    const s = e.target.closest("[data-select]"), c = e.target.closest("[data-color]");
    if (s) { if (s.dataset.select === "block") run("formatBlock", "<" + s.value + ">"); else run("fontSize", s.value); }
    if (c) { c.previousElementSibling.style.color = c.value; run(c.dataset.color, c.value); }
  });
  const initEditing = () => { try { document.execCommand("styleWithCSS", false, false); document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {} };
  initEditing(); editor.addEventListener("focus", initEditing);
  editor.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); addLink(); } });
  editor.addEventListener("input", () => {
    if (!busy && editor.firstChild && editor.firstChild.nodeType === 3 && editor.firstChild.nodeValue.trim()) {
      busy = true; document.execCommand("formatBlock", false, "<p>"); busy = false;
    }
    sync();
  });

  /* keeps only safe formatting; used for pasted text and for stories opened for editing */
  const KEEP = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u", S: "s", STRIKE: "s", P: "p", DIV: "p", BR: "br", UL: "ul", OL: "ol", LI: "li", BLOCKQUOTE: "blockquote",
    H1: "h2", H2: "h2", H3: "h3", H4: "h4", H5: "h4", H6: "h4", HR: "hr", SUB: "sub", SUP: "sup", A: "a", SPAN: "span", FONT: "span" };
  const SIZES = ["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"];
  const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;
  function styleOf(n, tag, keepColors) {
    const out = [], st = n.style || {};
    const al = st.textAlign || (n.getAttribute && n.getAttribute("align")) || "";
    if (/^(left|center|right|justify)$/.test(al)) out.push("text-align:" + al);
    if (tag === "span") {
      if (keepColors) {
        const col = st.color || (n.tagName === "FONT" && n.getAttribute("color")); if (col && COLOUR.test(col)) out.push("color:" + col);
        if (st.backgroundColor && COLOUR.test(st.backgroundColor)) out.push("background-color:" + st.backgroundColor);
      }
      if (SIZES.includes(st.fontSize)) out.push("font-size:" + st.fontSize);
    }
    return out.join(";");
  }
  function cleanNodes(node, keepColors) {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += esc(n.nodeValue.replace(/[\r\n\t]+/g, " ").replace(/\u00a0/g, " ")); return; }
      if (n.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE|HEAD|META|LINK|TITLE|IMG|IFRAME|OBJECT|SVG)$/.test(n.tagName)) return;
      const t = KEEP[n.tagName], inner = cleanNodes(n, keepColors);
      if (!t) { out += inner; return; }
      if (t === "br" || t === "hr") { out += "<" + t + ">"; return; }
      let attrs = "";
      if (t === "a") { const h = n.getAttribute("href") || ""; if (!/^(https?:\/\/|mailto:)/i.test(h)) { out += inner; return; } attrs = ` href="${esc(h)}"`; }
      const st = styleOf(n, t, keepColors); if (st) attrs += ` style="${st}"`;
      if (t === "span") {
        let w = st ? `<span${attrs}>${inner}</span>` : inner;
        const css = n.style || {}, dec = (css.textDecorationLine || css.textDecoration || "");
        if (css.fontWeight === "bold" || parseInt(css.fontWeight, 10) >= 600) w = `<strong>${w}</strong>`;
        if (css.fontStyle === "italic") w = `<em>${w}</em>`;
        if (/underline/.test(dec)) w = `<u>${w}</u>`;
        if (/line-through/.test(dec)) w = `<s>${w}</s>`;
        out += w; return;
      }
      out += `<${t}${attrs}>${inner}</${t}>`;
    });
    return out;
  }
  const cleanHtml = (html, keepColors) => cleanNodes(new DOMParser().parseFromString(html, "text/html").body, keepColors);
  const textToHtml = (t) => String(t || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
  const BLOCK = /^(P|H2|H3|H4|UL|OL|BLOCKQUOTE|HR)$/;
  function normalize(html) {
    const src = document.createElement("div"), out = document.createElement("div"); src.innerHTML = html; let p = null;
    src.childNodes.forEach((n) => {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) { p = null; out.appendChild(n.cloneNode(true)); }
      else if (n.nodeType === 1 && n.tagName === "BR") { if (p) p.appendChild(n.cloneNode(true)); }
      else { if (!p) { p = document.createElement("p"); out.appendChild(p); } p.appendChild(n.cloneNode(true)); }
    });
    out.querySelectorAll("p").forEach((x) => { if (!x.textContent.trim()) x.remove(); });
    return out.innerHTML.trim();
  }
  editor.addEventListener("paste", (e) => {
    e.preventDefault();
    const cb = e.clipboardData, h = cb.getData("text/html"), t = cb.getData("text/plain");
    restore(); document.execCommand("insertHTML", false, h ? cleanHtml(h, false) : textToHtml(t)); sync();
  });
  const getBody = () => normalize(cleanHtml(editor.innerHTML, true));
  const setBody = (html) => { editor.innerHTML = html; sync(); };
  const plainOf = (html) => { const d = document.createElement("div"); d.innerHTML = String(html).replace(/<(\/p|\/h[2-4]|\/li|\/blockquote|br)\b[^>]*>/gi, " $&"); return (d.textContent || "").replace(/\s+/g, " ").trim(); };
  const summaryOf = (html) => { const t = plainOf(html); return t.length <= 160 ? t : t.slice(0, 160).replace(/\s+\S*$/, "") + "..."; };
  const isHtmlBody = (a) => a.format === "html" || /^\s*<(p|h[2-4]|ul|ol|blockquote|div)\b/i.test(a.body || "");

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
  function show() {
    const on = !!cfg;
    $("setup-form").hidden = on; $("composer").hidden = !on; $("posts-panel").hidden = !on; $("settings-panel").hidden = !on; $("logout-btn").hidden = !on;
    if (on) { load().catch((e) => say("Could not connect: " + e.message, true)); loadSettings(); }
  }
  function syncType() {
    const t = document.querySelector("input[name=post-type]:checked").value;
    document.querySelectorAll("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").includes(t); });
    $("post-title").placeholder = t === "breaking" ? "Type the breaking line" : "What is the headline?";
  }

  /* ---------- site settings (data/settings.json) ---------- */
  const DEFAULTS = { showBreaking: true, showCountdown: true, electionLabel: "Kenya General Election", electionDate: "2027-08-10T06:00:00+03:00" };
  async function loadSettings() {
    let s = DEFAULTS; settingsSha = null;
    try { const j = await gh("data/settings.json"); settingsSha = j.sha; s = Object.assign({}, DEFAULTS, JSON.parse(unb64(j.content))); } catch (e) {}
    $("set-breaking").checked = !!s.showBreaking; $("set-countdown").checked = !!s.showCountdown;
    $("set-label").value = s.electionLabel || ""; $("set-date").value = String(s.electionDate || DEFAULTS.electionDate).slice(0, 16);
  }
  $("settings-save").addEventListener("click", async () => {
    saySet("Saving...");
    try {
      const d = $("set-date").value || DEFAULTS.electionDate.slice(0, 16);
      const out = { showBreaking: $("set-breaking").checked, showCountdown: $("set-countdown").checked, electionLabel: $("set-label").value.trim() || DEFAULTS.electionLabel, electionDate: d + ":00+03:00" };
      const body = { message: "Update site settings", content: b64(JSON.stringify(out, null, 2) + "\n"), branch: cfg.branch };
      if (settingsSha) body.sha = settingsSha;
      const j = await gh("data/settings.json", { method: "PUT", body: JSON.stringify(body) });
      settingsSha = j.content.sha; saySet("Saved. The live site updates in a minute or two.");
    } catch (err) { saySet(err.message, true); }
  });

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
      const when = new Date().toLocaleString("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), id = String(Date.now());
      if (type === "breaking") { data.breaking = [title, ...data.breaking].slice(0, 8); }
      else if (type === "video") {
        const yt = ytId($("post-video-url").value);
        if (!yt) throw new Error("Paste a valid YouTube link.");
        data.videos.unshift({ id, title, youtubeId: yt });
      } else {
        let image; const f = $("post-photo").files[0];
        if (f) { say("Uploading photo..."); image = `images/${id}.jpg`; await gh(image, { method: "PUT", body: JSON.stringify({ message: "Add photo", content: await shrink(f), branch: cfg.branch }) }); }
        data.articles.unshift({ id, slug: uniqueSlug(title), category: $("post-category").value, title, summary, body, format: "html", author: $("post-author").value.trim() || "Newsroom", time: when, date: new Date().toISOString(), image });
      }
      await save("Post: " + title);
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
