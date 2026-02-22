import { AuthStatusCard } from "@/components/claude/auth-status-card";
import { SessionPanel } from "@/components/claude/session-panel";
import { useClaudeAuthStatus } from "@/hooks/use-claude-auth-status";

export default function App() {
  const { authState, authMessage, refreshAuthStatus } = useClaudeAuthStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-center justify-end">
        <AuthStatusCard authState={authState} authMessage={authMessage} onRefresh={refreshAuthStatus} />
      </header>
      <SessionPanel />
    </main>
  );
}
