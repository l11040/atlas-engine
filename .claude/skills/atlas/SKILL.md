# 아틀라스 — 티켓 기반 코드 자동화 파이프라인

Jira 티켓을 입력으로 받아 요구사항 분석 → 계획 → 코드 생성 → 검증까지 자동 실행한다.

## 사용법

```
/atlas                          전체 파이프라인 (티켓 키 입력 요청)
/atlas GRID-123                 해당 티켓으로 전체 파이프라인
/atlas --from=plan              plan 단계부터 재시작
/atlas --step=analyze           analyze 단계만 단독 실행
/atlas --step=execute --task=T1 특정 태스크만 실행
```

## 환경 설정 확인

모든 실행 전에 `.harness/.env`를 검증한다.

```bash
python3 .claude/skills/atlas/atlas.py env --require=TARGET_PROJECT_DIR
```

실패 시 사용자에게 `.harness/.env` 설정을 요청하고 중단한다.

## 파이프라인 순서

```
ingest → analyze → plan → execute → verify
```

각 단계의 상세 지침은 같은 폴더의 개별 파일을 참조한다:

| 단계 | 파일 | 입력 | 출력 |
|------|------|------|------|
| **ingest** | `.claude/skills/atlas/ingest.md` | Jira 티켓 키 | `.harness/ticket.json` |
| **analyze** | `.claude/skills/atlas/analyze.md` | ticket.json | `.harness/requirements.json`, `.harness/risk.json` |
| **plan** | `.claude/skills/atlas/plan.md` | requirements.json, risk.json | `.harness/plan.json` |
| **execute** | `.claude/skills/atlas/execute.md` | plan.json | `.harness/tasks/*.json` + 코드 변경 |
| **verify** | `.claude/skills/atlas/verify.md` | plan.json | `.harness/verify.json` |

## 실행 방식

### 전체 파이프라인
1. 환경 설정 확인
2. `.claude/skills/atlas/ingest.md`의 지침을 읽고 실행
3. `.claude/skills/atlas/analyze.md`의 지침을 읽고 실행
4. `.claude/skills/atlas/plan.md`의 지침을 읽고 실행
5. `.claude/skills/atlas/execute.md`의 지침을 읽고 실행
6. `.claude/skills/atlas/verify.md`의 지침을 읽고 실행

### `--step=<name>` (단독 실행)
해당 단계의 md 파일만 읽고 실행한다. 이전 단계 출력 파일이 없으면 에러.

### `--from=<name>` (재시작)
해당 단계부터 끝까지 순차 실행한다. 이전 단계 출력 파일을 재활용한다.

| `--from` | 필요한 기존 파일 |
|----------|-----------------|
| analyze | ticket.json |
| plan | ticket.json, requirements.json, risk.json |
| execute | 위 + plan.json |
| verify | 위 + tasks/*.json |

## 공통 규칙

- **모든 코드 읽기/쓰기는 `TARGET_PROJECT_DIR` 안에서만** 수행한다.
- `.harness/` 안의 JSON 파일만 atlas-engine 저장소에 쓴다.
- 각 단계 완료 후 사용자에게 간략한 결과 요약을 보여준다.
