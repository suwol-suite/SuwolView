import type { AppUpdater, UpdateCheckResult, UpdateInfo } from "electron-updater";

export const NATIVE_UPDATER_TIMEOUT_MS = 20_000;

export type NativeCheckOutcome =
  | { status: "available"; info?: UpdateInfo }
  | { status: "not-available"; info?: UpdateInfo }
  | { status: "error"; error?: unknown }
  | { status: "timeout" };

export interface UpdateClock {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export interface UpdateLogger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
}

const defaultClock: UpdateClock = { setTimeout, clearTimeout };
const defaultLogger: UpdateLogger = {
  info: () => undefined,
  warn: () => undefined
};

function updateInfoFromEvent(value: unknown): UpdateInfo | undefined {
  return value && typeof value === "object" ? (value as UpdateInfo) : undefined;
}

export class NativeUpdaterCheckService {
  private inFlight?: Promise<NativeCheckOutcome>;

  constructor(
    private readonly updater: AppUpdater,
    private readonly timeoutMs = NATIVE_UPDATER_TIMEOUT_MS,
    private readonly clock: UpdateClock = defaultClock,
    private readonly logger: UpdateLogger = defaultLogger
  ) {}

  check(requestId: string): Promise<NativeCheckOutcome> {
    if (this.inFlight) {
      this.logger.info("Native updater check reused in-flight request", { requestId });
      return this.inFlight;
    }

    const request = this.runCheck(requestId).finally(() => {
      if (this.inFlight === request) this.inFlight = undefined;
    });
    this.inFlight = request;
    return request;
  }

  private runCheck(requestId: string): Promise<NativeCheckOutcome> {
    return new Promise<NativeCheckOutcome>((resolve) => {
      let settled = false;
      const cleanup = () => {
        this.clock.clearTimeout(timeoutId);
        this.updater.removeListener("checking-for-update", onChecking);
        this.updater.removeListener("update-available", onAvailable);
        this.updater.removeListener("update-not-available", onNotAvailable);
        this.updater.removeListener("error", onError);
      };
      const finish = (outcome: NativeCheckOutcome) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(outcome);
      };
      const onChecking = () => {
        this.logger.info("Native updater emitted checking-for-update", { requestId });
      };
      const onAvailable = (info: unknown) => finish({ status: "available", info: updateInfoFromEvent(info) });
      const onNotAvailable = (info: unknown) => finish({ status: "not-available", info: updateInfoFromEvent(info) });
      const onError = (error: unknown) => finish({ status: "error", error });

      this.updater.on("checking-for-update", onChecking);
      this.updater.on("update-available", onAvailable);
      this.updater.on("update-not-available", onNotAvailable);
      this.updater.on("error", onError);
      const timeoutId = this.clock.setTimeout(() => {
        this.logger.warn("Native updater check timed out", { requestId });
        finish({ status: "timeout" });
      }, this.timeoutMs);

      let checkPromise: Promise<UpdateCheckResult | null>;
      try {
        checkPromise = this.updater.checkForUpdates();
      } catch (error) {
        finish({ status: "error", error });
        return;
      }

      // Always consume a late rejection. The request may already have timed out and
      // its listeners removed, but electron-updater can still reject its Promise.
      void checkPromise.then(
        (result) => {
          if (settled) return;
          const info = result?.updateInfo;
          finish(info ? { status: "available", info } : { status: "not-available" });
        },
        (error) => finish({ status: "error", error })
      );
    });
  }
}
