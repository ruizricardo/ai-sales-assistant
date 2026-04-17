import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";
import { stripHtml } from "../util";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function handleProductUpsert(shopDomain: string, product: any) {
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("shop_domain", shopDomain)
    .single();

  if (storeError || !store)
    throw new Error(`Store no encontrada: ${shopDomain}`);

  const variants = product.variants || [];
  const totalInventory = variants.reduce(
    (sum: number, v: any) => sum + (v.inventory_quantity || 0),
    0,
  );
  const untracked = variants.some((v: any) => v.inventory_management === null);
  const available = untracked || totalInventory > 0;

  const embeddingText = [
    product.title,
    product.product_type ? `Tipo: ${product.product_type}` : "",
    product.tags ? `Categorías: ${product.tags}` : "",
    stripHtml(product.body_html || ""),
  ]
    .filter(Boolean)
    .join(". ")
    .trim();

  const embedding = await generateEmbedding(embeddingText);

  const { error } = await supabase.from("products").upsert(
    {
      store_id: store.id,
      shopify_product_id: product.id.toString(),
      title: product.title,
      description: stripHtml(product.body_html || ""),
      price: parseFloat(variants[0]?.price || "0"),
      image_url: product.image?.src || null,
      product_url: `https://${shopDomain}/products/${product.handle}`,
      available,
      tags: product.tags || null,
      product_type: product.product_type || null,
      inventory_quantity: totalInventory,
      embedding: JSON.stringify(embedding),
    },
    { onConflict: "store_id,shopify_product_id" },
  );

  if (error) throw new Error(error.message);
  console.log(
    `✓ Producto upserted: ${product.title} | disponible: ${available}`,
  );
}

export async function handleProductDelete(
  shopDomain: string,
  productId: string,
) {
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("shop_domain", shopDomain)
    .single();

  if (storeError || !store) {
    throw new Error(`Store no encontrado: ${shopDomain}`);
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("store_id", store.id)
    .eq("shopify_product_id", productId.toString());

  if (error) {
    throw new Error(`Error eliminando producto: ${error.message}`);
  }
  console.log(`✓ Producto eliminado: ${productId}`);
}
