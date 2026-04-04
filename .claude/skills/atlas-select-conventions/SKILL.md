---
name: atlas-select-conventions
description: Atlas Execute의 두 번째 하위 스킬. 현재 태스크에 필요한 convention 스킬을 선택하여 skill-manifest.json을 생성한다.
context: fork
agent: atlas-execute
user-invocable: false
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

## 반환 형식

반드시 아래 마크다운 형식으로 반환한다. JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

```
## 스킬 결과

- **스킬**: atlas-select-conventions
- **상태**: ok | error
- **태스크**: {TASK_ID}
- **제목**: {TASK_ID} 컨벤션 선택 완료

## 요약

{어떤 파일 패턴을 분석해서 어떤 스킬을 선택했는지 설명.}

## 선택된 컨벤션

| 스킬 | 필수 여부 | 선택 근거 |
|---|---|---|
| entity-naming | 필수 | files[]에 entity/*.java 포함 |
| jpa-relation | 선택 | @ManyToOne 참조 패턴 감지 |
```

규칙:
- `skill-manifest.json` 생성 후 이 형식으로 반환한다.
- 선택된 스킬이 없으면 `## 선택된 컨벤션` 표에 "없음" 행을 추가한다.

## 마지막 단계 (필수)

모든 작업 완료 후 반드시 아래 순서로 실행한다:

1. 위 마크다운 결과를 `{RUN_DIR}/skill-results/{TASK_ID}/select-conventions.md`에 **Write** 한다.
2. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
