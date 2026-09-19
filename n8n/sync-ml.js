// Sincroniza con Mercado Libre a partir del outbox. Escucha price.changed y
// stock.changed; para las variantes que tienen una publicación vinculada
// (channel_listings), manda a ML el precio + stock actuales en un solo PUT
// (obligatorio desde el 18/3/2026: no se puede actualizar solo price).
//
// La llamada real a ML se hace si hay ML_ACCESS_TOKEN; si no, se imprime lo que
// se enviaría (para poder probar toda la lógica sin credenciales).
import { pool } from "../src/db.js";

const ML_BASE = "https://api.mercadolibre.com";

async function putItemML(itemId, precio, disponible) {
  const body = { price: Number(precio), available_quantity: Number(disponible) };
  if (!process.env.ML_ACCESS_TOKEN) {
    console.log(`  🔸 (simulado) PUT ${ML_BASE}/items/${itemId}  ${JSON.stringify(body)}`);
    return { ok: true, simulated: true };
  }
  const r = await fetch(`${ML_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ML_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `ML ${r.status}`);
  // ML puede devolver un warning si el precio está bajo automatización (se ignora)
  return { ok: true, warnings: data.warnings || null };
}

async function main() {
  // eventos de precio/stock pendientes
  const { rows: events } = await pool.query(
    `SELECT id, aggregate_id AS variant_id FROM outbox_events
     WHERE status = 'pending' AND event_type IN ('price.changed','stock.changed')
     ORDER BY created_at LIMIT 200`);
  console.log(`Eventos precio/stock pendientes: ${events.length}`);
  if (!events.length) { await pool.end(); return; }

  // variantes afectadas con publicación en ML (valores actuales desde la base)
  const variantIds = [...new Set(events.map((e) => e.variant_id))];
  const { rows: links } = await pool.query(
    `SELECT v.id AS variant_id, cl.external_id AS item_id,
            v.precio, (v.stock_qty - v.reservado_qty) AS disponible, p.nombre
     FROM product_variants v
     JOIN channel_listings cl ON cl.variant_id = v.id
       AND cl.channel = 'mercadolibre' AND cl.status = 'publicado'
     JOIN products p ON p.id = v.product_id
     WHERE v.id = ANY($1)`, [variantIds]);

  const byVariant = Object.fromEntries(links.map((l) => [l.variant_id, l]));
  let sincronizados = 0;

  for (const l of links) {
    try {
      console.log(`  📤 ${l.nombre} → ML ${l.item_id}  ($${l.precio} · stock ${l.disponible})`);
      const res = await putItemML(l.item_id, l.precio, l.disponible);
      await pool.query(
        `UPDATE channel_listings SET last_synced_at = now(), sync_error = NULL
         WHERE variant_id = $1 AND channel = 'mercadolibre'`, [l.variant_id]);
      if (res.warnings) console.log("     ⚠ warning ML:", JSON.stringify(res.warnings));
      sincronizados++;
    } catch (e) {
      console.error(`     ✖ error sincronizando ${l.item_id}: ${e.message}`);
      await pool.query(
        `UPDATE channel_listings SET sync_error = $2, status = 'error'
         WHERE variant_id = $1 AND channel = 'mercadolibre'`, [l.variant_id, e.message]);
    }
  }

  // marcar procesados TODOS los eventos de precio/stock (los sin publicación,
  // simplemente no tienen nada que sincronizar)
  const ids = events.map((e) => e.id);
  await pool.query(`UPDATE outbox_events SET status='processed', processed_at=now() WHERE id = ANY($1)`, [ids]);

  const sinLink = variantIds.filter((v) => !byVariant[v]).length;
  console.log(`Sincronizados en ML: ${sincronizados} · Variantes sin publicación (omitidas): ${sinLink} · Eventos procesados: ${ids.length}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
