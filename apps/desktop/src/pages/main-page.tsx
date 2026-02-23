import { useEffect, useState } from "react";
import { AuthStatusCard } from "@/components/session/auth-status-card";
import { SettingsButton } from "@/components/session/settings-button";
import { SessionPanel } from "@/components/session/session-panel";
import type { ProviderType } from "../../shared/ipc";

export default function MainPage() {
  const [activeProvider, setActiveProvider] = useState<ProviderType>("claude");

  // 목적: 설정에서 activeProvider를 로드하여 초기값을 동기화한다.
  useEffect(() => {
    window.atlas.getConfig().then((config) => {
      setActiveProvider(config.activeProvider);
    });
  }, []);

  return (
    <>
      <header className="flex items-center justify-end gap-2">
        <AuthStatusCard />
        <SettingsButton />
      </header>
      <SessionPanel provider={activeProvider} />
    </>
  );
}
