import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("✖ DATABASE_URL no está definida.");
    console.error("  En Render: creá una base Postgres y agregá su Internal Database URL");
    console.error("  como variable DATABASE_URL del servicio web (o deployá con Blueprint).");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("Aplicando esquema…");
  try {
    await pool.query(sql);
    console.log("Esquema aplicado.");
  } catch (e) {
    if (/already exists|duplicate/i.test(e.message || "")) {
      console.log("El esquema ya estaba aplicado (ok).");
    } else {
      console.error("✖ Error aplicando el esquema:");
      console.error("  message:", e.message || "(sin mensaje)");
      console.error("  code:", e.code, "| detail:", e.detail, "| hint:", e.hint);
      if (e.stack) console.error(e.stack);
      await pool.end();
      process.exit(1);
    }
  }

  // Migraciones incrementales idempotentes (para bases ya creadas):
  try {
    await pool.query(`ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS atributos jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await pool.query(`ALTER TABLE products
      ADD COLUMN IF NOT EXISTS vistas bigint NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS imagen_url text`);
    await pool.query(`CREATE TABLE IF NOT EXISTS suscriptores(
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      created_at timestamptz not null default now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS consultas(
      id uuid primary key default gen_random_uuid(),
      nombre text not null, email text, telefono text,
      tipo_proyecto text, mensaje text,
      estado text not null default 'nueva',
      created_at timestamptz not null default now())`);
    await pool.query(`CREATE OR REPLACE FUNCTION trg_consultas_outbox() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN PERFORM emit_outbox_event('consulta.created','consulta',NEW.id, to_jsonb(NEW)); RETURN NEW; END; $fn$`);
    await pool.query(`DROP TRIGGER IF EXISTS consultas_outbox ON consultas`);
    await pool.query(`CREATE TRIGGER consultas_outbox AFTER INSERT ON consultas
      FOR EACH ROW EXECUTE FUNCTION trg_consultas_outbox()`);
    console.log("Migraciones incrementales aplicadas.");
    await pool.end();
  } catch (e) {
    console.error("✖ Error en migración incremental:", e.message || "(sin mensaje)", "| code:", e.code);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}
main().catch((e) => { console.error("migrate:", e.message || e); process.exit(1); });
