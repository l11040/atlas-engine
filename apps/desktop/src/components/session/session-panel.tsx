import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useCliSession } from "@/hooks/use-cli-session";
import { useGitDiff } from "@/hooks/use-git-diff";
import { PromptInput } from "./prompt-input";
import { ToolTimeline } from "./tool-timeline";
import { AssistantMessage } from "./assistant-message";
import { DiffViewer } from "./diff-viewer";
import type { ProviderType } from "../../../shared/ipc";

interface SessionPanelProps {
  /** 사용할 CLI provider */
  provider?: ProviderType;
  /** 작업 디렉토리가 고정된 경우 외부에서 전달 */
  defaultCwd?: string;
}

export function SessionPanel({ provider = "claude", defaultCwd }: SessionPanelProps) {
  const session = useCliSession(provider);
  const gitDiff = useGitDiff();
  // 이유: 완료 시 자동 diff fetch를 1회만 실행하기 위한 가드
  const didFetchDiffRef = useRef(false);

  // 목적: 세션 완료 시 수정된 파일을 대상으로 자동 git diff를 조회한다.
  useEffect(() => {
    if (session.status !== "completed") {
      didFetchDiffRef.current = false;
      return;
    }
    if (didFetchDiffRef.current) return;
    didFetchDiffRef.current = true;

    const touchedFiles = session.getTouchedFiles();
    if (touchedFiles.length === 0) return;

    // 목적: touchedFiles의 경로에서 공통 디렉토리를 추출하거나 defaultCwd를 사용한다.
    const cwd = defaultCwd ?? extractCwd(touchedFiles);
    if (cwd) {
      void gitDiff.fetchDiff(cwd, touchedFiles);
    }
  }, [session.status, session.getTouchedFiles, gitDiff.fetchDiff, defaultCwd]);

  const handleReset = () => {
    session.reset();
    gitDiff.clearDiff();
  };

  const isFinished = session.status === "completed" || session.status === "failed" || session.status === "cancelled";

  return (
    <div className="flex flex-col gap-4">
      <PromptInput
        status={session.status}
        onSubmit={(prompt, cwd) => session.execute(prompt, cwd ?? defaultCwd)}
        onCancel={session.cancel}
      />

      {session.status !== "idle" && (
        <div className="flex flex-col gap-3">
          {/* 목적: 실행 중에는 도구 타임라인과 어시스턴트 메시지를 좌우 배치한다. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ToolTimeline entries={session.toolTimeline} />
            <AssistantMessage text={session.assistantText} status={session.status} />
          </div>

          {isFinished && gitDiff.diff && <DiffViewer diff={gitDiff.diff} />}

          {isFinished && (
            <div className="flex items-center gap-3">
              {session.costUsd != null && (
                <span className="text-2xs text-text-muted">비용: ${session.costUsd.toFixed(4)}</span>
              )}
              {session.durationMs != null && (
                <span className="text-2xs text-text-muted">소요: {(session.durationMs / 1000).toFixed(1)}s</span>
              )}
              {session.errorMessage && <span className="text-2xs text-status-danger">{session.errorMessage}</span>}
              <Button onClick={handleReset} variant="outline" size="sm" className="ml-auto">
                초기화
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 목적: 파일 경로 목록에서 공통 디렉토리 접두사를 추출한다.
function extractCwd(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const parts = paths[0]!.split("/");
  let common = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(0, i + 1).join("/");
    if (paths.every((p) => p.startsWith(candidate + "/"))) {
      common = candidate;
    } else {
      break;
    }
  }
  return common || undefined;
}
