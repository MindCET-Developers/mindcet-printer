import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { publicSetupError } from "@/lib/api-errors";
import { sanitizePdfFileName } from "@/lib/files";
import { readAppSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase-admin";
import type { ColorMode, DuplexMode } from "@/lib/types";

export const runtime = "nodejs";

const allowedColorModes = new Set<ColorMode>(["bw", "color"]);
const allowedDuplexModes = new Set<DuplexMode>(["one_sided", "two_sided_long_edge", "two_sided_short_edge"]);

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase לא מוגדר עדיין. יש למלא משתני סביבה." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו JSON תקין." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const settings = await readAppSettings(supabase);

  if (!settings.public_upload_enabled) {
    return NextResponse.json({ error: "העלאות ציבוריות כבויות כרגע." }, { status: 403 });
  }

  const userName = typeof body.user_name === "string" ? body.user_name.trim() : "";
  const copies = Number(body.copies || 1);
  const colorMode = (body.color_mode as ColorMode) || "bw";
  const duplexMode = (body.duplex_mode as DuplexMode) || "one_sided";
  const confirmed = body.confirmed === true || body.confirmed === "yes";
  const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
  const fileSizeBytes = typeof body.file_size_bytes === "number" ? body.file_size_bytes : 0;

  if (!userName || userName.length < 2) {
    return NextResponse.json({ error: "יש להזין שם מלא." }, { status: 400 });
  }

  if (!confirmed) {
    return NextResponse.json({ error: "יש לאשר שהקובץ מוכן להדפסה." }, { status: 400 });
  }

  if (!fileName) {
    return NextResponse.json({ error: "חסר שם קובץ." }, { status: 400 });
  }

  if (fileSizeBytes <= 0) {
    return NextResponse.json({ error: "הקובץ ריק." }, { status: 400 });
  }

  const maxBytes = settings.max_file_size_mb * 1024 * 1024;
  if (fileSizeBytes > maxBytes) {
    return NextResponse.json({ error: `הקובץ גדול מדי. המגבלה היא ${settings.max_file_size_mb}MB.` }, { status: 400 });
  }

  if (!Number.isInteger(copies) || copies < 1 || copies > 5) {
    return NextResponse.json({ error: "מספר העותקים חייב להיות בין 1 ל-5." }, { status: 400 });
  }

  if (!allowedColorModes.has(colorMode)) {
    return NextResponse.json({ error: "מצב צבע לא תקין." }, { status: 400 });
  }

  if (!allowedDuplexModes.has(duplexMode)) {
    return NextResponse.json({ error: "מצב דו-צדדי לא תקין." }, { status: 400 });
  }

  const jobId = randomUUID();
  const statusToken = randomBytes(32).toString("hex");
  const safeFileName = sanitizePdfFileName(fileName);
  const filePath = `print-jobs/${jobId}/document.pdf`;

  const { error: insertError } = await supabase.from("print_jobs").insert({
    id: jobId,
    user_name: userName,
    user_email: optionalString(body.user_email),
    user_phone: optionalString(body.user_phone),
    room_or_company: optionalString(body.room_or_company),
    file_name: safeFileName,
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    file_mime_type: "application/pdf",
    status: "uploading",
    copies,
    color_mode: colorMode,
    duplex_mode: duplexMode,
    notes: optionalString(body.notes),
    requires_manual_approval: settings.manual_approval_required,
    status_token: statusToken,
    user_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent")
  });

  if (insertError) {
    return NextResponse.json({ error: publicSetupError(insertError) }, { status: 500 });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("print-files")
    .createSignedUploadUrl(filePath);

  if (signedError || !signedData) {
    await supabase.from("print_jobs").delete().eq("id", jobId);
    return NextResponse.json({ error: publicSetupError(signedError ?? new Error("Failed to create upload URL")) }, { status: 500 });
  }

  return NextResponse.json({
    jobId,
    statusToken,
    filePath,
    uploadUrl: signedData.signedUrl,
    statusUrl: `/status/${jobId}?token=${statusToken}`
  });
}

function optionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}
