import semver from "semver";
import type { AppError, UpdateComparison, UpdateReleaseInfo } from "../shared/types";

export const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/suwol-suite/SuwolView/releases/latest";
export const RELEASE_LOOKUP_TIMEOUT_MS = 15_000;
export const MAX_RELEASE_RESPONSE_BYTES = 1024 * 1024;

export interface ReleaseLookupOptions {
  platform: NodeJS.Platform;
  currentVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => string;
}

export interface ReleaseLookupResult {
  currentVersion: string;
  latestVersion?: string;
  tagName?: string;
  releaseName?: string;
  publishedAt?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  assets: string[];
  comparison: UpdateComparison;
  platformPackageAvailable: boolean;
  manualDownloadUrl?: string;
  release?: UpdateReleaseInfo;
  checkedAt: string;
}

export class ReleaseLookupError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError, message = appError.code) {
    super(message);
    this.name = "ReleaseLookupError";
    this.appError = appError;
  }
}

function failure(code: string, messageKey: string): ReleaseLookupError {
  return new ReleaseLookupError({ code, messageKey });
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

export function compareVersions(currentVersion: string, latestVersion: string): UpdateComparison {
  const current = semver.valid(normalizeVersion(currentVersion));
  const latest = semver.valid(normalizeVersion(latestVersion));
  if (!current || !latest) return "error";
  const comparison = semver.compare(current, latest);
  return comparison === 0 ? "up-to-date" : comparison < 0 ? "update-available" : "ahead";
}

export function platformAssets(
  platform: NodeJS.Platform,
  assetNames: string[]
): Pick<UpdateReleaseInfo, "hasPlatformUpdateMetadata" | "hasPlatformInstallerAsset" | "hasDmgAsset"> {
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
      hasPlatformInstallerAsset: names.some((name) => /(?:^|-)mac-arm64\.zip$/.test(name)),
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

function assetNamesFromPayload(payload: GitHubReleasePayload): string[] {
  if (!Array.isArray(payload.assets)) return [];
  return payload.assets
    .map((asset) => (asset && typeof asset === "object" && "name" in asset ? asset.name : undefined))
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

async function readResponseText(response: Response): Promise<string> {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength && Number(contentLength) > MAX_RELEASE_RESPONSE_BYTES) {
    throw failure("UPDATE_RESPONSE_TOO_LARGE", "errors.updateCheckFailed");
  }

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_RELEASE_RESPONSE_BYTES) {
          await reader.cancel();
          throw failure("UPDATE_RESPONSE_TOO_LARGE", "errors.updateCheckFailed");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }

  if (typeof response.text === "function") {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RELEASE_RESPONSE_BYTES) {
      throw failure("UPDATE_RESPONSE_TOO_LARGE", "errors.updateCheckFailed");
    }
    return text;
  }

  throw failure("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed");
}

async function readJson(response: Response): Promise<GitHubReleasePayload> {
  try {
    const contentLength = response.headers?.get?.("content-length");
    if (contentLength && Number(contentLength) > MAX_RELEASE_RESPONSE_BYTES) {
      throw failure("UPDATE_RESPONSE_TOO_LARGE", "errors.updateCheckFailed");
    }
    let parsed: unknown;
    if (typeof response.text === "function") {
      const raw = await readResponseText(response);
      parsed = JSON.parse(raw) as unknown;
    } else if (typeof (response as Response & { json?: () => Promise<unknown> }).json === "function") {
      parsed = await (response as Response & { json: () => Promise<unknown> }).json();
      if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_RELEASE_RESPONSE_BYTES) {
        throw failure("UPDATE_RESPONSE_TOO_LARGE", "errors.updateCheckFailed");
      }
    } else {
      throw failure("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw failure("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed");
    }
    return parsed as GitHubReleasePayload;
  } catch (error) {
    if (error instanceof ReleaseLookupError) throw error;
    throw failure("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed");
  }
}

export async function lookupLatestRelease(options: ReleaseLookupOptions): Promise<ReleaseLookupResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? RELEASE_LOOKUP_TIMEOUT_MS;
  const checkedAt = options.now ?? (() => new Date().toISOString());
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const responsePromise = fetchImpl(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `SuwolView/${options.currentVersion}`,
        "Cache-Control": "no-cache"
      },
      signal: controller.signal
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(failure("UPDATE_CHECK_TIMEOUT", "errors.updateCheckTimeout"));
      }, timeoutMs);
    });
    const response = await Promise.race([responsePromise, timeoutPromise]);

    if (response.status === 404) {
      return {
        currentVersion: options.currentVersion,
        assets: [],
        comparison: "no-release",
        platformPackageAvailable: false,
        checkedAt: checkedAt()
      };
    }
    if (response.status === 403) throw failure("UPDATE_HTTP_403", "errors.updateCheckFailed");
    if (response.status === 429) throw failure("UPDATE_HTTP_429", "errors.updateCheckFailed");
    if (response.status >= 500) throw failure("UPDATE_HTTP_5XX", "errors.updateCheckFailed");
    if (!response.ok) throw failure(`UPDATE_HTTP_${response.status}`, "errors.updateCheckFailed");

    // Keep the same deadline while reading the response body. A server can
    // return headers promptly and then leave the body hanging indefinitely.
    const payload = await Promise.race([readJson(response), timeoutPromise]);
    if (payload.draft === true || payload.prerelease === true) {
      return {
        currentVersion: options.currentVersion,
        assets: [],
        comparison: "no-release",
        platformPackageAvailable: false,
        checkedAt: checkedAt()
      };
    }
    if (typeof payload.tag_name !== "string" || !semver.valid(normalizeVersion(payload.tag_name))) {
      throw failure("UPDATE_RESPONSE_INVALID", "errors.updateCheckFailed");
    }

    const latestVersion = normalizeVersion(payload.tag_name);
    const assets = assetNamesFromPayload(payload);
    const platform = platformAssets(options.platform, assets);
    const releaseUrl = typeof payload.html_url === "string" ? payload.html_url : undefined;
    const release: UpdateReleaseInfo = {
      latestTag: payload.tag_name,
      title: typeof payload.name === "string" ? payload.name : undefined,
      publishedAt: typeof payload.published_at === "string" && !Number.isNaN(Date.parse(payload.published_at)) ? payload.published_at : undefined,
      body: typeof payload.body === "string" ? payload.body : undefined,
      url: releaseUrl,
      assetNames: assets,
      ...platform,
      platformPackageAvailable: platform.hasPlatformUpdateMetadata && platform.hasPlatformInstallerAsset,
      manualDownloadUrl: releaseUrl
    };
    const comparison = compareVersions(options.currentVersion, latestVersion);
    if (comparison === "error") throw failure("UPDATE_VERSION_INVALID", "errors.updateCheckFailed");
    return {
      currentVersion: options.currentVersion,
      latestVersion,
      tagName: payload.tag_name,
      releaseName: release.title,
      publishedAt: release.publishedAt,
      releaseNotes: release.body,
      releaseUrl,
      assets,
      comparison,
      platformPackageAvailable: release.platformPackageAvailable === true,
      manualDownloadUrl: releaseUrl,
      release,
      checkedAt: checkedAt()
    };
  } catch (error) {
    if (timedOut || (error instanceof DOMException && error.name === "AbortError")) {
      throw failure("UPDATE_CHECK_TIMEOUT", "errors.updateCheckTimeout");
    }
    if (error instanceof ReleaseLookupError) throw error;
    throw failure("UPDATE_NETWORK_ERROR", "errors.updateNetworkError");
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
