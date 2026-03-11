# verify — 전체 회귀 검증

## 목적

모든 태스크 커밋이 완료된 후, `TARGET_PROJECT_DIR`에서 전체 빌드·테스트를 실행하여 회귀를 검출한다.

## 전제 조건

- `.harness/plan.json` 존재
- `.harness/tasks/*.json` 존재 (execute 단계 완료)
- `.harness/.env`의 `TARGET_PROJECT_DIR`, `VERIFY_CMD` 설정됨

## 실행 지침

### 1단계: 전체 검증 실행

`.harness/.env`에서 `VERIFY_CMD`를 읽는다.

```bash
cd <TARGET_PROJECT_DIR> && <VERIFY_CMD>
```

`VERIFY_CMD`가 없으면:
```bash
cd <TARGET_PROJECT_DIR> && pnpm typecheck && pnpm test
```

### 2단계: 결과 분석

#### 성공 (exit 0)

`.harness/verify.json`에 Write 도구로 저장:

```json
{
  "verdict": "pass",
  "checks": [
    { "name": "typecheck", "passed": true, "detail": "타입 체크 통과" },
    { "name": "test", "passed": true, "detail": "전체 테스트 통과" }
  ],
  "failure_reasons": []
}
```

#### 실패 (exit != 0)

1. 에러 출력을 분석한다:
   - 어떤 파일에서 에러가 발생했는지 파악
   - `.harness/tasks/*.json`의 변경 파일 목록과 대조하여 어떤 태스크의 변경이 원인인지 추론
   - 타입 에러, 테스트 실패, 빌드 에러를 구분

2. 수정 시도:
   - 원인이 명확하면 해당 파일을 Read → Edit로 수정
   - 수정 후 검증 재실행 (최대 3회)

3. 3회 초과 실패 시:
   - `.harness/verify.json`에 실패 결과를 기록하고 사용자에게 보고

```json
{
  "verdict": "fail",
  "checks": [
    { "name": "typecheck", "passed": true, "detail": "타입 체크 통과" },
    { "name": "test", "passed": false, "detail": "3개 테스트 실패" }
  ],
  "failure_reasons": [
    "src/features/auth/login.test.ts: expected 200 but got 401",
    "T-2 변경에 의한 회귀 가능성"
  ],
  "attempted_fixes": 3
}
```

## 완료 후 사용자에게 보여줄 내용

```
[verify 완료]
결과: pass ✓ (또는 fail ✗)
  - typecheck: pass
  - test: pass
  - build: pass
```

실패 시:
```
[verify 실패]
결과: fail ✗
실패 원인:
  1. src/features/auth/login.test.ts — expected 200 but got 401
  2. 원인 추정: T-2의 인증 미들웨어 변경
수정 시도: 3회 (모두 실패)
→ 수동 확인이 필요합니다.
```
