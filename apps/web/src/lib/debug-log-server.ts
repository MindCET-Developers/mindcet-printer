import { appendFileSync } from "node:fs";
import { join } from "node:path";

const DEBUG_ENDPOINT = process.env.DEBUG_LOG_ENDPOINT;
const DEBUG_SESSION = process.env.DEBUG_SESSION_ID || "local";
const LOG_FILE = process.env.DEBUG_LOG_FILE || join(process.cwd(), "..", "..", "debug-local.log");

export function debugLogServer(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix"
) {
  if (!DEBUG_ENDPOINT && process.env.DEBUG_LOG_TO_FILE !== "true") return;

  const payload = {
    sessionId: DEBUG_SESSION,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now()
  };

  // #region agent log
  if (process.env.DEBUG_LOG_TO_FILE === "true") {
    try {
      appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
    } catch {
      // ignore file logging errors
    }
  }

  if (DEBUG_ENDPOINT) {
    fetch(DEBUG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": DEBUG_SESSION
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
  // #endregion
}
