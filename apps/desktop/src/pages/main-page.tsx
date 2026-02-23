import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthStatusCard } from "@/features/session/components/auth-status-card";
import { TicketSummaryCard } from "@/features/pipeline/components/ticket-summary-card";
import type { AppSettings } from "@shared/ipc";

export default function MainPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.atlas.getConfig().then(setSettings);
  }, []);

  return (
    <>
      <header className="flex items-center justify-end gap-2">
        <AuthStatusCard />
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate("/settings")}>
          <Settings className="h-3.5 w-3.5" />
          설정
        </Button>
      </header>

      {settings?.ticket ? (
        <TicketSummaryCard ticket={settings.ticket} pipeline={settings.pipeline} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-subtle py-12">
          <p className="text-xs text-text-muted">등록된 티켓이 없습니다</p>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/settings")}>
            <Settings className="h-3.5 w-3.5" />
            설정에서 티켓 등록
          </Button>
        </div>
      )}
    </>
  );
}
