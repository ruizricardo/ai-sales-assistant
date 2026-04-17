import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

interface ShopifyVariant {
  price: string;
  inventory_quantity: number;
  inventory_management: string | null;
}

interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  handle: string;
  status: string;
  product_type: string;
  tags: string;
  variants: ShopifyVariant[];
  image: { src: string } | null;
}
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmbeddingText(product: ShopifyProduct): string {
  const parts = [
    product.title,
    product.product_type ? `Tipo: ${product.product_type}` : "",
    product.tags ? `Categorías: ${product.tags}` : "",
    stripHtml(product.body_html || ""),
  ];
  return parts.filter(Boolean).join(". ").trim();
}

function getInventoryInfo(variants: ShopifyVariant[]) {
  const totalInventory = variants.reduce(
    (sum, v) => sum + (v.inventory_quantity || 0),
    0,
  );
  const untracked = variants.some((v) => v.inventory_management === null);
  const available = untracked || totalInventory > 0;
  return { totalInventory, available };
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function ingestProducts(shopDomain: string, accessToken: string) {
  console.log(`Iniciando sync de productos para ${shopDomain}`);

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .upsert(
      { shop_domain: shopDomain, access_token: accessToken },
      { onConflict: "shop_domain" },
    )
    .select()
    .single();

  if (storeError || !store) {
    throw new Error(`Error guardando store: ${storeError?.message}`);
  }

  const url = `https://${shopDomain}/admin/api/2024-01/products.json?limit=250&status=active`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok)
    throw new Error(`Error del Admin API: ${response.statusText}`);

  const { products }: { products: ShopifyProduct[] } = await response.json();
  console.log(`${products.length} productos encontrados`);

  for (const product of products) {
    const { totalInventory, available } = getInventoryInfo(product.variants);

    const { error } = await supabase.from("products").upsert(
      {
        store_id: store.id,
        shopify_product_id: product.id.toString(),
        title: product.title,
        description: stripHtml(product.body_html || ""),
        price: parseFloat(product.variants[0]?.price || "0"),
        image_url: product.image?.src || null,
        product_url: `https://${shopDomain}/products/${product.handle}`,
        available,
        tags: product.tags || null,
        product_type: product.product_type || null,
        inventory_quantity: totalInventory,
      },
      { onConflict: "store_id,shopify_product_id" },
    );

    if (error)
      console.error(`Error guardando ${product.title}:`, error.message);
    else console.log(`✓ ${product.title}`);
  }

  console.log(`Sync completado para ${shopDomain}`);
  return { synced: products.length, store_id: store.id };
}

export async function generateProductEmbeddings(storeId: string) {
  console.log("Generando embeddings...");

  // Traer productos sin embedding
  const { data: products, error } = await supabase
    .from("products")
    .select("id, title, description, tags, product_type")
    .eq("store_id", storeId)
    .is("embedding", null);

  if (error) throw new Error(error.message);
  if (!products?.length) {
    console.log("Todos los productos ya tienen embedding");
    return { updated: 0 };
  }

  console.log(`${products.length} productos sin embedding`);
  let updated = 0;

  for (const product of products) {
    // Combinamos título y descripción para un embedding más rico
    const text = [
      product.title,
      product.product_type ? `Tipo: ${product.product_type}` : "",
      product.tags ? `Categorías: ${product.tags}` : "",
      product.description || "",
    ]
      .filter(Boolean)
      .join(". ")
      .trim();

    const embedding = await generateEmbedding(text);

    const { error: updateError } = await supabase
      .from("products")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", product.id);

    if (updateError) {
      console.error(`Error en ${product.title}:`, updateError.message);
    } else {
      console.log(`✓ ${product.title}`);
      updated++;
    }

    // Pequeña pausa para no saturar el rate limit de OpenAI
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`${updated} embeddings generados`);
  return { updated };
}
