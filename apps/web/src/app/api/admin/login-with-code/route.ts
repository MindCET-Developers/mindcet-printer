import { NextRequest, NextResponse } from "next/server";
import { debugLogServer } from "@/lib/debug-log-server";
import { getAdminEmails } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; code?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const code = body?.code?.trim() || "";
  const allowedEmails = getAdminEmails();
  const accessCode = process.env.ADMIN_ACCESS_CODE?.trim() || "";

  if (!email || !code) {
    return NextResponse.json({ error: "יש להזין אימייל וקוד גישה." }, { status: 400 });
  }

  if (!accessCode) {
    debugLogServer("api/admin/login-with-code:POST", "access code not configured", { hasAccessCode: false }, "R");
    return NextResponse.json({ error: "קוד גישה למנהל לא מוגדר בשרת (ADMIN_ACCESS_CODE)." }, { status: 503 });
  }

  if (!allowedEmails.includes(email)) {
    debugLogServer("api/admin/login-with-code:POST", "email not in admin list", { emailAllowed: false }, "C");
    return NextResponse.json({ error: "האימייל לא ברשימת המנהלים." }, { status: 403 });
  }

  if (code !== accessCode) {
    debugLogServer("api/admin/login-with-code:POST", "invalid access code", { emailAllowed: true }, "R");
    return NextResponse.json({ error: "קוד גישה שגוי." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    debugLogServer("api/admin/login-with-code:POST", "generateLink failed", {
      errorMessage: linkError?.message || "missing hashed_token"
    }, "R");
    return NextResponse.json({ error: linkError?.message || "יצירת סשן נכשלה." }, { status: 500 });
  }

  const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email"
  });

  if (verifyError || !sessionData.session) {
    debugLogServer("api/admin/login-with-code:POST", "verifyOtp failed", {
      errorMessage: verifyError?.message || "missing session"
    }, "R");
    return NextResponse.json({ error: verifyError?.message || "אימות הסשן נכשל." }, { status: 500 });
  }

  debugLogServer("api/admin/login-with-code:POST", "admin session issued without email", { ok: true }, "R");

  return NextResponse.json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token
  });
}
