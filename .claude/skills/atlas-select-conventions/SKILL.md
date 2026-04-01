---
name: atlas-select-conventions
context: fork
description: Atlas Execute의 두 번째 하위 스킬. 현재 태스크에 필요한 convention 스킬을 선택하여 skill-manifest.json을 생성한다.
---

# Atlas Select Conventions

현재 태스크의 파일 타입과 도메인을 분석하여, 적용할 컨벤션 검증 스킬 목록을 결정한다.

## 입력

- `task-{id}.json` — 태스크 정의 (files[], type)
- `required-skills.json` — 프로젝트 수준 필수 스킬 목록 (존재 시)

## 수행

1. `task-{id}.json`의 `files[]`를 분석하여 파일 패턴을 식별한다.
   - `**/entity/**`, `**/domain/**` → entity 컨벤션
   - `**/service/**` → service 컨벤션
   - `**/repository/**` → repository 컨벤션
   - `**/migration/**` → migration 컨벤션
   - `**/batch/**` → batch 컨벤션
   - `**/*Test.java` → test 컨벤션
2. `required-skills.json`이 있으면 필수 스킬을 병합한다.
3. `skill-manifest.json`을 생성한다.

## 출력

`skill-manifest.json`:

```json
{
  "task_id": "task-001",
  "selected_skills": ["entity-naming", "jpa-relation", "unique-constraint"],
  "required_skills": ["entity-naming"],
  "reason": {
    "entity-naming": "files[] contains domain/point/*.java",
    "jpa-relation": "entity type task with @ManyToOne references"
  }
}
```

## 규칙

- Claude는 스킬 **선택**만 한다. PASS/FAIL 판정은 `convention-check.sh`가 수행한다.
- 필수 스킬 누락은 `convention-check.sh`에서 FAIL로 처리된다.
