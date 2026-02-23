import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SessionStatus } from "@/hooks/use-cli-session";

interface PromptInputProps {
  status: SessionStatus;
  /** 프롬프트 제출 시 호출. cwd가 비어있으면 undefined */
  onSubmit: (prompt: string, cwd?: string) => void;
  onCancel: () => void;
}

export function PromptInput({ status, onSubmit, onCancel }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState("");

  const isRunning = status === "running";
  const canSubmit = !isRunning && prompt.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(prompt.trim(), cwd.trim() || undefined);
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="작업 디렉토리 (예: /Users/you/project)"
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
      />
      <Textarea
        className="resize-none"
        placeholder="코드 수정 요청을 입력하세요..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={!canSubmit} size="sm">
          실행
        </Button>
        <Button onClick={onCancel} disabled={!isRunning} variant="outline" size="sm">
          취소
        </Button>
      </div>
    </div>
  );
}
