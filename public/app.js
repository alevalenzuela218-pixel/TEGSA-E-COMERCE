const ars = (n) => n > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "Consultar precio";
const glow = (b) => ({ calida: "#f4b657", neutra: "#e6d3ad", fria: "#9ecbe4" }[b] || "#cfd6dd");
const state = { ubicacion: "", tipo: new Set(), temp: new Set(), ip: 0, q: "", min: "", max: "", sort: "rel" };

const el = (id) => document.getElementById(id);
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function lumSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f35" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/></svg>`;
}
function stockBadge(s) {
  if (s <= 0) return `<span class="stock"><i style="background:#c0492f"></i>Sin stock</span>`;
  if (s < 15) return `<span class="stock"><i style="background:var(--warn)"></i>Últimas ${s}</span>`;
  return `<span class="stock"><i style="background:var(--ok)"></i>En stock</span>`;
}

async function loadMeta() {
  const m = await fetch("/api/meta").then((r) => r.json());
  const countEl = el("heroProductCount");
  if (countEl && Number.isFinite(Number(m.total))) countEl.textContent = Number(m.total).toLocaleString("es-AR");
  const ubicLabels = { interior: "Interior", exterior: "Exterior", interior_exterior: "Interior-Exterior" };
  el("f-ubic").innerHTML = `<label class="opt"><input type="radio" name="ubic" value="" checked>Todas</label>` +
    m.ubicaciones.map((u) => `<label class="opt"><input type="radio" name="ubic" value="${u.ubicacion}">${ubicLabels[u.ubicacion] || u.ubicacion}<span class="ct">${u.n}</span></label>`).join("");
  el("f-tipo").innerHTML = m.tipos.map((t) =>
    `<label class="opt"><input type="checkbox" value="${t.slug}">${t.nombre}<span class="ct">${t.n}</span></label>`).join("");
  el("f-temp").innerHTML = [["calida", "Cálida (≤3200K)"], ["neutra", "Neutra (3500–4500K)"], ["fria", "Fría (≥5000K)"]]
    .map(([v, l]) => `<label class="opt"><input type="checkbox" value="${v}">${l}</label>`).join("");
  el("f-ip").innerHTML = [[0, "Cualquiera"], [44, "IP44 o mayor"], [65, "IP65 o mayor"]]
    .map(([v, l], i) => `<label class="opt"><input type="radio" name="ip" value="${v}" ${i === 0 ? "checked" : ""}>${l}</label>`).join("");

  el("f-ubic").onchange = (e) => { state.ubicacion = e.target.value; load(); };
  el("f-ip").onchange = (e) => { state.ip = e.target.value; load(); };
  el("f-tipo").onchange = () => { state.tipo = new Set([...el("f-tipo").querySelectorAll(":checked")].map((c) => c.value)); load(); };
  el("f-temp").onchange = () => { state.temp = new Set([...el("f-temp").querySelectorAll(":checked")].map((c) => c.value)); load(); };

  // tarjetas de categoría (con ícono)
  const chipsBox = el("chips");
  if (chipsBox && m.tipos) {
    chipsBox.innerHTML = m.tipos.map((t) => `
      <button class="catcard" data-slug="${t.slug}">
        <span class="cc-ic">${catIcon(t.slug)}</span>
        <span class="cc-nm">${t.nombre}</span>
        <span class="cc-n">${t.n} productos</span>
      </button>`).join("");
    chipsBox.querySelectorAll(".catcard").forEach((c) => c.onclick = () => {
      const wasActive = c.classList.contains("active");
      chipsBox.querySelectorAll(".catcard").forEach((x) => x.classList.remove("active"));
      const slug = wasActive ? "" : c.dataset.slug;
      if (slug) c.classList.add("active");
      state.tipo = slug ? new Set([slug]) : new Set();
      el("f-tipo").querySelectorAll("input").forEach((i) => { i.checked = !!slug && i.value === slug; });
      load();
      document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function catIcon(slug) {
  const I = {
    riel: '<path d="M3 12h18"/><rect x="6" y="9" width="3" height="6" rx="1"/><rect x="15" y="9" width="3" height="6" rx="1"/>',
    accesorio: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    fuente: '<rect x="4" y="8" width="16" height="8" rx="2"/><path d="M9 12h6"/>',
    modulo: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M8 8v8M13 8v8"/>',
    spot: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.5"/>',
    colgante: '<path d="M12 3v4"/><path d="M7 16l5-9 5 9z"/><path d="M6 16h12"/>',
    aplique: '<path d="M5 4v16"/><path d="M5 9h6a4 4 0 0 1 0 8H5"/>',
    tubo: '<rect x="4" y="10" width="16" height="4" rx="2"/>',
    lampara_pie: '<path d="M12 21V9"/><path d="M8 9l4-6 4 6z"/><path d="M8 21h8"/>',
    lampara_escritorio: '<path d="M4 21h8"/><path d="M8 21V11"/><path d="M8 11l6-5"/><path d="M11 4l5 4-3 3z"/>',
    proyector: '<path d="M4 8h9l6-3v14l-6-3H4z"/>',
    espejo: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M9.5 7a3 3 0 0 1 5 0"/>',
    decorativo: '<circle cx="12" cy="10" r="5"/><path d="M12 15v6M9 21h6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I[slug] || I.decorativo}</svg>`;
}

async function load() {
  const p = new URLSearchParams();
  if (state.ubicacion) p.set("ubicacion", state.ubicacion);
  if (state.ip) p.set("ip", state.ip);
  if (state.q) p.set("q", state.q);
  if (state.min) p.set("min", state.min);
  if (state.max) p.set("max", state.max);
  if (state.sort !== "rel") p.set("sort", state.sort);
  // tipo/temp: la API acepta uno; si hay varios, filtramos en cliente
  if (state.tipo.size === 1) p.set("tipo", [...state.tipo][0]);
  if (state.temp.size === 1) p.set("temp", [...state.temp][0]);

  let rows = await fetch("/api/products?" + p).then((r) => r.json());
  if (state.tipo.size > 1) rows = rows.filter((r) => state.tipo.has(r.tipo_slug));
  if (state.temp.size > 1) rows = rows.filter((r) => state.temp.has(r.temp_band));
  render(rows);
}

const byVid = new Map();
function render(rows) {
  el("rcount").textContent = rows.length;
  byVid.clear(); rows.forEach((r) => byVid.set(String(r.variant_id), r));
  const g = el("grid");
  if (!rows.length) { g.innerHTML = `<div class="empty">No encontramos productos con esos filtros.</div>`; return; }
  g.innerHTML = rows.map((r) => {
    const specs = [
      r.potencia_w ? `${r.potencia_w} W` : null,
      r.flujo_lm ? `${r.flujo_lm} lm` : null,
      r.temp_kelvin ? `${r.temp_kelvin}K` : null,
      r.ip != null ? `IP${r.ip}` : null,
    ].filter(Boolean).map((s) => `<span class="spec">${s}</span>`).join("");
    const ubic = { interior: "Interior", exterior: "Exterior", interior_exterior: "Int-Ext" }[r.ubicacion] || r.ubicacion;
    return `<a class="card" data-sku="${String(r.sku || '').replace(/"/g,'&quot;')}" href="/producto?sku=${encodeURIComponent(r.sku)}">
      <div class="vis" style="background:radial-gradient(circle at 50% 42%, ${glow(r.temp_band)}55, transparent 68%), var(--surface)">
        <span class="tag">${ubic}</span>${stockBadge(r.stock_qty)}${r.imagen_url ? `<img class="photo" src="${r.imagen_url}" alt="${r.nombre}" loading="lazy">` : lumSVG()}
      </div>
      <div class="body">
        <div class="type">${r.tipo} · ${r.marca}</div>
        <h4>${r.nombre}</h4>
        <div class="sku">${r.sku}</div>
        <div class="specs">${specs || '<span class="muted">Especificaciones en carga</span>'}</div>
        <div class="foot"><span class="price">${ars(Number(r.precio))}</span></div>
        <span class="buy">Ver producto y comprar</span>
      </div>
    </a>`;
  }).join("");
}

el("q").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); load(); }));
el("sort").addEventListener("change", (e) => { state.sort = e.target.value; load(); });
el("pmin").addEventListener("input", debounce((e) => { state.min = e.target.value; load(); }));
el("pmax").addEventListener("input", debounce((e) => { state.max = e.target.value; load(); }));
el("clear").addEventListener("click", () => {
  Object.assign(state, { ubicacion: "", tipo: new Set(), temp: new Set(), ip: 0, q: "", min: "", max: "" });
  document.querySelectorAll(".filters input").forEach((i) => {
    if (i.type === "checkbox") i.checked = false;
    else if (i.type === "radio") i.checked = i.value === "" || i.value === "0";
    else i.value = "";
  });
  load();
});

loadMeta().then(load).catch((e) => console.error("catálogo:", e));

// ===== carrusel AIDA =====
(function initCarousel() {
  const slides = [...document.querySelectorAll(".slide")];
  const dotsBox = document.getElementById("carDots");
  if (!slides.length || !dotsBox) return;
  let idx = 0, timer;
  slides.forEach((_, i) => { const b = document.createElement("button"); b.onclick = () => go(i); dotsBox.appendChild(b); });
  const dots = [...dotsBox.children];
  const render = () => { slides.forEach((s, i) => s.classList.toggle("active", i === idx)); dots.forEach((d, i) => d.classList.toggle("on", i === idx)); };
  const go = (i) => { idx = (i + slides.length) % slides.length; render(); restart(); };
  const next = () => go(idx + 1), prev = () => go(idx - 1);
  const restart = () => { clearInterval(timer); timer = setInterval(next, 5500); };
  const nb = document.getElementById("carNext"), pb = document.getElementById("carPrev");
  if (nb) nb.onclick = next; if (pb) pb.onclick = prev;
  render(); restart();
})();

// filtro rápido desde un CTA del carrusel (ej. "Ver exterior")
window.setUbic = function (v) {
  state.ubicacion = v;
  const r = document.querySelector(`#f-ubic input[value="${v}"]`);
  if (r) r.checked = true;
  load();
};

// ===== captación de leads (ofertas) =====
(function initLead() {
  const btn = document.getElementById("lead-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const email = document.getElementById("lead-email").value.trim();
    const msg = document.getElementById("leadMsg");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "Ingresá un email válido."; msg.style.color = "#c0492f"; return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const r = await fetch("/api/suscribir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) { document.getElementById("leadForm").innerHTML = `<div class="lead-ok">✓ ¡Listo! Vas a recibir nuestras ofertas.</div>`; }
      else { const d = await r.json(); msg.textContent = d.error || "No se pudo suscribir."; msg.style.color = "#c0492f"; btn.disabled = false; btn.textContent = "Quiero recibir ofertas"; }
    } catch { msg.textContent = "Error de conexión."; msg.style.color = "#c0492f"; btn.disabled = false; btn.textContent = "Quiero recibir ofertas"; }
  });
})();
