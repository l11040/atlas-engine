// 책임: Todo 플로우의 개별 단계(workorder/explore/execute/verify/dod) 카드를 표시한다.
// phase별 step.result를 파싱하여 WorkOrder/ContextPack/ImplReport/Evidence/DoD 상세를 렌더링한다.

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, FileCode, AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ToolTimeline } from "@/features/session/components/tool-timeline";
import { DiffViewer } from "@/features/session/components/diff-viewer";
import type { TodoFlowStepState, WorkOrder, ContextPack, ImplReport, Evidence, TerminalLog } from "@shared/ipc";

// 목적: 각 플로우 단계의 설명 정보를 정의한다.
const STEP_META: Record<string, { title: string; description: string }> = {
  workorder: {
    title: "Work Order",
    description: "Orchestrator가 Atlas 7-Section WorkOrder를 생성합니다."
  },
  explore: {
    title: "Explore",
    description: "Explorer가 코드베이스를 탐색하고 Context Pack을 생성합니다."
  },
  execute: {
    title: "Execute",
    description: "Implementer가 WorkOrder에 따라 코드 변경을 실행합니다."
  },
  verify: {
    title: "Verify",
    description: "Verifier가 테스트를 실행하고 Evidence를 생성합니다."
  },
  dod: {
    title: "Definition of Done",
    description: "형식적 게이트(DoDHook)와 의미적 게이트(ScrumMaster)를 검증합니다."
  }
};

const STATUS_LABEL: Record<string, string> = {
  idle: "대기",
  running: "실행 중",
  completed: "완료",
  error: "오류"
};

interface TodoFlowCardProps {
  step: TodoFlowStepState;
}

export function TodoFlowCard({ step }: TodoFlowCardProps) {
  const meta = STEP_META[step.phase] ?? { title: step.phase, description: "" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-strong">{meta.title}</h3>
        <Badge
          variant="outline"
          className={cn(
            "text-2xs",
            step.status === "completed" && "text-status-success",
            step.status === "running" && "text-brand-500",
            step.status === "error" && "text-status-danger",
            step.status === "idle" && "text-text-soft"
          )}
        >
          {STATUS_LABEL[step.status] ?? step.status}
        </Badge>
      </div>

      <p className="text-xs leading-relaxed text-text-muted">{meta.description}</p>

      {step.status === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-brand-500/20 bg-brand-50 px-4 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
          <span className="text-xs font-medium text-brand-600">{meta.title} 실행 중...</span>
        </div>
      )}

      {step.status === "error" && step.error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {step.error}
        </div>
      )}

      {/* 목적: completed 상태에서 step.result가 있으면 phase별 상세를 렌더링한다. */}
      {step.status === "completed" && (
        step.result ? (
          <StepResultDetail phase={step.phase} result={step.result} />
        ) : (
          <div className="rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs text-status-success">
            단계 완료
          </div>
        )
      )}

      {step.status === "idle" && (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border-subtle py-8 text-xs text-text-soft">
          실행 대기 중
        </div>
      )}
    </div>
  );
}

// ─── Phase별 결과 상세 렌더러 ──────────────────────────────────

interface StepResultDetailProps {
  phase: string;
  result: Record<string, unknown>;
}

function StepResultDetail({ phase, result }: StepResultDetailProps) {
  if (phase === "workorder") {
    const raw = ((result as Record<string, unknown>).workOrder as Record<string, unknown>) ?? result;
    return <WorkOrderDetail data={raw as unknown as WorkOrder} />;
  }
  if (phase === "explore") {
    const raw = ((result as Record<string, unknown>).contextPack as Record<string, unknown>) ?? result;
    return <ContextPackDetail data={raw as unknown as ContextPack} />;
  }
  if (phase === "execute") {
    const raw = ((result as Record<string, unknown>).implReport as Record<string, unknown>) ?? result;
    return <ImplReportDetail data={raw as unknown as ImplReport} />;
  }
  if (phase === "verify") {
    const raw = ((result as Record<string, unknown>).evidence as Record<string, unknown>) ?? result;
    return <EvidenceDetail data={raw as unknown as Evidence} />;
  }
  if (phase === "dod") return <DodDetail data={result} />;
  return <JsonFallback data={result} />;
}

// ─── WorkOrder 상세 ─────────────────────────────────────────

function WorkOrderDetail({ data }: { data: WorkOrder }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-subtle/30 p-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-2xs text-brand-500">WorkOrder</Badge>
        {data.wo_id && <span className="text-2xs text-text-soft">{data.wo_id}</span>}
      </div>

      <Section label="Task">{data.task}</Section>
      <Section label="Expected Outcome">{data.expected_outcome}</Section>

      <CollapsibleList label="Must Do" items={data.must_do} variant="success" />
      <CollapsibleList label="Must Not" items={data.must_not} variant="danger" />
      <CollapsibleList label="Required Tools" items={data.required_tools} variant="default" />

      {data.scope && (
        <div className="flex flex-col gap-2">
          <CollapsibleList label="Editable Paths" items={data.scope.editable_paths} variant="default" icon={<FileCode className="h-3 w-3" />} />
          <CollapsibleList label="Forbidden Paths" items={data.scope.forbidden_paths} variant="danger" icon={<FileCode className="h-3 w-3" />} />
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-2xs text-text-muted">
        <span>verify: <code className="rounded bg-surface-subtle px-1">{data.verify_cmd}</code></span>
        <span>schema: {data.schema_version}</span>
        <span>mode: {data.mode}</span>
        <span>policy: {data.escalation_policy}</span>
        <span>timeout: {data.timeout_seconds}s</span>
        <span>attempt: {data.attempt?.n}/{data.attempt?.max}</span>
      </div>
    </div>
  );
}

// ─── ContextPack 상세 ───────────────────────────────────────

function ContextPackDetail({ data }: { data: ContextPack }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-subtle/30 p-4">
      <Badge variant="outline" className="w-fit text-2xs text-brand-500">Context Pack</Badge>

      <CollapsibleList label="Relevant Files" items={data.relevant_files} variant="default" icon={<FileCode className="h-3 w-3" />} />
      <CollapsibleList label="Test Files" items={data.test_files} variant="default" icon={<FileCode className="h-3 w-3" />} />

      {data.scope_suggestion && (
        <div className="flex flex-col gap-2">
          <CollapsibleList label="Suggested Editable" items={data.scope_suggestion.editable_paths} variant="success" icon={<FileCode className="h-3 w-3" />} />
          <CollapsibleList label="Suggested Forbidden" items={data.scope_suggestion.forbidden_paths} variant="danger" icon={<FileCode className="h-3 w-3" />} />
        </div>
      )}

      {data.notes && <Section label="Notes">{data.notes}</Section>}
      <TerminalSection terminal={data.terminal} />
    </div>
  );
}

// ─── ImplReport 상세 ────────────────────────────────────────

function ImplReportDetail({ data }: { data: ImplReport }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-subtle/30 p-4">
      <Badge variant="outline" className="w-fit text-2xs text-brand-500">Implementation Report</Badge>

      {/* 목적: scope_violations가 있으면 경고를 먼저 표시한다. */}
      {data.scope_violations?.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-danger" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-status-danger">Scope Violations</span>
            {data.scope_violations.map((v, i) => (
              <span key={i} className="text-2xs text-status-danger">{v}</span>
            ))}
          </div>
        </div>
      )}

      {data.changes?.length > 0 && (
        <CollapsibleSection label={`Changes (${data.changes.length})`} defaultOpen>
          <div className="flex flex-col gap-1.5">
            {data.changes.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded bg-surface-subtle px-2 py-1.5">
                <FileCode className="mt-0.5 h-3 w-3 shrink-0 text-text-soft" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-2xs font-medium text-text-strong">{c.path}</span>
                  <span className="text-2xs text-text-muted">{c.action}: {c.diff_summary}</span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleList label="Tests Added" items={data.tests_added} variant="success" />
      {data.notes && <Section label="Notes">{data.notes}</Section>}
      {data.diff && <DiffViewer diff={data.diff} />}
      <TerminalSection terminal={data.terminal} />
    </div>
  );
}

// ─── Evidence 상세 ──────────────────────────────────────────

function EvidenceDetail({ data }: { data: Evidence }) {
  const isPass = data.verdict === "PASS";

  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-md border p-4",
      isPass ? "border-status-success/30 bg-status-success/5" : "border-status-danger/30 bg-status-danger/5"
    )}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("text-2xs", isPass ? "text-status-success" : "text-status-danger")}>
          {data.verdict}
        </Badge>
        <span className="text-2xs text-text-muted">Verification Evidence</span>
      </div>

      {/* 목적: evidence 항목별 충족 여부를 표시한다. */}
      {data.evidence && (
        <div className="flex flex-col gap-1.5">
          <EvidenceItem label="Test Pass Log" value={data.evidence.test_pass_log} />
          <EvidenceItem label="Lint Clean" value={data.evidence.lint_clean} />
          <EvidenceItem label="Exit Code" value={data.evidence.exit_code} />
          <EvidenceItem label="Coverage" value={data.evidence.coverage_pct != null ? `${data.evidence.coverage_pct}%` : null} />
          <EvidenceItem label="Regression Check" value={data.evidence.regression_check} />
        </div>
      )}

      {data.scope_violations?.length > 0 && (
        <CollapsibleList label="Scope Violations" items={data.scope_violations} variant="danger" />
      )}

      {data.failure_summary && (
        <div className="flex flex-col gap-2 rounded-md border border-status-danger/20 bg-status-danger/5 px-3 py-2">
          <span className="text-xs font-medium text-status-danger">Failure Summary</span>
          <div className="flex flex-col gap-1 text-2xs text-text-muted">
            <span><strong>Symptom:</strong> {data.failure_summary.symptom}</span>
            <span><strong>Likely Cause:</strong> {data.failure_summary.likely_cause}</span>
            <span><strong>Next Hypothesis:</strong> {data.failure_summary.next_hypothesis}</span>
            <span><strong>Suggested Step:</strong> {data.failure_summary.suggested_next_step}</span>
          </div>
        </div>
      )}
      <TerminalSection terminal={data.terminal} />
    </div>
  );
}

function EvidenceItem({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  if (value == null) return null;
  const isBool = typeof value === "boolean";

  return (
    <div className="flex items-center gap-2 text-2xs">
      {isBool ? (
        value ? <Check className="h-3 w-3 text-status-success" /> : <X className="h-3 w-3 text-status-danger" />
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-text-soft" />
      )}
      <span className="text-text-muted">{label}:</span>
      <span className="text-text-strong">{isBool ? (value ? "Yes" : "No") : String(value)}</span>
    </div>
  );
}

// ─── DoD 상세 ───────────────────────────────────────────────

function DodDetail({ data }: { data: Record<string, unknown> }) {
  const dodResult = data.dodResult as string | null;
  const dodReason = data.dodReason as string | undefined;
  const finalVerdict = data.finalVerdict as string | null;
  const isPass = dodResult === "pass";

  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-md border p-4",
      isPass ? "border-status-success/30 bg-status-success/5" : "border-status-danger/30 bg-status-danger/5"
    )}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("text-2xs", isPass ? "text-status-success" : "text-status-danger")}>
          DoD {dodResult?.toUpperCase() ?? "N/A"}
        </Badge>
        {finalVerdict && (
          <Badge variant="outline" className={cn(
            "text-2xs",
            finalVerdict === "done" && "text-status-success",
            finalVerdict === "retry" && "text-status-warning",
            finalVerdict === "hold" && "text-status-danger"
          )}>
            {finalVerdict}
          </Badge>
        )}
      </div>

      {dodReason && <Section label="Reason">{dodReason}</Section>}
    </div>
  );
}

// ─── 공용 컴포넌트 ──────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-semibold text-text-muted">{label}</span>
      <span className="text-xs leading-relaxed text-text-strong">{children}</span>
    </div>
  );
}

function CollapsibleSection({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" className="flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-text-strong" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && children}
    </div>
  );
}

function CollapsibleList({
  label,
  items,
  variant = "default",
  icon
}: {
  label: string;
  items?: string[];
  variant?: "default" | "success" | "danger";
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const colorClass = variant === "success" ? "text-status-success" : variant === "danger" ? "text-status-danger" : "text-text-strong";

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-text-strong" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label} ({items.length})
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pl-4">
          {items.map((item, i) => (
            <div key={i} className={cn("flex items-center gap-1.5 text-2xs", colorClass)}>
              {icon ?? <div className="h-1 w-1 rounded-full bg-current" />}
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JsonFallback({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" className="flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-text-strong" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Raw Result
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto rounded-md bg-surface-subtle p-3 text-2xs text-text-muted">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TerminalSection({ terminal }: { terminal?: TerminalLog }) {
  if (!terminal) return null;
  return (
    <CollapsibleSection label="Terminal" defaultOpen={terminal.status === "failed"}>
      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-base p-3">
        <div className="flex items-center gap-2 text-2xs">
          <Badge variant="outline" className={cn(
            terminal.status === "failed" ? "text-status-danger" : "text-status-success"
          )}>
            {terminal.status.toUpperCase()}
          </Badge>
          {terminal.error && <span className="text-status-danger">{terminal.error}</span>}
        </div>
        <ToolTimeline entries={terminal.toolTimeline} />
        {terminal.output && (
          <details className="text-2xs">
            <summary className="cursor-pointer text-text-soft hover:text-text-muted">Output</summary>
            <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-surface-subtle p-2 text-text-muted">
              {terminal.output}
            </pre>
          </details>
        )}
        {terminal.stderr && (
          <details className="text-2xs" open>
            <summary className="cursor-pointer text-status-danger">Stderr</summary>
            <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-status-danger/10 p-2 text-status-danger">
              {terminal.stderr}
            </pre>
          </details>
        )}
      </div>
    </CollapsibleSection>
  );
}
