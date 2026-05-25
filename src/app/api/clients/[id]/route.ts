import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    const { id } = await params;

    // Only super admins can modify store configurations/templates/staff
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { name, logoUrl, status, whatsappTemplates, staffIds, whatsappGroupUrl, shopifyDomain, shopifyAccessToken } = body;

    const clientRef = adminDb.collection("clients").doc(id);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (status !== undefined) updateData.status = status;
    if (whatsappTemplates !== undefined) updateData.whatsappTemplates = whatsappTemplates;
    if (staffIds !== undefined) updateData.staffIds = staffIds;
    if (whatsappGroupUrl !== undefined) updateData.whatsappGroupUrl = whatsappGroupUrl;
    if (shopifyDomain !== undefined) updateData.shopifyDomain = shopifyDomain || "CSV_IMPORT_MODE";

    if (shopifyAccessToken) {
      const { encrypt } = await import("@/lib/crypto");
      updateData.shopifyAccessTokenEncrypted = encrypt(shopifyAccessToken);
      
      const clientData = clientDoc.data()!;
      let secret = clientData.shopifyWebhookSecret;
      if (!secret) {
        secret = crypto.randomUUID().replace(/-/g, "");
        updateData.shopifyWebhookSecret = secret;
      }

      // Automatically register webhooks on Shopify
      const { registerShopifyWebhooks } = await import("@/lib/shopify");
      const protocol = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host");
      const webhookBaseUrl = `${protocol}://${host}/api/webhooks/shopify`;

      await registerShopifyWebhooks(
        shopifyDomain || clientData.shopifyDomain,
        shopifyAccessToken,
        webhookBaseUrl
      );

      // Transition status to active
      updateData.status = "active";
    }

    await clientRef.update(updateData);

    // Update client list on users assigned to this client
    if (staffIds !== undefined) {
      // For simplicity, we also ensure we sync staff profiles' clientIds when updating.
      // Fetch all staff members that were in the original staff list or are now in it
      const originalStaff = clientDoc.data()?.staffIds || [];
      const allStaffUids = Array.from(new Set([...originalStaff, ...staffIds]));

      for (const staffUid of allStaffUids) {
        const userRef = adminDb.collection("users").doc(staffUid);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
          const currentClients = userDoc.data()?.clientIds || [];
          let updatedClients = [...currentClients];
          
          if (staffIds.includes(staffUid)) {
            // Assign client
            if (!updatedClients.includes(id)) {
              updatedClients.push(id);
            }
          } else {
            // Remove client
            updatedClients = updatedClients.filter((cid) => cid !== id);
          }
          await userRef.update({ clientIds: updatedClients });
        }
      }
    }

    // Log the change
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      clientId: id,
      action: "store_updated",
      description: `Client store properties updated.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update client error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    const { id } = await params;

    // Only super admins can delete clients
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const clientRef = adminDb.collection("clients").doc(id);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Perform cascade delete of orders, logs, notifications, etc. (best practice)
    // To fit within Spark free tier limits, we delete the client doc and log the deletion.
    await clientRef.delete();

    // Log the deletion
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      clientId: id,
      action: "store_deleted",
      description: `Client store ${clientDoc.data()?.name} removed from the system.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
