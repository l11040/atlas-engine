import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import type { CliAuthStatus, ProviderType } from "@shared/ipc";

interface ProviderStatus {
  provider: ProviderType;
  label: string;
  state: "checking" | CliAuthStatus;
  message: string;
}

const PROVIDERS: { type: ProviderType; label: string }[] = [
  { type: "claude", label: "Claude CLI" },
  { type: "codex", label: "Codex CLI" }
];

const STATE_LABEL: Record<string, string> = {
  checking: "확인 중",
  authenticated: "연결됨",
  unauthenticated: "미인증",
  cli_missing: "CLI 없음",
  error: "오류"
};

function StatusIcon({ state }: { state: string }) {
  if (state === "checking") return <Loader2 className="h-4 w-4 animate-spin text-text-muted" />;
  if (state === "authenticated") return <CheckCircle2 className="h-4 w-4 text-status-success" />;
  return <XCircle className="h-4 w-4 text-status-danger" />;
}

// 목적: 기본 provider의 연결 상태에 따른 아이콘을 반환한다.
function SummaryIcon({ state }: { state: "checking" | CliAuthStatus }) {
  if (state === "checking") return <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />;
  if (state === "authenticated") return <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />;
  return <XCircle className="h-3.5 w-3.5 text-status-danger" />;
}

const PROVIDER_LABEL: Record<ProviderType, string> = {
  claude: "Claude CLI",
  codex: "Codex CLI"
};

// 목적: 기본 provider의 연결 상태에 따른 요약 텍스트를 반환한다.
function summaryLabel(provider: ProviderType, state: "checking" | CliAuthStatus): string {
  const name = PROVIDER_LABEL[provider];
  if (state === "checking") return `${name} 확인 중`;
  if (state === "authenticated") return `${name} 연결`;
  return `${name} 미연결`;
}

export function AuthStatusCard() {
  const [activeProvider, setActiveProvider] = useState<ProviderType>("claude");
  const [statuses, setStatuses] = useState<ProviderStatus[]>(
    PROVIDERS.map((p) => ({ provider: p.type, label: p.label, state: "checking", message: "" }))
  );
  const didInitRef = useRef(false);

  const checkAll = useCallback(async () => {
    setStatuses((prev) => prev.map((s) => ({ ...s, state: "checking" as const, message: "" })));

    const results = await Promise.allSettled(
      PROVIDERS.map((p) => window.atlas.getCliAuthStatus({ provider: p.type }))
    );

    setStatuses(
      PROVIDERS.map((p, i) => {
        const result = results[i]!;
        if (result.status === "fulfilled") {
          return { provider: p.type, label: p.label, state: result.value.status, message: result.value.message };
        }
        return {
          provider: p.type,
          label: p.label,
          state: "error" as const,
          message: result.reason instanceof Error ? result.reason.message : "알 수 없는 오류"
        };
      })
    );
  }, []);

  // 목적: 마운트 시 설정에서 기본 provider를 로드하고, 모든 provider의 인증 상태를 1회 조회한다.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    window.atlas.getConfig().then((config) => setActiveProvider(config.activeProvider));
    void checkAll();
    return () => {
      didInitRef.current = false;
    };
  }, [checkAll]);

  const anyChecking = statuses.some((s) => s.state === "checking");

  // 목적: 버튼에 표시할 기본 provider의 상태를 추출한다.
  const activeStatus = statuses.find((s) => s.provider === activeProvider);
  const activeState = activeStatus?.state ?? "checking";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-semibold">
          <SummaryIcon state={activeState} />
          {summaryLabel(activeProvider, activeState)}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm border-border-subtle bg-surface-base">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-text-strong">CLI 연결 상태</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          {statuses.map((s) => (
            <div
              key={s.provider}
              className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2.5"
            >
              <StatusIcon state={s.state} />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-xs font-semibold text-text-strong">{s.label}</span>
                {s.message && <span className="text-2xs text-text-soft">{s.message}</span>}
              </div>
              <Badge
                variant="outline"
                className="shrink-0 text-2xs py-0 text-text-muted"
              >
                {STATE_LABEL[s.state] ?? s.state}
              </Badge>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={checkAll}
            disabled={anyChecking}
            className="gap-1.5 self-end text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            전체 갱신
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
