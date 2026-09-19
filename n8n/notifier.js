// Consumidor de referencia del outbox: hace lo mismo que el workflow de n8n
// (traer pendientes → armar aviso → notificar → marcar procesado). Sirve para
// (a) demostrar que el consumo funciona y (b) como alternativa por cron si no
// querés depender de n8n. La "notificación" acá se imprime por consola; en n8n
// va a Gmail / WhatsApp / Telegram.
import { pool } from "../src/db.js";

function armarAviso(e) {
  const p = e.payload || {};
  if (e.event_type === "order.created") {
    return {
      asunto: `🛒 Nueva venta — Pedido ${String(e.aggregate_id).slice(0, 8)}`,
      cuerpo: `Cliente: ${p.cliente_nombre || "-"} | Total: $${p.total || "-"} | Canal: ${p.channel || "web"}`,
    };
  }
  if (e.event_type === "consulta.created") {
    return {
      asunto: `💡 Nueva consulta — ${p.nombre || ""}`,
      cuerpo: `Contacto: ${[p.email, p.telefono].filter(Boolean).join(" · ") || "-"} | Tipo: ${p.tipo_proyecto || "-"}`,
    };
  }
  return null; // stock.changed / price.changed: no se notifican (los usa otro flujo)
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, event_type, aggregate_id, payload FROM outbox_events
     WHERE status = 'pending' AND event_type IN ('order.created','consulta.created')
     ORDER BY created_at LIMIT 50`);
  console.log(`Eventos pendientes: ${rows.length}`);

  let avisos = 0;
  for (const e of rows) {
    const aviso = armarAviso(e);
    if (aviso) {
      console.log(`  📣 ${aviso.asunto}\n     ${aviso.cuerpo}`);
      avisos++;
      // Acá iría el envío real (email / WhatsApp / Telegram).
    }
    await pool.query(
      `UPDATE outbox_events SET status='processed', processed_at=now() WHERE id=$1`, [e.id]);
  }
  console.log(`Procesados: ${rows.length} · Avisos enviados: ${avisos}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
