import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Only super admins can manage/list staff
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const usersSnapshot = await adminDb.collection("users").get();
    const users = usersSnapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser(req);

    // Only super admins can update roles
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { targetUid, role, clientIds } = body;

    if (!targetUid || !role || !clientIds) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const targetUserRef = adminDb.collection("users").doc(targetUid);
    const targetUserDoc = await targetUserRef.get();

    if (!targetUserDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const oldData = targetUserDoc.data()!;

    // Perform the update
    await targetUserRef.update({
      role,
      clientIds,
    });

    // Write audit log
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      action: "user_role_updated",
      description: `Updated role of ${oldData.email} from ${oldData.role} to ${role}. Assigned to ${clientIds.length} stores.`,
      performedBy: user.displayName || user.email,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
