import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");

const read = (f) =>
  parse(fs.readFileSync(path.join(dataDir, f), "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

const intOf = (s) => {
  const m = String(s ?? "").match(/\d[\d.]*/);
  return m ? parseInt(m[0], 10) : null;
};
const kelvinOf = (s) => {
  const m = String(s ?? "").match(/(\d{3,4})\s*k/i);
  return m ? parseInt(m[1], 10) : null;
};
const slug = (s) =>
  String(s || "otros")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "otros";

// Mapea las categorías crudas de los 3 catálogos a un set canónico único.
function canonType(raw) {
  const s = String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map = [
    [/riel/, ["riel", "Riel"]],
    [/acople|conductor/, ["acople", "Acople / Conductor"]],
    [/modulo/, ["modulo", "Módulo lineal"]],
    [/spot/, ["spot", "Spot"]],
    [/colgant/, ["colgante", "Colgante"]],
    [/aplique/, ["aplique", "Aplique"]],
    [/cabezal/, ["cabezal", "Cabezal móvil"]],
    [/tubo/, ["tubo", "Tubo flexible"]],
    [/fuente/, ["fuente", "Fuente de alimentación"]],
    [/pie/, ["lampara_pie", "Lámpara de pie"]],
    [/escritorio|velador/, ["lampara_escritorio", "Lámpara de escritorio / velador"]],
    [/proyector|reflector/, ["proyector", "Proyector / Reflector"]],
    [/espejo/, ["espejo", "Espejo LED"]],
  ];
  for (const [re, [sl, nombre]] of map) if (re.test(s)) return { slug: sl, nombre };
  return { slug: "decorativo", nombre: "Decorativo" };
}
const ubic = (s) => {
  const v = String(s || "").toLowerCase();
  if (v.startsWith("exter")) return "exterior";
  if (v.includes("interior-exterior") || v.includes("interior_exterior")) return "interior_exterior";
  return "interior";
};
const demoStock = () => Math.floor(Math.random() * 60); // placeholder para testeo

// --- normalizadores por catálogo -> forma común ---
function fromMacroled(r) {
  const label = [r.familia, r.potencia_w, r.color].filter(Boolean).join(" ");
  return {
    sku: r.sku, nombre: label || r.sku, marca: r.marca || "Macroled",
    proveedor: r.proveedor || "MAZ Iluminación", categoria: r.categoria || r.familia,
    variante: [r.color, r.control, r.angulo].filter(Boolean).join(" · "),
    potencia_w: intOf(r.potencia_w), flujo_lm: intOf(r.flujo_lm),
    temp_kelvin: kelvinOf(r.cct), ip: intOf(r.ip), ubicacion: ubic(r.ubicacion),
    tension_v: r.tension_v || "DC48V", medidas: r.medidas_mm || "",
    descripcion: [r.linea, r.familia, r.control].filter(Boolean).join(" — "),
    atributos: {
      ean13: r.ean13 || null, color: r.color || null, control: r.control || null,
      angulo: r.angulo || null, corriente: r.corriente_a || null,
      medidas: r.medidas_mm || null, peso_g: r.peso_g || null,
      garantia_anios: r.garantia_anios || null, linea: r.linea || null,
    },
  };
}
function fromEnertech(r) {
  return {
    sku: r.sku, nombre: r.nombre || r.categoria || r.sku, marca: r.marca || "Enertech",
    proveedor: r.proveedor || "MAZ Iluminación", categoria: r.categoria || "Decorativo",
    variante: r.terminacion || "", potencia_w: intOf(r.potencia),
    flujo_lm: null, temp_kelvin: kelvinOf(r.tono_luz), ip: null,
    ubicacion: ubic(r.ubicacion), tension_v: r.tension_v || "220V",
    medidas: r.dimensiones || "", descripcion: r.descripcion || "",
    atributos: {
      material: r.material || null, terminacion: r.terminacion || null,
      dimensiones: r.dimensiones || null, tono_luz: r.tono_luz || null,
      encendido: r.encendido || null, apto_dinamico: r.apto_dinamico || null,
    },
  };
}
function fromPerfecta(r) {
  return {
    sku: r.sku, nombre: r.nombre_pendiente_OCR || `Perfecta ${r.sku}`, marca: "Perfecta",
    proveedor: r.proveedor || "MAZ Iluminación", categoria: "Decorativo",
    variante: r.colores_banos || "", potencia_w: intOf(r.potencia_pendiente_OCR),
    flujo_lm: null, temp_kelvin: kelvinOf(r.tono_luz_pendiente_OCR), ip: null,
    ubicacion: ubic(r.ubicacion), tension_v: "", medidas: r.medidas || "",
    descripcion: [r.material].filter(Boolean).join(" — "),
    atributos: {
      medidas: r.medidas || null, colores_banos: r.colores_banos || null,
      material: r.material || null,
      nota: "Nombre, potencia y tono pendientes de OCR",
    },
  };
}

async function main() {
  const items = [
    ...read("catalogo_macroled_skyline.csv").map(fromMacroled),
    ...read("catalogo_enertech.csv").map(fromEnertech),
    ...read("catalogo_perfecta.csv").map(fromPerfecta),
  ].filter((x) => x.sku);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE order_items, orders, stock_movements, channel_listings,
      product_variants, products, outbox_events, product_types RESTART IDENTITY CASCADE`);

    const typeCache = new Map();
    const getType = async (categoria) => {
      const c = canonType(categoria);
      if (typeCache.has(c.slug)) return typeCache.get(c.slug);
      const { rows } = await client.query(
        `INSERT INTO product_types(slug,nombre) VALUES($1,$2)
         ON CONFLICT(slug) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`,
        [c.slug, c.nombre]
      );
      typeCache.set(c.slug, rows[0].id);
      return rows[0].id;
    };

    let n = 0;
    for (const it of items) {
      const typeId = await getType(it.categoria);
      const p = await client.query(
        `INSERT INTO products(sku_base,nombre,marca,type_id,ubicacion,descripcion,status)
         VALUES($1,$2,$3,$4,$5,$6,'activo') RETURNING id`,
        [it.sku, it.nombre, it.marca, typeId, it.ubicacion, it.descripcion]
      );
      await client.query(
        `INSERT INTO product_variants
          (product_id,sku,nombre,precio,potencia_w,flujo_lm,temp_kelvin,ip,tension_v,stock_qty,activo,atributos)
         VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,true,$10)`,
        [p.rows[0].id, it.sku, it.variante || null, it.potencia_w, it.flujo_lm,
         it.temp_kelvin, it.ip, it.tension_v || null, demoStock(),
         JSON.stringify(it.atributos || {})]
      );
      n++;
    }
    await client.query("COMMIT");
    console.log(`Catálogo cargado: ${n} productos.`);
    console.log("Nota: precios en 0 y stock de demostración — cargá los reales desde /admin.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error en el seed:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
