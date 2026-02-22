import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettings } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";
import type { ClaudePermissionMode } from "../../shared/ipc";

type SettingsTab = "general" | "claude";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "일반" },
  { key: "claude", label: "Claude CLI" }
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, loading, saveConfig } = useAppSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const [defaultCwd, setDefaultCwd] = useState("");
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [permissionMode, setPermissionMode] = useState<ClaudePermissionMode>("bypassPermissions");
  const [saving, setSaving] = useState(false);

  // 목적: 설정이 로드되면 폼 state에 동기화한다.
  useEffect(() => {
    if (settings) {
      setDefaultCwd(settings.defaultCwd);
      setTimeoutSec(Math.round(settings.claude.timeoutMs / 1000));
      setPermissionMode(settings.claude.permissionMode);
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfig({
        defaultCwd,
        claude: {
          timeoutMs: timeoutSec * 1000,
          permissionMode
        }
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-strong">설정</span>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-xs text-text-soft">설정 로드 중...</div>
      ) : (
        <div className="flex gap-4">
          {/* 좌측 탭 */}
          <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border-subtle pr-4">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-surface-subtle text-text-strong"
                    : "text-text-muted hover:bg-surface-subtle hover:text-text-strong"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* 우측 콘텐츠 */}
          <div className="flex flex-1 flex-col gap-5 pl-4">
            {activeTab === "general" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">일반</h2>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="defaultCwd" className="text-xs font-semibold text-text-muted">
                    기본 작업 디렉토리
                  </Label>
                  <Input
                    id="defaultCwd"
                    value={defaultCwd}
                    onChange={(e) => setDefaultCwd(e.target.value)}
                    placeholder="비워두면 프로세스 기본 경로 사용"
                    className="h-8 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                  />
                  <p className="text-2xs text-text-soft">Claude CLI 실행 시 기본으로 사용할 작업 디렉토리입니다.</p>
                </div>
              </>
            )}

            {activeTab === "claude" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">Claude CLI</h2>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="timeoutSec" className="text-xs font-semibold text-text-muted">
                      타임아웃 (초)
                    </Label>
                    <Input
                      id="timeoutSec"
                      type="number"
                      min={10}
                      max={3600}
                      value={timeoutSec}
                      onChange={(e) => setTimeoutSec(Number(e.target.value))}
                      className="h-8 w-32 border-border-subtle bg-surface-subtle text-xs text-text-strong"
                    />
                    <p className="text-2xs text-text-soft">CLI 응답 대기 최대 시간입니다. 기본값 300초.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-text-muted">권한 모드</Label>
                    <Select value={permissionMode} onValueChange={(v) => setPermissionMode(v as ClaudePermissionMode)}>
                      <SelectTrigger className="h-8 w-48 border-border-subtle bg-surface-subtle text-xs text-text-strong">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border-subtle bg-surface-base">
                        <SelectItem value="bypassPermissions" className="text-xs">
                          bypassPermissions
                        </SelectItem>
                        <SelectItem value="default" className="text-xs">
                          default
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-2xs text-text-soft">bypassPermissions: 모든 도구 권한을 자동 승인합니다.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
