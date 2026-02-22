import { AuthStatusCard } from "@/components/claude/auth-status-card";
import { SettingsButton } from "@/components/claude/settings-button";
import { SessionPanel } from "@/components/claude/session-panel";
import { useClaudeAuthStatus } from "@/hooks/use-claude-auth-status";

export default function MainPage() {
  const { authState, authMessage, refreshAuthStatus } = useClaudeAuthStatus();

  return (
    <>
      <header className="flex items-center justify-end gap-2">
        <AuthStatusCard authState={authState} authMessage={authMessage} onRefresh={refreshAuthStatus} />
        <SettingsButton />
      </header>
      <SessionPanel />
    </>
  );
}
