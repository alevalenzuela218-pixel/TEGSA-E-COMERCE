import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const url = process.env.DATABASE_URL || "";

// Render: la conexión INTERNA (host tipo dpg-xxxx-a, sin dominio) va SIN SSL
// —es red privada—; la EXTERNA (*.render.com) va CON SSL. En local, sin SSL.
// Forzar SSL en la interna produce un cierre de conexión con error "vacío".
const needsSSL = /\.render\.com|\.amazonaws\.com|sslmode=require/i.test(url);

export const pool = new Pool({
  connectionString: url || undefined,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

export const q = (text, params) => pool.query(text, params);
