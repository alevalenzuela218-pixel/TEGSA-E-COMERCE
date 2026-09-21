// ================= ERP TEGSA =================
const ars = (n) => Number(n) > 0
  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
  : "—";
const pct = (r) => (r * 100).toFixed(1) + "%";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Comprime una imagen en el navegador → data URL liviano (para guardar en la base)
function compressImage(file, max = 520, quality = 0.68) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width >= height && width > max) { height = Math.round(height * max / width); width = max; }
      else if (height > max) { width = Math.round(width * max / height); height = max; }
      const c = document.createElement("canvas"); c.width = width; c.height = height;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    const rd = new FileReader(); rd.onload = () => { img.src = rd.result; }; rd.onerror = reject; rd.readAsDataURL(file);
  });
}
const $ = (id) => document.getElementById(id);
const api = (url, opts) => fetch(url, opts).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Error"); return d; });
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2200); }
function openModal(html) { $("modalContent").innerHTML = html; $("overlay").classList.add("on"); }
function closeModal() { $("overlay").classList.remove("on"); }
$("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });

const MAIN = $("erpMain");
const sections = {};

// -------- router --------
$("erpNav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sec]"); if (!b) return;
  document.querySelectorAll("#erpNav button").forEach((x) => x.classList.toggle("active", x === b));
  render(b.dataset.sec);
});
function render(sec) { MAIN.innerHTML = `<p class="an-sub">Cargando…</p>`; (sections[sec] || sections.resumen)(); }

// ================= RESUMEN =================
sections.resumen = async () => {
  try {
    const [fin, stock, pipe, diag] = await Promise.all([
      api("/api/admin/finanzas"), api("/api/admin/stock"), api("/api/admin/pipeline"), api("/api/admin/catalog-status").catch(() => ({})),
    ]);
    const ventas = pipe.orders.length, leads = pipe.consultas.length;
    MAIN.innerHTML = `
      <h1 class="erp-h1">Resumen</h1>
      <div class="kpis">
        <div class="kpi"><div class="n">${stock.resumen.variantes}</div><div class="l">Productos activos</div></div>
        <div class="kpi"><div class="n">${stock.resumen.unidades}</div><div class="l">Unidades en stock</div></div>
        <div class="kpi"><div class="n">${ventas}</div><div class="l">Pedidos</div></div>
        <div class="kpi"><div class="n">${leads}</div><div class="l">Consultas / leads</div></div>
      </div>
      <div class="kpis">
        <div class="kpi ok"><div class="n">${ars(stock.resumen.valor_costo)}</div><div class="l">Valor de stock (a costo)</div></div>
        <div class="kpi"><div class="n">${ars(stock.resumen.valor_venta)}</div><div class="l">Valor de stock (a venta)</div></div>
        <div class="kpi"><div class="n">${fin.margen_promedio ? pct(fin.margen_promedio) : "—"}</div><div class="l">Margen promedio</div></div>
        <div class="kpi warn"><div class="n">${fin.punto_equilibrio_facturacion ? ars(fin.punto_equilibrio_facturacion) : "—"}</div><div class="l">Punto de equilibrio / mes</div></div>
      </div>
      ${stock.resumen.bajo_stock ? `<div class="alert">⚠ ${stock.resumen.bajo_stock} productos con stock bajo y ${stock.resumen.sin_stock} sin stock.</div>` : ""}
      <p class="an-sub">${diag.ok ? `✓ Sincronización OK · ${diag.storefront_products} productos visibles en la tienda.` : ""}</p>`;
  } catch (e) { MAIN.innerHTML = `<p class="alert">No se pudo cargar el resumen: ${esc(e.message)}</p>`; }
};

// ================= PRODUCTOS Y PRECIOS =================
sections.productos = async () => {
  try {
    const [rows, provs] = await Promise.all([api("/api/admin/products"), api("/api/admin/proveedores")]);
    const provOpts = (sel) => `<option value="">— proveedor —</option>` +
      provs.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.nombre)}</option>`).join("");
    MAIN.innerHTML = `
      <div class="erp-head"><h1 class="erp-h1">Productos y precios</h1>
        <div class="erp-actions">
          <button class="btn" id="btnNew">+ Nuevo producto</button>
          <button class="btn ghost" id="btnReseed">Cargar catálogo base</button>
        </div></div>
      <p class="an-sub">Cargá el <b>costo</b> (precio de lista del proveedor) y el <b>% de ganancia</b>: el precio de venta se calcula solo. <span id="msg"></span></p>
      <div class="tbl-wrap"><table class="erp-tbl">
        <thead><tr><th>Producto</th><th>Foto</th><th>Proveedor</th><th>Costo</th><th>% Gan.</th><th>Precio venta</th><th>Gan. $</th><th>Stock</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>`;
    const tb = $("rows");
    tb.innerHTML = rows.map((r) => {
      const costo = r.costo != null ? Number(r.costo) : "", mg = r.margen_pct != null ? Number(r.margen_pct) : "";
      const gan = (r.costo && r.precio) ? (Number(r.precio) - Number(r.costo)) : 0;
      return `<tr data-id="${r.variant_id}">
        <td><b>${esc(r.nombre)}</b><br><span class="sk">${esc(r.sku)} · ${esc(r.tipo)}</span></td>
        <td><label class="imgcell" title="Subir foto (se comprime sola)">
          <img class="thumb" src="${r.imagen_url ? esc(r.imagen_url) : "/img/favicon.png"}" alt="">
          <span class="imgcam">📷</span>
          <input class="imgfile" type="file" accept="image/*" hidden>
          <input class="imgurl" type="hidden" value="${esc(r.imagen_url || "")}">
        </label></td>
        <td><select class="in prov">${provOpts(r.proveedor_id)}</select></td>
        <td><input class="in num costo" type="number" step="0.01" value="${costo}"></td>
        <td><input class="in num sm margen" type="number" step="0.1" value="${mg}"></td>
        <td><input class="in num precio" type="number" step="0.01" value="${r.precio != null ? Number(r.precio) : ""}"></td>
        <td class="gan">${ars(gan)}</td>
        <td><input class="in num sm stock" type="number" value="${r.stock_qty}"></td>
        <td><button class="btn xs save">Guardar</button></td></tr>`;
    }).join("");
    // recálculo de precio al cambiar costo/margen
    tb.addEventListener("input", (e) => {
      if (!e.target.classList.contains("costo") && !e.target.classList.contains("margen")) return;
      const tr = e.target.closest("tr");
      const c = parseFloat(tr.querySelector(".costo").value), m = parseFloat(tr.querySelector(".margen").value);
      if (!isNaN(c) && !isNaN(m)) { const p = Math.round(c * (1 + m / 100) * 100) / 100; tr.querySelector(".precio").value = p; tr.querySelector(".gan").textContent = ars(p - c); }
    });
    // subida de imagen con compresión
    tb.querySelectorAll(".imgfile").forEach((inp) => inp.addEventListener("change", async () => {
      if (!inp.files || !inp.files[0]) return;
      try {
        const durl = await compressImage(inp.files[0]);
        const cell = inp.closest(".imgcell");
        cell.querySelector(".thumb").src = durl;
        cell.querySelector(".imgurl").value = durl;
        toast("Imagen lista — apretá Guardar");
      } catch { toast("No se pudo procesar la imagen"); }
    }));
    tb.querySelectorAll(".save").forEach((btn) => btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const body = {
        costo: tr.querySelector(".costo").value, margen_pct: tr.querySelector(".margen").value,
        precio: tr.querySelector(".precio").value, stock: tr.querySelector(".stock").value,
        proveedor_id: tr.querySelector(".prov").value,
        imagen_url: tr.querySelector(".imgurl").value || "",
      };
      try { await api(`/api/admin/variant/${tr.dataset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); toast("Guardado ✓"); }
      catch (err) { toast("Error: " + err.message); }
    }));
    $("btnNew").onclick = formNuevoProducto;
    $("btnReseed").onclick = reseed;
  } catch (e) { MAIN.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
};

async function reseed() {
  if (!confirm("Esto (re)carga el catálogo base (423 productos). ¿Continuar?")) return;
  $("msg").textContent = "Cargando…";
  try { const d = await api("/api/admin/reseed", { method: "POST" }); $("msg").textContent = `✓ ${d.productos} productos cargados`; sections.productos(); }
  catch (e) { $("msg").textContent = "✖ " + e.message; }
}

async function formNuevoProducto() {
  const meta = await api("/api/admin/catalog-meta").catch(() => ({ tipos: [] }));
  const tipos = (meta.tipos || meta || []);
  openModal(`<div class="fm-head"><h2>Nuevo producto</h2></div>
    <div class="fm-body">
      <div class="fld full"><label>Nombre *</label><input id="n-nombre"></div>
      <div class="fld"><label>SKU *</label><input id="n-sku"></div>
      <div class="fld"><label>Marca</label><input id="n-marca" value="TEGSA"></div>
      <div class="fld"><label>Categoría</label><select id="n-type">${(Array.isArray(tipos) ? tipos : []).map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("")}</select></div>
      <div class="fld"><label>Ubicación</label><select id="n-ubic"><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="interior_exterior">Interior-Exterior</option></select></div>
      <div class="fld"><label>Estado</label><select id="n-status"><option value="activo">Activo (visible)</option><option value="borrador">Borrador</option></select></div>
      <div class="fld"><label>Costo (lista prov.)</label><input id="n-costo" type="number" step="0.01"></div>
      <div class="fld"><label>% Ganancia</label><input id="n-margen" type="number" step="0.1"></div>
      <div class="fld"><label>Potencia (W)</label><input id="n-w" type="number"></div>
      <div class="fld"><label>Temp. (K)</label><input id="n-k" type="number"></div>
      <div class="fld"><label>IP</label><input id="n-ip" type="number"></div>
    </div>
    <div class="fm-foot"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn" id="n-save">Guardar y publicar</button></div>`);
  $("n-save").onclick = async () => {
    const costo = parseFloat($("n-costo").value), mg = parseFloat($("n-margen").value);
    const precio = (!isNaN(costo) && !isNaN(mg)) ? Math.round(costo * (1 + mg / 100) * 100) / 100 : 0;
    const body = {
      sku: $("n-sku").value.trim(), nombre: $("n-nombre").value.trim(), marca: $("n-marca").value.trim(),
      type_id: parseInt($("n-type").value), ubicacion: $("n-ubic").value, status: $("n-status").value,
      costo: isNaN(costo) ? null : costo, margen_pct: isNaN(mg) ? null : mg, precio,
      potencia_w: parseInt($("n-w").value) || null, temp_kelvin: parseInt($("n-k").value) || null, ip: parseInt($("n-ip").value) || null,
    };
    if (!body.sku || !body.nombre) { toast("Falta SKU o nombre"); return; }
    try { await api("/api/admin/product", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); closeModal(); toast("Producto publicado ✓"); sections.productos(); }
    catch (e) { toast("Error: " + e.message); }
  };
}

// ================= PROVEEDORES =================
sections.proveedores = async () => {
  try {
    const rows = await api("/api/admin/proveedores");
    MAIN.innerHTML = `
      <div class="erp-head"><h1 class="erp-h1">Proveedores</h1>
        <div class="erp-actions"><button class="btn" id="btnNewProv">+ Nuevo proveedor</button></div></div>
      <div class="tbl-wrap"><table class="erp-tbl">
        <thead><tr><th>Nombre</th><th>Contacto</th><th>Email</th><th>Teléfono</th><th>Productos</th><th></th></tr></thead>
        <tbody>${rows.map((p) => `<tr>
          <td><b>${esc(p.nombre)}</b></td><td>${esc(p.contacto || "—")}</td><td>${esc(p.email || "—")}</td>
          <td>${esc(p.telefono || "—")}</td><td>${p.productos}</td>
          <td><button class="btn xs ghost" data-edit='${esc(JSON.stringify(p))}'>Editar</button>
              <button class="btn xs del" data-del="${p.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="an-sub">Sin proveedores todavía.</td></tr>`}
        </tbody></table></div>`;
    $("btnNewProv").onclick = () => formProveedor();
    MAIN.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => formProveedor(JSON.parse(b.dataset.edit)));
    MAIN.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("¿Eliminar proveedor?")) return;
      try { await api(`/api/admin/proveedores/${b.dataset.del}`, { method: "DELETE" }); toast("Eliminado"); sections.proveedores(); } catch (e) { toast(e.message); }
    });
  } catch (e) { MAIN.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
};
function formProveedor(p = {}) {
  openModal(`<div class="fm-head"><h2>${p.id ? "Editar" : "Nuevo"} proveedor</h2></div>
    <div class="fm-body">
      <div class="fld full"><label>Nombre *</label><input id="p-nombre" value="${esc(p.nombre || "")}"></div>
      <div class="fld"><label>Contacto</label><input id="p-contacto" value="${esc(p.contacto || "")}"></div>
      <div class="fld"><label>Teléfono</label><input id="p-tel" value="${esc(p.telefono || "")}"></div>
      <div class="fld full"><label>Email</label><input id="p-email" value="${esc(p.email || "")}"></div>
      <div class="fld full"><label>Notas</label><textarea id="p-notas">${esc(p.notas || "")}</textarea></div>
    </div>
    <div class="fm-foot"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn" id="p-save">Guardar</button></div>`);
  $("p-save").onclick = async () => {
    const body = { nombre: $("p-nombre").value.trim(), contacto: $("p-contacto").value.trim(), email: $("p-email").value.trim(), telefono: $("p-tel").value.trim(), notas: $("p-notas").value.trim() };
    if (!body.nombre) { toast("Falta el nombre"); return; }
    try { await api(p.id ? `/api/admin/proveedores/${p.id}` : "/api/admin/proveedores", { method: p.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); closeModal(); toast("Guardado ✓"); sections.proveedores(); }
    catch (e) { toast(e.message); }
  };
}

// ================= STOCK =================
sections.stock = async () => {
  try {
    const d = await api("/api/admin/stock"); const r = d.resumen;
    MAIN.innerHTML = `
      <h1 class="erp-h1">Stock</h1>
      <div class="kpis">
        <div class="kpi"><div class="n">${r.unidades}</div><div class="l">Unidades totales</div></div>
        <div class="kpi warn"><div class="n">${r.bajo_stock}</div><div class="l">Bajo stock (&lt;10)</div></div>
        <div class="kpi warn"><div class="n">${r.sin_stock}</div><div class="l">Sin stock</div></div>
        <div class="kpi ok"><div class="n">${ars(r.valor_costo)}</div><div class="l">Valor a costo</div></div>
      </div>
      <div class="cols2">
        <div class="card-box"><h3>Reponer pronto</h3>${d.bajo_stock.length ? `<table class="erp-tbl mini"><tbody>${d.bajo_stock.map((x) => `<tr><td>${esc(x.nombre)}<br><span class="sk">${esc(x.sku)}</span></td><td class="r"><b class="${x.stock_qty === 0 ? "red" : "amber"}">${x.stock_qty}</b> u.</td></tr>`).join("")}</tbody></table>` : `<p class="an-sub">Todo con stock suficiente.</p>`}</div>
        <div class="card-box"><h3>Últimos movimientos</h3><table class="erp-tbl mini"><tbody>${d.movimientos.map((m) => `<tr><td>${esc(m.nombre)}<br><span class="sk">${esc(m.reason)}</span></td><td class="r"><b class="${m.quantity < 0 ? "red" : "green"}">${m.quantity > 0 ? "+" : ""}${m.quantity}</b></td></tr>`).join("") || `<tr><td class="an-sub">Sin movimientos.</td></tr>`}</tbody></table></div>
      </div>`;
  } catch (e) { MAIN.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
};

// ================= VENTAS (PIPELINE) =================
const EST = ["pendiente", "pagado", "en_preparacion", "enviado", "entregado", "cancelado"];
const ESTLBL = { pendiente: "Pendiente", pagado: "Pagado", en_preparacion: "En preparación", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };
sections.ventas = async () => {
  try {
    const d = await api("/api/admin/pipeline");
    const cols = EST.map((e) => ({ e, orders: d.orders.filter((o) => o.status === e) }));
    MAIN.innerHTML = `
      <h1 class="erp-h1">Ventas — pipeline</h1>
      <div class="pipeline">${cols.map((c) => `
        <div class="pcol"><div class="pcol-h">${ESTLBL[c.e]} <span>${c.orders.length}</span></div>
          ${c.orders.map((o) => `<div class="pcard">
            <div class="pc-top"><b>${ars(o.total)}</b><span class="ch">${esc(o.channel)}</span></div>
            <div class="pc-cli">${esc(o.cliente_nombre || "—")}</div>
            <select class="in xs pstatus" data-id="${o.id}">${EST.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${ESTLBL[s]}</option>`).join("")}</select>
          </div>`).join("")}
        </div>`).join("")}</div>
      <h2 class="erp-h2">Consultas de asesoramiento (leads)</h2>
      <div class="tbl-wrap"><table class="erp-tbl"><thead><tr><th>Nombre</th><th>Proyecto</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>${d.consultas.map((c) => `<tr><td><b>${esc(c.nombre)}</b></td><td>${esc(c.tipo_proyecto || "—")}</td><td>${esc(c.estado)}</td><td>${new Date(c.created_at).toLocaleDateString("es-AR")}</td></tr>`).join("") || `<tr><td colspan="4" class="an-sub">Sin consultas.</td></tr>`}</tbody></table></div>`;
    MAIN.querySelectorAll(".pstatus").forEach((s) => s.onchange = async () => {
      try { await api(`/api/admin/order/${s.dataset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s.value }) }); toast("Pedido actualizado ✓"); sections.ventas(); }
      catch (e) { toast(e.message); }
    });
  } catch (e) { MAIN.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
};

// ================= FINANZAS / PUNTO DE EQUILIBRIO =================
sections.finanzas = async () => {
  try {
    const f = await api("/api/admin/finanzas");
    MAIN.innerHTML = `
      <h1 class="erp-h1">Finanzas · Punto de equilibrio</h1>
      <div class="card-box">
        <h3>Costos fijos mensuales</h3>
        <p class="an-sub">Alquiler, sueldos, servicios, etc. Es la base del cálculo de equilibrio.</p>
        <div class="inline"><input class="in" id="fijos" type="number" value="${f.costos_fijos || 0}"><button class="btn" id="saveFijos">Guardar</button></div>
      </div>
      <div class="kpis">
        <div class="kpi ok"><div class="n">${ars(f.stock_costo)}</div><div class="l">Stock a costo</div></div>
        <div class="kpi"><div class="n">${ars(f.stock_venta)}</div><div class="l">Stock a venta</div></div>
        <div class="kpi ok"><div class="n">${ars(f.ganancia_potencial)}</div><div class="l">Ganancia potencial</div></div>
        <div class="kpi"><div class="n">${f.margen_promedio ? pct(f.margen_promedio) : "—"}</div><div class="l">Margen promedio</div></div>
      </div>
      <div class="card-box highlight">
        <h3>Punto de equilibrio</h3>
        <p>Necesitás facturar <b class="big">${f.punto_equilibrio_facturacion ? ars(f.punto_equilibrio_facturacion) : "—"}</b> por mes para cubrir tus costos fijos.</p>
        <p class="an-sub">${f.con_costo === 0 ? "Cargá costos y % de ganancia en los productos para que el cálculo sea real." : `Calculado sobre ${f.con_costo} productos con costo cargado y un margen promedio de ${pct(f.margen_promedio)}.`}</p>
      </div>
      <div class="card-box">
        <h3>Simulador</h3>
        <div class="sim">
          <label>Costos fijos ($)<input class="in" id="s-fijos" type="number" value="${f.costos_fijos || 0}"></label>
          <label>Margen promedio (%)<input class="in" id="s-margen" type="number" value="${(f.margen_promedio * 100).toFixed(1)}"></label>
          <label>Ticket promedio ($)<input class="in" id="s-ticket" type="number" value="30000"></label>
        </div>
        <div class="sim-out" id="simOut"></div>
      </div>`;
    $("saveFijos").onclick = async () => {
      try { await api("/api/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costos_fijos_mensuales: $("fijos").value }) }); toast("Guardado ✓"); sections.finanzas(); }
      catch (e) { toast(e.message); }
    };
    const sim = () => {
      const fj = parseFloat($("s-fijos").value) || 0, mg = (parseFloat($("s-margen").value) || 0) / 100, tk = parseFloat($("s-ticket").value) || 0;
      const fact = mg > 0 ? fj / mg : 0, u = tk > 0 ? Math.ceil(fact / tk) : 0;
      $("simOut").innerHTML = mg > 0 ? `Para cubrir costos necesitás facturar <b>${ars(fact)}</b> por mes ≈ <b>${u}</b> ventas de ${ars(tk)}.` : `Ingresá un margen mayor a 0.`;
    };
    ["s-fijos", "s-margen", "s-ticket"].forEach((id) => $(id).addEventListener("input", sim)); sim();
  } catch (e) { MAIN.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
};

// arranque
window.closeModal = closeModal;
render("resumen");
