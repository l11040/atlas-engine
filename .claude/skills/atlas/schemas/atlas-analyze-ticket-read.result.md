# 반환 스키마: atlas-analyze-ticket-read

공통 규격(`SKILL-RESULT.md`) + 아래 추가 섹션.

---

## 반환 템플릿

```markdown
## 스킬 결과

- **스킬**: atlas-analyze-ticket-read
- **상태**: ok | error
- **티켓**: {TICKET_KEY}
- **제목**: {TICKET_KEY} 티켓 해석 완료 — {n}개 서브티켓

## 요약

{티켓 에픽의 전체 흐름, 주요 도메인 개념, 구현 후보 요약.}

## 티켓 목록

| 티켓 | 제목 | AC 수 | 구현 후보 |
|---|---|---|---|
| GRID-79 | Core 엔티티 구현 | 10 | 엔티티 4개, Repository 1개 |
| GRID-80 | 지급 서비스 구현 | 5 | 서비스, DTO |

## 구조적 데이터

**엔티티**: PointAccount, Grant, LedgerEntry, SpendHold
**API**: `POST /accounts/{id}/grants`, `GET /accounts/{id}`, `GET /accounts/{id}/ledger`
**배치**: BAT-001 (PENDING → AVAILABLE)
**테스트**: TST-EARN-001, TST-EARN-002, TST-ADM-001, BAT-001
```

---

## 결과 파일 경로

`{RUN_DIR}/skill-results/ticket-read.md`

스킬은 `ticket-read.json` 생성 후 위 경로에 결과 마크다운을 Write 한다.

---

## 섹션 규칙

| 섹션 | 필수 | 설명 |
|---|---|---|
| `## 스킬 결과` | 필수 | 공통 헤더 |
| `## 요약` | 필수 | 티켓 전체 흐름 자유 서술 |
| `## 티켓 목록` | 필수 | 해석한 서브티켓 목록 |
| `## 구조적 데이터` | 필수 | 엔티티/API/배치/테스트 후보 목록 |

완료 조건: `{RUN_DIR}/evidence/analyze/ticket-read.json` 생성 (에이전트가 파일로 확인)
