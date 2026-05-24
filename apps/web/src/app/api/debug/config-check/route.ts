import { NextResponse } from "next/server";
import { debugLogServer } from "@/lib/debug-log-server";
import { getAdminEmails, isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  const adminEmails = getAdminEmails();
  const payload = {
    nodeEnv: process.env.NODE_ENV,
    supabaseConfigured: isSupabaseConfigured(),
    hasPublicUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    adminEmailsCount: adminEmails.length,
    adminEmailDomains: adminEmails.map((email) => email.split("@")[1] || "unknown")
  };

  debugLogServer("api/debug/config-check/route.ts:GET", "server env snapshot", payload, "A,C");

  return NextResponse.json(payload);
}
