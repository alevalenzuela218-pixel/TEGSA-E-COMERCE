const toast = (m, bad = false) => {
  const t = document.getElementById("toast");
  t.textContent = m; t.classList.toggle("bad", bad); t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2600);
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));

async function loadCatalogMeta() {
  const r = await fetch("/api/admin/catalog-meta", { cache: "no-store" });
  if (!r.ok) throw new Error("No se pudo leer el catálogo");
  const d = await r.json();
  const sel = document.getElementById("p-type");
  if (sel) sel.innerHTML = d.types.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("");
  const stats = document.getElementById("catalogStats");
  if (stats) stats.textContent = `${d.stats.active_products} productos activos · ${d.stats.variants} variantes`; 
}

async function load() {
  const r = await fetch("/api/admin/products", { cache: "no-store" });
  if (!r.ok) throw new Error("No se pudieron cargar los productos");
  const rows = await r.json();
  document.getElementById("rows").innerHTML = rows.map((r) => `
    <tr data-id="${r.variant_id}">
      <td><strong>${esc(r.nombre)}</strong><br><span class="sku">${esc(r.sku)} · ${esc(r.marca)}</span></td>
      <td class="muted">${esc(r.tipo)}</td>
      <td><input class="edit precio" type="number" min="0" step="0.01" value="${Number(r.precio)}"></td>
      <td><input class="edit sm stock" type="number" min="0" value="${r.stock_qty}"></td>
      <td><input class="edit img" type="url" placeholder="https://…" value="${esc(r.imagen_url || "")}" style="width:180px"></td>
      <td><button class="save">Guardar</button></td>
    </tr>`).join("");

  document.querySelectorAll(".save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      btn.disabled = true;
      try {
        const body = {
          precio: parseFloat(tr.querySelector(".precio").value) || 0,
          stock: Math.max(0, parseInt(tr.querySelector(".stock").value) || 0),
          imagen_url: tr.querySelector(".img").value.trim(),
        };
        const res = await fetch(`/api/admin/variant/${tr.dataset.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store"
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "No se pudo guardar");
        toast("Guardado y disponible en la tienda");
      } catch (e) { toast(e.message, true); }
      finally { btn.disabled = false; }
    });
  });
}

async function diagnostico() {
  const box = document.getElementById("syncStatus");
  if (!box) return;
  box.textContent = "Comprobando…";
  try {
    const r = await fetch("/api/admin/catalog-status", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    const ok = d.products_without_variant === 0 && d.orphan_variants === 0;
    box.textContent = ok
      ? `✓ Sincronización estructural OK · ${d.storefront_products} productos / ${d.storefront_variants} variantes visibles en la tienda`
      : `⚠ Revisar catálogo · ${d.products_without_variant} productos sin variante · ${d.orphan_variants} variantes huérfanas`;
    box.style.color = ok ? "var(--ok)" : "var(--warn)";
  } catch (e) { box.textContent = "✖ " + e.message; box.style.color = "#c0492f"; }
}

// ----- alta / edición completa de producto -----
const productForm = document.getElementById("productForm");
if (productForm) productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = productForm.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Guardando…";
  const fd = new FormData(productForm);
  const body = Object.fromEntries(fd.entries());
  body.type_id = Number(body.type_id);
  try {
    const r = await fetch("/api/admin/product", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "No se pudo guardar");
    toast(`✓ Producto guardado · ${d.storefront_total} visibles en la tienda`);
    productForm.reset();
    await load(); await loadCatalogMeta(); await diagnostico();
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = "Guardar y publicar en la tienda"; }
});

// ----- consultas -----
async function loadConsultas() {
  const box = document.getElementById("consultas");
  if (!box) return;
  try {
    const rows = await fetch("/api/admin/consultas", { cache: "no-store" }).then((r) => r.json());
    if (!Array.isArray(rows) || !rows.length) { box.innerHTML = `<div class="cq" style="color:var(--ink-faint)">Todavía no hay consultas.</div>`; return; }
    const fdate = (d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    box.innerHTML = rows.map((c) => `<div class="cq"><div class="cq-top"><b>${esc(c.nombre)}</b><span class="cq-meta">${fdate(c.created_at)}</span></div>${c.tipo_proyecto ? `<span class="tp">${esc(c.tipo_proyecto)}</span>` : ""}<div class="cq-meta">${[c.email, c.telefono].filter(Boolean).map(esc).join(" · ") || "sin contacto"}</div>${c.mensaje ? `<p class="msg">${esc(c.mensaje)}</p>` : ""}</div>`).join("");
  } catch { box.innerHTML = `<div class="cq" style="color:var(--ink-faint)">No se pudieron cargar las consultas.</div>`; }
}

// ----- reseed: queda como herramienta técnica, claramente separada -----
const reseedBtn = document.getElementById("reseed");
if (reseedBtn) reseedBtn.addEventListener("click", async () => {
  if (!confirm("ATENCIÓN: esto reemplaza el catálogo completo y puede borrar cambios manuales. ¿Continuar?")) return;
  const msg = document.getElementById("reseedMsg");
  reseedBtn.disabled = true; reseedBtn.textContent = "Recargando…"; msg.textContent = "";
  try {
    const r = await fetch("/api/admin/reseed", { method: "POST", cache: "no-store" });
    const d = await r.json();
    if (r.ok) { msg.textContent = `✓ ${d.productos ?? ""} productos cargados`; await load(); await loadCatalogMeta(); await diagnostico(); }
    else msg.textContent = "✖ " + (d.error || "error") + (d.detalle ? " — " + d.detalle : "");
  } catch { msg.textContent = "✖ Error de conexión."; }
  finally { reseedBtn.disabled = false; reseedBtn.textContent = "Recargar catálogo base"; }
});

Promise.all([loadCatalogMeta(), load(), loadConsultas(), diagnostico()]).catch(e => toast(e.message, true));
