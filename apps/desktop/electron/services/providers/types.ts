// 책임: 모든 CLI provider가 구현해야 하는 공통 인터페이스를 정의한다.

import type { WebContents } from "electron";
import type {
  CliAuthCheckRequest,
  CliAuthStatusResponse,
  CliCancelRequest,
  CliCancelResponse,
  CliEvent,
  CliRunRequest,
  CliRunResponse
} from "../../../shared/ipc";

export type EmitCliEvent = (target: WebContents, event: CliEvent) => void;

export interface CliProvider {
  run(target: WebContents, request: CliRunRequest, emit: EmitCliEvent): CliRunResponse;
  cancel(target: WebContents, request: CliCancelRequest, emit: EmitCliEvent): CliCancelResponse;
  checkAuth(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse>;
}
