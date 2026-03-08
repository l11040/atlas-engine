// 책임: CLI를 LangChain LLM으로 래핑하여 prompt → response 인터페이스를 제공한다.

import { LLM, type BaseLLMParams } from "@langchain/core/language_models/llms";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { runCliToCompletion, type CliEvent, type CliPermissionMode, type ProviderType } from "@atlas/cli-runtime";

export interface CliLlmParams extends BaseLLMParams {
  provider: ProviderType;
  cwd: string;
  permissionMode?: CliPermissionMode;
  timeoutMs?: number;
  /** 목적: CLI 에이전트의 도구 사용 허용 여부. */
  allowTools?: boolean;
}

export class CliLlm extends LLM {
  provider: ProviderType;
  cwd: string;
  permissionMode: CliPermissionMode;
  timeoutMs: number;
  allowTools: boolean;

  constructor(params: CliLlmParams) {
    super(params);
    this.provider = params.provider;
    this.cwd = params.cwd;
    this.permissionMode = params.permissionMode ?? "auto";
    this.timeoutMs = params.timeoutMs ?? 300_000;
    this.allowTools = params.allowTools ?? false;
  }

  _llmType(): string {
    return "cli-llm";
  }

  async invokeWithEvents(prompt: string): Promise<{ text: string; events: CliEvent[] }> {
    const events = await runCliToCompletion({
      provider: this.provider,
      prompt,
      cwd: this.cwd,
      permissionMode: this.permissionMode,
      timeoutMs: this.timeoutMs,
      allowTools: this.allowTools
    });

    let text = "";
    for (const event of events) {
      if (event.phase === "text") {
        text += event.text;
      }
    }

    return { text, events };
  }

  // 목적: CLI를 실행하고 text phase 이벤트만 수집하여 응답 문자열로 반환한다.
  async _call(
    prompt: string,
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const { text, events } = await this.invokeWithEvents(prompt);

    for (const event of events) {
      if (event.phase === "text") {
        // 목적: LangChain 콜백 매니저에 토큰 단위 이벤트를 전달한다.
        await runManager?.handleLLMNewToken(event.text);
      }
    }

    return text;
  }
}
