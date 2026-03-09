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

const STATUS_BAR_HEIGHT = 32;
const DEFAULT_HEIGHT = 250;
const MIN_HEIGHT = 120;
const MAX_VH_RATIO = 0.6;

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
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
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
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height]
  );

  const totalHeight = isOpen ? height + STATUS_BAR_HEIGHT : STATUS_BAR_HEIGHT;

  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-[var(--z-sticky)] flex flex-col bg-surface-base transition-[height] duration-200 ease-[var(--easing-standard)]"
      style={{ height: totalHeight }}
    >
      {/* 목적: 확장 시 상단 그림자 + 드래그 핸들을 표시한다 */}
      {isOpen && (
        <div
          className="group flex cursor-row-resize items-center justify-center border-t border-border-subtle py-1 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
          onMouseDown={handleMouseDown}
        >
          <div className="h-[3px] w-8 rounded-full bg-neutral-300 transition-colors group-hover:bg-neutral-400" />
        </div>
      )}

      {/* 상태 바 */}
      <div
        className="flex h-8 shrink-0 cursor-pointer items-center justify-between border-t border-border-subtle px-4"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {/* 인디케이터 점 */}
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

      {/* 목적: 확장 시 children 콘텐츠를 표시한다 */}
      {isOpen && (
        <div className="flex-1 overflow-auto px-4 py-2" style={{ height }}>
          {children}
        </div>
      )}
    </div>
  );
}
