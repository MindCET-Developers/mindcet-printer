"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SubmitState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>({ type: "idle" });

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fileHint = useMemo(() => {
    if (!file) return "PDF אחד בלבד, עד 20MB כברירת מחדל.";
    const mb = file.size / 1024 / 1024;
    return `${file.name} · ${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  }, [file]);

  function handleFileChange(nextFile?: File) {
    if (!nextFile) {
      setFile(null);
      return;
    }

    const isPdf = nextFile.type === "application/pdf" || nextFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFile(null);
      setState({ type: "error", message: "אפשר להעלות רק קובץ PDF." });
      return;
    }

    setState({ type: "idle" });
    setFile(nextFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setState({ type: "error", message: "יש לבחור קובץ PDF." });
      return;
    }
    setState({ type: "submitting" });

    try {
      // Step 1: Create job and get signed upload URL
      const form = event.currentTarget;
      const metadata = {
        user_name: (form.elements.namedItem("user_name") as HTMLInputElement).value,
        user_email: (form.elements.namedItem("user_email") as HTMLInputElement).value || null,
        user_phone: (form.elements.namedItem("user_phone") as HTMLInputElement).value || null,
        room_or_company: (form.elements.namedItem("room_or_company") as HTMLInputElement).value || null,
        copies: Number((form.elements.namedItem("copies") as HTMLInputElement).value),
        color_mode: (form.elements.namedItem("color_mode") as HTMLSelectElement).value,
        duplex_mode: (form.elements.namedItem("duplex_mode") as HTMLSelectElement).value,
        notes: (form.elements.namedItem("notes") as HTMLTextAreaElement).value || null,
        confirmed: true,
        file_name: file.name,
        file_size_bytes: file.size
      };

      const createRes = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata)
      });
      const createPayload = await createRes.json();

      if (!createRes.ok) {
        setState({ type: "error", message: createPayload.error || "יצירת העבודה נכשלה." });
        return;
      }

      const { jobId, statusToken, uploadUrl, statusUrl } = createPayload as {
        jobId: string;
        statusToken: string;
        uploadUrl: string;
        statusUrl: string;
      };

      // Step 2: Upload PDF directly to Supabase Storage
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file
      });

      if (!uploadRes.ok) {
        await fetch(`/api/jobs/${jobId}/fail-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusToken })
        }).catch(() => undefined);
        setState({ type: "error", message: "העלאת הקובץ נכשלה. נסו שוב." });
        return;
      }

      // Step 3: Confirm upload complete
      const confirmRes = await fetch(`/api/jobs/${jobId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusToken })
      });
      const confirmPayload = await confirmRes.json();

      if (!confirmRes.ok) {
        setState({ type: "error", message: confirmPayload.error || "אישור ההעלאה נכשל." });
        return;
      }

      setState({ type: "success", message: "העבודה נוצרה. מעבירים אותך לעמוד הסטטוס." });
      window.location.href = statusUrl;
    } catch {
      setState({ type: "error", message: "לא ניתן להתחבר לשרת כרגע." });
    }
  }

  return (
    <form className="upload-layout" onSubmit={handleSubmit}>
      <section className="upload-card">
        <div className="form-grid">
          <label>
            <span>שם מלא *</span>
            <input name="user_name" required minLength={2} placeholder="לדוגמה: דנה כהן" />
          </label>
          <label>
            <span>אימייל</span>
            <input name="user_email" type="email" placeholder="name@example.com" />
          </label>
          <label>
            <span>טלפון</span>
            <input name="user_phone" inputMode="tel" placeholder="050-0000000" />
          </label>
          <label>
            <span>חדר / חברה</span>
            <input name="room_or_company" placeholder="חדר 3 / MindCET" />
          </label>
          <label>
            <span>עותקים</span>
            <input name="copies" type="number" defaultValue={1} min={1} max={5} />
          </label>
          <label>
            <span>צבע</span>
            <select name="color_mode" defaultValue="bw">
              <option value="bw">שחור-לבן</option>
              <option value="color">צבעוני</option>
            </select>
          </label>
          <label>
            <span>דו-צדדי</span>
            <select name="duplex_mode" defaultValue="one_sided">
              <option value="one_sided">חד-צדדי</option>
              <option value="two_sided_long_edge">דו-צדדי</option>
              <option value="two_sided_short_edge">דו-צדדי קצר</option>
            </select>
          </label>
          <label className="full">
            <span>הערות לצוות</span>
            <textarea name="notes" rows={3} placeholder="למשל: להניח במעטפה על שם..." />
          </label>
          <label className="file-drop full">
            <span>קובץ PDF *</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(event) => handleFileChange(event.target.files?.[0])}
            />
            <strong>{file ? "קובץ נבחר" : "גרור או בחר PDF"}</strong>
            <small>{fileHint}</small>
          </label>
          <label className="confirm full">
            <input name="confirmed" type="checkbox" required value="yes" />
            <span>אני מאשר/ת שהקובץ מוכן להדפסה ושאין צורך בעריכה נוספת.</span>
          </label>
        </div>

        {state.type === "error" ? <div className="alert error">{state.message}</div> : null}
        {state.type === "success" ? <div className="alert success">{state.message}</div> : null}

        <button className="primary-action" type="submit" disabled={state.type === "submitting"}>
          {state.type === "submitting" ? "שולחים..." : "שליחת עבודה להדפסה"}
        </button>
      </section>

      <aside className="preview-panel">
        <div className="preview-head">
          <h2>תצוגה מקדימה</h2>
          <p>התצוגה היא בדפדפן בלבד. הקובץ יישמר רק לאחר שליחה.</p>
        </div>
        <div className="pdf-preview">
          {previewUrl ? (
            <div className="pdf-preview-frame">
              <object data={previewUrl} type="application/pdf" aria-label="תצוגה מקדימה של PDF">
                <iframe title="תצוגה מקדימה של PDF" src={previewUrl} />
              </object>
              <a className="preview-open-link" href={previewUrl} target="_blank" rel="noreferrer">
                פתיחת התצוגה בטאב חדש
              </a>
            </div>
          ) : (
            <div className="empty-preview">
              <span>PDF</span>
              <p>בחרו קובץ כדי לראות תצוגה מקדימה.</p>
            </div>
          )}
        </div>
      </aside>
    </form>
  );
}
