# Atlas 설계 진화: v0.2 → v0.4.0

Claude Code 기반 오케스트레이션 설계와 결과물 퀄리티를 중심으로 정리한다.

참조 아키텍처: Jira 기반 완주(Completion) 엔진 v2.3

---

## 0. 참조 아키텍처의 핵심 원칙

Atlas의 설계 진화를 이해하려면, 상위 아키텍처가 고정한 3축을 먼저 짚어야 한다.

### 3축 (고정, 변경 불가)

1. **WorkOrder(계약)**: 무엇을 해야 하는가 — 원자 작업 단위의 명세
2. **Evidence(증거)**: Done을 "말"이 아니라 증거로 판정한다
3. **Traceability(추적성)**: 요구사항 → 작업 → 증거의 전체 체인을 추적할 수 있다

### 제어 이원화 원칙

> AI의 판단은 줄이고, **결정론적 실행(Tool)**과 **우회 불가 규율(Hook)**을 늘린다.

이 원칙이 Atlas 설계의 각 전환을 관통한다. 버전이 올라갈수록 LLM 판단 영역은 코드 생성에 집중시키고, 검증·증거·스코프 제어는 결정론적 도구와 훅으로 이관한다.

### 참조 아키텍처의 구성 요소

| 구성요소 | 타입 | Atlas에서의 대응 |
|----------|------|-----------------|
| Orchestrator | Agent | SKILL.md (파이프라인 전체) |
| Implementer | Agent | LLM 자유 실행 영역 |
| Verifier | Agent/Tool | validate.sh + 레드팀 에이전트 |
| ScopeGuardHook | Hook | scope-guard.sh (v0.4.0) |
| AtlasHook | Hook | completion-gate.sh (v0.4.0) |
| Evidence | Artifact | evidence/ 디렉토리 산출물 |
| WorkOrder | Store→Artifact | task-{id}.json |

---

## 1. 핵심 전환: 사전 제약 → 사후 검증 → 물리적 강제

| 버전 | 제어 방식 | v2.3 원칙과의 관계 |
|------|----------|-------------------|
| v0.2 | 사전 제약 (Pre-constraint) | Tool 과잉 — LLM을 절차 수행자로 격하 |
| v0.3 | 사후 검증 (Post-validation) | Tool/Hook 분리 시작 — LLM을 코드 생성자로 복원 |
| v0.3.8 | 사후 검증 + 감사 | Evidence 강화 — 의미론적 검증 추가 |
| v0.4.0 | 물리적 강제 (RALP) | Hook 우회 불가 달성 — 규율의 물리적 강제 |

---

## 2. v0.2 — 오케스트레이터 패턴

### 설계 철학

LLM을 신뢰하지 않는다. 모든 파일 접근 전에 정책을 확인하고, 모든 단계에 스키마를 강제하며, 상태 머신으로 진행을 통제한다.

### 파이프라인

```
learn → analyze → plan → execute → complete
```

5단계. `plan`에서 의존성 그래프와 실행 계획을 JSON으로 생성하고, `complete`에서 최종 검증을 수행한다.

### 제어 메커니즘

- **File Policy Guard**: `check-file-policy.sh`를 **모든 Write/Edit 전에** 호출. LLM이 허용된 파일만 수정할 수 있도록 사전 차단.
- **정책 레지스트리**: `policy-registry.json`에 파일별 읽기/쓰기 권한을 명시적으로 선언.
- **스키마 강제**: 8개 JSON 스키마로 모든 산출물 구조를 규정.
- **상태 머신**: 5단계 상태(`pending → in_progress → verified/failed`) + 훅 체인으로 전이 관리.

### 산출물 구조

```
tickets/
├── {TICKET}/
│   ├── L0-epic.json
│   ├── L1-stories/
│   │   └── S-{n}.json
│   ├── L2-tasks/
│   │   └── T-{n}.json
│   ├── dependency-graph.json
│   ├── policy-registry.json
│   └── execution-plan.json
```

3계층 티켓 분해(L0/L1/L2), 의존성 그래프, 정책 레지스트리, 실행 계획 — 코드 생성 전에 4종의 메타 파일을 생성해야 한다.

### 규모

| 지표 | 수치 |
|------|------|
| SKILL.md | ~843줄 |
| Python 스크립트 | 4개 (1,500줄+) |
| JSON 스키마 | 8개 |
| Hooks | 10개+ |
| 상태 수 | 5개 |

### v2.3 관점에서의 문제 진단

v0.2는 v2.3의 "AI의 판단은 줄이고 결정론적 실행을 늘린다" 원칙을 **과잉 적용**했다.

| v2.3 원칙 | v0.2의 적용 | 문제 |
|-----------|------------|------|
| 결정론적 실행(Tool) | 모든 동작에 사전 정책 확인 스크립트 | Tool이 LLM의 코드 생성까지 통제 — Task당 Bash 9회 |
| 우회 불가 규율(Hook) | 10개+ 훅 체인 | 훅이 LLM 영역을 침범 — 컨텍스트 소진 |
| WorkOrder(계약) | execution-plan.json + policy-registry.json | 계약이 과도하게 복잡 — 코드 생성 전 메타 4종 필요 |
| Evidence(증거) | validated.json | 증거는 있으나 검증 게이트가 단일 |
| Orchestrator 책임 분리 | Orchestrator가 모든 절차를 직접 실행 | "판단만 하고 실행은 위임" 원칙 위반 |

핵심 실패: **스크립트가 유틸리티가 아니라 로직을 대체했다.** LLM이 스크립트 출력을 전달하는 메신저로 전락. v2.3이 말하는 "Orchestrator는 판단만, 실행은 스킬에 위임"의 정반대.

---

## 3. v0.3 — Harness 패턴

### 설계 전환

> "사전 제약에서 사후 검증으로"

v0.2의 핵심 교훈: LLM은 "하지 마라"보다 "해봐라, 틀리면 고쳐라"에서 더 좋은 코드를 생성한다.

### 파이프라인

```
learn → analyze → execute
```

3단계. `plan`과 `complete`를 제거. 계획은 LLM이 execute 중에 자유롭게 수행하고, 완료 검증은 `validate.sh`가 대체한다.

### Harness 패턴

```
setup → [ LLM 자유 실행 ] → [ LLM 레드팀 ] → validate.sh → teardown
         ↑ LLM 영역                              ↑ 스크립트 영역
```

이 패턴이 v2.3의 구성 요소와 자연스럽게 대응된다:

| Harness 영역 | v2.3 대응 | 설명 |
|-------------|----------|------|
| LLM 자유 실행 | Implementer (Work Plane) | 코드 변경, 스코프 내 자유 실행 |
| LLM 레드팀 | Verifier 일부 (Quality Plane) | 생성 코드 자체 검증 |
| validate.sh | Runner + Verifier (Quality Plane) | 결정론적 검증 (빌드, 린트, 스코프) |
| setup/teardown | Orchestrator (조율) | 환경 준비/정리 |

### 제어 메커니즘 변화

| v0.2 | v0.3 |
|------|------|
| file-policy guard (사전 차단) | scope check in validate.sh (사후 검증) |
| 8개 JSON 스키마 | 스키마 최소화 |
| 5단계 상태 머신 | 2단계 (pending → done/failed) |
| Python 스크립트 4개 | Bash 스크립트 (common.sh + validate.sh) |
| policy-registry.json | 제거 |
| dependency-graph.json | 제거 |
| execution-plan.json | 제거 |

### 산출물 구조

```
.automation/
├── conventions.json
└── runs/{TICKET}-{TIMESTAMP}/
    ├── source.json
    ├── tasks/
    │   ├── index.json
    │   └── task-{id}.json
    └── evidence/
        ├── learn/done.json
        ├── analyze/done.json
        └── execute/done.json
```

3계층 티켓 트리 → 플랫한 task 파일. 의존성·정책·실행계획 메타 파일 전부 제거. 증거는 `done.json` 하나로 단순화.

### validate.sh — 3개 게이트

```bash
# Gate 1: scope — 허용 파일 외 수정 감지 (exit 1)
# Gate 2: build — 컴파일 성공 여부 (exit 2)
# Gate 3: lint  — 포맷 준수 여부 (exit 3)
```

file-policy가 10개+ 훅으로 사전 차단하던 것을, validate.sh 한 번의 사후 검증으로 대체.

### v2.3 관점에서의 진전과 한계

**진전:**

| v2.3 원칙 | v0.3의 개선 |
|-----------|------------|
| Implementer 자유 실행 | LLM이 코드 생성에 집중 — 사전 차단 제거 |
| Tool은 유틸리티 | validate.sh가 검증 전담, 로직은 LLM 영역 |
| 상태 최소화 | 2단계 (pending → done/failed) |
| Evidence 기반 판정 | git diff + 빌드 결과가 증거 |

**한계:**

| v2.3 원칙 | v0.3의 미달 |
|-----------|------------|
| 우회 불가 규율(Hook) | validate.sh 실행은 프롬프트 지시 — LLM이 건너뛸 수 있음 |
| ScopeGuardHook (사전 차단) | scope 검증이 사후에만 존재 — 위반 코드가 이미 생성된 후 발견 |
| Failure Taxonomy + 재시도 | 실패 시 분류 체계 없음 — 재시도 전략 부재 |
| DoR/DoD 게이트 | 형식적/의미적 게이트 구분 없음 |
| WorkOrder 불변성 | task 파일이 mutable — 재시도 시 덮어쓰기 |

### 규모 변화

| 지표 | v0.2 | v0.3 |
|------|------|------|
| 파이프라인 단계 | 5 | 3 |
| 스크립트 | Python 4개 (1,500줄) | Bash 2개 |
| 스키마 | 8개 | 최소화 |
| 상태 수 | 5 | 2 |
| Task당 Bash 호출 | ~9회 | ~3회 |

---

## 4. v0.3.8 — Audit 도입 + 운영 안정화

### 추가된 것

v0.3의 구조를 유지하면서 두 가지를 추가한다:

1. **Audit 단계**: conventions.json 기반 의미론적 감사
2. **운영 옵션**: `--force`, `--refresh-conventions`

### 파이프라인

```
learn → analyze → execute → audit
```

`audit`가 추가되어 4단계. execute에서 생성된 전체 코드를 conventions.json 기준으로 카테고리별 병렬 감사한다.

### Audit 설계

```
audit
├── naming      ← 네이밍 컨벤션 검증
├── style       ← 코드 스타일 검증
├── annotations ← 어노테이션 패턴 검증
├── patterns    ← 설계 패턴 준수 검증
├── forbidden   ← 금지 패턴 위반 검증
└── required    ← 필수 규칙 누락 검증
```

카테고리별 병렬 에이전트가 독립적으로 감사. high 위반 발견 시 수정 + fix 커밋.

이 설계는 v2.3의 **Quality Plane** 개념과 대응된다. Verifier + Runner가 기계적 검증(빌드, 린트)을 담당하고, audit 에이전트가 의미론적 검증(컨벤션 준수)을 담당하는 2계층 구조.

### 증거 구조 확장

```
evidence/
├── execute/
│   └── task-{id}/           ← Task별 증거 폴더 (v0.3의 플랫 구조에서 변경)
│       ├── generate.json
│       ├── redteam-{layer}.json
│       ├── redteam-summary.json
│       ├── validate.json
│       └── commit.json
└── audit/
    ├── audit-{category}.json
    ├── audit-summary.json
    ├── audit-fix.json
    └── done.json
```

v2.3의 **Artifact 불변 원칙**에 가까워졌다. Task별·카테고리별로 증거를 원자화하여 추적 가능.

### validate.sh 확장 — Domain Lint

```bash
# Gate 4: domain-lint (exit 4)
# conventions.json의 domain_lint 규칙을 코드에 적용
```

3개 게이트 → 4개 게이트. `domain_lint` 규칙 타입:
- `require_guard`: 특정 조건이 있으면 guard 패턴 필수 (예: mutable 금액 필드 → @Version)
- `forbidden_name`: DB 예약어와 테이블명 충돌 감지
- `method_guard`: 상태 전이 메서드에 guard 조건 필수

이것은 v2.3의 **Spec/Policy Agent**가 추출하는 `constraints`(must_do, must_not, scope_restriction)를 프로젝트 컨벤션 수준에서 자동화한 것이다. conventions.json이 정책 문서 역할.

### v2.3 관점에서의 진전

| v2.3 원칙 | v0.3.8의 개선 |
|-----------|-------------|
| Evidence 원자화 | Task별 증거 폴더, 카테고리별 감사 증거 |
| Spec/Policy 검증 | conventions.json + domain-lint로 프로젝트 규칙 자동 검증 |
| Quality Plane | audit 에이전트가 의미론적 검증 계층 추가 |
| 재시도 안정성 | --force로 깨끗한 재실행 보장 |

### 운영 개선

| 기능 | 설명 |
|------|------|
| `--force` | 항상 새 run 생성, 기존 run 이어가기 금지 |
| `--refresh-conventions` | conventions.json 강제 재생성 |
| `meta.json` | run별 메타데이터 (atlas_version, ticket_key, created_at) |
| `resolve_or_create_run()` | --force 여부에 따라 새 run/기존 run 자동 분기 |

---

## 5. v0.4.0 — Claude Code Hooks + RALP 루프

### 설계 전환

> "프롬프트 지시에서 물리적 강제로"

v0.3~v0.3.8의 한계: validate.sh를 "실행하라"고 프롬프트에 적어도, LLM이 건너뛸 수 있다. 프롬프트는 요청이지 강제가 아니다.

v2.3 원칙: **"AI의 판단은 줄이고, 우회 불가 규율(Hook)을 늘린다."**

v0.4.0은 Claude Code Hooks를 도입하여, 이 원칙을 Claude Code 환경에서 물리적으로 구현한다.

### RALP 루프

```
Read → Act → Lint → Prove
                ↑ PostToolUse    ↑ Stop
                자동 빌드 체크    증거 없으면 응답 종료 차단
```

- **Read**: Task 읽기
- **Act**: 코드 생성 (LLM 자유 실행 — Implementer 영역)
- **Lint**: PostToolUse 훅이 매 편집 후 자동으로 빌드 체크, 에러를 LLM에 피드백
- **Prove**: Stop 훅이 validate.sh PASS 증거 없이는 응답 종료를 물리적으로 차단

### Claude Code Hooks → v2.3 Hook 대응

| Atlas Hook | Claude Code 이벤트 | v2.3 대응 | 역할 |
|------------|-------------------|----------|------|
| `scope-guard.sh` | PreToolUse(Write\|Edit) | ScopeGuardHook | forbidden path 물리적 차단 (사전) |
| `post-edit-lint.sh` | PostToolUse(Write\|Edit) | Runner (즉시 피드백) | 편집 후 자동 빌드 체크 + 에러 피드백 |
| `evidence-collector.sh` | PostToolUse(Bash) | DoDHook 일부 | validate.sh 결과 자동 수집 |
| `completion-gate.sh` | Stop | AtlasHook + DoDHook | validate 증거 없으면 응답 종료 차단 |
| `session-init.sh` | SessionStart | 환경 초기화 | ATLAS_* 환경변수 초기화 |

핵심: 모든 훅은 Claude Code 런타임이 실행한다. LLM이 "훅을 건너뛰겠다"고 선언해도 물리적으로 실행된다. 이것이 v2.3이 말하는 **"우회 불가 규율"**의 Claude Code 구현.

### v2.3의 Hook 이원화와 Atlas의 접근 차이

v2.3은 형식적 게이트(Hook)와 의미적 게이트(ScrumMaster)를 구분한다:

| 구분 | v2.3 | Atlas v0.4.0 |
|------|------|-------------|
| 형식적 게이트 | DoRHook, DoDHook (기계적, 결정론적) | validate.sh (scope, build, lint, domain-lint) |
| 의미적 게이트 | ScrumMaster Agent (판단 필요) | 레드팀 에이전트 (LLM 기반 검증) |
| 우회 가능성 | 둘 다 불가 | Hook은 불가, 레드팀은 프롬프트 지시 |

Atlas는 형식적 게이트를 Hook으로 물리적 강제하는 데 성공했으나, 의미적 게이트(레드팀)는 여전히 프롬프트 수준에 머물러 있다.

### Hooks 활성화/비활성화

```bash
# 파이프라인 시작 시
export ATLAS_ACTIVE=1
export ATLAS_PROJECT_ROOT="${PROJECT_ROOT}"
export ATLAS_CONVENTIONS="${PROJECT_ROOT}/.automation/conventions.json"
export ATLAS_RUN_DIR="${RUN_DIR}"

# 파이프라인 종료 시
export ATLAS_ACTIVE=
export ATLAS_CURRENT_TASK=
export ATLAS_SCOPE_FILES=
export ATLAS_RETRY_COUNT=0
```

`ATLAS_ACTIVE=1`일 때만 훅이 작동한다. 파이프라인 밖에서는 일반 Claude Code로 동작.

### v0.3.8과의 구조적 차이

파이프라인 단계(learn → analyze → execute → audit)는 동일하다. 차이는 **실행 메커니즘**:

| 관점 | v0.3.8 | v0.4.0 |
|------|--------|--------|
| scope 제어 | validate.sh에서 사후 확인 | PreToolUse 훅이 편집 시점에 차단 |
| 빌드 체크 | validate.sh에서 일괄 확인 | PostToolUse 훅이 매 편집 후 즉시 확인 |
| 완료 검증 | 프롬프트가 validate.sh 실행을 지시 | Stop 훅이 증거 없으면 종료 차단 |
| 피드백 루프 | LLM이 자발적으로 재시도 | 훅이 에러를 LLM에 자동 피드백, 재시도 강제 |

---

## 6. 버전별 비교 요약

### 제어 메커니즘 진화

```
v0.2:  [정책 확인] → [코드 생성] → [정책 확인] → [코드 생성] → ...
       매 동작마다 사전 차단. LLM 자유도 최소.

v0.3:  [코드 생성 ... 자유 실행 ...] → [validate.sh]
       자유 실행 후 사후 검증. LLM 자유도 최대.

v0.3.8: [코드 생성 ... 자유 실행 ...] → [validate.sh + domain-lint] → [audit]
        사후 검증 강화 + 의미론적 감사 추가.

v0.4.0: [코드 생성 ←lint→ 자동 피드백] → [validate.sh] → [증거 없으면 종료 차단]
        매 편집마다 자동 피드백 + 물리적 완료 게이트.
```

### 정량 비교

| 지표 | v0.2 | v0.3 | v0.3.8 | v0.4.0 |
|------|------|------|--------|--------|
| 파이프라인 단계 | 5 | 3 | 4 | 4 |
| 상태 수 | 5 | 2 | 2 | 2 |
| 스크립트 | Python 4개 | Bash 2개 | Bash 2개 | Bash 2개 + Hook 5개 |
| 메타 파일 (코드 생성 전) | 4종 | 0종 | 0종 | 0종 |
| 사전 차단 | file-policy (매 동작) | 없음 | 없음 | scope-guard (편집 시) |
| 사후 검증 게이트 | 1 | 3 | 4 | 4 + 물리적 종료 차단 |
| LLM 컨텍스트 소모 | 높음 | 낮음 | 낮음 | 낮음 (훅이 자동 처리) |

### v2.3 3축 달성도

| 3축 | v0.2 | v0.3 | v0.3.8 | v0.4.0 |
|-----|------|------|--------|--------|
| **WorkOrder** | 과잉 (4종 메타) | 최소화 (task.json) | task.json + meta.json | task.json + meta.json |
| **Evidence** | validated.json (단일) | done.json (단일) | 원자화 (Task별·카테고리별) | 원자화 + 자동 수집 |
| **Traceability** | 의존성 그래프로 시도 | run 단위 격리 | run + Task별 증거 체인 | run + Task별 + Hook 자동 기록 |

---

## 7. 각 전환의 핵심 인사이트

### v0.2 → v0.3: "LLM을 풀어줘라"

v0.2는 v2.3의 "결정론적 실행을 늘린다" 원칙을 **과잉 해석**했다. 결정론적 도구가 LLM의 코드 생성 영역까지 침범하여, LLM이 절차 준수에 컨텍스트를 소모했다.

v0.3의 발견: **LLM은 자유롭게 실행할 때 더 좋은 코드를 생성한다.** v2.3의 본래 의도대로, Tool은 검증 유틸리티로, LLM은 Implementer로 역할을 분리해야 한다.

### v0.3 → v0.3.8: "검증을 깊게"

v0.3의 3개 게이트(scope, build, lint)는 구문적 검증이다. "컴파일되는가"는 확인하지만 "프로젝트 규칙에 맞는가"는 잡지 못한다.

v0.3.8의 추가: **domain-lint + audit로 의미론적 검증**. v2.3의 Spec/Policy Agent가 하는 역할을 conventions.json + domain-lint 규칙으로 자동화. Quality Plane에 의미론적 계층을 추가.

### v0.3.8 → v0.4.0: "프롬프트를 넘어 물리적으로"

v0.3.8까지는 "validate.sh를 실행하라"가 프롬프트 지시였다. LLM이 건너뛸 수 있다.

v2.3 원칙: **"우회 불가 규율(Hook)"**. v0.4.0은 Claude Code Hooks로 이 원칙을 물리적으로 구현.

- **scope-guard**: 프롬프트 지시가 아니라, Write/Edit 시점에 런타임이 차단
- **post-edit-lint**: 프롬프트 요청이 아니라, 매 편집 후 런타임이 빌드 체크
- **completion-gate**: 프롬프트 약속이 아니라, 증거 없으면 런타임이 종료 차단

이것이 RALP(Read-Act-Lint-Prove)의 핵심: **Lint와 Prove가 LLM의 의지와 무관하게 실행된다.**

---

## 8. v2.3 대비 현재 갭 분석

Atlas v0.4.0이 v2.3 참조 아키텍처 대비 도달한 지점과 남은 갭.

### 달성된 것

| v2.3 개념 | Atlas 구현 | 비고 |
|-----------|-----------|------|
| Hook 우회 불가 | Claude Code Hooks (5개) | 런타임 레벨 강제 |
| Evidence 기반 판정 | validate.sh + evidence/ | 증거 없으면 완료 불가 |
| Scope 이중화 | PreToolUse(사전) + validate.sh(사후) | v2.3의 ScopeGuardHook + RepoAdapter |
| Tool/LLM 영역 분리 | Harness 패턴 (v0.3+) | LLM은 코드 생성, Tool은 검증 |
| Artifact 원자화 | Task별·카테고리별 증거 (v0.3.8+) | 추적 가능한 증거 체계 |
| 컨벤션 자동 검증 | conventions.json + domain-lint | 프로젝트 규칙 결정론적 검증 |

### 남은 갭 — 각 항목의 이유

#### WorkOrder 불변성 (frozen)

> v2.3: frozen된 WorkOrder는 수정 불가. 재시도 시 새 WO를 생성하고, 이전 WO는 artifacts/workorder/에 보존.

**현재**: task.json은 mutable. 재시도 시 status 필드를 덮어쓴다.

**이유 — v0.2에서 시도했다가 제거한 것**: v0.2는 execution-plan.json, dependency-graph.json 등 불변 산출물을 여러 개 관리했다. 코드 생성 전에 4종의 메타 파일을 먼저 만들어야 했고, 이 파일들의 정합성을 유지하는 데 LLM 컨텍스트가 소모되었다. v0.3에서 이 메타 파일들을 전부 제거하면서 task.json 하나로 단순화했는데, 이때 불변성 개념까지 함께 걷어냈다.

**갭인가 의도인가**: v0.2의 실패를 과잉 보정한 결과다. 불변성 자체가 문제였던 게 아니라, 불변 파일의 **수량과 복잡도**가 문제였다. task.json 하나를 frozen으로 만들고 재시도 시 새 파일을 생성하는 것은 v0.2 수준의 복잡도를 유발하지 않는다. 실행 메커니즘(Hook)이 안정화된 현 시점에서 도입 가능한 갭.

#### Failure Taxonomy

> v2.3: 7종 분류(flaky, deterministic, env, dependency, test_gap, spec_gap, scope_violation). 분류에 따라 재시도 전략이 달라진다.

**현재**: 실패 시 분류 없이 RALP 루프를 최대 5회 재시도. 매번 같은 전략.

**이유 — 설계 초점이 달랐다**: 어떤 버전에서도 Failure Taxonomy를 시도한 적이 없다. v0.2는 5단계 상태(pending → in_progress → verified/failed)를 가졌지만 실패의 **원인**을 분류하지 않았고, v0.3~v0.4.0도 done/failed 이분법이다.

이것은 단순히 "빼먹은 것"이 아니라, 위에서 설명한 **재시도 최소화 전략의 결과**다. Atlas는 learn 단계의 conventions.json으로 컨벤션 위반을 사전 예방하고, domain-lint로 위반을 실행 중에 잡고, post-edit-lint Hook으로 편집 즉시 피드백한다. 이 3중 장치가 "처음부터 맞는 코드"를 만드는 데 집중하므로, "실패 후 어떻게 복구할 것인가"에 대한 투자 우선순위가 자연스럽게 낮아졌다.

실제로 v0.3.8에서 도입한 `learned_from_failures`(conventions.json에 축적되는 과거 실패 패턴)는 v2.3의 Failure Taxonomy와 **목적은 같되 방향이 반대**다:

- v2.3: 실패 발생 → 분류 → 분류별 재시도 전략 적용 (사후 대응)
- Atlas: 과거 실패 패턴 → conventions.json에 흡수 → 다음 실행에서 동일 실패 사전 차단 (사전 예방)

다만, env(환경 문제), dependency(의존성 충돌), spec_gap(요구사항 모호) 같은 실패는 conventions.json으로 예방할 수 없는 영역이다. 이런 유형의 실패가 빈번해지면 Failure Taxonomy 도입이 필요해진다.

#### ContinuationHook

> v2.3: Evidence 파싱 → taxonomy 분류 → Continuation Artifact 생성 → 재시도/분해/에스컬레이션 자동 판단.

**현재**: 없음. 실패 시 LLM이 에러 메시지를 읽고 자체 판단으로 재시도.

**이유 — Failure Taxonomy 부재에 종속 + RALP가 경량 대체**: ContinuationHook은 Failure Taxonomy 위에서 작동한다. 분류가 없으면 분류 기반 전략도 없다.

하지만 Atlas에서 ContinuationHook의 핵심 기능 — "실패 후 다시 시도하게 만든다" — 은 RALP 루프가 대체하고 있다. completion-gate가 증거 없이는 종료를 차단하고, post-edit-lint가 에러를 즉시 피드백하므로, LLM이 "실패 → 에러 확인 → 수정 → 재검증"을 자연스럽게 반복한다. v2.3의 ContinuationHook이 "어떤 전략으로 재시도할 것인가"를 결정하는 **의사결정 엔진**이라면, Atlas의 RALP는 "에러가 있으니 고쳐라"는 **즉시 피드백 루프**다. 전략적이지는 않지만, learn 단계에서 컨벤션을 사전에 주입했기 때문에 대부분의 실패는 "conventions.json에 없는 프로젝트 특수 패턴"이거나 "빌드 의존성 문제"로 좁혀진다. 이 범위에서는 LLM의 자체 판단 + RALP 재시도만으로도 수렴하는 경우가 많다.

**갭인가 의도인가**: 현재는 의도적 생략. 다만 Failure Taxonomy와 마찬가지로, learn으로 예방할 수 없는 실패(env, dependency, spec_gap)가 빈번해지면, "어떤 전략으로 재시도할 것인가"를 판단하는 ContinuationHook의 가치가 커진다.

#### Store vs Artifact 분리

> v2.3: Store(현재 상태, 덮어쓰기 가능) vs Artifact(시도의 결과물, 내용 불변, 덮어쓰기 불가). 명확한 경계.

**현재**: evidence/만 Artifact 성격. task.json은 Store(현재 status)와 Artifact(생성 당시의 task 명세) 역할이 혼재.

**이유 — v0.3에서 의도적으로 통합한 것**: v0.2의 산출물 구조가 과도하게 분리되어 있었다(L0/L1/L2 티켓, dependency-graph, policy-registry, execution-plan). v0.3은 "하나의 파일로 하나의 역할"이 아니라 "최소 파일로 전체 기능"을 택했다. task.json이 명세이자 상태 추적이 된 것은 이 단순화의 부작용.

v0.3.8에서 evidence/를 Task별 폴더로 원자화하면서 Artifact 개념이 부분적으로 도입되었다. generate.json, redteam-summary.json, validate.json, commit.json — 이것들은 불변 산출물이다. 하지만 task.json 자체는 여전히 mutable Store로 남아 있다.

**갭인가 의도인가**: v0.2의 과잉 분리를 교정하는 과정에서 발생한 과소 분리. WorkOrder 불변성과 함께 해결할 수 있는 갭이다 — task.json을 "현재 상태를 추적하는 Store"와 "생성 시점의 명세를 보존하는 Artifact"로 분리하면 된다.

#### 모드(Mode) 시스템

> v2.3: fast/standard/strict 3모드. 모드별로 evidence_required, retry budget, timeout, 에스컬레이션 정책이 달라진다.

**현재**: 없음. 모든 실행이 동일한 검증 수준.

**이유 — 필요성이 아직 실증되지 않았다**: Atlas의 현재 사용 패턴은 "하나의 Jira 티켓을 입력하면 코드를 생성한다"는 단일 경로다. 모든 티켓에 동일한 검증(scope + build + lint + domain-lint)을 적용해도 문제가 되지 않았다.

v2.3의 모드 시스템은 **운영 환경**을 전제한다. "긴급 핫픽스는 fast로, 일반 작업은 standard로, 보안 관련은 strict로" — 이런 분기는 파이프라인이 실제 팀의 워크플로우에 통합된 후에 의미가 생긴다. Atlas는 아직 그 단계에 도달하지 않았다.

**갭인가 의도인가**: 의도적 후순위. 단일 모드로 파이프라인의 기본 동작을 안정화하는 것이 선행 과제. 모드 분기는 "기본 동작이 충분히 검증된 후" 추가하는 것이 안전하다 — v0.2가 처음부터 복잡한 설정을 도입했다가 기본 동작조차 불안정했던 경험이 근거.

#### DoR/DoD 형식적 게이트

> v2.3: DoRHook(Ready 판정 — 시나리오 섹션 존재, 스키마 충족)과 DoDHook(Done 판정 — evidence_required 3단계 검증)이 형식적 게이트로 분리.

**현재**: validate.sh가 Done 검증을 겸하고, Ready 판정은 analyze 단계에서 프롬프트 수준으로 수행.

**이유 — v0.3에서 게이트를 validate.sh로 통합한 것**: v0.2는 plan과 complete 단계에서 각각 Ready/Done을 검증했지만, 이 단계들이 컨텍스트를 과도하게 소모하여 v0.3에서 제거되었다. 대신 validate.sh가 build/lint/scope를 한 번에 검증하는 단일 게이트가 되었다.

v0.4.0에서 completion-gate.sh가 "증거 없으면 종료 차단"으로 DoDHook의 핵심 기능을 구현했다. 하지만 v2.3이 말하는 "evidence_required 키별 3단계 검증(키 존재 → null 금지 → 타입 유효)"까지는 가지 않는다. completion-gate는 "validate.sh PASS 기록이 있는가"만 확인한다.

**갭인가 의도인가**: DoD는 부분적으로 달성(completion-gate). DoR은 의도적으로 최소화. Ready 판정을 정교하게 할수록 analyze 단계가 무거워지고, v0.2의 plan 단계 문제가 재현될 위험이 있다. 현재는 "Jira 티켓에 충분한 정보가 있으면 task를 생성하고, 없으면 실행 중에 실패한다"는 fail-fast 전략.

#### ScrumMaster (의미적 게이트)

> v2.3: 형식적 게이트(Hook) 통과 후, ScrumMaster Agent가 리스크 수용, 추가 검증 필요성 등을 판단. HITL 트리거 조건도 정의.

**현재**: 레드팀 에이전트가 부분적으로 대체. 프롬프트 수준이므로 우회 가능.

**이유 — v0.3에서 레드팀으로 대체한 것**: v0.3은 LLM에게 자유를 주되, 자체 검증(레드팀)도 하라는 설계. 이것은 v2.3의 ScrumMaster와 목적은 같지만(의미론적 판단), 구현이 다르다:
- v2.3: ScrumMaster가 **독립 에이전트**로서 별도 컨텍스트에서 판정
- Atlas: 레드팀이 **서브에이전트**로서 메인 세션에서 분기하여 판정

v0.3.8에서 레드팀을 레이어별 병렬 에이전트(domain, schema, repository, service, batch)로 확장했다. 각 에이전트가 독립적으로 검증하므로 v2.3의 "독립 에이전트" 개념에 가까워졌다. 하지만 이 에이전트들은 프롬프트에 의해 호출되므로, LLM이 건너뛸 수 있다는 한계가 동일하다.

**갭인가 의도인가**: 구조적 제약. Claude Code에서 "의미적 판단을 우회 불가하게 만드는" 메커니즘이 현재 없다. Hook은 결정론적 스크립트만 실행할 수 있고, LLM 기반 판단을 Hook으로 강제하려면 Hook 안에서 별도 LLM을 호출해야 하는데, 이는 현재 Claude Code Hooks의 범위를 벗어난다.

#### Orchestrator 상태 독점

> v2.3: Store의 상태 변경은 Orchestrator만 수행. 다른 에이전트는 proposal만 전달하고, Orchestrator가 반영 여부를 결정.

**현재**: common.sh의 `update_task_status`, `complete_task`, `record_*_evidence` 함수가 상태 변경을 중앙화. 하지만 proposal 패턴은 없다.

**이유 — 단일 세션이므로 경합이 없다**: v2.3의 proposal 패턴은 **멀티 에이전트 환경**에서 상태 경합(race condition)을 방지하기 위한 것이다. Implementer와 Verifier가 동시에 todo.json을 수정하면 안 되니까.

Atlas는 단일 LLM 세션이다. 코드 생성과 검증이 순차적으로 실행되므로 상태 경합이 발생하지 않는다. common.sh 함수가 상태 변경을 중앙화한 것은 proposal 패턴의 **경량 버전**이라고 볼 수 있다 — 직접 JSON을 편집하는 대신 함수를 호출하도록 강제.

**갭인가 의도인가**: 환경 차이에 의한 타당한 생략. 단일 세션에서 proposal 패턴을 도입하면 "LLM이 proposal을 생성하고, 같은 LLM이 승인하는" 의미 없는 절차가 된다. 멀티 세션/멀티 에이전트로 확장할 때 도입이 필요해진다.

#### provenance (출처 추적)

> v2.3: ticket_hash, ssot_index_version, policy_pack_version. "같은 입력에서 같은 결과가 나오는가" 검증용.

**현재**: meta.json에 atlas_version, ticket_key, created_at만 기록.

**이유 — 재현성 검증의 필요성이 아직 없다**: provenance는 "왜 이번 실행 결과가 지난번과 다른가"를 추적하기 위한 것이다. 정책이 바뀌었는지, 티켓 내용이 수정되었는지, 인덱스 버전이 올라갔는지. 이런 추적은 **파이프라인이 반복적으로 운영**될 때 의미가 있다.

Atlas는 현재 "티켓 하나 → 한 번 실행"이 기본 패턴이다. 같은 티켓을 다른 시점에 반복 실행하고 결과를 비교하는 워크플로우가 아직 확립되지 않았다. --force로 재실행할 때 "왜 결과가 다른가"를 추적할 필요가 생기면 그때 도입이 의미 있다.

**갭인가 의도인가**: 의도적 후순위. 기본 파이프라인이 안정화되기 전에 추적성 메타데이터를 추가하면 v0.2의 "메타 파일 과잉" 문제가 재현될 수 있다.

#### HITL (Human-in-the-Loop)

> v2.3: 5개 강제 트리거(spec_gap, scope 광범위, 보안 경로 인접, retry budget 소진 직전, 회귀 리스크 high). 조건 충족 시 LLM 자율 판정을 건너뛰고 사람에게 확인.

**현재**: 없음. 모든 판단을 LLM이 자율 수행.

**이유 — Claude Code의 상호작용 모델과 충돌**: Claude Code는 "사용자가 명령 → LLM이 실행 → 결과 반환"의 요청-응답 모델이다. 파이프라인 중간에 "사람의 확인이 필요하니 여기서 멈추겠다"는 흐름이 자연스럽지 않다. SKILL.md로 구동되는 파이프라인은 한 번 시작하면 끝까지 실행되는 것을 전제한다.

v2.3의 HITL은 **비동기 워크플로우**를 전제한다. Jira 코멘트 + Slack 알림으로 사람에게 통보하고, 사람이 proceed/reject를 입력할 때까지 대기. 이것은 장시간 실행되는 오케스트레이션 시스템의 패턴이지, 단일 CLI 세션의 패턴이 아니다.

**갭인가 의도인가**: 환경 제약에 의한 구조적 갭. Claude Code에 "파이프라인 중단 → 사용자 입력 대기 → 재개"하는 메커니즘이 생기면 도입 가능하다. 현재는 completion-gate가 "증거 없으면 못 끝낸다"는 최소한의 안전장치 역할을 하고 있을 뿐이다.

### 갭의 성격: 왜 이 순서로 도달했는가

v0.4.0은 **실행 메커니즘**(Hook 우회 불가, 피드백 자동화)에서는 v2.3에 근접했으나, **거버넌스 계층**(Failure Taxonomy, Mode, DoR/DoD, HITL)과 **데이터 계약**(WorkOrder 불변, Store/Artifact 분리, provenance)에서는 아직 거리가 있다.

이 갭은 우연이 아니라, v0.2부터 v0.4.0까지의 진화 과정에서 반복적으로 학습한 결과다. 각 버전이 부딪힌 문제가 다음 버전의 우선순위를 결정했다.

특히 재시도(retry) 관련 갭 — Failure Taxonomy, ContinuationHook, Mode 시스템 — 이 두드러지는데, 이것은 Atlas가 v2.3과 **설계 초점이 근본적으로 다르기** 때문이다.

#### 설계 초점의 차이: 재시도 최적화 vs 재시도 최소화

v2.3은 **"실패는 불가피하다"**는 전제에서 출발한다. 실패를 분류하고(Failure Taxonomy), 분류에 따라 재시도 전략을 달리하고(ContinuationHook), 모드별로 재시도 예산을 관리한다(retry budget). 실패 후 복구 경로를 정교하게 설계하는 데 상당한 아키텍처 비용을 투자한다.

Atlas는 **"재시도가 필요한 상황 자체를 줄이자"**는 전제에서 출발했다. 그래서 파이프라인의 첫 단계가 `learn`이다.

```
v2.3의 접근:
  실행 → 실패 → 분류 → 전략 선택 → 재시도 → 수렴
  (실패 후 복구를 정교하게)

Atlas의 접근:
  learn(컨벤션 선행 학습) → 실행 → (실패 자체를 줄임)
  (실패 전 예방을 정교하게)
```

**learn 단계가 하는 일**: 코드 생성 전에 프로젝트의 코드베이스를 분석하여 conventions.json을 생성한다. 네이밍 규칙, 어노테이션 패턴, 필수/금지 규칙, 도메인 린트 규칙 — LLM이 코드를 생성할 때 "처음부터 프로젝트 규칙에 맞게" 작성하도록 하는 사전 지식이다.

이것이 v2.3의 **Spec/Policy Agent**와 대응되는 개념이되, 방향이 반대다:

| | Atlas `learn` | v2.3 `Spec/Policy Agent` |
|---|---|---|
| **전제** | 프로젝트 규칙이 문서화되어 있지 않다 | 정책 문서(SSOT)가 이미 존재한다 |
| **입력** | 프로젝트 코드베이스 (실제 코드) | SSOT 문서 (정책/스펙) |
| **동작** | 코드에서 규칙을 **역추출**하여 생성 | 문서에서 제약을 **추출** |
| **산출물** | conventions.json (네이밍, 패턴, 금지, domain-lint 규칙) | constraints (must_do, must_not, scope_restriction) + required_tests |
| **소비자** | LLM (코드 생성 시 참조) + validate.sh (domain-lint 검증) | WorkOrder (must_do/must_not/scope에 주입) |
| **시점** | 파이프라인 최초 1회 (이후 캐시) | 매 이슈마다 실행 |

Atlas가 conventions.json을 learn 단계에서 먼저 만드는 이유: **LLM이 처음부터 규칙을 알고 코드를 생성하면, 컨벤션 위반으로 인한 실패가 발생하지 않는다.** 실패가 줄어들면 Failure Taxonomy가 덜 필요하고, 재시도 전략이 덜 필요하고, 모드별 retry budget 분기도 덜 필요하다.

실제로 v0.3.8에서 도입한 `learned_from_failures`(conventions.json에 축적되는 과거 실패 패턴)도 같은 철학이다. 실패를 분류하여 재시도 전략을 세우는 게 아니라, **실패 패턴 자체를 컨벤션에 흡수**하여 다음 실행에서 같은 실패가 재현되지 않도록 한다.

```
v2.3:  실패 → ContinuationHook → taxonomy 분류 → 전략별 재시도
Atlas: 실패 → learned_from_failures → conventions.json 흡수 → 다음 실행에서 사전 예방
```

이 차이가 재시도 관련 갭을 설명하는 가장 근본적인 이유다. Atlas는 재시도 메커니즘에 투자하는 대신, **재시도가 필요 없는 첫 시도의 품질**에 투자했다.

#### 1차 교훈 (v0.2 → v0.3): 거버넌스를 먼저 쌓으면 실행이 무너진다

v0.2는 v2.3의 거버넌스 개념을 **먼저** 구현하려 했다. 8개 스키마, 5단계 상태 머신, policy-registry, dependency-graph — 이것들은 본질적으로 v2.3의 WorkOrder 불변성, Store/Artifact 분리, provenance 추적과 같은 **데이터 계약** 영역이다.

결과: **실행 자체가 작동하지 않았다.** Task 하나를 처리하는 데 Bash 9회 호출, status.json 4회 갱신, JSON 3개 생성. LLM의 컨텍스트 윈도우가 거버넌스 메타데이터 관리에 소진되어 정작 코드 생성 품질이 떨어졌다. 스크립트가 로직을 대체하면서 LLM은 메신저로 전락했다.

**학습**: Claude Code 환경에서는 거버넌스 계층과 데이터 계약을 아무리 정교하게 설계해도, LLM이 그것을 "프롬프트로 지시받아 수행"해야 하는 한 컨텍스트 비용이 발생한다. 컨텍스트가 고갈되면 거버넌스 자체가 의미 없다 — 코드를 생성할 여력이 없으니까.

#### 2차 교훈 (v0.3 → v0.3.8): 자유만으로는 품질이 보장되지 않는다

v0.3은 v0.2의 반대 극단을 택했다. 거버넌스를 전부 걷어내고 LLM에게 자유를 줬다. Harness 패턴: setup → 자유 실행 → validate.sh. 상태 2개, 스키마 최소화, 메타 파일 0종.

결과: **코드는 생성되지만, 프로젝트 규칙을 어긴다.** 컴파일은 되고 포맷도 맞지만, 네이밍 컨벤션 위반, 필수 어노테이션 누락, 금지 패턴 사용이 검출되지 않았다. validate.sh의 3개 게이트(scope, build, lint)는 구문적 검증만 가능했다.

**학습**: v2.3의 Spec/Policy Agent와 Quality Plane이 필요한 이유가 여기서 드러났다. 단순히 "컴파일되는가"가 아니라 "프로젝트 규칙에 맞는가"까지 검증해야 한다. v0.3.8에서 conventions.json + domain-lint + audit를 추가한 것은 이 학습의 직접적 결과다.

#### 3차 교훈 (v0.3.8 → v0.4.0): 프롬프트 지시는 규율이 아니다

v0.3.8은 검증 계층을 추가했지만, 모든 것이 **프롬프트 지시**에 의존했다. SKILL.md에 "validate.sh를 실행하라", "레드팀을 수행하라", "증거를 기록하라"고 적었다. LLM이 이 지시를 따르면 작동하고, 건너뛰면 무너진다.

실제 관찰: LLM이 컨텍스트 압박을 받으면 가장 먼저 생략하는 것이 검증 단계였다. 코드 생성에 집중하느라 validate.sh를 건너뛰거나, 레드팀을 형식적으로만 수행하거나, "검증 완료"라고 선언하고 넘어가는 경우가 발생했다.

**학습**: v2.3이 말하는 "우회 불가 규율(Hook)"은 **프롬프트 밖에서 작동해야** 한다. LLM의 판단이나 의지에 의존하는 규율은 규율이 아니다. v0.4.0에서 Claude Code Hooks를 도입한 것은 이 학습의 직접적 결과다.

#### 현재 갭이 남은 구조적 이유

세 번의 학습이 수렴한 결론: **Claude Code 환경에서는 "물리적 강제 가능한 것"부터 구현해야 한다.**

```
v2.3 아키텍처의 3계층:

┌─────────────────────────────────────────────────────┐
│  거버넌스 계층 (Governance)                          │ ← 아직 갭
│  Failure Taxonomy, Mode, DoR/DoD, HITL, ScrumMaster │
├─────────────────────────────────────────────────────┤
│  데이터 계약 계층 (Data Contract)                    │ ← 아직 갭
│  WorkOrder 불변, Store/Artifact 분리, provenance     │
├─────────────────────────────────────────────────────┤
│  실행 메커니즘 계층 (Execution Mechanism)             │ ← v0.4.0 도달
│  Hook 우회 불가, Evidence 기반, Scope 이중화          │
└─────────────────────────────────────────────────────┘
```

Atlas는 아래에서 위로 쌓아가고 있다. v0.2가 위에서 아래로 내려오려다 실패한 경험이 이 순서를 결정했다.

**실행 메커니즘이 먼저인 이유:**

| 계층 | Claude Code에서의 구현 수단 | 컨텍스트 비용 |
|------|--------------------------|-------------|
| 실행 메커니즘 | Claude Code Hooks (런타임) | **0** — LLM 컨텍스트 밖에서 작동 |
| 데이터 계약 | JSON 스키마 + 스크립트 검증 | **중간** — 스키마 참조 + 검증 호출 필요 |
| 거버넌스 | 프롬프트 지시 또는 에이전트 호출 | **높음** — LLM이 판단하고 실행해야 함 |

v0.2가 증명한 것: 거버넌스 계층(높은 컨텍스트 비용)을 먼저 구현하면 실행 메커니즘에 쓸 컨텍스트가 부족하다. v0.4.0이 증명한 것: 실행 메커니즘(0 컨텍스트 비용)을 먼저 구현하면 LLM이 코드 생성에 컨텍스트를 온전히 사용할 수 있고, 검증은 런타임이 강제한다.

**거버넌스 갭이 아직 남은 이유:**

거버넌스 계층의 핵심 개념들 — Failure Taxonomy, Mode 시스템, DoR/DoD 게이트, HITL — 은 본질적으로 **LLM의 판단**이 개입해야 하는 영역이다. "이 실패가 flaky인가 deterministic인가", "이 변경이 회귀 리스크가 높은가", "사람의 확인이 필요한가" — 이런 판정은 결정론적 스크립트로 자동화하기 어렵다.

v2.3은 이 문제를 **멀티 에이전트**(Orchestrator, ScrumMaster, Verifier 등)로 해결한다. 각 에이전트가 독립된 컨텍스트를 가지므로 판단 비용이 분산된다. 하지만 Atlas는 **Claude Code의 단일 세션** 안에서 돌아간다. SKILL.md 하나가 Orchestrator이고, 같은 LLM이 코드도 생성하고 검증도 하고 거버넌스 판단도 내린다. 컨텍스트를 공유하기 때문에 거버넌스 판단이 늘어나면 코드 생성 품질이 떨어지는 트레이드오프가 존재한다.

이 제약은 Claude Code의 Agent(서브에이전트) 기능으로 부분적으로 완화할 수 있다. 실제로 Atlas v0.3.8+에서 레드팀과 audit을 병렬 에이전트로 위임한 것이 그 시도다. 하지만 v2.3이 설계한 수준의 거버넌스 — WorkOrder freeze/unfreeze 라이프사이클, ContinuationHook의 taxonomy 분류와 재분류, Mode별 evidence_required 분기, HITL 강제 트리거 — 를 단일 세션의 서브에이전트로 구현하려면, 프롬프트 복잡도가 다시 v0.2 수준으로 올라갈 위험이 있다.

**데이터 계약 갭이 아직 남은 이유:**

WorkOrder 불변성(frozen), Store/Artifact 분리, provenance 추적은 기술적으로 구현 가능하다. task.json을 frozen으로 만들고, 재시도 시 새 파일을 생성하고, ticket_hash를 기록하는 것은 스크립트 몇 줄이면 된다.

하지만 v0.2의 교훈이 여기서 작용한다: **데이터 계약을 추가할 때마다 LLM이 관리해야 할 상태가 늘어난다.** task.json이 불변이면 재시도 시 새 파일을 생성해야 하고, 새 파일의 경로를 추적해야 하고, 이전 파일과의 연결(retry_of_wo_id)을 기록해야 한다. 이 모든 것이 프롬프트 지시로 수행된다.

v0.4.0은 이 트레이드오프에서 "아직은 mutable task.json + 단순 재시도"를 선택했다. 실행 메커니즘(Hook)이 안정화된 후, 데이터 계약을 점진적으로 추가하는 것이 v0.2의 "한꺼번에 전부" 접근보다 안전하다는 판단이다.

#### 요약: 진화의 방향성

```
v0.2:  거버넌스 + 데이터 계약을 먼저 → 실행 메커니즘 부재 → 실패
v0.3:  실행 메커니즘만 (최소) → 거버넌스 부재 → 품질 불안정
v0.3.8: 실행 메커니즘 + 검증 강화 → 프롬프트 수준 규율 → 우회 가능
v0.4.0: 실행 메커니즘 물리적 강제 → 거버넌스/데이터 계약은 다음 단계
```

v2.3 아키텍처는 최종 목표 상태(target state)다. Atlas는 그 목표를 향해 "아래에서 위로", "물리적 강제 가능한 것부터" 쌓아가고 있다. v0.2가 "위에서 아래로" 시도했다가 실패한 경험이, 이 순서를 결정하는 가장 강한 근거다.
