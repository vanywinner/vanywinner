/* Generates every public page from data/posts.json:
     index.html (home), news.html, business.html, sports.html, opinion.html, videos.html, contact.html,
     stories/ID.html (one page per story) and sitemap.xml.
   Runs automatically on GitHub after every post or edit. Run locally with: node scripts/build.js */
const fs = require("fs");
const SITE = "https://vanywinner.co.ke";
const PHONE_SHOW = "+254 715 672 799", PHONE_TEL = "+254715672799", WHATSAPP = "https://wa.me/254715672799";
const data = JSON.parse(fs.readFileSync("data/posts.json", "utf8"));
data.articles = data.articles || []; data.videos = data.videos || []; data.breaking = data.breaking || [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const isRemote = (u) => /^(https?:)?\/\//.test(u);

/* each menu item is its own page; stories are listed on the page of their category */
const CATEGORIES = [["News", "news.html"], ["Business", "business.html"], ["Sports", "sports.html"], ["Opinion", "opinion.html"]];
const catFile = (cat) => (CATEGORIES.find((c) => c[0] === cat) || [])[1];
const NAV = [["Home", "index.html"], ["News", "news.html"], ["Business", "business.html"], ["Sports", "sports.html"], ["Opinion", "opinion.html"], ["Videos", "videos.html"], ["Live TV", "videos.html"], ["Contact", "contact.html"]];
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
const hrefOf = (a, root) => a.link || (a.id ? root + "stories/" + encodeURIComponent(a.id) + ".html" : "#");
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
  if (!data.breaking.length) return "";
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
const footerHtml = () => `<footer id="site-footer" class="site-footer">
  <div class="site-footer__inner">
    <p class="site-footer__copy">&copy; <span id="footer-year">${new Date().getFullYear()}</span> Vanywinner News &middot; Nairobi, Kenya &middot; vanywinner.co.ke</p>
    <p class="site-footer__dev">Developed by <a href="https://wa.me/254715672799" target="_blank" rel="noopener noreferrer">Vanywinner Enterprises</a></p>
  </div>
</footer>`;
const GA = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-NP7RJ1HD89"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-NP7RJ1HD89');
</script>`;
function minCss() {
  return fs.readFileSync("css/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};:,>])\s*/g, "$1").replace(/;}/g, "}");
}
const CSS_V = "5";

/* one function builds the frame for every page */
function layout(o) {
  const root = o.root || "";
  const url = SITE + "/" + (o.path || "");
  const ogImg = o.ogImage ? `\n<meta property="og:image" content="${o.ogImage}">\n<meta name="twitter:card" content="summary_large_image">` : "";
  const css = o.inlineCss ? `<style>${minCss()}</style>` : `<link rel="stylesheet" href="${root}css/style.css?v=${CSS_V}">`;
  const scripts = [`${root}js/site.js?v=${CSS_V}`].concat(o.scripts || []).map((s) => `<script src="${s}" defer></script>`).join("\n");
  const bar = o.story ? "" : breakingBar();
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
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${FONTS}"></noscript>
${css}${o.head || ""}
</head>
<body${bar ? ' class="has-breaking"' : ""} data-root="${root}">
${bar}${headerHtml(root, o.active)}
${o.main}

${o.after || ""}${footerHtml()}

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
  const body = data.articles.length
    ? `<section id="top-stories" class="top-stories">
    <article id="lead-story" class="lead-story">${heroHtml(featured)}</article>
    <div id="side-stories" class="side-stories">${side.map((a) => sideStory(a, "")).join("")}</div>
    <aside class="trending" aria-labelledby="trending-title">
      <h2 id="trending-title" class="trending__title">Latest</h2>
      <ol id="trending-list" class="trending__list">${data.articles.slice(0, 6).map((a) => `<li class="trending__item"><a class="trending__link" href="${esc(hrefOf(a, ""))}">${esc(a.title)}</a></li>`).join("")}</ol>
    </aside>
  </section>`
    : `<p class="empty-note">No stories yet. Post the first one from the admin page.</p>`;
  writePage("index.html", layout({
    path: "", active: "index.html", inlineCss: true, scripts: ["js/main.js?v=" + CSS_V],
    title: "Vanywinner News: Kenya, Africa and the world",
    desc: "Breaking news, business, sport, opinion and video from Kenya and beyond.",
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
    ${list.length ? `<div class="card-grid">${list.map((a) => storyCard(a, "")).join("")}</div>` : `<p class="empty-note">No ${cat} stories yet. Check back soon.</p>`}
  </section>
</main>`
  }));
  return list.length;
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

function storyPages(urls, today) {
  fs.rmSync("stories", { recursive: true, force: true });
  fs.mkdirSync("stories");
  for (const a of data.articles) {
    const url = `${SITE}/stories/${a.id}.html`;
    const desc = (a.summary || a.body || "").slice(0, 160);
    const img = a.image ? (isRemote(a.image) ? a.image : `${SITE}/${a.image}`) : `${SITE}/favicon.svg`;
    const dim = a.image && !isRemote(a.image) ? imageSize(a.image) : null;
    const dimAttrs = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
    const paras = (a.body || a.summary || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
    const ld = JSON.stringify({
      "@context": "https://schema.org", "@type": "NewsArticle", headline: a.title, datePublished: a.date, dateModified: a.updated || a.date,
      author: { "@type": "Person", name: a.author }, image: img, mainEntityOfPage: url,
      publisher: { "@type": "Organization", name: "Vanywinner News", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } }
    }).replace(/</g, "\\u003c");
    const cf = catFile(a.category);
    writePage(`stories/${a.id}.html`, layout({
      root: "../", path: `stories/${a.id}.html`, story: true, active: cf || "", ogType: "article", ogImage: img,
      title: `${a.title} | Vanywinner News`, ogTitle: a.title, desc,
      head: `\n<script type="application/ld+json">${ld}</script>`,
      main: `<main id="story-page" class="story-page">
  <a class="story-page__back" href="../index.html">Back to home</a>
  <h1 class="story-page__title">${esc(a.title)}</h1>${cf ? `<a class="chip" href="../${cf}">${esc(a.category)}</a>` : `<span class="chip">${esc(a.category)}</span>`}
  <p class="story-page__meta">By ${esc(a.author)}, ${esc(a.time)}</p>
  ${a.image ? `<img class="story-page__image" src="${isRemote(a.image) ? esc(a.image) : "../" + esc(a.image)}" alt="${esc(a.title)}"${dimAttrs} decoding="async">` : ""}
  <div class="story-page__body">${paras}</div>
</main>`
    }));
    urls.push([url, (a.updated || a.date || today).slice(0, 10)]);
  }
}

async function main() {
  await makeThumbs();
  await makeHeroInline();
  const today = new Date().toISOString().slice(0, 10);
  const urls = [[SITE + "/", today]];
  homePage();
  const counts = CATEGORIES.map((c) => { const n = sectionPage(c); urls.push([SITE + "/" + c[1], today]); return `${c[0]} ${n}`; });
  videosPage(); urls.push([SITE + "/videos.html", today]);
  contactPage(); urls.push([SITE + "/contact.html", today]);
  storyPages(urls, today);
  const known = new Set(CATEGORIES.map((c) => c[0]));
  const lost = data.articles.filter((a) => !known.has(a.category));
  if (lost.length) console.warn(`WARNING: ${lost.length} story(ies) have a category without a page: ${[...new Set(lost.map((a) => a.category))].join(", ")}`);
  fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
  console.log(`Built home, ${counts.join(", ")}, ${data.videos.length} videos, contact, ${data.articles.length} story pages and sitemap.xml`);
}
main().catch((e) => { console.error(e); process.exit(1); });
