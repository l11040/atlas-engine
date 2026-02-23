// 책임: CLI를 LangChain LLM으로 래핑하여 prompt → response 인터페이스를 제공한다.

import { LLM, type BaseLLMParams } from "@langchain/core/language_models/llms";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { CliPermissionMode, ProviderType } from "../../../shared/ipc";
import { runCliToCompletion } from "./cli-spawn-runner";

export interface CliLlmParams extends BaseLLMParams {
  provider: ProviderType;
  cwd: string;
  permissionMode?: CliPermissionMode;
  timeoutMs?: number;
}

export class CliLlm extends LLM {
  provider: ProviderType;
  cwd: string;
  permissionMode: CliPermissionMode;
  timeoutMs: number;

  constructor(params: CliLlmParams) {
    super(params);
    this.provider = params.provider;
    this.cwd = params.cwd;
    this.permissionMode = params.permissionMode ?? "auto";
    this.timeoutMs = params.timeoutMs ?? 300_000;
  }

  _llmType(): string {
    return "cli-llm";
  }

  // 목적: CLI를 실행하고 text phase 이벤트만 수집하여 응답 문자열로 반환한다.
  async _call(
    prompt: string,
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const events = await runCliToCompletion({
      provider: this.provider,
      prompt,
      cwd: this.cwd,
      permissionMode: this.permissionMode,
      timeoutMs: this.timeoutMs
    });

    let result = "";

    for (const event of events) {
      if (event.phase === "text") {
        result += event.text;
        // 목적: LangChain 콜백 매니저에 토큰 단위 이벤트를 전달한다.
        await runManager?.handleLLMNewToken(event.text);
      }
    }

    return result;
  }
}
