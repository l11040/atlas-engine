# execute — 태스크별 코드 생성·검증·커밋

## 목적

plan.json의 태스크를 순서대로 실행하여 `TARGET_PROJECT_DIR`의 코드를 수정하고, 검증하고, 커밋한다.

## 전제 조건

- `.harness/plan.json` 존재 (plan 단계 완료)
- `.harness/.env`의 `TARGET_PROJECT_DIR` 설정됨

## 실행 지침

### 준비

1. `.harness/plan.json`을 Read 도구로 읽는다.
2. `execution_order` 순서대로 태스크를 처리한다.
   - `--task=T-1` 인자가 있으면 해당 태스크만 실행한다.
3. `.harness/tasks/` 디렉토리를 생성한다 (없으면).

### 태스크별 실행 루프

각 태스크에 대해 아래 과정을 반복한다:

---

#### A. 코드 생성

1. 태스크의 `description`을 읽고 구현 목표를 파악한다.
2. `TARGET_PROJECT_DIR`에서 `scope.editable_paths` 범위의 관련 파일을 Read/Grep 도구로 읽는다.
3. 코드를 수정한다:
   - Read 도구로 기존 코드를 읽는다
   - Edit 도구로 수정한다
   - 새 파일이 필요하면 Write 도구로 생성한다
4. **절대 규칙**: `scope.forbidden_paths`에 해당하는 파일은 읽기만 가능하고 **절대 수정하지 않는다**.

#### B. 스코프 검증

```bash
python3 .claude/skills/atlas/atlas.py scope --task=<task-id> --cwd=<TARGET_PROJECT_DIR>
```

- `violation_count: 0` → 통과. 다음 단계로.
- `violation_count > 0` → 위반 파일의 변경을 되돌린다 (`git checkout -- <file>`). 스코프 내에서 다시 수정을 시도한다.

#### C. 빌드/테스트 검증

태스크의 `verify_cmd`가 있으면:

```bash
cd <TARGET_PROJECT_DIR> && <verify_cmd>
```

- **성공** (exit 0) → 통과.
- **실패** (exit != 0) → 에러 출력을 분석하고 코드를 수정한다.
  - 최대 3회 재시도.
  - 3회 초과 시 사용자에게 실패 내용을 보여주고 판단을 위임한다.

`verify_cmd`가 없으면 이 단계를 건너뛴다.

#### D. 변경 기록

```bash
python3 .claude/skills/atlas/atlas.py diff --cwd=<TARGET_PROJECT_DIR>
```

결과를 `.harness/tasks/<task-id>.json`에 Write 도구로 저장한다:

```json
{
  "task_id": "T-1",
  "status": "completed | failed",
  "changes": [
    { "path": "src/features/auth/login.ts", "status": "modify", "additions": 25, "deletions": 3 }
  ],
  "verification": {
    "verdict": "pass | fail",
    "verify_cmd": "pnpm typecheck",
    "output_summary": "검증 결과 요약을 한글로"
  },
  "scope_violations": [],
  "attempts": 1,
  "error": null
}
```

#### E. 커밋

검증 통과 시:

```bash
cd <TARGET_PROJECT_DIR> && git add <변경된 파일 목록> && git commit -m "feat(<task-id>): <task-title>"
```

- 커밋 메시지는 `feat(<task-id>): <title>` 형식.
- `git add .`는 사용하지 않는다. 변경된 파일만 명시적으로 추가한다.

#### F. 다음 태스크

사용자에게 현재 태스크 결과를 보여주고, 다음 태스크로 진행한다.

---

## 실패 처리

| 상황 | 처리 |
|------|------|
| 스코프 위반 | 위반 파일 변경을 되돌리고 스코프 내에서 재시도 |
| verify_cmd 실패 (1~3회) | 에러 분석 후 코드 수정하여 재시도 |
| verify_cmd 실패 (3회 초과) | 사용자에게 실패 내용 보고. `status: "failed"` 기록 |
| 변경 사항 없음 | `status: "completed"`, 변경 불필요 사유 기록 |

## 완료 후 사용자에게 보여줄 내용

```
[execute 완료]
| 태스크 | 상태 | 변경 파일 | 검증 |
|--------|------|----------|------|
| T-1: ... | completed | 3개 (+25 -3) | pass |
| T-2: ... | completed | 1개 (+10 -0) | pass |
```
