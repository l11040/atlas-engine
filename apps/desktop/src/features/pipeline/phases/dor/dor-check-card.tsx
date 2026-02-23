// 책임: DoR(Definition of Ready) 형식/의미 검증 결과를 표시한다.

import { Check, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    <div className="-mx-2 rounded-md px-2 py-2">
      <div className="flex items-center gap-2">
        {isPassed && <Check className="h-3.5 w-3.5 text-status-success" />}
        {isHold && <AlertCircle className="h-3.5 w-3.5 text-status-warning" />}
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-soft" />}
        <span className="text-xs font-semibold text-text-strong">{check.label}</span>
        {!isPending && (
          <Badge
            variant="outline"
            className={cn(
              "text-2xs",
              isPassed && "text-status-success",
              isHold && "text-status-warning"
            )}
          >
            {isPassed ? "pass" : "hold"}
          </Badge>
        )}
      </div>
      {check.reason && (
        <p className="mt-1 text-xs leading-[1.7] text-text-muted">{check.reason}</p>
      )}
    </div>
  );
}

export function DorCheckCard({ formal, semantic }: DorCheckCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-base px-5 py-4">
      <h3 className="text-xs font-semibold text-text-strong">DoR 검증</h3>
      <CheckRow check={formal} />
      <Separator />
      <CheckRow check={semantic} />
    </div>
  );
}
