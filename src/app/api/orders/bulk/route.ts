import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser, checkClientAccess } from "@/lib/auth-server";
import { handleApiError } from "@/lib/errors";

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Client viewers are read-only
    if (user.role === "client_viewer") {
      return NextResponse.json(
        { error: "Forbidden: Client viewers cannot execute bulk changes" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { orderIds, confirmationStatus } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid parameters. Expected orderIds array." },
        { status: 400 }
      );
    }

    if (!confirmationStatus) {
      return NextResponse.json(
        { error: "Missing target confirmationStatus." },
        { status: 400 }
      );
    }

    const batch = adminDb.batch();
    const now = new Date();
    const updatedCount = 0;
    
    // Fetch and validate access for all target orders
    const fetchPromises = orderIds.map((id) => adminDb.collection("orders").doc(id).get());
    const orderDocs = await Promise.all(fetchPromises);

    for (const docSnapshot of orderDocs) {
      if (!docSnapshot.exists) continue;

      const orderData = docSnapshot.data()!;
      const clientId = orderData.clientId;

      // Verify access to this tenant scope
      if (!checkClientAccess(user, clientId)) {
        return NextResponse.json(
          { error: `Forbidden: No access to order brand scope for order ${docSnapshot.id}` },
          { status: 403 }
        );
      }

      // Add to batch update
      const orderRef = adminDb.collection("orders").doc(docSnapshot.id);
      const updateData: any = {
        confirmationStatus,
        "timestamps.updated": now,
      };

      if (confirmationStatus === "confirmed") {
        updateData["timestamps.verified"] = now;
      } else if (confirmationStatus === "cancelled") {
        updateData["timestamps.cancelled"] = now;
      }

      batch.update(orderRef, updateData);

      // Add audit logs in batch too!
      const logRef = adminDb.collection("activity_logs").doc();
      batch.set(logRef, {
        id: logRef.id,
        orderId: docSnapshot.id,
        clientId,
        action: "bulk_status_changed",
        description: `Order status bulk changed to '${confirmationStatus}' in batch processing.`,
        performedBy: user.displayName || user.email,
        timestamp: now,
      });
    }

    // Execute atomic batch
    await batch.commit();

    return NextResponse.json({
      success: true,
      updatedCount: orderDocs.filter(d => d.exists).length,
    });
  } catch (error) {
    return handleApiError(error, "Bulk status operations failed");
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Client viewers are read-only
    if (user.role === "client_viewer") {
      return NextResponse.json(
        { error: "Forbidden: Client viewers cannot delete orders" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { orderIds } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid parameters. Expected orderIds array." },
        { status: 400 }
      );
    }

    const now = new Date();
    let deletedCount = 0;
    const chunkSize = 200;

    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const fetchPromises = chunk.map((id) => adminDb.collection("orders").doc(id).get());
      const orderDocs = await Promise.all(fetchPromises);

      const batch = adminDb.batch();

      for (const docSnapshot of orderDocs) {
        if (!docSnapshot.exists) continue;

        const orderData = docSnapshot.data()!;
        const clientId = orderData.clientId;

        // Verify access to this tenant scope
        if (!checkClientAccess(user, clientId)) {
          return NextResponse.json(
            { error: `Forbidden: No access to order brand scope for order ${docSnapshot.id}` },
            { status: 403 }
          );
        }

        const orderRef = adminDb.collection("orders").doc(docSnapshot.id);
        batch.delete(orderRef);

        // Add audit logs in batch
        const logRef = adminDb.collection("activity_logs").doc();
        batch.set(logRef, {
          id: logRef.id,
          orderId: docSnapshot.id,
          clientId,
          action: "deleted",
          description: `Order #${orderData.orderNumber || docSnapshot.id} was permanently deleted from dashboard.`,
          performedBy: user.displayName || user.email,
          timestamp: now,
        });

        deletedCount++;
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    return handleApiError(error, "Bulk delete operations failed");
  }
}

