alter table products
  add column if not exists available boolean default true,
  add column if not exists tags text,
  add column if not exists product_type text,
  add column if not exists inventory_quantity int default 0;

-- Actualizar la función de búsqueda con filtros
create or replace function search_products(
  query_embedding extensions.vector(1536),
  target_store_id uuid,
  match_count int default 5,
  only_available boolean default true
)
returns table (
  id uuid,
  shopify_product_id text,
  title text,
  description text,
  price numeric,
  image_url text,
  product_url text,
  available boolean,
  tags text,
  product_type text,
  inventory_quantity int,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select
    p.id,
    p.shopify_product_id,
    p.title,
    p.description,
    p.price,
    p.image_url,
    p.product_url,
    p.available,
    p.tags,
    p.product_type,
    p.inventory_quantity,
    1 - (p.embedding <=> query_embedding) as similarity
  from products p
  where p.store_id = target_store_id
    and p.embedding is not null
    and (only_available = false or p.available = true)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;