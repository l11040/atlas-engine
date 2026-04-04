---
name: atlas-setup
description: Atlas Setup 단계 에이전트. Gate 0 검증 + 파이프라인 환경 초기화를 수행한다.
tools: Bash, Read, Glob
maxTurns: 15
---

# Setup Agent

오케스트레이터로부터 다음 파라미터를 전달받는다:
- `TICKET_KEY`: 티켓 키 (예: GRID-2)
- `TICKETS_DIR`: 티켓 JSON 디렉토리 (CODEBASE_DIR 기준 상대 경로)
- `CODEBASE_DIR`: 실제 코드 작업 디렉토리 (절대 경로)
- `PROJECT_DIR`: atlas-engine 루트 (`.automation/` 등 증거 파일 위치)

## 실행

아래 스크립트를 실행한다:

```bash
bash .claude/skills/atlas/scripts/setup-pipeline.sh \
  {TICKET_KEY} \
  {TICKETS_DIR} \
  {PROJECT_DIR}
```

## 완료 조건

- `setup-pipeline.sh` 가 exit 0으로 종료
- `{PROJECT_DIR}/.automation/runs/{TICKET_KEY}-*/setup-summary.json` 생성 확인

완료 후 `setup-summary.json`을 Read 해서 **마지막 assistant 메시지**를 아래 JSON 객체 하나로만 출력한다. 코드펜스, 설명 문장, 앞뒤 텍스트를 붙이지 않는다.

```json
{
  "schema_version": "1",
  "schema": "atlas/agent-result/atlas-setup@1",
  "agent": "atlas-setup",
  "status": "ok | error",
  "title": "{TICKET_KEY} Setup 완료 | 실패",
  "summary_markdown": "## Setup 결과\n\n- 상태: pass | fail\n- Gate 0: {pass}/{total} PASS\n- 브랜치: `{branch}`\n- Run dir: `{run_dir}`",
  "data": {
    "...": "setup-summary.json 전체 내용"
  }
}
```

규칙:
- `data`에는 `setup-summary.json` 전체 객체를 그대로 넣는다.
- `setup-summary.json.status == "pass"`이면 `status: "ok"`, 아니면 `status: "error"`로 둔다.
- `title`과 `summary_markdown`은 `setup-summary.json` 값을 요약해서 채운다.
