/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AppLayout } from "@/components/app-layout";

// 이유: Electron은 file:// 프로토콜을 사용하므로 BrowserRouter 대신 HashRouter를 사용한다.
const PipelinePage = lazy(() => import("@/pages/pipeline-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));

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
            <PipelinePage />
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
      }
    ]
  }
]);
