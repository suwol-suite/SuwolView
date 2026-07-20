import type { AppResult, RuntimePlatform } from "../shared/types";

export function resolveDefaultAppsRequest(platform: RuntimePlatform, target: unknown): AppResult<void> {
  if (target !== "defaultApps" || platform !== "win32") {
    return {
      ok: false,
      code: "SYSTEM_SETTINGS_UNSUPPORTED",
      messageKey: "errors.systemSettingsUnsupported"
    };
  }
  return { ok: true, data: undefined };
}
