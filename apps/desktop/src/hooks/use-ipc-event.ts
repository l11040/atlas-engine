// 책임: IPC push 이벤트를 구독하는 범용 훅을 제공한다.
import { useEffect, useRef } from "react";

// 목적: 렌더러에서 메인 → 렌더러 방향의 IPC 이벤트를 구독하고 cleanup을 자동화한다.
export function useIpcEvent<T>(
  subscribe: (listener: (payload: T) => void) => () => void,
  handler: (payload: T) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = subscribe((payload) => {
      handlerRef.current(payload);
    });
    return unsubscribe;
  }, [subscribe]);
}
