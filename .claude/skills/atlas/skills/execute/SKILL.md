---
name: execute
description: >
  tasks/ 개별 파일의 Task를 순회하며 코드 생성, 레이어별 병렬 레드팀, validate.sh 실행, Task별 커밋. 모든 증거는 헬퍼 함수로 자동 기록.
---

# /execute — 코드 생성 + 검증 + 커밋 (RALP 루프)

## RALP 개요

execute는 Claude Code Hooks 기반 **RALP(Read→Act→Lint→Prove) 루프**로 작동한다.

```
[코드 생성 (Write/Edit)]
  → PostToolUse: post-edit-lint.sh — 자동 빌드 체크, 에러 피드백
  → [에러 수정]
  → ...반복...

[validate.sh 실행]
  → PostToolUse: evidence-collector.sh — 결과 자동 기록

[Task "완료" 선언 → Stop]
  → Stop: completion-gate.sh — validate PASS 증거 확인
  → 증거 없음/FAIL → block + 피드백 (자동 재시도)
  → 증거 PASS + 레드팀 증거 → 통과 → 커밋
```

**핵심**: validate.sh PASS 증거 없이는 물리적으로 다음 Task로 넘어갈 수 없다.

## 실행 흐름

### 1. 입력 로드

1. `${RUN_DIR}/tasks/index.json`에서 task ID 목록을 읽는다
2. 각 `${RUN_DIR}/tasks/task-{id}.json`을 읽어 Task 내용을 확보한다
3. `${PROJECT_ROOT}/.automation/conventions.json`을 읽어 컨벤션을 확보한다
4. `status=pending`인 Task만 실행 대상이다

### 2. Task 순회 (의존성 순서)

`depends_on`을 존중하여 의존성이 없는 Task부터 순차 실행한다.

**각 Task에 대해:**

#### 0. Hooks 환경변수 설정 (Task 시작 전 필수)

```bash
export ATLAS_CURRENT_TASK="{TASK_ID}"
export ATLAS_SCOPE_FILES="{Task의 files 목록, 공백 구분}"
export ATLAS_RETRY_COUNT=0
```

이 시점부터 해당 Task에 대해:
- `scope-guard.sh`: Write/Edit 시 forbidden path 차단 + scope 밖 경고
- `completion-gate.sh`: Stop 시 validate 증거 + 레드팀 증거 확인

#### a. 코드 생성

- Task의 description, ac, files를 읽고 conventions.json을 준수하여 코드를 생성한다
- 기존 코드와 일관성을 유지한다 (주변 파일을 읽어 패턴 파악)
- **증거:** `record_generate_evidence "$RUN_DIR" TASK_ID "생성파일들" "수정파일들"`

#### b. Pre-build 검증

레드팀 전에 컴파일 에러를 잡는다. `--scope` 없이 빌드만 확인.

```bash
bash scripts/validate.sh \
  --conventions "${PROJECT_ROOT}/.automation/conventions.json" \
  --project-root "${PROJECT_ROOT}" \
  --task-id TASK_ID --run-dir "${RUN_DIR}"
```

#### c. 레드팀 (레이어별 병렬)

빌드 통과 후, **Agent tool로 레이어별 서브에이전트를 병렬 실행**한다.
레이어 구성은 프로젝트 스택에 따라 결정한다 (conventions.json의 production_rules 카테고리 참조).
체크리스트는 [references/be-redteam-checklist.md](references/be-redteam-checklist.md)를 읽고 따른다.

**실행 규칙:**
1. Task의 files에 해당 레이어 파일이 **없으면** 해당 에이전트는 스킵
2. 각 에이전트는 conventions.json + task의 ac 기준으로 검토
3. 에이전트는 **수정 지시만 반환** (직접 수정하지 않음)
4. 모든 에이전트 완료 후 피드백을 모아서 한 번에 반영

**증거:**
- 레이어별: `record_redteam_evidence "$RUN_DIR" TASK_ID LAYER CHECKS_JSON FIXES_JSON`
- 요약: `record_redteam_summary "$RUN_DIR" TASK_ID LAYERS_JSON TOTAL_FIXES`

#### d. 피드백 반영

레드팀 `fail` 항목의 수정 지시를 코드에 반영한다. `fail`이 없으면 스킵.

#### e. validate.sh 실행 (전체 게이트)

```bash
bash scripts/validate.sh \
  --scope "파일목록" \
  --conventions "${PROJECT_ROOT}/.automation/conventions.json" \
  --project-root "${PROJECT_ROOT}" \
  --domain-lint \
  --source-dir "${PROJECT_ROOT}/소스디렉토리" \
  --task-id TASK_ID --run-dir "${RUN_DIR}"
```

- `--domain-lint`: conventions.json의 `domain_lint` 배열에 정의된 선언적 룰을 기계적으로 실행
- `--source-dir`: 도메인 린트 탐색 대상 디렉토리 (프로젝트 소스 루트)
- 증거는 validate.sh가 자동 기록한다 (성공/실패 모두)

#### f. 실패 시 재시도 (RALP)

validate.sh 실패 시 RALP 루프가 작동한다:

1. **재시도 카운터 증가:**
   ```bash
   export ATLAS_RETRY_COUNT=$((ATLAS_RETRY_COUNT + 1))
   ```

2. **failure_history 기록:**
   ```bash
   TAXONOMY=$(jq -r '.taxonomy // "unknown"' "${RUN_DIR}/evidence/execute/task-${TASK_ID}/validate.json")
   record_failure_history "$RUN_DIR" "$TASK_ID" "$ATLAS_RETRY_COUNT" "$TAXONOMY" \
     "evidence/execute/task-${TASK_ID}/validate.json"
   ```

3. **이전 validate 결과 삭제 후 재시도:**
   ```bash
   rm -f "${RUN_DIR}/evidence/execute/task-${TASK_ID}/validate.json"
   rm -f "${RUN_DIR}/evidence/execute/task-${TASK_ID}/validate.error.json"
   ```

4. **completion-gate.sh가 taxonomy별 피드백 제공:**
   - `compile_error` → "빌드 에러를 수정하세요" + 에러 메시지
   - `lint_violation` → "린트 위반을 수정하세요" + 위반 목록
   - `domain_lint` → "도메인 린트 규칙을 확인하세요" + 위반 상세
   - `scope_violation` → "scope 밖 파일을 되돌리세요"

5. **최대 5회** 재시도 후 에스컬레이션 (completion-gate가 자동 해제):
   ```bash
   update_task_status "$RUN_DIR" "$TASK_ID" "failed" "5회 RALP 재시도 실패"
   ```
   + 사용자 보고

#### g. 레드팀 증거 게이트 (커밋 전 필수)

커밋 전에 `${RUN_DIR}/evidence/execute/task-{id}/redteam-summary.json`의 **존재 여부를 확인**한다.

- **파일 없음 → 커밋 차단**: 레드팀이 실행되지 않은 Task는 커밋할 수 없다
- **예외 — 테스트 전용 Task**: Task의 files가 `*Test.java`, `*_test.go`, `*.test.ts` 등 **테스트 파일만** 포함하면 레드팀을 스킵할 수 있다. 이 경우 `redteam-summary.json` 대신 `redteam-skip.json`을 기록한다:
  ```json
  {"skipped": true, "reason": "test-only task", "timestamp": "ISO-8601"}
  ```
- **증거 부족 시**: 사용자에게 보고하고 레드팀(c단계)부터 재실행한다

#### h. 성공 시 커밋

1. `git add` — Task의 files만 스테이징
2. `git commit` — `feat({scope}): {title}` 형식
3. `complete_task "$RUN_DIR" TASK_ID COMMIT_HASH "커밋 메시지"` — status + commit 증거 자동

**주의: `update_task_status`를 직접 호출하지 않는다. `complete_task`가 내부에서 호출한다.**

#### i. Hooks 환경변수 초기화 (Task 종료 후)

```bash
export ATLAS_CURRENT_TASK=""
export ATLAS_SCOPE_FILES=""
export ATLAS_RETRY_COUNT=0
```

### 3. 완료

모든 Task 처리 후 `evidence/execute/done.json` 기록 + 결과 요약 출력.

## 코드 생성 규칙

1. **conventions.json을 기본으로** — naming, style, annotations, patterns
2. **overrides 우선 적용** — Task에 `overrides`가 있으면 해당 항목은 override의 `decision`을 따른다 (`ac`면 AC 값, `convention`이면 conventions 값)
3. **forbidden 위반 금지** — 생성 전 확인
4. **기존 코드 일관성** — 주변 파일 패턴 따르기
