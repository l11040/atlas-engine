// 책임: LangChain 플로우 실행 UI를 구성한다. 프롬프트 입력 + 플로우 파이프라인 시각화.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLangchainFlow, type FlowStatus } from "@/hooks/use-langchain-flow";
import { FlowNodeCard } from "./flow-node-card";
import { ArrowRight, Loader2, Play, Square, RotateCcw } from "lucide-react";
import type { ProviderType } from "../../../shared/ipc";

// 목적: 플로우 상태에 따른 Badge 스타일을 매핑한다.
const FLOW_STATUS_MAP: Record<FlowStatus, { label: string; className: string }> = {
  idle: { label: "대기", className: "bg-[var(--color-neutral-200)] text-[var(--color-text-muted)]" },
  running: { label: "실행 중", className: "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]" },
  completed: { label: "완료", className: "bg-[var(--color-diff-addition-bg)] text-[var(--color-diff-addition-text)]" },
  error: { label: "오류", className: "bg-[var(--color-diff-deletion-bg)] text-[var(--color-diff-deletion-text)]" }
};

interface FlowPanelProps {
  provider?: ProviderType;
  defaultCwd?: string;
}

export function FlowPanel({ provider = "claude", defaultCwd }: FlowPanelProps) {
  const flow = useLangchainFlow(provider);
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState(defaultCwd ?? "");

  const isRunning = flow.status === "running";
  const isFinished = flow.status === "completed" || flow.status === "error";
  const canSubmit = !isRunning && prompt.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    flow.invoke(prompt.trim(), cwd.trim() || undefined);
  };

  const statusInfo = FLOW_STATUS_MAP[flow.status];

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* 프롬프트 입력 */}
      <div className="flex flex-col gap-[var(--space-2)]">
        <Input
          placeholder="작업 디렉토리 (예: /Users/you/project)"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
        />
        <Textarea
          className="resize-none"
          placeholder="프롬프트를 입력하세요..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSubmit) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="flex gap-[var(--space-2)]">
          <Button onClick={handleSubmit} disabled={!canSubmit} size="sm">
            <Play className="mr-1 h-3.5 w-3.5" />
            실행
          </Button>
          <Button onClick={flow.cancel} disabled={!isRunning} variant="outline" size="sm">
            <Square className="mr-1 h-3.5 w-3.5" />
            취소
          </Button>
          {isFinished && (
            <Button onClick={flow.reset} variant="outline" size="sm">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              초기화
            </Button>
          )}
        </div>
      </div>

      {/* 플로우 상태 */}
      {flow.status !== "idle" && (
        <div className="flex flex-col gap-[var(--space-3)]">
          {/* 파이프라인 헤더 */}
          <div className="flex items-center gap-[var(--space-2)]">
            <span className="text-[var(--font-size-sm)] font-[var(--font-weight-semibold)] text-[var(--color-text-strong)]">
              LangChain Flow
            </span>
            <Badge className={statusInfo.className}>
              {isRunning && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {statusInfo.label}
            </Badge>
          </div>

          {/* 파이프라인 시각화: [Input] → [LLM] → [Output] */}
          <div className="flex items-start gap-[var(--space-2)]">
            {/* Input 노드 */}
            <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-brand-50)] p-[var(--space-3)]">
              <span className="text-[var(--font-size-2xs)] font-[var(--font-weight-semibold)] text-[var(--color-brand-600)]">
                Input
              </span>
              <p className="line-clamp-3 text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
                {prompt}
              </p>
            </div>

            <ArrowRight className="mt-[var(--space-3)] h-4 w-4 flex-shrink-0 text-[var(--color-text-soft)]" />

            {/* LLM 노드 */}
            <div className="min-w-0 flex-[2]">
              {flow.nodes.length > 0 ? (
                <div className="flex flex-col gap-[var(--space-2)]">
                  {flow.nodes.map((node) => (
                    <FlowNodeCard key={node.nodeId} node={node} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] p-[var(--space-4)]">
                  {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--color-text-soft)]" />}
                  <span className="text-[var(--font-size-xs)] text-[var(--color-text-soft)]">
                    {isRunning ? "LLM 노드 대기 중..." : "노드 없음"}
                  </span>
                </div>
              )}
            </div>

            <ArrowRight className="mt-[var(--space-3)] h-4 w-4 flex-shrink-0 text-[var(--color-text-soft)]" />

            {/* Output 노드 */}
            <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-[var(--space-3)]">
              <span className="text-[var(--font-size-2xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-soft)]">
                Output
              </span>
              {flow.result ? (
                <p className="whitespace-pre-wrap text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
                  {flow.result}
                </p>
              ) : (
                <p className="text-[var(--font-size-xs)] text-[var(--color-text-soft)]">
                  {isRunning ? "대기 중..." : "—"}
                </p>
              )}
            </div>
          </div>

          {/* 메타데이터 + 에러 */}
          {isFinished && (
            <div className="flex items-center gap-[var(--space-3)]">
              {flow.metadata?.costUsd != null && (
                <span className="text-[var(--font-size-2xs)] text-[var(--color-text-muted)]">
                  비용: ${flow.metadata.costUsd.toFixed(4)}
                </span>
              )}
              {flow.metadata?.durationMs != null && (
                <span className="text-[var(--font-size-2xs)] text-[var(--color-text-muted)]">
                  소요: {(flow.metadata.durationMs / 1000).toFixed(1)}s
                </span>
              )}
              {flow.error && (
                <span className="text-[var(--font-size-2xs)] text-[var(--color-status-danger)]">{flow.error}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
