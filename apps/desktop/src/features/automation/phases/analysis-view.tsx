// 책임: 구조화된 요구사항 해석 결과를 표시한다.

import type { ParsedRequirements } from "@shared/ipc";

interface AnalysisViewProps {
  requirements: ParsedRequirements | null;
}

export function AnalysisView({ requirements }: AnalysisViewProps) {
  if (!requirements) {
    return <p className="text-xs text-text-soft p-4">요구사항 해석 대기 중...</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-medium text-text-strong">요구사항 해석</h3>

      {requirements.acceptance_criteria.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-text-soft mb-1">인수 기준</h4>
          <ul className="list-disc pl-4 text-xs text-text-strong">
            {requirements.acceptance_criteria.map((ac) => (
              <li key={ac.id}>{ac.description}</li>
            ))}
          </ul>
        </section>
      )}

      {requirements.missing_sections.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-red-500 mb-1">누락 항목</h4>
          <ul className="list-disc pl-4 text-xs text-red-500">
            {requirements.missing_sections.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {requirements.ambiguity_list.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-amber-600 mb-1">모호성</h4>
          <ul className="list-disc pl-4 text-xs text-amber-700">
            {requirements.ambiguity_list.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {requirements.dependency_list.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-text-soft mb-1">의존성</h4>
          <ul className="list-disc pl-4 text-xs text-text-strong">
            {requirements.dependency_list.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
