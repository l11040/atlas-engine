// 책임: 전체 앱 레이아웃 쉘 (헤더 + 컨텐츠)을 제공한다.
import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  headerLeft?: ReactNode;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function AppShell({ headerLeft, headerCenter, headerRight, children }: AppShellProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-3">{headerLeft}</div>
        <div className="flex items-center gap-2">{headerCenter}</div>
        <div className="flex items-center gap-2">
          {headerRight}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate("/settings")}>
            <Settings className="h-3.5 w-3.5" />
            설정
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
