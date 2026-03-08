// 책임: 위험 평가 결과를 표시한다.

import type { RiskAssessment } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";

interface RiskViewProps {
  assessment: RiskAssessment | null;
}

export function RiskView({ assessment }: RiskViewProps) {
  if (!assessment) {
    return <p className="text-xs text-text-soft p-4">위험 평가 대기 중...</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text-strong">위험 평가</h3>
        <Badge
          variant={assessment.level === "high" ? "destructive" : assessment.level === "medium" ? "secondary" : "outline"}
        >
          {assessment.level}
        </Badge>
      </div>

      {assessment.factors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {assessment.factors.map((f, i) => (
            <li key={i} className="text-xs text-text-strong">
              <span className="text-text-soft">[{f.category}]</span> {f.description}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-text-soft">{assessment.recommendation}</p>
    </div>
  );
}
