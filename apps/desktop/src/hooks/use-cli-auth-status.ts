// 책임: 지정된 CLI provider의 인증 상태 조회 및 갱신을 관리한다.
import { useEffect, useRef, useState } from "react";
import type { CliAuthStatusResponse, ProviderType } from "../../shared/ipc";

type AuthViewState = "checking" | CliAuthStatusResponse["status"];

// 목적: provider 이름에 맞는 기본 확인 중 메시지를 반환한다.
function checkingMessage(provider: ProviderType): string {
  const label = provider === "claude" ? "Claude" : "Codex";
  return `${label} 로그인 상태를 확인하고 있습니다...`;
}

export function useCliAuthStatus(provider: ProviderType) {
  const [authState, setAuthState] = useState<AuthViewState>("checking");
  const [authMessage, setAuthMessage] = useState(checkingMessage(provider));
  // 이유: React Strict Mode 개발 환경에서 초기 effect가 2회 실행될 수 있다.
  const didInitAuthCheckRef = useRef(false);

  async function refreshAuthStatus() {
    setAuthState("checking");
    setAuthMessage(checkingMessage(provider));

    try {
      const result = await window.atlas.getCliAuthStatus({ provider });
      setAuthState(result.status);
      setAuthMessage(result.message);
    } catch (error) {
      setAuthState("error");
      setAuthMessage(error instanceof Error ? error.message : "인증 상태 확인에 실패했습니다.");
    }
  }

  // 목적: provider가 바뀌면 인증 상태를 다시 조회한다.
  useEffect(() => {
    if (didInitAuthCheckRef.current) return;
    didInitAuthCheckRef.current = true;
    void refreshAuthStatus();

    return () => {
      didInitAuthCheckRef.current = false;
    };
  }, [provider]);

  return {
    authState,
    authMessage,
    refreshAuthStatus
  };
}
