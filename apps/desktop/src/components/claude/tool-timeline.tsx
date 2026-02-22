import { FileText, FilePen, FileOutput, Terminal, Search, Wrench, Loader2, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { ToolTimelineEntry } from "@/hooks/use-claude-session";
import { cn } from "@/lib/utils";

interface ToolTimelineProps {
  entries: ToolTimelineEntry[];
}

// 목적: 도구별 아이콘과 색상 토큰을 매핑한다.
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

// 목적: tool_use input에서 사람이 읽기 쉬운 요약 한 줄을 추출한다.
function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  if (input.file_path && typeof input.file_path === "string") {
    return input.file_path;
  }
  if (input.command && typeof input.command === "string") {
    return (input.command as string).slice(0, 80);
  }
  if (input.pattern && typeof input.pattern === "string") {
    return `pattern: ${input.pattern}`;
  }
  return JSON.stringify(input).slice(0, 80);
}

function TimelineEntry({ entry }: { entry: ToolTimelineEntry }) {
  const meta = getToolMeta(entry.toolName);
  const Icon = meta.icon;
  const isRunning = !entry.completedAt;
  const elapsed = entry.completedAt ? entry.completedAt - entry.timestamp : null;

  return (
    <Collapsible className="border-b border-border-subtle last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
        <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />

        {isRunning ? (
          <Loader2 className={cn("h-4 w-4 shrink-0 animate-spin", meta.colorClass)} />
        ) : (
          <Icon className={cn("h-4 w-4 shrink-0", meta.colorClass)} />
        )}

        <span className={cn("text-xs font-semibold shrink-0", meta.colorClass)}>{entry.toolName}</span>

        <span className="truncate text-xs text-text-muted">{summarizeInput(entry.toolName, entry.input)}</span>

        {elapsed != null && (
          <span className="ml-auto shrink-0 text-2xs text-text-soft">
            {elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`}
          </span>
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

export function ToolTimeline({ entries }: ToolTimelineProps) {
  if (entries.length === 0) {
    return <div className="flex items-center justify-center py-8 text-xs text-text-soft">도구 활동 대기 중...</div>;
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xs border border-border-subtle bg-surface-base">
      {entries.map((entry) => (
        <TimelineEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
