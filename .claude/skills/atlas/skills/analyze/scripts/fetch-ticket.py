"""
Jira 티켓 재귀 수집기
- 최상위 티켓을 기준으로 하위 티켓(subtask), Epic 하위를 재귀적으로 수집
- 계층 구조(hierarchy)를 포함하여 저장
- 결과를 PROJECT_ROOT/.automation/tickets/{TICKET_KEY}/source.json 에 저장
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv


# 목적: atlas .env 로드 (--env 인자 또는 기본 경로)
def find_env_file() -> str:
    for i, arg in enumerate(sys.argv):
        if arg == "--env" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    script_dir = Path(__file__).resolve().parent
    return str(script_dir / ".." / ".." / ".." / ".env")


env_path = find_env_file()
load_dotenv(env_path)

BASE_URL = os.environ["JIRA_BASE_URL"].rstrip("/")
EMAIL = os.environ["JIRA_USER_EMAIL"]
API_TOKEN = os.environ["JIRA_API_TOKEN"]
PROJECT_ROOT = os.environ["PROJECT_ROOT"]
AUTOMATION_DIR = os.environ.get("AUTOMATION_DIR", ".automation")

AUTH = (EMAIL, API_TOKEN)
HEADERS = {"Accept": "application/json"}


def fetch_issue(issue_key: str) -> dict | None:
    """Jira REST API로 이슈 하나를 가져온다."""
    url = f"{BASE_URL}/rest/api/3/issue/{issue_key}"
    params = {"expand": "names"}
    resp = requests.get(url, auth=AUTH, headers=HEADERS, params=params, timeout=30)
    if resp.status_code == 404:
        print(f"  [SKIP] {issue_key} — 존재하지 않거나 접근 불가")
        return None
    resp.raise_for_status()
    return resp.json()


def extract_child_keys(issue: dict) -> list[str]:
    """이슈에서 하위 작업 키만 추출한다."""
    fields = issue.get("fields", {})
    return [sub["key"] for sub in fields.get("subtasks", [])]


def search_children_by_jql(parent_key: str) -> list[str]:
    """JQL로 parent = KEY 인 하위 이슈를 검색한다 (Epic 하위 등)."""
    jql = f'"parent" = "{parent_key}" OR "Epic Link" = "{parent_key}"'
    url = f"{BASE_URL}/rest/api/3/search/jql"
    keys: list[str] = []
    start = 0
    while True:
        params = {"jql": jql, "startAt": start, "maxResults": 100, "fields": "key"}
        resp = requests.get(url, auth=AUTH, headers=HEADERS, params=params, timeout=30)
        if resp.status_code in (400, 410):
            break
        resp.raise_for_status()
        data = resp.json()
        issues = data.get("issues", [])
        for i in issues:
            keys.append(i["key"])
        if start + len(issues) >= data.get("total", 0):
            break
        start += len(issues)
    return keys


def collect_all(root_key: str) -> dict[str, dict]:
    """root_key 기준으로 연관된 모든 티켓을 재귀 수집한다."""
    collected: dict[str, dict] = {}
    queue: list[str] = [root_key]
    visited: set[str] = set()

    while queue:
        key = queue.pop(0)
        if key in visited:
            continue
        visited.add(key)

        print(f"[FETCH] {key}")
        issue = fetch_issue(key)
        if issue is None:
            continue

        collected[key] = issue

        subtask_keys = extract_child_keys(issue)
        children = search_children_by_jql(key)

        for k in subtask_keys + children:
            if k not in visited:
                queue.append(k)

    return collected


def simplify_issue(issue: dict) -> dict:
    """이슈를 읽기 좋은 형태로 정리한다."""
    fields = issue.get("fields", {})

    def safe_name(obj):
        if obj is None:
            return None
        if isinstance(obj, dict):
            return obj.get("displayName") or obj.get("name") or obj.get("value")
        return str(obj)

    return {
        "key": issue.get("key"),
        "summary": fields.get("summary"),
        "status": safe_name(fields.get("status")),
        "issuetype": safe_name(fields.get("issuetype")),
        "priority": safe_name(fields.get("priority")),
        "assignee": safe_name(fields.get("assignee")),
        "reporter": safe_name(fields.get("reporter")),
        "created": fields.get("created"),
        "updated": fields.get("updated"),
        "parent": fields.get("parent", {}).get("key") if fields.get("parent") else None,
        "subtasks": [s["key"] for s in fields.get("subtasks", [])],
        "links": [
            {
                "type": link.get("type", {}).get("name"),
                "direction": "inward" if "inwardIssue" in link else "outward",
                "key": (link.get("inwardIssue") or link.get("outwardIssue", {})).get(
                    "key"
                ),
            }
            for link in fields.get("issuelinks", [])
        ],
        "labels": fields.get("labels", []),
        "description": _flatten_adf(fields.get("description")),
    }


def _flatten_adf(node) -> str | None:
    """Atlassian Document Format을 평문으로 변환한다."""
    if node is None:
        return None
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if node.get("type") == "text":
            return node.get("text", "")
        children = node.get("content", [])
        parts = [_flatten_adf(c) for c in children]
        joined = "".join(p for p in parts if p)
        if node.get("type") in ("paragraph", "heading", "listItem", "tableCell"):
            return joined + "\n"
        return joined
    if isinstance(node, list):
        return "".join(_flatten_adf(item) for item in node if item)
    return None


def build_hierarchy(simplified: dict[str, dict]) -> dict[str, list[str]]:
    """parent 필드를 기반으로 계층 구조를 생성한다."""
    hierarchy: dict[str, list[str]] = defaultdict(list)
    for key, ticket in simplified.items():
        parent = ticket.get("parent")
        if parent and parent in simplified:
            hierarchy[parent].append(key)
    # 이유: Jira key의 숫자 순서로 정렬하여 일관된 출력 보장
    for parent_key in hierarchy:
        hierarchy[parent_key].sort(key=lambda k: int(k.split("-")[1]))
    return dict(hierarchy)


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
        print("Usage: python fetch-ticket.py <TICKET-KEY> [--env /path/to/.env]")
        sys.exit(1)

    root_key = sys.argv[1]
    print(f"=== {root_key} 기준 티켓 수집 시작 ===\n")

    raw = collect_all(root_key)
    print(f"\n총 {len(raw)}개 티켓 수집 완료")

    simplified = {k: simplify_issue(v) for k, v in raw.items()}
    hierarchy = build_hierarchy(simplified)

    result = {
        "root": root_key,
        "exported_at": datetime.now().isoformat(),
        "total": len(raw),
        "hierarchy": hierarchy,
        "tickets": simplified,
    }

    output_dir = Path(PROJECT_ROOT) / AUTOMATION_DIR / "tickets" / root_key
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "source.json"

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: {output_file}")


if __name__ == "__main__":
    main()
