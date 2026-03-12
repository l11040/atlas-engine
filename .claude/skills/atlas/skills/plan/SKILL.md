---
name: plan
description: >
  analyze가 생성한 Task 목록과 의존성 그래프를 읽어 Wave 기반 실행 계획을 생성한다.
  DAG 위상 정렬로 병렬 실행 가능한 Task를 같은 Wave에 배치한다.
disable-model-invocation: true
---

# /plan — 실행 계획 수립

## 목적

`/analyze`가 생성한 Task 목록과 의존성 그래프를 읽어, Wave 기반 실행 계획(`execution-plan.json`)을 생성한다.
Wave는 의존성이 해소된 Task들을 병렬 실행할 수 있는 단위다.

## 옵션

- `$1` (필수) — Jira 티켓 키 (예: `GRID-123`)
- `--force` → 기존 실행 계획을 무시하고 재생성

## 실행 흐름

### 0. 사전 확인

1. `RUN_DIR` 환경변수가 설정되어 있어야 한다 (파이프라인에서 전달).
2. pre-plan Hook을 실행하여 `/analyze` 증거를 확인한다:
   ```bash
   RUN_DIR=${RUN_DIR} bash hooks/pre-step/pre-plan.sh
   ```
3. 티켓 키 인자가 없으면 에러를 출력하고 종료한다.

### 1. 실행 계획 생성

`scripts/generate-plan.py`를 실행한다:

```bash
python3 skills/plan/scripts/generate-plan.py \
  --ticket-key ${TICKET_KEY} \
  --run-dir ${RUN_DIR}
```

`--force` 옵션이 있으면 스크립트에도 전달한다.

**스크립트가 수행하는 작업:**
- `dependency-graph.json`에서 DAG를 읽고 Kahn's Algorithm으로 위상 정렬
- 의존성이 해소된 Task들을 같은 Wave에 배치 (병렬 실행 가능)
- Wave 내 `expected_files` 충돌 감지 및 경고
- `${RUN_DIR}/execution-plan.json`을 `execution-plan.schema.json` 구조로 저장

**Exit codes:**
- `0`: 성공 (또는 기존 계획 존재 — `status: exists`)
- `1`: 인자 오류 또는 파일 누락
- `2`: 순환 의존성 감지 → 에러 출력, 수동 해결 필요
- `3`: DAG 노드와 실제 Task 파일 수 불일치

### 2. 결과 확인

스크립트의 stdout은 JSON이다. `status` 필드를 확인한다:

- `"exists"` → 기존 계획 로드됨. "기존 실행 계획을 로드했습니다. 강제 재생성: `--force`" 출력 후 종료.
- `"created"` → 새 계획 생성됨. `warnings`가 있으면 파일 충돌 경고를 출력한다.

### 3. 검증 + 증거 생성

post-plan Hook을 실행한다:

```bash
RUN_DIR=${RUN_DIR} bash hooks/post-step/post-plan.sh
```

Hook이 검증하는 항목:
1. `execution-plan.json` 스키마 검증
2. `total_tasks`와 실제 Task 수 일치
3. 모든 Task가 정확히 하나의 Wave에 배치 (중복 없음)

### 4. 결과 출력

1. Wave별 Task 목록 (테이블 형태)
2. 병렬 실행 가능 Wave 표시
3. 파일 충돌 경고 (있는 경우)
4. 스키마 검증 결과

## 출력 예시

```
Wave 0: [TASK-a1b2, TASK-e5f6]  (parallel)  — 엔티티 2개 동시
Wave 1: [TASK-c9d0]             (sequential) — 마이그레이션
Wave 2: [TASK-a3b4]             (sequential) — 레포지토리
Wave 3: [TASK-e7f8, TASK-c1d2]  (parallel)  — 서비스 + 검증
```
