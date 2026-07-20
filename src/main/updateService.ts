import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import electronUpdater from "electron-updater";
import semver from "semver";
import type {
  AppError,
  AppResult,
  UpdateComparison,
  UpdatePreferences,
  UpdateReleaseInfo,
  UpdateState
} from "../shared/types";
import { logMain } from "./logging";
import { failedResult } from "./metadataSafety";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/suwol-suite/SuwolView/releases?per_page=30";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface UpdateRuntimeOptions {
  isPackaged: boolean;
  safeMode: boolean;
  platform: NodeJS.Platform;
  appImagePath?: string;
  version: string;
  updater?: AppUpdater;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface UpdateSupport {
  supported: boolean;
  status: "idle" | "disabled" | "unsupported";
  reason?: AppError;
}

interface GitHubReleasePayload {
  draft?: unknown;
  prerelease?: unknown;
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  body?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

function appFailure(code: string, messageKey: string): AppError {
  return { code, messageKey };
}

function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

function isValidVersion(value: string): boolean {
  return semver.valid(value) !== null;
}

function classifyVersion(currentVersion: string, latestVersion: string): UpdateComparison {
  const current = normalizeVersion(currentVersion);
  const latest = normalizeVersion(latestVersion);
  if (!isValidVersion(current) || !isValidVersion(latest)) return "error";
  const comparison = semver.compare(current, latest);
  if (comparison === 0) return "up-to-date";
  return comparison < 0 ? "update-available" : "ahead";
}

function platformAssets(platform: NodeJS.Platform, assetNames: string[]): Pick<UpdateReleaseInfo, "hasPlatformUpdateMetadata" | "hasPlatformInstallerAsset" | "hasDmgAsset"> {
  const names = assetNames.map((name) => name.toLowerCase());
  if (platform === "win32") {
    return {
      hasPlatformUpdateMetadata: names.includes("latest.yml"),
      hasPlatformInstallerAsset: names.some((name) => name.endsWith(".exe")),
      hasDmgAsset: false
    };
  }
  if (platform === "darwin") {
    return {
      hasPlatformUpdateMetadata: names.includes("latest-mac.yml"),
      hasPlatformInstallerAsset: names.some((name) => name.endsWith(".zip") && /(^|-)mac(-|\.|$)/.test(name)),
      hasDmgAsset: names.some((name) => name.endsWith(".dmg"))
    };
  }
  if (platform === "linux") {
    return {
      hasPlatformUpdateMetadata: names.includes("latest-linux.yml"),
      hasPlatformInstallerAsset: names.some((name) => name.endsWith(".appimage")),
      hasDmgAsset: false
    };
  }
  return { hasPlatformUpdateMetadata: false, hasPlatformInstallerAsset: false, hasDmgAsset: false };
}

function releaseFromPayload(platform: NodeJS.Platform, payload: GitHubReleasePayload): UpdateReleaseInfo {
  const assetNames = Array.isArray(payload.assets)
    ? payload.assets
        .map((asset) => (asset && typeof asset === "object" && "name" in asset ? asset.name : undefined))
        .filter((name): name is string => typeof name === "string")
    : [];
  return {
    latestTag: typeof payload.tag_name === "string" ? payload.tag_name : undefined,
    title: typeof payload.name === "string" ? payload.name : undefined,
    publishedAt:
      typeof payload.published_at === "string" && !Number.isNaN(Date.parse(payload.published_at))
        ? payload.published_at
        : undefined,
    body: typeof payload.body === "string" ? payload.body : undefined,
    url: typeof payload.html_url === "string" ? payload.html_url : undefined,
    assetNames,
    ...platformAssets(platform, assetNames)
  };
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
  if (options.platform === "darwin") return { supported: true, status: "idle" };
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
  return { supported: true, status: "idle" };
}

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly support: UpdateSupport;
  private readonly platform: NodeJS.Platform;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly version: string;
  private state: UpdateState;
  private preferences: UpdatePreferences;
  private checkInFlight?: Promise<AppResult<UpdateState>>;
  private checkGeneration = 0;

  constructor(options: UpdateRuntimeOptions, preferences: UpdatePreferences = { checkForUpdatesOnStartup: false }) {
    this.updater = options.updater ?? electronUpdater.autoUpdater;
    this.support = resolveUpdateSupport(options);
    this.platform = options.platform;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.version = options.version;
    this.preferences = { checkForUpdatesOnStartup: preferences.checkForUpdatesOnStartup === true };
    this.state = {
      status: this.support.status,
      supported: this.support.supported,
      updateAvailable: false,
      downloaded: false,
      version: options.version,
      comparison: this.support.status === "disabled" ? "disabled" : undefined,
      autoUpdateSupported: this.support.supported,
      error: this.support.reason
    };

    if (this.support.supported) this.configureUpdater();
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

    const generation = ++this.checkGeneration;
    this.setState({ status: "checking", error: undefined, comparison: undefined });
    const request = this.fetchLatestRelease(generation).finally(() => {
      if (this.checkGeneration === generation) this.checkInFlight = undefined;
    });
    this.checkInFlight = request;
    return request;
  }

  async downloadUpdate(): Promise<AppResult<UpdateState>> {
    const supportFailure = this.automaticUpdateFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.updateAvailable) return failedResult(appFailure("UPDATE_NOT_AVAILABLE", "errors.updateNotAvailable"));

    this.setState({ status: "downloading", error: undefined });
    try {
      await this.updater.checkForUpdates();
      await this.updater.downloadUpdate();
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      return this.fail("UPDATE_DOWNLOAD_FAILED", "errors.updateDownloadFailed", error);
    }
  }

  installUpdate(): AppResult<UpdateState> {
    const supportFailure = this.automaticUpdateFailure();
    if (supportFailure) return supportFailure;
    if (!this.state.downloaded) return failedResult(appFailure("UPDATE_NOT_DOWNLOADED", "errors.updateNotDownloaded"));

    logMain("Installing downloaded update");
    this.updater.quitAndInstall(false, true);
    return { ok: true, data: this.getStatus() };
  }

  private async fetchLatestRelease(generation: number): Promise<AppResult<UpdateState>> {
    if (this.support.status === "disabled") return this.supportFailure();

    try {
      const payload = await this.requestJson(generation);
      const release = payload ? releaseFromPayload(this.platform, payload) : undefined;
      if (!release) {
        this.setStateForGeneration(generation, {
          status: "no-release",
          comparison: "no-release",
          updateAvailable: false,
          downloaded: false,
          lastCheckedAt: new Date().toISOString(),
          error: undefined
        });
        return { ok: true, data: this.getStatus() };
      }

      const latestTag = release.latestTag;
      const latestVersion = latestTag ? normalizeVersion(latestTag) : "";
      if (!latestTag || !isValidVersion(latestVersion)) {
        return this.fail("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed", new Error("Invalid release version"), generation);
      }
      const comparison = classifyVersion(this.version, latestVersion);
      if (comparison === "error") {
        return this.fail("UPDATE_VERSION_INVALID", "errors.updateCheckFailed", new Error("Invalid application version"), generation);
      }
      const updateAvailable = comparison === "update-available";
      const autoUpdateSupported = this.support.supported && release.hasPlatformUpdateMetadata && release.hasPlatformInstallerAsset;
      this.setStateForGeneration(generation, {
        status: updateAvailable ? "available" : "not-available",
        supported: this.support.supported,
        updateAvailable,
        downloaded: false,
        latestVersion,
        releaseName: release.title,
        release,
        comparison,
        autoUpdateSupported,
        lastCheckedAt: new Date().toISOString(),
        error: undefined
      });
      return { ok: true, data: this.getStatus() };
    } catch (error) {
      const isTimeout = error instanceof UpdateTimeoutError;
      return this.fail(
        isTimeout ? "UPDATE_CHECK_TIMEOUT" : "UPDATE_CHECK_FAILED",
        isTimeout ? "errors.updateCheckTimeout" : "errors.updateNetworkError",
        error,
        generation
      );
    }
  }

  private async requestJson(generation: number): Promise<GitHubReleasePayload | undefined> {
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new UpdateTimeoutError());
      }, this.timeoutMs);
    });
    try {
      const response = await Promise.race([
        this.fetchImpl(GITHUB_RELEASES_URL, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "SuwolView-update-check"
          },
          signal: controller.signal
        }),
        timeout
      ]);
      if (generation !== this.checkGeneration) throw new Error("Stale update check response");
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const raw = (await response.json()) as unknown;
      if (!Array.isArray(raw)) throw new Error("GitHub API returned malformed JSON");
      const stableRelease = raw.find(
        (entry): entry is GitHubReleasePayload =>
          Boolean(entry && typeof entry === "object") && entry.draft !== true && entry.prerelease !== true
      );
      return stableRelease;
    } catch (error) {
      if (timedOut) throw new UpdateTimeoutError();
      throw error;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  private configureUpdater(): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.on("checking-for-update", () => this.setState({ status: "checking", error: undefined }));
    this.updater.on("update-available", (info: UpdateInfo) => {
      this.setState({ status: "available", updateAvailable: true, downloaded: false, latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined, error: undefined });
    });
    this.updater.on("update-not-available", (info: UpdateInfo) => {
      this.setState({ status: "not-available", updateAvailable: false, downloaded: false, latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined, error: undefined });
    });
    this.updater.on("download-progress", (progress: ProgressInfo) => this.setState({ status: "downloading", progressPercent: progress.percent, error: undefined }));
    this.updater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
      this.setState({ status: "downloaded", updateAvailable: true, downloaded: true, latestVersion: info.version, releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined, progressPercent: 100, error: undefined });
    });
    this.updater.on("error", () => this.setState({ status: "error", error: appFailure("UPDATE_ERROR", "errors.updateFailed") }));
  }

  private automaticUpdateFailure(): AppResult<UpdateState> | undefined {
    if (this.support.status === "disabled") return this.supportFailure();
    if (!this.support.supported || this.state.autoUpdateSupported !== true) {
      return failedResult(appFailure("UPDATE_AUTOMATIC_UNAVAILABLE", "errors.updateAutomaticUnavailable"));
    }
    return undefined;
  }

  private supportFailure(): AppResult<UpdateState> {
    this.setState({ status: this.support.status, supported: false, comparison: this.support.status === "disabled" ? "disabled" : undefined, error: this.support.reason });
    return failedResult(this.support.reason ?? appFailure("UPDATE_UNSUPPORTED", "errors.updateUnsupported"));
  }

  private fail(code: string, messageKey: string, error: unknown, generation?: number): AppResult<UpdateState> {
    if (generation !== undefined && generation !== this.checkGeneration) return { ok: true, data: this.getStatus() };
    logMain("Update check failed", { code, error: error instanceof Error ? error.message : String(error) }, "warn");
    const failure = appFailure(code, messageKey);
    this.setState({ status: "error", comparison: "error", error: failure, lastCheckedAt: new Date().toISOString() });
    return failedResult(failure);
  }

  private setStateForGeneration(generation: number, nextState: Partial<UpdateState>): void {
    if (generation === this.checkGeneration) this.setState(nextState);
  }

  private setState(nextState: Partial<UpdateState>): void {
    this.state = { ...this.state, ...nextState };
    logMain("Update status changed", {
      status: this.state.status,
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

class UpdateTimeoutError extends Error {
  constructor() {
    super("Update request timed out");
    this.name = "UpdateTimeoutError";
  }
}
