import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";

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

export async function searchProducts(query: string, storeId: string) {
  // 1. Convertir la pregunta del cliente en embedding
  const queryEmbedding = await generateEmbedding(query);

  // 2. Buscar productos similares en Supabase usando la función que creamos
  const { data: products, error } = await supabase.rpc("search_products", {
    query_embedding: JSON.stringify(queryEmbedding),
    target_store_id: storeId,
    match_count: 5,
  });

  if (error) throw new Error(error.message);
  return products;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function chat(
  query: string,
  storeId: string,
  history: Message[] = [],
) {
  // 1. Recuperar productos relevantes basados en la pregunta actual
  const relevantProducts = await searchProducts(query, storeId);

  const context = relevantProducts?.length
    ? relevantProducts
        .map((p: any) => {
          const stock = p.available
            ? p.inventory_quantity > 0
              ? `Stock: ${p.inventory_quantity} unidades`
              : "Disponible (sin límite de stock)"
            : "SIN STOCK";
          const tags = p.tags ? `Tags: ${p.tags}` : "";
          const type = p.product_type ? `Tipo: ${p.product_type}` : "";
          return `- ${p.title} | Precio: $${p.price} | ${stock} | ${type} | ${tags} | URL: ${p.product_url}`;
        })
        .join("\n")
    : "No se encontraron productos relacionados.";

  // 2. Construir mensajes con historial
  const messages = [
    {
      role: "system" as const,
      content: `Sos un asistente de ventas amigable para una tienda online.
Respondé preguntas usando SOLO la información del catálogo proporcionado.
IMPORTANTE:
- Nunca recomiendes productos que digan "SIN STOCK"
- Cuando el cliente pida algo barato, priorizá los de menor precio
- Mencioná siempre el precio y disponibilidad
- Respondé en el mismo idioma que el cliente

Catálogo relevante:
${context}`,
    },
    // Historial de la conversación
    ...history,
    // Mensaje actual
    {
      role: "user" as const,
      content: query,
    },
  ];

  // 3. Llamar al LLM con el historial completo
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  const answer = response.choices[0].message.content || "";

  return {
    answer,
    products: relevantProducts || [],
  };
}
