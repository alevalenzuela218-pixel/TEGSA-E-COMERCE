var ars = (n) => n > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "Consultar precio";
const glow = (b) => ({ calida: "#f4b657", neutra: "#e6d3ad", fria: "#9ecbe4" }[b] || "#cfd6dd");
const lumSVG = () => `<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f35" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/></svg>`;
const band = (k) => k == null ? null : k <= 3200 ? "Cálida" : k <= 4500 ? "Neutra" : "Fría";
const ubicLabel = { interior: "Interior", exterior: "Exterior", interior_exterior: "Interior-Exterior" };

const row = (k, v) => (v == null || v === "" ) ? "" : `<tr><td>${k}</td><td>${v}</td></tr>`;

async function main() {
  const sku = new URLSearchParams(location.search).get("sku");
  const box = document.getElementById("pd");
  if (!sku) { box.innerHTML = `<p class="crumb"><a href="/">← Volver</a></p><p>Falta el código de producto.</p>`; return; }

  const res = await fetch(`/api/product/${encodeURIComponent(sku)}`);
  if (!res.ok) { box.innerHTML = `<p class="crumb"><a href="/">← Volver al catálogo</a></p><p>No encontramos ese producto.</p>`; return; }
  const p = await res.json();
  const a = p.atributos || {};

  // filas de especificaciones (solo las que tienen valor)
  const specs = [
    row("Tipo", p.tipo),
    row("Ubicación", ubicLabel[p.ubicacion] || p.ubicacion),
    row("Potencia", p.potencia_w ? `${p.potencia_w} W` : null),
    row("Flujo lumínico", p.flujo_lm ? `${p.flujo_lm} lm` : null),
    row("Temperatura de color", p.temp_kelvin ? `${p.temp_kelvin}K · ${band(p.temp_kelvin)}` : (a.tono_luz || null)),
    row("Ángulo", a.angulo),
    row("Protección", p.ip != null ? `IP${p.ip}` : null),
    row("Tensión", p.tension_v),
    row("Corriente", a.corriente),
    row("Control", a.control),
    row("Medidas", a.medidas || a.dimensiones),
    row("Peso", a.peso_g ? `${a.peso_g} g` : null),
    row("Material", a.material),
    row("Colores / terminación", a.terminacion || a.colores_banos),
    row("Encendido", a.encendido),
    row("Garantía", a.garantia_anios ? `${a.garantia_anios} años` : null),
    row("EAN13", a.ean13),
    row("Línea", a.linea),
  ].join("");

  const stock = p.stock_qty > 0
    ? `<span class="pill">● En stock (${p.stock_qty})</span>`
    : `<span class="pill">Sin stock</span>`;
  const nota = a.nota ? `<p class="crumb" style="margin-top:14px">⚠ ${a.nota}</p>` : "";
  const canBuy = p.stock_qty > 0 && p.variant_id;
  const addBtn = `<div><button class="add-btn" id="addBtn" ${canBuy ? "" : "disabled"}>${canBuy ? "Agregar al carrito" : "Sin stock"}</button></div>`;

  box.innerHTML = `
    <p class="crumb"><a href="/">Catálogo</a> · ${p.tipo}</p>
    <div class="pd-top">
      <div class="pd-vis" style="background:radial-gradient(circle at 50% 42%, ${glow(p.temp_band)}55, transparent 70%), var(--surface)">${p.imagen_url ? `<img class="photo" src="${p.imagen_url}" alt="${p.nombre}">` : lumSVG()}</div>
      <div>
        <div class="pd-tipo">${p.tipo}</div>
        <h1>${p.nombre}</h1>
        <div class="sku">${p.sku}</div>
        <div class="price">${ars(Number(p.precio))}</div>
        ${stock}
        ${p.descripcion ? `<p class="desc">${p.descripcion}</p>` : ""}
        ${addBtn}
        <table class="stable">${specs}</table>
        ${nota}
      </div>
    </div>`;
  document.title = `${p.nombre} · TEGSA Iluminación`;
  if (canBuy) {
    document.getElementById("addBtn").onclick = () =>
      window.Cart.add({ variant_id: p.variant_id, sku: p.sku, nombre: p.nombre, precio: Number(p.precio) });
  }
}
main();
