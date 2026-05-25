import { NextResponse } from "next/server";

export interface AppError {
  message: string;
  code: string;
  status: number;
}

/**
 * Parses Firebase Auth & Firestore exceptions into clean user-facing strings
 */
export function parseFirebaseError(error: any): string {
  if (!error) return "An unexpected error occurred.";

  const code = error.code || "";
  
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Incorrect email or password. Please check your credentials.";
    case "auth/user-not-found":
      return "No account exists with this email address.";
    case "auth/email-already-in-use":
      return "This email is already registered. Please sign in instead.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Access to this account has been temporarily disabled.";
    case "permission-denied":
      return "Access denied: You do not have permissions to modify this resource.";
    case "resource-exhausted":
      return "Server limit reached. Please try again in a few moments.";
    default:
      return error.message || "An unexpected database operation error occurred.";
  }
}

/**
 * Standardizes Shopify Admin API status failures and rate-limiting responses
 */
export function parseShopifyError(status: number, detailText?: string): string {
  if (status === 401) {
    return "Invalid Shopify Access Token. Please verify store API credentials.";
  }
  if (status === 403) {
    return "Forbidden: API scope permissions missing on Shopify App configuration.";
  }
  if (status === 429) {
    return "Shopify API Rate limit hit. Operations will automatically retry shortly.";
  }
  if (status >= 500) {
    return `Shopify Remote server returned an error: (${status}). Please try again later.`;
  }
  return detailText || `Shopify query failed with status: ${status}.`;
}

/**
 * Helper to return uniform JSON error payloads for Next.js Server Routes
 */
export function handleApiError(error: unknown, fallbackMessage = "API request failed"): NextResponse {
  console.error("API error details:", error);
  
  const err = error as any;
  const message = err.message || fallbackMessage;
  const status = err.status || 500;
  const code = err.code || "INTERNAL_API_ERROR";

  return NextResponse.json(
    {
      error: message,
      code,
      success: false,
    },
    { status }
  );
}
