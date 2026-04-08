import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSettings } from "@/hooks/use-app-settings";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, loading, saveConfig } = useAppSettings();

  const [defaultCwd, setDefaultCwd] = useState("");
  const [saving, setSaving] = useState(false);

  // 목적: 설정이 로드되면 폼 state에 동기화한다.
  useEffect(() => {
    if (settings) {
      setDefaultCwd(settings.defaultCwd);
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfig({ defaultCwd });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-strong">설정</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-xs text-text-soft">설정 로드 중...</div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center">
            <h2 className="text-xs font-semibold text-text-strong">일반</h2>
            <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
          <div className="flex flex-col gap-4">
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
              <p className="text-2xs text-text-soft">로그 감시 시 기본으로 사용할 작업 디렉토리입니다.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
