import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { publicSetupError } from "@/lib/api-errors";
import { createServiceClient } from "@/lib/supabase-admin";
import { readAppSettings } from "@/lib/settings";

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

  const { data: job, error: fetchError } = await supabase
    .from("print_jobs")
    .select("id, status, requires_manual_approval")
    .eq("id", jobId)
    .eq("status_token", statusToken)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "העבודה לא נמצאה או שהטוקן שגוי." }, { status: 404 });
  }

  if (job.status !== "uploading") {
    return NextResponse.json({ error: "העבודה כבר אושרה." }, { status: 409 });
  }

  const settings = await readAppSettings(supabase);
  const nextStatus = settings.manual_approval_required ? "pending" : "approved";

  const { error: updateError } = await supabase
    .from("print_jobs")
    .update({ status: nextStatus })
    .eq("id", jobId)
    .eq("status_token", statusToken);

  if (updateError) {
    return NextResponse.json({ error: publicSetupError(updateError) }, { status: 500 });
  }

  return NextResponse.json({ status: nextStatus });
}
