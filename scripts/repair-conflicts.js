/* Repairs git merge-conflict markers (<<<<<<<, =======, >>>>>>>) so the site can build again.
   - data/posts.json and data/settings.json: both sides are merged (no stories are lost).
   - generated pages (index.html, stories/, sitemap.xml and so on): ignored, because the build rewrites them.
   - any other file with markers: listed, and the script stops so you can restore a clean copy.
   Runs automatically at the start of the "Build static pages" workflow. Run locally with: node scripts/repair-conflicts.js */
const fs = require("fs");
const path = require("path");

const START = /^<{7}(?: .*)?$/, MID = /^={7}$/, END = /^>{7}(?: .*)?$/, BASE = /^\|{7}(?: .*)?$/;
const GENERATED = /^(index|business|sports|videos|about|contact|privacy|terms|cookies|404|news|opinion|write-for-us)\.html$|^stories\/|^sitemap\.xml$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "images"]);
const TEXT = /\.(html|css|js|json|md|yml|yaml|xml|txt|svg)$/i;

/* split a conflicted text into the two full versions it came from */
function sides(text) {
  const a = [], b = []; let mode = "both"; let hits = 0;
  for (const line of text.split(/\r?\n/)) {
    if (START.test(line)) { mode = "a"; hits++; continue; }
    if (BASE.test(line) && mode === "a") { mode = "base"; continue; }
    if (MID.test(line) && (mode === "a" || mode === "base")) { mode = "b"; continue; }
    if (END.test(line) && mode === "b") { mode = "both"; continue; }
    if (mode === "both" || mode === "a") a.push(line);
    if (mode === "both" || mode === "b") b.push(line);
  }
  return { a: a.join("\n"), b: b.join("\n"), hits };
}
const hasMarkers = (t) => t.split(/\r?\n/).some((l) => START.test(l)) && t.split(/\r?\n/).some((l) => MID.test(l));

function mergePosts(A, B) {
  const out = Object.assign({}, B, A);
  const byId = new Map(); const order = [];
  const score = (x) => Date.parse(x.updated || x.date || 0) || 0;
  for (const x of A.articles || []) { byId.set(x.id, x); order.push(x.id); }
  const extra = [];
  for (const x of B.articles || []) {
    if (!byId.has(x.id)) { extra.push(x); byId.set(x.id, x); }
    else if (score(x) > score(byId.get(x.id))) byId.set(x.id, x);
  }
  out.articles = [...extra, ...order.map((id) => byId.get(id))];
  const sameKey = (x) => (typeof x === "string" ? x : x.id || x.youtubeId || JSON.stringify(x));
  const union = (p, q) => { const seen = new Set(), r = []; for (const x of [...(p || []), ...(q || [])]) { const k = sameKey(x); if (!seen.has(k)) { seen.add(k); r.push(x); } } return r; };
  out.breaking = union(A.breaking, B.breaking).slice(0, 8);
  out.videos = union(A.videos, B.videos);
  return out;
}

function repairJson(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!hasMarkers(text)) return false;
  const { a, b, hits } = sides(text);
  let A, B;
  try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { throw new Error(`${file}: could not read both sides of the conflict (${e.message})`); }
  const merged = file.endsWith("posts.json") ? mergePosts(A, B) : Object.assign({}, B, A);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + (file.endsWith("settings.json") ? "\n" : ""));
  console.log(`Repaired ${file}: merged ${hits} conflict(s)` + (merged.articles ? `, ${merged.articles.length} stories kept` : ""));
  return true;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (TEXT.test(e.name)) out.push(p);
  }
  return out;
}

let fixed = 0; const bad = [];
for (const f of ["data/posts.json", "data/settings.json"]) if (fs.existsSync(f) && repairJson(f)) fixed++;
for (const f of walk(".")) {
  const rel = f.split(path.sep).join("/").replace(/^\.\//, "");
  if (/^data\/(posts|settings)\.json$/.test(rel) || GENERATED.test(rel)) continue;
  if (hasMarkers(fs.readFileSync(f, "utf8"))) bad.push(rel);
}
if (bad.length) {
  console.error("\nThese files still contain merge-conflict markers and must be restored from a clean copy:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log(fixed ? "Conflict repair finished." : "No merge conflicts found in the data files.");
