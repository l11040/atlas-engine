// 책임: provider/권한 설정을 실제 CLI 명령행 인자로 변환한다.

import type { CliSpawnOptions } from "./types";

export interface CliCommand {
  command: string;
  args: string[];
  stdinPayload?: string;
}

const DEFAULT_MAX_ARG_PROMPT_LENGTH = 12_000;

function shouldUseStdin(options: Pick<CliSpawnOptions, "prompt" | "promptTransport" | "maxArgPromptLength">): boolean {
  if (options.promptTransport === "stdin") return true;
  if (options.promptTransport === "argv") return false;
  const limit = options.maxArgPromptLength ?? DEFAULT_MAX_ARG_PROMPT_LENGTH;
  return options.prompt.length > limit;
}

// 목적: provider에 따라 CLI 실행 명령어와 인자를 결정한다.
export function buildCliCommand(
  options: Pick<CliSpawnOptions,
    "provider" | "prompt" | "permissionMode" | "allowTools" | "outputFormat" | "conversation" | "promptTransport" | "maxArgPromptLength">
): CliCommand {
  const useStdin = shouldUseStdin(options);
  const conversation = options.conversation ?? {};
  const mode = conversation.mode ?? "new";

  if (options.provider === "claude") {
    const format = options.outputFormat ?? "stream-json";
    const args = [
      "-p",
      "--output-format", format,
      "--verbose",
      // 목적: 토큰 단위 실시간 스트리밍을 활성화한다. stream-json에서만 동작한다.
      "--include-partial-messages",
      "--permission-mode", options.permissionMode === "auto" ? "bypassPermissions" : "default"
    ];

    if (conversation.ephemeral) {
      args.push("--no-session-persistence");
    }

    if (mode === "continue-last") {
      args.push("--continue");
    } else if (mode === "resume-id") {
      if (!conversation.sessionId) {
        throw new Error("conversation.mode=resume-id requires conversation.sessionId");
      }
      args.push("--resume", conversation.sessionId);
    } else if (conversation.sessionId) {
      args.push("--session-id", conversation.sessionId);
    }

    if (conversation.forkOnResume && mode !== "new") {
      args.push("--fork-session");
    }

    // 목적: 기본값은 안전하게 도구 사용 차단, 실행 맥락에서만 명시적으로 허용한다.
    if (!options.allowTools) {
      args.push("--allowedTools", "");
    }

    if (useStdin) {
      args.push("--input-format", "text");
      return { command: "claude", args, stdinPayload: options.prompt };
    }

    args.push(options.prompt);
    return { command: "claude", args };
  }

  const args = ["exec"];
  if (mode === "continue-last") {
    args.push("resume", "--last");
  } else if (mode === "resume-id") {
    if (!conversation.sessionId) {
      throw new Error("conversation.mode=resume-id requires conversation.sessionId");
    }
    args.push("resume", conversation.sessionId);
  }

  args.push("--json", "--skip-git-repo-check");

  if (conversation.ephemeral) {
    args.push("--ephemeral");
  }

  // 주의: codex exec는 --ask-for-approval를 제거했다. auto 모드는 --full-auto로 대체한다.
  if (options.permissionMode === "auto") {
    args.push("--full-auto");
  }
  args.push("--sandbox", options.allowTools === false ? "read-only" : "workspace-write");

  if (useStdin) {
    // 주의: Codex exec는 prompt 인자에 "-"를 주면 stdin에서 프롬프트를 읽는다.
    args.push("-");
    return { command: "codex", args, stdinPayload: options.prompt };
  }

  args.push(options.prompt);

  return { command: "codex", args };
}
