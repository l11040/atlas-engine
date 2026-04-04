# 반환 스키마: atlas-implement-task

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿

```markdown
## 스킬 결과

- **스킬**: atlas-implement-task
- **상태**: ok | error
- **태스크**: {TASK_ID}
- **제목**: {task-{id}.json의 title}

## 요약

{구현 내용 자유 서술. 주요 결정, 기존 컨벤션 참조 내역 등.}

## 생성 파일

- `server/core/src/main/.../PointAccount.java`
- `server/core/src/main/.../Grant.java`

## 수정 파일

- `server/core/src/main/.../DomainBaseResponseStatus.java`

## AC 체크리스트

| 항목 | 상태 | 비고 |
|---|---|---|
| PointAccount @Version 필드 포함 | ✅ pass | |
| DomainException 사용 | ✅ pass | |
| findByIdForUpdate @Lock(PESSIMISTIC_WRITE) | ✅ pass | |
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/{TASK_ID}/implement-task.md`

스킬은 작업 완료 후 위 경로에 결과 마크다운을 Write 한다.

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 |
| `## 요약` | 필수 | 구현 내용 자유 서술 |
| `## 생성 파일` | 조건부 | 새로 만든 파일이 있을 때만 |
| `## 수정 파일` | 조건부 | 기존 파일을 수정했을 때만 |
| `## AC 체크리스트` | 필수 | 태스크의 모든 AC를 행으로 나열 |

AC 체크리스트 상태값: `✅ pass` / `❌ fail` / `⏭️ skip`
