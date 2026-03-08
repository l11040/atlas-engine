// 책임: CLI 실행 실패 정보를 포함한 도메인 에러를 제공한다.

import type { CliEvent, CliExecutionErrorParams, CliSessionStatus } from "./types";

export class CliExecutionError extends Error {
  events: CliEvent[];
  exitCode: number | null;
  stderr: string;
  status: CliSessionStatus;

  constructor(message: string, params: CliExecutionErrorParams) {
    super(message);
    this.name = "CliExecutionError";
    this.events = params.events;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
    this.status = params.status;
  }
}
