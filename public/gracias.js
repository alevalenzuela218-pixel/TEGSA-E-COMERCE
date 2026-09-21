var ars = (n) => Number(n) > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "A confirmar";

async function main() {
  try { window.Cart.clear(); } catch {}
  const id = new URLSearchParams(location.search).get("order");
  const box = document.getElementById("g");
  if (!id) { box.innerHTML = `<h1>¡Gracias!</h1><p>Tu pedido fue registrado.</p><p class="crumb"><a href="/">← Volver al catálogo</a></p>`; return; }

  const res = await fetch(`/api/order/${id}`);
  if (!res.ok) { box.innerHTML = `<h1>¡Gracias!</h1><p>Tu pedido fue registrado (N.º ${id}).</p><p class="crumb"><a href="/">← Volver al catálogo</a></p>`; return; }
  const o = await res.json();
  const lines = (o.items || []).map((i) =>
    `<div class="sline"><span>${i.nombre} × ${i.cantidad}</span><span>${ars(i.subtotal)}</span></div>`).join("");
  box.innerHTML = `
    <h1>¡Gracias por tu compra${o.cliente_nombre ? ", " + o.cliente_nombre.split(" ")[0] : ""}!</h1>
    <p style="color:var(--ink-soft);margin:0 0 20px">Registramos tu pedido <b>N.º ${o.id.slice(0, 8)}</b>. Estado: ${o.estado || o.status}.</p>
    <div class="summary" style="max-width:420px">
      <h3>Resumen</h3>${lines}
      <div class="sline tot"><span>Total</span><b>${ars(o.total)}</b></div>
    </div>
    <p class="crumb" style="margin-top:18px"><a href="/">← Seguir comprando</a></p>`;
}
main();
