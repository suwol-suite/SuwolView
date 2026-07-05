import type { AppError, OpenLibraryResult, SuwolApi } from "../shared/types";

declare global {
  interface Window {
    suwol: SuwolApi;
  }

  interface WindowEventMap {
    "suwol:dropped-paths": CustomEvent<string[]>;
    "suwol:open-library-result": CustomEvent<{ requestId: number; result: OpenLibraryResult }>;
    "suwol:open-error": CustomEvent<{ requestId: number; error: AppError }>;
    "suwol:fullscreen-changed": CustomEvent<{ fullscreen: boolean }>;
  }
}

export {};
