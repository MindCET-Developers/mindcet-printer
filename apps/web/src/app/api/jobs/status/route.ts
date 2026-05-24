import { NextRequest, NextResponse } from "next/server";
import { publicSetupError } from "@/lib/api-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase לא מוגדר." }, { status: 500 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  const token = request.nextUrl.searchParams.get("token");

  if (!jobId || !token) {
    return NextResponse.json({ error: "חסר jobId או token." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id,created_at,updated_at,file_name,status,copies,color_mode,duplex_mode,page_count,estimated_pages,error_message")
    .eq("id", jobId)
    .eq("status_token", token)
    .single();

  if (error) {
    return NextResponse.json({ error: publicSetupError(error) }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "העבודה לא נמצאה." }, { status: 404 });
  }

  return NextResponse.json({ job });
}
