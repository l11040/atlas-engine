# 반환 스키마: atlas-analyze-gate-a-fix

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿 — PASS (no-op)

```markdown
## 스킬 결과

- **스킬**: atlas-analyze-gate-a-fix
- **상태**: noop
- **액션**: noop
- **제목**: Gate A PASS — 수정 없음

## 요약

Gate A 검증이 PASS 상태다. tasks-validation.json의 모든 서브게이트(A1~A4)가 통과했으므로 태스크 파일을 수정하지 않는다.
```

---

## 반환 템플릿 — FAIL (수정 후)

```markdown
## 스킬 결과

- **스킬**: atlas-analyze-gate-a-fix
- **상태**: ok
- **액션**: patched
- **제목**: Gate A FAIL 수정 완료

## 요약

{어떤 검증이 실패했고 어떤 수정을 했는지 서술.}

## 수정 내역

| 태스크 | 수정 항목 | 원인 | 조치 |
|---|---|---|---|
| TASK-02 | files[] 경로 오류 | A2_scope: 허용 경로 외 파일 | 경로 수정 |
| TASK-03 | depends_on 누락 | A3_dependency: 선행 태스크 미참조 | TASK-01 추가 |
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/gate-a-fix.md`

스킬은 모든 처리 완료 후 위 경로에 결과 마크다운을 Write 한다. (PASS no-op도 동일)

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 + `**액션**` 추가 |
| `## 요약` | 필수 | PASS면 "수정 없음" 확인, FAIL이면 수정 근거 |
| `## 수정 내역` | 조건부 | `액션: patched`일 때만 |

`**액션**` 값: `noop` (PASS, 수정 없음) / `patched` (FAIL, 수정 완료) / `error` (처리 실패)
