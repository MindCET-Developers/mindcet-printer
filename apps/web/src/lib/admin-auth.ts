import { NextRequest } from "next/server";
import { debugLogServer } from "./debug-log-server";
import { getAdminEmails } from "./env";
import { createServiceClient } from "./supabase-admin";

const localDevToken = "printdesk-local-dev-admin";

export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length)
    : "";
  const supabase = createServiceClient();

  if (token === localDevToken && process.env.NODE_ENV !== "production") {
    return { ok: true as const, email: getAdminEmails()[0] || "local-dev@printdesk.local", supabase };
  }

  if (!token) {
    debugLogServer("admin-auth.ts:requireAdmin", "denied missing token", { status: 401 }, "D");
    return { ok: false as const, status: 401, message: "נדרשת התחברות מנהל." };
  }

  const allowedEmails = getAdminEmails();
  if (allowedEmails.length === 0) {
    debugLogServer("admin-auth.ts:requireAdmin", "denied admin emails empty", { status: 500 }, "C");
    return { ok: false as const, status: 500, message: "ADMIN_EMAILS לא מוגדר." };
  }

  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();

  if (error || !email || !allowedEmails.includes(email)) {
    debugLogServer("admin-auth.ts:requireAdmin", "denied admin check", {
      status: 403,
      hasAuthError: Boolean(error),
      authErrorMessage: error?.message || null,
      hasEmail: Boolean(email),
      emailAllowed: email ? allowedEmails.includes(email) : false,
      allowedCount: allowedEmails.length
    }, "C,D");
    return { ok: false as const, status: 403, message: "אין הרשאת מנהל למשתמש הזה." };
  }

  debugLogServer("admin-auth.ts:requireAdmin", "admin allowed", { status: 200, emailDomain: email.split("@")[1] || "unknown" }, "C,D");
  return { ok: true as const, email, supabase };
}
