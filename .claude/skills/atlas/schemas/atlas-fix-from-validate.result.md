# 반환 스키마: atlas-fix-from-validate

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿

```markdown
## 스킬 결과

- **스킬**: atlas-fix-from-validate
- **상태**: ok | noop | error
- **게이트**: E-pre | E-post
- **태스크**: {TASK_ID}
- **제목**: {TASK_ID} {E-pre|E-post} 수정 완료 | PASS — 수정 없음

## 요약

{어떤 검증이 실패했고, 어떤 판단으로 어떻게 수정했는지 서술.}

## 수정 파일

- `server/core/src/main/.../PointAccount.java`

## 실패 원인 및 조치

| 항목 | 원인 | 조치 |
|---|---|---|
| entity-naming | 클래스명 snake_case 사용 | PascalCase로 변경 |
| @Audited 누락 | withModifiedFlag 미설정 | @Audited(withModifiedFlag=true) 추가 |
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/{TASK_ID}/fix-from-validate-{GATE}-{N}.md` (`GATE` = `E-pre`/`E-post`, `N` = 재시도 횟수, 1부터 시작)

스킬은 모든 수정 완료 후 위 경로에 결과 마크다운을 Write 한다.

호출 계약:
- `atlas-execute`는 Gate PASS/FAIL과 무관하게 이 스킬을 항상 호출한다.
- 호출 시 `GATE_STATUS=pass|fail`을 함께 전달한다.
- `GATE_STATUS=pass`면 결과는 `noop`, `GATE_STATUS=fail`이면 수정 후 `ok|error`를 반환한다.

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 + `**게이트**` 추가 |
| `## 요약` | 필수 | 수정 판단 근거 자유 서술 |
| `## 수정 파일` | 조건부 | `상태=ok|error`일 때만 포함 |
| `## 실패 원인 및 조치` | 조건부 | `상태=ok|error`일 때만 포함 |

`**게이트**` 값: `E-pre` 또는 `E-post`
`**상태**`가 `noop`이면 Gate PASS 기록이며, 수정 섹션은 포함하지 않는다.
