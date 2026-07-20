import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import electronUpdater from "electron-updater";
import type {
  AppError,
  AppResult,
  UpdatePreferences,
  UpdateState
} from "../shared/types";
import { logMain } from "./logging";
import { failedResult } from "./metadataSafety";
import { lookupLatestRelease, type ReleaseLookupResult } from "./releaseLookup";
import { NativeUpdaterCheckService, type UpdateClock } from "./nativeUpdater";

const DEFAULT_DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;

export interface UpdateRuntimeOptions {
  isPackaged: boolean;
  safeMode: boolean;
  platform: NodeJS.Platform;
  appImagePath?: string;
  version: string;
  updater?: AppUpdater;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  nativeCheckTimeoutMs?: number;
  downloadInactivityTimeoutMs?: number;
  clock?: UpdateClock;
}

export interface UpdateSupport {
  supported: boolean;
  status: "idle" | "disabled" | "unsupported";
  reason?: AppError;
}

function appFailure(code: string, messageKey: string): AppError {
  return { code, messageKey };
}

function safeErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160);
  return typeof error === "string" ? error.slice(0, 160) : "unknown error";
}

export function resolveUpdateSupport(options: UpdateRuntimeOptions): UpdateSupport {
  if (!options.isPackaged) {
    return { supported: false, status: "disabled", reason: appFailure("UPDATE_DISABLED_DEV", "errors.updateDisabledDev") };
  }
  if (options.safeMode) {
    return { supported: false, status: "disabled", reason: appFailure("UPDATE_DISABLED_SAFE_MODE", "errors.updateDisabledSafeMode") };
  }
  if (options.platform === "darwin" || options.platform === "win32") return { supported: true, status: "idle" };
  if (options.platform !== "linux") {
    return { supported: false, status: "unsupported", reason: appFailure("UPDATE_UNSUPPORTED_PLATFORM", "errors.updateUnsupportedPlatform") };
  }
  if (!options.appImagePath) {
    return { supported: false, status: "unsupported", reason: appFailure("UPDATE_UNSUPPORTED_LINUX_PACKAGE", "errors.updateUnsupportedLinuxPackage") };
  }
  return { supported: true, status: "idle" };
}

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly support: UpdateSupport;
  private readonly platform: NodeJS.Platform;
  private readonly fetchImpl: typeof fetch;
  private readonly lookupTimeoutMs: number | undefined;
  private readonly nativeChecks: NativeUpdaterCheckService;
  private readonly downloadInactivityTimeoutMs: number;
  private readonly clock: UpdateClock;
  private readonly version: string;
  private state: UpdateState;
  private preferences: UpdatePreferences;
  private checkInFlight?: Promise<AppResult<UpdateState>>;
  private checkGeneration = 0;
  private requestSequence = 0;

  constructor(options: UpdateRuntimeOptions, preferences: UpdatePreferences = { checkForUpdatesOnStartup: false }) {
    this.updater = options.updater ?? electronUpdater.autoUpdater;
    this.support = resolveUpdateSupport(options);
    this.platform = options.platform;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookupTimeoutMs = options.timeoutMs;
    this.downloadInactivityTimeoutMs = options.downloadInactivityTimeoutMs ?? DEFAULT_DOWNLOAD_INACTIVITY_TIMEOUT_MS;
    this.clock = options.clock ?? { setTimeout, clearTimeout };
    this.version = options.version;
    this.preferences = { checkForUpdatesOnStartup: preferences.checkForUpdatesOnStartup === true };
    this.state = {
      status: this.support.status,
      supported: this.support.supported,
      updateAvailable: false,
      downloaded: false,
      version: options.version,
      comparison: this.support.status === "disabled" ? "disabled" : undefined,
      autoUpdateSupported: false,
      releaseLookupStatus: "idle",
      nativeUpdaterStatus: this.support.supported ? "idle" : "unsupported",
      downloadStatus: "idle",
      installStatus: "idle",
      error: this.support.reason
    };

    if (this.support.supported) {
      this.nativeChecks = new NativeUpdaterCheckService(
        this.updater,
        options.nativeCheckTimeoutMs,
        this.clock,
        { info: (message, details) => logMain(message, details), warn: (message, details) => logMain(message, details, "warn") }
      );
      this.configureUpdater();
    } else {
      this.nativeChecks = new NativeUpdaterCheckService(this.updater, options.nativeCheckTimeoutMs, this.clock);
    }
  }

  getStatus(): UpdateState {
    return {
      ...this.state,
      release: this.state.release ? { ...this.state.release, assetNames: [...this.state.release.assetNames] } : undefined,
      error: this.state.error ? { ...this.state.error } : undefined
    };
  }

  getPreferences(): UpdatePreferences {
    return { ...this.preferences };
  }

  setPreferences(preferences: Partial<UpdatePreferences>): UpdatePreferences {
    this.preferences = {
      checkForUpdatesOnStartup:
        typeof preferences.checkForUpdatesOnStartup === "boolean"
          ? preferences.checkForUpdatesOnStartup
          : this.preferences.checkForUpdatesOnStartup
    };
    logMain("Update preferences changed", { ...this.preferences });
    return this.getPreferences();
  }

  async checkOnStartup(): Promise<void> {
    if (!this.preferences.checkForUpdatesOnStartup) {
      logMain("Startup update check skipped because preference is disabled");
      return;
    }
    await this.checkForUpdates();
  }

  checkForUpdates(): Promise<AppResult<UpdateState>> {
    if (this.checkInFlight) return this.checkInFlight;
    if (this.support.status !== "idle") return Promise.resolve(this.supportFailure());

    const generation = ++this.checkGeneration;
    const requestId = `update-${++this.requestSequence}`;
    this.setState({
      status: "checking",
      error: undefined,
      comparison: undefined,
      releaseLookupStatus: "checking",
      nativeUpdaterStatus: "idle",
      downloadStatus: "idle",
      installStatus: "idle"
    });
    logMain("Update check started", { requestId, stage: "release-lookup" });
    const request = this.lookupAndCheckNative(requestId, generation).finally(() => {
      if (this.checkGeneration === generation) this.checkInFlight = undefined;
    });
    this.checkInFlight = request;
    return request;
  }

  async downloadUpdate(): Promise<AppResult<UpdateState>> {
    const supportFailure = this.automaticUpdateFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.updateAvailable) return failedResult(appFailure("UPDATE_NOT_AVAILABLE", "errors.updateNotAvailable"));

    const requestId = `download-${++this.requestSequence}`;
    this.setState({ status: "downloading", downloadStatus: "downloading", progressPercent: 0, error: undefined });
    logMain("Update download started", { requestId, stage: "download" });
    try {
      await this.runDownload(requestId);
      this.setState({ status: "downloaded", downloaded: true, downloadStatus: "downloaded", installStatus: "ready", progressPercent: 100, error: undefined });
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      const failure = appFailure(
        error instanceof DownloadTimeoutError ? "UPDATE_DOWNLOAD_TIMEOUT" : "UPDATE_DOWNLOAD_FAILED",
        error instanceof DownloadTimeoutError ? "errors.updateDownloadTimeout" : "errors.updateDownloadFailed"
      );
      logMain("Update download failed", { requestId, code: failure.code, error: safeErrorText(error) }, "warn");
      this.setState({ status: "error", downloaded: false, downloadStatus: "error", error: failure });
      return failedResult(failure);
    }
  }

  installUpdate(): AppResult<UpdateState> {
    const supportFailure = this.automaticUpdateFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.downloaded) return failedResult(appFailure("UPDATE_NOT_DOWNLOADED", "errors.updateNotDownloaded"));

    try {
      this.setState({ installStatus: "installing" });
      logMain("Installing downloaded update", { requestId: `install-${++this.requestSequence}`, stage: "install" });
      this.updater.quitAndInstall(false, true);
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      const failure = appFailure("UPDATE_INSTALL_FAILED", "errors.updateFailed");
      logMain("Update install failed", { code: failure.code, error: safeErrorText(error) }, "warn");
      this.setState({ installStatus: "ready", error: failure });
      return failedResult(failure);
    }
  }

  private async lookupAndCheckNative(requestId: string, generation: number): Promise<AppResult<UpdateState>> {
    try {
      const result = await lookupLatestRelease({
        platform: this.platform,
        currentVersion: this.version,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.lookupTimeoutMs
      });
      if (generation !== this.checkGeneration) return { ok: true, data: this.getStatus() };
      this.applyReleaseResult(result);
      if (result.comparison !== "update-available") return { ok: true, data: this.getStatus() };
      if (!this.state.autoUpdateSupported) {
        this.setState({ nativeUpdaterStatus: "unsupported" });
        return { ok: true, data: this.getStatus() };
      }

      logMain("Native updater check started", { requestId, stage: "native-check" });
      this.setState({ nativeUpdaterStatus: "checking" });
      const nativeResult = await this.nativeChecks.check(requestId);
      if (generation !== this.checkGeneration) return { ok: true, data: this.getStatus() };
      this.applyNativeResult(
        nativeResult.status,
        "info" in nativeResult ? nativeResult.info : undefined,
        "error" in nativeResult ? nativeResult.error : undefined
      );
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      const appError = "appError" in Object(error) ? (error as { appError: AppError }).appError : appFailure("UPDATE_CHECK_FAILED", "errors.updateNetworkError");
      this.setState({ status: "error", comparison: "error", releaseLookupStatus: "error", error: appError, lastCheckedAt: new Date().toISOString() });
      logMain("Release lookup failed", { requestId, stage: "release-lookup", code: appError.code, error: safeErrorText(error) }, "warn");
      return failedResult(appError);
    }
  }

  private applyReleaseResult(result: ReleaseLookupResult): void {
    const updateAvailable = result.comparison === "update-available";
    this.setState({
      status: result.comparison === "no-release" ? "no-release" : updateAvailable ? "available" : "not-available",
      supported: this.support.supported,
      updateAvailable,
      downloaded: false,
      latestVersion: result.latestVersion,
      releaseName: result.releaseName,
      release: result.release,
      comparison: result.comparison,
      autoUpdateSupported: result.platformPackageAvailable && this.support.supported,
      platformPackageAvailable: result.platformPackageAvailable,
      manualDownloadUrl: result.manualDownloadUrl,
      lastCheckedAt: result.checkedAt,
      releaseLookupStatus: "success",
      nativeUpdaterStatus: result.comparison === "update-available" ? "idle" : "not-available",
      downloadStatus: "idle",
      installStatus: "idle",
      error: undefined
    });
  }

  private applyNativeResult(status: "available" | "not-available" | "error" | "timeout", info?: UpdateInfo, error?: unknown): void {
    const nextStatus = status === "available" || this.state.updateAvailable ? "available" : status === "not-available" ? "not-available" : "error";
    const failure = status === "timeout"
      ? appFailure("UPDATE_NATIVE_CHECK_TIMEOUT", "errors.updateNativeCheckTimeout")
      : status === "error"
        ? appFailure("UPDATE_NATIVE_CHECK_FAILED", "errors.updateNativeCheckFailed")
        : undefined;
    if (failure) logMain("Native updater check ended with failure", { code: failure.code, error: safeErrorText(error) }, "warn");
    this.setState({
      status: nextStatus,
      nativeUpdaterStatus: status,
      latestVersion: typeof info?.version === "string" ? info.version : this.state.latestVersion,
      releaseName: typeof info?.releaseName === "string" ? info.releaseName : this.state.releaseName,
      error: failure
    });
  }

  private runDownload(requestId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const resetTimer = () => {
        if (timerId !== undefined) this.clock.clearTimeout(timerId);
        timerId = this.clock.setTimeout(() => finish(new DownloadTimeoutError()), this.downloadInactivityTimeoutMs);
      };
      const cleanup = () => {
        if (timerId !== undefined) this.clock.clearTimeout(timerId);
        this.updater.removeListener("download-progress", onProgress);
        this.updater.removeListener("update-downloaded", onDownloaded);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onProgress = (progress: ProgressInfo) => {
        this.setState({ status: "downloading", downloadStatus: "downloading", progressPercent: Math.max(0, Math.min(100, progress.percent)) });
        resetTimer();
      };
      const onDownloaded = () => finish();
      this.updater.on("download-progress", onProgress);
      this.updater.on("update-downloaded", onDownloaded);
      resetTimer();
      let downloadPromise: Promise<string[]>;
      try {
        downloadPromise = this.updater.downloadUpdate();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("download failed"));
        return;
      }
      void downloadPromise.then(() => finish(), (error) => finish(error instanceof Error ? error : new Error("download failed")));
      logMain("Update download request sent", { requestId, stage: "download" });
    });
  }

  private configureUpdater(): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;
    this.updater.on("checking-for-update", () => this.setState({ nativeUpdaterStatus: "checking" }));
    this.updater.on("update-available", (info: UpdateInfo) => this.setState({ nativeUpdaterStatus: "available", status: "available", updateAvailable: true, downloaded: false, latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : this.state.releaseName, error: undefined }));
    this.updater.on("update-not-available", (info: UpdateInfo) => this.setState({ nativeUpdaterStatus: "not-available", latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : this.state.releaseName }));
    this.updater.on("download-progress", (progress: ProgressInfo) => this.setState({ status: "downloading", downloadStatus: "downloading", progressPercent: progress.percent }));
    this.updater.on("update-downloaded", (info: UpdateDownloadedEvent) => this.setState({ status: "downloaded", updateAvailable: true, downloaded: true, downloadStatus: "downloaded", installStatus: "ready", latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : this.state.releaseName, progressPercent: 100, error: undefined }));
    this.updater.on("error", () => this.setState({ nativeUpdaterStatus: "error", error: appFailure("UPDATE_NATIVE_CHECK_FAILED", "errors.updateNativeCheckFailed") }));
  }

  private automaticUpdateFailure(): AppResult<UpdateState> | undefined {
    if (this.support.status === "disabled") return this.supportFailure();
    if (!this.support.supported || this.state.autoUpdateSupported !== true) return failedResult(appFailure("UPDATE_AUTOMATIC_UNAVAILABLE", "errors.updateAutomaticUnavailable"));
    return undefined;
  }

  private supportFailure(): AppResult<UpdateState> {
    this.setState({ status: this.support.status, supported: false, comparison: this.support.status === "disabled" ? "disabled" : undefined, releaseLookupStatus: "idle", nativeUpdaterStatus: "unsupported", error: this.support.reason });
    return failedResult(this.support.reason ?? appFailure("UPDATE_UNSUPPORTED", "errors.updateUnsupported"));
  }

  private setState(nextState: Partial<UpdateState>): void {
    this.state = { ...this.state, ...nextState };
    logMain("Update status changed", {
      status: this.state.status,
      releaseLookupStatus: this.state.releaseLookupStatus,
      nativeUpdaterStatus: this.state.nativeUpdaterStatus,
      downloadStatus: this.state.downloadStatus,
      installStatus: this.state.installStatus,
      supported: this.state.supported,
      updateAvailable: this.state.updateAvailable,
      downloaded: this.state.downloaded,
      latestVersion: this.state.latestVersion,
      comparison: this.state.comparison,
      autoUpdateSupported: this.state.autoUpdateSupported,
      error: this.state.error
    });
  }
}

class DownloadTimeoutError extends Error {
  constructor() {
    super("Update download became inactive");
    this.name = "DownloadTimeoutError";
  }
}
