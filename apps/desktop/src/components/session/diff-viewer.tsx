import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import type { GitDiffResponse, GitDiffFileEntry } from "../../../shared/ipc";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  diff: GitDiffResponse;
}

// 목적: 파일 상태별 Badge 스타일을 매핑한다.
const STATUS_LABELS: Record<GitDiffFileEntry["status"], { text: string; className: string }> = {
  added: {
    text: "추가",
    className: "border-transparent bg-diff-addition-bg text-diff-addition-text hover:bg-diff-addition-bg"
  },
  modified: {
    text: "수정",
    className: "border-transparent bg-diff-modified-bg text-diff-modified-text hover:bg-diff-modified-bg"
  },
  deleted: {
    text: "삭제",
    className: "border-transparent bg-diff-deletion-bg text-diff-deletion-text hover:bg-diff-deletion-bg"
  },
  renamed: {
    text: "이름변경",
    className: "border-transparent bg-diff-hunk-bg text-diff-hunk-text hover:bg-diff-hunk-bg"
  }
};

function DiffFileEntry({ file }: { file: GitDiffFileEntry }) {
  const statusMeta = STATUS_LABELS[file.status];

  return (
    <Collapsible className="border-b border-border-subtle last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
        <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />

        <Badge className={cn("shrink-0 text-2xs py-0", statusMeta.className)}>{statusMeta.text}</Badge>

        <span className="truncate font-mono text-xs text-text-strong">{file.filePath}</span>

        <span className="ml-auto flex shrink-0 gap-1.5 text-2xs font-semibold">
          <span className="text-diff-addition-text">+{file.additions}</span>
          <span className="text-diff-deletion-text">-{file.deletions}</span>
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="overflow-x-auto bg-surface-subtle px-1 pb-2 font-mono text-2xs leading-relaxed">
          {file.hunks.map((hunk, hi) => (
            <div key={hi} className="mt-1">
              <div className="rounded bg-diff-hunk-bg px-2 py-0.5 text-diff-hunk-text">{hunk.header}</div>
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={cn(
                    "flex px-2",
                    line.type === "addition" && "bg-diff-addition-bg text-diff-addition-text",
                    line.type === "deletion" && "bg-diff-deletion-bg text-diff-deletion-text",
                    line.type === "context" && "text-text-soft"
                  )}
                >
                  <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-diff-line-number">
                    {line.oldLineNumber ?? ""}
                  </span>
                  <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-diff-line-number">
                    {line.newLineNumber ?? ""}
                  </span>
                  <span className="mr-1 shrink-0 select-none">
                    {line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{line.content}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (diff.files.length === 0 && !diff.error) {
    return (
      <div className="rounded-xs border border-border-subtle bg-surface-base p-4 text-center text-xs text-text-soft">
        변경된 파일이 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xs border border-border-subtle bg-surface-base">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-subtle px-3 py-2">
        <span className="text-xs font-semibold text-text-strong">Git Diff</span>
        <Badge variant="outline" className="text-2xs py-0">
          {diff.files.length}개 파일
        </Badge>
        <span className="text-2xs font-semibold text-diff-addition-text">+{diff.totalAdditions}</span>
        <span className="text-2xs font-semibold text-diff-deletion-text">-{diff.totalDeletions}</span>
        {diff.error && <span className="ml-auto text-2xs text-status-danger">{diff.error}</span>}
      </div>

      {diff.files.map((file) => (
        <DiffFileEntry key={file.filePath} file={file} />
      ))}
    </div>
  );
}
