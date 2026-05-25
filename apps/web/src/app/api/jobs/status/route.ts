import { NextRequest, NextResponse } from "next/server";
import { publicSetupError } from "@/lib/api-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return statusJson({ error: "Supabase לא מוגדר." }, 500);
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  const token = request.nextUrl.searchParams.get("token");

  if (!jobId || !token) {
    return statusJson({ error: "חסר jobId או token." }, 400);
  }

  const supabase = createServiceClient();
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id,created_at,updated_at,file_name,status,copies,color_mode,duplex_mode,page_count,estimated_pages,error_message")
    .eq("id", jobId)
    .eq("status_token", token)
    .single();

  if (error) {
    return statusJson({ error: publicSetupError(error) }, 500);
  }

  if (!job) {
    return statusJson({ error: "העבודה לא נמצאה." }, 404);
  }

  return statusJson({ job });
}

function statusJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    }
  });
}
