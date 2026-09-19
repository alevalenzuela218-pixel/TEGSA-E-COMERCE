-- ============================================================================
--  TEGSA · Iluminación — Esquema de base de datos (PostgreSQL 14+)
-- ----------------------------------------------------------------------------
--  E-commerce de luminarias y accesorios luminotécnicos.
--  Sincronización con Mercado Libre y feed de Meta. Automatización con n8n.
--
--  Diseño clave para n8n:
--    Toda venta / cambio de precio / cambio de stock inserta una fila en
--    "outbox_events". n8n escucha esa única tabla (nodo Postgres Trigger,
--    modo "Listen to Channel: n8n_events", o "Insert" sobre outbox_events)
--    y desde ahí orquesta: descontar stock en todos los canales, actualizar
--    la publicación en ML, regenerar el feed de Meta, notificar, etc.
--
--  Seguridad:
--    NO se guardan datos de tarjeta. El cobro lo maneja Mercado Pago u otra
--    pasarela; acá solo viven catálogo, stock, pedidos y estado de canales.
--
--  Nota Medusa:
--    Si el commerce corre sobre Medusa, Medusa administra products /
--    variants / orders / inventory con su propio esquema. En ese caso, las
--    partes específicas de este archivo — atributos luminotécnicos,
--    channel_listings y outbox_events — se implementan como un módulo custom
--    de Medusa. Este archivo funciona tal cual para un build a medida y sirve
--    como modelo de referencia para el módulo de Medusa.
--
--  Ejecutar:  psql "$DATABASE_URL" -f tegsa_luminarias_schema.sql
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ------------------------------------------------------------------ enums ---
create type location_type   as enum ('interior', 'exterior', 'interior_exterior');
create type product_status  as enum ('borrador', 'activo', 'pausado', 'archivado');
create type sales_channel    as enum ('web', 'mercadolibre', 'meta');
create type listing_status   as enum ('no_publicado', 'publicado', 'pausado', 'error');
create type order_status      as enum ('pendiente', 'pagado', 'en_preparacion', 'enviado', 'entregado', 'cancelado');
create type stock_reason      as enum ('ingreso', 'venta', 'ajuste', 'devolucion', 'reserva', 'liberacion');
create type outbox_status     as enum ('pending', 'processed', 'failed');

-- --------------------------------------------------- helper updated_at ------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
--  CATÁLOGO
-- ============================================================================

-- Tipos de luminaria (vocabulario controlado, alimenta el filtro del sitio).
create table product_types (
  id          smallint generated always as identity primary key,
  slug        text not null unique,
  nombre      text not null
);

insert into product_types (slug, nombre) values
  ('panel_led',      'Panel LED'),
  ('plafon',         'Plafón'),
  ('spot',           'Spot / Empotrable'),
  ('colgante',       'Colgante'),
  ('reflector',      'Reflector / Proyector'),
  ('aplique',        'Aplique'),
  ('farola',         'Farola / Alumbrado público'),
  ('campana',        'Campana industrial'),
  ('cinta_led',      'Cinta LED'),
  ('bulbo',          'Lámpara / Bulbo');

-- Producto: información compartida por todas sus variantes.
create table products (
  id           uuid primary key default gen_random_uuid(),
  sku_base     text not null unique,
  nombre       text not null,
  marca        text not null default 'TEGSA',
  type_id      smallint not null references product_types(id),
  ubicacion    location_type not null,
  descripcion  text,
  status       product_status not null default 'borrador',
  vistas       bigint not null default 0,          -- contador de visitas (analítica)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Variante: unidad vendible. Aunque el producto no tenga variantes reales,
-- siempre existe al menos una (misma lógica que Mercado Libre User Products
-- y que Medusa). Los atributos luminotécnicos medibles viven acá porque
-- pueden diferir por variante (p. ej. 3000K vs 6500K, 7W vs 12W).
create table product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  sku            text not null unique,
  nombre         text,                          -- ej. "7W · 3000K", null si única
  precio         numeric(12,2) not null default 0,   -- ARS
  -- especificaciones luminotécnicas
  potencia_w     numeric(7,2),
  flujo_lm       integer,
  temp_kelvin    integer,
  temp_band      text generated always as (
                   case
                     when temp_kelvin is null      then null
                     when temp_kelvin <= 3200      then 'calida'
                     when temp_kelvin <= 4500      then 'neutra'
                     else 'fria'
                   end) stored,
  ip             smallint,                        -- grado de protección (20, 44, 65…)
  tension_v      text,                            -- "220V", "12V", "24V"
  angulo_haz     smallint,                        -- grados
  casquillo      text,                            -- "E27", "GU10", "integrado"
  regulable      boolean not null default false,  -- dimmable
  vida_util_h    integer,
  -- stock (source of truth = ledger stock_movements; esto es el cache)
  stock_qty      integer not null default 0,
  reservado_qty  integer not null default 0,
  disponible_qty integer generated always as (stock_qty - reservado_qty) stored,
  activo         boolean not null default true,
  atributos      jsonb not null default '{}'::jsonb,   -- specs extra por catálogo (medidas, material, EAN…)
  imagen_url     text,                                 -- foto del producto (opcional)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
--  CANALES DE VENTA
-- ============================================================================

-- Mapa variante → canal externo. Guarda el item_id de ML, el id del feed de
-- Meta y el estado de sincronización. n8n lo lee para saber a dónde empujar
-- cada cambio, y lo actualiza tras sincronizar.
create table channel_listings (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references product_variants(id) on delete cascade,
  channel         sales_channel not null,
  external_id     text,                           -- ML item_id (MLA...) / retailer_id de Meta
  status          listing_status not null default 'no_publicado',
  last_synced_at  timestamptz,
  sync_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (variant_id, channel)
);

-- ============================================================================
--  STOCK (libro mayor / ledger)
-- ============================================================================

-- Todo movimiento de stock se registra acá. Un trigger actualiza el cache
-- product_variants.stock_qty y emite el evento stock.changed para n8n.
-- Editar stock desde el admin = insertar un movimiento de tipo 'ajuste'.
create table stock_movements (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references product_variants(id) on delete cascade,
  quantity     integer not null,                 -- + ingreso / - egreso
  reason       stock_reason not null,
  channel      sales_channel,                    -- de qué canal vino, si aplica
  reference    text,                             -- nº de orden externa, remito, etc.
  created_at   timestamptz not null default now()
);

-- ============================================================================
--  PEDIDOS
-- ============================================================================

create table orders (
  id                uuid primary key default gen_random_uuid(),
  channel           sales_channel not null,
  external_order_id text,                         -- id de la orden en ML, si aplica
  status            order_status not null default 'pendiente',
  -- cliente (mínimo; sin datos sensibles de pago)
  cliente_nombre    text,
  cliente_email     text,
  cliente_telefono  text,
  cliente_doc       text,                         -- DNI/CUIT para facturación
  -- totales
  moneda            text not null default 'ARS',
  total             numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (channel, external_order_id)
);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  variant_id    uuid not null references product_variants(id),
  cantidad      integer not null check (cantidad > 0),
  precio_unit   numeric(12,2) not null,
  subtotal      numeric(12,2) generated always as (cantidad * precio_unit) stored
);

-- ============================================================================
--  OUTBOX — el punto de entrada de n8n
-- ============================================================================

create table outbox_events (
  id             bigint generated always as identity primary key,
  event_type     text not null,                  -- 'order.created', 'price.changed', 'stock.changed'…
  aggregate_type text not null,                  -- 'order' | 'variant' | 'listing'
  aggregate_id   uuid,
  payload        jsonb not null default '{}'::jsonb,
  status         outbox_status not null default 'pending',
  attempts       smallint not null default 0,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

-- Función central: inserta el evento y avisa por NOTIFY (para el modo
-- "Listen to Channel" del Postgres Trigger de n8n).
create or replace function emit_outbox_event(
  p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb
) returns void language plpgsql as $$
begin
  insert into outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values (p_event_type, p_aggregate_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb));

  perform pg_notify('n8n_events',
    json_build_object('event_type', p_event_type, 'aggregate_id', p_aggregate_id)::text);
end;
$$;

-- ============================================================================
--  TRIGGERS DE NEGOCIO → outbox
-- ============================================================================

-- Pedidos: alta y cambios de estado.
create or replace function trg_orders_outbox() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform emit_outbox_event('order.created', 'order', new.id, to_jsonb(new));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform emit_outbox_event('order.status_changed', 'order', new.id,
      jsonb_build_object('status', new.status, 'previous', old.status));
  end if;
  return new;
end;
$$;
create trigger orders_outbox after insert or update on orders
  for each row execute function trg_orders_outbox();

-- Cambios de precio en una variante → hay que reflejarlo en ML y en Meta.
create or replace function trg_variant_price_outbox() returns trigger
language plpgsql as $$
begin
  if new.precio is distinct from old.precio then
    perform emit_outbox_event('price.changed', 'variant', new.id,
      jsonb_build_object('sku', new.sku, 'precio', new.precio, 'previous', old.precio));
  end if;
  return new;
end;
$$;
create trigger variant_price_outbox after update on product_variants
  for each row execute function trg_variant_price_outbox();

-- Movimientos de stock: actualizan el cache y emiten stock.changed.
create or replace function trg_stock_movement() returns trigger
language plpgsql as $$
declare v_new_qty integer;
begin
  update product_variants
     set stock_qty = stock_qty + new.quantity
   where id = new.variant_id
  returning stock_qty into v_new_qty;

  perform emit_outbox_event('stock.changed', 'variant', new.variant_id,
    jsonb_build_object('change', new.quantity, 'nuevo_stock', v_new_qty,
                       'reason', new.reason, 'channel', new.channel));
  return new;
end;
$$;
create trigger stock_movement_apply after insert on stock_movements
  for each row execute function trg_stock_movement();

-- updated_at automático.
create trigger products_touch  before update on products
  for each row execute function set_updated_at();
create trigger variants_touch  before update on product_variants
  for each row execute function set_updated_at();
create trigger listings_touch  before update on channel_listings
  for each row execute function set_updated_at();
create trigger orders_touch    before update on orders
  for each row execute function set_updated_at();

-- ============================================================================
--  ÍNDICES
-- ============================================================================
create index idx_products_type        on products (type_id);
create index idx_products_status       on products (status);
create index idx_products_ubicacion    on products (ubicacion);
create index idx_variants_product      on product_variants (product_id);
create index idx_variants_temp_band    on product_variants (temp_band);
create index idx_variants_precio       on product_variants (precio);
create index idx_listings_variant      on channel_listings (variant_id);
create index idx_listings_external     on channel_listings (channel, external_id);
create index idx_stock_variant         on stock_movements (variant_id);
create index idx_orders_channel        on orders (channel, status);
create index idx_order_items_order     on order_items (order_id);
-- Cola de outbox: n8n consulta los pendientes por acá.
create index idx_outbox_pending on outbox_events (status, created_at)
  where status = 'pending';

-- ============================================================================
--  FIN
-- ============================================================================
