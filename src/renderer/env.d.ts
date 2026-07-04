import type { SuwolApi } from "../shared/types";

declare global {
  interface Window {
    suwol: SuwolApi;
  }
}

export {};
