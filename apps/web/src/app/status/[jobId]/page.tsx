import Link from "next/link";
import { publicSetupError } from "@/lib/api-errors";
import { createServiceClient } from "@/lib/supabase-admin";
import { colorModeLabels, duplexModeLabels, formatDateTime, statusLabels, statusMessages } from "@/lib/status";
import type { ColorMode, DuplexMode, PrintJobStatus } from "@/lib/types";

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

    const status = job.status as PrintJobStatus;

    return (
      <main className="status-shell">
        <section className="status-card">
          <Link className="back-link" href="/">
            העלאת עבודה נוספת
          </Link>
          <p className="eyebrow">סטטוס עבודה</p>
          <h1>{statusLabels[status]}</h1>
          <p className="lead">{statusMessages[status]}</p>
          <div className={`status-badge status-${status}`}>{statusLabels[status]}</div>

          <dl className="details-list">
            <div>
              <dt>מספר עבודה</dt>
              <dd>{job.id}</dd>
            </div>
            <div>
              <dt>שם קובץ</dt>
              <dd>{job.file_name}</dd>
            </div>
            <div>
              <dt>נשלח</dt>
              <dd>{formatDateTime(job.created_at)}</dd>
            </div>
            <div>
              <dt>עותקים</dt>
              <dd>{job.copies}</dd>
            </div>
            <div>
              <dt>צבע</dt>
              <dd>{colorModeLabels[job.color_mode as ColorMode]}</dd>
            </div>
            <div>
              <dt>דו-צדדי</dt>
              <dd>{duplexModeLabels[job.duplex_mode as DuplexMode]}</dd>
            </div>
          </dl>

          {status === "failed" && job.error_message ? <div className="alert error">{job.error_message}</div> : null}
        </section>
      </main>
    );
  } catch (error) {
    return (
      <StatusError
        title="הסטטוס לא זמין"
        message={publicSetupError(error)}
      />
    );
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
