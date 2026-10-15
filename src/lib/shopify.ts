import crypto from "crypto";

interface ShopifyOrder {
  id: number;
  order_number: number;
  total_price: string;
  currency: string;
  gateway: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  updated_at: string;
  note: string | null;
  tags: string;
  phone: string | null;
  email: string | null;
  customer?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  };
  shipping_address?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  };
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    variant_title: string | null;
  }>;
}

/**
 * Normalizes Shopify domain strings (e.g., strips protocols, trailing slashes)
 */
export function normalizeShopifyDomain(input: string): string {
  if (!input) return "";
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0] || "";
  return domain;
}

/**
 * Validates whether the incoming request is an authentic Shopify webhook
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string,
  apiSecret: string
): boolean {
  const cleanHeader = (hmacHeader || "").trim();
  const cleanSecret = (apiSecret || "").trim();
  if (!cleanHeader || !cleanSecret) return false;

  try {
    const hash = crypto
      .createHmac("sha256", cleanSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    const hashBuf = Buffer.from(hash, "utf-8");
    const hmacBuf = Buffer.from(cleanHeader, "utf-8");

    if (hashBuf.length !== hmacBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuf, hmacBuf);
  } catch (error) {
    console.error("Shopify webhook HMAC check error:", error);
    return false;
  }
}

/**
 * Registers webhooks on Shopify store
 */
export async function registerShopifyWebhooks(
  shopDomain: string,
  accessToken: string,
  webhookUrl: string
) {
  const topics = ["orders/create", "orders/updated", "orders/cancelled"];
  const results = [];

  for (const topic of topics) {
    try {
      const response = await fetch(
        `https://${shopDomain}/admin/api/2024-04/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${webhookUrl}?topic=${topic}&shop=${shopDomain}`,
              format: "json",
            },
          }),
        }
      );

      const data = await response.json();
      results.push({ topic, status: response.status, data });
    } catch (error) {
      results.push({ topic, error: (error as Error).message });
    }
  }

  return results;
}

/**
 * Fetches recent orders from Shopify
 */
export async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string,
  limit = 50
): Promise<ShopifyOrder[]> {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-04/orders.json?limit=${limit}&status=any`,
    {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch Shopify orders: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  return data.orders || [];
}
