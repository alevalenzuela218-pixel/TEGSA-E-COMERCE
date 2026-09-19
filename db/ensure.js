// Se corre al arrancar en Render: aplica el esquema (idempotente) y carga el
// catálogo SOLO si la base está vacía. Así el deploy en el plan free —que no da
// acceso a Shell— queda listo sin pasos manuales, y sin reseedear en cada deploy.
import { execSync } from "node:child_process";
import { pool } from "../src/db.js";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

async function main() {
  run("node db/migrate.js");

  let n = 0;
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM products");
    n = rows[0].n;
  } catch {
    n = 0;
  } finally {
    await pool.end();
  }

  if (n === 0) {
    console.log("Base vacía → cargando catálogo…");
    run("node db/seed.js");
  } else {
    console.log(`Catálogo ya presente (${n} productos): no se reseedea.`);
  }
}
main().catch((e) => { console.error("ensure:", e.message); process.exitCode = 1; });
