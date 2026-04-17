-- Extensiones en schema dedicado
create schema if not exists extensions;
create extension if not exists vector schema extensions;

-- Tabla de stores conectadas
create table stores (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  access_token text not null,
  created_at timestamptz default now()
);

-- Tabla de productos con embeddings
create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  shopify_product_id text not null,
  title text not null,
  description text,
  price numeric,
  image_url text,
  product_url text,
  embedding extensions.vector(1536),
  created_at timestamptz default now(),
  unique(store_id, shopify_product_id)
);

-- Índice para búsqueda vectorial rápida
create index on products
using ivfflat (embedding extensions.vector_cosine_ops)
with (lists = 100);