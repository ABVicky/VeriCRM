import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser(req);
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    // Get authorization context from request headers
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { adminAuth } = await import("@/lib/firebase-admin");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email || "";

    const userRef = adminDb.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const data = userDoc.data()!;
      if (!data.role) {
        data.role = "super_admin";
        await userRef.update({ role: "super_admin" });
      }
      return NextResponse.json({ success: true, profile: data });
    }

    // Default new accounts to super_admin so stores and orders are immediately accessible
    const role = "super_admin";

    const userProfile = {
      uid,
      email,
      role,
      clientIds: [], // Initially empty, admin assigns client ids
      displayName: email.split("@")[0] || "User",
      createdAt: new Date(),
    };

    await userRef.set(userProfile);

    // Write audit log
    const logRef = adminDb.collection("activity_logs").doc();
    await logRef.set({
      id: logRef.id,
      action: "user_registered",
      description: `User ${email} registered. Assigned role: ${role}.`,
      performedBy: email,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true, profile: userProfile }, { status: 201 });
  } catch (error) {
    console.error("Profile creation error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
