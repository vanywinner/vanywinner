/* Generates static story pages (stories/ID.html) and sitemap.xml from data/posts.json.
   Runs automatically on GitHub after every post. Run locally with: node scripts/build.js */
const fs = require("fs");
const SITE = "https://vanywinner.co.ke";
const data = JSON.parse(fs.readFileSync("data/posts.json", "utf8"));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
async function makeThumbs() {
  if (!sharp) return;
  fs.mkdirSync("images/thumbs", { recursive: true });
  for (const a of data.articles) {
    if (!a.image || /^(https?:)?\/\//.test(a.image) || !fs.existsSync(a.image)) continue;
    const out = a.image.replace(/^images\//, "images/thumbs/").replace(/\.[a-z0-9]+$/i, ".webp");
    if (fs.existsSync(out)) continue;
    await sharp(a.image).rotate().resize({ width: 560, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
  }
  fs.mkdirSync("images/hero", { recursive: true });
  for (const a of data.articles) {
    if (!a.image || /^(https?:)?\/\//.test(a.image) || !fs.existsSync(a.image)) continue;
    const out = a.image.replace(/^images\//, "images/hero/").replace(/\.[a-z0-9]+$/i, ".webp");
    if (fs.existsSync(out)) continue;
    await sharp(a.image).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 70 }).toFile(out);
  }
}

/* ---------- speed: put the top stories straight into index.html so phones do not wait for JavaScript ---------- */
const hrefOf = (a) => a.link || (a.id ? "stories/" + encodeURIComponent(a.id) + ".html" : "#");
const thumbSrc = (img) => /^(https?:)?\/\//.test(img) ? img : img.replace(/^images\//, "images/thumbs/").replace(/\.[a-z0-9]+$/i, ".webp");
function thumbHtml(a) {
  if (!a.image) return `<div class="thumb thumb--${esc(a.category.toLowerCase())}"></div>`;
  const hasThumb = sharp && !/^(https?:)?\/\//.test(a.image);
  return `<img class="thumb" src="${esc(hasThumb ? thumbSrc(a.image) : a.image)}" onerror="this.onerror=null;this.src='${esc(a.image)}'" alt="" loading="lazy" decoding="async">`;
}

/* ---------- speed: inline the stylesheet and breaking-news ticker into index.html (no extra request before first paint) ---------- */
function inlineHome(html) {
  let css = fs.readFileSync("css/style.css", "utf8");
  css = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};:,>])\s*/g, "$1").replace(/;}/g, "}");
  html = html.replace(/<!--css-->[\s\S]*?<!--\/css-->/, () => `<!--css--><style>${css}</style><!--/css-->`);
  const items = data.breaking || [];
  if (items.length) {
    const group = `<div class="breaking-bar__group">${items.map((t) => `<span class="breaking-bar__item">${esc(t)}</span>`).join("")}</div>`;
    html = html.replace(/<!--breaking-->[\s\S]*?<!--\/breaking-->/, () => `<!--breaking-->${group}${group}<!--/breaking-->`);
    html = html.replace(/<div id="breaking-track" class="breaking-bar__track"[^>]*>/, `<div id="breaking-track" class="breaking-bar__track" style="animation-duration:${Math.max(25, items.join(" ").length * 0.3)}s">`);
  }
  return html;
}

/* ---------- hero slider (main stories): same markup is built here (for fast first paint) and in js/main.js ---------- */
let heroInline = null; /* first slide picture, embedded in index.html so it paints together with the page */
const HERO_MAX = 5;
const heroSrc = (img) => /^(https?:)?\/\//.test(img) ? img : img.replace(/^images\//, "images/hero/").replace(/\.[a-z0-9]+$/i, ".webp");
const pickFeatured = (list) => { const withImg = list.filter((a) => a.image); return (withImg.length ? withImg : list).slice(0, HERO_MAX); };
function heroSlide(a, i, n) {
  const first = i === 0;
  const hasHero = sharp && a.image && !/^(https?:)?\/\//.test(a.image);
  const src = first && heroInline ? heroInline : hasHero ? heroSrc(a.image) : a.image;
  const img = a.image ? `<img class="hero__img" ${first ? `src="${esc(src)}" fetchpriority="high"` : `data-src="${esc(src)}"`} data-orig="${esc(a.image)}" onerror="this.onerror=null;this.src=this.dataset.orig" alt="" decoding="async">` : "";
  const tag = first ? "h1" : "h2";
  return `<div class="hero__slide${first ? " is-active" : ""}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}"${first ? "" : " inert"}>${img}
      <a class="hero__link" href="${esc(hrefOf(a))}"><span class="chip chip--light">${esc(a.category)}</span>
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
  if (!sharp || !first || !first.image || /^(https?:)?\/\//.test(first.image) || !fs.existsSync(first.image)) return;
  const buf = await sharp(first.image).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 62 }).toBuffer();
  heroInline = "data:image/webp;base64," + buf.toString("base64");
}
function prerenderHome() {
  if (!data.articles.length || !fs.existsSync("index.html")) return;
  const featured = pickFeatured(data.articles);
  const leadHtml = heroHtml(featured);
  const side = data.articles.filter((x) => !featured.includes(x)).concat(featured.slice(1)).slice(0, 3);
  const sideHtml = side.map((a) => `<article class="side-story"><a class="side-story__link" href="${esc(hrefOf(a))}">
      ${thumbHtml(a)}<div><span class="chip">${esc(a.category)}</span>
      <h3 class="side-story__title">${esc(a.title)}</h3>
      <p class="story-card__meta">By ${esc(a.author)}, ${esc(a.time)}</p></div></a></article>`).join("");
  const latestHtml = data.articles.slice(0, 6).map((a) => `<li class="trending__item"><a class="trending__link" href="${esc(hrefOf(a))}">${esc(a.title)}</a></li>`).join("");
  let html = fs.readFileSync("index.html", "utf8");
  const put = (tag, content) => { html = html.replace(new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`), () => `<!--${tag}-->${content}<!--/${tag}-->`); };
  put("lead", leadHtml); put("side", sideHtml); put("latest", latestHtml);
  fs.writeFileSync("index.html", inlineHome(html));
}
const today = new Date().toISOString().slice(0, 10);

fs.rmSync("stories", { recursive: true, force: true });
fs.mkdirSync("stories");
const urls = [[SITE + "/", today]];

for (const a of data.articles) {
  const url = `${SITE}/stories/${a.id}.html`;
  const desc = esc((a.summary || a.body || "").slice(0, 160));
  const img = a.image ? `${SITE}/${a.image}` : `${SITE}/favicon.svg`;
  const dim = a.image && !/^https?:/.test(a.image) ? imageSize(a.image) : null;
  const dimAttrs = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
  const paras = (a.body || a.summary || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle", headline: a.title, datePublished: a.date,
    author: { "@type": "Person", name: a.author }, image: img, mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: "Vanywinner News", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } }
  }).replace(/</g, "\\u003c");
  fs.writeFileSync(`stories/${a.id}.html`, `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-NP7RJ1HD89"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-NP7RJ1HD89');
</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)} | Vanywinner News</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Vanywinner News">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600&display=swap"></noscript>
<link rel="stylesheet" href="../css/style.css?v=4">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<header id="site-header" class="site-header">
  <a class="brand" href="../index.html"><img class="brand__logo" src="../favicon.svg" alt="" width="40" height="40"><span class="brand__name">Vanywinner<small>News</small></span></a>
</header>
<main id="story-page" class="story-page">
  <a class="story-page__back" href="../index.html">Back to home</a>
  <h1 class="story-page__title">${esc(a.title)}</h1><span class="chip">${esc(a.category)}</span>
  <p class="story-page__meta">By ${esc(a.author)}, ${esc(a.time)}</p>
  ${a.image ? `<img class="story-page__image" src="../${esc(a.image)}" alt="${esc(a.title)}"${dimAttrs} decoding="async">` : ""}
  <div class="story-page__body">${paras}</div>
</main>
<footer id="site-footer" class="site-footer">
  <div class="site-footer__inner">
    <p class="site-footer__copy">&copy; <span id="footer-year">${new Date().getFullYear()}</span> Vanywinner News &middot; Nairobi, Kenya &middot; vanywinner.co.ke</p>
    <p class="site-footer__dev">Developed by <a href="https://wa.me/254715672799" target="_blank" rel="noopener noreferrer">Vanywinner Enterprises</a></p>
  </div>
</footer>
</body>
</html>`);
  urls.push([url, (a.date || today).slice(0, 10)]);
}

fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
makeThumbs().then(makeHeroInline).then(() => { prerenderHome(); console.log(`Built ${data.articles.length} story pages, sitemap.xml and the home page top stories`); });
