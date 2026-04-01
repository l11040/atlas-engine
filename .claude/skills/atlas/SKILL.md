---
name: atlas
description: Jira 티켓 기반 코드 자동 생성 엔진. 확정된 티켓 JSON을 기준으로 Setup → Analyze → Execute → Audit 파이프라인을 오케스트레이션할 때 사용한다.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Atlas v5 — 오케스트레이터

메인 에이전트는 경량 오케스트레이터로만 동작한다.
각 단계는 `.claude/agents/` 의 fork 에이전트에 위임한다.
단계 에이전트는 다시 세부 스텝별 fork 서브에이전트를 호출하고, 각 서브에이전트는 전용 스킬 하나를 사용한다.
결과는 증거 파일과 구조화된 산출물로 수신한다.

## 하네스 원칙

- 게이트 판단에는 **스크립트가 생성한 증거만** 사용
- LLM 산출물은 **기록(log)** — 게이트 판정에 사용 금지
- 로그는 `{run_dir}/logs/` 에 JSONL로 기록
- Learn 단계는 생략한다. Analyze는 `run_dir/tickets/*.json`의 확정 티켓을 직접 읽어 태스크를 구성한다.

## 실행

`/atlas $ARGUMENTS` — `$ARGUMENTS`에서 티켓 키를 받는다.

### 실행 순서

1. `phase-context.json` 확인 — 재개인지 최초인지 판별
2. 현재 단계의 에이전트를 Agent tool로 위임
3. 에이전트 완료 후 증거 파일 확인
4. `phase-context.json` 갱신 후 다음 단계

### 단계별 위임

| 단계 | 에이전트 | 내부 스킬 구조 | Gate | 증거 |
|------|---------|---------------|------|------|
| Setup | `atlas-setup` | 필요 시 후속 분리 | Gate 0 | setup-summary.json |
| Analyze | `atlas-analyze` | `atlas-analyze-ticket-read` → `atlas-analyze-task-design` → `atlas-analyze-gate-a-fix` | Gate A | tasks-validation.json |
| Execute | `atlas-execute` | `atlas-implement-task` → `atlas-select-conventions` → `atlas-fix-from-validate` | Gate E | validate.json, convention-check.json, cross-validation.json |
| Audit | `atlas-audit` | `atlas-review-findings` → `atlas-apply-audit-fix` → `atlas-audit-recheck` | Gate AU | audit-check.json |

## 구조

```
.claude/
├── agents/
│   ├── atlas-setup.md             # Setup 에이전트
│   ├── atlas-analyze.md
│   ├── atlas-execute.md
│   └── atlas-audit.md
└── skills/
    ├── atlas/                     # 오케스트레이터 + 공유 리소스
    │   ├── SKILL.md
    │   ├── config/gate0-profiles.json
    │   ├── hooks/
    │   └── scripts/
    ├── atlas-analyze-ticket-read/
    │   └── SKILL.md
    ├── atlas-analyze-task-design/
    │   └── SKILL.md
    ├── atlas-analyze-gate-a-fix/
    │   └── SKILL.md
    ├── atlas-execute/             # Execute entry skill
    │   └── SKILL.md
    ├── atlas-implement-task/
    │   └── SKILL.md
    ├── atlas-select-conventions/
    │   └── SKILL.md
    └── atlas-fix-from-validate/
        └── SKILL.md
```

## Analyze 단계

- Analyze는 단일 에이전트가 직접 판단을 끝내는 단계가 아니다.
- `atlas-analyze` 에이전트가 fork 서브에이전트를 순차 호출한다.
- 각 서브에이전트는 하나의 세부 스킬만 사용해 역할을 제한한다.
- Gate A 판정은 반드시 `validate-tasks.sh`가 만든 `evidence/analyze/tasks-validation.json`만 사용한다.
- 태스크 해석, 설계, 수정은 각각 `atlas-analyze-ticket-read`, `atlas-analyze-task-design`, `atlas-analyze-gate-a-fix` 스킬이 담당한다.

## Execute 단계

- `atlas-execute` 에이전트가 태스크를 의존성 순서로 순회한다.
- 각 태스크마다 fork 서브에이전트를 호출하여 `atlas-execute` entry skill을 실행한다.
- entry skill 내부에서 하위 스킬 3개를 순차 호출한다:
  1. `atlas-implement-task` — 코드 생성/수정
  2. `atlas-select-conventions` — 컨벤션 스킬 선택 → `skill-manifest.json`
  3. `atlas-fix-from-validate` — Gate E-pre FAIL 시 수정 (RALP)
- Gate E-pre: `convention-check.sh` + `validate.sh` → PASS 시 git commit
- Gate E-post: `cross-validate.sh` → task_files ⊆ committed_files ⊆ checked_files
- RALP: 최대 3회 재시도. 초과 시 태스크 FAIL로 보고.
