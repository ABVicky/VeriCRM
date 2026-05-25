import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  // Use dynamic imports to prevent import hoisting from triggering environment validations early
  const { adminDb } = await import("../lib/firebase-admin");
  const { encrypt } = await import("../lib/crypto");

  const shopifyDomain = "neednbuy.in";
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "atkn_placeholder_token";
  const shopifyWebhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "shpss_placeholder_secret";
  const storeName = "Need N Buy";

  console.log(`🚀 Starting verification for Shopify store: ${shopifyDomain}...`);

  // 1. Validate API connection by fetching shop info
  try {
    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2024-04/shop.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": shopifyAccessToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Shopify API Verification Failed (Status: ${response.status})`);
      console.error(`Details: ${errorText}`);
      process.exit(1);
    }

    const shopData = await response.json();
    console.log(`✅ Shopify API Verification Success! connected to: ${shopData.shop.name} (${shopData.shop.email})`);

    // 2. Encrypt token
    const shopifyAccessTokenEncrypted = encrypt(shopifyAccessToken);
    console.log("🔒 Encrypted Shopify access token successfully.");

    // 3. Register client configuration securely in Firestore
    const clientId = "client_neednbuy";
    const clientRef = adminDb.collection("clients").doc(clientId);

    const clientDoc = {
      id: clientId,
      name: storeName,
      logoUrl: "",
      shopifyDomain,
      shopifyAccessTokenEncrypted,
      shopifyWebhookSecret, // Store the provided webhook secret
      whatsappTemplates: [
        {
          id: "template_1",
          name: "COD Confirmation Request",
          language: "English",
          message: "Hello {{customer_name}}, thank you for shopping with {{store_name}} ❤️\n\nWe received your order #{{order_number}} for {{products}} worth {{currency}} {{amount}}.\n\nPlease click verification link or reply CONFIRM to verify your order so we can process it quickly 🚚",
        }
      ],
      staffIds: [],
      status: "active",
      createdAt: new Date(),
    };

    await clientRef.set(clientDoc);
    console.log(`💾 Saved client "${storeName}" to Firestore collection "clients" (ID: ${clientId})`);

    // 4. Register webhooks for local sync, or placeholder production url
    // Webhook registration requires a HTTPS endpoint. We register a placeholder url that can be updated on deploy.
    const productionPlaceholderUrl = `https://vericrm-neednbuy.vercel.app/api/webhooks/shopify`;
    console.log(`📡 Registering Shopify webhooks for: ${productionPlaceholderUrl}...`);
    
    const topics = ["orders/create", "orders/updated", "orders/cancelled"];
    for (const topic of topics) {
      const webhookResponse = await fetch(
        `https://${shopifyDomain}/admin/api/2024-04/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": shopifyAccessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${productionPlaceholderUrl}?topic=${topic}&shop=${shopifyDomain}`,
              format: "json",
            },
          }),
        }
      );
      
      const webhookData = await webhookResponse.json();
      console.log(`- Webhook "${topic}" registration status: ${webhookResponse.status}`);
      if (!webhookResponse.ok) {
        console.warn(`  Warning: Webhook topic registration failed or already exists. details:`, JSON.stringify(webhookData));
      }
    }

    console.log("🎉 Store connected successfully!");

  } catch (error: any) {
    console.error("❌ Connection failed with error:", error.message);
    process.exit(1);
  }
}

main();
