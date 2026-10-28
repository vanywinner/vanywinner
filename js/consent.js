/* Cookie consent. Remembers the visitor's choice (localStorage key "vw_consent")
   and loads Google Analytics only after "Accept all". Any link or button with the
   attribute data-cookie-settings reopens the banner. */
(function () {
  var KEY = "vw_consent", GA_ID = "G-NP7RJ1HD89", loaded = false;
  var root = document.body.getAttribute("data-root") || "";

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function allow() {
    if (loaded || typeof window.gtag !== "function") return;
    loaded = true;
    window["ga-disable-" + GA_ID] = false;
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  function deny() {
    window["ga-disable-" + GA_ID] = true;
    if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: "denied" });
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (name === "_ga" || name.indexOf("_ga_") === 0) {
        [location.hostname, "." + location.hostname].forEach(function (d) {
          document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + d;
        });
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      }
    });
  }

  function choose(v) {
    save(v);
    var b = document.getElementById("cookie-banner");
    if (b) b.hidden = true;
    if (v === "all") allow(); else deny();
  }

  function show() {
    var b = document.getElementById("cookie-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "cookie-banner";
      b.className = "cookie-banner";
      b.setAttribute("role", "dialog");
      b.setAttribute("aria-label", "Cookie consent");
      b.innerHTML =
        '<p class="cookie-banner__text">We use cookies to understand how readers use Vanywinner News and, in future, to show ads. ' +
        'Choose <strong>Accept all</strong> to allow analytics, or <strong>Essential only</strong> to decline. ' +
        'Read our <a href="' + root + 'cookies">Cookie Policy</a> and <a href="' + root + 'privacy">Privacy Policy</a>.</p>' +
        '<div class="cookie-banner__actions">' +
        '<button type="button" class="cookie-btn cookie-btn--ghost" data-consent="essential">Essential only</button>' +
        '<button type="button" class="cookie-btn" data-consent="all">Accept all</button></div>';
      b.addEventListener("click", function (e) {
        var t = e.target.closest("[data-consent]");
        if (t) choose(t.getAttribute("data-consent"));
      });
      document.body.appendChild(b);
    }
    b.hidden = false;
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-cookie-settings]")) show();
  });

  var saved = read();
  if (saved === "all") allow();
  else if (saved !== "essential") show();
})();
