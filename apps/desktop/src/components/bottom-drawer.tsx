// 책임: 하단 고정 리사이즈 드로어를 제공한다. Cmd+J로 토글, 드래그로 높이 조절 가능.

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  BottomDrawerContext,
  useBottomDrawer,
} from "@/hooks/use-bottom-drawer";

const STORAGE_KEY_HEIGHT = "atlas:drawer-height";
const STATUS_BAR_HEIGHT = 32;
const DRAG_HANDLE_HEIGHT = 12;
const DEFAULT_HEIGHT = 250;
const MIN_HEIGHT = 120;
const MAX_VH_RATIO = 0.6;

function loadHeight(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY_HEIGHT);
    if (v) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= MIN_HEIGHT) return n;
    }
  } catch { /* noop */ }
  return DEFAULT_HEIGHT;
}

function saveHeight(h: number): void {
  try { localStorage.setItem(STORAGE_KEY_HEIGHT, String(Math.round(h))); } catch { /* noop */ }
}

interface BottomDrawerProviderProps {
  children: ReactNode;
}

// 목적: 드로어 상태를 전역 컨텍스트로 내려준다.
export function BottomDrawerProvider({ children }: BottomDrawerProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [statusText, setStatusText] = useState("");

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <BottomDrawerContext.Provider
      value={{ isOpen, toggle, statusText, setStatusText }}
    >
      {children}
    </BottomDrawerContext.Provider>
  );
}

interface BottomDrawerProps {
  /** 목적: 인디케이터 점 애니메이션 여부 (실행 중일 때 true) */
  isRunning?: boolean;
  children: ReactNode;
}

// 이유: isOpen/toggle/statusText는 컨텍스트에서 가져와 props 중복을 줄인다.
export function BottomDrawer({
  isRunning = false,
  children,
}: BottomDrawerProps) {
  const { isOpen, toggle: onToggle, statusText } = useBottomDrawer();
  const [height, setHeight] = useState(loadHeight);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

  // 목적: Cmd+J 단축키로 드로어를 토글한다.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "j") {
        e.preventDefault();
        onToggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggle]);

  // 목적: 드래그로 드로어 높이를 조절한다.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;

      function onMouseMove(ev: MouseEvent) {
        if (!dragging.current) return;
        const maxHeight = window.innerHeight * MAX_VH_RATIO;
        // 이유: 위로 드래그하면 clientY가 줄어들므로 차이를 더해 높이를 늘린다.
        const newHeight = Math.min(
          maxHeight,
          Math.max(MIN_HEIGHT, startHeight.current + (startY.current - ev.clientY))
        );
        setHeight(newHeight);
      }

      function onMouseUp() {
        dragging.current = false;
        // 목적: 드래그 종료 시 높이를 localStorage에 저장한다.
        saveHeight(startHeight.current + (startY.current - (window.event as MouseEvent)?.clientY || 0));
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height]
  );

  // 목적: 높이 변경 시 localStorage에 저장한다.
  useEffect(() => {
    if (!dragging.current) saveHeight(height);
  }, [height]);

  // 이유: 드래그 핸들 + 상태 바 높이를 제외한 순수 콘텐츠 영역 높이를 계산한다.
  const contentHeight = height;
  const totalHeight = isOpen ? contentHeight + STATUS_BAR_HEIGHT + DRAG_HANDLE_HEIGHT : STATUS_BAR_HEIGHT;

  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-[var(--z-sticky)] flex flex-col bg-surface-base"
      style={{ height: totalHeight }}
    >
      {/* 목적: 확장 시 상단 그림자 + 드래그 핸들을 표시한다 */}
      {isOpen && (
        <div
          className="group flex shrink-0 cursor-row-resize items-center justify-center border-t border-border-subtle py-1 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
          style={{ height: DRAG_HANDLE_HEIGHT }}
          onMouseDown={handleMouseDown}
        >
          <div className="h-[3px] w-8 rounded-full bg-neutral-300 transition-colors group-hover:bg-neutral-400" />
        </div>
      )}

      {/* 상태 바 */}
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between px-4"
        style={{ height: STATUS_BAR_HEIGHT }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isRunning
                ? "animate-pulse bg-status-success"
                : "bg-neutral-300"
            }`}
          />
          <span className="select-none text-xs text-text-soft">
            {statusText || "대기 중"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="select-none rounded border border-border-subtle px-1.5 py-0.5 text-2xs text-text-soft">
            ⌘J
          </span>
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-text-soft transition-colors hover:text-text-strong"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 목적: 확장 시 children 콘텐츠를 남은 공간에 꽉 채운다 */}
      {isOpen && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
