import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { data, error } = await admin.supabase
    .from("print_jobs")
    .select(
      "id,created_at,updated_at,user_name,user_email,user_phone,room_or_company,file_name,file_path,file_size_bytes,file_mime_type,file_deleted,status,copies,color_mode,duplex_mode,page_count,estimated_pages,notes,requires_manual_approval,approved_by,approved_at,claimed_by_agent_id,claimed_at,printed_at,failed_at,cancelled_at,error_message,agent_log,user_ip,user_agent"
    )
    .eq("id", params.jobId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ job: data });
}
