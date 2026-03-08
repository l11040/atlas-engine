// 책임: 작업 상세 정보(diff, 설명, 검증 결과)를 표시한다.

import type { TaskExecutionState } from "@shared/ipc";

interface TaskDetailPanelProps {
  state: TaskExecutionState;
}

export function TaskDetailPanel({ state }: TaskDetailPanelProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-medium text-text-strong">작업 상세</h3>

      {state.explanation && (
        <section>
          <h4 className="text-xs font-medium text-text-soft mb-1">변경 설명</h4>
          <p className="text-xs text-text-strong">{state.explanation.summary}</p>
        </section>
      )}

      {state.verification && (
        <section>
          <h4 className="text-xs font-medium text-text-soft mb-1">검증 결과</h4>
          <p className="text-xs text-text-strong">
            판정: {state.verification.verdict}
          </p>
          {state.verification.failure_reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-red-500">
              {state.verification.failure_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {state.changeSets?.diff && (
        <section>
          <h4 className="text-xs font-medium text-text-soft mb-1">Diff</h4>
          <pre className="overflow-auto rounded-md bg-surface-subtle p-2 text-[10px] leading-relaxed">
            {state.changeSets.diff}
          </pre>
        </section>
      )}

      {!state.explanation && !state.verification && !state.changeSets && (
        <p className="text-xs text-text-soft">아직 생성된 데이터가 없습니다.</p>
      )}
    </div>
  );
}
