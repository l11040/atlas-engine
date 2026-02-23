import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

// 목적: AuthStatusCard와 동일한 높이(h-9)의 정사각형 설정 버튼을 렌더링한다.
export function SettingsButton() {
  return (
    <Link
      to="/settings"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-base text-text-muted shadow-sm transition-colors hover:bg-surface-subtle hover:text-text-strong"
    >
      <Settings className="h-4 w-4" />
    </Link>
  );
}
