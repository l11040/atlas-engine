# 스킬 기반 아틀라스 마이그레이션 계획

## 배경: 왜 전환하는가

현재 아키텍처는 **Electron GUI → IPC → automation-service → LangGraph → CliLlm → Claude CLI subprocess** 구조다.
문제:

1. **테스트 한계**: 파이프라인을 테스트하려면 반드시 Electron 앱을 실행해야 한다. IPC, SQLite, BrowserWindow 등 무거운 런타임 의존성이 개입한다.
2. **이중 래핑**: Claude Code가 이미 도구(Read, Write, Bash 등)를 갖고 있는데, CliLlm이 Claude CLI를 다시 subprocess로 감싸서 호출한다. 도구 결과를 파싱하고 다시 정규화하는 불필요한 계층이 존재한다.
3. **디버깅 어려움**: 실패 시 Electron 로그, LangGraph 상태, CLI stdout, git diff 를 교차 확인해야 한다.
4. **반복 실행 비용**: 한 단계를 수정하고 재실행하려면 앱 재시작 → 티켓 선택 → 실행 → 대기 과정을 반복한다.

**목표**: Claude Code 스킬로 각 단계를 독립 실행 가능하게 만들어, 터미널에서 `/analyze`, `/plan`, `/execute` 같은 명령으로 즉시 테스트·실행한다.

---

## 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **스킬 = 단계** | 파이프라인의 각 phase를 독립 스킬로 분리한다 |
| **파일 = 상태** | SQLite/메모리 캐시 대신 `.harness/` 디렉토리의 JSON 파일로 상태를 관리한다 |
| **Claude Code = 실행 엔진** | CliLlm 래퍼를 제거하고 Claude Code 자체의 도구(Read, Write, Bash)를 직접 활용한다 |
| **GUI 완전 제거** | Electron 앱을 제거하고 Claude Code 터미널이 유일한 인터페이스가 된다 |

---

## 아키텍처 비교

### AS-IS (현재)

```
[Electron Renderer] → IPC → [automation-service] → [LangGraph]
                                                        ↓
                                                   [CliLlm]
                                                        ↓
                                                   [Claude CLI subprocess]
                                                        ↓
                                                   (Read/Write/Bash 도구 실행)
```

- 5개 계층을 통과해야 코드가 실행됨
- 상태: SQLite + 메모리 캐시
- 테스트: Electron 앱 필수

### TO-BE (목표)

```
[Claude Code] → /analyze (스킬) → .harness/requirements.json 출력
             → /plan    (스킬) → .harness/plan.json 출력
             → /execute (스킬) → 직접 코드 수정 + .harness/tasks/*.json 출력
             → /verify  (스킬) → Bash(테스트 실행) + .harness/verify.json 출력
```

- Claude Code가 직접 도구 실행 (Read, Write, Bash, Grep 등)
- 상태: `.harness/` 디렉토리 내 JSON 파일
- 테스트: 터미널에서 `/analyze` 한 줄로 즉시 실행
- GUI 없음. 터미널이 유일한 인터페이스

---

## 디렉토리 구조

```
.claude/skills/
├── commit/                        (기존) 커밋 메시지 작성
└── harness/                       파이프라인 전체 (단일 폴더)
    ├── SKILL.md                   /harness 스킬 지침 (ingest → analyze → plan → execute → verify)
    └── harness.py                 Python 유틸리티 (env, jira, diff, scope 서브커맨드)

.harness/
├── .env                           대상 프로젝트 경로 등 환경 설정
├── ticket.json                    원본 티켓 정보
├── requirements.json              analyze 결과
├── risk.json                      위험 평가 결과
├── plan.json                      실행 계획
├── tasks/
│   ├── task-1.json                태스크별 실행 상태
│   ├── task-2.json
│   └── ...
└── run.json                       전체 실행 메타데이터 (현재 단계, 시작 시각 등)
```

---

## 대상 프로젝트 설정

아틀라스는 **atlas-engine 저장소** 안에 살지만, 실제 코드를 수정하는 대상은 **별도의 로컬 프로젝트**다.
`.harness/.env` 파일에 대상 프로젝트 경로를 지정한다.

### `.harness/.env` 형식

```env
# ── 대상 프로젝트 ──
# 필수: 코드 생성·검증·커밋 대상 프로젝트의 절대 경로
TARGET_PROJECT_DIR=/Users/rio/Documents/code/github/ecommerce-template/ecommerce-ax

# 선택: 검증 명령 기본값 (plan에서 태스크별 override 가능)
VERIFY_CMD=pnpm typecheck && pnpm test

# 선택: git 브랜치 전략
BRANCH_PREFIX=atlas/

# ── Jira 연동 ──
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_PREFIX=PROJ
```

### 스킬에서의 사용

모든 스킬은 실행 시작 시 `.harness/.env`를 읽어 환경을 확인한다.
- `/ingest`: Jira API로 티켓 트리를 가져와 `.harness/ticket.json` 생성 (Python 스크립트)
- `/analyze`: 대상 프로젝트의 코드베이스를 탐색하여 요구사항과 맥락을 파악
- `/plan`: 대상 프로젝트의 구조를 기반으로 태스크의 scope (editable_paths, forbidden_paths) 결정
- `/execute`: `TARGET_PROJECT_DIR` 내에서 코드를 읽고, 수정하고, 커밋
- `/verify`: `TARGET_PROJECT_DIR`에서 빌드/테스트 명령 실행

### 규칙

1. `.harness/.env`가 없으면 스킬은 즉시 중단하고 설정을 요청한다
2. `TARGET_PROJECT_DIR`이 유효한 git 저장소인지 검증한다
3. `.harness/` 디렉토리 전체를 `.gitignore`에 추가한다 (프로젝트별 경로가 포함되므로)

### Python 스크립트 활용 원칙

토큰 절약을 위해, **데이터 수집·변환·검증** 같은 정형 작업은 Python 스크립트로 처리한다.
Claude Code는 스크립트 실행 결과만 받아서 판단·생성에 집중한다.

| 작업 | 방식 | 이유 |
|------|------|------|
| Jira 티켓 가져오기 | Python 스크립트 | REST API 호출 + JSON 정규화는 정형 작업 |
| git diff 파싱 | Python 스크립트 | diff 파싱·통계는 정형 작업 |
| 스코프 위반 검출 | Python 스크립트 | 경로 매칭은 정형 작업 |
| 요구사항 분석 | Claude Code 직접 | 자연어 해석은 LLM 작업 |
| 코드 생성·수정 | Claude Code 직접 | 코드 이해·생성은 LLM 작업 |
| 검증 결과 판단 | Claude Code 직접 | 실패 원인 분석은 LLM 작업 |

---

## Phase 1: 아틀라스 상태 레이어 구축

### 목표
`.harness/` 디렉토리 + `.env` 기반의 프로젝트 설정 및 상태 관리 체계를 만든다.

### 작업

1. **`.harness/` 디렉토리 규약 정의**
   - `.gitignore`에 `.harness/` 추가
   - `.harness/.env` 템플릿 작성 (`.harness/.env.example`을 저장소에 커밋)
   - 각 JSON 파일의 스키마 정의 (`docs/harness-schema.md` 또는 JSON Schema)
   - `run.json`: `{ runId, ticketId, currentStep, startedAt, completedAt, status }`

2. **`.harness/.env` 초기화 스킬** (또는 `/run`의 첫 단계)
   - `.harness/.env`가 없으면 사용자에게 대상 프로젝트 경로를 물어 생성
   - `TARGET_PROJECT_DIR`이 유효한 git 저장소인지 검증
   - 선택적으로 `VERIFY_CMD`, `BRANCH_PREFIX` 설정

3. **아틀라스 헬퍼 스크립트** (`.claude/skills/shared/`)
   - `load-env.sh`: `.harness/.env`를 읽어 환경변수로 export
   - `read-harness.sh`: 지정된 JSON 파일을 읽어 stdout에 출력
   - `write-harness.sh`: stdin에서 JSON을 받아 지정된 경로에 저장
   - 스킬 SKILL.md에서 `source .claude/skills/shared/load-env.sh` 형태로 호출

4. **기존 타입 재활용**
   - `ParsedRequirements`, `RiskAssessment`, `ExecutionPlan`, `TaskExecutionState` 등
   - 스킬의 출력 JSON 스키마로 그대로 사용
   - 타입 정의를 `shared/ipc.ts`에서 `docs/harness-schema.md`로 이전 (TS 의존 제거)

### 산출물
- `.harness/.env.example` (커밋됨)
- `.claude/skills/shared/` 헬퍼 스크립트
- `.harness/` 디렉토리 규약

---

## Phase 2: 핵심 스킬 구현

### 2-0. `/ingest` 스킬

**전제**: `.harness/.env`의 Jira 설정 (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
**입력**: Jira 티켓 키 (예: `PROJ-123`)
**출력**: `.harness/ticket.json`

**SKILL.md 핵심 로직**:
1. `.harness/.env`에서 Jira 설정을 확인한다
2. Python 스크립트를 실행한다:
   ```bash
   python3 .claude/skills/shared/scripts/fetch_jira_ticket.py PROJ-123
   ```
3. 스크립트가 티켓 + 서브태스크 + 링크를 수집하여 `.harness/ticket.json`에 저장
4. 결과 요약을 터미널에 출력 (티켓 제목, 서브태스크 수, 링크 수)

**`fetch_jira_ticket.py` 역할**:
- `.harness/.env`에서 Jira 인증 정보 로드
- REST API (`/rest/api/3/issue/{key}`) 호출
- 서브태스크·이슈 링크를 재귀적으로 수집
- 정규화된 JSON 구조로 `.harness/ticket.json` 출력
- 의존: `requests` (pip install)

### 2-1. `/analyze` 스킬

**전제**: `.harness/.env`의 `TARGET_PROJECT_DIR` 확인
**입력**: 티켓 ID 또는 `.harness/ticket.json`
**출력**: `.harness/requirements.json`, `.harness/risk.json`

**SKILL.md 핵심 로직**:
1. `.harness/.env`에서 `TARGET_PROJECT_DIR`을 읽고 대상 프로젝트를 확인한다
2. `.harness/ticket.json`을 읽는다 (없으면 사용자에게 티켓 정보 요청)
3. 대상 프로젝트의 코드베이스를 탐색하여 관련 파일·구조를 파악한다
4. 티켓 설명을 분석하여 구조화된 요구사항을 추출한다:
   - 인수 기준 (acceptance criteria)
   - 테스트 시나리오
   - 구현 단계
   - 정책/규칙
   - 누락 사항·모호한 점
5. 위험 요인을 평가한다 (low/medium/high)
6. 결과를 `.harness/requirements.json`, `.harness/risk.json`에 저장

**기존 코드 대응**: `graphs/pipeline/nodes/analyze.ts` + `assess-risk.ts`의 프롬프트 로직을 SKILL.md 지침으로 변환

### 2-2. `/plan` 스킬

**전제**: `.harness/.env`의 `TARGET_PROJECT_DIR` 확인
**입력**: `.harness/requirements.json`, `.harness/risk.json`
**출력**: `.harness/plan.json`

**SKILL.md 핵심 로직**:
1. `.harness/.env`에서 `TARGET_PROJECT_DIR`을 읽는다
2. requirements.json과 risk.json을 읽는다
3. 대상 프로젝트 구조를 탐색하여 각 태스크의 scope를 결정한다
4. 실행 가능한 태스크 목록을 생성한다:
   - 각 태스크: id, title, description, scope (editable_paths, forbidden_paths), linked_ac_ids, verify_cmd, dependencies
5. 실행 순서(execution_order)를 결정한다
6. `.harness/plan.json`에 저장

**기존 코드 대응**: `graphs/pipeline/nodes/plan.ts`

### 2-3. `/execute` 스킬 (핵심)

**입력**: `.harness/plan.json`, 태스크 ID (선택)
**출력**: `.harness/tasks/{task-id}.json`, 실제 코드 변경

**SKILL.md 핵심 로직**:
1. plan.json에서 실행할 태스크를 선택한다 (지정 없으면 execution_order 순서대로)
2. 태스크별로:
   a. **코드 생성**: 태스크 설명과 scope 제약을 준수하여 코드를 수정한다 (Claude Code의 Read/Write/Edit 직접 사용)
   b. **자체 검증**: verify_cmd이 있으면 `Bash`로 실행한다
   c. **스코프 검증**: `git diff --name-only`로 변경된 파일이 editable_paths 내에 있는지 확인한다
   d. **결과 기록**: `.harness/tasks/{task-id}.json`에 changeSets, verification 결과 저장
   e. **커밋**: 검증 통과 시 `git add` + `git commit`

3. 검증 실패 시:
   - 실패 사유를 보여주고 수정 시도 (최대 3회)
   - 3회 초과 시 사용자에게 판단 위임

**기존 코드 대응**: `graphs/task/nodes/` 전체 (generate, explain, verify, evaluate, revise, approval-gate, apply, post-verify)

**핵심 차이점**: CliLlm 래퍼 없이 Claude Code 자체가 직접 코드를 읽고 수정한다. "자기 자신이 에이전트"가 되는 구조.

### 2-4. `/verify` 스킬

**입력**: `.harness/plan.json` (verify_cmd 참조)
**출력**: `.harness/verify.json`

**SKILL.md 핵심 로직**:
1. plan.json에서 각 태스크의 verify_cmd를 수집한다
2. 전체 빌드 + 테스트를 실행한다 (`Bash` 도구)
3. 실패 시 원인을 분석하고 `.harness/verify.json`에 기록한다

**기존 코드 대응**: `graphs/task/nodes/post-verify.ts`

### 2-5. `/run` 스킬 (오케스트레이터)

**입력**: 티켓 정보 (사용자 제공 또는 `.harness/ticket.json`)
**출력**: 전체 파이프라인 실행

**SKILL.md 핵심 로직**:
1. `.harness/.env` 검증 (`TARGET_PROJECT_DIR`, Jira 설정)
2. `.harness/` 초기화 (기존 상태 파일 백업 또는 삭제)
3. `/ingest` → `/analyze` → `/plan` → `/execute` → `/verify` 순서로 실행
4. 각 단계 완료 시 `run.json` 업데이트
5. 특정 단계부터 재시작 가능: `/run --from=plan`

**구현 방식**: SKILL.md에서 각 단계의 지침을 인라인 참조하거나, 단계별 스킬을 순차 호출.

---

## Phase 3: 기존 코드 정리

### 제거 대상

| 경로 | 이유 |
|------|------|
| `electron/services/langchain/cli-llm.ts` | Claude Code가 직접 실행하므로 CLI 래핑 불필요 |
| `electron/services/langchain/graphs/pipeline/` | 스킬로 대체 |
| `electron/services/langchain/graphs/task/` | 스킬로 대체 |
| `electron/services/automation/automation-service.ts` | 오케스트레이션이 스킬로 이동 |
| `electron/services/automation/run-state-store.ts` | `.harness/` 파일로 대체 |
| `electron/services/automation/task-state-store.ts` | `.harness/tasks/` 파일로 대체 |
| `electron/services/automation/run-log-service.ts` | Claude Code 자체 로그로 대체 |
| `packages/cli-runtime/` | CliLlm과 함께 불필요해짐 |

### 제거 대상 (추가 — Electron 앱 전체)

| 경로 | 이유 |
|------|------|
| `apps/desktop/electron/` 전체 | 메인 프로세스 전체 제거 |
| `apps/desktop/src/` 전체 | 렌더러 전체 제거 |
| `apps/desktop/shared/ipc.ts` | IPC 계약 불필요 |
| `apps/desktop/` 빌드 설정 | Electron 앱 빌드 불필요 |

### 보존 대상

| 경로 | 이유 |
|------|------|
| `.claude/skills/` | 스킬 기반 아틀라스의 핵심 |
| `.harness/` (신규) | 실행 상태 파일 |
| `CLAUDE.md` | 프로젝트 규칙 (스킬 기반으로 내용 갱신 필요) |

---

## Phase 4: Electron 앱 및 레거시 코드 완전 제거

### 목표
`apps/desktop/` 전체와 `packages/cli-runtime/`을 제거하고, 프로젝트를 스킬 전용 구조로 정리한다.

### 작업

1. **`apps/desktop/` 삭제**
   - Electron 메인 프로세스, 렌더러, shared 전체 삭제
   - `package.json`에서 desktop 관련 스크립트 제거

2. **`packages/cli-runtime/` 삭제**
   - CliLlm, provider 추상화, 파서 모두 불필요

3. **루트 설정 정리**
   - `pnpm-workspace.yaml`에서 desktop, cli-runtime 제거
   - `turbo.json` 파이프라인 정리
   - `CLAUDE.md`를 스킬 기반 구조에 맞게 전면 갱신

4. **프로젝트 구조 최종 형태**:
   ```
   atlas-engine/
   ├── .claude/
   │   ├── skills/          스킬 정의 (핵심)
   │   └── settings.json
   ├── .harness/            실행 상태 (gitignore)
   ├── CLAUDE.md            프로젝트 규칙
   └── docs/                문서
   ```

---

## 실행 순서 및 우선순위

```
Phase 1 ──→ Phase 2-0 ──→ Phase 2-1 ──→ Phase 2-2 ──→ Phase 2-3 ──→ Phase 2-4
  (상태)     (ingest)      (analyze)     (plan)       (execute)     (verify)
                                                           ↓
                                                       Phase 2-5
                                                        (run)
                                                           ↓
                                                       Phase 3 + 4
                                                (레거시 코드 전체 제거)
```

- **Phase 1~2**: 스킬 구현에 집중. 기존 Electron 코드는 참조만 한다.
- **Phase 3+4**: 스킬 동작 확인 후 `apps/desktop/`, `packages/cli-runtime/` 일괄 제거.

---

## 스킬 SKILL.md 작성 패턴

기존 commit 스킬의 패턴을 따른다:

```markdown
# 스킬 이름

한 줄 설명.

## 실행 지침

### 1단계: 입력 수집
(아틀라스 파일 읽기 또는 사용자 입력)

### 2단계: 핵심 로직
(Claude Code에게 수행할 작업을 단계별로 지시)

### 3단계: 출력 저장
(결과를 .harness/ 에 저장)

### 4단계: 사용자 확인
(필요시 결과 요약 표시)
```

**핵심**: SKILL.md는 "Claude Code가 이 지침을 읽고 자율적으로 수행하는" 프롬프트다.
LLM 호출 프롬프트(기존 `buildXxxPrompt` 함수)의 내용을 SKILL.md 지침으로 자연스럽게 흡수한다.

---

## 예상 효과

| 항목 | AS-IS | TO-BE |
|------|-------|-------|
| 단일 단계 테스트 | 앱 실행 → 티켓 선택 → 전체 실행 | `/analyze` 한 줄 |
| 디버깅 | Electron 로그 + LangGraph 상태 + CLI stdout 교차 확인 | `.harness/*.json` 직접 확인 |
| 실행 계층 | 5개 (Renderer → IPC → Service → LangGraph → CliLlm → CLI) | 1개 (Claude Code 직접) |
| 상태 저장소 | SQLite + 메모리 캐시 | JSON 파일 (git-friendly) |
| 재실행 | 앱 재시작 → UI 조작 | `/execute task-2` |
| CI 통합 | 불가능 (GUI 필수) | 가능 (`claude -s /run`) |

---

## 위험 및 완화

| 위험 | 완화 |
|------|------|
| 스킬 프롬프트가 길어지면 Claude Code가 지침을 놓칠 수 있음 | 단계별로 스킬을 분리하고, 각 스킬은 단일 책임 유지 |
| `.harness/` JSON 스키마 변경 시 호환성 깨짐 | `shared/ipc.ts`의 타입을 단일 소스로 유지, 버전 필드 추가 |
| 병렬 태스크 실행이 어려움 (Claude Code는 순차 실행) | 초기에는 순차 실행. 병렬이 필요하면 여러 Claude Code 세션을 스크립트로 관리 |
| 결과 시각화 수단이 없음 (GUI 제거) | `.harness/*.json` 파일을 직접 확인하거나, 스킬에서 터미널 요약 출력 |

---

## 부록: 기존 프롬프트 → 스킬 지침 매핑

| 기존 함수 | 스킬 | 변환 방식 |
|-----------|------|-----------|
| `ingest()` (ingest.ts) | `/ingest` | Python 스크립트 `fetch_jira_ticket.py`로 대체 |
| `buildAnalyzePrompt()` (analyze.ts) | `/analyze` | 프롬프트 내용을 SKILL.md "2단계" 지침으로 변환 |
| `buildRiskPrompt()` (assess-risk.ts) | `/analyze` | 위험 평가를 analyze 스킬에 통합 |
| `buildPlanPrompt()` (plan.ts) | `/plan` | 프롬프트 → SKILL.md 지침 |
| `buildGeneratePrompt()` (generate.ts) | `/execute` | Claude Code가 직접 코드 수정하므로 프롬프트 불필요, scope 제약만 지침으로 |
| `buildExplainPrompt()` (explain.ts) | `/execute` | 커밋 메시지에 설명 통합 |
| `buildVerifyPrompt()` (verify.ts) | `/execute`, `/verify` | Bash 도구로 직접 실행 |
| `buildRevisePrompt()` (revise.ts) | `/execute` | 검증 실패 시 재시도 루프를 스킬 지침에 포함 |
| `buildPostVerifyPrompt()` (post-verify.ts) | `/verify` | Bash 도구로 직접 실행 |
