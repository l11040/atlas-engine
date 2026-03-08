// 책임: Todo 실행 그래프의 상태 스키마를 정의한다.
// 이유: v2.3 아키텍처의 WorkOrder-Evidence-Traceability 3축을 반영한다.

import { Annotation } from "@langchain/langgraph";
import type {
  ActivityLogEntry,
  ContextPack,
  Evidence,
  ImplReport,
  TodoFlowPhase,
  TodoItem,
  WorkOrder,
  WorkOrderMode
} from "../../../../../shared/ipc";

export type { Evidence, ContextPack, ImplReport } from "../../../../../shared/ipc";

export const TodoExecutionAnnotation = Annotation.Root({
  // 입력: 실행 대상 Todo와 티켓 컨텍스트
  todo: Annotation<TodoItem>,
  jiraKey: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  mode: Annotation<WorkOrderMode>({ reducer: (_, v) => v, default: () => "standard" }),
  cwd: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),

  // 현재 플로우 단계
  phase: Annotation<TodoFlowPhase>({ reducer: (_, v) => v, default: () => "workorder" }),

  // workorder 단계 산출물
  workOrder: Annotation<WorkOrder | null>({ reducer: (_, v) => v, default: () => null }),

  // explore 단계 산출물
  contextPack: Annotation<ContextPack | null>({ reducer: (_, v) => v, default: () => null }),

  // execute 단계 산출물
  implReport: Annotation<ImplReport | null>({ reducer: (_, v) => v, default: () => null }),

  // verify 단계 산출물
  evidence: Annotation<Evidence | null>({ reducer: (_, v) => v, default: () => null }),

  // dod 단계 결과
  dodResult: Annotation<"pass" | "fail" | null>({ reducer: (_, v) => v, default: () => null }),
  dodReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),

  // 최종 상태
  finalVerdict: Annotation<"done" | "retry" | "hold" | null>({ reducer: (_, v) => v, default: () => null }),
  error: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),

  activityLog: Annotation<ActivityLogEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  })
});

export type TodoExecutionState = typeof TodoExecutionAnnotation.State;
