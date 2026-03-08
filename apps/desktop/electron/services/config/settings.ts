// 책임: 앱 설정을 SQLite에 저장하고 캐시를 관리한다.

import type { AppSettings, DeepPartial } from "../../../shared/ipc";
import { decodeStoredValue, encodeStoredValue } from "../storage/codec";
import { getAppDatabase } from "../storage/sqlite-db";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCwd: "",
  activeProvider: "claude",
  cli: {
    timeoutMs: 300_000,
    permissionMode: "auto"
  },
  tracing: {
    enabled: false,
    apiKey: "",
    project: "atlas-engine",
    endpoint: "https://api.smith.langchain.com"
  }
};

let cached: AppSettings | null = null;

function cloneDefaultSettings(): AppSettings {
  return {
    defaultCwd: DEFAULT_SETTINGS.defaultCwd,
    activeProvider: DEFAULT_SETTINGS.activeProvider,
    cli: { ...DEFAULT_SETTINGS.cli },
    tracing: DEFAULT_SETTINGS.tracing
      ? { ...DEFAULT_SETTINGS.tracing }
      : {
          enabled: false,
          apiKey: "",
          project: "atlas-engine",
          endpoint: "https://api.smith.langchain.com"
        }
  };
}

// 목적: 기본값 키를 기준으로 재귀 병합한다 (forward compatibility).
function deepMergeDefaults(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(overrides)) {
    const defaultVal = defaults[key];
    const overrideVal = overrides[key];

    if (
      overrideVal !== undefined &&
      typeof defaultVal === "object" &&
      defaultVal !== null &&
      !Array.isArray(defaultVal) &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMergeDefaults(defaultVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }

  return result;
}

// 목적: DB 데이터와 기본 설정 스키마를 병합한다.
function mergeWithDefaultSettings(overrides: Record<string, unknown>): AppSettings {
  return deepMergeDefaults(
    DEFAULT_SETTINGS as unknown as Record<string, unknown>,
    overrides
  ) as unknown as AppSettings;
}

// 목적: DB에서 설정을 읽어 기본값과 병합한 뒤 메모리에 캐시한다.
export async function loadSettings(): Promise<AppSettings> {
  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM app_settings WHERE id = 1").get() as { data: unknown } | undefined;

  if (row) {
    const decoded = decodeStoredValue<Record<string, unknown>>(row.data);
    if (decoded) {
      cached = mergeWithDefaultSettings(decoded);
      return cached;
    }
  }

  cached = cloneDefaultSettings();
  persistSettings(cached);
  return cached;
}

// 목적: 캐시된 설정을 동기 반환한다 (provider 등 hot-path에서 사용).
export function getSettings(): AppSettings {
  if (!cached) {
    // 주의: loadSettings()가 호출되기 전에 접근하면 기본값을 반환한다.
    return cloneDefaultSettings();
  }
  return cached;
}

// 목적: 부분 업데이트를 받아 캐시를 갱신하고 DB에 저장한다.
export async function updateSettings(partial: DeepPartial<AppSettings>): Promise<AppSettings> {
  const current = getSettings();
  cached = deepMergeDefaults(
    current as unknown as Record<string, unknown>,
    partial as unknown as Record<string, unknown>
  ) as unknown as AppSettings;

  persistSettings(cached);
  return cached;
}

function persistSettings(settings: AppSettings): void {
  const db = getAppDatabase();
  db.prepare(`
    INSERT INTO app_settings (id, data, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(encodeStoredValue(settings), Date.now());
}
