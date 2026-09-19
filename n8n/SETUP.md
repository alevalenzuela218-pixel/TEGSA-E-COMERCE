# n8n — Notificaciones de ventas y consultas

Este workflow escucha la tabla `outbox_events` de TEGSA Iluminación y te avisa
por mail cada vez que entra **una venta** (`order.created`) o **una consulta de
asesoramiento** (`consulta.created`).

## Cómo funciona

```
Postgres LISTEN (canal n8n_events)  →  Traer pendientes (SELECT status='pending')
                                          ├─→ Armar avisos (Code) → Enviar aviso (Gmail)
                                          └─→ Marcar procesado (UPDATE status='processed')
```

Cada evento del outbox emite un `NOTIFY` en el canal `n8n_events`; n8n se
despierta, trae todos los pendientes, notifica los que corresponde y los marca
como procesados. Los eventos `stock.changed` / `price.changed` no se notifican
acá (quedan para el flujo de sincronización con ML/Meta).

## Pasos

1. **Importar**: en n8n, *Workflows → Import from File* → `tegsa-notificaciones.json`.

2. **Credencial de Postgres** (*Credentials → New → Postgres*):
   - Host / puerto / base / usuario / contraseña: los de tu base de Render
     (usá la **External Database URL** del dashboard).
   - SSL: **Require**.
   - Asignala en los tres nodos Postgres (LISTEN, Traer pendientes, Marcar
     procesado).

3. **Credencial de Gmail** (*Credentials → New → Gmail OAuth2*) y asignala al
   nodo **Enviar aviso**. Si preferís **Telegram** o **WhatsApp**, borrá el nodo
   Gmail y poné el de tu canal (el `asunto` y `cuerpo` ya vienen armados desde
   el nodo *Armar avisos*).

4. **Destinatario**: en el nodo *Enviar aviso*, cambiá `tu-email@dominio.com`
   por tu correo.

5. **Activar** el workflow (toggle *Active*, arriba a la derecha).

## Probar

Hacé una compra de prueba o mandá una consulta desde `/asesoramiento`. En
segundos deberías recibir el mail. Verificá también en la base:

```sql
SELECT event_type, status FROM outbox_events ORDER BY created_at DESC LIMIT 5;
```

## Nota sobre el permiso de LISTEN

El nodo Postgres Trigger en modo *Listen* usa `LISTEN/NOTIFY`; funciona con tu
usuario de la base sin permisos especiales. Si tu hosting complica el canal
persistente, cambiá el trigger por un **Schedule Trigger** (cada 1 minuto) →
*Traer pendientes*: el resto del workflow queda igual y tenés como máximo un
minuto de demora.

## Alternativa sin n8n

`n8n/notifier.js` hace exactamente lo mismo en un script Node (traer pendientes
→ avisar → marcar procesado). Podés correrlo por cron:

```bash
node n8n/notifier.js
```

Hoy imprime el aviso por consola; para producción, reemplazá ese punto por tu
envío real (email / WhatsApp).
