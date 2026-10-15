import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { encrypt } from "@/lib/crypto";
import { registerShopifyWebhooks, normalizeShopifyDomain } from "@/lib/shopify";

// Default template for WhatsApp Click-to-Chat
const DEFAULT_WHATSAPP_TEMPLATE = {
  id: "template_1",
  name: "COD Confirmation Request",
  language: "English",
  message: "Hello {{customer_name}}, thank you for shopping with {{store_name}} ❤️\n\nWe received your order #{{order_number}} for:\n📦 {{products}} (Total: {{currency}} {{amount}})\n\n📍 Delivery Address:\n{{address}}\n\nPlease reply CONFIRM to verify your order and delivery address so we can ship it immediately! 🚚",
};

const DEFAULT_FOLLOWUP_TEMPLATE = {
  id: "template_2",
  name: "12hr Cancel Followup",
  language: "English",
  message: "Hello {{customer_name}},\n\nThis is a quick follow-up regarding your order #{{order_number}} at {{store_name}}.\n\nWe haven't received verification for your shipping details yet. Please verify your order by replying CONFIRM. If not confirmed within 12 hours, your order will be cancelled. Thank you! 🙏",
};

export async function GET(req: Request) {
  try {
    const user = await getSessionUser(req);
    const clientsRef = adminDb.collection("clients");

    let querySnapshot;

    if (user.role === "super_admin") {
      querySnapshot = await clientsRef.get();
    } else {
      // For staff or client viewers, filter by assigned clientIds
      if (user.clientIds.length === 0) {
        return NextResponse.json([]);
      }
      // Firestore 'in' query caps at 30 items. This is perfect for Spark tier / standard limits
      querySnapshot = await clientsRef
        .where("__name__", "in", user.clientIds)
        .get();
    }

    const clients = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      // Remove encrypted token before sending to frontend
      delete data.shopifyAccessTokenEncrypted;
      return { id: doc.id, ...data };
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("Fetch clients error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Only super admins can add stores
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      shopifyDomain = "",
      shopifyAccessToken = "",
      shopifyWebhookSecret = "",
      logoUrl = "",
      whatsappGroupUrl = ""
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Missing required brand name" }, { status: 400 });
    }

    const cleanDomain = normalizeShopifyDomain(shopifyDomain);
    const cleanWebhookSecret = (shopifyWebhookSecret || "").trim();
    const cleanAccessToken = (shopifyAccessToken || "").trim();

    const clientId = adminDb.collection("clients").doc().id;
    let shopifyAccessTokenEncrypted = "";
    let webhookResults: any[] = [];

    // Construct the absolute webhook addresses dynamically using request host
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || "localhost:3000";
    const webhookBaseUrl = `${protocol}://${host}/api/webhooks/shopify`;
    const storeSpecificWebhookUrl = `${webhookBaseUrl}?clientId=${clientId}`;

    if (cleanDomain) {
      // Check if store already exists
      const existingDomainRef = await adminDb
        .collection("clients")
        .where("shopifyDomain", "==", cleanDomain)
        .limit(1)
        .get();

      if (!existingDomainRef.empty) {
        return NextResponse.json({ error: `Shopify domain "${cleanDomain}" is already connected to another brand.` }, { status: 400 });
      }

      // If an access token is provided, encrypt it and optionally auto-register webhooks
      if (cleanAccessToken) {
        shopifyAccessTokenEncrypted = encrypt(cleanAccessToken);

        try {
          webhookResults = await registerShopifyWebhooks(
            cleanDomain,
            cleanAccessToken,
            webhookBaseUrl
          );
        } catch (apiErr: any) {
          console.warn("Auto-webhook registration warning:", apiErr.message);
        }
      }
    }

    // Determine status: "active" if webhook credentials or token exist with domain
    const isStoreActive = Boolean(cleanDomain && (cleanWebhookSecret || cleanAccessToken));

    const clientData = {
      id: clientId,
      name: name.trim(),
      logoUrl: (logoUrl || "").trim(),
      shopifyDomain: cleanDomain || "CSV_IMPORT_MODE",
      shopifyAccessTokenEncrypted,
      shopifyWebhookSecret: cleanWebhookSecret,
      whatsappTemplates: [DEFAULT_WHATSAPP_TEMPLATE, DEFAULT_FOLLOWUP_TEMPLATE],
      whatsappGroupUrl: (whatsappGroupUrl || "").trim(),
      staffIds: [],
      status: isStoreActive ? "active" : "csv_mode",
      createdAt: new Date(),
    };

    await adminDb.collection("clients").doc(clientId).set(clientData);

    // Log the action
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      clientId,
      action: "store_connected",
      description: cleanDomain
        ? `Shopify store ${cleanDomain} connected with direct webhook listener${cleanWebhookSecret ? " and HMAC verification secret" : ""}.`
        : `Client brand "${name}" created in manual CSV upload mode.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      clientId,
      webhookUrl: webhookBaseUrl,
      storeSpecificWebhookUrl,
      webhooks: webhookResults,
    }, { status: 201 });
  } catch (error) {
    console.error("Create client error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
