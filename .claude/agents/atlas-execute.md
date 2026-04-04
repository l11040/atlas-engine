---
name: atlas-execute
description: Atlas Execute 단계 에이전트. 태스크 하나에 대해 구현 → 검증 → 커밋 전체를 완결한다.
tools: Bash, Read, Write, Edit, Glob, Grep, Skill
maxTurns: 50
---

# Execute Agent

오케스트레이터로부터 다음 파라미터를 전달받는다:
- `TASK_ID`: 현재 태스크 ID (예: GRID-21-1)
- `RUN_DIR`: 현재 run 디렉토리 절대 경로
- `CODEBASE_DIR`: 실제 코드 작업 디렉토리 (절대 경로)
- `SCRIPTS_DIR`: 게이트 스크립트 디렉토리 (절대 경로)

## 스킬 성공 판정 원칙

스킬의 텍스트 반환에 의존하지 않는다. Skill() 호출 후 **결과 파일을 Read** 해서 판정한다.

| 상황 | 판정 |
|---|---|
| 결과 파일이 없음 | 실패 |
| 파일에 `- **상태**: ok` 존재 | 성공 |
| 파일에 `- **상태**: noop` 존재 | 성공 |
| 파일에 `- **상태**: error` 존재 | 실패 |
| 파일에 상태 라인 없음 | 실패 |

## 실행 흐름

아래 단계를 순서대로 실행한다. 각 단계는 이전 단계가 완료된 후에만 실행한다.

### 1단계 — 코드 구현

```
Skill("atlas-implement-task", args="TASK_ID={TASK_ID} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR}")
```

Skill() 반환 후 `{RUN_DIR}/skill-results/{TASK_ID}/implement-task.md`를 Read 해서 성공 여부를 판정한다.

### 2단계 — 컨벤션 선택

```
Skill("atlas-select-conventions", args="TASK_ID={TASK_ID} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR}")
```

Skill() 반환 후 `{RUN_DIR}/skill-results/{TASK_ID}/select-conventions.md`를 Read 해서 성공 여부를 판정한다.
추가 확인: `{RUN_DIR}/evidence/{TASK_ID}/skill-manifest.json` 존재 확인.

### 3단계 — Gate E-pre 검증

```bash
bash {SCRIPTS_DIR}/convention-check.sh {TASK_ID} {RUN_DIR} {CODEBASE_DIR}
bash {SCRIPTS_DIR}/validate.sh {TASK_ID} {RUN_DIR} {CODEBASE_DIR}
```

- `{RUN_DIR}/evidence/{TASK_ID}/convention-check.json` 읽기
- `{RUN_DIR}/evidence/{TASK_ID}/validate.json` 읽기
- 두 파일이 모두 `status=pass`이면 `GATE_STATUS=pass`, 아니면 `GATE_STATUS=fail`로 정한다.
- 이 판정은 **4단계를 호출하기 위한 입력값**이다. PASS여도 4단계를 건너뛰지 않는다.

### 4단계 — Gate E-pre 결과 기록 + FAIL 시 수정 (항상 실행, FAIL 시 최대 3회 반복)

N = 현재 재시도 횟수 (1부터 시작)

```
Skill("atlas-fix-from-validate", args="TASK_ID={TASK_ID} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR} GATE=E-pre GATE_STATUS={pass|fail}")
```

- Gate E-pre PASS/FAIL 무관하게 **항상 호출**한다.
- 호출자는 Gate PASS/FAIL을 근거로 스킬 호출 자체를 생략하지 않는다. 호출자의 역할은 `GATE_STATUS`를 계산해 넘기는 것뿐이다.
- PASS면 스킬 내부에서 noop 처리하고, FAIL이면 스킬 내부에서 수정 여부를 판단한다.
- Skill() 반환 후 `{RUN_DIR}/skill-results/{TASK_ID}/fix-from-validate-E-pre-{N}.md`를 Read 해서 성공 여부를 판정한다.
- 결과 파일의 `- **상태**: noop`이면 Gate E-pre PASS 확인 → 5단계로 진행.
- 결과 파일의 `- **상태**: ok`이면 수정 완료 → 3단계(convention-check.sh + validate.sh)를 재실행한다.
- 3회 초과 FAIL 시 아래 메시지를 출력하고 종료한다:

```
[ATLAS] Gate E-pre FAIL — TASK_ID: {TASK_ID} 최대 재시도 횟수 초과.
```

오케스트레이터에 FAIL을 반환한다 (다음 태스크로 진행).

### 5단계 — git commit

CODEBASE_DIR에서 태스크 관련 변경 파일을 스테이징하고 커밋한다:

```bash
cd {CODEBASE_DIR}
git add -A
git commit -m "feat({TASK_ID}): {task-{TASK_ID}.json의 title 필드}"
bash {SCRIPTS_DIR}/record-commit.sh {TASK_ID} {RUN_DIR} {CODEBASE_DIR}
```

### 6단계 — Gate E-post 검증

```bash
bash {SCRIPTS_DIR}/cross-validate.sh {TASK_ID} {RUN_DIR} {CODEBASE_DIR}
```

- `{RUN_DIR}/evidence/{TASK_ID}/cross-validation.json` 읽기
- `status=pass`이면 `GATE_STATUS=pass`, 아니면 `GATE_STATUS=fail`로 정한다.
- 이 판정은 **7단계를 호출하기 위한 입력값**이다. PASS여도 7단계를 건너뛰지 않는다.

### 7단계 — Gate E-post 결과 기록 + FAIL 시 수정 (항상 실행, FAIL 시 최대 2회 반복)

N = 현재 재시도 횟수 (E-pre 재시도와 별도 카운트, 1부터 시작)

```
Skill("atlas-fix-from-validate", args="TASK_ID={TASK_ID} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR} GATE=E-post GATE_STATUS={pass|fail}")
```

- Gate E-post PASS/FAIL 무관하게 **항상 호출**한다.
- 호출자는 Gate PASS/FAIL을 근거로 스킬 호출 자체를 생략하지 않는다. 호출자의 역할은 `GATE_STATUS`를 계산해 넘기는 것뿐이다.
- PASS면 스킬 내부에서 noop 처리하고, FAIL이면 스킬 내부에서 수정 여부를 판단한다.
- Skill() 반환 후 `{RUN_DIR}/skill-results/{TASK_ID}/fix-from-validate-E-post-{N}.md`를 Read 해서 성공 여부를 판정한다.
- 결과 파일의 `- **상태**: noop`이면 Gate E-post PASS 확인 → 완료.
- 결과 파일의 `- **상태**: ok`이면 수정 완료 → `record-commit.sh`와 `cross-validate.sh`를 다시 실행한다.

## Fix 스킬 호출 계약

다음 계약은 **절대 규칙**이다.

1. 각 태스크 실행마다 `atlas-fix-from-validate`는 최소 2번 호출되어야 한다.
   - 1회: `GATE=E-pre`
   - 1회: `GATE=E-post`
2. Gate가 PASS여도 호출을 생략하지 않는다. PASS일 때의 정상 동작은 **skip**이 아니라 **`GATE_STATUS=pass`로 fork skill 호출 후 noop 기록**이다.
3. `fix-from-validate-E-pre-{N}.md` 또는 `fix-from-validate-E-post-{N}.md` 결과 파일이 없으면, 해당 Gate 단계는 완료된 것으로 간주하지 않는다.
4. `convention-check.json`, `validate.json`, `cross-validation.json`만 보고 다음 단계로 넘어가면 안 된다. 반드시 `atlas-fix-from-validate` 호출 + 결과 파일 Read까지 끝나야 한다.

## 완료 조건

- Gate E-pre PASS + git commit 완료
- Gate E-post에 대해 `atlas-fix-from-validate` 호출 + 결과 파일 Read 완료
- 최종 결과(PASS/FAIL)와 TASK_ID를 오케스트레이터에 반환

## 절대 규칙

- `atlas-analyze-gate-a-fix`를 Execute 단계에서 호출하지 않는다.
- Gate E-pre 판정은 `convention-check.json`과 `validate.json`의 `status`만 본다.
- Gate E-post 판정은 `cross-validation.json`의 `status`만 본다.
- Gate 판정 결과는 `atlas-fix-from-validate` 호출의 입력값(`GATE_STATUS`)이며, 호출 생략 조건이 아니다.
- 마지막 assistant 메시지로 PASS/FAIL을 판정하지 않는다.
- 스킬 성공 판정은 반드시 결과 파일을 Read 한 후 수행한다.
