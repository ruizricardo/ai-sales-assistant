# AI Sales Assistant for Shopify

A Shopify app that embeds a conversational AI assistant into any storefront. Customers can ask natural language questions about products and receive intelligent, context-aware recommendations — powered by RAG (Retrieval-Augmented Generation) over the store's product catalog.

![Chat Widget](https://drive.google.com/file/d/1Iwpjm4Rpalqwr7F21VnGvqydV1WDUcYn/view?usp=sharing)

---

## How It Works

When a customer types a question like _"I'm looking for something for a newborn under $50"_, the assistant:

1. Converts the question into a semantic vector (embedding) using OpenAI
2. Searches the product catalog in Supabase using **pgvector** cosine similarity
3. Retrieves the most relevant products, filtering out out-of-stock items
4. Sends the products as context to **GPT-4o-mini** to generate a natural response
5. Returns the answer with product cards — including price, availability, and a direct link

This is RAG in production: retrieval by meaning, not keyword matching.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Shopify Storefront                    │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │            Theme App Extension (chat widget)         │  │
│   │   Vanilla JS — injects chat bubble into any theme   │  │
│   └──────────────────────┬──────────────────────────────┘  │
└──────────────────────────│──────────────────────────────────┘
                           │ POST /chat
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express Backend (Node.js)                 │
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │  /chat       │    │  /sync       │    │  /webhooks  │  │
│   │  RAG pipeline│    │  Ingest      │    │  products/  │  │
│   │              │    │  products    │    │  create     │  │
│   └──────┬───────┘    └──────┬───────┘    │  update     │  │
│          │                  │             │  delete     │  │
└──────────│──────────────────│─────────────┴─────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 Supabase (PostgreSQL + pgvector)             │
│                                                             │
│   stores table          products table                      │
│   ─────────────         ───────────────────────────────     │
│   id (uuid)             id, store_id (multi-tenant)         │
│   shop_domain           title, description, price           │
│   access_token          tags, product_type                  │
│                         available, inventory_quantity        │
│                         embedding vector(1536)  ◄── pgvector │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                         OpenAI API                          │
│   text-embedding-3-small → semantic search vectors          │
│   gpt-4o-mini            → natural language responses       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Shopify App (React Router v7)                   │
│                                                             │
│   Merchant dashboard built with Shopify's web components    │
│   ─────────────────────────────────────────────────────     │
│   • One-click product sync                                  │
│   • Product status overview                                 │
│   • OAuth handled automatically by Shopify CLI              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Technical Decisions

**Why pgvector over a dedicated vector database?**
pgvector runs inside PostgreSQL, which means product metadata (price, stock, tags) lives in the same database as the embeddings. This enables hybrid queries — semantic similarity search combined with SQL filters like `available = true`. A dedicated vector DB would require a separate query to filter by stock.

**Why text-embedding-3-small?**
At $0.02 per million tokens it is effectively free for this use case. A full product catalog sync of 500 products costs less than $0.01. Per-conversation embedding cost is ~$0.0000004.

**Why GPT-4o-mini over GPT-4o?**
GPT-4o-mini handles product recommendation prompts well and costs 15x less than GPT-4o. For a storefront assistant responding to questions like "do you have this in blue?" the quality difference is negligible.

**Multi-tenancy via store_id**
Every product row is scoped to a `store_id` UUID. The `search_products` SQL function filters by `target_store_id` at the database level — a query from store A can never retrieve products from store B.

**Embedding strategy**
Each product's embedding text is built from: `title + product_type + tags + description`. Including tags and product type significantly improves semantic retrieval for category-level queries like "baby shower gift" or "nursery decoration", not just title matches.

**Webhook-driven sync**
Products stay in sync automatically via Shopify webhooks (`products/create`, `products/update`, `products/delete`). The webhook handler regenerates the embedding immediately on update, so the vector DB is never stale.

---

## Tech Stack

| Layer        | Technology                             |
| ------------ | -------------------------------------- |
| Shopify App  | React Router v7, Shopify CLI           |
| Merchant UI  | Shopify web components (`s-*`)         |
| Backend API  | Node.js, Express, TypeScript           |
| Database     | Supabase (PostgreSQL + pgvector)       |
| Embeddings   | OpenAI text-embedding-3-small          |
| LLM          | OpenAI GPT-4o-mini                     |
| Auth         | Shopify OAuth (handled by Shopify CLI) |
| Local tunnel | Cloudflare (automatic via Shopify CLI) |

---

## Project Structure

```
ai-sales-assistant/
├── app/                          # Shopify app (React Router)
│   └── routes/
│       ├── app._index.tsx        # Merchant dashboard
│       ├── webhooks.products.upsert.tsx
│       └── webhooks.products.delete.tsx
├── extensions/
│   └── chat-widget/              # Theme App Extension
│       ├── blocks/
│       │   └── chat_bubble.liquid
│       └── assets/
│           ├── chat-widget.js    # Vanilla JS, no framework
│           └── chat-widget.css
├── backend/                      # Express API
│   └── src/
│       ├── index.ts              # Routes
│       ├── sync/
│       │   └── ingest.ts         # Product sync + embedding generation
│       ├── rag/
│       │   └── search.ts         # Retrieval + generation pipeline
│       └── webhooks/
│           └── products.ts       # Webhook handlers
└── supabase/
    └── migrations/               # Versioned schema
        ├── ..._initial_schema.sql
        ├── ..._security_fixes.sql
        ├── ..._product_metadata.sql
        └── ..._fix_search_function.sql
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- Docker Desktop
- Shopify CLI (`npm install -g @shopify/cli`)
- Supabase CLI (`brew install supabase/tap/supabase`)
- OpenAI API key

### 1. Clone and install

```bash
git clone https://github.com/youruser/ai-sales-assistant
cd ai-sales-assistant
npm install
```

### 2. Start Supabase locally

```bash
supabase start
supabase db reset
```

Copy the `Secret` key from the output — you'll need it in the next step.

### 3. Configure environment

Create `backend/.env`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=your_supabase_secret_key
OPENAI_API_KEY=your_openai_api_key
PORT=3001
```

Create `.env` in the project root:

```env
BACKEND_URL=http://localhost:3001
```

### 4. Start the backend

```bash
cd backend
npm install
npm run dev
```

### 5. Start the Shopify app

```bash
cd ..
shopify app dev
```

This automatically creates a Cloudflare tunnel, handles OAuth, and installs the app in your dev store.

### 6. Sync products

Open the app in your Shopify Admin and click **Sync Products**. This fetches your catalog, stores it in Supabase, and generates embeddings for all products.

### 7. Enable the chat widget

In your Shopify Admin go to **Online Store → Themes → Customize**, find **App embeds**, and enable **AI Chat Widget**.

---

## API Reference

### `POST /sync`

Fetches all active products from Shopify and stores them in Supabase.

```json
{ "shopDomain": "store.myshopify.com", "accessToken": "shpat_..." }
```

### `POST /embeddings`

Generates OpenAI embeddings for all products without one.

```json
{ "storeId": "uuid" }
```

### `POST /chat`

Main RAG endpoint. Accepts conversation history for multi-turn support.

```json
{
  "query": "looking for something for a newborn",
  "shopDomain": "store.myshopify.com",
  "history": [
    { "role": "user", "content": "hi" },
    { "role": "assistant", "content": "Hello! How can I help you?" }
  ]
}
```

### `POST /webhooks/products/upsert`

Called by Shopify when a product is created or updated. Regenerates embedding automatically.

### `POST /webhooks/products/delete`

Called by Shopify when a product is deleted. Removes it from Supabase.

---

## Security

- **Row Level Security (RLS)** enabled on all tables — only the service role key can read/write data
- **Access tokens** are stored server-side only, never exposed to the client
- **Multi-tenant isolation** enforced at the database level via `store_id` scoping
- pgvector extension installed in a dedicated `extensions` schema, not `public`
- All RLS policies use `(select auth.role())` to avoid per-row re-evaluation

---

## Potential Improvements

- Streaming responses from the LLM to the chat widget
- Admin analytics page — most asked questions, add-to-cart conversion from chat
- Configurable assistant persona and tone from the merchant dashboard
- Support for product variants (size, color) in the context
- Rate limiting on the `/chat` endpoint per shop domain
- Publish to the Shopify App Store
