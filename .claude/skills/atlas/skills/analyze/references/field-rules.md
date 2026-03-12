# Task Plan 필드 결정 규칙

## task-plan.json 구조

```json
{
  "tasks": [
    {
      "task_id": "TASK-xxxxxxxx",
      "jira_key": "GRID-79",
      "story_key": "GRID-21",
      "type": "backend:entity",
      "priority": "high",
      "title": "Core 엔티티 생성",
      "description": "...(Story 컨텍스트 + 하위 작업 요약)...",
      "expected_files": ["server/core/src/main/.../PointAccount.java"],
      "acceptance_criteria": [
        { "level": "MUST", "text": "PointAccount 테이블/모델 생성...", "status": "pending" }
      ],
      "policy_refs": ["POL-EARN-001"],
      "dependency_jira_keys": ["GRID-80"]
    }
  ]
}
```

## Task ID 생성

```bash
echo "TASK-$(openssl rand -hex 4)"
```

## 필드별 결정 기준

| 필드 | 결정 기준 | 참조 섹션 |
|------|-----------|-----------|
| `type` | labels(`impl`, `test`) + description의 Entity/API/Batch 키워드 → `task-meta.schema.json`의 enum | — |
| `priority` | Jira priority + 의존성 깊이 → critical/high/medium/low | — |
| `expected_files` | conventions.json 네이밍 규칙 + Entity Context 테이블 | `description.sections["Entity Context"].entities` |
| `description` | 하위 작업 요약. Story 컨텍스트(Policy, API Spec, Procedure)로 보완 | `description.raw_text` |
| `dependency_jira_keys` | `links[type=Blocks, direction=outward]`에서 추출 (outward = "이 Task가 의존하는 대상") | `skeleton.links` |
| `acceptance_criteria` | Subtask의 AC를 그대로 내장. `{level, text, status:"pending"}` | `description.sections["Acceptance Criteria"].items` |
| `policy_refs` | impl: `Policy Rules` 섹션의 `POL-*` ID. test: `Tested Policies` 섹션의 `POL-*` ID | `description.sections` |

## AC와 Policy의 소유 범위

| 항목 | 소유 범위 | 저장 위치 | 근거 |
|------|-----------|-----------|------|
| AC | **Subtask(L2) 고유** | `task.json.acceptance_criteria` | 각 Subtask에 1~4개 AC가 있고, Story AC를 분해한 것 |
| Policy | **Story(L1) 공유** | `policy-registry.json` | Story에서 정의, 하위 impl/test Task들이 참조 |

- AC는 글로벌 넘버링(AC-001) 하지 않는다. Task에 직접 내장한다.
- Policy는 원본 ID(POL-EARN-001) 그대로 사용한다.
- Test Scenario는 별도 추적하지 않는다. test Task의 policy_refs로 "어떤 Policy를 검증하는가"를 추적한다.

## 구조화 description 접근 방법

skeleton의 `description`과 `story_context.story_description`은 구조화 객체:

```json
{
  "sections": {
    "Acceptance Criteria": {
      "type": "acceptance_criteria",
      "items": [{"level": "MUST", "text": "적립금을 정률..."}]
    },
    "Policy Rules": {
      "type": "policy_rules",
      "items": [{"id": "POL-EARN-001", "level": "MUST", "text": "...", "defaults": {"rate_type": "percentage"}}]
    },
    "Tested Policies": {
      "type": "tested_policies",
      "items": [{"id": "POL-EARN-001", "level": "MUST", "text": "..."}]
    },
    "Entity Context": {
      "type": "entity_tables",
      "entities": [{"name": "EarnPolicy", "columns": [...], "rows": [...]}]
    }
  },
  "raw_text": "..."
}
```

**AC는 sections에서 직접 추출하여 task.json에 내장**한다. Policy ID는 sections에서 추출하여 policy_refs에 넣는다.
