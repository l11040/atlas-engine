import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AppSettings, JiraTicket, JiraTicketTree } from "@shared/ipc";

// 목적: issuetype에 따른 배지 스타일을 결정한다.
function issueTypeBadge(issuetype: string): { label: string; className: string } {
  const lower = issuetype.toLowerCase();
  if (lower === "에픽" || lower === "epic") return { label: "Epic", className: "bg-violet-100 text-violet-600 border-violet-200" };
  if (lower === "스토리" || lower === "story") return { label: "Story", className: "bg-emerald-100 text-emerald-600 border-emerald-200" };
  if (lower.includes("sub-task") || lower === "하위 작업") return { label: "Task", className: "bg-sky-100 text-sky-600 border-sky-200" };
  return { label: issuetype, className: "bg-neutral-100 text-neutral-500 border-neutral-200" };
}

function TicketRow({ ticket, onClick }: { ticket: JiraTicket; onClick: () => void }) {
  const badge = issueTypeBadge(ticket.issuetype);
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-subtle"
      onClick={onClick}
    >
      <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${badge.className}`}>
        {badge.label}
      </Badge>
      <span className="shrink-0 text-2xs text-text-muted">{ticket.key}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-text-strong">{ticket.summary}</span>
      <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">{ticket.status}</Badge>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-soft" />
    </button>
  );
}

export default function MainPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ticketKey, setTicketKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trees, setTrees] = useState<JiraTicketTree[]>([]);

  useEffect(() => {
    window.atlas.getConfig().then(setSettings);
    window.atlas.getAllJiraTicketTrees().then(setTrees);
  }, []);

  const jiraConfigured = Boolean(settings?.jira?.baseUrl && settings?.jira?.email && settings?.jira?.apiToken);
  const prefix = settings?.jira?.projectPrefix ?? "";

  function resolveTicketKey(input: string): string {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return "";
    if (/^\d+$/.test(trimmed) && prefix) return `${prefix}-${trimmed}`;
    return trimmed;
  }

  async function handleFetchTicket() {
    const key = resolveTicketKey(ticketKey);
    if (!key) return;

    setLoading(true);
    setError(null);
    try {
      const result = await window.atlas.fetchJiraTicketTree({ ticketKey: key });
      if (result.success && result.tree) {
        navigate(`/ticket/${result.tree.root}`);
      } else {
        setError(result.message);
      }
    } catch {
      setError("티켓 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  // 목적: 각 트리의 루트 티켓만 리스트로 표시한다.
  const rootTickets: JiraTicket[] = trees
    .map((t) => t.tickets[t.root])
    .filter((t): t is JiraTicket => t != null);

  return (
    <>
      {!jiraConfigured ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-subtle py-12">
          <p className="text-xs text-text-muted">Jira 연결이 설정되지 않았습니다</p>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/settings")}>
            <Settings className="h-3.5 w-3.5" />
            Jira 설정하기
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-64 items-center overflow-hidden rounded-md border border-border-subtle bg-surface-subtle">
              {prefix && (
                <span className="flex h-full shrink-0 items-center border-r border-border-subtle bg-neutral-100 px-2.5 text-xs font-medium text-text-muted">
                  {prefix}-
                </span>
              )}
              <input
                value={ticketKey}
                onChange={(e) => setTicketKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetchTicket()}
                placeholder={prefix ? "번호 입력" : "티켓 키 (예: PROJ-123)"}
                className="h-full w-full bg-transparent px-2.5 text-xs text-text-strong placeholder:text-text-soft focus:outline-none"
              />
            </div>
            <Button onClick={handleFetchTicket} disabled={loading || !ticketKey.trim()} size="sm" className="h-9 gap-1.5 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              조회
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
              {error}
            </div>
          )}

          {rootTickets.length > 0 && (
            <div className="flex flex-col">
              <div className="px-3 pb-2">
                <span className="text-2xs font-medium text-text-soft">{rootTickets.length}개 티켓</span>
              </div>
              <div className="flex flex-col rounded-md border border-border-subtle divide-y divide-border-subtle">
                {rootTickets.map((ticket) => (
                  <TicketRow
                    key={ticket.key}
                    ticket={ticket}
                    onClick={() => navigate(`/ticket/${ticket.key}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {rootTickets.length === 0 && !loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-text-soft">티켓 키를 입력하여 조회하세요</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
