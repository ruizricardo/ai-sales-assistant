import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const body = await request.json();

  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

  fetch(`${backendUrl}/webhooks/products/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-shop-domain": shopDomain || "",
    },
    body: JSON.stringify(body),
  }).catch((err) => console.error("Error forwarding webhook:", err));

  return new Response("ok", { status: 200 });
}
