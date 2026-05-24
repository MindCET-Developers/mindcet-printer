import "dotenv/config";

type AgentConfig = {
  supabaseUrl: string;
  hasServiceRoleKey: boolean;
  printerName: string;
  pollIntervalSeconds: number;
  agentId: string;
  downloadDir: string;
  sumatraPath: string;
  dryRun: boolean;
};

function readConfig(): AgentConfig {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AGENT_ID"] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    printerName: process.env.PRINTER_NAME || "default",
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS || 10),
    agentId: process.env.AGENT_ID!,
    downloadDir: process.env.DOWNLOAD_DIR || "./downloads",
    sumatraPath: process.env.SUMATRA_PATH || "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
    dryRun: process.env.AGENT_DRY_RUN === "true"
  };
}

async function main() {
  const config = readConfig();

  console.log("PrintDesk agent bootstrap complete.");
  console.log({
    supabaseUrl: config.supabaseUrl,
    hasServiceRoleKey: config.hasServiceRoleKey,
    printerName: config.printerName,
    pollIntervalSeconds: config.pollIntervalSeconds,
    agentId: config.agentId,
    downloadDir: config.downloadDir,
    sumatraPath: config.sumatraPath,
    dryRun: config.dryRun
  });
  console.log("Phase 4 will add polling, claiming, downloading and printing.");
}

main().catch((error) => {
  console.error("Agent failed to start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
