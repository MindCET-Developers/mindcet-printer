import Link from "next/link";
import { publicSetupError } from "@/lib/api-errors";
import { createServiceClient } from "@/lib/supabase-admin";
import { StatusLive } from "./status-live";

type StatusPageProps = {
  params: { jobId: string };
  searchParams: { token?: string };
};

export default async function StatusPage({ params, searchParams }: StatusPageProps) {
  const token = searchParams.token || "";

  if (!token) {
    return <StatusError title="חסר קוד סטטוס" message="קישור הסטטוס לא תקין או חסר token." />;
  }

  try {
    const supabase = createServiceClient();
    const { data: job, error } = await supabase
      .from("print_jobs")
      .select("id,created_at,updated_at,file_name,status,copies,color_mode,duplex_mode,page_count,estimated_pages,error_message")
      .eq("id", params.jobId)
      .eq("status_token", token)
      .single();

    if (error || !job) {
      return <StatusError title="לא מצאנו את העבודה" message="ייתכן שהקישור שגוי או שפג תוקף הגישה." />;
    }

    return <StatusLive initialJob={job} jobId={params.jobId} token={token} />;
  } catch (error) {
    return <StatusError title="הסטטוס לא זמין" message={publicSetupError(error)} />;
  }
}

function StatusError({ title, message }: { title: string; message: string }) {
  return (
    <main className="status-shell">
      <section className="status-card">
        <Link className="back-link" href="/">
          חזרה להעלאה
        </Link>
        <p className="eyebrow">PrintDesk</p>
        <h1>{title}</h1>
        <p className="lead">{message}</p>
      </section>
    </main>
  );
}
