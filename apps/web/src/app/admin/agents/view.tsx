"use client";

import { useEffect, useState } from "react";
import { AdminAuthGate } from "../admin-auth-gate";
import { formatDateTime } from "@/lib/status";
import type { PrintAgent } from "@/lib/types";

export function AgentsView() {
  return (
    <AdminAuthGate>
      {(token) => <AgentsInner token={token} />}
    </AdminAuthGate>
  );
}

function AgentsInner({ token }: { token: string }) {
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [error, setError] = useState("");

  async function loadAgents() {
    const response = await fetch("/api/admin/agents", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "טעינת הסוכנים נכשלה.");
      return;
    }
    setAgents(payload.agents);
  }

  useEffect(() => {
    loadAgents();
  }, [token]);

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <p className="eyebrow">מחשבי הדפסה</p>
          <h1>ניטור סוכנים</h1>
        </div>
        <button className="secondary-action" onClick={loadAgents}>רענון</button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Agent ID</th>
              <th>סטטוס</th>
              <th>נראה לאחרונה</th>
              <th>מדפסת</th>
              <th>עבודה נוכחית</th>
              <th>שגיאה אחרונה</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr><td colSpan={6}>אין סוכנים רשומים עדיין.</td></tr>
            ) : null}
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>{agent.id}</td>
                <td><span className={`agent-pill agent-${agent.status}`}>{agent.status}</span></td>
                <td>{formatDateTime(agent.last_seen_at)}</td>
                <td>{agent.printer_name || "—"}</td>
                <td>{agent.current_job_id || "—"}</td>
                <td>{agent.last_error || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
