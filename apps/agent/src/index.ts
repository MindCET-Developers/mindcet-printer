import "dotenv/config";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);

type AgentConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  printerName: string;
  pollIntervalSeconds: number;
  agentId: string;
  downloadDir: string;
  sumatraPath: string;
  dryRun: boolean;
};

type PrintJobRow = {
  id: string;
  file_path: string;
  file_name: string;
  copies: number;
};

function readConfig(): AgentConfig {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AGENT_ID"] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    printerName: process.env.PRINTER_NAME || "default",
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS || 10),
    agentId: process.env.AGENT_ID!,
    downloadDir: path.resolve(process.env.DOWNLOAD_DIR || "./downloads"),
    sumatraPath: process.env.SUMATRA_PATH || "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
    dryRun: process.env.AGENT_DRY_RUN === "true"
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSupabase(config: AgentConfig) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function firstClaimedJob(data: PrintJobRow[] | PrintJobRow | null) {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  agentId: string,
  newStatus: string,
  errorMessage?: string | null,
  agentLog?: string | null
) {
  const { error } = await supabase.rpc("update_job_status", {
    p_job_id: jobId,
    p_agent_id: agentId,
    p_new_status: newStatus,
    p_error_message: errorMessage ?? null,
    p_agent_log: agentLog ?? null
  });

  if (error) {
    throw new Error(`update_job_status(${newStatus}) failed: ${error.message}`);
  }
}

async function downloadJobPdf(supabase: SupabaseClient, job: PrintJobRow, downloadDir: string) {
  const { data, error } = await supabase.storage.from("print-files").download(job.file_path);
  if (error || !data) {
    throw new Error(error?.message || "Failed to download PDF from storage.");
  }

  await mkdir(downloadDir, { recursive: true });
  const localPath = path.join(downloadDir, `${job.id}.pdf`);
  const buffer = Buffer.from(await data.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
}

async function printPdf(config: AgentConfig, localPath: string, copies: number) {
  if (config.dryRun) {
    console.log(`[dry-run] Would print ${localPath} x${copies} on ${config.printerName}`);
    return;
  }

  await access(config.sumatraPath).catch(() => {
    throw new Error(`SumatraPDF not found at ${config.sumatraPath}`);
  });

  const printArgs =
    config.printerName === "default"
      ? ["-print-to-default", "-silent", localPath]
      : ["-print-to", config.printerName, "-silent", localPath];

  for (let copy = 0; copy < copies; copy += 1) {
    await execFileAsync(config.sumatraPath, printArgs, { windowsHide: true });
  }
}

async function processJob(supabase: SupabaseClient, config: AgentConfig, job: PrintJobRow) {
  let localPath = "";

  try {
    console.log(`Claimed job ${job.id} (${job.file_name})`);
    await updateJobStatus(supabase, job.id, config.agentId, "downloading");

    localPath = await downloadJobPdf(supabase, job, config.downloadDir);
    await updateJobStatus(supabase, job.id, config.agentId, "printing", undefined, `Downloaded to ${localPath}`);

    await printPdf(config, localPath, Math.max(1, job.copies || 1));
    await updateJobStatus(
      supabase,
      job.id,
      config.agentId,
      "printed",
      undefined,
      config.dryRun ? "dry-run complete" : "sent to printer"
    );

    console.log(`Job ${job.id} marked as printed.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agentDebugLog("agent/index.ts:processJob", "job failed", { jobId: job.id, errorMessage: message }, "I");
    console.error(`Job ${job.id} failed:`, message);
    await updateJobStatus(supabase, job.id, config.agentId, "failed", message);
  } finally {
    if (localPath) {
      await unlink(localPath).catch(() => undefined);
    }
  }
}

function agentDebugLog(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
  // #region agent log
  fetch("http://127.0.0.1:7336/ingest/640973ff-4a0d-43e4-bf12-61fdcd37e420", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c4c61d" },
    body: JSON.stringify({
      sessionId: "c4c61d",
      runId: "pre-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}

async function pollOnce(supabase: SupabaseClient, config: AgentConfig) {
  const { data, error } = await supabase.rpc("claim_next_print_job", {
    p_agent_id: config.agentId
  });

  if (error) {
    agentDebugLog("agent/index.ts:pollOnce", "claim rpc error", { errorMessage: error.message, agentId: config.agentId }, "G");
    throw new Error(`claim_next_print_job failed: ${error.message}`);
  }

  const job = firstClaimedJob(data as PrintJobRow[] | PrintJobRow | null);
  agentDebugLog("agent/index.ts:pollOnce", "claim rpc result", { claimed: Boolean(job), dryRun: config.dryRun }, "F,H");
  if (!job) return false;

  await processJob(supabase, config, job);
  return true;
}

async function main() {
  const config = readConfig();
  const supabase = createSupabase(config);
  let stopping = false;

  console.log("PrintDesk agent started.");
  console.log({
    supabaseUrl: config.supabaseUrl,
    agentId: config.agentId,
    printerName: config.printerName,
    pollIntervalSeconds: config.pollIntervalSeconds,
    downloadDir: config.downloadDir,
    sumatraPath: config.sumatraPath,
    dryRun: config.dryRun
  });

  process.on("SIGINT", () => {
    stopping = true;
    console.log("Stopping agent...");
  });

  while (!stopping) {
    try {
      const handled = await pollOnce(supabase, config);
      if (!handled) {
        await sleep(config.pollIntervalSeconds * 1000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Poll loop error:", message);
      await sleep(config.pollIntervalSeconds * 1000);
    }
  }
}

main().catch((error) => {
  console.error("Agent failed to start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
