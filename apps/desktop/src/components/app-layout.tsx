// 책임: 라우트 Outlet을 감싸는 최소 레이아웃을 제공한다.
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return <Outlet />;
}
