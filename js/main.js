/* Home page only: runs the main-stories slider. The slider markup is built ahead of time by scripts/build.js. */
(function () {
  const HERO_DELAY = 5000;

  /* slider behaviour: changes story every few seconds, pauses on hover/focus/touch/off-screen, swipe on phones */
  function initHero() {
    const hero = document.querySelector("#lead-story .hero");
    if (!hero || hero.dataset.ready) return;
    hero.dataset.ready = "1";
    const slides = [...hero.querySelectorAll(".hero__slide")];
    const dots = [...hero.querySelectorAll(".hero__dot")];
    if (slides.length < 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cur = 0, timer = null, paused = false, visible = true, started = false, x0 = null;
    const load = (i) => { const im = slides[i].querySelector("img[data-src]"); if (im) { im.src = im.dataset.src; im.removeAttribute("data-src"); } };
    const show = (i) => {
      cur = (i + slides.length) % slides.length;
      load(cur); load((cur + 1) % slides.length);
      slides.forEach((s, k) => { const on = k === cur; s.classList.toggle("is-active", on); if (on) s.removeAttribute("inert"); else s.setAttribute("inert", ""); });
      dots.forEach((d, k) => { d.classList.toggle("is-active", k === cur); d.setAttribute("aria-current", k === cur ? "true" : "false"); });
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const play = () => { stop(); if (!started || paused || !visible || document.hidden || reduce.matches) return; timer = setInterval(() => show(cur + 1), HERO_DELAY); };
    const go = (i) => { show(i); play(); };
    hero.querySelector(".hero__nav--prev").addEventListener("click", () => go(cur - 1));
    hero.querySelector(".hero__nav--next").addEventListener("click", () => go(cur + 1));
    dots.forEach((d, k) => d.addEventListener("click", () => go(k)));
    hero.addEventListener("mouseenter", () => { paused = true; stop(); });
    hero.addEventListener("mouseleave", () => { paused = false; play(); });
    hero.addEventListener("focusin", () => { paused = true; stop(); });
    hero.addEventListener("focusout", () => { paused = false; play(); });
    hero.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener("visibilitychange", play);
    if ("IntersectionObserver" in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; play(); }, { threshold: 0.3 }).observe(hero);
    /* wait until the page has finished loading, so the slider never competes with the first paint */
    const begin = () => setTimeout(() => { started = true; load(1); play(); }, 1500);
    if (document.readyState === "complete") begin(); else window.addEventListener("load", begin);
  }
  initHero();
})();
