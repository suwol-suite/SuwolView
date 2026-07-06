import type { AppUpdater, ProgressInfo, UpdateCheckResult, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import electronUpdater from "electron-updater";
import type { AppError, AppResult, UpdatePreferences, UpdateState } from "../shared/types";
import { logMain } from "./logging";
import { failedResult } from "./metadataSafety";

export interface UpdateRuntimeOptions {
  isPackaged: boolean;
  safeMode: boolean;
  platform: NodeJS.Platform;
  appImagePath?: string;
  version: string;
  updater?: AppUpdater;
}

export interface UpdateSupport {
  supported: boolean;
  status: "idle" | "disabled" | "unsupported";
  reason?: AppError;
}

function appFailure(code: string, messageKey: string, details?: string): AppError {
  return { code, messageKey, details };
}

export function resolveUpdateSupport(options: UpdateRuntimeOptions): UpdateSupport {
  if (!options.isPackaged) {
    return {
      supported: false,
      status: "disabled",
      reason: appFailure("UPDATE_DISABLED_DEV", "errors.updateDisabledDev")
    };
  }
  if (options.safeMode) {
    return {
      supported: false,
      status: "disabled",
      reason: appFailure("UPDATE_DISABLED_SAFE_MODE", "errors.updateDisabledSafeMode")
    };
  }
  if (options.platform !== "linux") {
    return {
      supported: false,
      status: "unsupported",
      reason: appFailure("UPDATE_UNSUPPORTED_PLATFORM", "errors.updateUnsupportedPlatform")
    };
  }
  if (!options.appImagePath) {
    return {
      supported: false,
      status: "unsupported",
      reason: appFailure("UPDATE_UNSUPPORTED_LINUX_PACKAGE", "errors.updateUnsupportedLinuxPackage")
    };
  }
  return {
    supported: true,
    status: "idle"
  };
}

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly support: UpdateSupport;
  private state: UpdateState;
  private preferences: UpdatePreferences;

  constructor(
    options: UpdateRuntimeOptions,
    preferences: UpdatePreferences = { checkForUpdatesOnStartup: false }
  ) {
    this.updater = options.updater ?? electronUpdater.autoUpdater;
    this.support = resolveUpdateSupport(options);
    this.preferences = {
      checkForUpdatesOnStartup: preferences.checkForUpdatesOnStartup === true
    };
    this.state = {
      status: this.support.status,
      supported: this.support.supported,
      updateAvailable: false,
      downloaded: false,
      version: options.version,
      error: this.support.reason
    };

    if (this.support.supported) {
      this.configureUpdater();
    }
  }

  getStatus(): UpdateState {
    return { ...this.state, error: this.state.error ? { ...this.state.error } : undefined };
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

  async checkForUpdates(): Promise<AppResult<UpdateState>> {
    const supportFailure = this.supportFailure();
    if (supportFailure) return supportFailure;

    this.setState({ status: "checking", error: undefined });
    try {
      const result = await this.updater.checkForUpdates();
      if (result?.updateInfo) {
        this.applyUpdateInfo(result);
      }
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      return this.fail("UPDATE_CHECK_FAILED", "errors.updateCheckFailed", error);
    }
  }

  async downloadUpdate(): Promise<AppResult<UpdateState>> {
    const supportFailure = this.supportFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.updateAvailable) {
      return failedResult(appFailure("UPDATE_NOT_AVAILABLE", "errors.updateNotAvailable"));
    }

    this.setState({ status: "downloading", error: undefined });
    try {
      await this.updater.downloadUpdate();
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      return this.fail("UPDATE_DOWNLOAD_FAILED", "errors.updateDownloadFailed", error);
    }
  }

  installUpdate(): AppResult<UpdateState> {
    const supportFailure = this.supportFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.downloaded) {
      return failedResult(appFailure("UPDATE_NOT_DOWNLOADED", "errors.updateNotDownloaded"));
    }

    logMain("Installing downloaded update");
    this.updater.quitAndInstall(false, true);
    return { ok: true, data: this.getStatus() };
  }

  private configureUpdater(): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;

    this.updater.on("checking-for-update", () => {
      this.setState({ status: "checking", error: undefined });
    });
    this.updater.on("update-available", (info: UpdateInfo) => {
      this.setState({
        status: "available",
        updateAvailable: true,
        downloaded: false,
        latestVersion: info.version,
        releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined,
        error: undefined
      });
    });
    this.updater.on("update-not-available", (info: UpdateInfo) => {
      this.setState({
        status: "not-available",
        updateAvailable: false,
        downloaded: false,
        latestVersion: info.version,
        releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined,
        error: undefined
      });
    });
    this.updater.on("download-progress", (progress: ProgressInfo) => {
      this.setState({
        status: "downloading",
        progressPercent: progress.percent,
        error: undefined
      });
    });
    this.updater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
      this.setState({
        status: "downloaded",
        updateAvailable: true,
        downloaded: true,
        latestVersion: info.version,
        releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined,
        progressPercent: 100,
        error: undefined
      });
    });
    this.updater.on("error", (error: Error) => {
      this.setState({
        status: "error",
        error: appFailure("UPDATE_ERROR", "errors.updateFailed", error.message)
      });
    });
  }

  private applyUpdateInfo(result: UpdateCheckResult): void {
    const info = result.updateInfo;
    const latestVersion = info.version;
    if (latestVersion && this.state.status === "checking") {
      this.setState({
        status: "available",
        updateAvailable: true,
        latestVersion,
        releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined
      });
    }
  }

  private supportFailure(): AppResult<UpdateState> | undefined {
    if (this.support.supported) return undefined;
    this.setState({
      status: this.support.status,
      supported: false,
      error: this.support.reason
    });
    return failedResult(this.support.reason ?? appFailure("UPDATE_UNSUPPORTED", "errors.updateUnsupported"));
  }

  private fail(code: string, messageKey: string, error: unknown): AppResult<UpdateState> {
    const failure = appFailure(code, messageKey, error instanceof Error ? error.message : String(error));
    this.setState({
      status: "error",
      error: failure
    });
    return failedResult(failure);
  }

  private setState(nextState: Partial<UpdateState>): void {
    this.state = {
      ...this.state,
      ...nextState
    };
    logMain("Update status changed", {
      status: this.state.status,
      supported: this.state.supported,
      updateAvailable: this.state.updateAvailable,
      downloaded: this.state.downloaded,
      latestVersion: this.state.latestVersion,
      progressPercent: this.state.progressPercent,
      error: this.state.error
    });
  }
}
