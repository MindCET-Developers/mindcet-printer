"use client";

import { createClient } from "@supabase/supabase-js";
import { debugLog } from "@/lib/debug-log";

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    debugLog("supabase-browser.ts:createBrowserClient", "supabase client missing env", { hasUrl: Boolean(url), hasAnonKey: Boolean(anonKey) }, "A");
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true
    }
  });
}
