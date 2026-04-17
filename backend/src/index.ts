import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { generateProductEmbeddings, ingestProducts } from "./sync/ingest";
import { chat } from "./rag/search";
import { handleProductUpsert, handleProductDelete } from "./webhooks/products";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/sync", async (req, res) => {
  const { shopDomain, accessToken } = req.body;

  if (!shopDomain || !accessToken) {
    return res
      .status(400)
      .json({ error: "shopDomain y accessToken requeridos" });
  }

  try {
    const result = await ingestProducts(shopDomain, accessToken);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/embeddings", async (req, res) => {
  const { storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({ error: "storeId requerido" });
  }

  try {
    const result = await generateProductEmbeddings(storeId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/chat", async (req, res) => {
  const { query, shopDomain, history = [] } = req.body;

  if (!query || !shopDomain) {
    return res.status(400).json({ error: "query y shopDomain requeridos" });
  }

  try {
    const { data: store, error } = await supabase
      .from("stores")
      .select("id")
      .eq("shop_domain", shopDomain)
      .single();

    if (error || !store) {
      return res.status(404).json({ error: "Tienda no encontrada" });
    }

    const result = await chat(query, store.id, history);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Shopify manda el shop domain en los headers
app.post("/webhooks/products/upsert", async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"] as string;

  if (!shopDomain) {
    return res.status(400).json({ error: "Missing shop domain header" });
  }

  // Responder 200 inmediatamente — Shopify requiere respuesta rápida
  res.status(200).send("ok");

  // Procesar en background
  handleProductUpsert(shopDomain, req.body).catch((err) =>
    console.error("Error en webhook upsert:", err.message),
  );
});

app.post("/webhooks/products/delete", async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"] as string;

  if (!shopDomain) {
    return res.status(400).json({ error: "Missing shop domain header" });
  }

  res.status(200).send("ok");

  handleProductDelete(shopDomain, req.body.id).catch((err) =>
    console.error("Error en webhook delete:", err.message),
  );
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
