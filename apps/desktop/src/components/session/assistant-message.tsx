import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionStatus } from "@/hooks/use-cli-session";

interface AssistantMessageProps {
  text: string;
  status: SessionStatus;
}

export function AssistantMessage({ text, status }: AssistantMessageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 목적: 스트리밍 중 텍스트가 추가될 때마다 하단으로 스크롤한다.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [text]);

  if (!text && status !== "running") return null;

  return (
    <div
      ref={scrollRef}
      className="max-h-[400px] overflow-y-auto rounded-xs border border-border-subtle bg-surface-base p-3"
    >
      {text ? (
        <div className="prose prose-sm prose-neutral max-w-none break-words text-text-muted prose-headings:text-text-strong prose-headings:font-semibold prose-p:my-1.5 prose-pre:bg-surface-subtle prose-pre:text-text-muted prose-code:text-text-strong prose-code:before:content-none prose-code:after:content-none prose-a:text-status-info prose-li:my-0.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <span className="text-xs text-text-soft">응답 대기 중...</span>
      )}
      {status === "running" && (
        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-text-muted align-text-bottom" />
      )}
    </div>
  );
}
