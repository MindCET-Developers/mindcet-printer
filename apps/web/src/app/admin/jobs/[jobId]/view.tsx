"use client";

import { useEffect, useState } from "react";
import { AdminAuthGate } from "../../admin-auth-gate";
import { colorModeLabels, duplexModeLabels, formatBytes, formatDateTime, statusLabels } from "@/lib/status";
import type { PrintJob } from "@/lib/types";

export function JobDetail({ jobId }: { jobId: string }) {
  return (
    <AdminAuthGate>
      {(token) => <JobDetailInner token={token} jobId={jobId} />}
    </AdminAuthGate>
  );
}

function JobDetailInner({ token, jobId }: { token: string; jobId: string }) {
  const [job, setJob] = useState<PrintJob | null>(null);
  const [error, setError] = useState("");

  async function loadJob() {
    const response = await fetch(`/api/admin/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "טעינת העבודה נכשלה.");
      return;
    }
    setJob(payload.job);
  }

  async function runAction(action: string) {
    const response = await fetch(`/api/admin/jobs/${jobId}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "הפעולה נכשלה.");
      return;
    }
    setJob(payload.job);
  }

  async function downloadFile() {
    const response = await fetch(`/api/admin/jobs/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "יצירת קישור הורדה נכשלה.");
      return;
    }
    window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    loadJob();
  }, [token, jobId]);

  if (!job) {
    return (
      <section className="ops-page">
        <h1>פרטי עבודה</h1>
        {error ? <div className="alert error">{error}</div> : <p>טוען...</p>}
      </section>
    );
  }

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <p className="eyebrow">פרטי עבודה</p>
          <h1>{job.file_name}</h1>
        </div>
        <span className={`status-badge status-${job.status}`}>{statusLabels[job.status]}</span>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="detail-actions">
        {job.status === "pending" ? <button onClick={() => runAction("approve")}>אישור</button> : null}
        {job.status === "pending" ? <button onClick={() => runAction("reject")}>דחייה</button> : null}
        {!["printed", "cancelled", "rejected"].includes(job.status) ? <button onClick={() => runAction("cancel")}>ביטול</button> : null}
        {job.status === "failed" ? <button onClick={() => runAction("retry")}>ניסיון חוזר</button> : null}
        {job.status !== "printed" ? <button onClick={() => runAction("mark-printed")}>סימון כהודפס</button> : null}
        {!job.file_deleted ? <button onClick={downloadFile}>הורדת PDF</button> : null}
      </div>

      <div className="detail-grid">
        <Info title="משתמש" rows={[["שם", job.user_name], ["אימייל", job.user_email], ["טלפון", job.user_phone], ["חדר / חברה", job.room_or_company]]} />
        <Info title="קובץ" rows={[["שם", job.file_name], ["גודל", formatBytes(job.file_size_bytes)], ["נתיב", job.file_path], ["נמחק", job.file_deleted ? "כן" : "לא"]]} />
        <Info title="העדפות" rows={[["עותקים", String(job.copies)], ["צבע", colorModeLabels[job.color_mode]], ["דו-צדדי", duplexModeLabels[job.duplex_mode]], ["עמודים", job.page_count ? String(job.page_count) : "לא חושב"]]} />
        <Info title="זמנים" rows={[["נוצר", formatDateTime(job.created_at)], ["אושר", formatDateTime(job.approved_at)], ["נתפס", formatDateTime(job.claimed_at)], ["הודפס", formatDateTime(job.printed_at)], ["נכשל", formatDateTime(job.failed_at)]]} />
      </div>

      <div className="ops-card">
        <h2>שגיאות ולוג סוכן</h2>
        <p>{job.error_message || "אין שגיאה."}</p>
        <pre>{job.agent_log || "אין לוג סוכן."}</pre>
      </div>
    </section>
  );
}

function Info({ title, rows }: { title: string; rows: Array<[string, string | null | undefined]> }) {
  return (
    <div className="ops-card">
      <h2>{title}</h2>
      <dl className="compact-list">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
