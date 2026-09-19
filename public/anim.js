// Animaciones sutiles: aparición al hacer scroll + contadores animados.
document.addEventListener("DOMContentLoaded", () => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // reveal (fade + subir)
  const els = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    els.forEach((e) => e.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }

  // contadores [data-count]
  const counters = document.querySelectorAll("[data-count]");
  const runCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const pre = el.dataset.pre || "";
    const post = el.dataset.post || "";
    if (reduce) { el.textContent = pre + target + post; return; }
    const dur = 1200; const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const val = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = pre + val + post;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { runCount(en.target); io2.unobserve(en.target); } });
    }, { threshold: 0.5 });
    counters.forEach((c) => io2.observe(c));
  } else counters.forEach(runCount);
});
