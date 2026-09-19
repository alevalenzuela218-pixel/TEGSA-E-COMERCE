import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { q, pool } from "./db.js";
import { syncMercadoLibre } from "./sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const bandExpr = `CASE WHEN v.temp_kelvin IS NULL THEN NULL
  WHEN v.temp_kelvin <= 3200 THEN 'calida'
  WHEN v.temp_kelvin <= 4500 THEN 'neutra' ELSE 'fria' END`;

// ---------- STOREFRONT API ----------
app.get("/api/products", async (req, res) => {
  try {
    const { ubicacion, tipo, temp, ip, q: search, min, max, sort } = req.query;
    const where = ["p.status = 'activo'", "v.activo = true"];
    const args = [];
    const add = (cond, val) => { args.push(val); where.push(cond.replace("$?", "$" + args.length)); };

    if (ubicacion) add("(p.ubicacion = $? OR p.ubicacion = 'interior_exterior')", ubicacion);
    if (tipo) add("t.slug = $?", tipo);
    if (ip) add("v.ip >= $?", parseInt(ip));
    if (min) add("v.precio >= $?", parseFloat(min));
    if (max) add("v.precio <= $?", parseFloat(max));
    if (search) { args.push(`%${search}%`); const i = "$" + args.length; where.push(`(p.nombre ILIKE ${i} OR p.sku_base ILIKE ${i})`); }
    if (temp) { args.push(temp); where.push(`${bandExpr} = $${args.length}`); }

    const order = { pasc: "v.precio ASC", pdesc: "v.precio DESC", wdesc: "v.potencia_w DESC NULLS LAST" }[sort] || "p.marca, p.nombre";

    const sql = `
      SELECT p.id, p.sku_base AS sku, p.nombre, p.marca, p.ubicacion, p.descripcion,
             t.nombre AS tipo, t.slug AS tipo_slug, v.id AS variant_id,
             v.precio, v.potencia_w, v.flujo_lm, v.temp_kelvin, v.ip,
             v.tension_v, v.stock_qty, v.nombre AS variante, v.imagen_url, ${bandExpr} AS temp_band
      FROM products p
      JOIN product_types t ON t.id = p.type_id
      JOIN product_variants v ON v.product_id = p.id
      WHERE ${where.join(" AND ")}
      ORDER BY ${order}
      LIMIT 500`;
    const { rows } = await q(sql, args);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo cargar el catálogo." });
  }
});

// filtros disponibles (tipos + rango de precio)
app.get("/api/meta", async (_req, res) => {
  try {
    const tipos = await q(`SELECT t.slug, t.nombre, COUNT(*)::int AS n
      FROM products p JOIN product_types t ON t.id=p.type_id
      WHERE p.status<>'archivado' GROUP BY t.slug,t.nombre ORDER BY n DESC`);
    const ubic = await q(`SELECT p.ubicacion, COUNT(*)::int AS n FROM products p
      WHERE p.status<>'archivado' GROUP BY p.ubicacion`);
    const total = await q(`SELECT COUNT(*)::int AS n FROM products WHERE status='activo' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.activo=true)`);
    res.json({ tipos: tipos.rows, ubicaciones: ubic.rows, total: total.rows[0]?.n || 0 });
  } catch (e) {
    res.status(500).json({ error: "meta" });
  }
});

// ---------- PEDIDOS (público) ----------
// Crea un pedido web con sus ítems. El trigger de la tabla orders emite
// 'order.created' al outbox → punto de entrada para n8n. El descuento de stock
// va por el ledger (stock_movements) y emite 'stock.changed'. El cobro se hace
// con Mercado Pago (Checkout Pro): no guardamos datos de tarjeta.

async function mpPreference(orderId, lines, cliente, req) {
  const base = `${req.protocol}://${req.get("host")}`;
  const body = {
    items: lines.map((l) => ({ title: l.nombre, quantity: l.cantidad, unit_price: l.precio, currency_id: "ARS" })),
    external_reference: String(orderId),
    payer: cliente.email ? { email: cliente.email, name: cliente.nombre } : undefined,
    back_urls: {
      success: `${base}/gracias?order=${orderId}`,
      pending: `${base}/gracias?order=${orderId}`,
      failure: `${base}/checkout`,
    },
    auto_return: "approved",
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Error creando preferencia de Mercado Pago");
  return data.init_point;
}

app.post("/api/orders", async (req, res) => {
  const { cliente = {}, items = [] } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "El pedido no tiene ítems." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = items.map((i) => i.variant_id);
    const { rows: vs } = await client.query(
      `SELECT v.id, v.precio, v.stock_qty, p.nombre
       FROM product_variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = ANY($1)`, [ids]);
    const byId = Object.fromEntries(vs.map((v) => [v.id, v]));

    let total = 0; const lines = [];
    for (const i of items) {
      const v = byId[i.variant_id];
      const qty = Math.max(1, parseInt(i.cantidad) || 1);
      if (!v) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Producto inexistente en el pedido." }); }
      if (v.stock_qty < qty) { await client.query("ROLLBACK"); return res.status(409).json({ error: `Sin stock suficiente de ${v.nombre}.` }); }
      total += Number(v.precio) * qty;
      lines.push({ variant_id: v.id, nombre: v.nombre, precio: Number(v.precio), cantidad: qty });
    }

    const o = await client.query(
      `INSERT INTO orders(channel,status,cliente_nombre,cliente_email,cliente_telefono,cliente_doc,total)
       VALUES('web','pendiente',$1,$2,$3,$4,$5) RETURNING id`,
      [cliente.nombre || null, cliente.email || null, cliente.telefono || null, cliente.doc || null, total]);
    const orderId = o.rows[0].id;

    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items(order_id,variant_id,cantidad,precio_unit) VALUES($1,$2,$3,$4)`,
        [orderId, l.variant_id, l.cantidad, l.precio]);
      await client.query(
        `INSERT INTO stock_movements(variant_id,quantity,reason,channel,reference)
         VALUES($1,$2,'venta','web',$3)`, [l.variant_id, -l.cantidad, String(orderId)]);
    }
    await client.query("COMMIT");

    let checkoutUrl = null;
    if (process.env.MP_ACCESS_TOKEN && total > 0) {
      try { checkoutUrl = await mpPreference(orderId, lines, cliente, req); }
      catch (e) { console.error("Mercado Pago:", e.message); }
    }
    res.json({ ok: true, order_id: orderId, total, checkoutUrl });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "No se pudo registrar el pedido." });
  } finally {
    client.release();
  }
});

// resumen de un pedido (para la página de gracias)
app.get("/api/order/:id", async (req, res) => {
  try {
    const o = await q(`SELECT id,status,total,moneda,created_at,cliente_nombre FROM orders WHERE id=$1`, [req.params.id]);
    if (!o.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    const items = await q(`
      SELECT oi.cantidad, oi.precio_unit, oi.subtotal, p.nombre, p.sku_base AS sku
      FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id
      JOIN products p ON p.id=v.product_id WHERE oi.order_id=$1`, [req.params.id]);
    res.json({ ...o.rows[0], items: items.rows });
  } catch (e) {
    res.status(500).json({ error: "No se pudo cargar el pedido." });
  }
});

// ficha de un producto (incluye atributos extra)
app.get("/api/product/:sku", async (req, res) => {
  try {
    const { rows } = await q(`
      SELECT p.sku_base AS sku, p.nombre, p.marca, p.ubicacion, p.descripcion,
             t.nombre AS tipo, v.id AS variant_id, v.precio, v.potencia_w, v.flujo_lm, v.temp_kelvin, v.ip,
             v.tension_v, v.stock_qty, v.nombre AS variante, v.atributos, v.imagen_url, ${bandExpr} AS temp_band
      FROM products p
      JOIN product_types t ON t.id = p.type_id
      JOIN product_variants v ON v.product_id = p.id
      WHERE p.sku_base = $1 AND p.status='activo' AND v.activo=true LIMIT 1`, [req.params.sku]);
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado" });
    q("UPDATE products SET vistas = vistas + 1 WHERE sku_base = $1", [req.params.sku]).catch(() => {});
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo cargar el producto." });
  }
});

app.get("/producto", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "producto.html")));

app.get("/checkout", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "checkout.html")));

app.get("/gracias", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "gracias.html")));

app.get("/asesoramiento", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "asesoramiento.html")));

// captación de leads (newsletter / ofertas)
app.post("/api/suscribir", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ error: "Email inválido" });
    await q(`INSERT INTO suscriptores(email) VALUES($1) ON CONFLICT (email) DO NOTHING`, [email]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo suscribir." });
  }
});

// registrar una consulta de asesoramiento / proyecto (dispara consulta.created)
app.post("/api/consultas", async (req, res) => {
  try {
    const { nombre, email, telefono, tipo_proyecto, mensaje } = req.body || {};
    if (!nombre || !(email || telefono))
      return res.status(400).json({ error: "Dejanos tu nombre y un medio de contacto." });
    const { rows } = await q(
      `INSERT INTO consultas(nombre,email,telefono,tipo_proyecto,mensaje)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [nombre, email || null, telefono || null, tipo_proyecto || null, mensaje || null]);
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo enviar la consulta." });
  }
});

// ---------- ADMIN (HTTP Basic) ----------
function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const [, b64] = hdr.split(" ");
  const [user, pass] = Buffer.from(b64 || "", "base64").toString().split(":");
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="TEGSA Admin"').status(401).send("Acceso privado");
}

app.get("/admin", auth, (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "admin.html")));

app.get("/api/admin/catalog-meta", auth, async (_req, res) => {
  try {
    const [types, stats] = await Promise.all([
      q(`SELECT id, slug, nombre FROM product_types ORDER BY nombre`),
      q(`SELECT
           (SELECT COUNT(*)::int FROM products WHERE status = 'activo' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.activo=true)) AS products,
           (SELECT COUNT(*)::int FROM product_variants WHERE activo=true) AS variants,
           (SELECT COUNT(*)::int FROM products WHERE status='activo' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.activo=true)) AS active_products,
           (SELECT COUNT(*)::int FROM products WHERE status='borrador') AS draft_products`)
    ]);
    res.json({ types: types.rows, stats: stats.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo cargar la información del catálogo." });
  }
});

// Crear/actualizar un producto desde el panel. Esta operación escribe en la
// MISMA base que consume /api/products; no existe una segunda copia del catálogo.
app.post("/api/admin/product", auth, async (req, res) => {
  const b = req.body || {};
  const required = ["sku", "nombre", "marca", "type_id", "ubicacion"];
  const missing = required.filter((k) => b[k] === undefined || b[k] === "");
  if (missing.length) return res.status(400).json({ error: `Faltan: ${missing.join(", ")}` });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT id FROM products WHERE sku_base=$1`, [String(b.sku).trim()]);
    let productId;
    if (existing.rows.length) {
      productId = existing.rows[0].id;
      await client.query(`UPDATE products SET nombre=$1, marca=$2, type_id=$3, ubicacion=$4,
        descripcion=$5, status=$6 WHERE id=$7`, [b.nombre, b.marca, b.type_id, b.ubicacion,
        b.descripcion || null, b.status || 'activo', productId]);
    } else {
      const p = await client.query(`INSERT INTO products(sku_base,nombre,marca,type_id,ubicacion,descripcion,status)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [String(b.sku).trim(), b.nombre, b.marca,
        b.type_id, b.ubicacion, b.descripcion || null, b.status || 'activo']);
      productId = p.rows[0].id;
    }

    const vr = await client.query(`SELECT id FROM product_variants WHERE sku=$1`, [String(b.sku).trim()]);
    const values = [productId, String(b.sku).trim(), b.variante || null, Number(b.precio || 0),
      b.potencia_w === '' || b.potencia_w == null ? null : Number(b.potencia_w),
      b.flujo_lm === '' || b.flujo_lm == null ? null : Number(b.flujo_lm),
      b.temp_kelvin === '' || b.temp_kelvin == null ? null : Number(b.temp_kelvin),
      b.ip === '' || b.ip == null ? null : Number(b.ip), b.tension_v || null,
      b.imagen_url || null, b.atributos || {}];
    let variantId;
    if (vr.rows.length) {
      variantId = vr.rows[0].id;
      await client.query(`UPDATE product_variants SET product_id=$1,nombre=$3,precio=$4,potencia_w=$5,
        flujo_lm=$6,temp_kelvin=$7,ip=$8,tension_v=$9,imagen_url=$10,atributos=$11,activo=true WHERE id=$2`,
        [productId, variantId, values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], JSON.stringify(values[10])]);
    } else {
      const v = await client.query(`INSERT INTO product_variants
        (product_id,sku,nombre,precio,potencia_w,flujo_lm,temp_kelvin,ip,tension_v,imagen_url,activo,atributos)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) RETURNING id`, values);
      variantId = v.rows[0].id;
    }
    await client.query("COMMIT");
    const check = await q(`SELECT COUNT(*)::int AS total FROM products WHERE status <> 'archivado'`);
    res.json({ ok: true, product_id: productId, variant_id: variantId, storefront_total: check.rows[0].total });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "No se pudo guardar el producto.", detalle: e.message });
  } finally { client.release(); }
});

// Diagnóstico de sincronización: confirma que el panel y la tienda consultan
// exactamente la misma base y devuelve diferencias imposibles/huérfanos.
app.get("/api/admin/catalog-status", auth, async (_req, res) => {
  try {
    const r = await q(`SELECT
      (SELECT COUNT(*) FROM products WHERE status = 'activo' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.activo=true))::int AS storefront_products,
      (SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id=v.product_id
         WHERE p.status = 'activo' AND v.activo=true)::int AS storefront_variants,
      (SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id))::int AS products_without_variant,
      (SELECT COUNT(*) FROM product_variants v WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id=v.product_id))::int AS orphan_variants`);
    res.json({ ok: true, ...r.rows[0], source: "postgresql-shared-catalog" });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "No se pudo diagnosticar el catálogo." });
  }
});

app.get("/api/admin/products", auth, async (_req, res) => {
  const { rows } = await q(`
    SELECT p.id, p.sku_base AS sku, p.nombre, p.marca, t.nombre AS tipo,
           v.id AS variant_id, v.precio, v.stock_qty, v.imagen_url
    FROM products p JOIN product_types t ON t.id=p.type_id
    JOIN product_variants v ON v.product_id=p.id
    ORDER BY p.marca, p.nombre LIMIT 1000`);
  res.json(rows);
});

// editar precio/stock: dispara los triggers de outbox (price.changed / stock via movimiento)
app.patch("/api/admin/variant/:id", auth, async (req, res) => {
  try {
    const { precio, stock, imagen_url } = req.body;
    if (precio != null)
      await q("UPDATE product_variants SET precio=$1 WHERE id=$2", [precio, req.params.id]);
    if (imagen_url !== undefined)
      await q("UPDATE product_variants SET imagen_url=$1 WHERE id=$2", [imagen_url || null, req.params.id]);
    if (stock != null) {
      const cur = await q("SELECT stock_qty FROM product_variants WHERE id=$1", [req.params.id]);
      const delta = parseInt(stock) - (cur.rows[0]?.stock_qty ?? 0);
      if (delta !== 0)
        await q(`INSERT INTO stock_movements(variant_id,quantity,reason) VALUES($1,$2,'ajuste')`,
          [req.params.id, delta]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo guardar." });
  }
});

// Cargar / recargar el catálogo (los 423 productos) a demanda desde el panel.
app.post("/api/admin/reseed", auth, async (_req, res) => {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync("node db/seed.js", { encoding: "utf8" });
    const m = out.match(/(\d+)\s+productos/);
    res.json({ ok: true, productos: m ? parseInt(m[1]) : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo cargar el catálogo.", detalle: String(e.stderr || e.message || "").slice(0, 400) });
  }
});

// ---------- ANALÍTICA (protegida) ----------
// Vincular una variante a una publicación de Mercado Libre (guarda el item_id).
app.post("/api/admin/ml-link", auth, async (req, res) => {
  try {
    const { variant_id, item_id } = req.body || {};
    if (!variant_id || !item_id) return res.status(400).json({ error: "Faltan variant_id o item_id" });
    await q(
      `INSERT INTO channel_listings(variant_id, channel, external_id, status)
       VALUES($1, 'mercadolibre', $2, 'publicado')
       ON CONFLICT (variant_id, channel)
       DO UPDATE SET external_id = EXCLUDED.external_id, status = 'publicado'`,
      [variant_id, item_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo vincular." });
  }
});

// Dispara la sincronización con Mercado Libre (lo puede llamar n8n vía HTTP).
app.post("/api/admin/sync-ml", auth, async (_req, res) => {
  try {
    const r = await syncMercadoLibre(pool);
    res.json(r);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Falló la sincronización con Mercado Libre." });
  }
});

app.get("/api/admin/consultas", auth, async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, nombre, email, telefono, tipo_proyecto, mensaje, estado, created_at
       FROM consultas ORDER BY created_at DESC LIMIT 200`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "No se pudieron cargar las consultas." });
  }
});

app.get("/admin/analytics", auth, (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "analytics.html")));

app.get("/api/admin/analytics", auth, async (_req, res) => {
  try {
    const ventasSub = `
      SELECT p.sku_base AS sku, p.nombre, p.marca,
             COALESCE(SUM(oi.cantidad),0)::int AS vendidos
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN order_items oi ON oi.variant_id = v.id
      GROUP BY p.id`;
    const [masVis, menosVis, masVen, menosVen, totals] = await Promise.all([
      q(`SELECT sku_base AS sku, nombre, marca, vistas FROM products WHERE vistas>0 ORDER BY vistas DESC, nombre LIMIT 8`),
      q(`SELECT sku_base AS sku, nombre, marca, vistas FROM products WHERE vistas>0 ORDER BY vistas ASC, nombre LIMIT 8`),
      q(`SELECT * FROM (${ventasSub}) s WHERE vendidos>0 ORDER BY vendidos DESC, nombre LIMIT 8`),
      q(`SELECT * FROM (${ventasSub}) s WHERE vendidos>0 ORDER BY vendidos ASC, nombre LIMIT 8`),
      q(`SELECT
           (SELECT COALESCE(SUM(vistas),0) FROM products)::int AS total_vistas,
           (SELECT COUNT(*) FROM products WHERE vistas=0)::int AS sin_vistas,
           (SELECT COALESCE(SUM(cantidad),0) FROM order_items)::int AS total_unidades,
           (SELECT COUNT(*) FROM orders)::int AS total_pedidos`),
    ]);
    res.json({
      mas_visitados: masVis.rows, menos_visitados: menosVis.rows,
      mas_vendidos: masVen.rows, menos_vendidos: menosVen.rows,
      totals: totals.rows[0],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo cargar la analítica." });
  }
});

// Health check para Render / monitoreo
app.get("/healthz", async (_req, res) => {
  try { await q("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false }); }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`TEGSA Iluminación escuchando en :${port}`));
