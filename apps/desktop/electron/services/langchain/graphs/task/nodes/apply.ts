// 책임: 승인된 변경 사항을 git commit으로 반영한다.

import { spawn } from "node:child_process";
import type { TaskGraphStateType } from "../state";
import { getSettings } from "../../../../config/settings";

// 목적: git add + git commit으로 변경 사항을 커밋한다.
export async function apply(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const cwd = settings.defaultCwd;
    const { task } = state;

    // 목적: 1단계 - 변경된 파일을 staging area에 추가한다.
    const filePaths = state.changeSets?.changes.map((c) => c.path) ?? [];
    if (filePaths.length === 0) {
      return { error: "apply 실패: 커밋할 변경 사항이 없습니다." };
    }

    await runGitCommand(cwd, ["add", ...filePaths]);

    // 목적: 2단계 - 작업 ID와 제목을 포함한 커밋 메시지로 커밋한다.
    const commitMessage = `feat(${task.id}): ${task.title}`;
    await runGitCommand(cwd, ["commit", "-m", commitMessage]);

    return {};
  } catch (err) {
    return { error: `apply 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// 목적: git 명령을 child_process로 실행하고 완료를 기다린다.
function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // 주의: shell: false로 커맨드 인젝션을 방지한다.
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });

    child.once("error", (error) => {
      reject(error);
    });
  });
}
