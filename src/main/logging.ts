import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LogFileName = "main.log" | "renderer.log" | "crash.log";
export type LogLevel = "info" | "warn" | "error";

export interface RendererLogPayload {
  level?: LogLevel;
  message: string;
  stack?: string;
  source?: string;
}

interface PendingLogEntry {
  fileName: LogFileName;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_LOG_TEXT_LENGTH = 12_000;
const pendingEntries: PendingLogEntry[] = [];
let activeLogger: AppLogger | undefined;
let processHandlersRegistered = false;

function limitText(value: string): string {
  return value.length <= MAX_LOG_TEXT_LENGTH ? value : `${value.slice(0, MAX_LOG_TEXT_LENGTH)}... [truncated]`;
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: limitText(value.message),
      stack: value.stack ? limitText(value.stack) : undefined
    };
  }
  if (typeof value === "string") return limitText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((entry) => sanitizeValue(entry));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      output[key] = sanitizeValue(entry);
    }
    return output;
  }
  return String(value);
}

function formatLogEntry(level: LogLevel, message: string, details?: Record<string, unknown>): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: limitText(message),
    details: details ? sanitizeValue(details) : undefined
  };
  return `${JSON.stringify(payload)}\n`;
}

async function flushPendingEntries(logger: AppLogger): Promise<void> {
  while (pendingEntries.length > 0) {
    const entry = pendingEntries.shift();
    if (!entry) continue;
    await logger.write(entry.fileName, entry.level, entry.message, entry.details);
  }
}

export class AppLogger {
  readonly logDir: string;

  constructor(userDataPath: string) {
    this.logDir = path.join(userDataPath, "logs");
  }

  async ensure(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
  }

  async write(fileName: LogFileName, level: LogLevel, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.ensure();
    await appendFile(path.join(this.logDir, fileName), formatLogEntry(level, message, details), "utf8");
  }
}

export function setActiveLogger(logger: AppLogger): void {
  activeLogger = logger;
  void flushPendingEntries(logger).catch((error: unknown) => {
    console.error("Failed to flush SuwolView logs", error);
  });
}

function writeLog(fileName: LogFileName, level: LogLevel, message: string, details?: Record<string, unknown>): void {
  if (!activeLogger) {
    pendingEntries.push({ fileName, level, message, details });
    return;
  }

  void activeLogger.write(fileName, level, message, details).catch((error: unknown) => {
    console.error("Failed to write SuwolView log", error);
  });
}

export function logMain(message: string, details?: Record<string, unknown>, level: LogLevel = "info"): void {
  writeLog("main.log", level, message, details);
}

export function logRenderer(payload: RendererLogPayload): void {
  writeLog("renderer.log", payload.level ?? "error", payload.message, {
    stack: payload.stack,
    source: payload.source
  });
}

export function logCrash(message: string, details?: Record<string, unknown>): void {
  writeLog("crash.log", "error", message, details);
}

export function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    logCrash("Uncaught main-process exception", { error });
    console.error(error);
  });

  process.on("unhandledRejection", (reason) => {
    logCrash("Unhandled main-process rejection", { reason });
    console.error(reason);
  });
}
