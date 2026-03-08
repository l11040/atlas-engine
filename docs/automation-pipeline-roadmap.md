# 개발 자동화 파이프라인 로드맵

---

## 1. 문서 목적

이 문서는 atlas-engine의 파이프라인을 **요구사항 기반 개발 자동화 시스템**으로 **새로 설계**하기 위한 단계별 실행 계획을 정의한다.

기존 그래프 구조(ticket-to-todo, todo-execution)와 UI는 **참고하지 않는다**. 설계 문서의 실행 흐름을 기준으로 처음부터 구성한다.

**재사용하는 인프라 레이어:**
- `packages/cli-runtime` — CLI spawn/session/parser (Claude, Codex)
- `electron/services/storage/` — SQLite + v8 codec
- `electron/services/providers/` — Claude/Codex provider 추상화
- `electron/services/config/` — 앱 설정 관리
- Electron IPC 패턴, shadcn/ui 컴포넌트 시스템, 디자인 토큰

**새로 설계하는 것:**
- LangGraph 상태 그래프 (노드, 상태 모델, 라우팅)
- 서비스 오케스트레이션 (FlowService)
- IPC 계약 (채널, 타입)
- UI (페이지, 컴포넌트, 훅)

---

## 2. 목표 파이프라인

설계 문서 Section 6, 10의 실행 단계를 기반으로 한다.

```
티켓 수집 (jira_ingestion)
  → 요구사항 해석 (analyze_requirements)
  → 위험 평가 (assess_risk)
  → 실행 계획 생성 (plan_execution)
  → [작업 단위별 실행]
    → 변경 생성 (generate_changes)
    → 변경 설명 (explain_changes)
    → 자동 검증 (self_verify)
    → 검증 판정 (evaluate_verification)
      ├→ pass: 승인 게이트 (approval_gate)
      ├→ auto_fix (attempt < max): 수정 (revise_changes) → 루프
      └→ hil: 사람 개입 요청 (request_hil)
    → 변경 반영 (apply_changes)
    → 반영 후 검증 (post_verify)
  → 실행 이력 저장 (archive_history)
```

---

## 3. 재사용 인프라 정리

### 유지하는 코드

| 영역 | 경로 | 역할 |
|------|------|------|
| CLI 런타임 | `packages/cli-runtime/` | CLI spawn, session, parser, normalizer |
| 스토리지 | `electron/services/storage/` | SQLite DB, v8 codec |
| Provider | `electron/services/providers/` | Claude/Codex provider, cli-event-adapter |
| 설정 | `electron/services/config/settings.ts` | AppSettings 읽기/쓰기 |
| Git | `electron/services/git/` | git diff 서비스 |
| CliLlm | `electron/services/langchain/cli-llm.ts` | CLI를 LangChain LLM으로 래핑 |
| 공유 유틸 | `electron/services/langchain/graphs/shared/utils.ts` | extractJson, buildTerminalLog, logEntry |
| 트레이싱 | `electron/services/langchain/tracing-env.ts` | LangSmith 환경변수 |

### 제거하는 코드

| 영역 | 경로 | 이유 |
|------|------|------|
| ticket-to-todo 그래프 | `electron/services/langchain/graphs/ticket-to-todo/` | 새 그래프로 교체 |
| todo-execution 그래프 | `electron/services/langchain/graphs/todo-execution/` | 새 그래프로 교체 |
| BackgroundFlowService | `electron/services/flow/background-flow-service.ts` | 새 오케스트레이터로 교체 |
| TodoFlowService | `electron/services/flow/todo-flow-service.ts` | 새 오케스트레이터로 교체 |
| FlowStateStore | `electron/services/flow/flow-state-store.ts` | 새 상태 모델 |
| TodoFlowStateStore | `electron/services/flow/todo-flow-state-store.ts` | 새 상태 모델 |
| 기존 IPC 핸들러 | `electron/ipc/register-flow-ipc.ts`, `register-todo-flow-ipc.ts` | 새 IPC로 교체 |
| 기존 파이프라인 UI | `src/features/pipeline/` 전체 | 새 UI로 교체 |

---

## 4. 페이즈 정의

총 5개 페이즈. 각 페이즈는 독립적으로 동작하며, 이전 페이즈가 완료되어야 다음 페이즈를 시작한다.

```
Phase 0 ─ 기반 구조 (상태 모델, IPC 계약, 오케스트레이터 뼈대, UI 셸)
Phase 1 ─ 티켓 수집 + 요구사항 해석 + 실행 계획
Phase 2 ─ 작업 실행 + 검증 + 자동 수정 루프
Phase 3 ─ 승인 게이트 (HIL) + 변경 반영
Phase 4 ─ Jira 연동 + 실행 이력 아카이브
```

---

## Phase 0: 기반 구조

> 새 파이프라인의 뼈대를 세운다. 그래프 노드는 아직 없다.
> 기존 코드를 제거하고 새 상태 모델·IPC·UI 셸을 구축한다.

### 0-1. 새 상태 모델

설계 문서 Section 12의 상태 모델을 구현한다.

```typescript
// ─── 실행 단위 (Run) ─────────────────────────────────
interface RunState {
  runId: string;
  ticketId: string;
  status: RunStatus;           // idle | running | paused | completed | failed
  currentStep: RunStep;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
}

type RunStep =
  | "idle"
  | "ingestion"           // 티켓 수집
  | "analyze"             // 요구사항 해석
  | "risk"                // 위험 평가
  | "plan"                // 실행 계획 생성
  | "execution"           // 작업 실행 중
  | "archiving"           // 이력 저장
  | "done";

type RunStatus = "idle" | "running" | "paused" | "completed" | "failed";

// ─── 요구사항 ─────────────────────────────────────────
interface ParsedRequirements {
  acceptance_criteria: AcceptanceCriterion[];
  policy_rules: string[];
  implementation_steps: string[];
  test_scenarios: TestScenario[];
  missing_sections: string[];
  description_raw: string;
}

interface AcceptanceCriterion {
  id: string;
  description: string;
  testable: boolean;
}

interface TestScenario {
  id: string;
  description: string;
  linked_ac_ids: string[];
}

// ─── 위험 평가 ────────────────────────────────────────
interface RiskAssessment {
  level: "low" | "medium" | "high";
  factors: RiskFactor[];
  recommendation: string;
}

interface RiskFactor {
  category: string;       // scope | complexity | regression | dependency
  description: string;
  severity: "low" | "medium" | "high";
}

// ─── 실행 계획 ────────────────────────────────────────
interface ExecutionPlan {
  tasks: TaskUnit[];
  execution_order: string[];   // task id 순서 (위상 정렬)
}

interface TaskUnit {
  id: string;
  title: string;
  description: string;
  linked_ac_ids: string[];
  deps: string[];              // 선행 task id
  scope: {
    editable_paths: string[];
    forbidden_paths: string[];
  };
  verify_cmd: string | null;
}

// ─── 작업 실행 상태 (Task 단위) ──────────────────────
interface TaskExecutionState {
  taskId: string;
  status: TaskStatus;
  currentStep: TaskStep;
  attempt: { current: number; max: number };
  changeSets: ChangeSet | null;
  explanation: ChangeExplanation | null;
  verification: VerificationResult | null;
  approval: ApprovalRecord | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

type TaskStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

type TaskStep =
  | "idle"
  | "generate_changes"
  | "explain_changes"
  | "self_verify"
  | "revise"               // 수정 루프 중
  | "approval_gate"
  | "apply_changes"
  | "post_verify"
  | "done";

// ─── 변경 ─────────────────────────────────────────────
interface ChangeSet {
  changes: Array<{
    path: string;
    action: "create" | "modify" | "delete";
    diff_summary: string;
  }>;
  diff: string | null;
  scope_violations: string[];
}

interface ChangeExplanation {
  summary: string;
  change_reasons: Array<{
    path: string;
    reason: string;
    linked_ac_ids: string[];
  }>;
  risk_notes: string[];
}

// ─── 검증 ─────────────────────────────────────────────
interface VerificationResult {
  verdict: "pass" | "fail";
  checks: VerificationCheck[];
  failure_reasons: string[];
}

interface VerificationCheck {
  name: string;                // requirement_met | no_overreach | no_regression | diff_match
  passed: boolean;
  detail: string;
}

// ─── 승인 ─────────────────────────────────────────────
interface ApprovalRecord {
  decision: "approved" | "rejected" | "regenerate";
  reason: string | null;
  decidedAt: number;
  decidedBy: "auto" | "human";
}

// ─── HIL ──────────────────────────────────────────────
interface HilState {
  required: boolean;
  reason: string | null;
  decision: "pending" | "approved" | "rejected" | "regenerate" | null;
}
```

### 0-2. IPC 계약

```typescript
const IPC_CHANNELS = {
  // 실행 제어
  runStart: "run:start",
  runCancel: "run:cancel",
  runGetState: "run:get-state",
  runReset: "run:reset",

  // 작업 단위 제어
  taskGetState: "task:get-state",
  taskGetAllStates: "task:get-all-states",
  taskCancel: "task:cancel",

  // 승인 게이트
  taskApprove: "task:approve",
  taskReject: "task:reject",
  taskRegenerate: "task:regenerate",

  // 이력
  historyList: "history:list",
  historyGetDetail: "history:get-detail",
} as const;
```

### 0-3. SQLite 스키마

```sql
-- 기존 테이블 유지: app_settings

-- 새 테이블
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  data BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_executions (
  task_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  data BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  data BLOB NOT NULL,
  archived_at INTEGER NOT NULL
);
```

### 0-4. 오케스트레이터 뼈대

```
electron/services/automation/
├── automation-service.ts          # Run 수준 오케스트레이션
├── task-executor.ts               # Task 단위 실행 (wave 병렬)
├── run-state-store.ts             # RunState 메모리 캐시 + SQLite
├── task-state-store.ts            # TaskExecutionState 관리
└── types.ts                       # 서비스 내부 타입
```

- `AutomationService`: Run 시작/취소/상태 조회. 그래프 빌드 및 실행 위임.
- `TaskExecutor`: Task 단위 그래프 실행, wave 스케줄링.

### 0-5. LangGraph 그래프 뼈대

```
electron/services/langchain/graphs/
├── shared/utils.ts                # 유지 (extractJson, logEntry 등)
├── pipeline/                      # 새 파이프라인 그래프
│   ├── index.ts                   # 빌더 (노드 등록, 엣지 정의)
│   ├── state.ts                   # PipelineState (Run 수준)
│   ├── routing.ts                 # 조건부 라우팅
│   └── nodes/                     # Phase 0에서는 stub만
│       ├── ingest.ts
│       ├── analyze.ts
│       ├── assess-risk.ts
│       └── plan.ts
└── task/                          # 새 작업 실행 그래프
    ├── index.ts
    ├── state.ts                   # TaskGraphState
    ├── routing.ts
    └── nodes/                     # Phase 0에서는 stub만
        ├── generate.ts
        ├── explain.ts
        ├── verify.ts
        ├── evaluate.ts
        ├── revise.ts
        ├── approval-gate.ts
        ├── apply.ts
        └── post-verify.ts
```

### 0-6. UI 셸

```
src/
├── pages/
│   ├── main-page.tsx              # 티켓 입력 + 실행 시작 (재설계)
│   ├── run-page.tsx               # 실행 대시보드 (신규)
│   ├── history-page.tsx           # 실행 이력 (신규, Phase 4에서 구현)
│   └── settings-page.tsx          # 설정 (유지, 확장)
├── features/
│   └── automation/                # 신규 feature 폴더
│       ├── components/
│       │   ├── run-status-bar.tsx        # 전체 진행 상태 바
│       │   ├── step-indicator.tsx        # 단계 표시기
│       │   ├── task-list.tsx             # 작업 목록
│       │   ├── task-card.tsx             # 개별 작업 카드
│       │   └── task-detail-panel.tsx     # 작업 상세 (diff, 설명, 검증)
│       ├── hooks/
│       │   ├── use-run-state.ts          # 실행 상태 폴링
│       │   └── use-task-states.ts        # 작업 상태 폴링
│       └── phases/
│           ├── ingestion-view.tsx        # 티켓 정보 표시
│           ├── analysis-view.tsx         # 요구사항 해석 결과
│           ├── risk-view.tsx             # 위험 평가 결과
│           ├── plan-view.tsx             # 실행 계획 표시
│           └── execution-view.tsx        # 작업 실행 현황
```

### 0-7. 기존 코드 제거

| 삭제 대상 | 설명 |
|-----------|------|
| `electron/services/langchain/graphs/ticket-to-todo/` | 기존 그래프 |
| `electron/services/langchain/graphs/todo-execution/` | 기존 그래프 |
| `electron/services/flow/` | 기존 오케스트레이터 + 상태 저장소 |
| `electron/ipc/register-flow-ipc.ts` | 기존 flow IPC |
| `electron/ipc/register-todo-flow-ipc.ts` | 기존 todo-flow IPC |
| `src/features/pipeline/` | 기존 파이프라인 UI 전체 |

### 완료 기준

- [ ] 새 상태 모델 타입이 `shared/ipc.ts`에 정의된다
- [ ] 새 IPC 채널이 정의되고 preload에 바인딩된다
- [ ] SQLite 스키마가 마이그레이션된다 (기존 테이블 유지, 새 테이블 추가)
- [ ] AutomationService가 start/cancel/getState를 stub으로 제공한다
- [ ] UI 셸이 라우팅되고 빈 페이지가 렌더링된다
- [ ] 기존 그래프/서비스/UI가 제거된다
- [ ] `pnpm --filter desktop typecheck` 통과

---

## Phase 1: 티켓 수집 + 요구사항 해석 + 실행 계획

> 파이프라인 전반부를 구현한다. 티켓을 입력하면 구조화된 요구사항과 실행 계획이 생성된다.

### 1-1. pipeline 그래프 노드 구현

#### `ingest` (결정적)

- 입력: 사용자가 입력한 티켓 데이터 (JSON 또는 Jira 응답)
- 처리: 티켓 데이터를 PipelineState에 로드
- 출력: `ticket` 필드 설정
- LLM 호출: 없음

#### `analyze` (LLM)

설계 문서 Section 5.2의 Description 구조화를 수행한다.

- 입력: `ticket.description` (원문)
- 처리: LLM에 Description 파싱 지시
- 출력: `parsedRequirements: ParsedRequirements`
- 실패 시: `missing_sections`에 파싱 실패 사유 기록, hold 분기

#### `assess_risk` (LLM)

- 입력: `parsedRequirements`, `ticket`
- 처리: 변경 범위·복잡도·회귀 위험 평가
- 출력: `riskAssessment: RiskAssessment`
- 분기: `level === "high"` → hold (HIL 요청)

#### `plan` (LLM)

- 입력: `parsedRequirements`, `riskAssessment`
- 처리: AC↔시나리오 매핑, 작업 단위 분해, 의존성 정렬
- 출력: `executionPlan: ExecutionPlan`
- 실패 시: hold 분기

### 1-2. pipeline 그래프 라우팅

```
START → ingest → analyze
  ├→ missing_sections 있음: HOLD
  └→ OK: assess_risk
       ├→ level === "high": HOLD
       └→ OK: plan
            ├→ tasks 비어있음: HOLD
            └→ OK: END (execution 대기)
```

### 1-3. UI 구현

| 컴포넌트 | 역할 |
|----------|------|
| `main-page.tsx` | 티켓 키 입력 또는 JSON 붙여넣기 → 실행 시작 |
| `run-page.tsx` | RunStatus 표시, 단계별 진행 상태 |
| `ingestion-view.tsx` | 티켓 원문 표시 |
| `analysis-view.tsx` | 구조화된 AC, 시나리오, 정책, missing_sections |
| `risk-view.tsx` | 위험 레벨, 요인 목록, 권고사항 |
| `plan-view.tsx` | 작업 목록, 의존 관계 시각화, 스코프 |

### 1-4. 운영 제어

설계 문서 Section 9: UI는 다음 질문에 답해야 한다.

- "지금 무엇을 하는가" → `step-indicator`로 현재 단계 표시
- "어디까지 진행되었는가" → `run-status-bar`로 전체 진행률
- "왜 멈췄는가" → hold 상태 시 사유와 missing_sections 표시

### 완료 기준

- [ ] 티켓 입력 시 Description이 구조화된 모델로 파싱된다
- [ ] missing_sections가 있으면 hold 상태로 전환되고 UI에 표시된다
- [ ] 위험 평가 결과(level, factors)가 생성되고 UI에 표시된다
- [ ] high 위험 시 자동 hold 진입한다
- [ ] 실행 계획(tasks, 의존 관계, 스코프)이 생성되고 UI에 표시된다
- [ ] 전체 상태가 SQLite에 영속화된다

---

## Phase 2: 작업 실행 + 검증 + 자동 수정 루프

> 파이프라인 핵심부를 구현한다. 각 TaskUnit을 실행하고, 검증하고, 실패 시 수정한다.

### 2-1. task 그래프 노드 구현

#### `generate_changes` (LLM, allowTools: true)

- 입력: `TaskUnit` + 코드베이스 컨텍스트
- 처리: CLI 에이전트에 코드 변경 위임
- 출력: `changeSets: ChangeSet`
- 주의: `scope.forbidden_paths` 위반 시 자동 되돌림

#### `explain_changes` (LLM, allowTools: false)

- 입력: `changeSets`, `TaskUnit`
- 처리: 변경 이유, AC 대응 관계, 위험 노트 생성
- 출력: `explanation: ChangeExplanation`

설계 문서 Section 4.2: 모든 변경은 변경 이유, 대응 요구사항, 선택 근거, 위험 분석을 포함해야 한다.

#### `self_verify` (LLM, allowTools: true)

- 입력: `changeSets`, `TaskUnit.verify_cmd`
- 처리: 검증 명령 실행, 4가지 체크 수행
- 체크 항목 (설계 문서 Section 4.4):
  1. 요구사항 충족 (`requirement_met`)
  2. 과잉 변경 없음 (`no_overreach`)
  3. 회귀 위험 없음 (`no_regression`)
  4. 설명/diff 일치 (`diff_match`)
- 출력: `verification: VerificationResult`

#### `evaluate_verification` (결정적)

- 입력: `verification`, `attempt`
- 분기 (설계 문서 Section 7):
  - `verdict === "pass"` → `approval_gate` (Phase 3)
  - `verdict === "fail" && attempt.current < attempt.max` → `revise_changes`
  - `verdict === "fail" && attempt.current >= attempt.max` → `request_hil`

#### `revise_changes` (LLM, allowTools: true)

- 입력: `verification.failure_reasons` + 이전 `changeSets.diff`
- 처리: 실패 사유 기반으로 코드 수정 (설계 문서 Section 7: 수정 입력은 반드시 failure report)
- 출력: 갱신된 `changeSets`
- 부수효과: `attempt.current` 증가

### 2-2. task 그래프 라우팅

```
START → generate_changes → explain_changes → self_verify → evaluate_verification
  ├→ pass: END (Phase 3에서 approval_gate 추가)
  ├→ auto_fix: revise_changes → explain_changes → self_verify → evaluate_verification (루프)
  └→ hil: END (Phase 3에서 request_hil 추가)
```

### 2-3. TaskExecutor (wave 실행)

- `ExecutionPlan.execution_order`에서 deps 기반 위상 정렬 → wave 그룹화
- 같은 wave 내 task는 병렬 실행
- 다른 wave는 순차 (이전 wave 완료 후)
- wave 내 동시 실행 수 제한: `AppSettings.automation.maxConcurrency` (기본값: 3)

### 2-4. UI 구현

| 컴포넌트 | 역할 |
|----------|------|
| `execution-view.tsx` | wave별 task 진행 현황 |
| `task-list.tsx` | 전체 task 목록 + 상태 배지 |
| `task-card.tsx` | task별 단계 진행, attempt 카운터 |
| `task-detail-panel.tsx` | diff, 변경 설명, 검증 결과, 수정 이력 |

"무엇을 승인해야 하는가" 질문은 Phase 3에서 구현한다.

### 2-5. 비용 제어

| 항목 | 기본값 |
|------|--------|
| 최대 수정 횟수 | 3회 |
| task 단위 타임아웃 | 300초 |
| wave 동시 실행 수 | 3 |

### 완료 기준

- [ ] task별로 generate → explain → verify → evaluate 흐름이 실행된다
- [ ] verify 실패 시 failure_reasons 기반으로 revise가 코드를 수정한다
- [ ] 최대 3회 수정 후 실패하면 최종 실패 처리한다
- [ ] 각 attempt의 diff, 설명, 검증 결과가 저장된다
- [ ] wave 기반 병렬 실행이 동작한다
- [ ] 변경 설명에 AC 대응 관계가 포함된다

---

## Phase 3: 승인 게이트 (HIL) + 변경 반영

> 설계 문서 Section 8의 Human-in-the-Loop를 구현한다.
> 자동 실행 결과를 사람이 검토하고 승인/반려/재생성할 수 있다.

### 3-1. task 그래프 노드 추가

#### `approval_gate` (중단점)

- 입력: `changeSets`, `explanation`, `verification`
- 처리:
  1. `autoApprove` 조건 충족 시 자동 승인 (`decidedBy: "auto"`)
  2. 미충족 시 `status: "awaiting_approval"`로 전환, 그래프 종료
- autoApprove 조건: `riskAssessment.level !== "high" && verification.verdict === "pass" && settings.automation.autoApprove`

**그래프 중단/재개 방식:**
1. `approval_gate`에서 상태를 SQLite에 저장하고 그래프를 정상 종료한다
2. 사용자 승인/반려 IPC 수신 시 `TaskExecutor`가 새 그래프를 `apply_changes`부터 실행한다
3. 이전 상태(changeSets, explanation 등)를 새 그래프에 주입한다

#### `apply_changes` (결정적)

- 입력: 승인된 `changeSets`
- 처리: git commit 생성 (task 단위, 메시지에 AC 참조 포함)
- 출력: `commitHash: string`

#### `post_verify` (LLM, allowTools: true)

- 입력: 커밋된 상태의 코드베이스
- 처리: 전체 테스트 실행, 회귀 검증
- 분기:
  - pass → task 완료
  - fail → git revert + HIL 에스컬레이션

### 3-2. 라우팅 최종 (Phase 2 + 3 통합)

```
generate_changes → explain_changes → self_verify → evaluate_verification
  ├→ pass: approval_gate
  │   ├→ auto_approve: apply_changes → post_verify → END
  │   ├→ awaiting_approval: [중단] → 사용자 응답 → apply_changes / revise / END
  │   └→ rejected: END
  ├→ auto_fix: revise_changes → explain_changes → self_verify → evaluate_verification (루프)
  └→ hil: [중단] → 사용자 응답 → revise_changes / END
```

### 3-3. HIL 패널 UI

설계 문서 Section 8: HIL 패널이 보여야 할 정보.

| 정보 | 출처 |
|------|------|
| 작업 요약 | `TaskUnit.title` + `TaskUnit.description` |
| 변경 요약 | `ChangeExplanation.summary` |
| diff | `ChangeSet.diff` |
| 변경 이유 | `ChangeExplanation.change_reasons[]` |
| 검증 결과 | `VerificationResult.checks[]` |

| 행동 | IPC | 효과 |
|------|-----|------|
| 승인 | `task:approve` | `apply_changes`부터 재개 |
| 반려 | `task:reject` | task 실패 처리 |
| 재생성 | `task:regenerate` | `generate_changes`부터 재실행 (attempt 초기화) |

### 3-4. 설정 확장

```typescript
interface AutomationSettings {
  autoApprove: boolean;          // 자동 승인 활성화
  maxConcurrency: number;        // wave 내 동시 task 수
  maxRetries: number;            // 수정 루프 최대 횟수
  taskTimeoutMs: number;         // task 단위 타임아웃
}
```

### 완료 기준

- [ ] verify 통과 후 승인 대기 상태로 전환된다
- [ ] HIL 패널에서 diff, 변경 설명, 검증 결과를 확인할 수 있다
- [ ] 승인 시 git commit이 생성된다
- [ ] 반려 시 task가 실패 처리된다
- [ ] 재생성 시 처음부터 다시 실행된다
- [ ] autoApprove 조건 충족 시 자동 통과한다
- [ ] post_verify 실패 시 revert + HIL 에스컬레이션이 발생한다

---

## Phase 4: Jira 연동 + 실행 이력 아카이브

> 외부 시스템 연동으로 자동화 루프를 완전히 닫는다.

### 4-1. Jira API 연동

| 작업 | 파일 | 설명 |
|------|------|------|
| Jira 클라이언트 | `electron/services/jira/jira-client.ts` | REST API (티켓 조회, 상태 변경, 댓글) |
| 설정 | `shared/ipc.ts` | `AppSettings.jira: { baseUrl, apiKey, enabled }` |
| IPC | `electron/ipc/register-jira-ipc.ts` | 연결 테스트, 티켓 조회 |
| 설정 UI | `pages/settings-page.tsx` | Jira 연결 설정 |

#### Jira 상태 동기화

| 시점 | 동작 |
|------|------|
| 실행 시작 | 티켓 → "In Progress" |
| HIL 대기 | 댓글: 검토 요청 + diff 요약 |
| 전체 완료 | 댓글: 실행 결과 요약 + 상태 변경 |
| 실패 | 댓글: 실패 사유 |

#### `ingest` 노드 확장

- `source: "manual" | "jira"` 분기
- Jira 소스: API로 티켓 조회 → `ticket` 필드에 로드
- Manual 소스: 기존 JSON 입력 유지

### 4-2. 실행 이력 아카이브

설계 문서 Section 13의 기록 항목을 저장한다.

```typescript
interface ExecutionRecord {
  runId: string;
  ticketId: string;
  ticket: Ticket;                       // 입력 티켓
  parsedRequirements: ParsedRequirements;
  riskAssessment: RiskAssessment;
  executionPlan: ExecutionPlan;
  taskResults: TaskExecutionResult[];   // task별 최종 결과
  finalStatus: "completed" | "failed" | "partial";
  startedAt: number;
  endedAt: number;
}

interface TaskExecutionResult {
  taskId: string;
  changeSets: ChangeSet;
  explanation: ChangeExplanation;
  verification: VerificationResult;
  approval: ApprovalRecord;
  attempts: AttemptRecord[];           // 수정 이력
  commitHash: string | null;
}

interface AttemptRecord {
  attemptNumber: number;
  diff: string | null;
  failureReasons: string[];
  timestamp: number;
}
```

#### 아카이브 서비스

- Run 완료/실패 시 전체 상태를 `execution_history` 테이블에 스냅샷
- 활성 상태(`runs`, `task_executions`)는 아카이브 후 정리 가능

#### 이력 UI

| 컴포넌트 | 역할 |
|----------|------|
| `history-page.tsx` | 실행 이력 목록 (날짜, 티켓, 상태, 소요 시간) |
| 상세 보기 | 모달/패널: 전체 실행 과정 재현 (요구사항 → 계획 → task별 결과) |

### 완료 기준

- [ ] Jira 티켓 키로 직접 조회하여 파이프라인을 시작할 수 있다
- [ ] Jira 상태가 실행 진행에 맞춰 자동 업데이트된다
- [ ] 모든 실행 이력이 구조화되어 저장된다
- [ ] 이력 페이지에서 과거 실행을 조회하고 상세 내용을 확인할 수 있다
- [ ] 이력 데이터로 "이 요구사항 때문에 어떤 코드가 왜 바뀌었는가"에 답할 수 있다

---

## 5. 페이즈 간 의존 관계

```
Phase 0 (기반 구조)
  ↓
Phase 1 (티켓 + 요구사항 + 계획)
  ↓
Phase 2 (실행 + 검증 + 수정 루프)
  ↓
Phase 3 (승인 게이트 + 반영)
  ↓
Phase 4 (Jira + 이력)
```

모든 페이즈가 순차적이다. Phase 0이 기존 코드를 제거하므로, 이후 페이즈는 새 구조 위에서만 작업한다.

---

## 6. 성공 기준 (설계 문서 Section 14)

전체 시스템이 다음을 만족해야 한다.

1. **시스템 상태가 항상 명확하다** — RunState, TaskExecutionState로 현재 단계와 상태를 언제든 확인 가능
2. **대부분의 작업이 자동 처리된다** — generate → explain → verify → revise 루프가 사람 개입 없이 동작
3. **사람 개입이 최소화된다** — autoApprove, 자동 수정 루프로 HIL 빈도 감소
4. **모든 변경에 설명이 존재한다** — ChangeExplanation에 AC 대응 관계, 변경 이유 포함
5. **실패 원인이 기록된다** — VerificationResult.failure_reasons, AttemptRecord
6. **실행 이력이 축적된다** — ExecutionRecord로 전체 실행 과정 아카이브
