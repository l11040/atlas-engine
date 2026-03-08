// 책임: Ticket → Todo 서브그래프의 상태 스키마를 정의한다.

import { Annotation } from "@langchain/langgraph";
import type {
  Ticket,
  TodoItem,
  PipelinePhase,
  ActivityLogEntry
} from "../../../../../shared/ipc";

export const TicketToTodoAnnotation = Annotation.Root({
  ticket: Annotation<Ticket>,
  phase: Annotation<PipelinePhase>({ reducer: (_, v) => v, default: () => "idle" }),
  dorFormalResult: Annotation<"pass" | "hold">({ reducer: (_, v) => v, default: () => "pass" }),
  dorFormalReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  dorSemanticResult: Annotation<"proceed" | "hold">({ reducer: (_, v) => v, default: () => "proceed" }),
  dorSemanticReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  todos: Annotation<TodoItem[]>({ reducer: (_, v) => v, default: () => [] }),
  holdReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  activityLog: Annotation<ActivityLogEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  })
});

export type TicketToTodoState = typeof TicketToTodoAnnotation.State;
