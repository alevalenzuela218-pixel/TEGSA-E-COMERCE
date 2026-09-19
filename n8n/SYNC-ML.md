# n8n — Sincronización con Mercado Libre (precio y stock)

Cuando cambia el precio o el stock de una variante, el outbox emite
`price.changed` / `stock.changed`. Este workflow, para las variantes que tienen
una publicación vinculada, manda a ML el **precio y el stock actuales** en un
único PUT a `/items/{item_id}`.

## Importante — regla de precios de ML (18/3/2026)

Desde el **18 de marzo de 2026**, un PUT que actualice **solo** `price` se
rechaza con `400`. Por eso el workflow manda **siempre `price` + `available_quantity`
juntos** — así cumple la regla y ML queda igual que tu base. Nota extra: si la
publicación tiene **automatización de precios** activa, ML ignora el `price`
enviado y devuelve un *warning* (el stock sí se actualiza).

## Antes de usarlo: vincular productos a ML

El sync solo actúa sobre variantes que tienen guardado su `item_id` de ML. Para
vincular una (desde tu backend o con curl al panel):

```bash
curl -X POST https://TU-APP.onrender.com/api/admin/ml-link \
  -u admin:TU_CLAVE -H "Content-Type: application/json" \
  -d '{"variant_id":"UUID-de-la-variante","item_id":"MLA1234567890"}'
```

Esto guarda la fila en `channel_listings` (canal `mercadolibre`, estado
`publicado`). *(La publicación inicial del ítem en ML —crear la MLA con
categoría, atributos y fotos— es un paso aparte que requiere tu cuenta y la API
de ML; este workflow sincroniza publicaciones ya existentes.)*

## Configurar en n8n

1. **Importar** `tegsa-sync-ml.json`.
2. **Credencial Postgres** (la misma que el otro workflow) en los dos nodos
   Postgres.
3. **Credencial Mercado Libre** — *Credentials → New → OAuth2 API (generic)*:
   - Grant Type: `Authorization Code`
   - Authorization URL: `https://auth.mercadolibre.com.ar/authorization`
   - Access Token URL: `https://api.mercadolibre.com/oauth/token`
   - Client ID / Secret: los de tu aplicación de ML (Developers → tus apps)
   - Scope: `offline_access read write`
   Asignala al nodo **PUT /items (Mercado Libre)**. ML devuelve *refresh token*
   con `offline_access`, así n8n renueva el access token solo (los de ML vencen
   a las 6 h).
4. **Activar** el workflow.

## Cómo funciona

```
LISTEN n8n_events → Traer para ML (variantes publicadas con cambio pendiente)
                  → PUT /items/{item_id} {price, available_quantity}
                  → Marcar sincronizado (last_synced_at + outbox processed)
```

Este workflow procesa solo `price.changed` / `stock.changed`; el de
notificaciones procesa solo `order.created` / `consulta.created`. Cada uno marca
como `processed` únicamente sus propios eventos, así no se pisan.

## Probar sin tocar n8n

`n8n/sync-ml.js` hace exactamente lo mismo en Node y, si no hay `ML_ACCESS_TOKEN`,
**imprime el PUT que enviaría** en vez de llamar a ML — ideal para validar la
lógica:

```bash
node n8n/sync-ml.js
```

Con `ML_ACCESS_TOKEN` en el entorno, hace la llamada real.
