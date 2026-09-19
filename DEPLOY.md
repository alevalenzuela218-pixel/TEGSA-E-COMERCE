# Deploy — GitHub + Render (paso a paso)

Tiempo estimado: ~10 minutos. Necesitás una cuenta de GitHub y una de Render
(el plan free alcanza para testeo).

## 1. Subir el repo a GitHub

Desde la carpeta del proyecto (ya viene con git inicializado y un commit):

```bash
# creá un repo vacío en github.com/new (por ejemplo: tegsa-iluminacion)
git remote add origin https://github.com/TU_USUARIO/tegsa-iluminacion.git
git branch -M main
git push -u origin main
```

Si preferís arrancar el git de cero: borrá la carpeta `.git`, y hacé
`git init && git add . && git commit -m "init"` antes del push.

## 2. Crear los servicios en Render

1. Entrá a [dashboard.render.com](https://dashboard.render.com) → **New > Blueprint**.
2. Conectá tu cuenta de GitHub y elegí el repo. Render lee el `render.yaml` y
   te propone crear **un web service** (`tegsa-iluminacion`) y **una base
   Postgres** (`tegsa-db`). Confirmá.
3. En el web service, sección **Environment**, cargá:
   - `ADMIN_USER` → el usuario del panel (ej. `admin`)
   - `ADMIN_PASSWORD` → una clave fuerte
   - `MP_ACCESS_TOKEN` → (opcional) tu token de Mercado Pago; sin esto, el
     checkout registra el pedido sin cobro online.
   > `DATABASE_URL` se completa sola desde la base (ya está en el `render.yaml`).
4. Esperá a que termine el primer deploy (el log debe decir
   `TEGSA Iluminación escuchando en :10000`).

## 3. Inicializar la base (una sola vez)

En el web service → pestaña **Shell**:

```bash
npm run setup      # aplica el esquema y carga el catálogo
```

Listo. Abrí la URL del servicio (`https://tegsa-iluminacion.onrender.com`):

- Tienda: `/`
- Panel: `/admin` (usuario/clave que cargaste)
- Health check: `/healthz`

## Notas

- **Plan free**: el servicio se duerme tras 15 min de inactividad (primer
  acceso tarda ~30 s) y la base free expira con el tiempo. Perfecto para
  testeo. Para producción: web service **Starter** y base **Basic**.
- **Redeploys**: cada `git push` a `main` redeploya solo. El `setup` NO se
  vuelve a correr (borraría datos); sólo lo corrés de nuevo si querés recargar
  el catálogo desde cero.
- **Actualizar catálogo sin borrar**: en vez de `npm run setup`, corré sólo
  `npm run migrate` (idempotente) y cargá/edita productos desde `/admin`.
- **HTTPS**: Render lo provee automáticamente.
