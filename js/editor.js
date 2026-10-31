/* Word-processor style editor, shared by the admin page and the public "Write for us" page.
   Usage: const ed = VWEditor({ editor: element, toolbar: element, wordCount: element });
   Returns helpers: getBody(), setBody(html), cleanHtml(html, keepColors), textToHtml(text), plainOf(html), summaryOf(html), isHtmlBody(article), sync(). */
(function (global) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function VWEditor(opts) {
  /* ---------- word-processor style editor ---------- */
  const editor = opts.editor, toolbar = opts.toolbar;
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
    if (opts.wordCount) opts.wordCount.textContent = n + (n === 1 ? " word" : " words");
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

    sync();
    return { getBody, setBody, cleanHtml, textToHtml, plainOf, summaryOf, isHtmlBody, sync, editor };
  }
  global.VWEditor = VWEditor;
})(window);
