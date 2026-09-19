# TEGSA · Iluminación

E-commerce de luminarias y accesorios luminotécnicos. Storefront con filtros
(ubicación, tipo, temperatura de color, IP, precio), panel privado para cargar
precios y stock, y base Postgres preparada para automatizar ventas con **n8n**
(patrón outbox).

## Stack

- **Node + Express** (API y páginas)
- **PostgreSQL** (fuente de verdad; esquema en `db/schema.sql`)
- Front vanilla (HTML/CSS/JS) que consume la API
- Deploy en **Render** desde GitHub (`render.yaml`)

## Puesta en marcha (local)

Necesitás Node 20+ y una Postgres corriendo.

```bash
cp .env.example .env        # completá DATABASE_URL, ADMIN_USER, ADMIN_PASSWORD
npm install
npm run setup               # aplica el esquema y carga el catálogo (migrate + seed)
npm start                   # http://localhost:3000
```

- Tienda: `http://localhost:3000/`
- Panel privado: `http://localhost:3000/admin` (usuario/clave de `.env`)

## Deploy en Render

**1. Subí el repo a GitHub** (desde la carpeta del proyecto):

```bash
git init
git add .
git commit -m "TEGSA Iluminación - MVP"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/tegsa-iluminacion.git
git push -u origin main
```

**2. En Render → New > Blueprint**, apuntá al repo. El `render.yaml` crea el
servicio web y la base Postgres juntos.

**3. Cargá las variables** `ADMIN_USER` y `ADMIN_PASSWORD` en el dashboard del
servicio (no van en el repo). Si vas a cobrar online, agregá también
`MP_ACCESS_TOKEN`.

**4. Listo.** No hace falta correr nada a mano: al arrancar, `npm run ensure`
aplica el esquema y **carga el catálogo solo si la base está vacía** (no
reseedea en cada deploy). El plan free no da Shell, por eso el setup es
automático.

> El plan free duerme el servicio tras 15 min (arranque frío al volver) y la
> base free expira con el tiempo: perfecto para testeo. Para producción, pasá el
> web service a **Starter** y la base a **Basic**. El esquema y el catálogo viven
> en el repo, así que la base se recrea sola en el próximo arranque.

## Estructura

```
db/
  schema.sql        Esquema Postgres (products, variants, orders, outbox…)
  migrate.js        Aplica el esquema
  seed.js           Carga los CSV de catálogo a la base
  data/*.csv        Catálogos extraídos (MACROLED, Enertech, Perfecta)
src/
  db.js             Pool de Postgres
  server.js         API storefront + panel (/admin con HTTP Basic)
public/
  index.html/app.js Storefront con filtros
  admin.html/admin.js  Panel de precios y stock
  styles.css
render.yaml         Blueprint de deploy
```

## Automatización con n8n

Cada edición de precio o stock, y cada venta, deja un evento en la tabla
`outbox_events` y emite un `NOTIFY` en el canal `n8n_events`. En n8n, un único
**Postgres Trigger** escuchando esa tabla te dispara los workflows: actualizar
la publicación en Mercado Libre, regenerar el feed de Meta, descontar stock,
notificar, etc.

El primer workflow ya está en `n8n/`: `tegsa-notificaciones.json` (importable —
avisa por mail cada venta y cada consulta), su guía `SETUP.md`, y `notifier.js`
(el mismo consumo en un script Node, por si preferís cron en vez de n8n).

También está el sync con Mercado Libre: `tegsa-sync-ml.json` (escucha
`price.changed`/`stock.changed` y actualiza precio+stock en las publicaciones
vinculadas, cumpliendo la regla de ML de marzo 2026), su guía `SYNC-ML.md`, y
`sync-ml.js` (consumo en Node, probado en modo simulado). Cada workflow procesa
solo sus tipos de evento, así no se pisan.

## Carrito y checkout

El storefront tiene carrito (drawer en la barra, persistido por navegador) y
página de checkout. Al confirmar, `POST /api/orders`:

1. Valida stock y recalcula el total **desde la base** (no confía en el cliente).
2. Crea la orden y sus ítems, y descuenta stock por el ledger
   (`stock_movements`) → dispara `stock.changed`. La orden dispara `order.created`.
3. Si hay `MP_ACCESS_TOKEN`, crea una preferencia de **Mercado Pago (Checkout
   Pro)** y redirige al pago; sin token, registra el pedido y muestra
   confirmación. **Nunca se guardan datos de tarjeta** — los maneja Mercado Pago.

## Marketing y analítica

- **Banner carrusel** en la home con enfoque **AIDA** (Atención → Interés →
  Deseo → Acción): 4 slides que apuntan a la necesidad del cliente (ambiente,
  ahorro LED, exterior/seguridad, asesoramiento), franja de beneficios y CTA de
  cierre. Auto-rota, con flechas y puntos.
- **Analítica** en `/admin/analytics` (protegida): ranking de **más y menos
  visitados** (qué interesa) y **más y menos vendidos** (qué rota), más KPIs de
  visitas, unidades y pedidos. Las visitas se cuentan por vista de ficha
  (contador `products.vistas`); las ventas salen de `order_items`.
- **Servicio de asesoramiento y proyectos luminotécnicos**: ofrecido en el
  carrusel y en la franja de cierre, con página `/asesoramiento` (pitch AIDA +
  formulario). Cada solicitud se guarda en `consultas`, emite
  `consulta.created` al outbox (n8n → aviso al instante) y se lista en el panel.

## Notas y pendientes

- **Precios en 0 y stock de demostración**: cargá los reales desde `/admin`.
- **Taxonomía de tipos a normalizar**: al unir catálogos, conviven tipos de
  MACROLED (`Aplique`, `Colgante`) con los de Enertech en mayúsculas
  (`APLIQUES`, `LÁMPARAS DE PIE`). Falta mapearlos a un set canónico único.
- **Perfecta**: catálogo parcial — nombre, potencia y tono de luz están en las
  imágenes y requieren una pasada de OCR para completarse.
- **Faltan catálogos**: MAZ Iluminación (15 pág) y Catálogo 2025 (423 pág),
  ambos por OCR.
- **Seguridad**: el panel usa HTTP Basic para testeo; para producción conviene
  sesiones/roles y HTTPS (Render ya da HTTPS).
