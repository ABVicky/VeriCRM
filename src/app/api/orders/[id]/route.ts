import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    const { id: orderId } = await params;

    // Fetch order first to check scope
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    const clientId = orderData.clientId;

    // Check tenant access (Staff and Client Viewers can only access their assigned clients)
    if (user.role !== "super_admin" && !user.clientIds.includes(clientId)) {
      return NextResponse.json({ error: "Forbidden: No client access" }, { status: 403 });
    }

    // Client Viewers cannot modify orders (read-only)
    if (user.role === "client_viewer") {
      return NextResponse.json({ error: "Forbidden: Read-only viewer access" }, { status: 403 });
    }

    const body = await req.json();
    const { confirmationStatus, assignedStaffId, noteText } = body;

    const updateData: any = {};
    const logs: any[] = [];

    if (confirmationStatus !== undefined) {
      // Validate workflow transitions
      const oldStatus = orderData.confirmationStatus;
      if (oldStatus !== confirmationStatus) {
        updateData.confirmationStatus = confirmationStatus;
        
        // Update timestamps
        if (confirmationStatus === "confirmed") {
          updateData["timestamps.verified"] = new Date();
        } else if (confirmationStatus === "cancelled") {
          updateData["timestamps.cancelled"] = new Date();
        }
        updateData["timestamps.updated"] = new Date();

        logs.push({
          action: "status_changed",
          description: `Status changed from '${oldStatus}' to '${confirmationStatus}'.`,
        });
      }
    }

    if (assignedStaffId !== undefined) {
      const oldStaff = orderData.assignedStaffId || "Unassigned";
      updateData.assignedStaffId = assignedStaffId;
      updateData["timestamps.updated"] = new Date();

      logs.push({
        action: "staff_assigned",
        description: `Staff assignment updated from '${oldStaff}' to '${assignedStaffId || "Unassigned"}'.`,
      });
    }

    if (noteText) {
      // Add note to order notes list
      const currentNotes = orderData.notes || [];
      const newNote = {
        text: noteText,
        author: user.displayName || user.email,
        timestamp: new Date(),
      };
      updateData.notes = [...currentNotes, newNote];
      updateData["timestamps.updated"] = new Date();

      logs.push({
        action: "note_added",
        description: `Internal note added: "${noteText.length > 30 ? noteText.substring(0, 30) + "..." : noteText}"`,
      });
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No updates provided" }, { status: 200 });
    }

    // Apply updates in Firestore
    await orderRef.update(updateData);

    // Write activity logs
    for (const logItem of logs) {
      const activityRef = adminDb.collection("activity_logs").doc();
      await activityRef.set({
        id: activityRef.id,
        orderId,
        clientId,
        action: logItem.action,
        description: logItem.description,
        performedBy: user.displayName || user.email,
        timestamp: new Date(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update order error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
