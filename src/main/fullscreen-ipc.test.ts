import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";

describe("fullscreen IPC channels", () => {
  it("uses whitelisted main-process fullscreen channels", () => {
    expect(IPC_CHANNELS.toggleFullscreen).toBe("app:toggleFullscreen");
    expect(IPC_CHANNELS.setFullscreen).toBe("app:setFullscreen");
    expect(IPC_CHANNELS.getFullscreenState).toBe("app:getFullscreenState");
    expect(IPC_CHANNELS.fullscreenChanged).toBe("app:onFullscreenChanged");
  });
});
