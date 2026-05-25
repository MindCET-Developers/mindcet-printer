"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { colorModeLabels, duplexModeLabels, formatDateTime, statusLabels, statusMessages } from "@/lib/status";
import type { ColorMode, DuplexMode, PrintJobStatus } from "@/lib/types";

type PublicStatusJob = {
  id: string;
  created_at: string;
  updated_at: string;
  file_name: string;
  status: PrintJobStatus;
  copies: number;
  color_mode: ColorMode;
  duplex_mode: DuplexMode;
  page_count: number | null;
  estimated_pages: number | null;
  error_message: string | null;
};

type StatusLiveProps = {
  initialJob: PublicStatusJob;
  jobId: string;
  token: string;
};

const statusPollMs = 1000;
const terminalStatuses = new Set<PrintJobStatus>(["printed", "failed", "cancelled", "rejected"]);

export function StatusLive({ initialJob, jobId, token }: StatusLiveProps) {
  const [job, setJob] = useState(initialJob);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date());
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const shouldPoll = !terminalStatuses.has(job.status);

  const refresh = useCallback(async (isActive: () => boolean) => {
    try {
      const params = new URLSearchParams({ jobId, token, t: Date.now().toString() });
      const response = await fetch(`/api/jobs/status?${params.toString()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-store"
        }
      });
      const payload = await response.json();

      if (!isActive()) return;

      if (!response.ok) {
        setRefreshError(payload.error || "לא ניתן לעדכן את הסטטוס כרגע.");
        return;
      }

      setJob(payload.job);
      setRefreshError(null);
      setLastCheckedAt(new Date());
    } catch {
      if (isActive()) {
        setRefreshError("לא ניתן להתחבר לשרת כרגע. ננסה שוב בעוד רגע.");
      }
    }
  }, [jobId, token]);

  useEffect(() => {
    if (!shouldPoll) return;

    let active = true;
    const isActive = () => active;

    void refresh(isActive);
    const intervalId = window.setInterval(() => {
      void refresh(isActive);
    }, statusPollMs);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [refresh, shouldPoll]);

  const status = job.status;
  const refreshText = useMemo(() => {
    if (terminalStatuses.has(status)) return "הסטטוס סופי";
    return `מתעדכן כל שנייה · בדיקה אחרונה ${formatDateTime(lastCheckedAt.toISOString())}`;
  }, [lastCheckedAt, status]);

  return (
    <main className="status-shell">
      <section className="status-card">
        <Link className="back-link" href="/">
          העלאת עבודה נוספת
        </Link>
        <p className="eyebrow">סטטוס עבודה</p>
        <h1>{statusLabels[status]}</h1>
        <p className="lead">{statusMessages[status]}</p>
        <div className="status-meta">
          <div className={`status-badge status-${status}`}>{statusLabels[status]}</div>
          <span className="status-refresh">{refreshText}</span>
        </div>

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
            <dt>עודכן</dt>
            <dd>{formatDateTime(job.updated_at)}</dd>
          </div>
          <div>
            <dt>עותקים</dt>
            <dd>{job.copies}</dd>
          </div>
          <div>
            <dt>צבע</dt>
            <dd>{colorModeLabels[job.color_mode]}</dd>
          </div>
          <div>
            <dt>דו-צדדי</dt>
            <dd>{duplexModeLabels[job.duplex_mode]}</dd>
          </div>
        </dl>

        {refreshError ? <div className="alert error">{refreshError}</div> : null}
        {status === "failed" && job.error_message ? <div className="alert error">{job.error_message}</div> : null}
      </section>
    </main>
  );
}
