import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";

interface AuthStatusCardProps {
  authState: string;
  authMessage: string;
  onRefresh: () => Promise<void>;
}

export function AuthStatusCard({ authState, authMessage, onRefresh }: AuthStatusCardProps) {
  const authStateLabel: Record<string, string> = {
    checking: "확인 중",
    authenticated: "인증됨",
    unauthenticated: "미인증",
    cli_missing: "CLI 없음",
    error: "오류"
  };

  const statusIcon =
    authState === "checking" ? (
      <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
    ) : authState === "authenticated" ? (
      <CheckCircle2 className="h-4 w-4 text-status-success" />
    ) : (
      <XCircle className="h-4 w-4 text-status-danger" />
    );

  return (
    <div className="flex w-fit items-center gap-2 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5 text-text-strong shadow-sm">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-xs font-semibold tracking-tight">
          Claude CLI
        </span>
      </div>
      <div className="h-3.5 w-px bg-border-subtle" />
      <span className="text-2xs text-text-muted">{authStateLabel[authState] ?? authState}</span>
      <Button
        variant="outline"
        onClick={onRefresh}
        disabled={authState === "checking"}
        className="h-6 gap-1 border-border-subtle bg-surface-subtle px-1.5 text-2xs text-text-muted hover:bg-surface-base hover:text-text-strong"
        title={authMessage}
      >
        <RotateCcw className="h-3 w-3" />
        갱신
      </Button>
    </div>
  );
}
