// ============================================================
//  DATOS DE CONTACTO — EDITÁ SOLO ESTO (se usa en toda la web)
// ============================================================
const CONTACTO = {
  whatsapp: "5493764000000",                 // ← tu WhatsApp: código país + número, sin + ni espacios
  instagram: "https://instagram.com/tegsa",  // ← tu Instagram
  facebook: "https://facebook.com/tegsa",    // ← tu Facebook
  email: "info@tegsa.com.ar",                // ← tu email
  ciudad: "Posadas, Misiones",               // ← tu ciudad
};
const waLink = (msg = "Hola, quería consultar por iluminación.") =>
  `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(msg)}`;

const IG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`;
const FB = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H9v3h2v7h3v-7h2.5l.5-3H14V9z"/></svg>`;
const WA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.9-1.5A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.9-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9 .9-2.2c.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2 .9.6 1.1.6 1.4.5.2-.1.5-.5.7-.7.2-.3.4-.2.6-.1l1.7.9c.3.1.4.2.5.3.1.2.1.7-.1 1.1z"/></svg>`;

function mountPromo() {
  if (document.querySelector(".promobar")) return;
  const p = document.createElement("div");
  p.className = "promobar";
  p.innerHTML = `<div class="promo-track">
    <span>🚚 Envíos a todo el país</span><span>·</span>
    <span>💡 Asesoramiento profesional sin cargo</span><span>·</span>
    <span>🛡️ Garantía de 3 años</span><span>·</span>
    <span>💬 Atención directa por WhatsApp</span><span>·</span>
    <span>🚚 Envíos a todo el país</span><span>·</span>
    <span>💡 Asesoramiento profesional sin cargo</span><span>·</span>
    <span>🛡️ Garantía de 3 años</span><span>·</span>
    <span>💬 Atención directa por WhatsApp</span>
  </div>`;
  document.body.prepend(p);
}

function mountTopbar() {
  if (document.querySelector(".topbar")) return;
  const bar = document.createElement("div");
  bar.className = "topbar";
  bar.innerHTML = `<div class="topbar-in">
    <span class="tb-left">🚚 Envíos a todo el país · Asesoramiento profesional</span>
    <span class="tb-right">
      <a href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">${WA}</a>
      <a href="${CONTACTO.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${IG}</a>
      <a href="${CONTACTO.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${FB}</a>
    </span></div>`;
  document.body.prepend(bar);
}

function mountFooter() {
  if (document.querySelector(".site-footer")) return;
  const f = document.createElement("footer");
  f.className = "site-footer";
  f.innerHTML = `<div class="footer-in">
    <div class="f-col f-brand">
      <img src="/img/logo.png" alt="TEGSA" class="f-logo">
      <p>Iluminación y luminotecnia. Interior, exterior, accesorios y proyectos a medida, con la asesoría de ingenieros.</p>
    </div>
    <div class="f-col">
      <h4>Tienda</h4>
      <a href="/">Catálogo</a>
      <a href="/asesoramiento">Asesoramiento</a>
      <a href="/#catalogo">Interior / Exterior</a>
    </div>
    <div class="f-col">
      <h4>Contacto</h4>
      <a href="${waLink()}" target="_blank" rel="noopener">WhatsApp</a>
      <a href="mailto:${CONTACTO.email}">${CONTACTO.email}</a>
      <span>${CONTACTO.ciudad}</span>
    </div>
    <div class="f-col">
      <h4>Seguinos</h4>
      <div class="f-social">
        <a href="${CONTACTO.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${IG}</a>
        <a href="${CONTACTO.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${FB}</a>
        <a href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">${WA}</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">© ${new Date().getFullYear()} TEGSA Iluminación · Todos los derechos reservados</div>`;
  document.body.appendChild(f);
}

function mountWhatsApp() {
  if (document.querySelector(".wa-float")) return;
  const a = document.createElement("a");
  a.className = "wa-float";
  a.href = waLink();
  a.target = "_blank"; a.rel = "noopener";
  a.setAttribute("aria-label", "Escribinos por WhatsApp");
  a.innerHTML = WA;
  document.body.appendChild(a);
}

document.addEventListener("DOMContentLoaded", () => {
  mountTopbar(); mountPromo(); mountFooter(); mountWhatsApp();
});
