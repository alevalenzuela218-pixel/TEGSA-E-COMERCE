var ars = (n) => Number(n) > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "Consultar";

function renderSummary() {
  const c = window.Cart.read();
  if (!c.length) { location.href = "/"; return; }
  document.getElementById("lines").innerHTML = c.map((i) =>
    `<div class="sline"><span>${i.nombre} × ${i.cantidad}</span><span>${ars(i.precio * i.cantidad)}</span></div>`).join("");
  document.getElementById("tot").textContent = ars(window.Cart.total());
}

async function pay() {
  const nombre = document.getElementById("c-nombre").value.trim();
  const email = document.getElementById("c-email").value.trim();
  const msg = document.getElementById("msg");
  if (!nombre || !email) { msg.textContent = "Completá nombre y email."; msg.style.color = "#c0492f"; return; }

  const btn = document.getElementById("pay");
  btn.disabled = true; btn.textContent = "Procesando…";
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: { nombre, email, telefono: document.getElementById("c-tel").value.trim(), doc: document.getElementById("c-doc").value.trim() },
        items: window.Cart.read().map((i) => ({ variant_id: i.variant_id, cantidad: i.cantidad })),
      }),
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || "No se pudo procesar el pedido."; msg.style.color = "#c0492f"; btn.disabled = false; btn.textContent = "Confirmar pedido"; return; }

    const orderId = data.order_id;
    if (data.checkoutUrl) {          // Mercado Pago configurado → al pago
      window.Cart.clear();
      location.href = data.checkoutUrl;
    } else {                          // sin pasarela → pedido registrado
      window.Cart.clear();
      location.href = `/gracias?order=${orderId}`;
    }
  } catch (e) {
    msg.textContent = "Error de conexión. Probá de nuevo."; msg.style.color = "#c0492f";
    btn.disabled = false; btn.textContent = "Confirmar pedido";
  }
}

document.getElementById("pay").addEventListener("click", pay);
renderSummary();
