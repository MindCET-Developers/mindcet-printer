"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminAuthGate } from "../admin-auth-gate";
import type { AppSettings } from "@/lib/types";

export function SettingsView() {
  return (
    <AdminAuthGate>
      {(token) => <SettingsInner token={token} />}
    </AdminAuthGate>
  );
}

function SettingsInner({ token }: { token: string }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState("");
  const [showUploadPasscode, setShowUploadPasscode] = useState(false);

  async function loadSettings() {
    const response = await fetch("/api/admin/settings", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (response.ok) setSettings(payload.settings);
    else setMessage(payload.error || "טעינת הגדרות נכשלה.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextSettings = {
      printing_enabled: form.get("printing_enabled") === "on",
      public_upload_enabled: form.get("public_upload_enabled") === "on",
      manual_approval_required: form.get("manual_approval_required") === "on",
      max_file_size_mb: Number(form.get("max_file_size_mb")),
      max_page_count: Number(form.get("max_page_count")),
      upload_passcode_enabled: form.get("upload_passcode_enabled") === "on",
      upload_passcode: String(form.get("upload_passcode") || "")
    };

    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextSettings)
    });
    const payload = await response.json();
    setMessage(response.ok ? "ההגדרות נשמרו." : payload.error || "השמירה נכשלה.");
    if (response.ok) setSettings(payload.settings);
  }

  useEffect(() => {
    loadSettings();
  }, [token]);

  if (!settings) {
    return (
      <section className="ops-page">
        <h1>הגדרות</h1>
        <p>{message || "טוען..."}</p>
      </section>
    );
  }

  return (
    <section className="ops-page">
      <div className="ops-header">
        <div>
          <p className="eyebrow">הגדרות מערכת</p>
          <h1>מדיניות הדפסה</h1>
        </div>
      </div>

      <form className="settings-form" onSubmit={save}>
        <label className="toggle-row">
          <input name="printing_enabled" type="checkbox" defaultChecked={settings.printing_enabled} />
          <span>הדפסה פעילה</span>
        </label>
        <label className="toggle-row">
          <input name="public_upload_enabled" type="checkbox" defaultChecked={settings.public_upload_enabled} />
          <span>העלאות ציבוריות פעילות</span>
        </label>
        <label className="toggle-row">
          <input name="manual_approval_required" type="checkbox" defaultChecked={settings.manual_approval_required} />
          <span>דרוש אישור מנהל לפני הדפסה</span>
        </label>
        <label className="toggle-row">
          <input name="upload_passcode_enabled" type="checkbox" defaultChecked={settings.upload_passcode_enabled} />
          <span>קוד העלאה פעיל</span>
        </label>
        <label>
          <span>קוד העלאה חדש</span>
          <input
            name="upload_passcode"
            type="password"
            placeholder={settings.upload_passcode_configured ? "מוגדר - השאירו ריק כדי לא לשנות" : "יש להזין קוד לפני הפעלה"}
          />
        </label>
        <label>
          <span>קוד העלאה נוכחי</span>
          <div className="inline-control">
            <input
              readOnly
              type={showUploadPasscode ? "text" : "password"}
              value={settings.upload_passcode_value || ""}
              placeholder={settings.upload_passcode_configured ? "לא ניתן להציג קוד שנשמר לפני העדכון" : "לא מוגדר"}
            />
            <button type="button" onClick={() => setShowUploadPasscode((visible) => !visible)}>
              {showUploadPasscode ? "הסתר" : "הצג"}
            </button>
          </div>
        </label>
        <label>
          <span>גודל קובץ מקסימלי ב-MB</span>
          <input name="max_file_size_mb" type="number" min={1} max={100} defaultValue={settings.max_file_size_mb} />
        </label>
        <label>
          <span>מספר עמודים מקסימלי</span>
          <input name="max_page_count" type="number" min={1} max={500} defaultValue={settings.max_page_count} />
        </label>
        <button className="primary-action" type="submit">שמירת הגדרות</button>
        {message ? <div className="alert">{message}</div> : null}
      </form>
    </section>
  );
}
