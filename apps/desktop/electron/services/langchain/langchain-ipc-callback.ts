// 책임: LangChain 콜백 이벤트를 FlowEvent로 변환하여 렌더러로 전달한다.

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import type { Serialized } from "@langchain/core/load/serializable";
import type { FlowEvent } from "../../../shared/ipc";

export type FlowEventEmitter = (event: FlowEvent) => void;

export class IpcFlowCallbackHandler extends BaseCallbackHandler {
  name = "ipc-flow-callback";

  private flowId: string;
  private emit: FlowEventEmitter;

  constructor(flowId: string, emit: FlowEventEmitter) {
    super();
    this.flowId = flowId;
    this.emit = emit;
  }

  handleLLMStart(_llm: Serialized, prompts: string[], runId: string): void {
    this.emit({
      flowId: this.flowId,
      type: "node-start",
      nodeId: runId,
      nodeName: "LLM",
      input: prompts[0] ?? "",
      timestamp: Date.now()
    });
  }

  handleLLMNewToken(token: string, _idx: { prompt: number; completion: number }, runId: string): void {
    this.emit({
      flowId: this.flowId,
      type: "node-stream",
      nodeId: runId,
      chunk: token,
      timestamp: Date.now()
    });
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const text = output.generations[0]?.[0]?.text ?? "";
    this.emit({
      flowId: this.flowId,
      type: "node-end",
      nodeId: runId,
      output: text,
      timestamp: Date.now()
    });
  }

  handleLLMError(err: Error, runId: string): void {
    this.emit({
      flowId: this.flowId,
      type: "node-error",
      nodeId: runId,
      error: err.message,
      timestamp: Date.now()
    });
  }
}
