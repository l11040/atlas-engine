// 책임: 하단 드로어에 들어가는 통합 활동 타임라인. 도구 활동과 로그를 시간순으로 합쳐 표시한다.

import { useRef, useEffect } from "react";
import type { RunState, TaskExecutionState, ToolTimelineEntry } from "@shared/ipc";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { FileText, FilePen, FileOutput, Terminal, Search, Wrench, Loader2, ChevronRight, AlertCircle, Info, Bot, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 도구 메타 ──────────────────────────────────────────

const TOOL_META: Record<string, { icon: typeof FileText; colorClass: string }> = {
  Read: { icon: FileText, colorClass: "text-tool-read" },
  Write: { icon: FileOutput, colorClass: "text-tool-write" },
  Edit: { icon: FilePen, colorClass: "text-tool-edit" },
  MultiEdit: { icon: FilePen, colorClass: "text-tool-edit" },
  Bash: { icon: Terminal, colorClass: "text-tool-bash" },
  Grep: { icon: Search, colorClass: "text-tool-search" },
  Glob: { icon: Search, colorClass: "text-tool-search" }
};

function getToolMeta(toolName: string) {
  return TOOL_META[toolName] ?? { icon: Wrench, colorClass: "text-tool-default" };
}

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  if (input.file_path && typeof input.file_path === "string") return input.file_path;
  if (input.command && typeof input.command === "string") return (input.command as string).slice(0, 80);
  if (input.pattern && typeof input.pattern === "string") return `pattern: ${input.pattern}`;
  return JSON.stringify(input).slice(0, 80);
}

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── 로그 카테고리 ──────────────────────────────────────

function categorizeMessage(message: string): { icon: typeof Info; colorClass: string } {
  if (message.startsWith("🔧") || message.includes("도구 호출")) return { icon: Wrench, colorClass: "text-tool-default" };
  if (message.includes("LLM") || message.includes("CLI")) return { icon: Bot, colorClass: "text-brand-500" };
  if (message.includes("완료") || message.includes("종료")) return { icon: Zap, colorClass: "text-status-success" };
  return { icon: Info, colorClass: "text-text-soft" };
}

// ─── 통합 타임라인 아이템 ────────────────────────────────

type UnifiedItem =
  | { kind: "tool"; timestamp: number; entry: ToolTimelineEntry }
  | { kind: "log"; timestamp: number; level: "info" | "error"; label: string; message: string };

const MESSAGE_PREVIEW_LENGTH = 120;

function ToolItem({ entry }: { entry: ToolTimelineEntry }) {
  const meta = getToolMeta(entry.toolName);
  const Icon = meta.icon;
  const isRunning = !entry.completedAt;
  const elapsed = entry.completedAt ? entry.completedAt - entry.timestamp : null;

  return (
    <Collapsible className="border-b border-border-subtle last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
        <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />
        {isRunning
          ? <Loader2 className={cn("h-4 w-4 shrink-0 animate-spin", meta.colorClass)} />
          : <Icon className={cn("h-4 w-4 shrink-0", meta.colorClass)} />
        }
        <span className={cn("text-xs font-semibold shrink-0", meta.colorClass)}>{entry.toolName}</span>
        <span className="truncate text-xs text-text-muted">{summarizeInput(entry.toolName, entry.input)}</span>
        {elapsed != null && (
          <span className="ml-auto shrink-0 text-2xs text-text-soft">{formatElapsed(elapsed)}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-2 pl-10">
          <details className="text-2xs">
            <summary className="cursor-pointer text-text-soft hover:text-text-muted">Input</summary>
            <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded bg-surface-subtle p-2 text-text-muted">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
          </details>
          {entry.result && (
            <details className="mt-1 text-2xs">
              <summary className="cursor-pointer text-text-soft hover:text-text-muted">Result</summary>
              <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded bg-surface-subtle p-2 text-text-muted">
                {entry.result.slice(0, 2000)}
              </pre>
            </details>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LogItem({ level, label, message }: { level: "info" | "error"; label: string; message: string }) {
  const isError = level === "error";
  const { icon: Icon, colorClass } = isError
    ? { icon: AlertCircle, colorClass: "text-status-danger" }
    : categorizeMessage(message);
  const isLong = message.length > MESSAGE_PREVIEW_LENGTH;

  if (!isLong) {
    return (
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0">
        <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
        <span className={cn("text-xs font-semibold shrink-0", colorClass)}>{label}</span>
        <span className="truncate text-xs text-text-muted">{message}</span>
      </div>
    );
  }

  return (
    <Collapsible className="border-b border-border-subtle last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
        <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />
        <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
        <span className={cn("text-xs font-semibold shrink-0", colorClass)}>{label}</span>
        <span className="truncate text-xs text-text-muted">{message.slice(0, MESSAGE_PREVIEW_LENGTH)}...</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mx-3 mb-2 ml-10 max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded bg-surface-subtle p-2 text-2xs text-text-muted">
          {message}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── 메인 패널 ──────────────────────────────────────────

interface RunLogPanelProps {
  run: RunState | null;
  taskStates: Record<string, TaskExecutionState>;
}

export function RunLogPanel({ run, taskStates }: RunLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const toolTimeline = run?.toolTimeline ?? [];
  const runLogs = run?.logs ?? [];
  const taskLogs = Object.values(taskStates)
    .flatMap((ts) => (ts.logs ?? []).map((log) => ({ ...log, taskId: ts.taskId })));

  // 목적: 도구 활동과 로그를 시간순으로 병합한다.
  const items: UnifiedItem[] = [];

  for (const entry of toolTimeline) {
    items.push({ kind: "tool", timestamp: entry.timestamp, entry });
  }
  for (const log of runLogs) {
    items.push({ kind: "log", timestamp: log.timestamp, level: log.level, label: `${log.step}/${log.node}`, message: log.message });
  }
  for (const log of taskLogs) {
    items.push({ kind: "log", timestamp: log.timestamp, level: log.level, label: `${log.taskId}/${log.node}`, message: log.message });
  }

  // 목적: 최신 항목이 위에 오도록 내림차순 정렬한다.
  items.sort((a, b) => b.timestamp - a.timestamp);
  // 주의: 최근 400건만 표시하여 렌더링 부하를 제한한다.
  const visible = items.slice(0, 400);

  const prevCountRef = useRef(0);
  // 목적: 새 항목 추가 시 최상단으로 자동 스크롤한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (visible.length > prevCountRef.current) {
      el.scrollTop = 0;
    }
    prevCountRef.current = visible.length;
  }, [visible.length]);

  if (visible.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-text-soft">
        실행 로그가 아직 없습니다.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-3 py-1.5">
        <h4 className="text-xs font-medium text-text-strong">활동 타임라인</h4>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="flex flex-col">
          {visible.map((item, i) =>
            item.kind === "tool"
              ? <ToolItem key={`t-${item.entry.id}`} entry={item.entry} />
              : <LogItem key={`l-${item.timestamp}-${i}`} level={item.level} label={item.label} message={item.message} />
          )}
        </div>
      </div>
    </div>
  );
}
