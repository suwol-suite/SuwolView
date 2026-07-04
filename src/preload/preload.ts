import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { OpenLibraryResult, Preferences, SuwolApi, ThemeMode } from "../shared/types";

const api: SuwolApi = {
  openFile: () => ipcRenderer.invoke(IPC_CHANNELS.openFile) as Promise<OpenLibraryResult | null>,
  openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openFolder) as Promise<OpenLibraryResult | null>,
  openRecent: (sourceId: string) => ipcRenderer.invoke(IPC_CHANNELS.openRecent, sourceId) as Promise<OpenLibraryResult>,
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.getPreferences) as Promise<Preferences>,
  setTheme: (theme: ThemeMode) => ipcRenderer.invoke(IPC_CHANNELS.setTheme, theme) as Promise<Preferences>,
  setPanelState: (state) => ipcRenderer.invoke(IPC_CHANNELS.setPanelState, state) as Promise<Preferences>,
  getMetadata: (itemId: string) => ipcRenderer.invoke(IPC_CHANNELS.getMetadata, itemId)
};

contextBridge.exposeInMainWorld("suwol", api);
