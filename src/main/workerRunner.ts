import path from "node:path";
import { Worker } from "node:worker_threads";
import type { WorkerResponse } from "./libraryTypes";

export function electronWorkerPath(workerFileName: string): string {
  return path.join(__dirname, workerFileName);
}

export function runWorker<Request, Response>(workerPath: string, request: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath);
    let settled = false;

    const finish = async (callback: () => void): Promise<void> => {
      if (settled) return;
      settled = true;
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
          reject(new Error(message.error ?? "Worker failed."));
        }
      });
    });

    worker.on("error", (error) => {
      void finish(() => reject(error));
    });

    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        void finish(() => reject(new Error(`Worker exited with code ${code}.`)));
      }
    });

    worker.postMessage(request);
  });
}
