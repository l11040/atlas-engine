# ingest — Jira 티켓 수집

## 목적

Jira API로 티켓 트리(본문 + 서브태스크 + 링크된 이슈)를 재귀 수집하여 `.harness/ticket.json`에 저장한다.

## 전제 조건

- `.harness/.env`에 Jira 설정이 존재해야 한다:
  - `JIRA_BASE_URL` (예: `https://your-domain.atlassian.net`)
  - `JIRA_EMAIL`
  - `JIRA_API_TOKEN`

## 실행

```bash
python3 .claude/skills/atlas/atlas.py env --require=JIRA_BASE_URL,JIRA_EMAIL,JIRA_API_TOKEN
```

환경 검증 통과 후:

```bash
python3 .claude/skills/atlas/atlas.py jira <TICKET_KEY>
```

## 출력 디렉토리: `.harness/tickets/`

폴더 트리 구조로 티켓별 개별 JSON 파일을 생성한다. 폴더 계층이 티켓 계층을 반영한다.

```
.harness/tickets/
├── tree.json                  ← 메타데이터 + 계층 인덱스
├── GRID-123.json              ← 루트 에픽 티켓 데이터
├── GRID-123/                  ← GRID-123의 자식들
│   ├── GRID-124.json          ← 스토리 티켓 데이터
│   ├── GRID-124/              ← GRID-124의 자식들
│   │   ├── GRID-201.json      ← 하위 작업
│   │   └── GRID-202.json
│   └── GRID-125.json
```

### tree.json (계층 인덱스)

```json
{
  "root": "GRID-123",
  "exportedAt": "2026-03-10T12:00:00",
  "total": 5,
  "hierarchy": {
    "key": "GRID-123",
    "summary": "에픽 제목",
    "issuetype": "에픽",
    "children": [
      { "key": "GRID-124", "summary": "스토리 제목", "issuetype": "스토리", "children": [...] }
    ]
  }
}
```

### 개별 티켓 JSON (예: GRID-123.json)

```json
{
  "key": "GRID-123",
  "summary": "에픽 제목",
  "status": "In Progress",
  "issuetype": "에픽",
  "priority": "High",
  "assignee": "홍길동",
  "reporter": "김철수",
  "created": "2026-01-01T00:00:00.000+0900",
  "updated": "2026-03-01T00:00:00.000+0900",
  "parent": null,
  "subtasks": ["GRID-124", "GRID-125"],
  "links": [{ "type": "Blocks", "direction": "outward", "key": "GRID-200" }],
  "labels": ["backend"],
  "description": "ADF → Markdown 변환된 본문"
}
```

BFS + 배치 JQL 방식으로 Epic → Story → Subtask 전체를 수집한다.

## 결과 확인

스크립트 stdout의 JSON을 확인한다:
- `"status": "ok"` → 성공. `.harness/ticket.json` 생성됨.
- `"error"` 필드 존재 → 실패. 에러 메시지를 사용자에게 보여주고 중단.

## 완료 후 사용자에게 보여줄 내용

```
[ingest 완료]
티켓: GRID-123 — {summary}
수집된 이슈: {total}개
```
