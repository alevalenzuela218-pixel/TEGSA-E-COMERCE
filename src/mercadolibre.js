// Cliente de Mercado Libre: maneja el refresh del token (con rotación del
// refresh_token, que ML cambia en cada refresh) y la actualización de ítems.
// Los tokens viven en la tabla `integraciones` (proveedor='mercadolibre').
import { pool } from "./db.js";

const ML = "https://api.mercadolibre.com";

export class MLNoConfigurado extends Error {}

async function getConfig() {
  const { rows } = await pool.query(
    "SELECT * FROM integraciones WHERE proveedor='mercadolibre'");
  if (!rows.length || !rows[0].refresh_token || !rows[0].client_id)
    throw new MLNoConfigurado("Mercado Libre no está configurado (faltan credenciales/token).");
  return rows[0];
}

// Devuelve un access_token válido, refrescándolo si venció.
export async function getAccessToken() {
  const c = await getConfig();
  const vigente = c.access_token && c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 60000;
  if (vigente) return c.access_token;

  const res = await fetch(`${ML}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: c.client_id,
      client_secret: c.client_secret,
      refresh_token: c.refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Refresh de token ML falló: ${data.message || res.status}`);

  // ML rota el refresh_token en cada uso: hay que persistir el nuevo.
  await pool.query(
    `UPDATE integraciones SET access_token=$1, refresh_token=$2,
      expires_at=now() + ($3 || ' seconds')::interval, user_id=$4, actualizado=now()
     WHERE proveedor='mercadolibre'`,
    [data.access_token, data.refresh_token, String(data.expires_in || 21600), String(data.user_id || c.user_id || "")]);
  return data.access_token;
}

// Actualiza un ítem. Enviamos precio y stock juntos: así evitamos el rechazo
// (desde 18/03/2026 un PUT con SOLO price da 400). Si el ítem tiene
// automatización de precios, ML ignora el price y devuelve un warning.
export async function updateItem(itemId, { price, available_quantity }) {
  const token = await getAccessToken();
  const body = {};
  if (price != null) body.price = Number(price);
  if (available_quantity != null) body.available_quantity = Math.max(0, parseInt(available_quantity));
  const res = await fetch(`${ML}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
