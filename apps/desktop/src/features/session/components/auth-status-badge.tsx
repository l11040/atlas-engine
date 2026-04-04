// 책임: CLI 인증 상태를 간결한 뱃지로 표시한다.
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CliAuthStatus, ProviderType } from "@shared/ipc";

interface AuthStatusBadgeProps {
  provider: ProviderType;
  state: "checking" | CliAuthStatus;
}

const PROVIDER_LABEL: Record<ProviderType, string> = {
  claude: "Claude",
  codex: "Codex"
};

export function AuthStatusBadge({ provider, state }: AuthStatusBadgeProps) {
  const label = PROVIDER_LABEL[provider];

  return (
    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-semibold pointer-events-none">
      {state === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />}
      {state === "authenticated" && <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />}
      {state !== "checking" && state !== "authenticated" && <XCircle className="h-3.5 w-3.5 text-status-danger" />}
      {label}
    </Button>
  );
}
