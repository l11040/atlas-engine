// 책임: DoR(Definition of Ready) 형식/의미 검증 결과를 표시한다.

import { Check, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DorCheckResult {
  label: string;
  result: "pass" | "proceed" | "hold" | null;
  reason: string;
}

interface DorCheckCardProps {
  formal: DorCheckResult;
  semantic: DorCheckResult;
}

function CheckRow({ check }: { check: DorCheckResult }) {
  const isPassed = check.result === "pass" || check.result === "proceed";
  const isHold = check.result === "hold";
  const isPending = check.result === null;

  return (
    <div className="flex flex-col gap-1.5 rounded-xs border border-border-subtle p-2.5">
      <div className="flex items-center gap-2">
        {isPassed && <Check className="h-3.5 w-3.5 text-status-success" />}
        {isHold && <AlertCircle className="h-3.5 w-3.5 text-status-warning" />}
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-soft" />}
        <span className="text-2xs font-semibold text-text-strong">{check.label}</span>
        {!isPending && (
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-2xs",
              isPassed && "text-status-success",
              isHold && "text-status-warning"
            )}
          >
            {isPassed ? "pass" : "hold"}
          </Badge>
        )}
      </div>
      {check.reason && (
        <p className="text-2xs leading-relaxed text-text-muted">{check.reason}</p>
      )}
    </div>
  );
}

export function DorCheckCard({ formal, semantic }: DorCheckCardProps) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold text-text-strong">DoR 검증</span>
      <div className="flex flex-col gap-2">
        <CheckRow check={formal} />
        <CheckRow check={semantic} />
      </div>
    </div>
  );
}
