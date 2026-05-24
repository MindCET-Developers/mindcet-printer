import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { data, error } = await admin.supabase
    .from("print_agents")
    .select("id,created_at,updated_at,last_seen_at,status,printer_name,machine_name,agent_version,current_job_id,last_error")
    .order("last_seen_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ agents: data || [] });
}
