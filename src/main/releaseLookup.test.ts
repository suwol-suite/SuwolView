import { describe, expect, it, vi } from "vitest";
import { GITHUB_LATEST_RELEASE_URL, lookupLatestRelease, platformAssets } from "./releaseLookup";

function response(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => payload
  } as unknown as Response;
}

describe("release lookup", () => {
  it("requests the latest stable release with cache-safe GitHub headers", async () => {
    const fetchImpl = vi.fn(async () => response({
      tag_name: "v0.2.10",
      name: "SuwolView 0.2.10",
      published_at: "2026-07-20T00:00:00.000Z",
      body: "Notes",
      html_url: "https://github.com/suwol-suite/SuwolView/releases/tag/v0.2.10",
      assets: [{ name: "latest-linux.yml" }, { name: "SuwolView-0.2.10-linux-x64.AppImage" }]
    })) as typeof fetch;

    const result = await lookupLatestRelease({ platform: "linux", currentVersion: "0.2.9", fetchImpl });
    expect(result).toMatchObject({ latestVersion: "0.2.10", comparison: "update-available", platformPackageAvailable: true });
    expect(fetchImpl).toHaveBeenCalledWith(GITHUB_LATEST_RELEASE_URL, expect.objectContaining({
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SuwolView/0.2.9",
        "Cache-Control": "no-cache"
      }
    }));
  });

  it("classifies platform packages precisely", () => {
    expect(platformAssets("win32", ["latest.yml", "SuwolView-0.2.10-setup.exe"])).toMatchObject({ hasPlatformUpdateMetadata: true, hasPlatformInstallerAsset: true });
    expect(platformAssets("darwin", ["latest-mac.yml", "SuwolView-0.2.10-mac-arm64.zip", "SuwolView-0.2.10-mac-arm64.dmg"])).toMatchObject({ hasPlatformUpdateMetadata: true, hasPlatformInstallerAsset: true, hasDmgAsset: true });
    expect(platformAssets("darwin", ["SuwolView-0.2.10-mac-arm64.dmg"])).toMatchObject({ hasPlatformUpdateMetadata: false, hasPlatformInstallerAsset: false });
    expect(platformAssets("linux", ["latest-linux.yml", "SuwolView-0.2.10-linux-x64.AppImage"])).toMatchObject({ hasPlatformUpdateMetadata: true, hasPlatformInstallerAsset: true });
  });

  it("handles no release, malformed responses, rate limits, and oversized bodies", async () => {
    await expect(lookupLatestRelease({ platform: "win32", currentVersion: "0.2.9", fetchImpl: vi.fn(async () => response({}, 404)) as typeof fetch })).resolves.toMatchObject({ comparison: "no-release" });
    await expect(lookupLatestRelease({ platform: "win32", currentVersion: "0.2.9", fetchImpl: vi.fn(async () => response([])) as typeof fetch })).rejects.toMatchObject({ appError: { code: "UPDATE_RESPONSE_INVALID" } });
    await expect(lookupLatestRelease({ platform: "win32", currentVersion: "0.2.9", fetchImpl: vi.fn(async () => response({}, 429)) as typeof fetch })).rejects.toMatchObject({ appError: { code: "UPDATE_HTTP_429" } });
    await expect(lookupLatestRelease({ platform: "win32", currentVersion: "0.2.9", fetchImpl: vi.fn(async () => response({ tag_name: "v0.2.10" }, 200, { "content-length": "2000000" })) as typeof fetch })).rejects.toMatchObject({ appError: { code: "UPDATE_RESPONSE_TOO_LARGE" } });
  });

  it("ends on timeout even when fetch ignores AbortController", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch;
    await expect(lookupLatestRelease({ platform: "darwin", currentVersion: "0.2.9", fetchImpl, timeoutMs: 5 })).rejects.toMatchObject({ appError: { code: "UPDATE_CHECK_TIMEOUT" } });
  });
});
