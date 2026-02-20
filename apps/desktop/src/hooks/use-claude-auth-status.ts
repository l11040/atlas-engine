// 책임: Claude CLI 인증 상태 조회 및 갱신을 관리한다.
import { useEffect, useRef, useState } from "react";
import type { ClaudeAuthStatusResponse } from "../../shared/ipc";

type AuthViewState = "checking" | ClaudeAuthStatusResponse["status"];

export function useClaudeAuthStatus() {
  const [authState, setAuthState] = useState<AuthViewState>("checking");
  const [authMessage, setAuthMessage] = useState("Claude 로그인 상태를 확인하고 있습니다...");
  // 이유: React Strict Mode 개발 환경에서 초기 effect가 2회 실행될 수 있다.
  const didInitAuthCheckRef = useRef(false);

  async function refreshAuthStatus() {
    setAuthState("checking");
    setAuthMessage("Claude 로그인 상태를 확인하고 있습니다...");

    try {
      const result = await window.atlas.getClaudeAuthStatus();
      setAuthState(result.status);
      setAuthMessage(result.message);
    } catch (error) {
      setAuthState("error");
      setAuthMessage(error instanceof Error ? error.message : "Claude 인증 상태 확인에 실패했습니다.");
    }
  }

  useEffect(() => {
    // 목적: 마운트 시 인증 상태 조회를 1회만 실행한다.
    if (didInitAuthCheckRef.current) return;
    didInitAuthCheckRef.current = true;
    void refreshAuthStatus();
  }, []);

  return {
    authState,
    authMessage,
    refreshAuthStatus
  };
}
