import type { ColorMode, DuplexMode, PrintJobStatus } from "./types";

export const statusLabels: Record<PrintJobStatus, string> = {
  uploading: "מעלה קובץ",
  pending: "ממתין לאישור",
  approved: "ממתין בתור",
  claimed: "נאסף על ידי מחשב ההדפסה",
  downloading: "בהורדה",
  printing: "בהדפסה",
  printed: "הודפס",
  failed: "נכשל",
  cancelled: "בוטל",
  rejected: "נדחה"
};

export const statusMessages: Record<PrintJobStatus, string> = {
  uploading: "הקובץ מועלה כעת.",
  pending: "העבודה שלך ממתינה לאישור צוות המרחב.",
  approved: "העבודה שלך ממתינה בתור ההדפסה.",
  claimed: "מחשב ההדפסה אסף את העבודה.",
  downloading: "הקובץ יורד עכשיו למחשב ההדפסה.",
  printing: "הקובץ נשלח למדפסת.",
  printed: "הקובץ הודפס.",
  failed: "ההדפסה נכשלה. מומלץ לפנות לצוות המרחב.",
  cancelled: "העבודה הזאת בוטלה.",
  rejected: "העבודה הזאת נדחתה."
};

export const colorModeLabels: Record<ColorMode, string> = {
  bw: "שחור-לבן",
  color: "צבעוני"
};

export const duplexModeLabels: Record<DuplexMode, string> = {
  one_sided: "חד-צדדי",
  two_sided_long_edge: "דו-צדדי",
  two_sided_short_edge: "דו-צדדי קצר"
};

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
