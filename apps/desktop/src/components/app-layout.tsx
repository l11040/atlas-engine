// 책임: 전역 헤더(좌측 페이지별 네비게이션 + 우측 인증·설정)를 모든 페이지에 고정 표시한다.

import { createContext, useContext, useState, type ReactNode } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthStatusCard } from "@/features/session/components/auth-status-card";
import { BottomDrawerProvider } from "@/components/bottom-drawer";

type HeaderLeftSetter = (node: ReactNode) => void;
const HeaderLeftContext = createContext<HeaderLeftSetter>(() => {});

// 목적: 페이지 컴포넌트가 헤더 좌측 영역(뒤로가기 + 타이틀)을 설정할 수 있게 한다.
export function useHeaderLeft(): HeaderLeftSetter {
  return useContext(HeaderLeftContext);
}

export function AppLayout() {
  const navigate = useNavigate();
  const [leftContent, setLeftContent] = useState<ReactNode>(null);

  return (
    <BottomDrawerProvider>
      <HeaderLeftContext.Provider value={setLeftContent}>
        {/* 이유: 하단 드로어 상태 바(32px) 공간을 확보하기 위해 pb-10을 추가한다. */}
        <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4 pb-10">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">{leftContent}</div>
            <div className="flex items-center gap-2">
              <AuthStatusCard />
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate("/settings")}>
                <Settings className="h-3.5 w-3.5" />
                설정
              </Button>
            </div>
          </header>
          <Outlet />
        </main>
      </HeaderLeftContext.Provider>
    </BottomDrawerProvider>
  );
}
