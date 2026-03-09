import type { RunState, TaskExecutionState } from "@shared/ipc";
import { ToolTimeline } from "@/features/session/components/tool-timeline";

interface RunLogPanelProps {
  run: RunState | null;
  taskStates: Record<string, TaskExecutionState>;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("ko-KR", { hour12: false });
}

export function RunLogPanel({ run, taskStates }: RunLogPanelProps) {
  const runLogs = run?.logs ?? [];
  const toolTimeline = run?.toolTimeline ?? [];
  const taskLogs = Object.values(taskStates)
    .flatMap((taskState) =>
      (taskState.logs ?? []).map((log) => ({
        ...log,
        taskId: taskState.taskId
      }))
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 200);

  if (runLogs.length === 0 && taskLogs.length === 0 && toolTimeline.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle p-3 text-xs text-text-soft">
        실행 로그가 아직 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <section className="rounded-md border border-border-subtle">
        <header className="border-b border-border-subtle px-3 py-2">
          <h4 className="text-xs font-medium text-text-strong">Tool Timeline</h4>
        </header>
        <div className="max-h-64 overflow-auto p-2">
          <ToolTimeline entries={toolTimeline} />
        </div>
      </section>

      <section className="rounded-md border border-border-subtle">
        <header className="border-b border-border-subtle px-3 py-2">
          <h4 className="text-xs font-medium text-text-strong">Run 로그</h4>
        </header>
        <div className="max-h-64 overflow-auto px-3 py-2">
          <ul className="space-y-1">
            {[...runLogs].slice(-200).reverse().map((log, index) => (
              <li key={`${log.timestamp}-${index}`} className="font-mono text-[11px] leading-relaxed">
                <span className="text-text-soft">{formatTime(log.timestamp)}</span>{" "}
                <span className={log.level === "error" ? "text-red-600" : "text-emerald-600"}>
                  [{log.level.toUpperCase()}]
                </span>{" "}
                <span className="text-text-soft">[{log.step}/{log.node}]</span>{" "}
                <span className="text-text-strong">{log.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-md border border-border-subtle">
        <header className="border-b border-border-subtle px-3 py-2">
          <h4 className="text-xs font-medium text-text-strong">Task 로그</h4>
        </header>
        <div className="max-h-64 overflow-auto px-3 py-2">
          <ul className="space-y-1">
            {taskLogs.map((log, index) => (
              <li key={`${log.taskId}-${log.timestamp}-${index}`} className="font-mono text-[11px] leading-relaxed">
                <span className="text-text-soft">{formatTime(log.timestamp)}</span>{" "}
                <span className={log.level === "error" ? "text-red-600" : "text-emerald-600"}>
                  [{log.level.toUpperCase()}]
                </span>{" "}
                <span className="text-text-soft">[{log.taskId}/{log.step}/{log.node}]</span>{" "}
                <span className="text-text-strong">{log.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
