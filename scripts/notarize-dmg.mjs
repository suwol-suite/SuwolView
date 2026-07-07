import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDir = path.join(root, "release");
const diagnosticsDir = path.join(root, "diagnostics");
const submitDiagnosticsPath = path.join(diagnosticsDir, "notary-submit.json");
const infoDiagnosticsPath = path.join(diagnosticsDir, "notary-info.json");
const logDiagnosticsPath = path.join(diagnosticsDir, "notary-log.json");
const historyDiagnosticsPath = path.join(diagnosticsDir, "notary-history.json");
const defaultProfileName = "suwol-notary-profile";
const commandTimeoutMs = 120000;
export const POLL_INTERVAL_MS = 30_000;
export const DEFAULT_TIMEOUT_MINUTES = 30;

export function notaryTimeoutMs(env = process.env) {
  const timeoutMinutes = Number(env.NOTARY_TIMEOUT_MINUTES || String(DEFAULT_TIMEOUT_MINUTES));
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error("NOTARY_TIMEOUT_MINUTES must be a positive number.");
  }
  return timeoutMinutes * 60 * 1000;
}

export const TIMEOUT_MS = notaryTimeoutMs();

export function redactSecrets(value, secrets = []) {
  let text = String(value ?? "");
  for (const secret of secrets) {
    if (secret) {
      text = text.replaceAll(secret, "***");
    }
  }
  return text;
}

export function notarytoolProfile(env = process.env) {
  const profile = String(env.NOTARYTOOL_PROFILE || defaultProfileName).trim();
  if (!profile) {
    throw new Error("Missing notarytool keychain profile name.");
  }
  return profile;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveDmgPath(explicitPath) {
  if (explicitPath) {
    const dmgPath = path.resolve(explicitPath);
    const artifactStats = await stat(dmgPath).catch(() => undefined);
    if (!artifactStats?.isFile() || !/\.dmg$/i.test(dmgPath)) {
      throw new Error(`Invalid macOS DMG path: ${path.relative(root, dmgPath) || dmgPath}`);
    }
    return dmgPath;
  }

  const entries = await readdir(releaseDir, { withFileTypes: true });
  const dmgFiles = entries
    .filter((entry) => entry.isFile() && /^SuwolView-.+-mac-arm64\.dmg$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dmgFiles.length !== 1) {
    throw new Error(`Expected exactly one macOS arm64 DMG in release/, found ${dmgFiles.length}: ${dmgFiles.join(", ") || "none"}`);
  }

  return path.join(releaseDir, dmgFiles[0]);
}

function relativePath(filePath) {
  return path.relative(root, filePath) || filePath;
}

function profileArgs(profile) {
  return ["--keychain-profile", profile, "--output-format", "json"];
}

export function submitArgs(dmgPath, profile) {
  return ["notarytool", "submit", dmgPath, ...profileArgs(profile)];
}

export function infoArgs(submissionId, profile) {
  return ["notarytool", "info", submissionId, ...profileArgs(profile)];
}

export function logArgs(submissionId, profile) {
  return ["notarytool", "log", submissionId, ...profileArgs(profile)];
}

export function historyArgs(profile) {
  return ["notarytool", "history", ...profileArgs(profile)];
}

async function runCommand(command, args, label, options = {}) {
  const { timeoutMs = commandTimeoutMs } = options;
  try {
    return await execFileAsync(command, args, {
      cwd: root,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024
    });
  } catch (error) {
    const output = redactSecrets([error?.stdout, error?.stderr].filter(Boolean).join("\n").trim());
    throw new Error(`${label} failed${output ? `:\n${output}` : "."}`, { cause: error });
  }
}

function parseJsonText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseJsonResult(stdout, stderr) {
  return parseJsonText(stdout) ?? parseJsonText(stderr);
}

async function writeDiagnosticsJson(filePath, payload) {
  await mkdir(diagnosticsDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function commandFailurePayload(label, error) {
  return {
    error: `${label} failed`,
    stdout: redactSecrets(error?.cause?.stdout ?? error?.stdout ?? ""),
    stderr: redactSecrets(error?.cause?.stderr ?? error?.stderr ?? ""),
    message: redactSecrets(error instanceof Error ? error.message : String(error))
  };
}

async function runJsonCommand(command, args, label, diagnosticsPath, options = {}) {
  try {
    const result = await runCommand(command, args, label, options);
    const json = parseJsonResult(result.stdout, result.stderr);
    if (!json) {
      const payload = {
        error: `${label} did not return valid JSON`,
        stdout: redactSecrets(result.stdout),
        stderr: redactSecrets(result.stderr)
      };
      await writeDiagnosticsJson(diagnosticsPath, payload);
      throw new Error(`${label} did not return valid JSON.`);
    }
    await writeDiagnosticsJson(diagnosticsPath, json);
    return { json, failed: false };
  } catch (error) {
    const cause = error?.cause;
    const json = parseJsonResult(cause?.stdout, cause?.stderr);
    if (json) {
      await writeDiagnosticsJson(diagnosticsPath, json);
      return { json, failed: true };
    }

    const payload = commandFailurePayload(label, error);
    await writeDiagnosticsJson(diagnosticsPath, payload);
    return { json: payload, failed: true };
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function submissionIdFromResult(submitResult, logResult) {
  return submitResult?.id ?? submitResult?.submissionId ?? logResult?.jobId ?? logResult?.id ?? "";
}

export function submissionStatusFromResult(submitResult, logResult) {
  return submitResult?.status ?? logResult?.status ?? "Unknown";
}

export function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

export function isAcceptedNotaryStatus(status) {
  return normalizeStatus(status) === "accepted";
}

export function isFailedNotaryStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "invalid" || normalized === "rejected";
}

export function isPendingNotaryStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "in progress" || normalized === "uploaded" || normalized === "created";
}

export function formatNotaryFailure(submitResult = {}, logResult = {}) {
  const submissionId = submissionIdFromResult(submitResult, logResult) || "unknown";
  const status = submissionStatusFromResult(submitResult, logResult);
  const statusSummary = logResult?.statusSummary ?? submitResult?.statusSummary ?? submitResult?.message ?? logResult?.message ?? "not provided";
  const issues = Array.isArray(logResult?.issues) ? logResult.issues : [];
  const lines = [
    "Notarization failed.",
    `Submission ID: ${submissionId}`,
    `Status: ${status}`,
    `Status summary: ${statusSummary}`,
    "",
    "Issues:"
  ];

  if (issues.length === 0) {
    lines.push("- No issues were returned by notarytool log.");
    return lines.join("\n");
  }

  for (const issue of issues) {
    lines.push(
      `- severity: ${issue?.severity ?? "unknown"}`,
      `  path: ${issue?.path ?? "unknown"}`,
      `  message: ${issue?.message ?? "not provided"}`,
      `  architecture: ${issue?.architecture ?? "unknown"}`,
      `  docUrl: ${issue?.docUrl ?? "not provided"}`
    );
  }

  return lines.join("\n");
}

async function submitDmg(dmgPath, profile) {
  return runJsonCommand(
    "xcrun",
    submitArgs(dmgPath, profile),
    `notarytool submit ${relativePath(dmgPath)}`,
    submitDiagnosticsPath
  );
}

async function fetchNotaryInfo(submissionId, profile) {
  return runJsonCommand(
    "xcrun",
    infoArgs(submissionId, profile),
    `notarytool info ${submissionId}`,
    infoDiagnosticsPath
  );
}

async function fetchNotaryHistory(profile) {
  return runJsonCommand("xcrun", historyArgs(profile), "notarytool history", historyDiagnosticsPath);
}

async function fetchNotaryLog(submissionId, profile) {
  if (!submissionId) {
    const payload = { error: "Cannot fetch notarytool log without a submission id." };
    await writeDiagnosticsJson(logDiagnosticsPath, payload);
    return { json: payload, failed: true };
  }

  return runJsonCommand("xcrun", logArgs(submissionId, profile), `notarytool log ${submissionId}`, logDiagnosticsPath);
}

async function pollNotaryInfo(submissionId, profile) {
  const startedAt = Date.now();
  const timeoutMs = notaryTimeoutMs();
  let latestInfo = {};
  let latestStatus = "Unknown";

  while (Date.now() - startedAt < timeoutMs) {
    const infoResult = await fetchNotaryInfo(submissionId, profile);
    latestInfo = infoResult.json;
    latestStatus = submissionStatusFromResult(latestInfo);
    console.log(`Notarization status: ${latestStatus}`);

    if (infoResult.failed) {
      return { timedOut: false, info: latestInfo, status: latestStatus };
    }
    if (isAcceptedNotaryStatus(latestStatus) || isFailedNotaryStatus(latestStatus)) {
      return { timedOut: false, info: latestInfo, status: latestStatus };
    }
    if (!isPendingNotaryStatus(latestStatus)) {
      return { timedOut: false, info: latestInfo, status: latestStatus };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { timedOut: true, info: latestInfo, status: latestStatus, timeoutMs };
}

async function stapleAndValidateDmg(dmgPath) {
  await runCommand("xcrun", ["stapler", "staple", dmgPath], `stapler staple ${relativePath(dmgPath)}`);
  console.log("Staple succeeded.");
  await runCommand("xcrun", ["stapler", "validate", dmgPath], `stapler validate ${relativePath(dmgPath)}`);
  console.log("Stapler validation succeeded.");
}

async function failWithNotaryLog(submitJson, submissionId, status, profile, options = {}) {
  const { timedOut = false } = options;
  if (timedOut) {
    const timeoutMinutes = notaryTimeoutMs() / 60000;
    console.error(`Notarization timed out after ${timeoutMinutes} minutes.`);
    console.error("The notary submission may still finish later. If it becomes Accepted, staple the DMG and attach the macOS assets to the same GitHub Release manually.");
    await fetchNotaryHistory(profile);
  }

  const logResult = await fetchNotaryLog(submissionId, profile);
  if (logResult.failed) {
    console.error(`Unable to fetch complete notarytool log for submission: ${submissionId || "unknown"}`);
    if (logResult.json?.message) {
      console.error(redactSecrets(logResult.json.message));
    }
  }

  console.error(formatNotaryFailure({ ...submitJson, id: submissionId, status }, logResult.json));
  throw new Error(`macOS DMG notarization failed with status: ${status}`);
}

export async function notarizeDmg(dmgPath) {
  const profile = notarytoolProfile();
  const submitResult = await submitDmg(dmgPath, profile);
  const submitJson = submitResult.json;
  const submissionId = submissionIdFromResult(submitJson);

  if (!submissionId) {
    console.error("notarytool submit did not return a submission id.");
    console.error(JSON.stringify(submitJson, null, 2));
    throw new Error("macOS DMG notarization failed before polling: missing submission id.");
  }

  console.log(`Submission ID: ${submissionId}`);
  const pollResult = await pollNotaryInfo(submissionId, profile);

  if (isAcceptedNotaryStatus(pollResult.status)) {
    console.log("Notarization accepted.");
    await stapleAndValidateDmg(dmgPath);
    return;
  }

  await failWithNotaryLog(submitJson, submissionId, pollResult.status, profile, {
    timedOut: pollResult.timedOut
  });
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("Skipping macOS DMG notarization on non-macOS host.");
    return;
  }

  if (!(await fileExists(releaseDir)) && !process.argv[2]) {
    throw new Error(`Release directory not found: ${path.relative(root, releaseDir)}`);
  }

  const dmgPath = await resolveDmgPath(process.argv[2]);
  console.log(`Notarizing and stapling macOS DMG: ${relativePath(dmgPath)}`);
  await notarizeDmg(dmgPath);
  console.log(`macOS DMG notarization, stapling, and validation completed: ${relativePath(dmgPath)}`);
}

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
