import { adminAuth, adminDb } from "./firebase-admin";

export interface ServerUser {
  uid: string;
  email: string;
  role: "super_admin" | "staff" | "client_viewer";
  clientIds: string[];
  displayName?: string;
}

/**
 * Validates the Authorization header and returns the authenticated user's profile and role.
 * Throws an error if authorization fails.
 */
export async function getSessionUser(req: Request): Promise<ServerUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Fetch user document from firestore to check role and tenant scopes
    const userDoc = await adminDb.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      // Auto-provision user record as super_admin so admin data is never locked
      const newUser = {
        uid,
        email: decodedToken.email || "",
        role: "super_admin" as const,
        clientIds: [],
        displayName: decodedToken.name || (decodedToken.email ? decodedToken.email.split("@")[0] : "Admin"),
        createdAt: new Date(),
      };
      await adminDb.collection("users").doc(uid).set(newUser);
      return newUser;
    }

    const userData = userDoc.data()!;
    return {
      uid,
      email: decodedToken.email || userData.email || "",
      role: userData.role || "super_admin",
      clientIds: userData.clientIds || [],
      displayName: userData.displayName || "",
    };
  } catch (error) {
    throw new Error(`Unauthorized: ${(error as Error).message}`);
  }
}

/**
 * Helper to check if a user is authorized to access data for a specific client
 */
export function checkClientAccess(user: ServerUser, clientId: string): boolean {
  if (user.role === "super_admin") return true;
  return user.clientIds.includes(clientId);
}
