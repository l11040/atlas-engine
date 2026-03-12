# atlas v1 vs v2 — 왜 v1이 더 좋은 결과를 냈는가

**배경:** 2026-03-12 GRID-2 티켓으로 v2 파이프라인을 실행한 결과, v1(rio/atlas-v1 브랜치)으로 실행했을 때보다 코드 생성 품질이 떨어졌다.

## 수치 비교

| 항목 | v1 | v2 |
|------|----|----|
| 프롬프트 총 줄 수 | 374줄 | 843줄 |
| Python 스크립트 | 1개 (atlas.py, 유틸리티) | 4개 (1,500줄+, 로직 대체) |
| 상태 모델 | 2상태 (completed/failed) | 5상태 + 5 edge hook + lifecycle hook |
| 스키마 파일 | 0개 | 8개 |
| Hook 스크립트 | 0개 | 10개+ |

## 5가지 원인

### 1. v1은 "무엇을"에 집중, v2는 "어떻게"에 집중

**v1 execute.md:**
> "태스크의 description을 읽고 구현 목표를 파악한다 → 코드를 수정한다 → 검증한다"

LLM이 가장 잘하는 것(코드 이해, 생성)에 자유도를 줬다.

**v2 execute SKILL.md:**
> "pending-to-running.sh 실행 → record-artifacts.sh 실행 → running-to-validating.sh 실행 → validating-to-reviewing.sh 실행..."

LLM의 컨텍스트를 **절차 준수**에 소비시켜서, 정작 코드 생성 품질에 쓸 토큰이 줄었다.

### 2. v1은 Python으로 "정형 작업만" 위임, v2는 Python으로 "LLM이 할 일"도 위임

**v1:** `atlas.py`는 env 체크, diff 출력, scope 검증 — 순수 유틸리티
**v2:** `fetch-ticket.py`(831줄), `decompose-tasks.py`(357줄), `load-wave-plan.py`, `generate-plan.py` — LLM이 직접 하면 더 잘할 분석/분해까지 Python에 하드코딩

Python 스크립트가 Jira 데이터를 미리 가공하면서 **정보 손실**이 발생하고, 스크립트 버그가 파이프라인을 막았다.

### 3. v1은 단순한 상태 모델, v2는 과도한 상태 머신

**v1:** `plan.json` → 실행 → `tasks/*.json` (completed/failed)
**v2:** PENDING → RUNNING → VALIDATING → REVIEWING → COMPLETED, 5개 상태 × 5개 edge hook × pre/post lifecycle hook

상태 전이 오류가 코드 생성보다 더 많은 시간을 소비했다.

### 4. v1은 scope를 코드로 강제, v2는 원칙으로만 명시

**v1:** `atlas.py scope` 명령이 실제로 변경된 파일을 검사하고, 위반하면 `git checkout`으로 되돌림
**v2:** SKILL.md에 "expected_files 경로를 정확히 사용한다"라고만 적음

아이러니하게도, v1이 **실제 강제력 있는 제어**를 더 잘 했다.

### 5. 오케스트레이션 오버헤드

v2의 Hook 체인(pre-step → edge → lifecycle → post-step)은 각 단계에서 Bash 실행 + 결과 파싱 + 에러 처리를 요구한다. 이 오버헤드가 LLM의 컨텍스트 윈도우를 소비하여, 실제 코드 생성 시점에 참조할 수 있는 컨텍스트가 줄어든다.

## 요약 테이블

| 차원 | v1 | v2 |
|------|----|----|
| 프롬프트 복잡도 | 간결 (374줄) | 과잉 (843줄) |
| LLM 자유도 | 높음 — 코드 생성에 집중 | 낮음 — 절차 준수에 집중 |
| 스크립트 역할 | 유틸리티 (검증, diff) | 로직 대체 (분석, 분해) |
| 상태 관리 | 2상태 (completed/failed) | 5상태 + hook 체인 |
| 강제 제어 | 코드로 (scope 검증) | 원칙으로 (SKILL.md 지시) |

## 결론

v2는 LLM을 "스크립트 실행기"로 만들었고, v1은 LLM을 "코드 생성기"로 활용했다. 오케스트레이션이 정교해질수록 LLM이 잘하는 일에 쓸 여력이 줄어든다.

### v3 설계 시 시사점

- LLM에게는 **목표와 제약**만 주고, 절차는 최소화한다
- 정형 작업(검증, diff, scope 체크)만 스크립트로, 분석/생성은 LLM에게 맡긴다
- 상태 머신은 단순하게 유지한다 (2~3상태)
- 강제 제어는 "원칙"이 아니라 "실행 후 검증 코드"로 한다
