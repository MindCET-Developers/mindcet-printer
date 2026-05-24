import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { publicSetupError } from "@/lib/api-errors";
import { isPdfFile, sanitizePdfFileName } from "@/lib/files";
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

  const supabase = createServiceClient();
  const settings = await readAppSettings(supabase);

  if (!settings.public_upload_enabled) {
    return NextResponse.json({ error: "העלאות ציבוריות כבויות כרגע." }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("file").filter((value): value is File => value instanceof File);
  const file = files[0];
  const userName = stringValue(formData.get("user_name"));
  const copies = Number(formData.get("copies") || 1);
  const colorMode = stringValue(formData.get("color_mode")) as ColorMode;
  const duplexMode = stringValue(formData.get("duplex_mode")) as DuplexMode;
  const confirmed = formData.get("confirmed") === "yes";

  if (!userName || userName.length < 2) {
    return NextResponse.json({ error: "יש להזין שם מלא." }, { status: 400 });
  }

  if (files.length !== 1 || !file) {
    return NextResponse.json({ error: "ב-MVP ניתן להעלות קובץ PDF אחד בלבד." }, { status: 400 });
  }

  if (!confirmed) {
    return NextResponse.json({ error: "יש לאשר שהקובץ מוכן להדפסה." }, { status: 400 });
  }

  if (!isPdfFile(file)) {
    return NextResponse.json({ error: "ניתן להעלות PDF בלבד." }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "הקובץ ריק." }, { status: 400 });
  }

  const maxBytes = settings.max_file_size_mb * 1024 * 1024;
  if (file.size > maxBytes) {
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
  const safeFileName = sanitizePdfFileName(file.name);
  const filePath = `print-jobs/${jobId}/${safeFileName}`;
  const status = settings.manual_approval_required ? "pending" : "approved";

  const row = {
    id: jobId,
    user_name: userName,
    user_email: optionalString(formData.get("user_email")),
    user_phone: optionalString(formData.get("user_phone")),
    room_or_company: optionalString(formData.get("room_or_company")),
    file_name: safeFileName,
    file_path: filePath,
    file_size_bytes: file.size,
    file_mime_type: "application/pdf",
    status,
    copies,
    color_mode: colorMode,
    duplex_mode: duplexMode,
    notes: optionalString(formData.get("notes")),
    requires_manual_approval: settings.manual_approval_required,
    status_token: statusToken,
    user_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent")
  };

  const { error: insertError } = await supabase.from("print_jobs").insert(row);
  if (insertError) {
    return NextResponse.json({ error: publicSetupError(insertError) }, { status: 500 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("print-files").upload(filePath, fileBuffer, {
    contentType: "application/pdf",
    upsert: false
  });

  if (uploadError) {
    await supabase.from("print_jobs").delete().eq("id", jobId);
    return NextResponse.json({ error: publicSetupError(uploadError) }, { status: 500 });
  }

  return NextResponse.json({
    jobId,
    status,
    statusUrl: `/status/${jobId}?token=${statusToken}`
  });
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const text = stringValue(value);
  return text.length > 0 ? text : null;
}
