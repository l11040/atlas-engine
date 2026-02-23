import type { AtlasDesktopApi } from "@shared/ipc";

declare global {
  interface Window {
    atlas: AtlasDesktopApi;
  }
}

export {};
