// 책임: Todo별 실행 상태의 메모리 캐시와 폴더-per-Todo 디스크 영속화를 관리한다.
// 이유: 앱 재시작 시 상태를 복원하고, 노드별 artifact JSON을 개별 저장하여 중간 재시작을 지원한다.

import { app } from "electron";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActivityLogEntry,
  TodoFlowBackendState,
  TodoFlowPhase,
  TodoFlowStatus,
  TodoFlowStepState
} from "../../../shared/ipc";

// ─── 파일별 타입 정의 ───────────────────────────────────

interface ActivePointer {
  activeTodoIds: string[];
}

interface MetaFile {
  todoId: string;
  status: TodoFlowStatus;
  currentPhase: TodoFlowPhase | null;
  finalVerdict: "done" | "retry" | "hold" | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

interface DodFile {
  dodResult: "pass" | "fail";
  dodReason: string;
}

// 목적: phase 이름을 artifact 파일 이름에 매핑한다.
const PHASE_TO_ARTIFACT: Record<TodoFlowPhase, string> = {
  workorder: "workorder.json",
  explore: "context-pack.json",
  execute: "impl-report.json",
  verify: "evidence.json",
  dod: "dod.json"
};

const FLOW_PHASES: TodoFlowPhase[] = ["workorder", "explore", "execute", "verify", "dod"];

function createInitialSteps(): TodoFlowStepState[] {
  return FLOW_PHASES.map((phase) => ({
    phase,
    status: "idle" as TodoFlowStatus,
    startedAt: null,
    endedAt: null,
    result: null,
    error: null
  }));
}

// ─── TodoFlowStateStore ─────────────────────────────────

export class TodoFlowStateStore {
  private states = new Map<string, TodoFlowBackendState>();

  // 목적: 특정 Todo의 상태 스냅샷을 반환한다.
  getState(todoId: string): TodoFlowBackendState | null {
    return this.states.get(todoId) ?? null;
  }

  // 목적: 모든 Todo 상태를 Record로 반환한다.
  getAllStates(): Record<string, TodoFlowBackendState> {
    const result: Record<string, TodoFlowBackendState> = {};
    for (const [id, state] of this.states) {
      result[id] = state;
    }
    return result;
  }

  // 목적: 메모리에 상태를 설정한다.
  setState(todoId: string, state: TodoFlowBackendState): void {
    this.states.set(todoId, state);
  }

  // 목적: 상태의 메타 정보를 갱신하고 디스크에 저장한다.
  async saveMeta(todoId: string): Promise<void> {
    const state = this.states.get(todoId);
    if (!state) return;

    const meta: MetaFile = {
      todoId: state.todoId,
      status: state.status,
      currentPhase: state.currentPhase,
      finalVerdict: state.finalVerdict,
      error: state.error,
      startedAt: state.startedAt,
      endedAt: state.endedAt
    };

    const dir = this.getTodoDir(todoId);
    await mkdir(dir, { recursive: true });
    await this.atomicWriteJson(path.join(dir, "meta.json"), meta);
  }

  // 목적: steps 배열을 디스크에 저장한다.
  async saveSteps(todoId: string): Promise<void> {
    const state = this.states.get(todoId);
    if (!state) return;

    const dir = this.getTodoDir(todoId);
    await mkdir(dir, { recursive: true });
    await this.atomicWriteJson(path.join(dir, "steps.json"), state.steps);
  }

  // 목적: 특정 phase의 노드 산출물을 개별 파일로 저장한다.
  async saveNodeArtifact(todoId: string, phase: TodoFlowPhase, data: unknown): Promise<void> {
    const fileName = PHASE_TO_ARTIFACT[phase];
    if (!fileName) return;

    const dir = this.getTodoDir(todoId);
    await mkdir(dir, { recursive: true });
    await this.atomicWriteJson(path.join(dir, fileName), data);
  }

  // 목적: 활동 로그를 JSONL 형식으로 append한다.
  async appendActivity(todoId: string, entries: ActivityLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const dir = this.getTodoDir(todoId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "activity.jsonl");
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(filePath, lines, "utf-8");
  }

  // 목적: active.json을 갱신한다. 현재 활성 Todo ID 목록을 저장한다.
  async saveActivePointer(): Promise<void> {
    const activeTodoIds: string[] = [];
    for (const [id, state] of this.states) {
      if (state.status === "running") {
        activeTodoIds.push(id);
      }
    }
    await mkdir(this.getTodoFlowsDir(), { recursive: true });
    await this.atomicWriteJson(this.getActiveJsonPath(), { activeTodoIds } satisfies ActivePointer);
  }

  // 목적: 앱 시작 시 디스크에서 모든 Todo 상태를 복원한다.
  async loadFromDisk(): Promise<void> {
    const baseDir = this.getTodoFlowsDir();
    try {
      const entries = await readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const todoId = entry.name;
        const loaded = await this.loadTodoFromFolder(todoId);
        if (loaded) {
          this.states.set(todoId, loaded);
        }
      }
    } catch {
      // 이유: 디렉토리가 없으면 초기 상태로 시작한다.
    }
  }

  // 목적: running 상태인 Todo를 interrupted로 마킹한다 (앱 비정상 종료 후 복구).
  async markAllRunningAsInterrupted(): Promise<void> {
    for (const [todoId, state] of this.states) {
      if (state.status === "running") {
        state.status = "error";
        state.error = "앱 재시작으로 중단됨";
        state.endedAt = Date.now();

        // 목적: running 상태인 step도 error로 전환한다.
        for (const step of state.steps) {
          if (step.status === "running") {
            step.status = "error";
            step.error = "앱 재시작으로 중단됨";
            step.endedAt = Date.now();
          }
        }

        await this.saveMeta(todoId);
        await this.saveSteps(todoId);
      }
    }
  }

  // 목적: 특정 Todo의 상태를 초기화한다.
  async resetState(todoId: string): Promise<void> {
    this.states.delete(todoId);
  }

  // 목적: 전체 상태를 초기화한다.
  async resetAll(): Promise<void> {
    this.states.clear();
    await mkdir(this.getTodoFlowsDir(), { recursive: true });
    await this.atomicWriteJson(this.getActiveJsonPath(), { activeTodoIds: [] } satisfies ActivePointer);
  }

  // ─── 경로 헬퍼 ─────────────────────────────────────────

  private getTodoFlowsDir(): string {
    return path.join(app.getPath("userData"), "todo-flows");
  }

  private getTodoDir(todoId: string): string {
    return path.join(this.getTodoFlowsDir(), todoId);
  }

  private getActiveJsonPath(): string {
    return path.join(this.getTodoFlowsDir(), "active.json");
  }

  // ─── 파일 로드 ──────────────────────────────────────────

  // 목적: 개별 Todo 폴더에서 상태를 복원한다.
  // 주의: 일부 파일 누락 시 해당 영역만 기본값으로 폴백한다.
  private async loadTodoFromFolder(todoId: string): Promise<TodoFlowBackendState | null> {
    const dir = this.getTodoDir(todoId);

    const [metaResult, stepsResult, workorderResult, evidenceResult] =
      await Promise.allSettled([
        this.readJsonSafe<MetaFile>(path.join(dir, "meta.json")),
        this.readJsonSafe<TodoFlowStepState[]>(path.join(dir, "steps.json")),
        this.readJsonSafe<Record<string, unknown>>(path.join(dir, "workorder.json")),
        this.readJsonSafe<Record<string, unknown>>(path.join(dir, "evidence.json"))
      ]);

    const meta = this.settled(metaResult);
    if (!meta) return null;

    const steps = this.settled(stepsResult);
    const workOrder = this.settled(workorderResult);
    const evidence = this.settled(evidenceResult);

    return {
      todoId: meta.todoId,
      status: meta.status,
      currentPhase: meta.currentPhase,
      steps: steps ?? createInitialSteps(),
      workOrder: workOrder ?? null,
      evidence: evidence ?? null,
      finalVerdict: meta.finalVerdict,
      error: meta.error,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt
    };
  }

  // ─── I/O 유틸리티 ──────────────────────────────────────

  // 목적: tmp 파일에 쓰고 rename으로 교체하여 crash-safe 쓰기를 보장한다.
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  }

  // 목적: JSON 파일을 읽어 파싱된 객체를 반환한다. 실패 시 null.
  private async readJsonSafe<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // 목적: Promise.allSettled 결과에서 fulfilled 값을 추출한다.
  private settled<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
  }
}
