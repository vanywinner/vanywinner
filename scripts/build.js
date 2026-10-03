/* Generates static story pages (stories/ID.html) and sitemap.xml from data/posts.json.
   Runs automatically on GitHub after every post. Run locally with: node scripts/build.js */
const fs = require("fs");
const SITE = "https://vanywinner.co.ke";
const data = JSON.parse(fs.readFileSync("data/posts.json", "utf8"));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const today = new Date().toISOString().slice(0, 10);

fs.rmSync("stories", { recursive: true, force: true });
fs.mkdirSync("stories");
const urls = [[SITE + "/", today]];

for (const a of data.articles) {
  const url = `${SITE}/stories/${a.id}.html`;
  const desc = esc((a.summary || a.body || "").slice(0, 160));
  const img = a.image ? `${SITE}/${a.image}` : `${SITE}/favicon.svg`;
  const paras = (a.body || a.summary || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle", headline: a.title, datePublished: a.date,
    author: { "@type": "Person", name: a.author }, image: img, mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: "Vanywinner News", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } }
  }).replace(/</g, "\\u003c");
  fs.writeFileSync(`stories/${a.id}.html`, `<!DOCTYPE html>
<html lang="en">
<head>
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
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
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
  ${a.image ? `<img class="story-page__image" src="../${esc(a.image)}" alt="${esc(a.title)}">` : ""}
  <div class="story-page__body">${paras}</div>
</main>
<footer id="site-footer" class="site-footer"><p class="site-footer__brand">Vanywinner News</p></footer>
</body>
</html>`);
  urls.push([url, (a.date || today).slice(0, 10)]);
}

fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
console.log(`Built ${data.articles.length} story pages and sitemap.xml`);
