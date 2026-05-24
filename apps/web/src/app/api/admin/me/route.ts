import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  return NextResponse.json({ email: admin.email });
}
