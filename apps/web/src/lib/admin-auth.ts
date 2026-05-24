import { NextRequest } from "next/server";
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
    return { ok: false as const, status: 401, message: "נדרשת התחברות מנהל." };
  }

  const allowedEmails = getAdminEmails();
  if (allowedEmails.length === 0) {
    return { ok: false as const, status: 500, message: "ADMIN_EMAILS לא מוגדר." };
  }

  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();

  if (error || !email || !allowedEmails.includes(email)) {
    return { ok: false as const, status: 403, message: "אין הרשאת מנהל למשתמש הזה." };
  }

  return { ok: true as const, email, supabase };
}
