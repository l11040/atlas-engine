import { AuthStatusCard } from "@/components/claude/auth-status-card";
import { useClaudeAuthStatus } from "@/hooks/use-claude-auth-status";

export default function App() {
  const { authState, authMessage, refreshAuthStatus } = useClaudeAuthStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-end p-4">
      <AuthStatusCard authState={authState} authMessage={authMessage} onRefresh={refreshAuthStatus} />
    </main>
  );
}
