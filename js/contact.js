/* Contact form: sends through FormSubmit (no mail app needed). Messages arrive in the inbox set in ENDPOINT. */
(function () {
  const ENDPOINT = "https://formsubmit.co/ajax/vanywinner@gmail.com";
  const WHATSAPP = "https://wa.me/254715672799";
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = document.getElementById("contact-status");
  const btn = form.querySelector("button[type=submit]");

  function say(html, cls) { status.className = "contact__status " + (cls || ""); status.innerHTML = html; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data._honey) return; /* bots fill the hidden field */
    btn.disabled = true;
    say("Sending...", "");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      });
      const out = await res.json();
      if (!res.ok || String(out.success) !== "true") throw new Error(out.message || "failed");
      form.reset();
      say("Thank you. Your message has been sent and we will reply by email.", "is-ok");
    } catch (err) {
      say('Sorry, the message could not be sent. Please try again or <a href="' + WHATSAPP + '" target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>.', "is-error");
    } finally {
      btn.disabled = false;
    }
  });
})();
