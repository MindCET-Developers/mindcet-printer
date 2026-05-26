export type PrintJobStatus =
  | "uploading"
  | "pending"
  | "approved"
  | "claimed"
  | "downloading"
  | "printing"
  | "printed"
  | "failed"
  | "cancelled"
  | "rejected";

export type ColorMode = "bw" | "color";
export type DuplexMode = "one_sided" | "two_sided_long_edge" | "two_sided_short_edge";

export type PrintJob = {
  id: string;
  created_at: string;
  updated_at: string;
  user_name: string;
  user_email: string | null;
  user_phone: string | null;
  room_or_company: string | null;
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  file_mime_type: string;
  file_deleted?: boolean;
  status: PrintJobStatus;
  copies: number;
  color_mode: ColorMode;
  duplex_mode: DuplexMode;
  page_count: number | null;
  estimated_pages: number | null;
  notes: string | null;
  requires_manual_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  claimed_by_agent_id: string | null;
  claimed_at: string | null;
  printed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  error_message: string | null;
  agent_log: string | null;
  user_ip: string | null;
  user_agent: string | null;
  status_token?: string;
};

export type PrintAgent = {
  id: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  status: "offline" | "online" | "printing" | "error";
  printer_name: string | null;
  machine_name: string | null;
  agent_version: string | null;
  current_job_id: string | null;
  last_error: string | null;
};

export type AppSettings = {
  printing_enabled: boolean;
  public_upload_enabled: boolean;
  manual_approval_required: boolean;
  max_file_size_mb: number;
  max_page_count: number;
  upload_passcode_enabled: boolean;
  upload_passcode_hash?: string | null;
  upload_passcode_value?: string | null;
  upload_passcode_configured?: boolean;
};
