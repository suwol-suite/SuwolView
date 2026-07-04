export const IPC_CHANNELS = {
  openFile: "suwol:open-file",
  openFolder: "suwol:open-folder",
  openRecent: "suwol:open-recent",
  getPreferences: "suwol:get-preferences",
  setTheme: "suwol:set-theme",
  setPanelState: "suwol:set-panel-state",
  getMetadata: "suwol:get-metadata"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
