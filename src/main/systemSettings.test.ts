import { describe, expect, it } from "vitest";
import { resolveDefaultAppsRequest } from "./systemSettings";

describe("platform system settings IPC", () => {
  it("returns a structured unsupported result outside Windows", () => {
    expect(resolveDefaultAppsRequest("darwin", "defaultApps")).toEqual({
      ok: false,
      code: "SYSTEM_SETTINGS_UNSUPPORTED",
      messageKey: "errors.systemSettingsUnsupported"
    });
    expect(resolveDefaultAppsRequest("linux", "defaultApps").ok).toBe(false);
  });

  it("accepts the Windows default apps target only on Windows", () => {
    expect(resolveDefaultAppsRequest("win32", "defaultApps")).toEqual({ ok: true, data: undefined });
  });
});
