// 책임: 하단 드로어의 열림/닫힘 상태 및 상태 텍스트를 전역 컨텍스트로 관리한다.

import { createContext, useContext } from "react";

export interface BottomDrawerContextValue {
  isOpen: boolean;
  toggle: () => void;
  statusText: string;
  setStatusText: (text: string) => void;
}

export const BottomDrawerContext = createContext<BottomDrawerContextValue>({
  isOpen: false,
  toggle: () => {},
  statusText: "",
  setStatusText: () => {},
});

// 목적: 하위 컴포넌트에서 드로어 상태에 접근할 수 있게 한다.
export function useBottomDrawer(): BottomDrawerContextValue {
  return useContext(BottomDrawerContext);
}
