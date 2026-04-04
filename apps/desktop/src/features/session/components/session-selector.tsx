// 책임: atlas_sessions 드롭다운 선택기를 렌더한다.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SessionSummary } from "@shared/ipc";

interface SessionSelectorProps {
  sessions: SessionSummary[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}

export function SessionSelector({ sessions, selectedId, onSelect }: SessionSelectorProps) {
  if (sessions.length === 0) {
    return (
      <span className="text-xs text-text-soft">세션 없음</span>
    );
  }

  return (
    <Select value={selectedId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger className="h-7 w-56 border-border-subtle bg-surface-subtle text-xs text-text-strong">
        <SelectValue placeholder="세션 선택..." />
      </SelectTrigger>
      <SelectContent className="border-border-subtle bg-surface-base">
        {sessions.map((s) => (
          <SelectItem key={s.sessionId} value={s.sessionId} className="text-xs">
            <span className="font-mono">{s.sessionId.slice(0, 8)}</span>
            <span className="ml-2 text-text-soft">
              A:{s.agentCount} S:{s.skillCount}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
