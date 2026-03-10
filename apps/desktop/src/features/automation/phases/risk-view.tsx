// 책임: 위험 평가 결과를 검수자 친화적으로 표시한다.

import type { RiskAssessment } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, Shield, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskViewProps {
  assessment: RiskAssessment | null;
}

const LEVEL_CONFIG = {
  low: { label: "낮음", icon: ShieldCheck, badgeVariant: "secondary" as const, colorClass: "text-status-success", bgClass: "bg-emerald-50" },
  medium: { label: "보통", icon: Shield, badgeVariant: "secondary" as const, colorClass: "text-status-warning", bgClass: "bg-amber-50" },
  high: { label: "높음", icon: ShieldAlert, badgeVariant: "destructive" as const, colorClass: "text-status-danger", bgClass: "bg-red-50" }
};

const SEVERITY_BADGE: Record<string, "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline"
};

export function RiskView({ assessment }: RiskViewProps) {
  if (!assessment) {
    return <p className="text-xs text-text-soft p-4">위험 평가 대기 중...</p>;
  }

  const config = LEVEL_CONFIG[assessment.level];
  const LevelIcon = config.icon;

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* 위험 등급 요약 */}
      <div className={cn("flex items-center gap-3 rounded-md border border-border-subtle px-4 py-3", config.bgClass)}>
        <LevelIcon className={cn("h-5 w-5", config.colorClass)} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-strong">위험 등급</span>
            <Badge variant={config.badgeVariant}>{config.label}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">위험 요소 {assessment.factors.length}건 감지</p>
        </div>
      </div>

      {/* 위험 요소 목록 */}
      {assessment.factors.length > 0 && (
        <section className="rounded-md border border-border-subtle">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
            <h4 className="text-xs font-medium text-text-strong">위험 요소</h4>
            <Badge variant="secondary" className="ml-auto text-[10px]">{assessment.factors.length}</Badge>
          </div>
          <div className="flex flex-col">
            {assessment.factors.map((f, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0">
                <Badge variant={SEVERITY_BADGE[f.severity] ?? "outline"} className="shrink-0 text-[10px]">
                  {f.severity}
                </Badge>
                <Badge variant="outline" className="shrink-0 text-[10px]">{f.category}</Badge>
                <span className="flex-1 text-xs text-text-strong">{f.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 권장 사항 */}
      <div className="flex items-start gap-2 rounded-md border border-border-subtle px-3 py-3">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
        <div>
          <h4 className="text-xs font-medium text-text-strong mb-1">권장 사항</h4>
          <p className="text-xs text-text-muted">{assessment.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
