"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { debugLog } from "@/lib/debug-log";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("מאמתים את הקישור...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/admin";
    const supabase = createBrowserClient();

    if (!supabase) {
      debugLog("auth/callback/page.tsx", "supabase client null", { origin: window.location.origin }, "A");
      setMessage("Supabase לא מוגדר באתר. פנו למנהל המערכת.");
      return;
    }

    async function finish() {
      if (!supabase) return;

      const code = params.get("code");
      const hasCode = Boolean(code);
      debugLog("auth/callback/page.tsx", "callback start", { hasCode, next, origin: window.location.origin }, "B,E");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        debugLog("auth/callback/page.tsx", "exchangeCodeForSession", { ok: !error, errorMessage: error?.message || null }, "B,D,E");
        if (error) {
          setMessage(`ההתחברות נכשלה: ${error.message}`);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.getSession();
        debugLog("auth/callback/page.tsx", "fallback getSession", {
          ok: Boolean(data.session),
          errorMessage: error?.message || null
        }, "E");
        if (error || !data.session) {
          setMessage("לא התקבלה סשן תקין מהקישור. נסו לשלוח קישור חדש.");
          return;
        }
      }

      router.replace(next);
    }

    finish();
  }, [router]);

  return (
    <main className="admin-login-shell">
      <div className="admin-login-card">
        <p className="eyebrow">PrintDesk Admin</p>
        <h1>מתחברים...</h1>
        <p className="lead">{message}</p>
      </div>
    </main>
  );
}
