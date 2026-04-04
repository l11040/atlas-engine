# Atlas 스킬 반환 스키마 — 공통 규격

모든 fork skill은 **마크다운 문서 하나**를 반환한다.
JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

---

## 공통 헤더 (모든 스킬 필수)

```markdown
## 스킬 결과

- **스킬**: {skill-name}
- **상태**: ok | noop | error
- **제목**: {한 줄 제목}
```

| 필드 | 값 | 설명 |
|---|---|---|
| `스킬` | 고정 문자열 | 스킬 이름 |
| `상태` | `ok` / `noop` / `error` | `ok` = 성공, `noop` = 변경 없음, `error` = 실패 |
| `제목` | 한 줄 문자열 | 이 실행의 한 줄 요약 |

---

## 공통 요약 (모든 스킬 필수)

```markdown
## 요약

{사람이 읽는 자유 서술. 무엇을 했는지, 왜 그랬는지.}
```

---

## 결과 파일 경로 규칙

스킬은 결과 마크다운을 텍스트 출력에만 의존하지 않고 **파일로도 기록**한다.
에이전트는 Skill() 반환 후 이 파일을 Read 해서 성공 여부를 판정한다.

### Analyze 스킬

| 스킬 | 결과 파일 경로 |
|---|---|
| atlas-analyze-ticket-read | `{RUN_DIR}/skill-results/ticket-read.md` |
| atlas-analyze-task-design | `{RUN_DIR}/skill-results/task-design.md` |
| atlas-analyze-gate-a-fix | `{RUN_DIR}/skill-results/gate-a-fix.md` |

### Execute 스킬

| 스킬 | 결과 파일 경로 |
|---|---|
| atlas-implement-task | `{RUN_DIR}/skill-results/{TASK_ID}/implement-task.md` |
| atlas-select-conventions | `{RUN_DIR}/skill-results/{TASK_ID}/select-conventions.md` |
| atlas-fix-from-validate | `{RUN_DIR}/skill-results/{TASK_ID}/fix-from-validate-{GATE}-{N}.md` (GATE=`E-pre`/`E-post`, N=1,2,3) |

---

## 에이전트 성공 판정 규칙

에이전트는 **결과 파일을 Read** 해서 성공/실패를 판정한다. 스킬의 텍스트 반환에 의존하지 않는다.

1. Skill() 호출 완료
2. 결과 파일 경로를 Read
3. 파일이 **없으면** → 실패 (스킬이 파일을 쓰지 않음)
4. 파일에 `- **상태**: ok` 또는 `- **상태**: noop` → 성공
5. 파일에 `- **상태**: error` 또는 상태 라인 없음 → 실패

---

## 스킬별 추가 섹션

각 스킬의 스키마 파일(`{skill-name}.result.md`)에 스킬 전용 섹션이 정의되어 있다.
스킬 전용 섹션은 공통 헤더 + 공통 요약 **이후**에 추가한다.
