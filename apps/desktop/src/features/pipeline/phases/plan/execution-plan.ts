// 책임: Todo 의존성 그래프를 분석하여 병렬/직렬 실행 계획(wave)을 생성한다.
// wave 내 Todo들은 병렬 실행 가능하고, wave 간에는 직렬 순서를 따른다.

import type { TodoItem } from "@shared/ipc";

export interface ExecutionWave {
  /** wave 순번 (0부터 시작) */
  index: number;
  /** 이 wave에 속하는 todo ID 목록 (병렬 실행 가능) */
  todoIds: string[];
}

export interface ExecutionPlan {
  /** 실행 순서대로 정렬된 wave 목록 */
  waves: ExecutionWave[];
  /** todoId → wave index 빠른 조회 */
  todoWaveMap: Map<string, number>;
}

// 목적: deps 기반 위상 정렬로 Todo를 wave 단위로 그룹화한다.
// 이유: deps가 모두 완료된 Todo끼리 같은 wave에 배치하면 병렬 실행이 가능하다.
export function buildExecutionPlan(todos: TodoItem[]): ExecutionPlan {
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const todoWaveMap = new Map<string, number>();
  const waves: ExecutionWave[] = [];

  // 주의: 존재하지 않는 dep ID는 무시한다 (외부 의존성이 이미 완료된 것으로 간주).
  const getValidDeps = (todo: TodoItem): string[] =>
    todo.deps.filter((depId) => todoMap.has(depId));

  let remaining = new Set(todos.map((t) => t.id));
  let waveIndex = 0;

  while (remaining.size > 0) {
    const waveIds: string[] = [];

    for (const todoId of remaining) {
      const todo = todoMap.get(todoId)!;
      const deps = getValidDeps(todo);
      const allDepsPlaced = deps.every((depId) => placed.has(depId));
      if (allDepsPlaced) {
        waveIds.push(todoId);
      }
    }

    // 주의: 순환 의존성이 있으면 진행 불가 — 남은 Todo를 마지막 wave에 강제 배치한다.
    if (waveIds.length === 0) {
      const forcedIds = [...remaining];
      waves.push({ index: waveIndex, todoIds: forcedIds });
      for (const id of forcedIds) {
        todoWaveMap.set(id, waveIndex);
      }
      break;
    }

    waves.push({ index: waveIndex, todoIds: waveIds });
    for (const id of waveIds) {
      placed.add(id);
      remaining.delete(id);
      todoWaveMap.set(id, waveIndex);
    }
    waveIndex++;
  }

  return { waves, todoWaveMap };
}
