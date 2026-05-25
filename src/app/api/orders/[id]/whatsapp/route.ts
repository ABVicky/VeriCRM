import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    const { id: orderId } = await params;

    // Fetch order details
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    const clientId = orderData.clientId;

    // Verify tenant access
    if (user.role !== "super_admin" && !user.clientIds.includes(clientId)) {
      return NextResponse.json({ error: "Forbidden: No client access" }, { status: 403 });
    }

    if (user.role === "client_viewer") {
      return NextResponse.json({ error: "Forbidden: Read-only viewer access" }, { status: 403 });
    }

    const body = await req.json();
    const { messageContent, phone } = body;

    if (!messageContent || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update order confirmation status to whatsapp_sent if it's currently "new"
    const currentStatus = orderData.confirmationStatus;
    const updates: any = {
      "timestamps.updated": new Date(),
    };

    if (currentStatus === "new" || currentStatus === "fraud") {
      updates.confirmationStatus = "whatsapp_sent";
    }

    await orderRef.update(updates);

    // Save WhatsApp log
    const whatsappLogRef = adminDb.collection("whatsapp_logs").doc();
    await whatsappLogRef.set({
      id: whatsappLogRef.id,
      orderId,
      clientId,
      phone,
      messageSent: messageContent,
      sentBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    // Write activity log
    const activityRef = adminDb.collection("activity_logs").doc();
    await activityRef.set({
      id: activityRef.id,
      orderId,
      clientId,
      action: "whatsapp_sent",
      description: `WhatsApp message initiated to ${phone} by ${user.displayName || user.email}.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WhatsApp log error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
