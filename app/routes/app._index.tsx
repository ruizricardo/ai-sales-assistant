import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 10) {
        edges {
          node {
            id
            title
            status
          }
        }
      }
      shop {
        name
        myshopifyDomain
      }
    }
  `);

  const data = await response.json();

  return {
    shop: data.data.shop,
    products: data.data.products.edges.map((e: any) => e.node),
    shopDomain: session.shop,
  };
}

export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

    const syncRes = await fetch(`${backendUrl}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopDomain: session.shop,
        accessToken: session.accessToken,
      }),
    });
    const syncData = await syncRes.json();
    if (!syncRes.ok) return { error: syncData.error };

    const embRes = await fetch(`${backendUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: syncData.store_id }),
    });
    const embData = await embRes.json();

    return {
      success: true,
      synced: syncData.synced,
      embeddings: embData.updated,
    };
  }

  return null;
}

export default function Index() {
  const { shop, products, shopDomain } = useLoaderData() as any;
  const fetcher = useFetcher();

  const isSyncing = fetcher.state !== "idle";
  const result = fetcher.data as any;

  return (
    <>
      <s-page heading="AI Sales Assistant">
        <s-stack gap="base">
          {result?.success && (
            <s-banner tone="success" heading="Sync completado">
              <s-paragraph>
                {result.synced} productos sincronizados, {result.embeddings}{" "}
                embeddings generados.
              </s-paragraph>
            </s-banner>
          )}

          {result?.error && (
            <s-banner tone="critical" heading="Error">
              <s-paragraph>{result.error}</s-paragraph>
            </s-banner>
          )}

          {/* Info tienda + sync */}
          <s-section>
            <s-stack gap="base">
              <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                <s-stack gap="small-200">
                  <s-heading>{shop.name}</s-heading>
                  <s-text>{shopDomain}</s-text>
                </s-stack>
                <s-badge tone="success">Conectada</s-badge>
              </s-grid>

              <s-paragraph>
                Sincronizá tu catálogo para que el asistente conozca tus
                productos y pueda recomendarlos a tus clientes.
              </s-paragraph>

              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="sync" />
                <s-button
                  variant="primary"
                  type="submit"
                  disabled={isSyncing || undefined}
                >
                  {isSyncing ? "Sincronizando..." : "Sincronizar productos"}
                </s-button>
              </fetcher.Form>
            </s-stack>
          </s-section>

          {/* Lista de productos */}
          <s-section>
            <s-stack gap="small-200">
              <s-heading>Productos en Shopify</s-heading>
              <s-stack>
                {products.map((p: any) => (
                  <s-clickable
                    key={p.id}
                    borderStyle="solid none none none"
                    border="base"
                    paddingInline="base"
                    paddingBlock="small"
                  >
                    <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                      <s-text>{p.title}</s-text>
                      <s-badge
                        tone={p.status === "ACTIVE" ? "success" : "warning"}
                      >
                        {p.status}
                      </s-badge>
                    </s-grid>
                  </s-clickable>
                ))}
              </s-stack>
            </s-stack>
          </s-section>
        </s-stack>
      </s-page>
    </>
  );
}
