import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser, checkClientAccess } from "@/lib/auth-server";
import { handleApiError } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Client viewers are read-only
    if (user.role === "client_viewer") {
      return NextResponse.json(
        { error: "Forbidden: Client viewers cannot import orders" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { clientId, orders } = body;

    if (!clientId || !orders || !Array.isArray(orders)) {
      return NextResponse.json(
        { error: "Invalid parameters. Expected clientId and orders array." },
        { status: 400 }
      );
    }

    // Verify access to this tenant scope
    if (!checkClientAccess(user, clientId)) {
      return NextResponse.json(
        { error: `Forbidden: No access to order brand scope for client ${clientId}` },
        { status: 403 }
      );
    }

    // Fetch client store settings from Firestore
    const clientRef = adminDb.collection("clients").doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Client brand not found" }, { status: 404 });
    }
    const clientData = clientDoc.data()!;

    let importedCount = 0;
    let duplicateCount = 0;
    const now = new Date();

    // Process orders in chunks of 400 to fit under the Firestore writeBatch limit of 500 operations
    const chunkSize = 200; // 200 orders (each has an order set + log set = 400 operations)
    
    for (let i = 0; i < orders.length; i += chunkSize) {
      const chunk = orders.slice(i, i + chunkSize);
      const batch = adminDb.batch();

      for (const order of chunk) {
        // Shopify orders CSV standard column extracts
        const shopifyOrderId = String(order.id || order.name || `csv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
        const orderNumber = String(order.name || order.orderNumber || "");
        const email = order.email || "";
        const phone = String(order.phone || "");
        const customerName = String(order.customerName || "Guest Customer");
        const address = String(order.address || "");
        const city = String(order.city || "");
        const state = String(order.state || "");
        const country = String(order.country || "");
        const totalAmount = parseFloat(order.totalAmount || "0");
        const paymentMethod = String(order.paymentMethod || "");
        const isCod = ["cash_on_delivery", "cod", "manual", "collect on delivery"].some(
          (method) => paymentMethod.toLowerCase().includes(method)
        ) || String(order.gateway || "").toLowerCase().includes("cod");

        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
        const tags = Array.isArray(order.tags) ? order.tags : [];
        if (isCod && !tags.includes("COD")) {
          tags.push("COD");
        }

        const fulfillmentStatus = order.fulfillmentStatus || "unfulfilled";
        const orderDate = order.createdAt ? new Date(order.createdAt) : now;

        const docId = `${clientId}_${shopifyOrderId}`;
        const orderRef = adminDb.collection("orders").doc(docId);

        // Deduplication: we will skip checks in batch to keep it fast, but we can verify existing database files
        // For performance in CSV, we do a check in the chunk loop if the order already exists
        const existsDoc = await orderRef.get();
        if (existsDoc.exists) {
          duplicateCount++;
          continue;
        }

        // Fraud analysis calculations
        let riskScore = 0;
        if (isCod) riskScore += 10;
        if (isCod && totalAmount > 5000) riskScore += 20;
        if (!phone || phone.length < 10) riskScore += 30;

        const suspiciousAddressKeywords = ["test", "dummy", "fake", "asd", "1234"];
        const hasSuspiciousAddr = suspiciousAddressKeywords.some((word) =>
          address.toLowerCase().includes(word)
        );
        if (hasSuspiciousAddr) riskScore += 25;

        // Ensure riskScore maxes out at 100
        riskScore = Math.min(riskScore, 100);

        const initialConfirmationStatus = riskScore >= 75 ? "fraud" : "new";

        const orderData = {
          id: docId,
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
          products: lineItems,
          paymentMethod,
          isCod,
          totalAmount,
          notes: order.note ? [{ text: `CSV Import Note: ${order.note}`, author: "CSV Importer", timestamp: now }] : [],
          tags,
          fulfillmentStatus,
          timestamps: {
            created: orderDate,
            updated: now,
            sync: now,
          },
          confirmationStatus: initialConfirmationStatus,
          riskScore,
          duplicateOrderIds: [],
          assignedStaffId: "",
        };

        batch.set(orderRef, orderData);

        // Add activity log in batch
        const activityRef = adminDb.collection("activity_logs").doc();
        batch.set(activityRef, {
          id: activityRef.id,
          orderId: docId,
          clientId,
          action: "created",
          description: `Order imported via CSV. Payment: ${paymentMethod}. Risk Score: ${riskScore}%.`,
          performedBy: user.displayName || user.email,
          timestamp: now,
        });

        importedCount++;
      }

      await batch.commit();
    }

    // Update Client status / last sync log
    if (importedCount > 0) {
      const activityLogRef = adminDb.collection("activity_logs").doc();
      await activityLogRef.set({
        id: activityLogRef.id,
        clientId,
        action: "csv_import",
        description: `Imported ${importedCount} orders via CSV file (${duplicateCount} duplicate order IDs skipped).`,
        performedBy: user.displayName || user.email,
        timestamp: now,
      });
    }

    return NextResponse.json({
      success: true,
      importedCount,
      duplicateCount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to import CSV orders");
  }
}
