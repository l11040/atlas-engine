// 책임: 구조화된 요구사항 해석 결과를 검수자 친화적으로 표시한다.

import type { ParsedRequirements } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, CheckCircle2, AlertTriangle, HelpCircle, Link2, ListChecks, GitBranch, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisViewProps {
  requirements: ParsedRequirements | null;
}

// 목적: 섹션 카드의 공통 래퍼.
function Section({ title, icon: Icon, iconClass, count, children }: {
  title: string;
  icon: typeof CheckCircle2;
  iconClass: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border-subtle">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Icon className={cn("h-3.5 w-3.5", iconClass)} />
        <h4 className="text-xs font-medium text-text-strong">{title}</h4>
        {count != null && (
          <Badge variant="secondary" className="ml-auto text-[10px]">{count}</Badge>
        )}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function AnalysisView({ requirements }: AnalysisViewProps) {
  if (!requirements) {
    return <p className="text-xs text-text-soft p-4">요구사항 해석 대기 중...</p>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* 인수 기준 */}
      <Section title="인수 기준" icon={CheckCircle2} iconClass="text-status-success" count={requirements.acceptance_criteria.length}>
        <div className="flex flex-col gap-1.5">
          {requirements.acceptance_criteria.map((ac) => (
            <div key={ac.id} className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-surface-subtle">
              <Badge variant="outline" className="shrink-0 text-[10px] font-mono">{ac.id}</Badge>
              <span className="flex-1 text-xs text-text-strong">{ac.description}</span>
              <Badge variant={ac.testable ? "secondary" : "destructive"} className="shrink-0 text-[10px]">
                {ac.testable ? "검증 가능" : "검증 불가"}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      {/* 테스트 시나리오 */}
      {requirements.test_scenarios.length > 0 && (
        <Section title="테스트 시나리오" icon={ListChecks} iconClass="text-brand-500" count={requirements.test_scenarios.length}>
          <div className="flex flex-col gap-1.5">
            {requirements.test_scenarios.map((ts) => (
              <div key={ts.id} className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-surface-subtle">
                <Badge variant="outline" className="shrink-0 text-[10px] font-mono">{ts.id}</Badge>
                <span className="flex-1 text-xs text-text-strong">{ts.description}</span>
                {ts.linked_ac_ids.length > 0 && (
                  <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-text-soft">
                    <Link2 className="h-3 w-3" />
                    {ts.linked_ac_ids.join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 구현 단계 */}
      {requirements.implementation_steps.length > 0 && (
        <Section title="구현 단계" icon={GitBranch} iconClass="text-tool-bash" count={requirements.implementation_steps.length}>
          <ol className="flex flex-col gap-1">
            {requirements.implementation_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 rounded px-2 py-1 text-xs text-text-strong">
                <span className="shrink-0 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-surface-subtle text-[10px] font-medium text-text-soft">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* 정책·규칙 */}
      {requirements.policy_rules.length > 0 && (
        <Section title="비즈니스 규칙" icon={FileText} iconClass="text-text-soft" count={requirements.policy_rules.length}>
          <ul className="flex flex-col gap-1">
            {requirements.policy_rules.map((rule, i) => (
              <li key={i} className="text-xs text-text-strong px-2 py-0.5">{rule}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 누락 항목 */}
      {requirements.missing_sections.length > 0 && (
        <Section title="누락 항목" icon={AlertTriangle} iconClass="text-status-danger" count={requirements.missing_sections.length}>
          <ul className="flex flex-col gap-1">
            {requirements.missing_sections.map((s, i) => (
              <li key={i} className="text-xs text-status-danger px-2 py-0.5">{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 모호성 */}
      {requirements.ambiguity_list.length > 0 && (
        <Section title="모호·충돌 사항" icon={HelpCircle} iconClass="text-status-warning" count={requirements.ambiguity_list.length}>
          <ul className="flex flex-col gap-1">
            {requirements.ambiguity_list.map((s, i) => (
              <li key={i} className="text-xs text-status-warning px-2 py-0.5">{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 의존성 */}
      {requirements.dependency_list.length > 0 && (
        <Section title="의존성·전제조건" icon={Link2} iconClass="text-tool-search" count={requirements.dependency_list.length}>
          <ul className="flex flex-col gap-1">
            {requirements.dependency_list.map((s, i) => (
              <li key={i} className="text-xs text-text-strong px-2 py-0.5">{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 원본 설명 */}
      {requirements.description_raw && (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-xs text-text-soft hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
            <ChevronRight className="chevron h-3 w-3 shrink-0 transition-transform" />
            <FileText className="h-3.5 w-3.5" />
            원본 티켓 설명
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-surface-subtle p-3 text-xs text-text-muted">
              {requirements.description_raw}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
