# 반환 스키마: atlas-analyze-task-design

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿

```markdown
## 스킬 결과

- **스킬**: atlas-analyze-task-design
- **상태**: ok | error
- **티켓**: {TICKET_KEY}
- **제목**: {n}개 태스크 설계 완료

## 요약

{분리/병합 결정 근거, 태스크 경계 설정 논리 서술.}

## 설계된 태스크

| 태스크 | 제목 | 소스 티켓 | 의존성 |
|---|---|---|---|
| TASK-01 | Core 엔티티 구현 | GRID-79 | — |
| TASK-02 | Support 엔티티 구현 | GRID-79 | TASK-01 |
| TASK-03 | DB 마이그레이션 | GRID-79 | TASK-01, TASK-02 |

## AC 커버리지

| 티켓 | AC | 매핑된 태스크 |
|---|---|---|
| GRID-79 | PointAccount @Version 포함 | TASK-01 |
| GRID-79 | Flyway 마이그레이션 | TASK-03 |
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/task-design.md`

스킬은 `task-{id}.json` 생성 후 위 경로에 결과 마크다운을 Write 한다.

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 |
| `## 요약` | 필수 | 설계 결정 자유 서술 |
| `## 설계된 태스크` | 필수 | 생성한 태스크 목록 (의존성 포함) |
| `## AC 커버리지` | 필수 | 티켓 AC가 태스크에 모두 연결됐음을 확인 |

완료 조건: `{RUN_DIR}/tasks/task-*.json` 1개 이상 생성 (에이전트가 파일로 확인)
