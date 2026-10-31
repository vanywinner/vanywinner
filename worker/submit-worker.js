/* Vanywinner News: opinion submission receiver (Cloudflare Worker).
   The public "Write for us" page posts an article here. The Worker checks it and saves it as a JSON file in a
   PRIVATE GitHub repository, where the admin page lists it as "Pending review".
   Settings (Worker > Settings > Variables and Secrets):
     GITHUB_TOKEN     (secret)   fine-grained token, only for the submissions repository, Contents: Read and write
     GITHUB_REPO      (text)     for example  vanywinner/vanywinner-submissions
     GITHUB_BRANCH    (text, optional)  default main
     ALLOWED_ORIGINS  (text, optional)  default https://vanywinner.co.ke,https://www.vanywinner.co.ke
     TURNSTILE_SECRET (secret, optional) turns on Cloudflare Turnstile bot protection
     IP_SALT          (secret, optional) any random text, used to hash visitor IPs */

const LIMITS = { titleMin: 8, titleMax: 140, nameMin: 2, nameMax: 80, wordsMin: 150, wordsMax: 2500, bodyMaxChars: 80000, minSeconds: 15 };
const DEFAULT_ORIGINS = "https://vanywinner.co.ke,https://www.vanywinner.co.ke";

const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json" }, headers) });
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
const plain = (html) => String(html).replace(/<(br|\/p|\/h[2-4]|\/li|\/blockquote)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

function toBase64(str) {
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0], Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "Use POST." }, 405, cors);
    if (!allowed.includes(origin)) return json({ ok: false, error: "This request is not allowed from this website." }, 403, cors);
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ ok: false, error: "Submissions are not set up yet." }, 503, cors);

    let p;
    try { p = await request.json(); } catch (e) { return json({ ok: false, error: "Invalid request." }, 400, cors); }
    const fail = (msg, status = 400) => json({ ok: false, error: msg }, status, cors);

    if (p.website) return json({ ok: true, id: "ok" }, 200, cors); // honeypot field: pretend success, save nothing
    if (p.consent !== true) return fail("Please tick the box to confirm the article is your own work.");

    const title = clean(p.title, LIMITS.titleMax + 1), author = clean(p.author, LIMITS.nameMax + 1);
    const email = clean(p.email, 120), phone = clean(p.phone, 26), topic = clean(p.topic, 40);
    const body = String(p.body == null ? "" : p.body);
    if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax) return fail(`The headline should be ${LIMITS.titleMin} to ${LIMITS.titleMax} characters.`);
    if (author.length < LIMITS.nameMin || author.length > LIMITS.nameMax) return fail("Please enter your name.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("That email address does not look right.");
    if (phone && !/^[+0-9 ()\-]{7,25}$/.test(phone)) return fail("That phone number does not look right.");
    if (body.length > LIMITS.bodyMaxChars) return fail("The article is too long.");
    if (/<\s*(script|iframe|object|embed|style)\b|\son[a-z]+\s*=|javascript:/i.test(body)) return fail("The article contains content that is not supported.");
    const words = plain(body).split(/\s+/).filter(Boolean).length;
    if (words < LIMITS.wordsMin) return fail(`Please write at least ${LIMITS.wordsMin} words (you have ${words}).`);
    if (words > LIMITS.wordsMax) return fail(`Please keep the article under ${LIMITS.wordsMax} words (you have ${words}).`);
    if (!(Number(p.startedAt) > 0) || Date.now() - Number(p.startedAt) < LIMITS.minSeconds * 1000) return fail("Please take a moment to review your article before sending.");

    if (env.TURNSTILE_SECRET) {
      const form = new FormData(); form.append("secret", env.TURNSTILE_SECRET); form.append("response", String(p.turnstile || ""));
      const ip = request.headers.get("CF-Connecting-IP"); if (ip) form.append("remoteip", ip);
      let ok = false;
      try { const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }); ok = !!(await r.json()).success; } catch (e) {}
      if (!ok) return fail("Please complete the security check and try again.");
    }

    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const record = {
      id, status: "pending", title, author, email, phone, topic, body, words,
      submittedAt: new Date().toISOString(), source: "write-for-us",
      ipHash: await sha256((request.headers.get("CF-Connecting-IP") || "") + (env.IP_SALT || ""))
    };
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/submissions/${id}.json`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "vanywinner-submissions", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ message: `New opinion submission: ${title.slice(0, 60)}`, content: toBase64(JSON.stringify(record, null, 2)), branch: env.GITHUB_BRANCH || "main" })
    });
    if (!res.ok) {
      console.log("GitHub save failed", res.status);
      return fail("We could not save your article right now. Please try again later or email vanywinner@gmail.com.", 502);
    }
    return json({ ok: true, id }, 200, cors);
  }
};
