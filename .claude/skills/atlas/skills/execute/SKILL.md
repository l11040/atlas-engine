---
name: execute
description: >
  plan이 생성한 Wave 기반 실행 계획에 따라 Task를 순회하며 코드를 생성하고,
  빌드 검증 후 Task별로 커밋한다. 코드 자동 생성, 빌드 검증, Task 커밋이 필요할 때 사용.
---

# /execute — 코드 생성 + 검증 + 커밋

## 목적

`/plan`이 생성한 `execution-plan.json`의 Wave/Task 순서에 따라 **실제 코드를 생성하고, 빌드를 검증하며, Task 단위로 커밋**한다.

## 옵션

- `$1` (필수) — Jira 티켓 키 (예: `GRID-123`)
- `--force` → COMPLETED Task도 재실행 (v1에서는 미지원)

## 실행 흐름

### 0. 사전 확인

1. `RUN_DIR` 환경변수가 설정되어 있어야 한다 (파이프라인에서 전달).
2. pre-execute Hook을 실행하여 `/plan` 증거를 확인한다:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/pre-step/pre-execute.sh
   ```
3. 티켓 키 인자가 없으면 에러를 출력하고 종료한다.

### 1. 실행 매니페스트 로드

```bash
python3 skills/execute/scripts/load-wave-plan.py \
  --ticket-key ${TICKET_KEY} \
  --run-dir ${RUN_DIR}
```

stdout JSON을 읽어 Wave/Task 목록을 확보한다.

**Exit codes:**
- `0`: 실행할 Task가 있음 (`status: "ready"`)
- `1`: 파일 누락 에러
- `2`: 모든 Task가 이미 COMPLETED (`status: "all_completed"`) → "모든 Task 완료" 출력 후 증거 생성으로 이동

### 2. 컨벤션 로드

`${PROJECT_ROOT}/.automation/conventions.json`을 **읽어서 컨텍스트에 보유**한다.
코드 생성 시 이 컨벤션의 naming, style, annotations, patterns, forbidden, required를 준수한다.

### 3. Wave 순회

매니페스트의 `waves` 배열을 `wave_index` 0부터 순차 처리한다.

#### 3.1 Wave 내 병렬 실행 판단

매니페스트의 각 Wave에는 `parallel` 플래그가 있다:

- **`parallel: true` + Task 2개 이상**: Wave 내 Task들은 서로 독립적이다. **Agent 도구를 사용하여 Task들을 병렬로 실행**한다. 각 Agent에 개별 Task의 Phase 1~3 전체를 위임한다.
- **`parallel: false` 또는 Task 1개**: 순차 처리한다.

> 주의: `has_file_conflicts: true`인 Wave는 `parallel`이 자동으로 `false`로 설정된다. 충돌 파일을 가진 Task는 반드시 순차 실행해야 한다.

#### 3.2 Task 실행 (각 Task에 대해)

각 Task는 3개 Phase를 거친다:

---

**■ Phase 1 — 코드 생성**

1. Lifecycle Hook 실행:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/lifecycle/pre-task.sh ${TASK_ID}
   ```

2. 상태 전이 PENDING → RUNNING:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/edges/pending-to-running.sh ${TASK_ID}
   ```

3. 컨텍스트 수집 — 아래 파일들을 **읽는다**:
   - `${RUN_DIR}/tasks/${TASK_ID}/meta/task.json` — type, expected_files, acceptance_criteria, policy_refs
   - 매니페스트의 `ticket_paths` — L2 Subtask + L1 Story 컨텍스트
   - `${PROJECT_ROOT}/.automation/conventions.json` — 이미 로드된 컨벤션

4. **코드 생성** — Write/Edit 도구를 사용하여 코드를 작성한다:
   - **Write/Edit 전 가드 필수**: 모든 파일 수정 전에 반드시 가드 스크립트를 실행한다:
     ```bash
     ATLAS_STEP=execute PROJECT_ROOT=${PROJECT_ROOT} RUN_DIR=${RUN_DIR} \
       bash hooks/guard/check-file-policy.sh "<대상 파일>" "write"
     ```
     exit 0이 아니면 해당 파일의 Write/Edit을 **실행하지 않고** 사용자에게 보고한다.
   - `task.json`의 `expected_files`에 명시된 경로에 파일을 생성/수정한다
   - `acceptance_criteria`의 각 항목을 충족하도록 구현한다
   - `conventions.json`의 규칙을 준수한다 (naming, style, annotations, forbidden, required)
   - `policy_refs`가 있으면 해당 Policy를 만족하는 코드를 작성한다

5. Artifact 기록:
   ```bash
   RUN_DIR=${RUN_DIR} bash skills/execute/scripts/record-artifacts.sh ${TASK_ID}
   ```

6. 상태 전이 RUNNING → VALIDATING:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/edges/running-to-validating.sh ${TASK_ID}
   ```

---

**■ Phase 2 — 검증**

1. 빌드/타입체크 실행:
   ```bash
   RUN_DIR=${RUN_DIR} bash skills/execute/scripts/run-validation.sh ${TASK_ID}
   ```

2. 상태 전이 VALIDATING → REVIEWING (또는 FAILED):
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/edges/validating-to-reviewing.sh ${TASK_ID}
   ```

3. **검증 실패 시 재시도 판단:**
   - `validating-to-reviewing.sh`가 exit 1을 반환하면 Task는 FAILED 상태
   - 재시도 가능 여부 확인:
     ```bash
     RUN_DIR=${RUN_DIR} bash hooks/edges/failed-to-pending.sh ${TASK_ID}
     ```
   - `failed-to-pending.sh`가 성공하면 → Phase 1부터 재시도
   - `failed-to-pending.sh`가 실패하면 (max_retries 초과) → 이 Task를 FAILED로 남기고 다음 Task로 이동
   - FAILED Task가 다른 Task의 dependency인 경우, 해당 Task도 자동으로 스킵된다 (pending-to-running.sh가 차단)

---

**■ Phase 3 — 리뷰 + 커밋**

1. **자체 리뷰** — 생성된 코드를 `acceptance_criteria` 기준으로 검토한다:
   - 각 AC의 `status`를 `"pending"` → `"verified"` 또는 `"failed"`로 갱신한다
   - `task.json`의 `acceptance_criteria` 배열을 **직접 수정**한다 (Edit 도구 사용)
   - MUST 레벨 AC가 하나라도 `"failed"`이면 이 Task의 리뷰 실패로 처리한다

2. 리뷰 통과 시 — 상태 전이 REVIEWING → COMPLETED + git commit:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/edges/reviewing-to-completed.sh ${TASK_ID}
   ```

3. Lifecycle Hook 실행:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/lifecycle/post-task.sh ${TASK_ID}
   ```

---

#### 3.3 Wave 완료 확인

Wave 내 모든 Task 처리가 끝나면:
- COMPLETED Task 수 + FAILED Task 수를 집계한다
- FAILED Task가 있으면 경고를 출력하되, **다음 Wave로 진행**한다
  - 단, FAILED Task에 의존하는 Task는 `pending-to-running.sh`에서 자동 차단된다

### 4. 증거 생성

모든 Wave 처리 완료 후 post-execute Hook을 실행한다:

```bash
RUN_DIR=${RUN_DIR} bash hooks/post-step/post-execute.sh
```

### 5. 결과 출력

아래 정보를 요약 출력한다:
1. Wave별 Task 완료 현황 (COMPLETED / FAILED / SKIPPED)
2. 생성/수정된 파일 수 (전체 artifacts 집계)
3. 생성된 커밋 수
4. 검증 결과 (post-execute evidence status)

## 병렬 실행 가이드

Wave의 `parallel: true`일 때 Agent 도구로 병렬 실행하는 방법:

1. Wave의 tasks 배열에서 각 Task를 개별 Agent에 위임한다
2. 각 Agent에는 다음 정보를 전달한다:
   - TASK_ID, RUN_DIR, PROJECT_ROOT 경로
   - task.json 전체 내용
   - ticket_paths의 티켓 파일 내용
   - conventions.json 내용 (또는 핵심 규칙 요약)
3. Agent는 Phase 1~3를 독립적으로 수행한다
4. 모든 Agent 완료 후 결과를 취합한다

> 주의: 병렬 Agent는 같은 파일을 수정하지 않는 경우에만 안전하다. `has_file_conflicts`가 false인 Wave에서만 병렬 실행한다.

## 코드 생성 규칙

1. **conventions.json을 최우선으로 따른다** — naming, style, annotations, patterns 모두 적용
2. **forbidden 규칙을 위반하지 않는다** — 생성 전 forbidden 목록을 확인
3. **required 규칙을 충족한다** — 누락 시 리뷰에서 실패
4. **expected_files 경로를 정확히 사용한다** — 경로 변경 불가
5. **기존 코드와 일관성을 유지한다** — 주변 파일을 읽어 패턴을 파악
