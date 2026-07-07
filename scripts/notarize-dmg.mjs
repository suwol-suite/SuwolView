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
const logDiagnosticsPath = path.join(diagnosticsDir, "notary-log.json");
const requiredEnvVars = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
const secretEnvNames = [...requiredEnvVars];
const commandTimeoutMs = 120000;
const notarySubmitTimeoutMs = 45 * 60 * 1000;

export function redactSecrets(value, env = process.env) {
  let text = String(value ?? "");
  for (const name of secretEnvNames) {
    const secret = env[name];
    if (secret) {
      text = text.replaceAll(secret, "***");
    }
  }
  return text;
}

export function missingRequiredEnv(env = process.env) {
  return requiredEnvVars.filter((name) => !env[name]);
}

function requiredCredentials(env = process.env) {
  const missing = missingRequiredEnv(env);
  if (missing.length > 0) {
    throw new Error(`Missing required macOS notarization environment variable(s): ${missing.join(", ")}`);
  }

  return {
    appleId: env.APPLE_ID,
    password: env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: env.APPLE_TEAM_ID
  };
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

export function submissionIdFromResult(submitResult, logResult) {
  return submitResult?.id ?? submitResult?.submissionId ?? logResult?.jobId ?? logResult?.id ?? "";
}

export function submissionStatusFromResult(submitResult, logResult) {
  return submitResult?.status ?? logResult?.status ?? "Unknown";
}

export function isAcceptedNotaryStatus(status) {
  return String(status ?? "").toLowerCase() === "accepted";
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

async function submitDmg(dmgPath, credentials) {
  return runJsonCommand(
    "xcrun",
    [
      "notarytool",
      "submit",
      dmgPath,
      "--apple-id",
      credentials.appleId,
      "--password",
      credentials.password,
      "--team-id",
      credentials.teamId,
      "--wait",
      "--output-format",
      "json"
    ],
    `notarytool submit ${relativePath(dmgPath)}`,
    submitDiagnosticsPath,
    { timeoutMs: notarySubmitTimeoutMs }
  );
}

async function fetchNotaryLog(submissionId, credentials) {
  if (!submissionId) {
    const payload = { error: "Cannot fetch notarytool log without a submission id." };
    await writeDiagnosticsJson(logDiagnosticsPath, payload);
    return { json: payload, failed: true };
  }

  return runJsonCommand(
    "xcrun",
    [
      "notarytool",
      "log",
      submissionId,
      "--apple-id",
      credentials.appleId,
      "--password",
      credentials.password,
      "--team-id",
      credentials.teamId,
      "--output-format",
      "json"
    ],
    `notarytool log ${submissionId}`,
    logDiagnosticsPath
  );
}

async function stapleAndValidateDmg(dmgPath) {
  await runCommand("xcrun", ["stapler", "staple", dmgPath], `stapler staple ${relativePath(dmgPath)}`);
  console.log("Staple succeeded.");
  await runCommand("xcrun", ["stapler", "validate", dmgPath], `stapler validate ${relativePath(dmgPath)}`);
  console.log("Stapler validation succeeded.");
}

export async function notarizeDmg(dmgPath) {
  const credentials = requiredCredentials();
  const submitResult = await submitDmg(dmgPath, credentials);
  const submitJson = submitResult.json;
  const submissionId = submissionIdFromResult(submitJson);
  const status = submissionStatusFromResult(submitJson);

  if (submissionId) {
    console.log(`Submission ID: ${submissionId}`);
  }
  console.log(`Notarization status: ${status}`);

  if (!submitResult.failed && isAcceptedNotaryStatus(status)) {
    console.log("Notarization accepted.");
    await stapleAndValidateDmg(dmgPath);
    return;
  }

  const logResult = await fetchNotaryLog(submissionId, credentials);
  if (logResult.failed) {
    console.error(`Unable to fetch complete notarytool log for submission: ${submissionId || "unknown"}`);
    if (logResult.json?.message) {
      console.error(redactSecrets(logResult.json.message));
    }
  }
  console.error(redactSecrets(formatNotaryFailure(submitJson, logResult.json)));
  throw new Error(`macOS DMG notarization failed with status: ${status}`);
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
