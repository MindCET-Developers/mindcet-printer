import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

const actionConfig = {
  approve: { status: "approved", extra: "approve" },
  reject: { status: "rejected", extra: "reject" },
  cancel: { status: "cancelled", extra: "cancel" },
  retry: { status: "approved", extra: "retry" },
  "mark-printed": { status: "printed", extra: "mark-printed" }
} as const;

type ActionName = keyof typeof actionConfig;

export async function POST(request: NextRequest, { params }: { params: { jobId: string; action: string } }) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const action = params.action as ActionName;
  if (!(action in actionConfig)) {
    return NextResponse.json({ error: "פעולה לא מוכרת." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: actionConfig[action].status
  };

  if (action === "approve") {
    updates.approved_by = admin.email;
    updates.approved_at = now;
    updates.error_message = null;
    updates.agent_log = null;
  }

  if (action === "reject") {
    updates.cancelled_at = now;
  }

  if (action === "cancel") {
    updates.cancelled_at = now;
  }

  if (action === "retry") {
    updates.failed_at = null;
    updates.error_message = null;
    updates.agent_log = null;
    updates.claimed_by_agent_id = null;
    updates.claimed_at = null;
  }

  if (action === "mark-printed") {
    updates.printed_at = now;
  }

  const { data, error } = await admin.supabase
    .from("print_jobs")
    .update(updates)
    .eq("id", params.jobId)
    .select(
      "id,created_at,updated_at,user_name,user_email,user_phone,room_or_company,file_name,file_path,file_size_bytes,file_mime_type,file_deleted,status,copies,color_mode,duplex_mode,page_count,estimated_pages,notes,requires_manual_approval,approved_by,approved_at,claimed_by_agent_id,claimed_at,printed_at,failed_at,cancelled_at,error_message,agent_log,user_ip,user_agent"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ job: data });
}

export async function GET(request: NextRequest, { params }: { params: { jobId: string; action: string } }) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  if (params.action !== "download") {
    return NextResponse.json({ error: "פעולה לא מוכרת." }, { status: 404 });
  }

  const { data: job, error } = await admin.supabase
    .from("print_jobs")
    .select("file_path,file_deleted")
    .eq("id", params.jobId)
    .single();

  if (error || !job) return NextResponse.json({ error: error?.message || "העבודה לא נמצאה." }, { status: 404 });
  if (job.file_deleted) return NextResponse.json({ error: "הקובץ כבר נמחק." }, { status: 410 });

  const { data, error: signedError } = await admin.supabase.storage.from("print-files").createSignedUrl(job.file_path, 60);
  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
