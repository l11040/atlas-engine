#!/usr/bin/env python3
"""
하네스 CLI 유틸리티. 모든 정형 작업을 서브커맨드로 제공한다.

사용법:
  python3 .claude/skills/shared/harness.py env [--require=KEY1,KEY2]
  python3 .claude/skills/shared/harness.py jira <TICKET_KEY>
  python3 .claude/skills/shared/harness.py diff [--cwd=<path>]
  python3 .claude/skills/shared/harness.py scope --plan=<plan.json> [--cwd=<path>]
"""

from __future__ import annotations

import json
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

HARNESS_DIR = Path(".harness")
ENV_FILE = HARNESS_DIR / ".env"

# ─────────────────────────── 공통 ───────────────────────────

def load_env() -> dict[str, str]:
    """Parse .harness/.env into a dict."""
    result = {}
    if not ENV_FILE.exists():
        return result
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        result[key.strip()] = value.strip()
    return result


def out(data: dict):
    print(json.dumps(data, ensure_ascii=False))


def fail(message: str, **extra):
    out({"error": message, **extra})
    sys.exit(1)


# ─────────────────────────── env ───────────────────────────

def cmd_env(args: list[str]):
    """
    .harness/.env를 읽어 JSON으로 출력한다.
    --require=KEY1,KEY2 로 필수 키 검증.
    """
    if not ENV_FILE.exists():
        fail(
            f"{ENV_FILE} 파일이 없습니다. .harness/.env.example을 복사하여 설정하세요.",
            hint=f"cp .harness/.env.example {ENV_FILE}"
        )

    env = load_env()

    required_keys: list[str] = []
    for arg in args:
        if arg.startswith("--require="):
            required_keys = [k.strip() for k in arg.split("=", 1)[1].split(",") if k.strip()]

    missing = [k for k in required_keys if not env.get(k)]
    if missing:
        fail(f"필수 환경변수 누락: {', '.join(missing)}", missing=missing)

    target_dir = env.get("TARGET_PROJECT_DIR")
    if target_dir:
        p = Path(target_dir)
        if not p.is_dir():
            fail(f"TARGET_PROJECT_DIR이 존재하지 않습니다: {target_dir}")
        if not (p / ".git").exists():
            fail(f"TARGET_PROJECT_DIR이 git 저장소가 아닙니다: {target_dir}")

    out(env)


# ─────────────────────────── jira ───────────────────────────

# 목적: JQL 검색에 포함할 필드 목록. parent, subtasks, issuelinks 등을 명시해야 반환된다.
SEARCH_FIELDS = "summary,description,status,issuetype,subtasks,issuelinks,parent,labels,priority,assignee,reporter,created,updated"


def cmd_jira(args: list[str]):
    """
    Jira REST API로 티켓 트리를 BFS 수집하여 .harness/ticket.json에 저장한다.
    이유: jira-client.ts와 동일한 BFS + 배치 JQL 방식으로 Epic→Story→Subtask 전체를 수집한다.
    """
    try:
        import requests as req
    except ImportError:
        fail("requests 패키지가 필요합니다: pip3 install requests")
        return

    if not args:
        fail("사용법: harness.py jira <TICKET_KEY>")

    ticket_key = args[0].strip().upper()
    env = load_env()

    required = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        fail(f"Jira 설정 누락: {', '.join(missing)}", hint=".harness/.env에 Jira 설정을 추가하세요.")

    base_url = env["JIRA_BASE_URL"].rstrip("/")
    auth = (env["JIRA_EMAIL"], env["JIRA_API_TOKEN"])
    headers = {"Accept": "application/json"}

    # ── API 헬퍼 ──

    def jira_get(path: str) -> dict:
        """Jira REST API v3 GET."""
        url = f"{base_url}/rest/api/3{path}"
        resp = req.get(url, auth=auth, headers=headers, timeout=30)
        if resp.status_code == 401:
            fail("인증 실패: 이메일 또는 API 토큰을 확인하세요")
        elif resp.status_code == 404:
            fail(f"이슈를 찾을 수 없습니다: {path}")
        resp.raise_for_status()
        return resp.json()

    def jira_search(jql: str, max_results: int = 100) -> list[dict]:
        """목적: JQL 검색으로 이슈 목록을 가져온다. nextPageToken 기반 페이지네이션."""
        all_issues: list[dict] = []
        next_page_token = None
        while True:
            url = f"{base_url}/rest/api/3/search/jql?jql={req.utils.quote(jql)}&fields={req.utils.quote(SEARCH_FIELDS)}&maxResults={max_results}"
            if next_page_token:
                url += f"&nextPageToken={req.utils.quote(next_page_token)}"
            resp = req.get(url, auth=auth, headers=headers, timeout=30)
            # 목적: rate limit(429) 시 지수 백오프로 재시도한다.
            if resp.status_code == 429:
                import time
                for attempt in range(3):
                    time.sleep(2 ** attempt)
                    resp = req.get(url, auth=auth, headers=headers, timeout=30)
                    if resp.status_code != 429:
                        break
            if not resp.ok:
                break
            data = resp.json()
            all_issues.extend(data.get("issues", []))
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break
        return all_issues

    # 목적: 여러 부모의 자식 이슈를 한 번의 JQL로 일괄 검색한다.
    # 이유: 부모마다 개별 검색하면 API 호출이 N배 늘어나므로 IN 절로 일괄 검색한다.
    def search_children_batch(parent_keys: list[str]) -> list[dict]:
        if not parent_keys:
            return []
        key_list = ", ".join(f'"{k}"' for k in parent_keys)
        jql = f'"parent" in ({key_list}) OR "Epic Link" in ({key_list}) ORDER BY key ASC'
        try:
            return jira_search(jql)
        except Exception:
            # 주의: OR 조합이 실패하면(Epic Link 미지원) parent만으로 재시도한다.
            try:
                fallback_jql = f'"parent" in ({key_list}) ORDER BY key ASC'
                return jira_search(fallback_jql)
            except Exception:
                return []

    def normalize_issue(raw: dict) -> dict:
        """목적: Jira API 응답을 정규화된 티켓 구조로 변환한다."""
        f = raw.get("fields", {})
        links = []
        for lnk in f.get("issuelinks", []):
            link_type = lnk.get("type", {}).get("name", "")
            if lnk.get("outwardIssue"):
                links.append({"type": link_type, "direction": "outward", "key": lnk["outwardIssue"]["key"]})
            elif lnk.get("inwardIssue"):
                links.append({"type": link_type, "direction": "inward", "key": lnk["inwardIssue"]["key"]})

        return {
            "key": raw["key"],
            "summary": f.get("summary", ""),
            "status": (f.get("status") or {}).get("name", ""),
            "issuetype": (f.get("issuetype") or {}).get("name", ""),
            "priority": (f.get("priority") or {}).get("name", ""),
            "assignee": (f.get("assignee") or {}).get("displayName", None),
            "reporter": (f.get("reporter") or {}).get("displayName", None),
            "created": f.get("created", ""),
            "updated": f.get("updated", ""),
            "parent": (f.get("parent") or {}).get("key", None),
            "subtasks": [s["key"] for s in f.get("subtasks", []) if s.get("key")],
            "links": links,
            "labels": f.get("labels", []),
            "description": adf_to_markdown(f.get("description")),
        }

    # ── BFS 트리 수집 ──
    # 이유: jira-client.ts의 fetchTicketTree와 동일한 BFS + 배치 JQL 방식.
    tickets: dict[str, dict] = {}
    visited: set[str] = set()
    queue: list[str] = [ticket_key]

    while queue:
        level = list(queue)
        queue.clear()

        # 1단계: 현재 레벨의 미조회 이슈를 개별 fetch한다.
        level_keys: list[str] = []
        for key in level:
            if key in visited:
                continue
            visited.add(key)
            level_keys.append(key)
            if key not in tickets:
                try:
                    raw = jira_get(f"/issue/{key}")
                    tickets[key] = normalize_issue(raw)
                    sys.stderr.write(f"  fetched: {key} — {tickets[key]['summary']}\n")
                except Exception as e:
                    sys.stderr.write(f"  skip: {key} — {e}\n")

        # 2단계: Sub-task가 아닌 이슈들의 자식을 배치 JQL로 검색한다.
        # 주의: Sub-task는 하위 이슈를 가질 수 없으므로 검색을 건너뛴다.
        parent_keys = [
            k for k in level_keys
            if k in tickets and "sub-task" not in tickets[k]["issuetype"].lower()
            and tickets[k]["issuetype"] != "하위 작업"
        ]

        child_issues: list[dict] = []
        if parent_keys:
            sys.stderr.write(f"  searching children of: {', '.join(parent_keys)}\n")
            child_issues = search_children_batch(parent_keys)

        # 3단계: 자식 이슈를 부모에 연결하고 tickets에 저장한다.
        child_by_parent: dict[str, list[str]] = {}
        for child_raw in child_issues:
            normalized = normalize_issue(child_raw)
            if child_raw["key"] not in tickets:
                tickets[child_raw["key"]] = normalized
            parent_key = normalized.get("parent")
            if parent_key and parent_key in parent_keys:
                child_by_parent.setdefault(parent_key, []).append(child_raw["key"])

        # 4단계: 각 부모의 subtasks를 갱신하고 자식을 다음 레벨 큐에 추가한다.
        for key in level_keys:
            t = tickets.get(key)
            if not t:
                continue
            jql_children = child_by_parent.get(key, [])
            all_child_keys = set(t["subtasks"]) | set(jql_children)
            t["subtasks"] = sorted(all_child_keys)
            for child_key in all_child_keys:
                if child_key not in visited:
                    queue.append(child_key)

    # ── 출력: 폴더 트리 구조로 티켓별 개별 파일 생성 ──
    # 목적: 티켓 단위로 파일을 분리하여 대규모 에픽에서도 파일 크기를 관리 가능하게 한다.
    # 구조: .harness/tickets/GRID-2.json + .harness/tickets/GRID-2/GRID-7.json + ...
    import shutil
    tickets_dir = HARNESS_DIR / "tickets"
    if tickets_dir.exists():
        shutil.rmtree(tickets_dir)
    tickets_dir.mkdir(parents=True, exist_ok=True)

    def build_hierarchy(key: str) -> dict | None:
        """목적: 트리 인덱스용 계층 구조를 재귀 생성한다."""
        t = tickets.get(key)
        if not t:
            return None
        node = {"key": key, "summary": t["summary"], "issuetype": t["issuetype"]}
        children = [build_hierarchy(ck) for ck in t.get("subtasks", [])]
        node["children"] = [c for c in children if c is not None]
        return node

    def write_ticket_tree(key: str, parent_dir: Path):
        """목적: 티켓 JSON을 파일로 쓰고, 자식이 있으면 하위 폴더를 만들어 재귀 저장한다."""
        t = tickets.get(key)
        if not t:
            return
        file_path = parent_dir / f"{key}.json"
        file_path.write_text(json.dumps(t, ensure_ascii=False, indent=2), encoding="utf-8")

        child_keys = t.get("subtasks", [])
        if child_keys:
            child_dir = parent_dir / key
            child_dir.mkdir(exist_ok=True)
            for ck in child_keys:
                write_ticket_tree(ck, child_dir)

    write_ticket_tree(ticket_key, tickets_dir)

    tree_index = {
        "root": ticket_key,
        "exportedAt": __import__("datetime").datetime.now().isoformat(),
        "total": len(tickets),
        "hierarchy": build_hierarchy(ticket_key),
    }
    tree_path = tickets_dir / "tree.json"
    tree_path.write_text(json.dumps(tree_index, ensure_ascii=False, indent=2), encoding="utf-8")

    out({
        "status": "ok",
        "key": ticket_key,
        "summary": tickets.get(ticket_key, {}).get("summary", ""),
        "total": len(tickets),
        "output": str(tickets_dir),
    })


# 목적: Atlassian Document Format(ADF)을 Markdown으로 변환한다.
# 이유: v3 API의 description은 중첩된 ADF 객체이므로 테이블·리스트 등을 보존하려면 Markdown 변환이 필요하다.
def adf_to_markdown(node, depth: int = 0) -> str | None:
    if node is None:
        return None
    if isinstance(node, str):
        return node
    if not isinstance(node, dict) or depth > 20:
        return None

    ntype = node.get("type")
    content = node.get("content", [])
    attrs = node.get("attrs", {})
    marks = node.get("marks")

    # 목적: 텍스트 노드에 마크(bold, italic 등)를 적용한다.
    if ntype == "text":
        text = node.get("text", "")
        if marks and isinstance(marks, list):
            for mark in marks:
                mt = mark.get("type")
                if mt == "strong":
                    text = f"**{text}**"
                elif mt == "em":
                    text = f"*{text}*"
                elif mt == "strike":
                    text = f"~~{text}~~"
                elif mt == "code":
                    text = f"`{text}`"
                elif mt == "link":
                    href = (mark.get("attrs") or {}).get("href", "")
                    text = f"[{text}]({href})"
        return text

    if ntype == "hardBreak":
        return "\n"

    children = content if isinstance(content, list) else []
    parts = [p for c in children if (p := adf_to_markdown(c, depth + 1)) is not None]

    if ntype == "doc":
        return "\n\n".join(parts)
    elif ntype == "paragraph":
        return "".join(parts)
    elif ntype == "heading":
        level = attrs.get("level", 1)
        return f"{'#' * level} {''.join(parts)}"
    elif ntype == "blockquote":
        return "\n".join(f"> {p}" for p in parts)
    elif ntype == "codeBlock":
        lang = attrs.get("language", "")
        return f"```{lang}\n{''.join(parts)}\n```"
    elif ntype == "rule":
        return "---"
    elif ntype == "bulletList":
        return "\n".join(parts)
    elif ntype == "orderedList":
        return "\n".join(p.replace("- ", f"{i + 1}. ", 1) if p.startswith("- ") else p for i, p in enumerate(parts))
    elif ntype == "listItem":
        return f"- {''.join(parts)}"
    # 목적: ADF 테이블을 GFM 테이블 구문으로 변환한다.
    elif ntype == "table":
        rows = [c for c in children if isinstance(c, dict) and c.get("type") == "tableRow"]
        if not rows:
            return ""
        md_rows: list[str] = []
        for ri, row in enumerate(rows):
            cells = row.get("content", [])
            cell_texts = []
            for cell in cells:
                cell_parts = [p for cc in cell.get("content", []) if (p := adf_to_markdown(cc, depth + 1)) is not None]
                cell_texts.append(" ".join(cell_parts).replace("\n", " "))
            md_rows.append(f"| {' | '.join(cell_texts)} |")
            # 주의: 첫 행 뒤에 구분선을 삽입해야 GFM 테이블로 인식된다.
            if ri == 0:
                md_rows.append(f"| {' | '.join('---' for _ in cell_texts)} |")
        return "\n".join(md_rows)
    elif ntype in ("panel", "expand", "nestedExpand"):
        return "\n\n".join(parts)
    elif ntype in ("mediaSingle", "mediaGroup", "media"):
        return ""
    else:
        return "".join(parts)


# ─────────────────────────── diff ───────────────────────────

def cmd_diff(args: list[str]):
    """
    git diff를 파싱하여 변경 파일 목록과 통계를 JSON으로 출력한다.
    --cwd=<path>: 대상 디렉토리 (미지정 시 TARGET_PROJECT_DIR 사용)
    """
    cwd = resolve_cwd(args)

    result = subprocess.run(
        ["git", "diff", "--numstat", "HEAD"],
        capture_output=True, text=True, cwd=cwd
    )
    if result.returncode != 0:
        # HEAD가 없으면 (초기 커밋) staged 기준
        result = subprocess.run(
            ["git", "diff", "--numstat", "--cached"],
            capture_output=True, text=True, cwd=cwd
        )

    files = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        parts = line.split("\t", 2)
        if len(parts) < 3:
            continue
        added, deleted, path = parts
        files.append({
            "path": path,
            "additions": int(added) if added != "-" else 0,
            "deletions": int(deleted) if deleted != "-" else 0,
        })

    # 상태 (A/M/D) 추가
    status_result = subprocess.run(
        ["git", "diff", "--name-status", "HEAD"],
        capture_output=True, text=True, cwd=cwd
    )
    if status_result.returncode != 0:
        status_result = subprocess.run(
            ["git", "diff", "--name-status", "--cached"],
            capture_output=True, text=True, cwd=cwd
        )

    status_map: dict[str, str] = {}
    for line in status_result.stdout.strip().splitlines():
        if not line:
            continue
        parts = line.split("\t", 1)
        if len(parts) == 2:
            status_map[parts[1]] = parts[0]

    for f in files:
        raw_status = status_map.get(f["path"], "M")
        f["status"] = {"A": "create", "D": "delete", "M": "modify"}.get(raw_status[0], "modify")

    total_add = sum(f["additions"] for f in files)
    total_del = sum(f["deletions"] for f in files)

    out({
        "file_count": len(files),
        "total_additions": total_add,
        "total_deletions": total_del,
        "files": files
    })


# ─────────────────────────── scope ───────────────────────────

def cmd_scope(args: list[str]):
    """
    변경된 파일이 plan.json의 태스크 scope 내에 있는지 검증한다.
    --plan=<path>: plan.json 경로 (기본: .harness/plan.json)
    --task=<id>: 특정 태스크만 검증 (미지정 시 전체)
    --cwd=<path>: 대상 디렉토리
    """
    plan_path = HARNESS_DIR / "plan.json"
    task_id = None
    cwd = None

    for arg in args:
        if arg.startswith("--plan="):
            plan_path = Path(arg.split("=", 1)[1])
        elif arg.startswith("--task="):
            task_id = arg.split("=", 1)[1]
        elif arg.startswith("--cwd="):
            cwd = arg.split("=", 1)[1]

    if not cwd:
        env = load_env()
        cwd = env.get("TARGET_PROJECT_DIR", ".")

    if not plan_path.exists():
        fail(f"plan 파일이 없습니다: {plan_path}")

    plan = json.loads(plan_path.read_text(encoding="utf-8"))

    # 변경된 파일 목록 수집
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"],
        capture_output=True, text=True, cwd=cwd
    )
    changed_files = [f for f in result.stdout.strip().splitlines() if f]

    if not changed_files:
        out({"violations": [], "message": "변경된 파일이 없습니다."})
        return

    tasks = plan.get("tasks", [])
    if task_id:
        tasks = [t for t in tasks if t.get("id") == task_id]
        if not tasks:
            fail(f"태스크를 찾을 수 없습니다: {task_id}")

    violations: list[dict] = []
    for task in tasks:
        scope = task.get("scope", {})
        editable = scope.get("editable_paths", [])
        forbidden = scope.get("forbidden_paths", [])

        for filepath in changed_files:
            # editable_paths가 있으면 그 안에 포함되어야 함
            if editable:
                allowed = any(matches_glob(filepath, pat) for pat in editable)
                if not allowed:
                    violations.append({
                        "task_id": task.get("id"),
                        "file": filepath,
                        "reason": f"editable_paths 범위 밖: {editable}"
                    })

            # forbidden_paths에 해당하면 위반
            for pat in forbidden:
                if matches_glob(filepath, pat):
                    violations.append({
                        "task_id": task.get("id"),
                        "file": filepath,
                        "reason": f"forbidden_paths에 해당: {pat}"
                    })

    out({
        "changed_files": len(changed_files),
        "violation_count": len(violations),
        "violations": violations
    })


def matches_glob(filepath: str, pattern: str) -> bool:
    """glob 패턴 매칭. 'src/**' → src/ 하위 전체, 'src/*.ts' → 직접 매칭."""
    if pattern.endswith("/**") or pattern.endswith("/*"):
        prefix = pattern.rsplit("/", 1)[0]
        return filepath.startswith(prefix + "/") or filepath == prefix
    return fnmatch(filepath, pattern)


def resolve_cwd(args: list[str]) -> str:
    for arg in args:
        if arg.startswith("--cwd="):
            return arg.split("=", 1)[1]
    env = load_env()
    return env.get("TARGET_PROJECT_DIR", ".")


# ─────────────────────────── main ───────────────────────────

COMMANDS = {
    "env": cmd_env,
    "jira": cmd_jira,
    "diff": cmd_diff,
    "scope": cmd_scope,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("사용법: harness.py <command> [args...]")
        print(f"명령어: {', '.join(COMMANDS.keys())}")
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        fail(f"알 수 없는 명령어: {cmd}", available=list(COMMANDS.keys()))

    COMMANDS[cmd](sys.argv[2:])


if __name__ == "__main__":
    main()
