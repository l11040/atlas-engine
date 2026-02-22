// 책임: 작업 디렉토리의 git diff를 실행하고 파일별 구조화된 데이터로 파싱한다.

import { spawn } from "node:child_process";
import type {
  GitDiffResponse,
  GitDiffFileEntry,
  GitDiffHunk,
  GitDiffLine
} from "../../../shared/ipc";

// 목적: paths가 주어지면 해당 파일만, 없으면 전체 diff를 반환한다.
export function getGitDiff(cwd: string, paths?: string[]): Promise<GitDiffResponse> {
  return new Promise((resolve) => {
    // 주의: --no-color 플래그로 ANSI 코드 혼입을 방지한다.
    const args = ["diff", "HEAD", "--no-color", "--unified=3"];
    if (paths && paths.length > 0) {
      args.push("--", ...paths);
    }

    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.once("close", (exitCode) => {
      if (exitCode !== 0) {
        resolve({
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          error: stderr.trim() || `git diff exited with code ${exitCode}`
        });
        return;
      }
      resolve(parseUnifiedDiff(stdout));
    });

    child.once("error", (error) => {
      resolve({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        error: error.message
      });
    });
  });
}

// 목적: unified diff 텍스트를 파일별 구조화 데이터로 변환한다.
function parseUnifiedDiff(raw: string): GitDiffResponse {
  if (!raw.trim()) {
    return { files: [], totalAdditions: 0, totalDeletions: 0 };
  }

  const files: GitDiffFileEntry[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  // 목적: "diff --git" 경계로 파일 단위 섹션을 분리한다.
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");
    const filePath = extractFilePath(lines[0] ?? "");
    const status = detectFileStatus(lines);
    const hunks = parseHunks(lines);

    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === "addition") additions++;
        if (line.type === "deletion") deletions++;
      }
    }

    totalAdditions += additions;
    totalDeletions += deletions;

    files.push({ filePath, status, additions, deletions, hunks });
  }

  return { files, totalAdditions, totalDeletions };
}

// 목적: "a/path b/path" 헤더에서 파일 경로를 추출한다.
function extractFilePath(headerLine: string): string {
  const match = headerLine.match(/b\/(.+)/);
  return match?.[1]?.trim() ?? headerLine.trim();
}

// 목적: ---/+++ 줄 패턴으로 파일 상태(added/deleted/modified)를 판별한다.
function detectFileStatus(lines: string[]): GitDiffFileEntry["status"] {
  for (const line of lines) {
    if (line.startsWith("rename from")) return "renamed";
    if (line.startsWith("--- /dev/null")) return "added";
    if (line.startsWith("+++ /dev/null")) return "deleted";
  }
  return "modified";
}

function parseHunks(lines: string[]): GitDiffHunk[] {
  const hunks: GitDiffHunk[] = [];
  let currentHunk: GitDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // 목적: @@ 헤더에서 시작 줄번호를 추출하여 줄번호 추적에 사용한다.
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1] ?? "0", 10);
      newLine = parseInt(hunkMatch[2] ?? "0", 10);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "addition",
        content: line.slice(1),
        newLineNumber: newLine++
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "deletion",
        content: line.slice(1),
        oldLineNumber: oldLine++
      });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++
      });
    }
    // 이유: "\ No newline at end of file" 등의 메타 줄은 무시한다.
  }

  return hunks;
}
