import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { readAppSettings } from "@/lib/settings";

const allowedSettings = [
  "printing_enabled",
  "public_upload_enabled",
  "manual_approval_required",
  "max_file_size_mb",
  "max_page_count",
  "upload_passcode_enabled"
] as const;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const settings = await readAppSettings(admin.supabase);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const body = await request.json();
  const nextSettings = {
    printing_enabled: Boolean(body.printing_enabled),
    public_upload_enabled: Boolean(body.public_upload_enabled),
    manual_approval_required: Boolean(body.manual_approval_required),
    max_file_size_mb: clampNumber(body.max_file_size_mb, 1, 100),
    max_page_count: clampNumber(body.max_page_count, 1, 500),
    upload_passcode_enabled: Boolean(body.upload_passcode_enabled)
  };

  for (const key of allowedSettings) {
    const { error } = await admin.supabase.from("app_settings").upsert({
      key,
      value: nextSettings[key]
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ settings: nextSettings });
}

function clampNumber(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}
