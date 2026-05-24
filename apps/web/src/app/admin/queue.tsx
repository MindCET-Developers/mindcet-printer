"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminAuthGate } from "./admin-auth-gate";
import { colorModeLabels, duplexModeLabels, formatDateTime, statusLabels } from "@/lib/status";
import type { PrintJob, PrintJobStatus } from "@/lib/types";

const statuses: Array<"all" | PrintJobStatus> = [
  "all",
  "pending",
  "approved",
  "claimed",
  "downloading",
  "printing",
  "printed",
  "failed",
  "cancelled",
  "rejected"
];

export function AdminDashboard() {
  return (
    <AdminAuthGate>
      {(token) => <QueueView token={token} />}
    </AdminAuthGate>
  );
}

function QueueView({ token }: { token: string }) {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadJobs() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);

    const response = await fetch(`/api/admin/jobs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || "טעינת התור נכשלה.");
      return;
    }

    setJobs(payload.jobs);
  }

  useEffect(() => {
    loadJobs();
  }, [token, status]);

  const counters = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.total += 1;
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [jobs]);

  async function runAction(jobId: string, action: string) {
    const response = await fetch(`/api/admin/jobs/${jobId}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "הפעולה נכשלה.");
      return;
    }
    await loadJobs();
  }

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <p className="eyebrow">תור הדפסות</p>
          <h1>ניהול עבודות</h1>
        </div>
        <button className="secondary-action" type="button" onClick={loadJobs}>
          רענון
        </button>
      </div>

      <div className="ops-stats">
        <div>
          <span>{counters.total || 0}</span>
          <small>סה"כ</small>
        </div>
        <div>
          <span>{counters.pending || 0}</span>
          <small>ממתין לאישור</small>
        </div>
        <div>
          <span>{counters.approved || 0}</span>
          <small>בתור</small>
        </div>
        <div>
          <span>{counters.failed || 0}</span>
          <small>נכשל</small>
        </div>
      </div>

      <div className="ops-filters">
        <select value={status} onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])}>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "כל הסטטוסים" : statusLabels[item]}
            </option>
          ))}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי שם, מייל או קובץ" />
        <button className="secondary-action" type="button" onClick={loadJobs}>
          חיפוש
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>נוצר</th>
              <th>משתמש</th>
              <th>קובץ</th>
              <th>סטטוס</th>
              <th>העדפות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>טוען...</td>
              </tr>
            ) : null}
            {!loading && jobs.length === 0 ? (
              <tr>
                <td colSpan={6}>אין עבודות להצגה.</td>
              </tr>
            ) : null}
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{formatDateTime(job.created_at)}</td>
                <td>
                  <strong>{job.user_name}</strong>
                  <small>{job.user_email || job.user_phone || "—"}</small>
                </td>
                <td>
                  <Link href={`/admin/jobs/${job.id}`}>{job.file_name}</Link>
                  <small>{job.room_or_company || "—"}</small>
                </td>
                <td>
                  <span className={`status-badge status-${job.status}`}>{statusLabels[job.status]}</span>
                </td>
                <td>
                  {job.copies} עותקים · {colorModeLabels[job.color_mode]} · {duplexModeLabels[job.duplex_mode]}
                </td>
                <td>
                  <div className="row-actions">
                    {job.status === "pending" ? (
                      <>
                        <button type="button" onClick={() => runAction(job.id, "approve")}>אישור</button>
                        <button type="button" onClick={() => runAction(job.id, "reject")}>דחייה</button>
                      </>
                    ) : null}
                    {!["printed", "cancelled", "rejected"].includes(job.status) ? (
                      <button type="button" onClick={() => runAction(job.id, "cancel")}>ביטול</button>
                    ) : null}
                    {job.status === "failed" ? <button type="button" onClick={() => runAction(job.id, "retry")}>ניסיון חוזר</button> : null}
                    {job.status !== "printed" ? (
                      <button type="button" onClick={() => runAction(job.id, "mark-printed")}>סומן כהודפס</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
