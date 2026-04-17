-- RLS en las tablas
alter table stores enable row level security;
alter table products enable row level security;

create policy "service role only" on stores
  using ((select auth.role()) = 'service_role');

create policy "service role only" on products
  using ((select auth.role()) = 'service_role');

-- Función de búsqueda semántica
create or replace function search_products(
  query_embedding extensions.vector(1536),
  target_store_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  shopify_product_id text,
  title text,
  description text,
  price numeric,
  image_url text,
  product_url text,
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
    1 - (p.embedding <=> query_embedding) as similarity
  from products p
  where p.store_id = target_store_id
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;