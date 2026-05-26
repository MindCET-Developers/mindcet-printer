import type { AppSettings } from "./types";

export const defaultSettings: AppSettings = {
  printing_enabled: true,
  public_upload_enabled: true,
  manual_approval_required: true,
  max_file_size_mb: Number(process.env.MAX_FILE_SIZE_MB || 20),
  max_page_count: Number(process.env.MAX_PAGE_COUNT || 50),
  upload_passcode_enabled: false,
  upload_passcode_hash: null,
  upload_passcode_value: null,
  upload_passcode_configured: Boolean(process.env.UPLOAD_PASSCODE?.trim())
};

export async function readAppSettings(supabase: ReturnType<typeof import("./supabase-admin").createServiceClient>) {
  const { data, error } = await supabase.from("app_settings").select("key,value");

  if (error || !data) {
    return defaultSettings;
  }

  const settings = data.reduce<AppSettings>((current, row: { key: string; value: unknown }) => {
    if (row.key in current) {
      return { ...current, [row.key]: row.value };
    }
    return current;
  }, defaultSettings);

  return {
    ...settings,
    upload_passcode_configured: Boolean(settings.upload_passcode_hash || process.env.UPLOAD_PASSCODE?.trim())
  };
}
