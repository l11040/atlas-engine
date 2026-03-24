---
name: execute
description: >
  tasks/ 개별 파일의 Task를 순회하며 코드 생성, 레이어별 병렬 레드팀, validate.sh 실행, Task별 커밋. 모든 증거는 헬퍼 함수로 자동 기록. completion-gate 훅이 증거 없이 종료를 물리적으로 차단.
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
  → Stop: completion-gate.sh — 5단계 검증
    Gate 1: validate.json 존재?
    Gate 2: validate PASS?
    Gate 3: redteam-summary 존재?
    Gate 4: convention-check PASS?
    Gate 5: validate-evidence.sh (증거 포맷)?
  → 하나라도 실패 → block + 피드백 (자동 재시도)
  → 전체 통과 → 응답 종료 허용
```

**핵심**: completion-gate가 증거 없이 종료를 물리적으로 차단한다. 단계를 건너뛸 수 없다.

## 실행 흐름

### 1. 입력 로드

1. `${RUN_DIR}/tasks/index.json`에서 task ID 목록을 읽는다
2. 각 `${RUN_DIR}/tasks/task-{id}.json`을 읽어 Task 내용을 확보한다
3. `${PROJECT_ROOT}/.automation/conventions.json`을 읽어 컨벤션을 확보한다
4. `status=pending`인 Task만 실행 대상이다

### 2. Task 순회 — 순차 실행 (단일 에이전트)

`depends_on`을 존중하여 의존성이 없는 Task부터 **순차 실행**한다.

**서브에이전트를 사용하지 않는다.** 단일 에이전트가 모든 Task를 직접 실행한다.

이유:
- completion-gate 훅이 단계 스킵을 물리적으로 차단하므로, 컨텍스트 압축이 발생해도 안전
- 서브에이전트는 환경변수가 훅에 전파되지 않아 completion-gate가 작동하지 않음
- 서브에이전트마다 증거 포맷이 달라지는 일관성 문제 방지
- 단일 컨텍스트에서 이전 Task의 코드/패턴을 참조할 수 있어 일관성 향상

#### 컨텍스트 압축 대응

단일 에이전트는 Task가 많으면 컨텍스트 압축이 발생한다. 이때 **실행 절차를 잊는 것**이 가장 위험하다.
아래 방어 메커니즘으로 압축이 발생해도 정확한 실행을 보장한다.

**1. 훅이 최후의 방어선** — completion-gate가 5단계 증거를 물리적으로 검증한다.
   절차를 잊고 건너뛰어도 훅이 block + 수정 지시를 내린다. LLM은 이 피드백을 따르면 된다.

**2. Task 시작 시 SKILL.md를 다시 읽는다** — 매 Task 시작 전:
   ```
   이 SKILL.md 파일을 다시 읽어 실행 절차(a~i)를 확인한다.
   ```
   압축 후에도 절차를 놓치지 않도록 명시적으로 재로드한다.

**3. 완료된 Task의 컨텍스트를 최소화한다** — Task 완료 후:
   - 생성한 코드의 전체 내용을 컨텍스트에 유지하지 않는다
   - `complete_task` 호출 결과(커밋 해시)만 기억하면 충분하다
   - 다음 Task 시작 전, 필요한 파일만 새로 읽는다

**4. 중간 체크포인트** — 5번째 Task마다 진행 현황을 출력한다:
   ```
   === 진행 현황 ===
   완료: Task 1, 2, 3, 4, 5
   남은: Task 6, 7, 8, 9, 10
   ```

---

**각 Task의 실행 절차:**

#### 0. Hooks 환경변수 설정 (Task 시작 전 필수)

```bash
export ATLAS_CURRENT_TASK="{TASK_ID}"
export ATLAS_SCOPE_FILES="{Task의 files 목록, 공백 구분}"
export ATLAS_RETRY_COUNT=0
```

이 시점부터 해당 Task에 대해:
- `scope-guard.sh`: Write/Edit 시 forbidden path 차단 + scope 밖 경고
- `completion-gate.sh`: Stop 시 5단계 증거 검증

#### a. 코드 생성

- Task의 description, ac, files를 읽고 conventions.json을 준수하여 코드를 생성한다
- 기존 코드와 일관성을 유지한다 (주변 파일을 읽어 패턴 파악)
- **증거:** `record_generate_evidence "$RUN_DIR" TASK_ID "생성파일들" "수정파일들"`

#### b. Convention Check (프로젝트 컨벤션 검증)

코드 생성 직후, 빌드 전에 프로젝트 컨벤션을 검증한다.

1. `skills/convention-check/SKILL.md`를 읽고 절차를 따른다
2. Task의 files 패턴에 맞는 체크리스트를 `references/convention-map.yaml`에서 결정
3. 해당 체크리스트 항목을 하나씩 검증 (PASS/FAIL + 근거)
4. FAIL 항목 자동 수정 시도
5. 증거 기록: `bash skills/convention-check/scripts/record-convention-evidence.sh --run-dir "${RUN_DIR}" --task-id "${TASK_ID}" --results 'JSON'`

**이 단계를 건너뛰면 completion-gate Gate 4가 차단한다.**

#### c. Pre-build 검증

레드팀 전에 컴파일 에러를 잡는다. `--scope` 없이 빌드만 확인.

```bash
bash scripts/validate.sh \
  --conventions "${PROJECT_ROOT}/.automation/conventions.json" \
  --project-root "${PROJECT_ROOT}" \
  --task-id TASK_ID --run-dir "${RUN_DIR}"
```

#### d. 레드팀 (레이어별 순차)

빌드 통과 후, 레이어별로 레드팀 검증을 수행한다.
레이어 구성은 프로젝트 스택에 따라 결정한다 (conventions.json의 production_rules 카테고리 참조).
체크리스트는 [references/be-redteam-checklist.md](references/be-redteam-checklist.md)를 읽고 따른다.

**실행 규칙:**
1. Task의 files에 해당 레이어 파일이 **없으면** 해당 레이어는 스킵
2. conventions.json + task의 ac 기준으로 검토
3. 각 레이어 검토 후 `fail` 항목이 있으면 즉시 수정
4. 모든 레이어 완료 후 증거 기록

**증거 (반드시 헬퍼 함수 사용):**
- 레이어별: `record_redteam_evidence "$RUN_DIR" TASK_ID LAYER CHECKS_JSON FIXES_JSON`
- 요약: `record_redteam_summary "$RUN_DIR" TASK_ID LAYERS_JSON TOTAL_FIXES`

**이 단계를 건너뛰면 completion-gate Gate 3이 차단한다.**

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
- **증거 부족 시**: 사용자에게 보고하고 레드팀(d단계)부터 재실행한다

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

## ★ 증거 작성 규칙 (필수 준수) ★

**모든 증거는 반드시 common.sh 헬퍼 함수 또는 전용 스크립트로 기록한다.**
**`cat >`, `echo >`, `jq -n > file` 등으로 증거를 직접 작성하지 않는다.**

| 증거 파일 | 작성 방법 |
|-----------|----------|
| generate.json | `source scripts/common.sh && record_generate_evidence "$RUN_DIR" "$TASK_ID" "파일목록" "수정목록"` |
| convention-check.json | `bash skills/convention-check/scripts/record-convention-evidence.sh --run-dir "$RUN_DIR" --task-id "$TASK_ID" --results 'JSON'` |
| redteam-{layer}.json | `source scripts/common.sh && record_redteam_evidence "$RUN_DIR" "$TASK_ID" "layer" 'checks_json' 'fixes_json'` |
| redteam-summary.json | `source scripts/common.sh && record_redteam_summary "$RUN_DIR" "$TASK_ID" 'layers_json' total_fixes` |
| validate.json | validate.sh가 자동 기록 (--task-id, --run-dir 전달 필수) |
| commit.json + status-done.json | `source scripts/common.sh && complete_task "$RUN_DIR" "$TASK_ID" "hash" "msg"` |

**redteam checks_json 형식** (redteam.schema.json 준수):
```json
[{"id":"CONC-1","item":"검토항목","result":"pass","line_ref":"File.java:42","detail":"설명"}]
```

**redteam layers_json 형식** (redteam-summary.schema.json 준수):
```json
[{"layer":"domain","pass":3,"fail":0},{"layer":"schema","pass":2,"fail":1}]
```
layer 값은 반드시 enum 중 하나: domain, schema, repository, service, batch, controller, dto, test

**completion-gate Gate 5가 증거 포맷을 검증한다. 스키마 불일치 시 응답 종료가 차단된다.**

## 코드 생성 규칙

1. **conventions.json을 기본으로** — naming, style, annotations, patterns
2. **overrides 우선 적용** — Task에 `overrides`가 있으면 해당 항목은 override의 `decision`을 따른다 (`ac`면 AC 값, `convention`이면 conventions 값)
3. **forbidden 위반 금지** — 생성 전 확인
4. **기존 코드 일관성** — 주변 파일 패턴 따르기
