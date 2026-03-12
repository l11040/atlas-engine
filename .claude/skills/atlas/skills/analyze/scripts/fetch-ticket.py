# /// script
# dependencies = [
#   "requests",
#   "python-dotenv",
# ]
# ///
"""
Jira 티켓 재귀 수집기 — ADF(Atlassian Document Format)를 구조화 JSON으로 파싱한다.

source.json의 description 필드를 섹션별 구조화 객체로 저장:
  {sections: {heading: {type, items/entities/data}}, raw_text: str}

Usage:
  python3 fetch-ticket.py GRID-2 --env /path/to/.env

Exit codes:
  0: 성공
  1: 인자 오류 또는 환경 변수 누락
  2: Jira API 오류
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
import os


# ── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Jira 티켓 + 하위 티켓을 재귀 수집하여 source.json으로 저장",
    )
    parser.add_argument("ticket_key", help="최상위 Jira 티켓 키 (예: GRID-2)")
    parser.add_argument("--env", required=True, help=".env 파일 경로")
    parser.add_argument("--run-dir", required=True, help="run 디렉토리 경로 (예: .automation/runs/GRID-2-a1b2c3d4)")
    parser.add_argument("--output", help="출력 파일 경로 (기본: {run-dir}/source.json)")
    return parser.parse_args()


def require_env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        print(json.dumps({"error": f"환경 변수 누락: {key}"}), file=sys.stderr)
        sys.exit(1)
    return val


# ── Jira API ─────────────────────────────────────────────────────────────────

def fetch_issue(base_url: str, auth: tuple, issue_key: str) -> dict | None:
    url = f"{base_url}/rest/api/3/issue/{issue_key}"
    params = {"expand": "names"}
    headers = {"Accept": "application/json"}
    try:
        resp = requests.get(url, auth=auth, headers=headers, params=params, timeout=30)
    except requests.RequestException as e:
        print(json.dumps({"error": f"Jira API 요청 실패: {issue_key}", "detail": str(e)}), file=sys.stderr)
        sys.exit(2)
    if resp.status_code == 404:
        print(f"  [SKIP] {issue_key} — 존재하지 않거나 접근 불가", file=sys.stderr)
        return None
    if not resp.ok:
        print(json.dumps({"error": f"Jira API 오류: {resp.status_code}", "body": resp.text[:500]}), file=sys.stderr)
        sys.exit(2)
    return resp.json()


def search_children_by_jql(base_url: str, auth: tuple, parent_key: str) -> list[str]:
    jql = f'"parent" = "{parent_key}" OR "Epic Link" = "{parent_key}"'
    url = f"{base_url}/rest/api/3/search/jql"
    headers = {"Accept": "application/json"}
    keys: list[str] = []
    start = 0
    while True:
        params = {"jql": jql, "startAt": start, "maxResults": 100, "fields": "key"}
        resp = requests.get(url, auth=auth, headers=headers, params=params, timeout=30)
        if resp.status_code in (400, 410):
            break
        if not resp.ok:
            break
        data = resp.json()
        issues = data.get("issues", [])
        for i in issues:
            keys.append(i["key"])
        if start + len(issues) >= data.get("total", 0):
            break
        start += len(issues)
    return keys


def extract_child_keys(issue: dict) -> list[str]:
    fields = issue.get("fields", {})
    return [sub["key"] for sub in fields.get("subtasks", [])]


def collect_all(base_url: str, auth: tuple, root_key: str) -> dict[str, dict]:
    collected: dict[str, dict] = {}
    queue: list[str] = [root_key]
    visited: set[str] = set()
    while queue:
        key = queue.pop(0)
        if key in visited:
            continue
        visited.add(key)
        print(f"[FETCH] {key}", file=sys.stderr)
        issue = fetch_issue(base_url, auth, key)
        if issue is None:
            continue
        collected[key] = issue
        subtask_keys = extract_child_keys(issue)
        children = search_children_by_jql(base_url, auth, key)
        for k in subtask_keys + children:
            if k not in visited:
                queue.append(k)
    return collected


# ── ADF Parser — Phase 1: ADF → 평문 + 제네릭 섹션 ──────────────────────────

def flatten_adf(node) -> str | None:
    """ADF → 평문 텍스트 (raw_text 폴백용). 구조 정보 소실."""
    if node is None:
        return None
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if node.get("type") == "text":
            return node.get("text", "")
        if node.get("type") == "hardBreak":
            return "\n"
        children = node.get("content", [])
        parts = [flatten_adf(c) for c in children]
        joined = "".join(p for p in parts if p)
        if node.get("type") in ("paragraph", "heading", "listItem", "tableCell"):
            return joined + "\n"
        return joined
    if isinstance(node, list):
        return "".join(flatten_adf(item) for item in node if item)
    return None


def _extract_text(node) -> str:
    """ADF node → 깨끗한 텍스트 (줄바꿈 없이 연결)."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if node.get("type") == "text":
            return node.get("text", "")
        if node.get("type") == "hardBreak":
            return "\n"
        children = node.get("content", [])
        return "".join(_extract_text(c) for c in children)
    if isinstance(node, list):
        return "".join(_extract_text(item) for item in node)
    return ""


def _walk_sections(adf_node: dict) -> list[dict]:
    """ADF doc → [{heading: str|None, blocks: [...]}] h2 헤딩 기준 분할.

    h3 이하 서브헤딩은 상위 섹션의 블록으로 포함한다 (Entity 이름 등).
    """
    if not adf_node or not isinstance(adf_node, dict):
        return []

    content = adf_node.get("content", [])
    sections: list[dict] = []
    cur_heading: str | None = None
    cur_blocks: list[dict] = []

    for node in content:
        if node.get("type") == "heading":
            level = node.get("attrs", {}).get("level", 2)
            text = _extract_text(node).strip()
            if level <= 2:
                # h2 이상: 새 최상위 섹션 시작
                if cur_heading is not None or cur_blocks:
                    sections.append({"heading": cur_heading, "blocks": cur_blocks})
                cur_heading = text
                cur_blocks = []
            else:
                # h3 이하: 현재 섹션 내 서브헤딩 → paragraph 블록으로 변환
                cur_blocks.append({"type": "subheading", "level": level, "text": text})
        else:
            block = _convert_block(node)
            if block:
                cur_blocks.append(block)

    if cur_heading is not None or cur_blocks:
        sections.append({"heading": cur_heading, "blocks": cur_blocks})

    return sections


def _convert_block(node: dict) -> dict | None:
    """ADF 블록 노드 → {type, ...} 제네릭 블록."""
    t = node.get("type", "")

    if t == "paragraph":
        text = _extract_text(node).strip()
        return {"type": "paragraph", "text": text} if text else None

    if t == "table":
        return _convert_table(node)

    if t in ("bulletList", "orderedList"):
        items = []
        for li in node.get("content", []):
            text = _extract_text(li).strip()
            if text:
                items.append(text)
        return {"type": "list", "ordered": t == "orderedList", "items": items} if items else None

    if t == "codeBlock":
        text = _extract_text(node)
        lang = node.get("attrs", {}).get("language")
        return {"type": "code", "language": lang, "text": text}

    if t == "blockquote":
        text = _extract_text(node).strip()
        return {"type": "blockquote", "text": text} if text else None

    if t == "rule":
        return {"type": "rule"}

    text = _extract_text(node).strip()
    return {"type": t, "text": text} if text else None


def _convert_table(node: dict) -> dict | None:
    """ADF table → {type: "table", headers: [...], rows: [[...]]}."""
    all_rows: list[list[str]] = []
    has_header = False

    for tr in node.get("content", []):
        cells = []
        for cell in tr.get("content", []):
            if cell.get("type") == "tableHeader":
                has_header = True
            cells.append(_extract_text(cell).strip())
        all_rows.append(cells)

    if not all_rows:
        return None

    if has_header and len(all_rows) > 1:
        return {"type": "table", "headers": all_rows[0], "rows": all_rows[1:]}
    return {"type": "table", "headers": [], "rows": all_rows}


# ── Section Parser — Phase 2: 제네릭 섹션 → 타입별 구조화 ───────────────────

_SECTION_TYPE_MAP = {
    "Acceptance Criteria": "acceptance_criteria",
    "Policy Rules": "policy_rules",
    "API Spec": "api_spec",
    "API Context": "api_spec",
    "Entity Context": "entity_tables",
    "Entity Schemas": "entity_tables",
    "State Machines": "entity_tables",
    "Test Scenarios": "test_scenarios",
    "Test Vectors": "test_vectors",
    "Tested Policies": "tested_policies",
    "Implementation Steps": "steps",
    "Edge Cases": "key_value_list",
    "Scenarios": "reference_list",
    "Meta": "key_value",
    "FAQs": "faq",
    "Functional Requirements": "generic",
    "Child Stories": "generic",
}


def _classify_section(heading: str | None) -> str:
    if not heading:
        return "generic"
    if heading in _SECTION_TYPE_MAP:
        return _SECTION_TYPE_MAP[heading]
    if heading.startswith("Procedure"):
        return "steps"
    if heading.startswith("Batch"):
        return "key_value"
    h = heading.lower()
    if "entity" in h or "state machine" in h:
        return "entity_tables"
    if "test" in h and "vector" in h:
        return "test_vectors"
    if "tested" in h and "polic" in h:
        return "tested_policies"
    if "test" in h:
        return "test_scenarios"
    if "polic" in h:
        return "policy_rules"
    if "api" in h:
        return "api_spec"
    if "acceptance" in h or "criteria" in h:
        return "acceptance_criteria"
    if "step" in h or "procedure" in h:
        return "steps"
    return "generic"


def parse_description(adf_node) -> dict | None:
    """ADF → {sections: {heading: {type, ...}}, raw_text: str}

    Phase 1: ADF 트리를 헤딩 기준으로 분할하여 제네릭 블록 추출.
    Phase 2: 각 섹션의 블록을 섹션 유형에 맞게 타입별 구조화.
    """
    if adf_node is None:
        return None

    raw_text = flatten_adf(adf_node) or ""
    generic_sections = _walk_sections(adf_node)

    if not generic_sections:
        return {"sections": {}, "raw_text": raw_text}

    result: dict[str, dict] = {}
    for gs in generic_sections:
        heading = gs["heading"] or "_preamble"
        blocks = gs["blocks"]
        sec_type = _classify_section(gs["heading"])
        typed = _dispatch_parser(sec_type, blocks)
        result[heading] = {"type": sec_type, **typed}

    return {"sections": result, "raw_text": raw_text}


def _dispatch_parser(sec_type: str, blocks: list[dict]) -> dict:
    parsers = {
        "acceptance_criteria": _parse_ac,
        "policy_rules": _parse_policies,
        "entity_tables": _parse_entities,
        "test_scenarios": _parse_test_scenarios,
        "test_vectors": _parse_test_vectors,
        "tested_policies": _parse_tested_policies,
        "api_spec": _parse_api,
        "steps": _parse_steps,
        "key_value": _parse_kv,
        "key_value_list": _parse_kv_list,
        "reference_list": _parse_references,
        "faq": _parse_faq,
    }
    parser = parsers.get(sec_type, _parse_generic)
    return parser(blocks)


# ── 개별 섹션 파서 ───────────────────────────────────────────────────────────

_AC_METADATA_RE = re.compile(r"^(Tested\s+by|Tests?|IMPL-|TEST-):", re.IGNORECASE)


def _parse_ac(blocks: list[dict]) -> dict:
    """Acceptance Criteria → {items: [{level, text}]}

    ADF에서 AC는 bulletList로 오는 경우가 많다.
    """
    items = []
    for b in blocks:
        texts = []
        if b["type"] == "paragraph":
            texts.append(b["text"])
        elif b["type"] == "list":
            texts.extend(b.get("items", []))

        for text in texts:
            stripped = text.strip()
            if not stripped or _AC_METADATA_RE.match(stripped):
                continue
            m = re.match(r"\[?(MUST|SHOULD|MAY)\]?\s+(.+)", stripped)
            if m:
                items.append({"level": m.group(1), "text": m.group(2).strip()})
            else:
                items.append({"level": "MUST", "text": stripped})
    return {"items": items}


def _parse_policies(blocks: list[dict]) -> dict:
    """Policy Rules → {items: [{id, level, text, defaults}]}

    ADF 구조: paragraph(POL-XXX [LEVEL] text) + bulletList(key: value defaults)
    """
    items = []
    current: dict | None = None

    for b in blocks:
        if b["type"] == "paragraph":
            text = b["text"].strip()
            if not text:
                continue

            m = re.match(r"(POL-[\w-]+)\s+\[(MUST|SHOULD|MAY)\]\s*(.+)", text)
            if m:
                if current:
                    items.append(current)
                current = {
                    "id": m.group(1),
                    "level": m.group(2),
                    "text": m.group(3).strip(),
                    "defaults": {},
                }
                continue

            if current:
                kv = re.match(r"^([\w_]+):\s*(.+)$", text)
                if kv:
                    current["defaults"][kv.group(1)] = kv.group(2).strip()
                    continue
                current["text"] += " " + text

        elif b["type"] == "list" and current:
            # bulletList의 각 항목을 defaults key:value로 파싱
            for item_text in b.get("items", []):
                kv = re.match(r"^([\w_]+):\s*(.+)$", item_text.strip())
                if kv:
                    current["defaults"][kv.group(1)] = kv.group(2).strip()

    if current:
        items.append(current)
    return {"items": items}


def _parse_entities(blocks: list[dict]) -> dict:
    """Entity Context/Schemas/State Machines → {entities: [{name, columns, rows, notes}]}

    ADF 구조: subheading(h3, 엔티티 이름) + table(필드 정의) + paragraph(노트)
    또는: paragraph(PascalCase 이름) + table + paragraph(노트)
    """
    entities: list[dict] = []
    cur_name: str | None = None
    cur_table: dict | None = None
    cur_notes: list[str] = []

    def flush():
        nonlocal cur_name, cur_table, cur_notes
        if cur_name:
            entities.append({
                "name": cur_name,
                "columns": cur_table.get("headers", []) if cur_table else [],
                "rows": cur_table.get("rows", []) if cur_table else [],
                "notes": cur_notes,
            })
        cur_name = None
        cur_table = None
        cur_notes = []

    for b in blocks:
        if b["type"] == "subheading":
            # h3 이하 서브헤딩 → 엔티티 이름
            flush()
            cur_name = b["text"].strip()

        elif b["type"] == "paragraph":
            text = b["text"].strip()
            if re.match(r"^[A-Z][a-zA-Z]+(?:\s*[+/,]\s*[A-Z][a-zA-Z]+)*$", text):
                flush()
                cur_name = text
            elif cur_table:
                cur_notes.append(text)
            elif cur_name:
                cur_notes.append(text)

        elif b["type"] == "table":
            if not cur_name:
                cur_name = "_unnamed"
            cur_table = b

    flush()
    return {"entities": entities}


def _parse_test_scenarios(blocks: list[dict]) -> dict:
    """Test Scenarios → {items: [{id, given, when, then}]}"""
    items: list[dict] = []
    current: dict | None = None
    gwt_key: str | None = None

    for b in blocks:
        if b["type"] != "paragraph":
            continue
        text = b["text"].strip()
        if not text:
            continue

        # TST ID 헤더
        m = re.match(r"^(TST-[\w-]+)$", text)
        if m:
            if current:
                items.append(current)
            current = {"id": m.group(1), "given": "", "when": "", "then": ""}
            gwt_key = None
            continue

        # Given/When/Then 라벨
        label = text.rstrip(":").lower()
        if label in ("given", "when", "then"):
            gwt_key = label
            continue

        # 본문
        if current and gwt_key:
            prev = current[gwt_key]
            current[gwt_key] = (prev + "\n" + text).strip() if prev else text

    if current:
        items.append(current)
    return {"items": items}


def _parse_test_vectors(blocks: list[dict]) -> dict:
    """Test Vectors → {items: [{id, data}]}"""
    items: list[dict] = []
    cur_id: str | None = None
    json_parts: list[str] = []

    def flush():
        nonlocal cur_id, json_parts
        if cur_id and json_parts:
            raw = "".join(json_parts).strip()
            try:
                items.append({"id": cur_id, "data": json.loads(raw)})
            except json.JSONDecodeError:
                items.append({"id": cur_id, "data_raw": raw})
        cur_id = None
        json_parts = []

    for b in blocks:
        text = b.get("text", "").strip()

        if b["type"] == "paragraph":
            m = re.match(r"^(TST-[\w-]+)$", text)
            if m:
                flush()
                cur_id = m.group(1)
                continue
            if cur_id:
                json_parts.append(text)

        elif b["type"] == "code":
            if not cur_id:
                # 이전 paragraph에서 TST ID를 찾지 못한 경우 전체를 하나로
                json_parts.append(b.get("text", ""))
            else:
                json_parts.append(b.get("text", ""))

    flush()
    return {"items": items}


def _parse_tested_policies(blocks: list[dict]) -> dict:
    """Tested Policies → {items: [{id, level, text}], tests: [str]}"""
    items: list[dict] = []
    tests: list[str] = []

    for b in blocks:
        if b["type"] != "paragraph":
            continue
        text = b["text"].strip()

        m = re.match(r"(POL-[\w-]+)\s+\[(MUST|SHOULD|MAY)\]\s*(.+)", text)
        if m:
            items.append({"id": m.group(1), "level": m.group(2), "text": m.group(3).strip()})
            continue

        m2 = re.match(r"^Tests?:\s*(.+)$", text)
        if m2:
            tests = [t.strip() for t in m2.group(1).split(",")]

    return {"items": items, "tests": tests}


def _parse_api(blocks: list[dict]) -> dict:
    """API Spec/Context → {items: [{method, path, description, params}]}

    ADF 구조: paragraph(HTTP method + path) + bulletList(params key: value)
    """
    items: list[dict] = []
    current: dict | None = None

    for b in blocks:
        if b["type"] == "paragraph":
            text = b["text"].strip()
            if not text:
                continue

            m = re.match(r"^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*[-–]?\s*(.*)", text)
            if m:
                if current:
                    items.append(current)
                current = {
                    "method": m.group(1),
                    "path": m.group(2),
                    "description": m.group(3).strip(),
                    "params": {},
                }
                continue

            if current:
                kv = re.match(r"^([\w_]+):\s*(.+)$", text)
                if kv:
                    current["params"][kv.group(1)] = kv.group(2).strip()
                    continue
                current["description"] += " " + text

        elif b["type"] == "list" and current:
            for item_text in b.get("items", []):
                kv = re.match(r"^([\w_]+):\s*(.+)$", item_text.strip())
                if kv:
                    current["params"][kv.group(1)] = kv.group(2).strip()

    if current:
        items.append(current)
    return {"items": items}


def _parse_steps(blocks: list[dict]) -> dict:
    """Implementation Steps / Procedure → {items: [str]}"""
    items: list[str] = []
    for b in blocks:
        if b["type"] == "list":
            items.extend(b.get("items", []))
        elif b["type"] == "paragraph":
            text = b["text"].strip()
            if not text:
                continue
            m = re.match(r"^\d+[.)]\s*(.+)", text)
            items.append(m.group(1) if m else text)
    return {"items": items}


def _parse_kv(blocks: list[dict]) -> dict:
    """Meta / Batch → {data: {key: value}}

    ADF에서 bulletList로 올 수 있다. subheading도 무시하지 않고 key로 취급.
    """
    data: dict[str, str] = {}

    def _try_kv(text: str):
        kv = re.match(r"^([\w\s]+?):\s*(.+)$", text.strip())
        if kv:
            data[kv.group(1).strip()] = kv.group(2).strip()

    for b in blocks:
        if b["type"] == "paragraph":
            _try_kv(b["text"])
        elif b["type"] == "list":
            for item_text in b.get("items", []):
                _try_kv(item_text)
        elif b["type"] == "subheading":
            # h3 "Meta" 같은 서브헤딩은 무시
            pass
    return {"data": data}


def _parse_kv_list(blocks: list[dict]) -> dict:
    """Edge Cases → {items: [{key, value} | {text}]}"""
    items: list[dict] = []
    for b in blocks:
        if b["type"] != "paragraph":
            continue
        text = b["text"].strip()
        kv = re.match(r"^(.+?):\s*(.+)$", text)
        if kv:
            items.append({"key": kv.group(1).strip(), "value": kv.group(2).strip()})
        elif text:
            items.append({"text": text})
    return {"items": items}


def _parse_references(blocks: list[dict]) -> dict:
    """Scenarios → {items: [{id, text} | {text}]}"""
    items: list[dict] = []

    def _try_ref(text: str):
        m = re.match(r"^(SC-[\w-]+):\s*(.+)$", text.strip())
        if m:
            items.append({"id": m.group(1), "text": m.group(2).strip()})
        elif text.strip():
            items.append({"text": text.strip()})

    for b in blocks:
        if b["type"] == "paragraph":
            _try_ref(b["text"])
        elif b["type"] == "list":
            for item_text in b.get("items", []):
                _try_ref(item_text)
    return {"items": items}


def _parse_faq(blocks: list[dict]) -> dict:
    """FAQs → {items: [{q, a}]}"""
    items: list[dict] = []
    current_q: str | None = None

    for b in blocks:
        if b["type"] != "paragraph":
            continue
        text = b["text"].strip()

        m_q = re.match(r"^Q:\s*(.+)$", text)
        if m_q:
            current_q = m_q.group(1)
            continue

        m_a = re.match(r"^A:\s*(.+)$", text)
        if m_a and current_q:
            items.append({"q": current_q, "a": m_a.group(1)})
            current_q = None

    return {"items": items}


def _parse_generic(blocks: list[dict]) -> dict:
    """폴백 — 텍스트/리스트 항목을 그대로 수집."""
    items: list[str] = []
    for b in blocks:
        if b["type"] == "paragraph":
            items.append(b["text"])
        elif b["type"] == "list":
            items.extend(b.get("items", []))
        elif b.get("text"):
            items.append(b["text"])
    return {"items": items}


# ── Issue 정리 + 계층 구조 ───────────────────────────────────────────────────

def simplify_issue(issue: dict) -> dict:
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
                "key": (link.get("inwardIssue") or link.get("outwardIssue", {})).get("key"),
            }
            for link in fields.get("issuelinks", [])
        ],
        "labels": fields.get("labels", []),
        "description": parse_description(fields.get("description")),
    }


def build_hierarchy(simplified: dict[str, dict]) -> dict[str, list[str]]:
    hierarchy: dict[str, list[str]] = defaultdict(list)
    for key, ticket in simplified.items():
        parent = ticket.get("parent")
        if parent and parent in simplified:
            hierarchy[parent].append(key)
    for parent_key in hierarchy:
        hierarchy[parent_key].sort(key=lambda k: int(k.split("-")[1]))
    return dict(hierarchy)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    load_dotenv(args.env)
    base_url = require_env("JIRA_BASE_URL").rstrip("/")
    email = require_env("JIRA_USER_EMAIL")
    api_token = require_env("JIRA_API_TOKEN")
    project_root = require_env("PROJECT_ROOT")
    automation_dir = os.environ.get("AUTOMATION_DIR", ".automation")
    auth = (email, api_token)

    raw = collect_all(base_url, auth, args.ticket_key)
    print(f"[INFO] 총 {len(raw)}개 티켓 수집 완료", file=sys.stderr)

    simplified = {k: simplify_issue(v) for k, v in raw.items()}
    hierarchy = build_hierarchy(simplified)

    result = {
        "root": args.ticket_key,
        "exported_at": datetime.now().isoformat(),
        "total": len(raw),
        "hierarchy": hierarchy,
        "tickets": simplified,
    }

    if args.output:
        output_file = Path(args.output)
    else:
        run_dir = Path(args.run_dir)
        output_file = run_dir / "source.json"

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "status": "fetched",
        "ticket_key": args.ticket_key,
        "total_tickets": len(raw),
        "output_file": str(output_file),
        "hierarchy_summary": {k: len(v) for k, v in hierarchy.items()},
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
