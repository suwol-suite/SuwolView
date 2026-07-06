import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ResourceLimits } from "node:worker_threads";
import type { WorkerResponse } from "./libraryTypes";
import { logWorker } from "./logging";

export function electronWorkerPath(workerFileName: string): string {
  return path.join(__dirname, workerFileName);
}

export type WorkerRunErrorCode = "WORKER_TIMEOUT" | "WORKER_OUT_OF_MEMORY" | "WORKER_ERROR" | "WORKER_EXITED" | "WORKER_FAILED";

export interface RunWorkerOptions {
  resourceLimits?: ResourceLimits;
  timeoutMs?: number;
}

export class WorkerRunError extends Error {
  constructor(
    readonly code: WorkerRunErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "WorkerRunError";
  }
}

function workerErrorCode(error: Error): WorkerRunErrorCode {
  const message = error.message.toLowerCase();
  const nodeCode = "code" in error ? String((error as Error & { code?: string }).code ?? "") : "";
  if (nodeCode === "ERR_WORKER_OUT_OF_MEMORY" || message.includes("out of memory")) {
    return "WORKER_OUT_OF_MEMORY";
  }
  return "WORKER_ERROR";
}

export function runWorker<Request, Response>(
  workerPath: string,
  request: Request,
  options: RunWorkerOptions = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      resourceLimits: options.resourceLimits
    });
    let settled = false;
    const timeout = options.timeoutMs
      ? windowlessSetTimeout(() => {
          logWorker("Worker timed out", { worker: path.basename(workerPath), timeoutMs: options.timeoutMs });
          void finish(() => {
            reject(new WorkerRunError("WORKER_TIMEOUT", `Worker timed out after ${options.timeoutMs}ms.`));
          });
        }, options.timeoutMs)
      : undefined;

    const finish = async (callback: () => void): Promise<void> => {
      if (settled) return;
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      await worker.terminate();
      callback();
    };

    worker.on("message", (message: WorkerResponse<Response>) => {
      void finish(() => {
        if (message.ok && message.data !== undefined) {
          resolve(message.data);
        } else if (message.ok) {
          resolve(undefined as Response);
        } else {
          logWorker("Worker returned a failure", { worker: path.basename(workerPath), error: message.error });
          reject(new WorkerRunError("WORKER_FAILED", message.error ?? "Worker failed."));
        }
      });
    });

    worker.on("error", (error: unknown) => {
      const workerError = error instanceof Error ? error : new Error(String(error));
      logWorker("Worker emitted an error", { worker: path.basename(workerPath), error: workerError });
      void finish(() => reject(new WorkerRunError(workerErrorCode(workerError), workerError.message, { cause: workerError })));
    });

    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        logWorker("Worker exited unexpectedly", { worker: path.basename(workerPath), code });
        void finish(() => reject(new WorkerRunError("WORKER_EXITED", `Worker exited with code ${code}.`)));
      }
    });

    worker.postMessage(request);
  });
}

const windowlessSetTimeout: typeof setTimeout = setTimeout;
