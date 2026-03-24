---
name: atlas
description: >
  Jira 티켓 → 코드 자동 생성. Harness 패턴: setup → LLM 자유 실행 → validate → audit.
  learn으로 컨벤션 학습, analyze로 Task 분해, execute로 코드 생성 + 검증 + 커밋, audit로 컨벤션 감사.
user-invocable: true
argument-hint: "TICKET-KEY|learn [options]"
---

# Atlas v4

Jira 티켓 → 코드 자동 생성 파이프라인. Harness 패턴 + Claude Code Hooks 기반 RALP 루프.

```
Harness:  setup → [ LLM 자유 실행 ] → [ LLM 레드팀 ] → validate.sh → audit → teardown
                   ↑ PreToolUse       ↑ PostToolUse      ↑ Stop
                   scope-guard        auto-lint           completion-gate
                   (우회 불가)        (자동 피드백)       (증거 게이트)
```

## Claude Code Hooks (자동 작동)

파이프라인 실행 중 아래 hooks가 **자동으로** 작동한다. SKILL.md에서 별도 호출하지 않는다.

| Hook | 이벤트 | 역할 |
|------|--------|------|
| `scope-guard.sh` | PreToolUse(Write\|Edit) | forbidden path 물리적 차단 |
| `post-edit-lint.sh` | PostToolUse(Write\|Edit) | 편집 후 자동 빌드 체크, 에러 피드백 |
| `evidence-collector.sh` | PostToolUse(Bash) | validate.sh 결과 자동 수집 (fallback) |
| `completion-gate.sh` | Stop | validate + convention-check + redteam 증거 없으면 응답 종료 차단 (RALP 강제) |
| `session-init.sh` | SessionStart | ATLAS_* 환경변수 초기화 |

**RALP 루프**: completion-gate가 validate.sh PASS 증거 없이는 응답 종료를 차단한다.
LLM이 "완료"를 선언해도 증거가 없으면 물리적으로 끝나지 않는다.

## 옵션

| 옵션 | 적용 대상 | 설명 |
|------|----------|------|
| `--refresh-conventions` | learn | 기존 conventions.json을 무시하고 강제 재생성 |
| `--force` | 전체 파이프라인 | 새 run을 생성하여 전체 파이프라인을 처음부터 재실행 |

옵션은 서브커맨드/티켓 키 뒤에 자유 순서로 붙일 수 있다.
예: `/atlas GRID-2 --force --refresh-conventions`

## 서브커맨드 라우팅

현재 요청: `$ARGUMENTS`

`$0`(첫 번째 인자)을 분석하여 실행 모드를 결정한다:

1. **티켓 키** — `$0`이 Jira 티켓 패턴(`[A-Z]+-\d+`)이면 **전체 파이프라인**을 실행한다.
2. **`learn`** — 컨벤션 학습만 단독 실행한다.

| 서브커맨드 | 스킬 파일 | 설명 |
|-----------|-----------|------|
| `learn` | `skills/learn/SKILL.md` | 프로젝트 컨벤션 → conventions.json |
| `analyze` | `skills/analyze/SKILL.md` | Jira 티켓 → tasks/ (개별 파일) |
| `execute` | `skills/execute/SKILL.md` | tasks/ → 코드 생성 + 검증 + 커밋 |
| `convention-check` | `skills/convention-check/SKILL.md` | 프로젝트 컨벤션 체크리스트 검증 (execute 내부에서 자동 호출) |
| `audit` | `skills/audit/SKILL.md` | 생성 코드 → conventions.json 기준 의미론적 감사 |

## 전체 파이프라인

티켓 키 입력 시 아래 순서로 실행한다:

### 1. Setup — 환경 로드 + Run 생성 + Hooks 활성화

```bash
source scripts/common.sh && load_env
```

Run 결정:
1. `--force` → `create_run(TICKET_KEY)` — 항상 새 run 생성
2. `--force` 없음 → `resolve_run(TICKET_KEY)` — 기존 활성 run이 있으면 이어서 진행, 없으면 새 run 생성
3. `RUN_DIR`을 해당 run의 절대 경로로 설정

**Hooks 활성화** — Run 결정 후 반드시 실행:
```bash
export ATLAS_ACTIVE=1
export ATLAS_PROJECT_ROOT="${PROJECT_ROOT}"
export ATLAS_CONVENTIONS="${PROJECT_ROOT}/.automation/conventions.json"
export ATLAS_RUN_DIR="${RUN_DIR}"
```
이 시점부터 Claude Code Hooks가 활성화된다.

### 2. Learn — 컨벤션 학습

- `--refresh-conventions` → 기존 conventions.json을 무시하고 `skills/learn/SKILL.md`를 `--refresh-conventions` 옵션으로 실행
- `--force` → `--refresh-conventions`와 동일하게 강제 재실행
- 위 옵션 없이 `conventions.json`이 이미 존재하면 스킵 + 스킵 증거 기록:
  ```bash
  record_skip_evidence "$RUN_DIR" "learn" "conventions.json 이미 존재"
  ```
- 없으면 `skills/learn/SKILL.md`를 읽고 실행

### 3. Analyze — 티켓 수집 + Task 분해

- `--force` → 새 run이므로 evidence 없음, 자동으로 실행
- 위 옵션 없이 `evidence/analyze/done.json`이 존재하고 `status=done`이면 스킵
- 없으면 `skills/analyze/SKILL.md`를 읽고 실행

### 4. Execute — 코드 생성 + 검증 + 커밋

- `--force` → 새 run이므로 모든 Task가 pending 상태, 처음부터 실행
- `skills/execute/SKILL.md`를 읽고 실행
- 각 Task에 대해: 코드 생성 → **convention-check** → pre-build → 레드팀(병렬) → 피드백 반영 → validate.sh → 레드팀 증거 게이트 → 커밋

### 5. Audit — 컨벤션 준수 감사

- `--force` → 새 run이므로 evidence 없음, 자동으로 실행
- 위 옵션 없이 `evidence/audit/done.json`이 존재하고 `status=done`이면 스킵
- 없으면 `skills/audit/SKILL.md`를 읽고 실행
- execute에서 생성된 **전체 코드**를 conventions.json 기준으로 의미론적 감사
- 카테고리별 병렬 에이전트: naming, style, annotations, patterns, forbidden, required
- high 위반 발견 시 수정 + fix 커밋 생성

### 6. 결과 출력

완료/실패 Task 현황, 생성된 커밋 수, 수정된 파일 수, audit 결과를 요약한다.

**Hooks 비활성화** — 파이프라인 종료 시 반드시 실행:
```bash
export ATLAS_ACTIVE=
export ATLAS_CURRENT_TASK=
export ATLAS_SCOPE_FILES=
export ATLAS_RETRY_COUNT=0
```

## 매크로 엣지 (Step 간 전이)

각 Step의 완료는 `evidence/{step}/done.json` 존재로 판단한다.

| 전이 | 조건 |
|------|------|
| learn → analyze | `conventions.json` 존재 |
| analyze → execute | `evidence/analyze/done.json` 존재 + `status=done` |
| execute → audit | `evidence/execute/done.json` 존재 + `status=done` |
| 실패 시 | `.error.json` 기록 + 사용자 보고 + 파이프라인 중단 |

## 환경 설정

`.env`(`${CLAUDE_SKILL_DIR}/.env`)에서 환경변수를 로드한다.

**필수 규칙:**
- `.env`는 **절대로 Read 도구로 읽지 않는다** (API 토큰 노출 방지)
- `Bash`에서 `source scripts/common.sh && load_env`로 로드한다
- 모든 `.automation/` 파일은 `AUTOMATION_PATH` 기준으로 접근한다

## 투명성 및 오류 추적

1. **조용한 실패 금지** — 모든 오류는 사용자에게 보고한다
2. **증거 필수** — 스크립트 실행(성공/실패 모두) 결과를 evidence에 기록한다
3. **스크립트 임의 수정 금지** — 오류 시 사용자에게 보고하고 승인을 받는다
4. **오류 기록** — `.error.json`에 exit_code, stderr, diagnosis를 기록한다

## 산출물 구조

```
PROJECT_ROOT/.automation/
├── conventions.json                     ← learn 산출물
├── runs.json                            ← run 레지스트리
└── runs/{TICKET_KEY}-{YYYYMMDD-HHMMSS}/
    ├── meta.json                        ← run 메타 (atlas_version, ticket_key, created_at)
    ├── source.json                      ← fetch-ticket.py 출력
    ├── tasks/                           ← Task 개별 파일 디렉토리
    │   ├── index.json                   ← {"task_ids":["1","2",...]}
    │   ├── task-1.json                  ← 개별 Task (id, title, status, ...)
    │   ├── task-2.json
    │   └── ...
    └── evidence/                        ← 원자화된 증거
        ├── learn/   (done.json)
        ├── analyze/ (fetch-ticket.json, decompose.json, redteam-decompose.json, done.json)
        ├── execute/
        │   ├── done.json
        │   └── task-{id}/              ← Task별 증거 폴더
        │       ├── generate.json
        │       ├── convention-check.json
        │       ├── redteam-{layer}.json
        │       ├── redteam-summary.json
        │       ├── validate.json
        │       ├── validate.error.json
        │       ├── status-{status}.json
        │       └── commit.json
        └── audit/                       ← 컨벤션 감사 증거
            ├── audit-{category}.json    ← 카테고리별 감사 결과
            ├── audit-summary.json       ← 전체 요약
            ├── audit-fix.json           ← 수정 내역 (있을 때만)
            └── done.json
```

## Task 완료 처리 (필수)

Task 커밋 성공 시 **반드시** `common.sh`의 `complete_task`를 호출한다.
이 함수가 status 변경 + commit evidence를 한 번에 기록하므로, 증거 누락이 발생하지 않는다.

```bash
# 사용법 — 커밋 후 반드시 호출
complete_task RUN_DIR TASK_ID COMMIT_HASH "커밋 메시지" ["파일 목록"]

# 예시
complete_task "$RUN_DIR" "1" "a1b2c3d" "feat(point): Core 엔티티 생성"

# 여러 Task가 하나의 커밋을 공유할 때
complete_task "$RUN_DIR" "1" "a1b2c3d" "feat(point): Core + Support 엔티티"
complete_task "$RUN_DIR" "2" "a1b2c3d" "feat(point): Core + Support 엔티티"
```

**주의: Task 완료 시 `update_task_status`를 직접 호출하지 않는다. `complete_task`가 내부에서 호출한다.**

실패 처리에만 `update_task_status`를 직접 사용한다:
```bash
update_task_status "$RUN_DIR" "3" "failed" "3회 재시도 실패" "$ERROR_DATA"
```

관련 헬퍼:
- `complete_task RUN_DIR TASK_ID HASH MSG` — **Task 완료 일괄 처리 (status + commit evidence)**
- `record_generate_evidence RUN_DIR TASK_ID FILES_CREATED FILES_MODIFIED` — 코드 생성 결정 증거
- `record_redteam_evidence RUN_DIR TASK_ID LAYER CHECKS_JSON [FIXES_JSON]` — 레이어별 레드팀 검증 증거
- `record_redteam_summary RUN_DIR TASK_ID LAYERS_JSON TOTAL_FIXES` — 레드팀 요약 증거
- `record_audit_evidence RUN_DIR CATEGORY CHECKS_JSON [FIXES_JSON]` — 카테고리별 컨벤션 감사 증거
- `record_audit_summary RUN_DIR CATEGORIES_JSON TOTAL_VIOLATIONS_JSON TOTAL_FIXES [FIX_COMMIT]` — 감사 요약 증거
- `record_audit_fix_evidence RUN_DIR FIXES_JSON [COMMIT_HASH] [FILES_MODIFIED]` — 감사 수정 통합 증거
- `record_skip_evidence RUN_DIR STEP REASON` — Step 스킵 증거 (learn 등)
- `record_commit_evidence RUN_DIR TASK_ID HASH MSG FILES` — commit evidence만 단독 기록
- `update_task_status RUN_DIR TASK_ID STATUS REASON` — status 변경만 (실패 처리용)
- `read_task RUN_DIR TASK_ID` — 개별 task 파일 읽기
- `get_task_status RUN_DIR TASK_ID` — status만 읽기
- `list_task_ids RUN_DIR` — 전체 task ID 목록

**자동 증거:** validate.sh에 `--task-id`와 `--run-dir`을 전달하면 성공/실패 증거가 스크립트 내부에서 자동 기록된다.

## 스키마

산출물 생성 시 해당 스키마를 참조한다:
- `schemas/learn/conventions.schema.json` — conventions.json 구조
- `schemas/analyze/task.schema.json` — 개별 task 파일 구조
- `schemas/analyze/task-index.schema.json` — tasks/index.json 구조
- `schemas/evidence/*.schema.json` — 증거 파일 구조 (status-change, commit, redteam, redteam-summary, audit, audit-summary 등)

## 참조 문서

- [v3 설계 철학](v3-design-philosophy.md)
- [v1 vs v2 분석](v1-vs-v2-analysis.md)
- [v3 구현 계획](v3-implementation-plan.md)
- [v4 구현 계획 (Hooks + RALP)](../../../idea-bank/260317-work-order/atlas-v4-implementation-plan.md)
