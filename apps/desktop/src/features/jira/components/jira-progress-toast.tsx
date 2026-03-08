// 책임: Jira 티켓 수집 진행 상태를 우측 하단에 표시한다.

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useJiraProgress } from "../hooks/use-jira-progress";
import { cn } from "@/lib/utils";

export function JiraProgressToast() {
  const progress = useJiraProgress();

  if (!progress.active && !progress.phase) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-base px-4 py-2.5 shadow-lg">
      {progress.active && (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-500" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-strong">
              Jira 티켓 수집 중
            </span>
            <span className="text-2xs text-text-muted">
              {progress.key} {progress.phase === "searching-children" ? "하위 검색" : "조회"} · {progress.collected}개 수집
            </span>
          </div>
        </>
      )}

      {!progress.active && progress.phase === "completed" && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" />
          <span className="text-xs text-text-strong">{progress.message}</span>
        </>
      )}

      {!progress.active && progress.phase === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-danger" />
          <span className={cn("text-xs text-status-danger")}>{progress.message}</span>
        </>
      )}
    </div>
  );
}
