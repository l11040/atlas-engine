# Hook 아키텍처

## 핵심 원칙: 자기 검증 + 증거 파일

각 스텝은 완료 후 **post-step Hook**이 산출물을 스키마 검증하고 증거 파일을 남긴다.
다음 스텝의 **pre-step Hook**은 이전 스텝의 증거 파일 존재만 확인한다.

```
스텝 실행 → 산출물 생성 → [post-step Hook] 스키마 검증 → 증거 파일 생성
                                                              ↓
다음 스텝 시작 → [pre-step Hook] 증거 파일 존재 확인 → 통과/차단
```

## 증거 파일

- 위치: `.automation/evidence/{step}.validated.json`
- 스키마: `schemas/step-evidence.schema.json`

```json
{
  "step": "learn",
  "status": "validated",
  "validated_at": "2026-03-11T12:00:00Z",
  "outputs": [
    { "file": ".automation/conventions.json", "schema": "conventions", "valid": true }
  ],
  "duration_ms": 150
}
```

## Hook 매핑

### post-step (스텝 완료 후 — 자기 산출물 검증)

| 스텝 | Hook | 검증 대상 | 스키마 |
|------|------|----------|--------|
| learn | `post-learn.sh` | conventions.json | conventions.schema.json |
| analyze | `post-analyze.sh` | tasks/*/meta/task.json, decomposition-log.json | task-meta, etc. |
| plan | `post-plan.sh` | dependency-graph.json, execution-plan.json | dependency-graph, execution-plan |
| execute | `post-execute.sh` | tasks/*/state/status.json, evidence/ | task-status, evidence-event |
| complete | `post-complete.sh` | reports/report-*.json | (리포트 스키마) |

### pre-step (스텝 시작 전 — 이전 증거 확인)

| 스텝 | Hook | 확인 대상 |
|------|------|----------|
| analyze | `pre-analyze.sh` | `evidence/learn.validated.json` 존재 + status=validated |
| plan | `pre-plan.sh` | `evidence/analyze.validated.json` 존재 + status=validated |
| execute | `pre-execute.sh` | `evidence/plan.validated.json` 존재 + status=validated |
| complete | `pre-complete.sh` | `evidence/execute.validated.json` 존재 + status=validated |

### 실행 방식

스킬 파일(learn.md 등)에서 산출물 생성 직후 Bash로 post-step Hook을 실행하도록 지시한다.
agentskills.io 스펙에서 `hooks` frontmatter는 미지원이므로, 스킬 본문의 명시적 지시로 처리한다.

```markdown
# 스킬 파일 내 지시 예시
conventions.json 생성 후 post-step Hook을 실행한다:
bash hooks/post-step/post-learn.sh
```

### Edge Hooks (Task 상태 전이 — /execute 단계)

| Hook | 전이 | 역할 |
|------|------|------|
| `pending-to-running.sh` | PENDING→RUNNING | 의존 Task COMPLETED 확인, 도구 확인 |
| `running-to-validating.sh` | RUNNING→VALIDATING | artifacts 존재 + 해시, diff 생성 |
| `validating-to-reviewing.sh` | VALIDATING→REVIEWING | validation 결과 스키마 검증, 필수 단계 passed |
| `reviewing-to-completed.sh` | REVIEWING→COMPLETED | review passed, 증거 생성, git commit, hash 기록 |
| `failed-to-pending.sh` | FAILED→PENDING | retry_count < max, 실패 분석, 롤백 |

### Lifecycle Hooks

| Hook | 시점 | 역할 |
|------|------|------|
| `pre-task.sh` | Task 시작 전 | 디렉토리 준비, started_at + HEAD 기록 |
| `post-task.sh` | Task 완료 후 | duration 계산, state 갱신 |
| `pre-write.sh` | 파일 쓰기 전 | 기존 파일 백업 |
| `post-write.sh` | 파일 쓰기 후 | SHA-256 해시 + 크기 → artifacts.json |
