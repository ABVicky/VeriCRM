import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyShopifyWebhook } from "@/lib/shopify";
import { decrypt } from "@/lib/crypto";
import { handleApiError } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
    const shopDomain =
      req.headers.get("x-shopify-shop-domain") ||
      new URL(req.url).searchParams.get("shop") ||
      "";
    const topic = req.headers.get("x-shopify-topic") || new URL(req.url).searchParams.get("topic") || "";

    if (!shopDomain) {
      return NextResponse.json({ error: "Missing shop domain header" }, { status: 400 });
    }

    const webhookId = req.headers.get("x-shopify-webhook-id") || "";
    if (webhookId) {
      const logRef = adminDb.collection("webhook_logs").doc(webhookId);
      const logDoc = await logRef.get();
      if (logDoc.exists) {
        return NextResponse.json({ message: "Duplicate webhook event bypassed" }, { status: 200 });
      }
      await logRef.set({
        id: webhookId,
        shopDomain,
        topic,
        processedAt: new Date(),
      });
    }

    // 1. Fetch the client store settings from Firestore
    const clientsRef = adminDb.collection("clients");
    const querySnapshot = await clientsRef
      .where("shopifyDomain", "==", shopDomain)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json({ error: `Client store not found for domain: ${shopDomain}` }, { status: 404 });
    }

    const clientDoc = querySnapshot.docs[0]!;
    const clientId = clientDoc.id;
    const clientData = clientDoc.data();

    // 2. Verify webhook HMAC signature
    // We use the client's shopifyWebhookSecret or fall back to an environment variable
    const webhookSecret = clientData.shopifyWebhookSecret || process.env.SHOPIFY_WEBHOOK_SECRET || "";
    if (webhookSecret) {
      const isValid = verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret);
      if (!isValid) {
        return NextResponse.json({ error: "Unauthorized: HMAC validation failed" }, { status: 401 });
      }
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
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dupQuery = await adminDb
          .collection("orders")
          .where("clientId", "==", clientId)
          .where("phone", "==", phone)
          .where("timestamps.created", ">=", oneDayAgo)
          .get();

        if (!dupQuery.empty) {
          dupQuery.forEach((doc) => {
            duplicateOrderIds.push(doc.id);
          });
          duplicateRiskPoints = 40; // High points if ordered in past 24 hrs
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
