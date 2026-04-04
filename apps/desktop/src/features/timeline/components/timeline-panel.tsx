// 책임: Cascade Gantt 타임라인 — 계층형 행 + 시간 눈금자 + 상태 색상 바를 렌더한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Timer } from "lucide-react";
import type { TimelineData, TimelineRow } from "../hooks/use-timeline-data";
import type { NodeStatus } from "@shared/ipc";

const LABEL_W_DEFAULT = 180;
const LABEL_W_MIN = 112;
const LABEL_HANDLE_W = 10;
const DURATION_W = 48;
const TIMELINE_TRACK_MIN_W = 160;

interface TimelinePanelProps {
  data: TimelineData;
  selectedRowId: string | null;
  onBarClick?: (
    rowId: string,
    nodeId: string,
    selectedLogId?: number,
    selectedLogType?: "agent" | "skill"
  ) => void;
  // 목적: 드래그 리사이즈로 조절되는 콘텐츠 영역 높이 (px)
  height: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 목적: totalSec을 균등 분할하는 눈금자 틱을 계산한다.
function calcTicks(
  totalSec: number
): Array<{ sec: number; label: string; percent: number }> {
  if (totalSec <= 0)
    return [{ sec: 0, label: "0s", percent: 0 }];

  const NICE = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const approx = totalSec / 5;
  const step = NICE.find((n) => n >= approx) ?? 600;

  const ticks: Array<{ sec: number; label: string; percent: number }> = [];
  for (let s = 0; s <= totalSec; s += step) {
    ticks.push({ sec: s, label: fmtSec(s), percent: (s / totalSec) * 100 });
  }
  // 이유: 마지막 틱이 totalSec와 다르면 총 시간 레이블을 추가한다.
  if (ticks.at(-1)!.sec < totalSec) {
    ticks.push({ sec: totalSec, label: fmtSec(totalSec), percent: 100 });
  }
  return ticks;
}

function fmtSec(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m${r}s` : `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

// 목적: 상태 + 타입에 따라 CSS 변수 색상을 반환한다.
function barColor(type: "agent" | "skill", status: NodeStatus): string {
  if (status === "failed") return "var(--color-timeline-bar-failed)";
  if (status === "running") return "var(--color-timeline-bar-running)";
  if (status === "completed")
    return type === "agent"
      ? "var(--color-timeline-bar-agent)"
      : "var(--color-timeline-bar-skill)";
  return "var(--color-timeline-bar-pending)";
}

interface RowProps {
  row: TimelineRow;
  labelWidth: number;
  selected: boolean;
  onClick: () => void;
}

function CascadeRow({ row, labelWidth, selected, onClick }: RowProps) {
  const rowH = row.depth === 0 ? "h-8" : "h-6";
  const barH = row.depth === 0 ? "h-4" : "h-3";
  const isRunning = row.bar?.status === "running";

  const tooltipText = row.bar
    ? `${row.label}\n${fmtSec(row.bar.durationSec)} (${fmtTime(new Date(row.bar.startMs).toISOString())} → ${fmtTime(new Date(row.bar.endMs).toISOString())})`
    : `${row.label} — 대기 중`;

  return (
    <div
      className={`flex ${rowH} cursor-pointer items-center gap-0 transition-colors ${
        selected ? "bg-[var(--color-brand-50)]" : "hover:bg-[var(--color-neutral-50)]"
      }`}
      onClick={onClick}
    >
      {/* 레이블 열 */}
      <div
        className="flex shrink-0 items-center"
        style={{ width: labelWidth, paddingLeft: row.depth * 12 + 4, paddingRight: 6 }}
      >
        {row.depth > 0 && (
          <span className="mr-1 text-[var(--color-neutral-400)]" style={{ fontSize: 9 }}>↳</span>
        )}
        <span
          className={`truncate ${
            row.depth === 0
              ? "text-xs font-semibold text-[var(--color-text-strong)]"
              : "text-2xs font-medium text-[var(--color-text-muted)]"
          }`}
        >
          {row.label}
        </span>
      </div>
      <div
        className="shrink-0 border-r border-[var(--color-border-subtle)]"
        style={{ width: LABEL_HANDLE_W, height: "100%" }}
      />

      {/* 바 트랙 */}
      <div className="relative flex-1 px-1" title={tooltipText}>
        {/* 트랙 배경 */}
        <div
          className={`absolute inset-x-1 rounded-sm ${
            row.depth === 0 ? "inset-y-2" : "inset-y-1.5"
          }`}
          style={{ backgroundColor: "var(--color-timeline-track)" }}
        />
        {/* 실제 바 */}
        {row.bar ? (
          <div
            className={`absolute rounded-sm ${barH} ${isRunning ? "animate-pulse" : ""}`}
            style={{
              left: `calc(4px + ${row.bar.leftPercent}%)`,
              width: `calc(${row.bar.widthPercent}% - 8px)`,
              top: "50%",
              transform: "translateY(-50%)",
              minWidth: 3,
              backgroundColor: barColor(row.type, row.bar.status)
            }}
          />
        ) : (
          // 이유: 로그 없는 행은 점선 스트로크로 대기 상태를 표시한다.
          <div
            className="absolute inset-x-1 rounded-sm"
            style={{
              top: "50%",
              height: row.depth === 0 ? 2 : 1,
              transform: "translateY(-50%)",
              background: `repeating-linear-gradient(90deg, var(--color-neutral-300) 0, var(--color-neutral-300) 4px, transparent 4px, transparent 8px)`
            }}
          />
        )}
      </div>

      {/* 소요 시간 */}
      <div className="w-10 shrink-0 pr-2 text-right">
        {row.bar && (
          <span className="tabular-nums text-2xs text-[var(--color-text-soft)]">
            {row.bar.durationSec}s
          </span>
        )}
      </div>
    </div>
  );
}

export function TimelinePanel({ data, selectedRowId, onBarClick, height, open, onOpenChange }: TimelinePanelProps) {
  const { rows, totalDurationSec } = data;
  const ticks = calcTicks(totalDurationSec);
  const [labelWidth, setLabelWidth] = useState(LABEL_W_DEFAULT);
  const contentRef = useRef<HTMLDivElement>(null);

  const getMaxLabelWidth = useCallback(() => {
    const contentWidth = contentRef.current?.clientWidth ?? 0;
    if (contentWidth <= 0) return 640;
    return Math.max(
      LABEL_W_MIN,
      contentWidth - LABEL_HANDLE_W - DURATION_W - TIMELINE_TRACK_MIN_W
    );
  }, []);

  useEffect(() => {
    const clampLabelWidth = () => {
      setLabelWidth((prev) => Math.min(prev, getMaxLabelWidth()));
    };

    clampLabelWidth();
    window.addEventListener("resize", clampLabelWidth);
    return () => window.removeEventListener("resize", clampLabelWidth);
  }, [getMaxLabelWidth]);

  const handleLabelResizeStart = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const startX = event.clientX;
    const startWidth = labelWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(
        Math.max(startWidth + delta, LABEL_W_MIN),
        getMaxLabelWidth()
      );
      setLabelWidth(nextWidth);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  }, [getMaxLabelWidth, labelWidth]);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="shrink-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-subtle)]">
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        }
        <Timer className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="text-xs font-semibold text-[var(--color-text-strong)]">타임라인</span>
        {totalDurationSec > 0 && (
          <span className="text-2xs text-[var(--color-text-soft)]">총 {fmtSec(totalDurationSec)}</span>
        )}
        <div className="flex-1" />
        {rows.length > 0 && (
          <span className="text-2xs text-[var(--color-text-soft)]">{rows.length}개 노드</span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-[var(--color-text-soft)]">
            파이프라인 정의 없음
          </div>
        ) : (
          // 이유: flex-col로 눈금자(고정)와 데이터 행(스크롤)을 분리해 눈금자가 스크롤되지 않도록 한다.
          <div ref={contentRef} className="flex flex-col overflow-hidden" style={{ height }}>
            {/* 눈금자 행: 스크롤 영역 밖에 고정 */}
            <div className="flex h-7 shrink-0 items-end border-b border-[var(--color-border-subtle)] pb-1">
              <div className="shrink-0" style={{ width: labelWidth }} />
              <button
                type="button"
                aria-label="타임라인 레이블 너비 조절"
                className="group relative shrink-0 cursor-col-resize self-stretch border-r border-[var(--color-border-subtle)] hover:bg-[var(--color-brand-50)]"
                style={{ width: LABEL_HANDLE_W }}
                onMouseDown={handleLabelResizeStart}
              >
                <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-[var(--color-neutral-300)] group-hover:bg-[var(--color-brand-400)]" />
              </button>
              <div className="relative flex-1 px-1">
                {ticks.map((tick) => (
                  <div
                    key={tick.sec}
                    className="absolute bottom-0 flex flex-col items-center"
                    style={{ left: `${tick.percent}%`, transform: "translateX(-50%)" }}
                  >
                    <span className="tabular-nums text-[10px] leading-none text-[var(--color-text-soft)]">
                      {tick.label}
                    </span>
                    <div className="mt-0.5 h-1.5 w-px bg-[var(--color-neutral-300)]" />
                  </div>
                ))}
              </div>
              <div className="w-10 shrink-0" />
            </div>

            {/* 데이터 행: 독립적으로 스크롤 */}
            <div className="flex-1 overflow-y-auto">
              {rows.map((row) => (
                <CascadeRow
                  key={row.rowId}
                  row={row}
                  labelWidth={labelWidth}
                  selected={selectedRowId === row.rowId}
                  onClick={() => onBarClick?.(row.rowId, row.nodeId, row.selectedLogId, row.selectedLogType)}
                />
              ))}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
