// 책임: Todo 목록의 진행 상황과 상세 정보(reason, route, risk)를 표시한다.
// reason 내 AC/TS 참조에 HoverCard를 표시하여 인수 조건·시나리오 내용을 즉시 확인할 수 있다.

import { useMemo } from "react";
import { Check, Circle, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { Ticket, TodoItem, TodoStatus } from "@shared/ipc";

interface TodoProgressProps {
  todos: TodoItem[];
  ticket: Ticket;
}

// 목적: 상태별 아이콘과 색상을 매핑한다.
const STATUS_META: Record<TodoStatus, { icon: typeof Check; colorClass: string }> = {
  done: { icon: Check, colorClass: "text-status-success" },
  in_progress: { icon: Loader2, colorClass: "text-brand-500" },
  pending: { icon: Circle, colorClass: "text-text-soft" },
  blocked: { icon: AlertCircle, colorClass: "text-status-danger" }
};

// 목적: risk 레벨별 색상을 매핑한다.
const RISK_COLOR: Record<string, string> = {
  low: "border-status-success/40 bg-status-success/15 text-status-success font-semibold",
  med: "border-status-warning/40 bg-status-warning/20 text-status-warning font-semibold",
  high: "border-status-danger/50 bg-status-danger/20 text-status-danger font-semibold"
};

// 목적: reason 텍스트에서 AC-n, TS-n 패턴을 분리하여 세그먼트 배열로 반환한다.
const REF_PATTERN = /\b(AC-\d+|TS-\d+)\b/g;

interface TextSegment {
  type: "text" | "ac" | "ts";
  value: string;
}

function parseReasonSegments(reason: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REF_PATTERN.exec(reason)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: reason.slice(lastIndex, match.index) });
    }
    const id = match[1]!;
    segments.push({ type: id.startsWith("AC") ? "ac" : "ts", value: id });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < reason.length) {
    segments.push({ type: "text", value: reason.slice(lastIndex) });
  }
  return segments;
}

export function TodoProgress({ todos, ticket }: TodoProgressProps) {
  const doneCount = todos.filter((t) => t.status === "done").length;

  // 목적: AC/TS ID → description 빠른 조회를 위한 맵을 구성한다.
  const acMap = useMemo(() => new Map(ticket.acceptance_criteria.map((ac) => [ac.id, ac.description])), [ticket.acceptance_criteria]);
  const tsMap = useMemo(() => new Map(ticket.test_scenarios.map((ts) => [ts.id, ts.description])), [ticket.test_scenarios]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-base px-5 py-4">
      {/* 헤더 + 진행 바 */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-strong">할 일 목록</h3>
        <span className="text-2xs text-text-soft">
          {doneCount} / {todos.length}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: todos.length > 0 ? `${(doneCount / todos.length) * 100}%` : "0%" }}
        />
      </div>

      {/* Todo 항목 */}
      <div className="-mx-5 divide-y divide-border-subtle">
        {todos.map((todo) => {
          const meta = STATUS_META[todo.status];
          const Icon = meta.icon;
          const isRunning = todo.status === "in_progress";

          return (
            <div
              key={todo.id}
              className={cn("flex gap-2.5 px-5 py-3", isRunning && "bg-brand-50")}
            >
              <Icon
                className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.colorClass, isRunning && "animate-spin")}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex-1 text-xs",
                      todo.status === "done" ? "text-text-soft line-through" : "text-text-strong"
                    )}
                  >
                    {todo.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className="text-2xs">{todo.route}</Badge>
                    <Badge variant="outline" className={cn("text-2xs", RISK_COLOR[todo.risk])}>{todo.risk}</Badge>
                    {isRunning && todo.attempt.n > 0 && (
                      <Badge variant="outline" className="text-2xs">시도 {todo.attempt.n}</Badge>
                    )}
                  </div>
                </div>
                {/* reason: AC→TS 추적성 — AC/TS 참조를 뱃지로 표시, HoverCard로 상세 제공 */}
                {todo.reason && (
                  <div className="flex flex-wrap items-center gap-1">
                    {parseReasonSegments(todo.reason).map((seg, i) => {
                      if (seg.type === "text") {
                        return <span key={i} className="text-2xs text-text-soft">{seg.value}</span>;
                      }

                      const isAc = seg.type === "ac";
                      const description = isAc ? acMap.get(seg.value) : tsMap.get(seg.value);
                      if (!description) {
                        return (
                          <Badge key={i} variant="outline" className="font-mono text-2xs">{seg.value}</Badge>
                        );
                      }

                      return (
                        <HoverCard key={i} openDelay={200} closeDelay={0}>
                          <HoverCardTrigger asChild>
                            <span
                              className={cn(
                                "inline-flex cursor-default items-center rounded-full border px-2.5 py-0.5 font-mono text-2xs font-semibold transition-colors",
                                isAc
                                  ? "border-brand-500/30 text-brand-600 hover:border-brand-500 hover:bg-brand-50"
                                  : "border-status-success/30 text-status-success hover:border-status-success hover:bg-status-success/5"
                              )}
                            >
                              {seg.value}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent side="bottom" align="start" className="w-72 border-border-subtle bg-surface-base shadow-md">
                            <div className="flex flex-col gap-1.5">
                              <span className={cn("font-mono text-2xs font-semibold", isAc ? "text-brand-600" : "text-status-success")}>
                                {seg.value}
                              </span>
                              <p className="text-xs leading-[1.7] text-text-muted">{description}</p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      );
                    })}
                  </div>
                )}
                {todo.deps.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-text-soft">deps:</span>
                    {todo.deps.map((dep) => (
                      <Badge key={dep} variant="outline" className="font-mono text-2xs">{dep}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {todos.length === 0 && (
        <div className="flex items-center justify-center py-4 text-2xs text-text-soft">Todo 항목 없음</div>
      )}
    </div>
  );
}
