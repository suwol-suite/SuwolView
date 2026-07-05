import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import type { ThumbnailWorkerRequest, WorkerResponse } from "../libraryTypes";

sharp.concurrency(1);
sharp.cache(false);

async function createThumbnail(request: ThumbnailWorkerRequest): Promise<void> {
  await mkdir(path.dirname(request.outputPath), { recursive: true });
  await sharp(request.inputPath, {
    animated: false,
    limitInputPixels: false
  })
    .rotate()
    .resize({
      width: request.size,
      height: request.size,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 76 })
    .toFile(request.outputPath);
}

parentPort?.on("message", (request: ThumbnailWorkerRequest) => {
  void createThumbnail(request)
    .then(() => {
      const response: WorkerResponse<void> = { ok: true };
      parentPort?.postMessage(response);
    })
    .catch((error: unknown) => {
      const response: WorkerResponse<void> = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
      parentPort?.postMessage(response);
    });
});
