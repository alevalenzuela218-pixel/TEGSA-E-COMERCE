// Rutina de sincronización con Mercado Libre, compartida por el endpoint
// (que puede disparar n8n) y el worker por cron. Consume price.changed /
// stock.changed del outbox, resuelve el item_id de ML y actualiza la publicación.
import { updateItem, MLNoConfigurado } from "./mercadolibre.js";

export async function syncMercadoLibre(pool) {
  const { rows: eventos } = await pool.query(
    `SELECT id, event_type, aggregate_id FROM outbox_events
     WHERE status='pending' AND event_type IN ('price.changed','stock.changed')
     ORDER BY created_at LIMIT 50`);

  const resultados = [];
  for (const e of eventos) {
    const { rows } = await pool.query(
      `SELECT cl.id AS listing_id, cl.external_id AS item_id, v.precio, v.stock_qty
       FROM channel_listings cl JOIN product_variants v ON v.id = cl.variant_id
       WHERE cl.variant_id = $1 AND cl.channel = 'mercadolibre'
         AND cl.status = 'publicado' AND cl.external_id IS NOT NULL`, [e.aggregate_id]);

    if (!rows.length) {
      resultados.push({ event: e.event_type, estado: "omitido", motivo: "sin publicación en ML" });
    } else {
      const l = rows[0];
      try {
        const r = await updateItem(l.item_id, { price: l.precio, available_quantity: l.stock_qty });
        if (r.ok) {
          await pool.query(`UPDATE channel_listings SET last_synced_at=now(), sync_error=NULL WHERE id=$1`, [l.listing_id]);
          resultados.push({ event: e.event_type, item: l.item_id, estado: "sincronizado", precio: l.precio, stock: l.stock_qty });
        } else {
          await pool.query(`UPDATE channel_listings SET sync_error=$2 WHERE id=$1`, [l.listing_id, `HTTP ${r.status}`]);
          resultados.push({ event: e.event_type, item: l.item_id, estado: "error", status: r.status });
        }
      } catch (err) {
        if (err instanceof MLNoConfigurado) {
          resultados.push({ event: e.event_type, item: l.item_id, estado: "ml_no_configurado", precio: l.precio, stock: l.stock_qty });
        } else {
          resultados.push({ event: e.event_type, item: l.item_id, estado: "error", error: err.message });
        }
      }
    }
    await pool.query(`UPDATE outbox_events SET status='processed', processed_at=now() WHERE id=$1`, [e.id]);
  }
  return { procesados: eventos.length, resultados };
}
