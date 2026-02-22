// 책임: 앱 설정(settings.json)의 읽기·쓰기·캐시를 관리한다.
import { app } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppSettings, DeepPartial } from "../../../shared/ipc";

const SETTINGS_FILENAME = "settings.json";

const DEFAULT_SETTINGS: AppSettings = {
  defaultCwd: "",
  claude: {
    timeoutMs: 300_000,
    permissionMode: "bypassPermissions"
  }
};

let cached: AppSettings | null = null;

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILENAME);
}

// 목적: 기본값 키를 기준으로 재귀 병합한다 (forward compatibility).
function deepMergeDefaults(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(defaults)) {
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

// 목적: 파일에서 설정을 읽어 기본값과 병합한 뒤 메모리에 캐시한다.
export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(getSettingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    cached = deepMergeDefaults(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      parsed
    ) as unknown as AppSettings;
  } catch (_error) {
    // 이유: ENOENT(최초 실행)과 SyntaxError(파일 손상) 모두 기본값으로 안전하게 폴백한다.
    cached = { ...DEFAULT_SETTINGS, claude: { ...DEFAULT_SETTINGS.claude } };
  }

  return cached;
}

// 목적: 캐시된 설정을 동기 반환한다 (runner.ts 등 hot-path에서 사용).
export function getSettings(): AppSettings {
  if (!cached) {
    // 주의: loadSettings()가 호출되기 전에 접근하면 기본값을 반환한다.
    return { ...DEFAULT_SETTINGS, claude: { ...DEFAULT_SETTINGS.claude } };
  }
  return cached;
}

// 목적: 부분 업데이트를 받아 캐시를 갱신하고 파일에 저장한다.
export async function updateSettings(partial: DeepPartial<AppSettings>): Promise<AppSettings> {
  const current = getSettings();
  cached = deepMergeDefaults(
    current as unknown as Record<string, unknown>,
    partial as unknown as Record<string, unknown>
  ) as unknown as AppSettings;

  const settingsPath = getSettingsPath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(cached, null, 2), "utf-8");

  return cached;
}
