import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AppLayout } from "@/components/app-layout";

// 이유: Electron은 file:// 프로토콜을 사용하므로 BrowserRouter 대신 HashRouter를 사용한다.
const MainPage = lazy(() => import("@/pages/main-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const TicketPage = lazy(() => import("@/pages/ticket-page"));

function PageFallback() {
  return <div className="flex items-center justify-center py-16 text-xs text-text-soft">로딩 중...</div>;
}

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: "/",
        element: (
          <Suspense fallback={<PageFallback />}>
            <MainPage />
          </Suspense>
        )
      },
      {
        path: "/settings",
        element: (
          <Suspense fallback={<PageFallback />}>
            <SettingsPage />
          </Suspense>
        )
      },
      {
        path: "/ticket/:ticketKey",
        element: (
          <Suspense fallback={<PageFallback />}>
            <TicketPage />
          </Suspense>
        )
      }
    ]
  }
]);
