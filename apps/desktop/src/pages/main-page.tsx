import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthStatusCard } from "@/features/session/components/auth-status-card";
import { JiraTicketTreeView } from "@/features/jira/components/jira-ticket-tree";
import { JiraTicketDetail } from "@/features/jira/components/jira-ticket-detail";
import type { AppSettings, JiraTicketTree } from "@shared/ipc";

export default function MainPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ticketKey, setTicketKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<JiraTicketTree | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // 목적: 앱 설정과 저장된 티켓 트리를 복원한다.
  useEffect(() => {
    window.atlas.getConfig().then(setSettings);
    window.atlas.getJiraTicketTree().then((saved) => {
      if (saved) setTree(saved);
    });
  }, []);

  const jiraConfigured = Boolean(settings?.jira?.baseUrl && settings?.jira?.email && settings?.jira?.apiToken);
  const prefix = settings?.jira?.projectPrefix ?? "";
  const selectedTicket = tree && selectedKey ? tree.tickets[selectedKey] ?? null : null;

  // 목적: 숫자만 입력된 경우 프로젝트 프리픽스를 자동으로 붙인다.
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
    setSelectedKey(null);
    try {
      const result = await window.atlas.fetchJiraTicketTree({ ticketKey: key });
      if (result.success && result.tree) {
        setTree(result.tree);
      } else {
        setError(result.message);
      }
    } catch {
      setError("티켓 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="flex items-center justify-end gap-2">
        <AuthStatusCard />
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate("/settings")}>
          <Settings className="h-3.5 w-3.5" />
          설정
        </Button>
      </header>

      {/* 목적: Jira 설정이 없으면 설정 유도, 있으면 티켓 키 입력 표시 */}
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
            <div className="flex h-8 w-64 items-center overflow-hidden rounded-md border border-border-subtle bg-surface-subtle">
              {prefix && (
                <span className="flex h-full shrink-0 items-center border-r border-border-subtle bg-neutral-100 px-2 text-xs font-medium text-text-muted">
                  {prefix}-
                </span>
              )}
              <input
                value={ticketKey}
                onChange={(e) => setTicketKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetchTicket()}
                placeholder={prefix ? "번호 입력" : "티켓 키 (예: PROJ-123)"}
                className="h-full w-full bg-transparent px-2 text-xs text-text-strong placeholder:text-text-soft focus:outline-none"
              />
            </div>
            <Button onClick={handleFetchTicket} disabled={loading || !ticketKey.trim()} size="sm" className="h-8 gap-1.5 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              조회
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
              {error}
            </div>
          )}

          {tree && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-2xs text-text-soft">{tree.total}개 이슈</span>
                <span className="text-2xs text-text-soft">{new Date(tree.exportedAt).toLocaleString("ko-KR")}</span>
              </div>
              <div className="flex min-h-0 flex-1 gap-4">
                <div className="w-2/5 shrink-0 overflow-auto">
                  <JiraTicketTreeView tree={tree} selectedKey={selectedKey} onSelect={setSelectedKey} />
                </div>
              <div className="flex-1 overflow-auto">
                {selectedTicket ? (
                  <JiraTicketDetail ticket={selectedTicket} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border-subtle">
                    <p className="text-xs text-text-soft">티켓을 선택하세요</p>
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
