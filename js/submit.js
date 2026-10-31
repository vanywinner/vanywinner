/* "Write for us" page: the editor, checks, draft saving and sending the article for review. */
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $("submit-form"); if (!form) return;
  const endpoint = (form.dataset.endpoint || "").trim();
  const ed = VWEditor({ editor: $("sub-body"), toolbar: $("editor-toolbar"), wordCount: $("sub-words") });
  const started = Date.now(), DRAFT = "vw_draft";
  const say = (m, bad) => { const s = $("sub-status"); s.textContent = m; s.className = "sub-status" + (bad ? " sub-status--error" : ""); };
  const words = () => { const t = ed.plainOf(ed.getBody()); return t ? t.split(/\s+/).length : 0; };

  if (!endpoint) { $("submit-closed").hidden = false; $("sub-btn").disabled = true; }

  /* the draft is kept on this device only, so a closed tab does not lose the article */
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
    if (d) { $("sub-title").value = d.title || ""; $("sub-name").value = d.name || ""; if (d.topic) $("sub-topic").value = d.topic; if (d.body) ed.setBody(ed.cleanHtml(d.body, true)); }
  } catch (e) {}
  const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ title: $("sub-title").value, name: $("sub-name").value, topic: $("sub-topic").value, body: ed.getBody() })); } catch (e) {} };
  setInterval(saveDraft, 5000);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("sub-title").value.trim(), name = $("sub-name").value.trim(), email = $("sub-email").value.trim(), phone = $("sub-phone").value.trim();
    const w = words();
    if (title.length < 8) return say("Please write a headline of at least 8 characters.", true);
    if (name.length < 2) return say("Please enter your name.", true);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say("That email address does not look right.", true);
    if (phone && !/^[+0-9 ()\-]{7,25}$/.test(phone)) return say("That phone number does not look right.", true);
    if (w < 150) return say(`Please write at least 150 words (you have ${w}).`, true);
    if (w > 2500) return say(`Please keep the article under 2,500 words (you have ${w}).`, true);
    if (!$("sub-consent").checked) return say("Please tick the box to confirm the article is your own work.", true);
    const tsEl = form.querySelector('[name="cf-turnstile-response"]');
    $("sub-btn").disabled = true; say("Sending your article...");
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author: name, email, phone, topic: $("sub-topic").value, body: ed.getBody(), consent: true, website: $("sub-website").value, startedAt: started, turnstile: tsEl ? tsEl.value : "" })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Something went wrong. Please try again.");
      try { localStorage.removeItem(DRAFT); } catch (er) {}
      $("sub-ref").textContent = out.id; form.hidden = true; $("submit-done").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { say(err.message || "Could not send. Check your connection and try again.", true); $("sub-btn").disabled = false; if (window.turnstile) try { window.turnstile.reset(); } catch (er) {} }
  });
})();
