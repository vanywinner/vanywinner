/* Generates every public page from data/posts.json:
     index.html (home, with the News stories below the top stories), business.html, sports.html, videos.html, about.html, contact.html,
     stories/TITLE-SLUG.html (one page per story, named after its title) and sitemap.xml.
   Site switches (breaking bar on/off, election countdown) come from data/settings.json and are changed only from the admin page.
   Runs automatically on GitHub after every post or edit. Run locally with: node scripts/build.js */
const fs = require("fs");
const SITE = "https://vanywinner.co.ke";
const PHONE_SHOW = "+254 715 672 799", PHONE_TEL = "+254715672799", WHATSAPP = "https://wa.me/254715672799";
/* stop early, with a clear message, if a git merge left conflict markers in the data files */
for (const f of ["data/posts.json", "data/settings.json"]) {
  if (fs.existsSync(f) && /^<{7}/m.test(fs.readFileSync(f, "utf8"))) { console.error(`${f} contains git merge-conflict markers. Run: node scripts/repair-conflicts.js`); process.exit(1); }
}
const data = JSON.parse(fs.readFileSync("data/posts.json", "utf8"));
data.articles = data.articles || []; data.videos = data.videos || []; data.breaking = data.breaking || [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- site settings (edited from the admin page) ---------- */
let settings = { showBreaking: true, showCountdown: true, electionLabel: "Kenya General Election", electionDate: "2027-08-10T06:00:00+03:00", submitEndpoint: "", turnstileSiteKey: "" };
try { settings = Object.assign(settings, JSON.parse(fs.readFileSync("data/settings.json", "utf8"))); } catch (e) {}

/* ---------- story file names: the title, not a number ---------- */
function slugify(title, id) {
  const base = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/['\u2019`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let slug = base.length > 80 ? base.slice(0, 80).replace(/-[^-]*$/, "") : base;
  return slug || "story-" + String(id || Date.now()).slice(-6);
}
function assignSlugs() {
  const used = new Set(); let changed = false;
  for (const a of data.articles) if (a.slug) used.add(a.slug);
  const seen = new Set();
  for (const a of data.articles) {
    if (!a.slug || seen.has(a.slug)) {
      let s = slugify(a.title, a.id), n = 2, cand = s;
      while (used.has(cand) || seen.has(cand)) cand = s + "-" + n++;
      a.slug = cand; used.add(cand); changed = true;
    }
    seen.add(a.slug);
  }
  if (changed) fs.writeFileSync("data/posts.json", JSON.stringify(data, null, 2));
}
assignSlugs();
const storyFile = (a) => `stories/${a.slug}.html`;

/* ---------- rich text: keeps a safe set of formatting tags and drops everything else ---------- */
const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "span", "hr", "sub", "sup"]);
const SIZES = new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"]);
function safeStyle(tag, style) {
  const out = [];
  for (const decl of String(style || "").split(";")) {
    const m = decl.match(/^\s*([a-z-]+)\s*:\s*([^;]+?)\s*$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].toLowerCase();
    if (k === "text-align" && /^(left|center|right|justify)$/.test(v)) out.push(`text-align:${v}`);
    else if (tag === "span" && (k === "color" || k === "background-color") && /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-z]{3,20})$/.test(v)) out.push(`${k}:${v}`);
    else if (tag === "span" && k === "font-size" && SIZES.has(v)) out.push(`font-size:${v}`);
  }
  return out.join(";");
}
function sanitizeHtml(html) {
  let src = String(html || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|svg|math|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  const out = [], stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) { out.push(m[5].replace(/>/g, "&gt;")); continue; }
    if (m[6] !== undefined) { out.push("&lt;"); continue; }
    let tag = m[2].toLowerCase(); const closing = !!m[1];
    if (tag === "div") tag = "p";
    if (tag === "font") tag = "span";
    if (tag === "b") tag = "strong"; if (tag === "i") tag = "em"; if (tag === "strike") tag = "s";
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i < 0) continue;
      while (stack.length > i) out.push(`</${stack.pop()}>`);
      continue;
    }
    if (/^(p|h2|h3|h4|ul|ol|blockquote|hr)$/.test(tag) && stack.includes("p")) { while (stack.length) { const t = stack.pop(); out.push(`</${t}>`); if (t === "p") break; } }
    if (tag === "br" || tag === "hr") { out.push(`<${tag}>`); continue; }
    const attrs = {}; String(m[3] || "").replace(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (_, k, __, a, b, c) => { attrs[k.toLowerCase()] = a !== undefined ? a : b !== undefined ? b : c; return ""; });
    let extra = "";
    if (tag === "a") {
      const h = String(attrs.href || "").trim().replace(/&amp;/g, "&");
      if (!/^(https?:\/\/|mailto:)/i.test(h)) { continue; }
      extra = ` href="${esc(h)}" target="_blank" rel="noopener noreferrer"`;
    }
    let st = safeStyle(tag, attrs.style);
    if (m[2].toLowerCase() === "font") { const parts = []; if (attrs.color && /^#?[0-9a-z]{3,20}$/i.test(attrs.color)) parts.push("color:" + (/^[0-9a-f]{3,6}$/i.test(attrs.color) ? "#" : "") + attrs.color); st = [st].concat(parts).filter(Boolean).join(";"); }
    if (st) extra += ` style="${st}"`;
    out.push(`<${tag}${extra}>`); stack.push(tag);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("").replace(/<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br>)*<\/p>/g, "").trim();
}
const plainText = (html) => String(html || "").replace(/<(br|\/p|\/h[2-4]|\/li|\/blockquote)\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const isHtmlBody = (a) => a.format === "html" || /^\s*<(p|h[2-4]|ul|ol|blockquote|div)\b/i.test(a.body || "");
const bodyHtml = (a) => isHtmlBody(a) ? sanitizeHtml(a.body) : (a.body || a.summary || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
const bodyPlain = (a) => isHtmlBody(a) ? plainText(a.body) : String(a.body || "");

const isRemote = (u) => /^(https?:)?\/\//.test(u);

/* each menu item is its own page; stories are listed on the page of their category */
const CATEGORIES = [["News", "news.html"], ["Business", "business.html"], ["Sports", "sports.html"], ["Opinion", "opinion.html"]];
/* News has no page of its own: its stories are listed on the home page, below the top stories */
const PAGE_CATS = CATEGORIES.filter((c) => c[0] !== "News");
const catFile = (cat) => cat === "News" ? "index.html#news" : (PAGE_CATS.find((c) => c[0] === cat) || [])[1];
const NAV = [["Home", "index.html"], ["Business", "business.html"], ["Sports", "sports.html"], ["Opinion", "opinion.html"], ["Videos", "videos.html"], ["About", "about.html"], ["Contact", "contact.html"]];
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600&display=swap";

/* Reads width/height from a JPEG or PNG so story images can reserve their space (prevents layout shift). */
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) {}
  return null;
}

/* ---------- speed: small WebP thumbnails for cards (needs the optional "sharp" package) ---------- */
let sharp = null;
try { sharp = require("sharp"); } catch (e) { console.log("sharp not installed: skipping thumbnails (pages still work, using original images)"); }
async function makeResized(dir, width, quality) {
  fs.mkdirSync("images/" + dir, { recursive: true });
  for (const a of data.articles) {
    if (!a.image || isRemote(a.image) || !fs.existsSync(a.image)) continue;
    const out = a.image.replace(/^images\//, `images/${dir}/`).replace(/\.[a-z0-9]+$/i, ".webp");
    if (fs.existsSync(out)) continue;
    await sharp(a.image).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out);
  }
}
async function makeThumbs() { if (!sharp) return; await makeResized("thumbs", 560, 72); await makeResized("hero", 900, 70); }

/* ---------- card pieces (same markup as before) ---------- */
const hrefOf = (a, root) => a.link || (a.slug ? root + storyFile(a) : a.id ? root + "stories/" + encodeURIComponent(a.id) + ".html" : "#");
const swapDir = (img, dir) => img.replace(/^images\//, `images/${dir}/`).replace(/\.[a-z0-9]+$/i, ".webp");
function thumbHtml(a, root) {
  if (!a.image) return `<div class="thumb thumb--${esc(String(a.category).toLowerCase())}"></div>`;
  if (isRemote(a.image)) return `<img class="thumb" src="${esc(a.image)}" alt="" loading="lazy" decoding="async">`;
  const src = sharp ? swapDir(a.image, "thumbs") : a.image;
  return `<img class="thumb" src="${esc(root + src)}" onerror="this.onerror=null;this.src='${esc(root + a.image)}'" alt="" loading="lazy" decoding="async">`;
}
const metaLine = (a) => `<p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p>`;
const storyCard = (a, root) => `<article class="story-card"><a class="story-card__link" href="${esc(hrefOf(a, root))}">
      ${thumbHtml(a, root)}<span class="chip">${esc(a.category)}</span>
      <h3 class="story-card__title">${esc(a.title)}</h3>
      ${metaLine(a)}</a></article>`;
const sideStory = (a, root) => `<article class="side-story"><a class="side-story__link" href="${esc(hrefOf(a, root))}">
      ${thumbHtml(a, root)}<div><span class="chip">${esc(a.category)}</span>
      <h3 class="side-story__title">${esc(a.title)}</h3>
      ${metaLine(a)}</div></a></article>`;
const videoCard = (v) => `<button class="video-card" type="button" data-yt="${esc(v.youtubeId || "")}" data-title="${esc(v.title)}">
        <span class="video-card__thumb">${v.youtubeId ? `<img class="video-card__img" src="https://i.ytimg.com/vi/${esc(v.youtubeId)}/mqdefault.jpg" alt="" width="320" height="180" loading="lazy" decoding="async">` : ""}<span class="video-card__play" aria-hidden="true"></span>${v.length ? `<span class="video-card__length">${esc(v.length)}</span>` : ""}</span>
        <span class="video-card__title">${esc(v.title)}</span></button>`;

/* ---------- hero slider (main stories): built here so the page paints fast; js/main.js only runs the slideshow ---------- */
let heroInline = null; /* first slide picture, embedded in index.html so it paints together with the page */
const HERO_MAX = 5;
const pickFeatured = (list) => { const withImg = list.filter((a) => a.image); return (withImg.length ? withImg : list).slice(0, HERO_MAX); };
function heroSlide(a, i, n) {
  const first = i === 0;
  const hasHero = sharp && a.image && !isRemote(a.image);
  const src = first && heroInline ? heroInline : hasHero ? swapDir(a.image, "hero") : a.image;
  const img = a.image ? `<img class="hero__img" ${first ? `src="${esc(src)}" fetchpriority="high"` : `data-src="${esc(src)}"`} data-orig="${esc(a.image)}" onerror="this.onerror=null;this.src=this.dataset.orig" alt="" decoding="async">` : "";
  const tag = first ? "h1" : "h2";
  return `<div class="hero__slide${first ? " is-active" : ""}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}"${first ? "" : " inert"}>${img}
      <a class="hero__link" href="${esc(hrefOf(a, ""))}"><span class="chip chip--light">${esc(a.category)}</span>
      <${tag} class="hero__title">${esc(a.title)}</${tag}>
      <p class="hero__meta">By ${esc(a.author)}, ${esc(a.time)}</p></a></div>`;
}
function heroHtml(list) {
  const n = list.length;
  const chev = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const nav = n > 1 ? `<button class="hero__nav hero__nav--prev" type="button" aria-label="Previous story">${chev("M15 5l-7 7 7 7")}</button>
      <button class="hero__nav hero__nav--next" type="button" aria-label="Next story">${chev("M9 5l7 7-7 7")}</button>
      <div class="hero__dots">${list.map((_, i) => `<button class="hero__dot${i === 0 ? " is-active" : ""}" type="button" aria-label="Go to story ${i + 1}"></button>`).join("")}</div>` : "";
  return `<div class="hero" role="region" aria-roledescription="carousel" aria-label="Main stories">${list.map((a, i) => heroSlide(a, i, n)).join("")}${nav}</div>`;
}
async function makeHeroInline() {
  const first = pickFeatured(data.articles)[0];
  if (!sharp || !first || !first.image || isRemote(first.image) || !fs.existsSync(first.image)) return;
  const buf = await sharp(first.image).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 62 }).toBuffer();
  heroInline = "data:image/webp;base64," + buf.toString("base64");
}

/* ---------- shared page frame: breaking ticker, header with the menu, search, footer ---------- */
function breakingBar() {
  if (!settings.showBreaking || !data.breaking.length) return "";
  const group = `<div class="breaking-bar__group">${data.breaking.map((t) => `<span class="breaking-bar__item">${esc(t)}</span>`).join("")}</div>`;
  return `<div id="breaking-bar" class="breaking-bar" role="region" aria-label="Breaking news">
  <span class="breaking-bar__label"><i class="breaking-bar__dot"></i>Breaking News</span>
  <div class="breaking-bar__window"><div id="breaking-track" class="breaking-bar__track" style="animation-duration:${Math.max(25, data.breaking.join(" ").length * 0.3)}s">${group}${group}</div></div>
  <time id="today-date" class="breaking-bar__date"></time>
</div>
`;
}
function headerHtml(root, active) {
  const seen = new Set();
  const links = NAV.map(([label, file]) => {
    const on = file === active && !seen.has(file); seen.add(file);
    return `<a class="main-nav__link${on ? " is-active" : ""}" href="${root}${file}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("\n    ");
  return `<header id="site-header" class="site-header">
  <a class="brand" href="${root}index.html" aria-label="Vanywinner home">
    <img class="brand__logo" src="${root}favicon.svg" alt="" width="40" height="40">
    <span class="brand__name">Vanywinner<small>News</small></span>
  </a>
  <nav id="main-nav" class="main-nav" aria-label="Main">
    ${links}
  </nav>
  <button id="search-toggle" class="icon-btn" type="button" aria-label="Search stories">Search</button>
  <button id="menu-toggle" class="icon-btn icon-btn--menu" type="button" aria-label="Open menu" aria-expanded="false">Menu</button>
</header>

<form id="search-panel" class="search-panel" role="search" hidden>
  <input id="search-input" class="search-panel__input" type="search" placeholder="Search headlines and summaries" aria-label="Search stories" autocomplete="off">
  <div id="search-results" class="search-results" aria-live="polite" hidden></div>
</form>
`;
}
/* ---------- election countdown strip (sits above the breaking-news bar on every page) ---------- */
function electionStrip() {
  const target = new Date(settings.electionDate);
  if (!settings.showCountdown || isNaN(target)) return "";
  const ms = Math.max(0, target - Date.now());
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  const when = target.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
  return `<div id="election-bar" class="election-bar">
  <p class="election-bar__label"><span class="election-bar__title">${esc(settings.electionLabel)}</span><span class="election-bar__date">${when}</span></p>
  <div id="election-countdown" class="election-countdown" role="timer" aria-label="Time left until the election" data-target="${esc(settings.electionDate)}">
    <span class="cd"><b class="cd__num" data-unit="days">${d}</b><i class="cd__lbl">days</i></span>
    <span class="cd"><b class="cd__num" data-unit="hours">${String(h).padStart(2, "0")}</b><i class="cd__lbl">hours</i></span>
    <span class="cd"><b class="cd__num" data-unit="minutes">${String(m).padStart(2, "0")}</b><i class="cd__lbl">minutes</i></span>
  </div>
</div>
`;
}

const footerHtml = (root = "") => `<footer id="site-footer" class="site-footer">
  <div class="site-footer__inner">
    <p class="site-footer__copy">&copy; <span id="footer-year">${new Date().getFullYear()}</span> Vanywinner News &middot; Nairobi, Kenya &middot; vanywinner.co.ke</p>
    <nav class="site-footer__legal" aria-label="Legal"><a href="${root}privacy.html">Privacy Policy</a><a href="${root}terms.html">Terms and Conditions</a><a href="${root}cookies.html">Cookie Policy</a><a href="${root}write-for-us.html">Write for us</a><button type="button" class="site-footer__cookie" data-cookie-settings>Cookie settings</button></nav>
    <p class="site-footer__dev">Developed by <a href="https://wa.me/254715672799" target="_blank" rel="noopener noreferrer">Vanywinner Enterprises</a></p>
  </div>
</footer>`;
const GA = `<!-- Google Analytics is loaded by js/consent.js only after the visitor accepts cookies -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
</script>`;
function minCss() {
  return fs.readFileSync("css/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};:,>])\s*/g, "$1").replace(/;}/g, "}");
}
const CSS_V = "8";
const OG_DEFAULT = `${SITE}/images/og-default.jpg`;
const isoFromId = (id) => /^\d{13}$/.test(String(id)) ? new Date(Number(id)).toISOString() : undefined;
const GENERIC_AUTHOR = /desk|newsroom|vanywinner|editorial|staff/i;

/* one function builds the frame for every page */
function layout(o) {
  const root = o.root || "";
  const url = SITE + "/" + (o.path || "");
  const shareImg = o.ogImage || OG_DEFAULT;
  const ogImg = `\n<meta property="og:image" content="${shareImg}">` + (shareImg === OG_DEFAULT ? `\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">` : "") + `\n<meta name="twitter:card" content="summary_large_image">`
    + ((o.head || "").includes('name="robots"') ? "" : `\n<meta name="robots" content="index, follow, max-image-preview:large">`);
  const css = o.inlineCss ? `<style>${minCss()}</style>` : `<link rel="stylesheet" href="${root}css/style.css?v=${CSS_V}">`;
  const scripts = [`${root}js/site.js?v=${CSS_V}`, `${root}js/consent.js?v=${CSS_V}`].concat(o.scripts || []).map((s) => `<script src="${s}" defer></script>`).join("\n");
  const bar = o.story ? "" : breakingBar();
  const strip = electionStrip();
  return `<!DOCTYPE html>
<html lang="en">
<head>
${GA}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${o.ogType || "website"}">
<meta property="og:site_name" content="Vanywinner News">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">${ogImg}
<link rel="icon" href="${root}favicon.ico" sizes="48x48">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}favicon-96x96.png" sizes="96x96" type="image/png">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${FONTS}"></noscript>
${css}${o.head || ""}
</head>
<body${bar ? ' class="has-breaking"' : ""} data-root="${root}">
${strip}${bar}${headerHtml(root, o.active)}
${o.main}

${o.after || ""}${footerHtml(root)}

${scripts}
</body>
</html>
`;
}
const writePage = (file, html) => { fs.writeFileSync(file, html); };

/* ---------- the pages ---------- */
function homePage() {
  const featured = pickFeatured(data.articles);
  const side = data.articles.filter((x) => !featured.includes(x)).concat(featured.slice(1)).slice(0, 3);
  const news = data.articles.filter((a) => a.category === "News");
  const newsHtml = `
  <section id="news" class="category-section">
    <h2 class="section-title">News</h2>
    <p class="section-count">${news.length} ${news.length === 1 ? "story" : "stories"}</p>
    ${news.length ? `<div class="card-grid">${news.map((a) => storyCard(a, "")).join("")}</div>` : `<p class="empty-note">No News stories yet. Check back soon.</p>`}
  </section>`;
  const body = data.articles.length
    ? `<section id="top-stories" class="top-stories">
    <article id="lead-story" class="lead-story">${heroHtml(featured)}</article>
    <div id="side-stories" class="side-stories">${side.map((a) => sideStory(a, "")).join("")}</div>
    <aside class="trending" aria-labelledby="trending-title">
      <h2 id="trending-title" class="trending__title">Latest</h2>
      <ol id="trending-list" class="trending__list">${data.articles.slice(0, 6).map((a) => `<li class="trending__item"><a class="trending__link" href="${esc(hrefOf(a, ""))}">${esc(a.title)}</a></li>`).join("")}</ol>
    </aside>
  </section>${newsHtml}`
    : `<p class="empty-note">No stories yet. Post the first one from the admin page.</p>`;
  writePage("index.html", layout({
    path: "", active: "index.html", inlineCss: true, scripts: ["js/main.js?v=" + CSS_V],
    title: "Vanywinner News: Kenya, Africa and the world",
    desc: "Breaking news, business, sport and video from Kenya and beyond.",
    main: `<main id="main-content" class="page">\n  ${body}\n</main>`
  }));
}

function sectionPage([cat, file]) {
  const list = data.articles.filter((a) => a.category === cat);
  const count = `${list.length} ${list.length === 1 ? "story" : "stories"}`;
  writePage(file, layout({
    path: file, active: file,
    title: `${cat} | Vanywinner News`,
    desc: `${cat} stories from Vanywinner News: Kenya, Africa and the world.`,
    main: `<main id="main-content" class="page">
  <section id="${cat.toLowerCase()}" class="category-section">
    <h1 class="section-title">${cat}</h1>
    <p class="section-count">${count}</p>
    ${cat === "Opinion" ? `<p class="section-cta">Have a view on a trending topic? <a href="write-for-us.html">Write for us</a> and share your opinion.</p>` : ""}
    ${list.length ? `<div class="card-grid">${list.map((a) => storyCard(a, "")).join("")}</div>` : `<p class="empty-note">No ${cat} stories yet. Check back soon.</p>`}
  </section>
</main>`
  }));
  return list.length;
}

/* old /news.html links keep working: they go to the News section on the home page */
function newsRedirect() {
  fs.writeFileSync("news.html", `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>News | Vanywinner News</title>
<meta name="robots" content="noindex"><link rel="canonical" href="${SITE}/">
<meta http-equiv="refresh" content="0; url=index.html#news"><script>location.replace("index.html#news");</script></head>
<body><p><a href="index.html#news">Go to the News section</a></p></body></html>
`);
}

function videosPage() {
  writePage("videos.html", layout({
    path: "videos.html", active: "videos.html", scripts: [],
    title: "Videos | Vanywinner News",
    desc: "Watch news videos, interviews and bulletins from Vanywinner News.",
    main: `<main id="main-content" class="page page--videos">
  <section id="videos" class="videos">
    <div class="videos__inner">
      <h1 class="section-title">Videos</h1>
      ${data.videos.length ? `<div id="video-grid" class="video-grid">${data.videos.map(videoCard).join("")}</div>` : `<p class="empty-note empty-note--dark">No videos yet. Check back soon.</p>`}
    </div>
  </section>
</main>`,
    after: `<div id="video-modal" class="modal" hidden>
  <div class="modal__box">
    <button id="video-close" class="modal__close" type="button" aria-label="Close video">Close</button>
    <div id="video-player" class="modal__player"></div>
  </div>
</div>

`
  }));
}

function contactPage() {
  writePage("contact.html", layout({
    path: "contact.html", active: "contact.html", scripts: ["js/contact.js?v=3"],
    title: "Contact us | Vanywinner News",
    desc: "Call or WhatsApp Vanywinner News on " + PHONE_SHOW + ", or send a message to the newsroom in Nairobi, Kenya.",
    main: `<main id="main-content" class="page">
  <section id="contact" class="contact" aria-labelledby="contact-title">
    <h1 id="contact-title" class="section-title">Contact us</h1>
    <p class="contact__intro">Have a tip, a story or a question? Call or message us on WhatsApp, or send a message below and the newsroom will reply by email.</p>
    <div class="contact__reach">
      <h2 class="contact__reach-title">Call or WhatsApp</h2>
      <p class="contact__number"><a href="tel:${PHONE_TEL}">${PHONE_SHOW}</a></p>
      <p class="contact__reach-note">This number takes both phone calls and WhatsApp messages.</p>
      <div class="contact__actions">
        <a class="contact__action contact__action--call" href="tel:${PHONE_TEL}">Call ${PHONE_SHOW}</a>
        <a class="contact__action contact__action--wa" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer">WhatsApp ${PHONE_SHOW}</a>
      </div>
    </div>
    <h2 class="contact__form-title">Send a message</h2>
    <form id="contact-form" class="contact__form" action="https://formsubmit.co/vanywinner@gmail.com" method="POST">
      <label class="contact__field">Your name<input name="name" type="text" autocomplete="name" maxlength="80" required></label>
      <label class="contact__field">Your email<input name="email" type="email" autocomplete="email" maxlength="120" required></label>
      <label class="contact__field contact__field--wide">Message<textarea name="message" rows="5" maxlength="2000" required></textarea></label>
      <input class="contact__trap" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true">
      <input type="hidden" name="_subject" value="New message from vanywinner.co.ke">
      <input type="hidden" name="_template" value="table">
      <button class="contact__btn" type="submit">Send message</button>
      <p id="contact-status" class="contact__status" role="status" aria-live="polite"></p>
    </form>
  </section>
</main>`
  }));
}

function aboutPage() {
  const ld = `\n<script type="application/ld+json">\n${JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsMediaOrganization", name: "Vanywinner News",
    alternateName: ["Vanywinner", "vanywinner.co.ke"], url: SITE + "/", logo: SITE + "/favicon-192x192.png", email: "vanywinner@gmail.com",
    address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
    founder: { "@type": "Person", name: "Okhala Winslaus Ondwasi", email: "winslausokhala@gmail.com", url: "https://winslausokhala.github.io",
      sameAs: ["https://winslausokhala.github.io", "https://www.linkedin.com/in/winslaus-okhala-861024409"] }
  }).replace(/</g, "\\u003c")}\n</script>`;
  writePage("about.html", layout({
    path: "about.html", active: "about.html", head: ld,
    title: "About Vanywinner News | Nairobi, Kenya",
    desc: "Vanywinner News is an independent Kenyan news site covering news, business and sports. Meet the founder, Okhala Winslaus Ondwasi, and get in touch.",
    main: `<main id="about-page" class="about">
  <section id="about-hero" class="about-hero">
    <h1 class="about-hero__title">About Vanywinner News</h1>
    <p class="about-hero__lead">An independent news site from Nairobi, bringing readers clear, fairly reported stories from Kenya, Africa and the world.</p>
  </section>

  <section id="about-site" class="about-card">
    <h2 class="about-card__title">What we do</h2>
    <p>Vanywinner News covers news, business and sports, with a growing focus on data and the economy. We publish at vanywinner.co.ke and aim to make the day's important stories easy to read on any phone.</p>
    <p>The site is run by one person, which means every story is written, checked and posted by the same hand. We would rather publish fewer stories that we can stand behind than rush out many we cannot.</p>
  </section>

  <section id="about-standards" class="about-card">
    <h2 class="about-card__title">Our standards</h2>
    <ul class="about-list">
      <li><strong>Original writing.</strong> We write our own reports and do not copy other outlets' articles. When we rely on another source, we say so.</li>
      <li><strong>Clear attribution.</strong> Claims, especially serious allegations, are attributed to the person or document they come from and are not presented as established fact.</li>
      <li><strong>Corrections.</strong> If we get something wrong, tell us at vanywinner@gmail.com and we will correct the story and note the change.</li>
    </ul>
  </section>

  <section id="about-founder" class="about-card">
    <h2 class="about-card__title">About the founder</h2>
    <p><strong>Okhala Winslaus Ondwasi</strong> is a data analyst and statistics teacher. He is a final-year BSc Applied Statistics with Information Technology student at Masinde Muliro University of Science and Technology, with graduation expected in December 2026.</p>
    <p>He completed a three-month industrial attachment as a statistical analyst at the Public Benefit Organizations Regulatory Authority (PBORA). He also builds websites, including sites that connect to M-Pesa through Safaricom's Daraja API, writes Python, and cleans and analyses data in Excel.</p>
    <p>Alongside the newsroom, he offers website development, online marketing and SEO services. See his work at <a class="contact-list__link" href="https://winslausokhala.github.io" rel="noopener">winslausokhala.github.io</a>. Where a story promotes those services, we say so.</p>
  </section>

  <section id="about-contact" class="about-card">
    <h2 class="about-card__title">Contact us</h2>
    <ul class="contact-list">
      <li class="contact-list__item"><span class="contact-list__label">Newsroom email</span><a class="contact-list__link" href="mailto:vanywinner@gmail.com">vanywinner@gmail.com</a></li>
      <li class="contact-list__item"><span class="contact-list__label">Founder's email</span><a class="contact-list__link" href="mailto:winslausokhala@gmail.com">winslausokhala@gmail.com</a></li>
      <li class="contact-list__item"><span class="contact-list__label">Phone and WhatsApp</span><a class="contact-list__link" href="tel:${PHONE_TEL}">${PHONE_SHOW}</a></li>
      <li class="contact-list__item"><span class="contact-list__label">Portfolio</span><a class="contact-list__link" href="https://winslausokhala.github.io" rel="noopener">winslausokhala.github.io</a></li>
      <li class="contact-list__item"><span class="contact-list__label">LinkedIn</span><a class="contact-list__link" href="https://www.linkedin.com/in/winslaus-okhala-861024409" rel="noopener">Okhala Winslaus Ondwasi</a></li>
      <li class="contact-list__item"><span class="contact-list__label">Based in</span>Nairobi, Kenya</li>
    </ul>
  </section>
</main>`
  }));
}

function legalPage(file, title, lead, desc) {
  const body = fs.readFileSync(`content/${file}`, "utf8");
  writePage(file, layout({
    path: file, active: "", title: `${title} | Vanywinner News`, desc,
    main: `<main id="${file.replace(".html", "")}-page" class="about">
  <section class="about-hero">
    <h1 class="about-hero__title">${title}</h1>
    <p class="about-hero__lead">${lead}</p>
  </section>
  <section class="about-card legal">
${body}
  </section>
</main>`
  }));
}

function submitPage() {
  const key = String(settings.turnstileSiteKey || "").trim();
  const body = fs.readFileSync("content/write-for-us.html", "utf8")
    .replace(/\{\{ENDPOINT\}\}/g, esc(settings.submitEndpoint || ""))
    .replace(/\{\{TURNSTILE\}\}/g, key ? `<div class="cf-turnstile" data-sitekey="${esc(key)}"></div>` : "");
  writePage("write-for-us.html", layout({
    path: "write-for-us.html", active: "opinion.html",
    title: "Write for us: share your opinion | Vanywinner News",
    desc: "Share your opinion on trending topics with Vanywinner News. Write your article online and send it to our editor for review.",
    head: key ? '\n<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : "",
    scripts: [`js/editor.js?v=${CSS_V}`, `js/submit.js?v=${CSS_V}`],
    main: `<main id="write-for-us-page" class="about">
  <section id="write-for-us-hero" class="about-hero">
    <h1 class="about-hero__title">Write for us</h1>
    <p class="about-hero__lead">Have a view on a trending topic? Write it here and send it to our editor.</p>
  </section>
  <section class="about-card legal">
${body}
  </section>
</main>`
  }));
}

function storyPages(urls, today) {
  fs.rmSync("stories", { recursive: true, force: true });
  fs.mkdirSync("stories");
  for (const a of data.articles) {
    const file = storyFile(a);
    const url = `${SITE}/${file}`;
    const desc = (a.summary || bodyPlain(a)).replace(/\s+/g, " ").slice(0, 160);
    const img = a.image ? (isRemote(a.image) ? a.image : `${SITE}/${a.image}`) : OG_DEFAULT;
    const dim = a.image && !isRemote(a.image) ? imageSize(a.image) : null;
    const dimAttrs = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
    const published = a.date || isoFromId(a.id);
    const headline = a.title.length > 110 ? a.title.slice(0, 107).replace(/\s+\S*$/, "") + "..." : a.title;
    const wordCount = bodyPlain(a).split(/\s+/).filter(Boolean).length;
    const org = { "@type": "Organization", name: "Vanywinner News", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/favicon-192x192.png", width: 192, height: 192 } };
    const ld = JSON.stringify({
      "@context": "https://schema.org", "@type": a.category === "Opinion" ? "OpinionNewsArticle" : "NewsArticle", headline, description: desc, url,
      datePublished: published, dateModified: a.updated || published,
      author: GENERIC_AUTHOR.test(a.author || "") || !a.author ? { "@type": "Organization", name: "Vanywinner News", url: SITE + "/" } : { "@type": "Person", name: a.author },
      publisher: org, image: [img], mainEntityOfPage: { "@type": "WebPage", "@id": url },
      articleSection: a.category, inLanguage: "en-KE", isAccessibleForFree: true, wordCount
    }).replace(/</g, "\\u003c");
    const cfCrumb = catFile(a.category);
    const crumbs = JSON.stringify({
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" }]
        .concat(cfCrumb ? [{ "@type": "ListItem", position: 2, name: a.category, item: `${SITE}/${cfCrumb}` }] : [])
        .concat([{ "@type": "ListItem", position: cfCrumb ? 3 : 2, name: headline }])
    }).replace(/</g, "\\u003c");
    const cf = catFile(a.category);
    writePage(file, layout({
      root: "../", path: file, story: true, active: cf || "", ogType: "article", ogImage: img,
      title: `${a.title} | Vanywinner News`, ogTitle: a.title, desc,
      head: `\n<script type="application/ld+json">${ld}</script>\n<script type="application/ld+json">${crumbs}</script>`,
      main: `<main id="story-page" class="story-page">
  <a class="story-page__back" href="../index.html">Back to home</a>
  <h1 class="story-page__title">${esc(a.title)}</h1>${cf ? `<a class="chip" href="../${cf}">${esc(a.category)}</a>` : `<span class="chip">${esc(a.category)}</span>`}
  <p class="story-page__meta">By ${esc(a.author)}, ${esc(a.time)}</p>
  ${a.image ? `<img class="story-page__image" src="${isRemote(a.image) ? esc(a.image) : "../" + esc(a.image)}" alt="${esc(a.title)}"${dimAttrs} decoding="async">` : ""}
  <div class="story-page__body">${bodyHtml(a)}</div>${a.category === "Opinion" ? `
  <aside class="story-page__note"><strong>Opinion.</strong> The views expressed are the author's own and do not necessarily reflect those of Vanywinner News. <a href="../write-for-us.html">Write for us</a> to share yours.</aside>` : ""}
</main>`
    }));
    urls.push([url, (a.updated || published || today).slice(0, 10)]);
    /* the old numeric address keeps working: it forwards to the title address */
    if (a.id && String(a.id) !== a.slug) {
      writePage(`stories/${a.id}.html`, `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(a.title)} | Vanywinner News</title>
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${a.slug}.html">
<script>location.replace(${JSON.stringify(a.slug + ".html")});</script>
</head><body><p>This story has moved. <a href="${a.slug}.html">Read: ${esc(a.title)}</a></p></body></html>
`);
    }
  }
}

async function main() {
  await makeThumbs();
  await makeHeroInline();
  const today = new Date().toISOString().slice(0, 10);
  const urls = [[SITE + "/", today]];
  homePage();
  newsRedirect();
  const counts = PAGE_CATS.map((c) => { const n = sectionPage(c); urls.push([SITE + "/" + c[1], today]); return `${c[0]} ${n}`; });
  counts.unshift(`News ${data.articles.filter((a) => a.category === "News").length} (on home)`);
  videosPage(); urls.push([SITE + "/videos.html", today]);
  aboutPage(); urls.push([SITE + "/about.html", today]);
  contactPage(); urls.push([SITE + "/contact.html", today]);
  submitPage(); urls.push([SITE + "/write-for-us.html", today]);
  legalPage("privacy.html", "Privacy Policy", "How Vanywinner News collects, uses and protects your information.", "How Vanywinner News collects, uses and protects your personal information, including cookies, analytics and advertising.");
  urls.push([SITE + "/privacy.html", today]);
  legalPage("terms.html", "Terms and Conditions", "The rules for using Vanywinner News.", "The terms and conditions for using Vanywinner News, including content use, accuracy, advertising and complaints.");
  urls.push([SITE + "/terms.html", today]);
  legalPage("cookies.html", "Cookie Policy", "The cookies we use and how you can control them.", "The cookies and similar technologies used on Vanywinner News and how to manage your choices.");
  urls.push([SITE + "/cookies.html", today]);
  storyPages(urls, today);
  const known = new Set(CATEGORIES.map((c) => c[0]));
  const lost = data.articles.filter((a) => !known.has(a.category));
  if (lost.length) console.warn(`WARNING: ${lost.length} story(ies) have a category without a page: ${[...new Set(lost.map((a) => a.category))].join(", ")}`);
  fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
  console.log(`Built home, ${counts.join(", ")}, ${data.videos.length} videos, about, contact, write-for-us, privacy, terms, cookies, ${data.articles.length} story pages and sitemap.xml`);
}
main().catch((e) => { console.error(e); process.exit(1); });
