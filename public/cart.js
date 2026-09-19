// Carrito compartido (se incluye en todas las páginas del storefront).
// Estado en localStorage, privado por navegador.
const CART_KEY = "tegsa_cart_v1";
const ars = (n) => Number(n) > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "Consultar";

const Cart = {
  read() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  write(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch {} render(); },
  count() { return this.read().reduce((s, i) => s + i.cantidad, 0); },
  total() { return this.read().reduce((s, i) => s + i.precio * i.cantidad, 0); },
  add(item) {
    const c = this.read();
    const ex = c.find((i) => i.variant_id === item.variant_id);
    if (ex) ex.cantidad += item.cantidad || 1;
    else c.push({ ...item, cantidad: item.cantidad || 1 });
    this.write(c); openDrawer();
  },
  setQty(vid, qty) {
    let c = this.read();
    if (qty <= 0) c = c.filter((i) => i.variant_id !== vid);
    else { const it = c.find((i) => i.variant_id === vid); if (it) it.cantidad = qty; }
    this.write(c);
  },
  clear() { this.write([]); },
};
window.Cart = Cart;

// --- UI: botón en la barra + drawer ---
function mount() {
  const actions = document.querySelector(".bar-actions");
  if (actions && !document.getElementById("cartBtn")) {
    const btn = document.createElement("button");
    btn.id = "cartBtn"; btn.className = "cart-btn"; btn.onclick = openDrawer;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L23 6H6"/></svg><span class="cart-count" id="cartCount">0</span>`;
    actions.prepend(btn);
  }
  if (!document.getElementById("cartDrawer")) {
    const d = document.createElement("div");
    d.id = "cartOverlay"; d.className = "cart-overlay"; d.onclick = (e) => { if (e.target === d) closeDrawer(); };
    d.innerHTML = `<aside class="cart-drawer" id="cartDrawer">
        <div class="cart-head"><strong>Tu carrito</strong><button id="cartClose" class="cart-x">✕</button></div>
        <div class="cart-items" id="cartItems"></div>
        <div class="cart-foot">
          <div class="cart-total"><span>Total</span><b id="cartTotal">$0</b></div>
          <a href="/checkout" class="cta-buy" id="cartCheckout">Finalizar compra</a>
        </div></aside>`;
    document.body.appendChild(d);
    document.getElementById("cartClose").onclick = closeDrawer;
  }
  render();
}
function openDrawer() { document.getElementById("cartOverlay")?.classList.add("on"); }
function closeDrawer() { document.getElementById("cartOverlay")?.classList.remove("on"); }
window.closeDrawer = closeDrawer;

function render() {
  const c = Cart.read();
  const cc = document.getElementById("cartCount");
  if (cc) { cc.textContent = Cart.count(); cc.style.display = Cart.count() ? "grid" : "none"; }
  const box = document.getElementById("cartItems");
  if (box) {
    box.innerHTML = c.length ? c.map((i) => `
      <div class="ci">
        <div class="ci-info"><div class="ci-name">${i.nombre}</div><div class="ci-price">${ars(i.precio)}</div></div>
        <div class="ci-qty">
          <button onclick="Cart.setQty('${i.variant_id}',${i.cantidad - 1})">−</button>
          <span>${i.cantidad}</span>
          <button onclick="Cart.setQty('${i.variant_id}',${i.cantidad + 1})">+</button>
        </div>
      </div>`).join("") : `<p class="cart-empty">Tu carrito está vacío.</p>`;
  }
  const t = document.getElementById("cartTotal");
  if (t) t.textContent = ars(Cart.total());
  const co = document.getElementById("cartCheckout");
  if (co) co.style.pointerEvents = c.length ? "auto" : "none", co.style.opacity = c.length ? "1" : ".5";
}

document.addEventListener("DOMContentLoaded", mount);
