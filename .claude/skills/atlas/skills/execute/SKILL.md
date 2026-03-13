---
name: execute
description: >
  tasks/ 개별 파일의 Task를 순회하며 코드 생성, 레이어별 병렬 BE 레드팀, validate.sh 실행, Task별 커밋. 모든 증거는 헬퍼 함수로 자동 기록.
---

# /execute — 코드 생성 + 검증 + 커밋

## 실행 흐름

### 1. 입력 로드

1. `${RUN_DIR}/tasks/index.json`에서 task ID 목록을 읽는다
2. 각 `${RUN_DIR}/tasks/task-{id}.json`을 읽어 Task 내용을 확보한다
3. `${PROJECT_ROOT}/.automation/conventions.json`을 읽어 컨벤션을 확보한다
4. `status=pending`인 Task만 실행 대상이다

### 2. Task 순회 (의존성 순서)

`depends_on`을 존중하여 의존성이 없는 Task부터 순차 실행한다.

**각 Task에 대해:**

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

#### c. BE 레드팀 (레이어별 병렬)

빌드 통과 후, **Agent tool로 레이어별 서브에이전트를 병렬 실행**한다.
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
  --task-id TASK_ID --run-dir "${RUN_DIR}"
```

증거는 validate.sh가 자동 기록한다 (성공/실패 모두).

#### f. 실패 시 재시도

- 최대 3회 재시도 (a~e 반복)
- 3회 초과: `update_task_status RUN_DIR TASK_ID "failed" "3회 재시도 실패"` + 사용자 보고

#### g. 성공 시 커밋

1. `git add` — Task의 files만 스테이징
2. `git commit` — `feat({scope}): {title}` 형식
3. `complete_task "$RUN_DIR" TASK_ID COMMIT_HASH "커밋 메시지"` — status + commit 증거 자동

**주의: `update_task_status`를 직접 호출하지 않는다. `complete_task`가 내부에서 호출한다.**

### 3. 완료

모든 Task 처리 후 `evidence/execute/done.json` 기록 + 결과 요약 출력.

## 코드 생성 규칙

1. **conventions.json을 최우선** — naming, style, annotations, patterns
2. **forbidden 위반 금지** — 생성 전 확인
3. **기존 코드 일관성** — 주변 파일 패턴 따르기
