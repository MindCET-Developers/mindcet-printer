import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { publicSetupError } from "@/lib/api-errors";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase לא מוגדר." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו JSON תקין." }, { status: 400 });
  }

  const { jobId } = params;
  const statusToken = typeof body.statusToken === "string" ? body.statusToken : "";

  if (!jobId || !statusToken) {
    return NextResponse.json({ error: "חסר jobId או statusToken." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("print_jobs")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message: "Upload to storage failed."
    })
    .eq("id", jobId)
    .eq("status_token", statusToken)
    .eq("status", "uploading");

  if (error) {
    return NextResponse.json({ error: publicSetupError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
