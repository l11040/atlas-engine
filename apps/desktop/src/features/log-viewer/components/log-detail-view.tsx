import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";

interface ResultCheck {
  label: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
}

interface ResultArtifact {
  label: string;
  kind?: string;
  path?: string;
  value?: string;
}

interface StructuredSkillResult {
  schema_version: "1";
  schema: string;
  skill: string;
  status: "ok" | "noop" | "error";
  title: string;
  summary_markdown: string;
  data: Record<string, unknown>;
  artifacts?: ResultArtifact[];
  checks?: ResultCheck[];
  warnings?: string[];
  errors?: string[];
}

interface StructuredAgentResult {
  schema_version: "1";
  schema: string;
  agent: string;
  status: "ok" | "noop" | "error";
  title: string;
  summary_markdown: string;
  data: Record<string, unknown>;
  artifacts?: ResultArtifact[];
  checks?: ResultCheck[];
  warnings?: string[];
  errors?: string[];
}

type StructuredExecutionResult = StructuredSkillResult | StructuredAgentResult;

interface ParsedLogDetail {
  structuredResult?: StructuredExecutionResult;
  markdown?: string;
  displayValue?: unknown;
  rawJson?: string;
  displayJson?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isResultCheck(value: unknown): value is ResultCheck {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    (value.status === "pass" || value.status === "fail" || value.status === "skip") &&
    (value.detail === undefined || typeof value.detail === "string")
  );
}

function isResultArtifact(value: unknown): value is ResultArtifact {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    (value.kind === undefined || typeof value.kind === "string") &&
    (value.path === undefined || typeof value.path === "string") &&
    (value.value === undefined || typeof value.value === "string")
  );
}

function isStructuredExecutionBase(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  const checksOk =
    value.checks === undefined ||
    (Array.isArray(value.checks) && value.checks.every((item) => isResultCheck(item)));
  const artifactsOk =
    value.artifacts === undefined ||
    (Array.isArray(value.artifacts) && value.artifacts.every((item) => isResultArtifact(item)));

  return (
    value.schema_version === "1" &&
    typeof value.schema === "string" &&
    (value.status === "ok" || value.status === "noop" || value.status === "error") &&
    typeof value.title === "string" &&
    typeof value.summary_markdown === "string" &&
    isRecord(value.data) &&
    checksOk &&
    artifactsOk &&
    (value.warnings === undefined ||
      (Array.isArray(value.warnings) && value.warnings.every((item) => typeof item === "string"))) &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.every((item) => typeof item === "string")))
  );
}

function isStructuredSkillResult(value: unknown): value is StructuredSkillResult {
  return isStructuredExecutionBase(value) && isRecord(value) && typeof value.skill === "string";
}

function isStructuredAgentResult(value: unknown): value is StructuredAgentResult {
  return isStructuredExecutionBase(value) && isRecord(value) && typeof value.agent === "string";
}

function parseLogDetail(detail: string): ParsedLogDetail {
  const trimmed = detail.trim();
  if (!trimmed) return {};

  const rootValue = parseJson(trimmed);
  if (rootValue === undefined) {
    return { markdown: detail };
  }

  let displayValue: unknown = rootValue;
  if (isRecord(rootValue) && typeof rootValue.result === "string" && rootValue.result.trim().length > 0) {
    const nestedValue = parseJson(rootValue.result.trim());
    if (nestedValue !== undefined) {
      displayValue = nestedValue;
    } else {
      return {
        markdown: rootValue.result,
        rawJson: JSON.stringify(rootValue, null, 2)
      };
    }
  }

  const rawJson = JSON.stringify(rootValue, null, 2);
  const displayJson =
    typeof displayValue === "string" || typeof displayValue === "number" || typeof displayValue === "boolean"
      ? undefined
      : JSON.stringify(displayValue, null, 2);

  if (typeof displayValue === "string") {
    return {
      markdown: displayValue,
      rawJson,
      displayJson
    };
  }

  if (isStructuredSkillResult(displayValue) || isStructuredAgentResult(displayValue)) {
    return {
      structuredResult: displayValue,
      rawJson,
      displayJson
    };
  }

  return {
    displayValue,
    rawJson,
    displayJson
  };
}

function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-subtle)] p-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 text-xs leading-6 text-[var(--color-text-strong)]">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-xs leading-6 text-[var(--color-text-strong)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs leading-6 text-[var(--color-text-strong)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => (
            <h1 className="mb-3 text-base font-semibold text-[var(--color-text-strong)]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-strong)]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-xs font-semibold text-[var(--color-text-strong)]">{children}</h3>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5 font-mono text-[11px] text-[var(--color-text-strong)]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md bg-[var(--color-neutral-900)] p-3 font-mono text-[11px] leading-5 text-[var(--color-neutral-50)] last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-xs text-[var(--color-text-strong)]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--color-neutral-100)]">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-[var(--color-border-subtle)] px-2 py-1.5 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--color-border-subtle)] px-2 py-1.5 align-top">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[var(--color-brand-300)] pl-3 text-xs leading-6 text-[var(--color-text-muted)]">
              {children}
            </blockquote>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</div>
      {children}
    </div>
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="font-mono text-[11px] text-[var(--color-text-soft)]">null</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-text-strong)]">
        {String(value)}
      </span>
    );
  }

  if (typeof value === "number") {
    return <span className="font-mono text-[11px] text-[var(--color-text-strong)]">{value}</span>;
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return <span className="text-xs text-[var(--color-text-soft)]">빈 문자열</span>;
    }

    if (value.includes("\n") || value.length > 96) {
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-neutral-50)] p-2 font-mono text-[11px] leading-5 text-[var(--color-text-strong)]">
          {value}
        </pre>
      );
    }

    return <span className="break-all text-xs text-[var(--color-text-strong)]">{value}</span>;
  }

  return <span className="font-mono text-[11px] text-[var(--color-text-strong)]">{String(value)}</span>;
}

function StructuredField({ label, value, depth = 0 }: { label: string; value: unknown; depth?: number }) {
  const surface = depth % 2 === 0 ? "bg-[var(--color-surface-subtle)]" : "bg-[var(--color-neutral-50)]";

  return (
    <div className={`rounded-md border border-[var(--color-border-subtle)] ${surface} p-3`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-2">
        <StructuredValue value={value} depth={depth + 1} />
      </div>
    </div>
  );
}

function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <PrimitiveValue value={value} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="text-xs text-[var(--color-text-soft)]">항목 없음</div>;
    }

    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <StructuredField key={`${depth}-${index}`} label={`item ${index + 1}`} value={item} depth={depth} />
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <div className="text-xs text-[var(--color-text-soft)]">비어 있습니다</div>;
    }

    return (
      <div className="space-y-2">
        {entries.map(([key, nestedValue]) => (
          <StructuredField key={`${depth}-${key}`} label={key} value={nestedValue} depth={depth} />
        ))}
      </div>
    );
  }

  return <PrimitiveValue value={String(value)} />;
}

function ResultStatusBadge({ status }: { status: StructuredSkillResult["status"] }) {
  const className =
    status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "noop"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {status}
    </span>
  );
}

function CheckBadge({ status }: { status: ResultCheck["status"] }) {
  const className =
    status === "pass"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "skip"
        ? "border-neutral-200 bg-neutral-50 text-neutral-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {status}
    </span>
  );
}

function ResultNoticeList({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "warning" | "error";
}) {
  if (items.length === 0) return null;

  const className =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";

  return (
    <SectionBlock title={title}>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className={`rounded-md border px-3 py-2 text-xs leading-6 ${className}`}>
            {item}
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function ResultChecks({ checks }: { checks: ResultCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <SectionBlock title="checks">
      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-medium text-[var(--color-text-strong)]">{check.label}</span>
              <CheckBadge status={check.status} />
            </div>
            {check.detail && (
              <div className="mt-1 text-[11px] leading-5 text-[var(--color-text-soft)]">{check.detail}</div>
            )}
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function ResultArtifacts({ artifacts }: { artifacts: ResultArtifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <SectionBlock title="artifacts">
      <div className="space-y-2">
        {artifacts.map((artifact) => (
          <div
            key={`${artifact.label}-${artifact.path ?? artifact.value ?? artifact.kind ?? ""}`}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--color-text-strong)]">{artifact.label}</span>
              {artifact.kind && (
                <Badge variant="outline" className="py-0 text-[10px]">
                  {artifact.kind}
                </Badge>
              )}
            </div>
            {artifact.path && (
              <div className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-soft)]">{artifact.path}</div>
            )}
            {artifact.value && (
              <div className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-soft)]">{artifact.value}</div>
            )}
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function TicketReadDataView({ data }: { data: Record<string, unknown> }) {
  const tickets = Array.isArray(data.tickets) ? data.tickets.filter((item) => isRecord(item)) : [];
  if (tickets.length === 0) {
    return <StructuredValue value={data} />;
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket, index) => {
        const implementationCandidates = isRecord(ticket.implementation_candidates)
          ? ticket.implementation_candidates
          : undefined;
        const structuredData = isRecord(ticket.structured_data) ? ticket.structured_data : undefined;

        return (
          <div
            key={`${String(ticket.ticket_key ?? index)}-${index}`}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="py-0 text-[10px]">
                {typeof ticket.ticket_key === "string" ? ticket.ticket_key : `ticket ${index + 1}`}
              </Badge>
              {typeof ticket.summary === "string" && (
                <span className="text-xs font-medium text-[var(--color-text-strong)]">{ticket.summary}</span>
              )}
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  acceptance criteria
                </div>
                <ul className="space-y-1">
                  {asStringArray(ticket.acceptance_criteria).map((criterion, criterionIndex) => (
                    <li
                      key={`${criterionIndex}-${criterion}`}
                      className="rounded-md bg-[var(--color-neutral-50)] px-2.5 py-2 text-xs leading-5 text-[var(--color-text-strong)]"
                    >
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>

              {implementationCandidates && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    implementation candidates
                  </div>
                  <StructuredValue value={implementationCandidates} />
                </div>
              )}

              {structuredData && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    structured data
                  </div>
                  <StructuredValue value={structuredData} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDesignDataView({ data }: { data: Record<string, unknown> }) {
  const taskCount = typeof data.task_count === "number" ? data.task_count : undefined;
  const tasks = Array.isArray(data.generated_tasks) ? data.generated_tasks.filter((item) => isRecord(item)) : [];

  return (
    <div className="space-y-3">
      {taskCount != null && (
        <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">task count</div>
          <div className="mt-1 font-mono text-sm font-semibold text-[var(--color-text-strong)]">{taskCount}</div>
        </div>
      )}

      {tasks.length > 0 ? (
        tasks.map((task, index) => (
          <div
            key={`${String(task.task_id ?? index)}-${index}`}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {typeof task.task_id === "string" && (
                <Badge variant="outline" className="py-0 text-[10px]">
                  {task.task_id}
                </Badge>
              )}
              {typeof task.title === "string" && (
                <span className="text-xs font-medium text-[var(--color-text-strong)]">{task.title}</span>
              )}
            </div>
            <div className="mt-3">
              <StructuredValue
                value={{
                  source_tickets: task.source_tickets,
                  depends_on: task.depends_on,
                  files: task.files
                }}
              />
            </div>
          </div>
        ))
      ) : (
        <StructuredValue value={data} />
      )}
    </div>
  );
}

function GateAFixDataView({ data }: { data: Record<string, unknown> }) {
  const updatedTasks = asStringArray(data.updated_tasks);

  return (
    <div className="space-y-3">
      <StructuredValue
        value={{
          validation_status: data.validation_status,
          action: data.action,
          retry_recommended: data.retry_recommended
        }}
      />

      {updatedTasks.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            updated tasks
          </div>
          <div className="space-y-1">
            {updatedTasks.map((taskId) => (
              <div
                key={taskId}
                className="rounded-md bg-[var(--color-neutral-50)] px-2.5 py-2 font-mono text-[11px] text-[var(--color-text-strong)]"
              >
                {taskId}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SetupAgentDataView({ data }: { data: Record<string, unknown> }) {
  const gate0Summary = isRecord(data.gate0_summary) ? data.gate0_summary : undefined;
  const results = Array.isArray(gate0Summary?.results) ? gate0Summary.results.filter((item) => isRecord(item)) : [];

  return (
    <div className="space-y-3">
      <StructuredValue
        value={{
          ticket_key: data.ticket_key,
          status: data.status,
          branch: data.branch,
          branch_created: data.branch_created,
          run_dir: data.run_dir
        }}
      />

      {gate0Summary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "total", value: gate0Summary.total },
            { label: "pass", value: gate0Summary.pass },
            { label: "fail", value: gate0Summary.fail }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {item.label}
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-[var(--color-text-strong)]">
                {typeof item.value === "number" ? item.value : "-"}
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            gate 0 results
          </div>
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={`${String(result.ticket_key ?? index)}-${index}`}
                className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="py-0 text-[10px]">
                    {typeof result.ticket_key === "string" ? result.ticket_key : `ticket ${index + 1}`}
                  </Badge>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      result.status === "pass"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {result.status === "pass" ? "pass" : "fail"}
                  </span>
                </div>
                {typeof result.source_file === "string" && (
                  <div className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-soft)]">
                    {result.source_file}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type StructuredResultRenderer = (result: StructuredExecutionResult) => ReactNode;

const STRUCTURED_RESULT_SCHEMA_REGISTRY: Record<string, StructuredResultRenderer> = {
  "atlas/skill-result/atlas-analyze-ticket-read@1": (result) => (
    <TicketReadDataView data={result.data} />
  ),
  "atlas/skill-result/atlas-analyze-task-design@1": (result) => (
    <TaskDesignDataView data={result.data} />
  ),
  "atlas/skill-result/atlas-analyze-gate-a-fix@1": (result) => (
    <GateAFixDataView data={result.data} />
  ),
  "atlas/agent-result/atlas-setup@1": (result) => (
    <SetupAgentDataView data={result.data} />
  )
};

function StructuredResultDataView({ result }: { result: StructuredExecutionResult }) {
  const renderer = STRUCTURED_RESULT_SCHEMA_REGISTRY[result.schema];
  if (!renderer) {
    return <StructuredValue value={result.data} />;
  }

  return <>{renderer(result)}</>;
}

export function LogDetailView({ detail }: { detail: string }) {
  const parsed = useMemo(() => parseLogDetail(detail), [detail]);

  if (parsed.structuredResult) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="py-0 text-[10px]">
              {"skill" in parsed.structuredResult ? parsed.structuredResult.skill : parsed.structuredResult.agent}
            </Badge>
            <ResultStatusBadge status={parsed.structuredResult.status} />
            <span className="break-all font-mono text-[10px] text-[var(--color-text-soft)]">
              {parsed.structuredResult.schema}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-[var(--color-text-strong)]">{parsed.structuredResult.title}</div>
        </div>

        <SectionBlock title="summary">
          <MarkdownContent markdown={parsed.structuredResult.summary_markdown} />
        </SectionBlock>

        <ResultChecks checks={parsed.structuredResult.checks ?? []} />
        <ResultArtifacts artifacts={parsed.structuredResult.artifacts ?? []} />
        <ResultNoticeList title="warnings" items={parsed.structuredResult.warnings ?? []} tone="warning" />
        <ResultNoticeList title="errors" items={parsed.structuredResult.errors ?? []} tone="error" />

        <SectionBlock title="return data">
          <StructuredResultDataView result={parsed.structuredResult} />
        </SectionBlock>

        {parsed.rawJson && parsed.rawJson !== parsed.displayJson && (
          <details className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
            <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              raw log json
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-[var(--color-border-subtle)] px-3 py-2 font-mono text-[11px] leading-5 text-[var(--color-text-strong)]">
              {parsed.rawJson}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (parsed.markdown) {
    return (
      <div className="space-y-3">
        <MarkdownContent markdown={parsed.markdown} />
        {parsed.rawJson && (
          <details className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
            <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              raw log json
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-[var(--color-border-subtle)] px-3 py-2 font-mono text-[11px] leading-5 text-[var(--color-text-strong)]">
              {parsed.rawJson}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (parsed.displayValue !== undefined) {
    return (
      <div className="space-y-3">
        <StructuredValue value={parsed.displayValue} />
        {parsed.rawJson && parsed.rawJson !== parsed.displayJson && (
          <details className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
            <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              raw log json
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-[var(--color-border-subtle)] px-3 py-2 font-mono text-[11px] leading-5 text-[var(--color-text-strong)]">
              {parsed.rawJson}
            </pre>
          </details>
        )}
      </div>
    );
  }

  return null;
}
