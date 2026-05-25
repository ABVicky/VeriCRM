import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { decrypt } from "@/lib/crypto";
import { fetchShopifyOrders } from "@/lib/shopify";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    const { id: clientId } = await params;

    // Verify user has access to this client
    if (user.role !== "super_admin" && !user.clientIds.includes(clientId)) {
      return NextResponse.json({ error: "Forbidden: No client access" }, { status: 403 });
    }

    // 1. Fetch client info
    const clientRef = adminDb.collection("clients").doc(clientId);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Client store not found" }, { status: 404 });
    }

    const clientData = clientDoc.data()!;
    if (!clientData.shopifyAccessTokenEncrypted) {
      return NextResponse.json({ error: "Client credentials not configured" }, { status: 400 });
    }

    // 2. Decrypt access token
    let accessToken: string;
    try {
      accessToken = decrypt(clientData.shopifyAccessTokenEncrypted);
    } catch (err) {
      return NextResponse.json({ error: "Failed to decrypt API access credentials" }, { status: 500 });
    }

    // 3. Fetch Shopify orders
    const shopifyOrders = await fetchShopifyOrders(clientData.shopifyDomain, accessToken, 50);

    let newCount = 0;
    let updateCount = 0;

    // 4. Save/Sync each order
    for (const order of shopifyOrders) {
      const shopifyOrderId = String(order.id);
      const orderRef = adminDb.collection("orders").doc(`${clientId}_${shopifyOrderId}`);
      const existingDoc = await orderRef.get();

      const orderNumber = String(order.order_number || order.id);
      const email = order.email || "";
      const phone = order.phone || order.customer?.phone || order.shipping_address?.phone || "";
      
      const customerName = order.shipping_address
        ? `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim()
        : order.customer
        ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
        : "Guest Customer";

      const address = order.shipping_address
        ? `${order.shipping_address.address1 || ""} ${order.shipping_address.address2 || ""}`.trim()
        : "";
      const city = order.shipping_address?.city || "";
      const state = order.shipping_address?.province || "";
      const country = order.shipping_address?.country || "";
      const totalAmount = parseFloat(order.total_price || "0");
      const paymentMethod = order.gateway || "";
      
      const isCod = ["cash_on_delivery", "cod", "manual"].some(
        (method) => paymentMethod.toLowerCase().includes(method)
      );

      const products = (order.line_items || []).map((item: any) => ({
        id: item.id,
        name: item.title,
        qty: item.quantity,
        variant: item.variant_title || "Default",
        price: parseFloat(item.price || "0"),
      }));

      const tags = (order.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      const note = order.note || "";
      const fulfillmentStatus = order.fulfillment_status || "unfulfilled";

      if (!existingDoc.exists) {
        // Run verification automations
        if (isCod && !tags.includes("COD")) {
          tags.push("COD");
        }

        // Duplicate order check
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
            duplicateRiskPoints = 40;
          }
        }

        // Compute risk score
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
        riskScore = Math.min(riskScore, 100);

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
            created: new Date(order.created_at || Date.now()),
            updated: new Date(order.updated_at || Date.now()),
            sync: new Date(),
          },
          confirmationStatus: initialConfirmationStatus,
          riskScore,
          duplicateOrderIds,
          assignedStaffId: "",
        };

        await orderRef.set(orderData);
        newCount++;
      } else {
        // Just update fulfillment and price details
        await orderRef.update({
          fulfillmentStatus,
          totalAmount,
          tags,
          "timestamps.updated": new Date(order.updated_at || Date.now()),
        });
        updateCount++;
      }
    }

    // Log the sync activity
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      clientId,
      action: "store_synced",
      description: `Manual order sync completed. Imported ${newCount} new, updated ${updateCount} orders.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      importedCount: newCount,
      updatedCount: updateCount,
    });
  } catch (error) {
    console.error("Manual order sync error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
