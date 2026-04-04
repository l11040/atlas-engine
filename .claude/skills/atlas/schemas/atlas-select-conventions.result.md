# 반환 스키마: atlas-select-conventions

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿

```markdown
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
| unique-constraint | 선택 | UNIQUE 제약 컬럼 존재 |
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/{TASK_ID}/select-conventions.md`

스킬은 `skill-manifest.json` 생성 후 위 경로에 결과 마크다운을 Write 한다.

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 |
| `## 요약` | 필수 | 선택 근거 자유 서술 |
| `## 선택된 컨벤션` | 필수 | 선택한 스킬 목록과 근거 |

완료 조건: `{RUN_DIR}/evidence/{TASK_ID}/skill-manifest.json` 생성 (에이전트가 파일로 확인)
