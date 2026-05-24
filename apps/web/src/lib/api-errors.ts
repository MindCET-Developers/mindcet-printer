export function publicSetupError(error: unknown) {
  const message = getErrorMessage(error);

  if (
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    message.includes("print_jobs")
  ) {
    return "טבלאות PrintDesk עדיין לא קיימות ב-Supabase. יש להריץ את supabase/migrations/0001_printdesk_schema.sql ב-SQL Editor.";
  }

  if (message.includes("Bucket not found") || message.includes("print-files")) {
    return "באקט הקבצים print-files עדיין לא קיים. יש להריץ את מיגרציית Supabase של PrintDesk.";
  }

  if (message.includes("function") || message.includes("get_public_job_status")) {
    return "פונקציות ה-RPC של PrintDesk עדיין לא קיימות. יש להריץ את מיגרציית Supabase.";
  }

  return message || "אירעה שגיאה לא צפויה.";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      record.message,
      record.error_description,
      record.details,
      record.hint,
      record.code ? `קוד שגיאה: ${record.code}` : null
    ]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return "";
}
