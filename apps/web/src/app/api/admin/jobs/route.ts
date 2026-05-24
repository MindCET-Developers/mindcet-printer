import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const status = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("search")?.trim();

  let query = admin.supabase
    .from("print_jobs")
    .select(
      "id,created_at,updated_at,user_name,user_email,user_phone,room_or_company,file_name,file_path,file_size_bytes,file_mime_type,file_deleted,status,copies,color_mode,duplex_mode,page_count,estimated_pages,notes,requires_manual_approval,approved_by,approved_at,claimed_by_agent_id,claimed_at,printed_at,failed_at,cancelled_at,error_message,agent_log,user_ip,user_agent"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    const term = search.replace(/[%_,]/g, "");
    query = query.or(`user_name.ilike.%${term}%,user_email.ilike.%${term}%,file_name.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data || [] });
}
