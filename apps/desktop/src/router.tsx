import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";

// 이유: Electron은 file:// 프로토콜을 사용하므로 BrowserRouter 대신 HashRouter를 사용한다.
const MainPage = lazy(() => import("@/pages/main-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));

function PageFallback() {
  return <div className="flex items-center justify-center py-16 text-xs text-text-soft">로딩 중...</div>;
}

export const router = createHashRouter([
  {
    path: "/",
    element: (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
        <Suspense fallback={<PageFallback />}>
          <MainPage />
        </Suspense>
      </main>
    )
  },
  {
    path: "/settings",
    element: (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
        <Suspense fallback={<PageFallback />}>
          <SettingsPage />
        </Suspense>
      </main>
    )
  }
]);
