// 책임: 파이프라인 활동 로그를 Collapsible 형태로 표시한다.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry } from "@shared/ipc";

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  defaultOpen?: boolean;
}

// 목적: 로그 타입별 색상을 매핑한다.
const TYPE_COLOR: Record<ActivityLogEntry["type"], string> = {
  info: "bg-brand-500",
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-danger"
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function ActivityLog({ entries, defaultOpen = false }: ActivityLogProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-left">
        <ChevronRight className={cn("h-3 w-3 text-text-soft transition-transform", open && "rotate-90")} />
        <span className="text-xs font-semibold text-text-strong">활동 로그</span>
        <Badge variant="outline" className="text-2xs">{entries.length}</Badge>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-1">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-start gap-2 px-1 py-0.5">
              <span className="shrink-0 pt-0.5 font-mono text-2xs text-text-soft">{formatTime(entry.timestamp)}</span>
              <div className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TYPE_COLOR[entry.type])} />
              <span className="text-2xs leading-relaxed text-text-muted">{entry.message}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="flex items-center justify-center py-4 text-2xs text-text-soft">활동 로그 없음</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
