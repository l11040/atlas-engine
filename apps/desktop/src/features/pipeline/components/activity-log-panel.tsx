// 책임: 활동 로그를 우측 Sheet 패널로 표시한다.

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActivityLog } from "./activity-log";
import type { ActivityLogEntry } from "@shared/ipc";

interface ActivityLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ActivityLogEntry[];
}

export function ActivityLogPanel({ open, onOpenChange, entries }: ActivityLogPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(420px,92vw)] flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            활동 로그
            <Badge variant="outline" className="text-2xs">{entries.length}</Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pt-2">
          <ActivityLog entries={entries} defaultOpen />
        </div>
      </SheetContent>
    </Sheet>
  );
}
