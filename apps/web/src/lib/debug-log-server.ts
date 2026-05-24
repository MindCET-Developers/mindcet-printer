import { appendFileSync } from "node:fs";
import { join } from "node:path";

const DEBUG_SESSION = "c4c61d";
const LOG_FILE = join(process.cwd(), "..", "..", "debug-c4c61d.log");

export function debugLogServer(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix"
) {
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
  try {
    appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // ignore file logging errors
  }

  fetch("http://127.0.0.1:7336/ingest/640973ff-4a0d-43e4-bf12-61fdcd37e420", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
  // #endregion
}
