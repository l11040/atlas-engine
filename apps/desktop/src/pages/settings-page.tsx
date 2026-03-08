import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettings } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";
import type { CliPermissionMode, ProviderType, Ticket } from "@shared/ipc";

type SettingsTab = "general" | "cli" | "jira" | "ticket" | "tracing";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "일반" },
  { key: "cli", label: "CLI" },
  { key: "jira", label: "Jira" },
  { key: "ticket", label: "티켓" },
  { key: "tracing", label: "추적" }
];

// 목적: 티켓 탭에서 빈 상태일 때 보여줄 샘플 JSON
const SAMPLE_TICKET: Ticket = {
  jira_key: "PROJ-123",
  summary: "API 엔드포인트에 인증 미들웨어 추가",
  acceptance_criteria: [
    { id: "AC-1", description: "Bearer 토큰 검증 미들웨어가 모든 /api/* 라우트에 적용된다" },
    { id: "AC-2", description: "만료된 토큰으로 요청 시 401 Unauthorized를 반환한다" },
    { id: "AC-3", description: "유효한 토큰으로 요청 시 사용자 정보가 req.user에 주입된다" }
  ],
  test_scenarios: [
    { id: "TS-1", covers: ["AC-1"], description: "유효한 Bearer 토큰으로 /api/users 접근 시 200 응답" },
    { id: "TS-2", covers: ["AC-2"], description: "만료된 토큰으로 /api/users 접근 시 401 응답" },
    { id: "TS-3", covers: ["AC-1", "AC-3"], description: "유효한 토큰으로 요청 시 req.user에 사용자 ID 포함 확인" }
  ],
  mode: "standard",
  mode_locked: true
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, loading, saveConfig } = useAppSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const [defaultCwd, setDefaultCwd] = useState("");
  const [activeProvider, setActiveProvider] = useState<ProviderType>("claude");
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [permissionMode, setPermissionMode] = useState<CliPermissionMode>("auto");
  const [ticketJson, setTicketJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jiraProjectPrefix, setJiraProjectPrefix] = useState("");
  const [jiraTokenVisible, setJiraTokenVisible] = useState(false);
  const [jiraTesting, setJiraTesting] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [tracingEnabled, setTracingEnabled] = useState(false);
  const [tracingApiKey, setTracingApiKey] = useState("");
  const [tracingProject, setTracingProject] = useState("atlas-engine");
  const [tracingEndpoint, setTracingEndpoint] = useState("https://api.smith.langchain.com");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  // 목적: 설정이 로드되면 폼 state에 동기화한다.
  useEffect(() => {
    if (settings) {
      setDefaultCwd(settings.defaultCwd);
      setActiveProvider(settings.activeProvider);
      setTimeoutSec(Math.round(settings.cli.timeoutMs / 1000));
      setPermissionMode(settings.cli.permissionMode);
      setTicketJson(settings.ticket ? JSON.stringify(settings.ticket, null, 2) : "");
      if (settings.jira) {
        setJiraBaseUrl(settings.jira.baseUrl);
        setJiraEmail(settings.jira.email);
        setJiraApiToken(settings.jira.apiToken);
        setJiraProjectPrefix(settings.jira.projectPrefix ?? "");
      }
      if (settings.tracing) {
        setTracingEnabled(settings.tracing.enabled);
        setTracingApiKey(settings.tracing.apiKey);
        setTracingProject(settings.tracing.project);
        setTracingEndpoint(settings.tracing.endpoint);
      }
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setJsonError(null);
    try {
      const base: Record<string, unknown> = {
        defaultCwd,
        activeProvider,
        cli: {
          timeoutMs: timeoutSec * 1000,
          permissionMode
        },
        jira: jiraBaseUrl ? {
          baseUrl: jiraBaseUrl,
          email: jiraEmail,
          apiToken: jiraApiToken,
          projectPrefix: jiraProjectPrefix.toUpperCase().replace(/-$/, "")
        } : undefined,
        tracing: {
          enabled: tracingEnabled,
          apiKey: tracingApiKey,
          project: tracingProject,
          endpoint: tracingEndpoint
        }
      };

      // 목적: 티켓 JSON이 있으면 파싱 후 설정에 포함한다.
      if (ticketJson.trim()) {
        try {
          base.ticket = JSON.parse(ticketJson);
        } catch {
          setJsonError("티켓 JSON 파싱 실패. 올바른 JSON 형식인지 확인하세요.");
          return;
        }
      } else {
        base.ticket = undefined;
      }

      await saveConfig(base);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestJira() {
    if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
      setJiraTestResult({ success: false, message: "모든 필드를 입력하세요" });
      return;
    }
    setJiraTesting(true);
    setJiraTestResult(null);
    try {
      const result = await window.atlas.testJiraConnection({
        baseUrl: jiraBaseUrl,
        email: jiraEmail,
        apiToken: jiraApiToken
      });
      setJiraTestResult(result);
    } catch {
      setJiraTestResult({ success: false, message: "연결 테스트 실패" });
    } finally {
      setJiraTesting(false);
    }
  }

  function handleLoadSample() {
    setTicketJson(JSON.stringify(SAMPLE_TICKET, null, 2));
    setJsonError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-strong">설정</span>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-xs text-text-soft">설정 로드 중...</div>
      ) : (
        <div className="flex gap-4">
          {/* 좌측 탭 */}
          <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border-subtle pr-4">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-surface-subtle text-text-strong"
                    : "text-text-muted hover:bg-surface-subtle hover:text-text-strong"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* 우측 콘텐츠 */}
          <div className="flex flex-1 flex-col gap-5 pl-4">
            {activeTab === "general" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">일반</h2>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultCwd" className="text-xs font-semibold text-text-muted">
                      기본 작업 디렉토리
                    </Label>
                    <Input
                      id="defaultCwd"
                      value={defaultCwd}
                      onChange={(e) => setDefaultCwd(e.target.value)}
                      placeholder="비워두면 프로세스 기본 경로 사용"
                      className="h-8 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">CLI 실행 시 기본으로 사용할 작업 디렉토리입니다.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-text-muted">기본 CLI Provider</Label>
                    <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as ProviderType)}>
                      <SelectTrigger className="h-8 w-48 border-border-subtle bg-surface-subtle text-xs text-text-strong">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border-subtle bg-surface-base">
                        <SelectItem value="claude" className="text-xs">
                          Claude CLI
                        </SelectItem>
                        <SelectItem value="codex" className="text-xs">
                          Codex CLI
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-2xs text-text-soft">앱 시작 시 기본으로 선택되는 CLI provider입니다.</p>
                  </div>
                </div>
              </>
            )}

            {activeTab === "cli" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">CLI</h2>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="timeoutSec" className="text-xs font-semibold text-text-muted">
                      타임아웃 (초)
                    </Label>
                    <Input
                      id="timeoutSec"
                      type="number"
                      min={10}
                      max={3600}
                      value={timeoutSec}
                      onChange={(e) => setTimeoutSec(Number(e.target.value))}
                      className="h-8 w-32 border-border-subtle bg-surface-subtle text-xs text-text-strong"
                    />
                    <p className="text-2xs text-text-soft">CLI 응답 대기 최대 시간입니다. 기본값 300초.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-text-muted">권한 모드</Label>
                    <Select value={permissionMode} onValueChange={(v) => setPermissionMode(v as CliPermissionMode)}>
                      <SelectTrigger className="h-8 w-48 border-border-subtle bg-surface-subtle text-xs text-text-strong">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border-subtle bg-surface-base">
                        <SelectItem value="auto" className="text-xs">
                          자동 승인
                        </SelectItem>
                        <SelectItem value="manual" className="text-xs">
                          수동 확인
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-2xs text-text-soft">
                      자동 승인: 모든 도구 권한을 자동 승인합니다.
                      <br />
                      수동 확인: 실행 전 사용자 확인을 요청합니다.
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeTab === "jira" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">Jira 연결</h2>
                  <div className="ml-auto flex gap-2">
                    <Button onClick={handleTestJira} disabled={jiraTesting} variant="outline" size="sm" className="h-7 text-xs">
                      {jiraTesting ? "테스트 중..." : "연결 테스트"}
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-xs">
                      {saving ? "저장 중..." : "저장"}
                    </Button>
                  </div>
                </div>

                {jiraTestResult && (
                  <div className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    jiraTestResult.success
                      ? "border-status-success/30 bg-status-success/10 text-status-success"
                      : "border-status-danger/30 bg-status-danger/10 text-status-danger"
                  )}>
                    {jiraTestResult.message}
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jiraBaseUrl" className="text-xs font-semibold text-text-muted">
                      Base URL
                    </Label>
                    <Input
                      id="jiraBaseUrl"
                      value={jiraBaseUrl}
                      onChange={(e) => setJiraBaseUrl(e.target.value)}
                      placeholder="https://your-domain.atlassian.net"
                      className="h-8 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">Jira Cloud 인스턴스의 URL입니다.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jiraEmail" className="text-xs font-semibold text-text-muted">
                      이메일
                    </Label>
                    <Input
                      id="jiraEmail"
                      type="email"
                      value={jiraEmail}
                      onChange={(e) => setJiraEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="h-8 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">Jira 계정 이메일입니다.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jiraApiToken" className="text-xs font-semibold text-text-muted">
                      API Token
                    </Label>
                    <div className="relative">
                      <Input
                        id="jiraApiToken"
                        type={jiraTokenVisible ? "text" : "password"}
                        value={jiraApiToken}
                        onChange={(e) => setJiraApiToken(e.target.value)}
                        placeholder="Atlassian API 토큰"
                        className="h-8 border-border-subtle bg-surface-subtle pr-16 font-mono text-xs text-text-strong placeholder:text-text-soft"
                      />
                      <button
                        type="button"
                        onClick={() => setJiraTokenVisible(!jiraTokenVisible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-text-soft hover:text-text-muted"
                      >
                        {jiraTokenVisible ? "숨기기" : "보기"}
                      </button>
                    </div>
                    <p className="text-2xs text-text-soft">
                      Atlassian 계정 설정에서 생성한 API 토큰입니다.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jiraProjectPrefix" className="text-xs font-semibold text-text-muted">
                      프로젝트 키
                    </Label>
                    <Input
                      id="jiraProjectPrefix"
                      value={jiraProjectPrefix}
                      onChange={(e) => setJiraProjectPrefix(e.target.value)}
                      placeholder="GRID"
                      className="h-8 w-32 border-border-subtle bg-surface-subtle text-xs uppercase text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">
                      설정하면 홈에서 번호만 입력해도 자동으로 프리픽스를 붙입니다. (예: 2 → GRID-2)
                    </p>
                  </div>
                </div>
              </>
            )}

            {activeTab === "ticket" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">티켓</h2>
                  <div className="ml-auto flex gap-2">
                    <Button onClick={handleLoadSample} variant="outline" size="sm" className="h-7 text-xs">
                      샘플 로드
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-xs">
                      {saving ? "저장 중..." : "저장"}
                    </Button>
                  </div>
                </div>

                {jsonError && (
                  <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
                    {jsonError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-text-muted">Ticket JSON</Label>
                  <Textarea
                    value={ticketJson}
                    onChange={(e) => setTicketJson(e.target.value)}
                    placeholder='{"jira_key": "PROJ-123", "summary": "...", "acceptance_criteria": [...], "test_scenarios": [...], ...}'
                    className="min-h-[360px] border-border-subtle bg-surface-subtle font-mono text-xs text-text-strong placeholder:text-text-soft"
                  />
                  <p className="text-2xs text-text-soft">
                    지라 이슈를 정규화한 Ticket JSON을 입력하세요. AC와 시나리오를 포함해야 합니다.
                    <br />
                    비워두면 티켓이 해제됩니다. Todo는 파이프라인 실행 시 자동 생성됩니다.
                  </p>
                </div>
              </>
            )}

            {activeTab === "tracing" && (
              <>
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-text-strong">추적</h2>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto h-7 text-xs">
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="tracingEnabled" className="text-xs font-semibold text-text-muted">
                      LangSmith 추적
                    </Label>
                    <Switch id="tracingEnabled" checked={tracingEnabled} onCheckedChange={setTracingEnabled} />
                  </div>
                  <p className="text-2xs text-text-soft">
                    활성화하면 LangGraph 실행 추적이 LangSmith로 전송됩니다.
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tracingApiKey" className="text-xs font-semibold text-text-muted">
                      API Key
                    </Label>
                    <div className="relative">
                      <Input
                        id="tracingApiKey"
                        type={apiKeyVisible ? "text" : "password"}
                        value={tracingApiKey}
                        onChange={(e) => setTracingApiKey(e.target.value)}
                        placeholder="lsv2_pt_..."
                        disabled={!tracingEnabled}
                        className="h-8 border-border-subtle bg-surface-subtle pr-16 font-mono text-xs text-text-strong placeholder:text-text-soft"
                      />
                      <button
                        type="button"
                        onClick={() => setApiKeyVisible(!apiKeyVisible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-text-soft hover:text-text-muted"
                      >
                        {apiKeyVisible ? "숨기기" : "보기"}
                      </button>
                    </div>
                    <p className="text-2xs text-text-soft">
                      LangSmith API 키입니다. 비워두면 시스템 환경 변수(LANGCHAIN_API_KEY)를 사용합니다.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tracingProject" className="text-xs font-semibold text-text-muted">
                      프로젝트
                    </Label>
                    <Input
                      id="tracingProject"
                      value={tracingProject}
                      onChange={(e) => setTracingProject(e.target.value)}
                      placeholder="atlas-engine"
                      disabled={!tracingEnabled}
                      className="h-8 w-64 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">LangSmith 프로젝트 이름입니다.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tracingEndpoint" className="text-xs font-semibold text-text-muted">
                      엔드포인트
                    </Label>
                    <Input
                      id="tracingEndpoint"
                      value={tracingEndpoint}
                      onChange={(e) => setTracingEndpoint(e.target.value)}
                      placeholder="https://api.smith.langchain.com"
                      disabled={!tracingEnabled}
                      className="h-8 border-border-subtle bg-surface-subtle text-xs text-text-strong placeholder:text-text-soft"
                    />
                    <p className="text-2xs text-text-soft">
                      자체 호스팅(Self-hosted) LangSmith를 사용하는 경우에만 변경하세요.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
