// 책임: FlowState의 메모리 캐시와 폴더-per-플로우 디스크 영속화를 관리한다.

import { app } from "electron";
import { access, appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActivityLogEntry,
  FlowNodeProgress,
  FlowRunStatus,
  FlowState,
  FlowType,
  PipelinePhase,
  TodoItem
} from "../../../shared/ipc";

// ─── 파일별 타입 정의 ───────────────────────────────────

interface ActivePointer {
  activeFlowId: string | null;
}

interface MetaFile {
  flowId: string;
  flowType: FlowType | null;
  status: FlowRunStatus;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
}

interface ProgressFile {
  nodeProgress: FlowNodeProgress[];
  currentPhase: PipelinePhase;
  holdAtPhase?: PipelinePhase;
  holdReason?: string;
}

interface DorFile {
  dorFormalResult?: "pass" | "hold";
  dorFormalReason?: string;
  dorSemanticResult?: "proceed" | "hold";
  dorSemanticReason?: string;
}

interface TodosFile {
  todos: TodoItem[];
}

// ─── 필드-파일 매핑 ─────────────────────────────────────

type FlowFile = "meta" | "progress" | "dor" | "todos" | "activity";

// 목적: FlowState 필드를 저장 파일로 매핑한다.
const FIELD_TO_FILE: Record<keyof FlowState, FlowFile> = {
  flowId: "meta",
  flowType: "meta",
  status: "meta",
  startedAt: "meta",
  endedAt: "meta",
  error: "meta",
  nodeProgress: "progress",
  currentPhase: "progress",
  holdAtPhase: "progress",
  holdReason: "progress",
  dorFormalResult: "dor",
  dorFormalReason: "dor",
  dorSemanticResult: "dor",
  dorSemanticReason: "dor",
  todos: "todos",
  activityLog: "activity"
};

// ─── 초기 상태 ──────────────────────────────────────────

export const INITIAL_FLOW_STATE: FlowState = {
  flowId: null,
  flowType: null,
  status: "idle",
  startedAt: null,
  endedAt: null,
  error: null,
  nodeProgress: [],
  currentPhase: "idle",
  todos: [],
  holdReason: "",
  activityLog: []
};

// ─── FlowStateStore ─────────────────────────────────────

export class FlowStateStore {
  private state: FlowState = { ...INITIAL_FLOW_STATE };
  private activeFlowId: string | null = null;

  // 목적: 현재 상태의 스냅샷을 반환한다.
  getSnapshot(): FlowState {
    return this.state;
  }

  // 목적: 상태를 부분 갱신하고, 변경된 필드에 해당하는 파일만 디스크에 저장한다.
  async update(partial: Partial<FlowState>): Promise<void> {
    // 1단계: 새 플로우 감지 시 폴더 생성 + active.json 갱신
    if (partial.flowId && partial.flowId !== this.activeFlowId) {
      this.activeFlowId = partial.flowId;
      await mkdir(this.getFlowDir(partial.flowId), { recursive: true });
      await this.atomicWriteJson(this.getActiveJsonPath(), { activeFlowId: partial.flowId } satisfies ActivePointer);
    }

    // 2단계: activityLog append 처리
    // 이유: BackgroundFlowService가 [...prev, ...new]로 전달하므로, 새 엔트리만 추출하여 append한다.
    const prevLogLength = this.state.activityLog.length;
    this.state = { ...this.state, ...partial };

    if (partial.activityLog) {
      const newEntries = this.state.activityLog.slice(prevLogLength);
      if (newEntries.length > 0) {
        await this.appendActivityLog(newEntries);
      }
    }

    // 3단계: activity를 제외한 변경 파일만 디스크에 저장
    const changedFiles = this.resolveChangedFiles(partial);
    changedFiles.delete("activity");
    if (changedFiles.size > 0) {
      await this.persistFiles(changedFiles);
    }
  }

  // 목적: 앱 시작 시 디스크에서 상태를 복원한다.
  async loadFromDisk(): Promise<void> {
    // 1단계: 구형 flow-state.json 마이그레이션 확인
    const legacyPath = path.join(app.getPath("userData"), "flow-state.json");
    if (await this.fileExists(legacyPath)) {
      await this.migrateFromLegacy(legacyPath);
      return;
    }

    // 2단계: active.json에서 activeFlowId 로드
    const active = await this.readJsonSafe<ActivePointer>(this.getActiveJsonPath());
    if (!active?.activeFlowId) {
      this.state = { ...INITIAL_FLOW_STATE };
      return;
    }

    // 3단계: 해당 flow 폴더가 존재하는지 확인
    const flowDir = this.getFlowDir(active.activeFlowId);
    if (!(await this.fileExists(flowDir))) {
      // 이유: active.json이 가리키는 폴더가 없으면 포인터를 해제한다.
      await this.atomicWriteJson(this.getActiveJsonPath(), { activeFlowId: null } satisfies ActivePointer);
      this.state = { ...INITIAL_FLOW_STATE };
      return;
    }

    // 4단계: 해당 flow 폴더에서 병렬 로드
    this.activeFlowId = active.activeFlowId;
    this.state = await this.loadFlowFromFolder(active.activeFlowId);
  }

  // 목적: 상태를 초기값으로 리셋한다. 플로우 폴더는 이력으로 보존한다.
  async reset(): Promise<void> {
    if (this.activeFlowId) {
      await this.atomicWriteJson(this.getActiveJsonPath(), { activeFlowId: null } satisfies ActivePointer);
    }
    this.activeFlowId = null;
    this.state = { ...INITIAL_FLOW_STATE };
  }

  // ─── 경로 헬퍼 ─────────────────────────────────────────

  private getFlowsDir(): string {
    return path.join(app.getPath("userData"), "flows");
  }

  private getFlowDir(flowId: string): string {
    return path.join(this.getFlowsDir(), flowId);
  }

  private getActiveJsonPath(): string {
    return path.join(this.getFlowsDir(), "active.json");
  }

  // ─── 파일 결정 ─────────────────────────────────────────

  // 목적: partial의 키를 FIELD_TO_FILE로 매핑하여 영향받는 파일 집합을 반환한다.
  private resolveChangedFiles(partial: Partial<FlowState>): Set<FlowFile> {
    const files = new Set<FlowFile>();
    for (const key of Object.keys(partial) as (keyof FlowState)[]) {
      const file = FIELD_TO_FILE[key];
      if (file) files.add(file);
    }
    return files;
  }

  // ─── 파일별 저장 ───────────────────────────────────────

  // 목적: 변경된 파일만 병렬로 디스크에 저장한다.
  private async persistFiles(files: Set<FlowFile>): Promise<void> {
    if (!this.activeFlowId) return;
    const dir = this.getFlowDir(this.activeFlowId);
    const writes: Promise<void>[] = [];

    if (files.has("meta")) {
      const data: MetaFile = {
        flowId: this.state.flowId!,
        flowType: this.state.flowType,
        status: this.state.status,
        startedAt: this.state.startedAt,
        endedAt: this.state.endedAt,
        error: this.state.error
      };
      writes.push(this.atomicWriteJson(path.join(dir, "meta.json"), data));
    }

    if (files.has("progress")) {
      const data: ProgressFile = {
        nodeProgress: this.state.nodeProgress,
        currentPhase: this.state.currentPhase,
        holdAtPhase: this.state.holdAtPhase,
        holdReason: this.state.holdReason
      };
      writes.push(this.atomicWriteJson(path.join(dir, "progress.json"), data));
    }

    if (files.has("dor")) {
      const data: DorFile = {
        dorFormalResult: this.state.dorFormalResult,
        dorFormalReason: this.state.dorFormalReason,
        dorSemanticResult: this.state.dorSemanticResult,
        dorSemanticReason: this.state.dorSemanticReason
      };
      writes.push(this.atomicWriteJson(path.join(dir, "dor.json"), data));
    }

    if (files.has("todos")) {
      const data: TodosFile = { todos: this.state.todos };
      writes.push(this.atomicWriteJson(path.join(dir, "todos.json"), data));
    }

    await Promise.all(writes);
  }

  // ─── 멀티파일 로드 ─────────────────────────────────────

  // 목적: flow 폴더 내 개별 파일을 병렬로 읽어 FlowState를 조합한다.
  // 주의: 일부 파일 누락 시 해당 영역만 기본값으로 폴백한다.
  private async loadFlowFromFolder(flowId: string): Promise<FlowState> {
    const dir = this.getFlowDir(flowId);

    const [metaResult, progressResult, dorResult, todosResult, activityResult] =
      await Promise.allSettled([
        this.readJsonSafe<MetaFile>(path.join(dir, "meta.json")),
        this.readJsonSafe<ProgressFile>(path.join(dir, "progress.json")),
        this.readJsonSafe<DorFile>(path.join(dir, "dor.json")),
        this.readJsonSafe<TodosFile>(path.join(dir, "todos.json")),
        this.readJsonlSafe<ActivityLogEntry>(path.join(dir, "activity.jsonl"))
      ]);

    const meta = this.settled(metaResult);
    const progress = this.settled(progressResult);
    const dor = this.settled(dorResult);
    const todos = this.settled(todosResult);
    const activity = this.settled(activityResult);

    return {
      flowId: meta?.flowId ?? null,
      flowType: meta?.flowType ?? null,
      status: meta?.status ?? "idle",
      startedAt: meta?.startedAt ?? null,
      endedAt: meta?.endedAt ?? null,
      error: meta?.error ?? null,
      nodeProgress: progress?.nodeProgress ?? [],
      currentPhase: progress?.currentPhase ?? "idle",
      holdAtPhase: progress?.holdAtPhase,
      holdReason: progress?.holdReason ?? "",
      dorFormalResult: dor?.dorFormalResult,
      dorFormalReason: dor?.dorFormalReason,
      dorSemanticResult: dor?.dorSemanticResult,
      dorSemanticReason: dor?.dorSemanticReason,
      todos: todos?.todos ?? [],
      activityLog: activity ?? []
    };
  }

  // ─── 마이그레이션 ──────────────────────────────────────

  // 목적: 구형 단일 flow-state.json을 새 폴더 구조로 마이그레이션한다.
  private async migrateFromLegacy(legacyPath: string): Promise<void> {
    try {
      const raw = await readFile(legacyPath, "utf-8");
      const parsed = JSON.parse(raw) as FlowState;
      const state = { ...INITIAL_FLOW_STATE, ...parsed };

      if (state.flowId && state.status !== "idle") {
        // 1단계: flow 폴더 생성 및 파일 분리 저장
        this.activeFlowId = state.flowId;
        this.state = state;
        await mkdir(this.getFlowDir(state.flowId), { recursive: true });
        await this.persistAllFiles();

        // 2단계: activityLog를 JSONL로 저장
        if (state.activityLog.length > 0) {
          await this.appendActivityLog(state.activityLog);
        }

        // 3단계: active.json 생성
        await this.atomicWriteJson(this.getActiveJsonPath(), { activeFlowId: state.flowId } satisfies ActivePointer);
      } else {
        this.state = { ...INITIAL_FLOW_STATE };
        await mkdir(this.getFlowsDir(), { recursive: true });
        await this.atomicWriteJson(this.getActiveJsonPath(), { activeFlowId: null } satisfies ActivePointer);
      }

      // 4단계: 구형 파일을 .bak으로 rename
      await rename(legacyPath, legacyPath + ".bak");
    } catch {
      // 이유: 마이그레이션 실패 시 기본값으로 안전하게 폴백한다.
      this.state = { ...INITIAL_FLOW_STATE };
    }
  }

  // 목적: 전체 파일을 한 번에 저장한다 (마이그레이션 용도).
  private async persistAllFiles(): Promise<void> {
    const allFiles = new Set<FlowFile>(["meta", "progress", "dor", "todos"]);
    await this.persistFiles(allFiles);
  }

  // ─── I/O 유틸리티 ──────────────────────────────────────

  // 목적: tmp 파일에 쓰고 rename으로 교체하여 crash-safe 쓰기를 보장한다.
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  }

  // 목적: activity.jsonl에 새 엔트리만 JSONL 형식으로 append한다.
  private async appendActivityLog(entries: ActivityLogEntry[]): Promise<void> {
    if (!this.activeFlowId || entries.length === 0) return;
    const filePath = path.join(this.getFlowDir(this.activeFlowId), "activity.jsonl");
    await mkdir(path.dirname(filePath), { recursive: true });
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(filePath, lines, "utf-8");
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

  // 목적: JSONL 파일을 읽어 파싱된 배열을 반환한다. 손상된 줄은 건너뛴다.
  private async readJsonlSafe<T>(filePath: string): Promise<T[]> {
    try {
      const raw = await readFile(filePath, "utf-8");
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as T;
          } catch {
            return null;
          }
        })
        .filter((v): v is T => v !== null);
    } catch {
      return [];
    }
  }

  // 목적: 파일 또는 디렉토리의 존재 여부를 확인한다.
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // 목적: Promise.allSettled 결과에서 fulfilled 값을 추출한다.
  private settled<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === "fulfilled" ? result.value : null;
  }
}
