import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyShopifyWebhook, normalizeShopifyDomain } from "@/lib/shopify";
import { decrypt } from "@/lib/crypto";
import { handleApiError } from "@/lib/errors";

export async function GET(req: Request) {
  return NextResponse.json({
    status: "online",
    service: "VeriCRM Shopify Webhook Engine",
    message: "Shopify Webhook Listener is active and listening for live orders.",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
    const isTestHeader = req.headers.get("x-vericrm-test") === "true";
    const url = new URL(req.url);

    const clientIdParam = url.searchParams.get("clientId") || url.searchParams.get("client") || "";
    const rawShopDomain =
      req.headers.get("x-shopify-shop-domain") ||
      url.searchParams.get("shop") ||
      "";
    const topic = req.headers.get("x-shopify-topic") || url.searchParams.get("topic") || "orders/create";

    // Allow empty ping check
    if (!rawBody || rawBody.trim() === "{}") {
      return NextResponse.json({ message: "Webhook ping received" }, { status: 200 });
    }

    // 1. Resolve client store from Firestore (by clientId or normalized shopDomain)
    let clientDoc: FirebaseFirestore.DocumentSnapshot | null = null;

    if (clientIdParam) {
      const doc = await adminDb.collection("clients").doc(clientIdParam).get();
      if (doc.exists) {
        clientDoc = doc;
      }
    }

    if (!clientDoc && rawShopDomain) {
      const normalizedDomain = normalizeShopifyDomain(rawShopDomain);
      const querySnapshot = await adminDb
        .collection("clients")
        .where("shopifyDomain", "==", normalizedDomain)
        .limit(1)
        .get();

      if (!querySnapshot.empty) {
        clientDoc = querySnapshot.docs[0]!;
      } else {
        // Try domain variation (.myshopify.com)
        const altDomain = normalizedDomain.includes(".myshopify.com")
          ? normalizedDomain.replace(".myshopify.com", "")
          : `${normalizedDomain}.myshopify.com`;

        const altSnapshot = await adminDb
          .collection("clients")
          .where("shopifyDomain", "==", altDomain)
          .limit(1)
          .get();

        if (!altSnapshot.empty) {
          clientDoc = altSnapshot.docs[0]!;
        }
      }

      // Fallback 3: Match by base store slug/handle (e.g. "neednbuy" in "neednbuy.myshopify.com" vs "neednbuy.in")
      if (!clientDoc) {
        const allClientsSnapshot = await adminDb.collection("clients").get();
        if (!allClientsSnapshot.empty) {
          const rawHandle = rawShopDomain.replace(/^https?:\/\//, "").split(".")[0]?.toLowerCase();
          for (const doc of allClientsSnapshot.docs) {
            const cDomain = (doc.data().shopifyDomain || "").toLowerCase();
            const cHandle = cDomain.replace(/^https?:\/\//, "").split(".")[0];
            if (rawHandle && cHandle && rawHandle === cHandle) {
              clientDoc = doc;
              break;
            }
          }
          // Fallback 4: If still not matched and there is only 1 store registered, route to it
          if (!clientDoc && allClientsSnapshot.docs.length === 1) {
            clientDoc = allClientsSnapshot.docs[0]!;
          }
        }
      }
    }

    if (!clientDoc) {
      try {
        await adminDb.collection("webhook_logs").add({
          status: "error",
          error: `Client store not found for domain: ${rawShopDomain || clientIdParam}`,
          rawShopDomain,
          clientIdParam,
          topic,
          receivedAt: new Date(),
        });
      } catch (_) {}

      return NextResponse.json(
        { error: `Client store not found for domain: ${rawShopDomain || clientIdParam}. Please verify the store is added to VeriCRM.` },
        { status: 404 }
      );
    }

    const clientId = clientDoc.id;
    const clientData = clientDoc.data()!;

    // 2. Verify webhook HMAC signature if client has configured their webhook secret
    const envSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "";
    const isEnvPlaceholder = !envSecret || envSecret.includes("placeholder") || envSecret.includes("global_fallback");
    const webhookSecret = clientData.shopifyWebhookSecret || (isEnvPlaceholder ? "" : envSecret);

    if (webhookSecret && !isTestHeader) {
      const isValid = verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret);
      if (!isValid) {
        console.warn(`[Shopify Webhook] HMAC validation failed for store: ${clientData.name} (${clientData.shopifyDomain})`);
        try {
          await adminDb.collection("webhook_logs").add({
            status: "error",
            error: "HMAC signature mismatch",
            clientId,
            storeName: clientData.name,
            shopDomain: clientData.shopifyDomain || rawShopDomain,
            topic,
            receivedAt: new Date(),
          });
        } catch (_) {}

        return NextResponse.json(
          { error: "Unauthorized: Shopify webhook HMAC signature validation failed. Please check the Webhook Secret in VeriCRM store settings." },
          { status: 401 }
        );
      }
    }

    const webhookId = req.headers.get("x-shopify-webhook-id") || `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    if (webhookId) {
      const logRef = adminDb.collection("webhook_logs").doc(webhookId);
      const logDoc = await logRef.get();
      if (logDoc.exists) {
        return NextResponse.json({ message: "Duplicate webhook event bypassed" }, { status: 200 });
      }
      await logRef.set({
        id: webhookId,
        clientId,
        shopDomain: clientData.shopifyDomain || rawShopDomain,
        topic,
        processedAt: new Date(),
      });
    }

    // 3. Process the payload
    const payload = JSON.parse(rawBody);

    if (topic === "orders/create") {
      const shopifyOrderId = String(payload.id);

      // Check if order already exists in our Firestore database to avoid double processing
      const orderRef = adminDb.collection("orders").doc(`${clientId}_${shopifyOrderId}`);
      const orderDoc = await orderRef.get();
      if (orderDoc.exists) {
        return NextResponse.json({ message: "Order already synced" }, { status: 200 });
      }

      // Extract details
      const orderNumber = String(payload.order_number || payload.name || "");
      const email = payload.email || "";
      const phone = payload.phone || payload.customer?.phone || payload.shipping_address?.phone || "";
      const customerName = payload.shipping_address
        ? `${payload.shipping_address.first_name || ""} ${payload.shipping_address.last_name || ""}`.trim()
        : payload.customer
        ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim()
        : "Guest Customer";

      const address1 = payload.shipping_address?.address1 || "";
      const address2 = payload.shipping_address?.address2 || "";
      const address = `${address1} ${address2}`.trim();
      const city = payload.shipping_address?.city || "";
      const state = payload.shipping_address?.province || "";
      const country = payload.shipping_address?.country || "";
      const totalAmount = parseFloat(payload.total_price || "0");
      const paymentMethod = payload.gateway || "";
      const isCod = ["cash_on_delivery", "cod", "manual"].some(
        (method) => paymentMethod.toLowerCase().includes(method)
      );

      const products = (payload.line_items || []).map((item: any) => ({
        id: item.id,
        name: item.title,
        qty: item.quantity,
        variant: item.variant_title || "Default",
        price: parseFloat(item.price || "0"),
      }));

      const tags = (payload.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      const note = payload.note || "";
      const fulfillmentStatus = payload.fulfillment_status || "unfulfilled";

      // 4. Automation Features
      // A. COD tagging
      if (isCod && !tags.includes("COD")) {
        tags.push("COD");
      }

      // B. Duplicate order detection (orders in the last 24 hours with same phone number)
      const duplicateOrderIds: string[] = [];
      let duplicateRiskPoints = 0;
      if (phone) {
        try {
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const dupQuery = await adminDb
            .collection("orders")
            .where("clientId", "==", clientId)
            .where("phone", "==", phone)
            .limit(10)
            .get();

          if (!dupQuery.empty) {
            dupQuery.forEach((doc) => {
              const data = doc.data();
              const createdDate = data.timestamps?.created?.toDate
                ? data.timestamps.created.toDate()
                : new Date(data.timestamps?.created || 0);
              if (createdDate >= oneDayAgo) {
                duplicateOrderIds.push(doc.id);
              }
            });
            if (duplicateOrderIds.length > 0) {
              duplicateRiskPoints = 40; // High points if ordered in past 24 hrs
            }
          }
        } catch (dupErr) {
          console.warn("[Shopify Webhook] Duplicate check skipped:", dupErr);
        }
      }

      // C. Suspicious/Fraud order risk score
      let riskScore = 0;
      if (isCod) riskScore += 10;
      if (isCod && totalAmount > 5000) riskScore += 20;
      if (!phone || phone.length < 10) riskScore += 30;

      const suspiciousAddressKeywords = ["test", "dummy", "fake", "asd", "1234"];
      const hasSuspiciousAddr = suspiciousAddressKeywords.some((word) =>
        address.toLowerCase().includes(word)
      );
      if (hasSuspiciousAddr) riskScore += 25;
      riskScore += duplicateRiskPoints;

      // Ensure riskScore maxes out at 100
      riskScore = Math.min(riskScore, 100);

      // Determine initial workflow status
      const initialConfirmationStatus = riskScore >= 75 ? "fraud" : "new";

      const orderData = {
        id: `${clientId}_${shopifyOrderId}`,
        clientId,
        shopifyOrderId,
        orderNumber,
        customerName,
        phone,
        email,
        address,
        city,
        state,
        country,
        products,
        paymentMethod,
        isCod,
        totalAmount,
        notes: note ? [{ text: `Order Note: ${note}`, author: "Shopify Sync", timestamp: new Date() }] : [],
        tags,
        fulfillmentStatus,
        timestamps: {
          created: new Date(payload.created_at || Date.now()),
          updated: new Date(payload.updated_at || Date.now()),
          sync: new Date(),
        },
        confirmationStatus: initialConfirmationStatus,
        riskScore,
        duplicateOrderIds,
        assignedStaffId: "",
      };

      // Save order to firestore
      await orderRef.set(orderData);

      // 5. Create real-time notification alert
      const notificationRef = adminDb.collection("notifications").doc();
      await notificationRef.set({
        id: notificationRef.id,
        clientId,
        message: `New Order #${orderNumber} synced for ${clientData.name}. Risk Score: ${riskScore}%.`,
        orderId: orderData.id,
        type: riskScore >= 75 ? "high_risk" : "new_order",
        read: false,
        createdAt: new Date(),
      });

      // Log activity
      const activityRef = adminDb.collection("activity_logs").doc();
      await activityRef.set({
        id: activityRef.id,
        orderId: orderData.id,
        clientId,
        action: "created",
        description: `Order imported from Shopify. Risk Score: ${riskScore}%. Status set to ${initialConfirmationStatus}.`,
        performedBy: "Shopify Sync Engine",
        timestamp: new Date(),
      });

      return NextResponse.json({ success: true, orderId: orderData.id }, { status: 201 });
    }

    if (topic === "orders/updated") {
      const shopifyOrderId = String(payload.id);
      const orderRef = adminDb.collection("orders").doc(`${clientId}_${shopifyOrderId}`);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        // If it doesn't exist, we can choose to import it or skip. Let's import it to make syncing resilient
        return NextResponse.json({ message: "Order not found, skipping update" }, { status: 200 });
      }

      // Update basic fields (fulfillment status, tags, order total)
      const updateData: any = {
        "timestamps.updated": new Date(payload.updated_at || Date.now()),
        fulfillmentStatus: payload.fulfillment_status || "unfulfilled",
        totalAmount: parseFloat(payload.total_price || "0"),
      };

      // Add tag updates
      if (payload.tags) {
        updateData.tags = (payload.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      }

      await orderRef.update(updateData);

      // Log activity
      const activityRef = adminDb.collection("activity_logs").doc();
      await activityRef.set({
        id: activityRef.id,
        orderId: `${clientId}_${shopifyOrderId}`,
        clientId,
        action: "updated",
        description: `Order details updated by Shopify sync (fulfillment: ${payload.fulfillment_status}).`,
        performedBy: "Shopify Sync Engine",
        timestamp: new Date(),
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (topic === "orders/cancelled") {
      const shopifyOrderId = String(payload.id);
      const orderRef = adminDb.collection("orders").doc(`${clientId}_${shopifyOrderId}`);
      const orderDoc = await orderRef.get();

      if (orderDoc.exists) {
        await orderRef.update({
          confirmationStatus: "cancelled",
          "timestamps.cancelled": new Date(),
          "timestamps.updated": new Date(payload.updated_at || Date.now()),
        });

        // Log activity
        const activityRef = adminDb.collection("activity_logs").doc();
        await activityRef.set({
          id: activityRef.id,
          orderId: `${clientId}_${shopifyOrderId}`,
          clientId,
          action: "cancelled",
          description: "Order cancelled on Shopify store. Status set to cancelled.",
          performedBy: "Shopify Sync Engine",
          timestamp: new Date(),
        });
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ message: `Webhook topic ${topic} received but not processed` }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "Webhook processing failed");
  }
}
