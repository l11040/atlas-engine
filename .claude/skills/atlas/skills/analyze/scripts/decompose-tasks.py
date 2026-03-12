# /// script
# dependencies = []
# ///
"""
source.json → Task 디렉토리 구조 + ticket.json + dependency-graph.json 생성

source.json에서 Jira 계층을 읽고, L2(하위 작업)를 Task로 1:1 매핑한다.
LLM이 생성한 task-plan.json(Task별 type/expected_files/priority 결정)을 받아
최종 디렉토리 구조를 스캐폴딩한다.

Usage:
  python3 decompose-tasks.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2c3d4 --task-plan task-plan.json
  python3 decompose-tasks.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2c3d4 --scaffold-only

Exit codes:
  0: 성공
  1: 인자 오류 또는 파일 누락
  2: task-plan.json 검증 실패
  3: 순환 의존성 감지
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="source.json → Task 디렉토리 + ticket.json + dependency-graph.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Modes:
  --scaffold-only   source.json을 분석하여 LLM에게 전달할 skeleton을 stdout으로 출력
  --task-plan FILE  LLM이 작성한 task-plan.json으로 최종 디렉토리 구조 생성

Examples:
  python3 decompose-tasks.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2 --scaffold-only
  python3 decompose-tasks.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2 --task-plan plan.json""",
    )
    parser.add_argument("--ticket-key", required=True, help="Jira 티켓 키 (예: GRID-2)")
    parser.add_argument("--run-dir", required=True, help="run 디렉토리 경로 (예: .automation/runs/GRID-2-a1b2c3d4)")
    parser.add_argument("--scaffold-only", action="store_true",
                        help="L2 하위 작업 skeleton을 stdout으로 출력 (LLM 입력용)")
    parser.add_argument("--task-plan", help="LLM이 작성한 task-plan.json 경로")
    parser.add_argument("--force", action="store_true", help="기존 결과 덮어쓰기")
    return parser.parse_args()


def load_json(path: Path, label: str) -> dict:
    if not path.exists():
        print(json.dumps({"error": f"{label} not found: {path}"}), file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def classify_hierarchy(source: dict) -> dict:
    """source.json에서 L0/L1/L2 계층을 분류한다."""
    tickets = source["tickets"]
    hierarchy = source["hierarchy"]
    root = source["root"]

    levels = {"L0": [], "L1": [], "L2": []}

    def classify(key: str, depth: int):
        ticket = tickets.get(key)
        if not ticket:
            return
        issuetype = (ticket.get("issuetype") or "").lower()

        if "epic" in issuetype or depth == 0:
            levels["L0"].append(key)
        elif "subtask" in issuetype or "하위" in issuetype or depth >= 2:
            levels["L2"].append(key)
        else:
            levels["L1"].append(key)

        for child in hierarchy.get(key, []):
            classify(child, depth + 1)

    classify(root, 0)
    return levels


def _desc_raw_text(desc) -> str:
    """description 필드에서 raw_text를 추출한다 (구조화 객체 또는 문자열 호환)."""
    if desc is None:
        return ""
    if isinstance(desc, dict):
        return desc.get("raw_text", "")
    return str(desc)


def extract_story_context(ticket: dict) -> dict:
    """L1 Story에서 Task에 상속할 컨텍스트를 추출한다."""
    return {
        "story_key": ticket["key"],
        "story_summary": ticket.get("summary", ""),
        "story_description": ticket.get("description"),
        "story_labels": ticket.get("labels", []),
    }


def build_skeleton(source: dict, levels: dict) -> dict:
    """L2 하위 작업을 skeleton으로 변환한다. LLM이 type/expected_files/priority를 결정."""
    tickets = source["tickets"]
    hierarchy = source["hierarchy"]
    subtasks = []

    # L1 → L2 매핑을 위해 부모 추적
    parent_map = {}
    for parent_key, children in hierarchy.items():
        for child in children:
            parent_map[child] = parent_key

    for key in levels["L2"]:
        ticket = tickets.get(key, {})
        story_key = parent_map.get(key)
        story = tickets.get(story_key, {}) if story_key else {}

        entry = {
            "jira_key": key,
            "summary": ticket.get("summary"),
            "description": ticket.get("description"),
            "labels": ticket.get("labels", []),
            "priority": ticket.get("priority"),
            "links": ticket.get("links", []),
            "story_context": extract_story_context(story) if story else None,
        }
        subtasks.append(entry)

    return {
        "ticket_key": source["root"],
        "epic": {
            "key": source["root"],
            "summary": tickets.get(source["root"], {}).get("summary"),
        },
        "subtasks": subtasks,
        "total_subtasks": len(subtasks),
    }


def _build_ticket_data(ticket: dict) -> dict:
    """개별 티켓 데이터를 ticket.json 형식으로 변환한다."""
    return {
        "key": ticket.get("key", ""),
        "summary": ticket.get("summary", ""),
        "description": ticket.get("description"),
        "type": ticket.get("issuetype", ""),
        "status": ticket.get("status", ""),
        "priority": ticket.get("priority", "Medium"),
        "labels": ticket.get("labels", []),
        "assignee": ticket.get("assignee"),
        "reporter": ticket.get("reporter"),
        "parent_key": ticket.get("parent"),
        "subtask_keys": ticket.get("subtasks", []),
        "linked_issues": [
            {"key": link["key"], "relation": f"{link['type']}:{link['direction']}"}
            for link in ticket.get("links", [])
            if link.get("key")
        ],
        "acceptance_criteria": None,
        "created": ticket.get("created", ""),
        "updated": ticket.get("updated", ""),
    }


def generate_ticket_tree(source: dict, run_dir: Path):
    """계층형 티켓 트리를 생성한다. tickets/{L0}/{L1}/{L2}/ticket.json"""
    tickets = source["tickets"]
    hierarchy = source["hierarchy"]
    root = source["root"]
    tickets_dir = run_dir / "tickets"

    def write_ticket(key: str, parent_path: Path):
        ticket = tickets.get(key)
        if not ticket:
            return
        ticket_dir = parent_path / key
        ticket_dir.mkdir(parents=True, exist_ok=True)
        ticket_data = _build_ticket_data(ticket)
        with open(ticket_dir / "ticket.json", "w") as f:
            json.dump(ticket_data, f, indent=2, ensure_ascii=False)
        # 자식 티켓 재귀 처리
        for child_key in hierarchy.get(key, []):
            write_ticket(child_key, ticket_dir)

    write_ticket(root, tickets_dir)


def scaffold_tasks(task_plan: dict, run_dir: Path, ticket_key: str):
    """task-plan.json에서 Task 디렉토리 + dependency-graph.json을 생성한다."""
    tasks = task_plan.get("tasks", [])
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Jira key → Task ID 매핑 (의존성 변환용)
    jira_to_task = {}
    for t in tasks:
        jira_to_task[t["jira_key"]] = t["task_id"]

    nodes = []
    edges = []
    all_deps = defaultdict(list)

    for t in tasks:
        task_id = t["task_id"]
        task_dir = run_dir / "tasks" / task_id

        # 의존성을 Jira key에서 Task ID로 변환
        dep_task_ids = []
        for dep_jira_key in t.get("dependency_jira_keys", []):
            dep_tid = jira_to_task.get(dep_jira_key)
            if dep_tid:
                dep_task_ids.append(dep_tid)
        all_deps[task_id] = dep_task_ids

        # meta/task.json
        task_meta = {
            "task_id": task_id,
            "ticket_key": ticket_key,
            "type": t["type"],
            "priority": t["priority"],
            "title": t["title"],
            "description": t["description"],
            "dependencies": dep_task_ids,
            "expected_files": t.get("expected_files", []),
            "acceptance_criteria": t.get("acceptance_criteria", []),
            "policy_refs": t.get("policy_refs", []),
            "metadata": {
                "jira_key": t["jira_key"],
                "story_key": t.get("story_key"),
            },
            "created_at": now,
        }

        (task_dir / "meta").mkdir(parents=True, exist_ok=True)
        (task_dir / "state").mkdir(parents=True, exist_ok=True)
        (task_dir / "artifacts").mkdir(parents=True, exist_ok=True)

        with open(task_dir / "meta" / "task.json", "w") as f:
            json.dump(task_meta, f, indent=2, ensure_ascii=False)

        # state/status.json
        status = {
            "task_id": task_id,
            "status": "PENDING",
            "retry_count": 0,
            "max_retries": 3,
            "started_at": None,
            "completed_at": None,
            "duration_ms": None,
            "failure_reason": None,
            "updated_at": now,
        }
        with open(task_dir / "state" / "status.json", "w") as f:
            json.dump(status, f, indent=2, ensure_ascii=False)

        # artifacts/artifacts.json
        artifacts = {"task_id": task_id, "files": []}
        with open(task_dir / "artifacts" / "artifacts.json", "w") as f:
            json.dump(artifacts, f, indent=2, ensure_ascii=False)

    # dependency-graph.json
    for t in tasks:
        tid = t["task_id"]
        in_deg = sum(1 for deps in all_deps.values() if tid in deps)
        out_deg = len(all_deps[tid])
        nodes.append({"task_id": tid, "in_degree": in_deg, "out_degree": out_deg})

        for dep_tid in all_deps[tid]:
            edges.append({
                "from": dep_tid,
                "to": tid,
                "reason": f"{dep_tid} must complete before {tid}",
            })

    # 순환 감지 (DFS)
    visited, in_stack = set(), set()
    def has_cycle(node):
        visited.add(node)
        in_stack.add(node)
        for dep in all_deps.get(node, []):
            if dep in in_stack:
                return True
            if dep not in visited and has_cycle(dep):
                return True
        in_stack.discard(node)
        return False

    for tid in [t["task_id"] for t in tasks]:
        if tid not in visited and has_cycle(tid):
            print(json.dumps({"error": "순환 의존성 감지", "node": tid}), file=sys.stderr)
            sys.exit(3)

    graph = {"ticket_key": ticket_key, "nodes": nodes, "edges": edges}
    with open(run_dir / "dependency-graph.json", "w") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)

    return {"tasks_created": len(tasks), "nodes": len(nodes), "edges": len(edges)}


def main():
    args = parse_args()
    run_dir = Path(args.run_dir)

    source = load_json(run_dir / "source.json", "source.json")
    levels = classify_hierarchy(source)

    # 모드 1: skeleton 출력 (LLM 입력용)
    if args.scaffold_only:
        skeleton = build_skeleton(source, levels)
        print(json.dumps(skeleton, indent=2, ensure_ascii=False))
        return

    # 모드 2: task-plan.json으로 디렉토리 생성
    if not args.task_plan:
        print(json.dumps({"error": "--scaffold-only 또는 --task-plan 중 하나를 지정하세요"}), file=sys.stderr)
        sys.exit(1)

    # 기존 결과 확인
    if (run_dir / "dependency-graph.json").exists() and not args.force:
        existing_graph = load_json(run_dir / "dependency-graph.json", "dependency-graph.json")
        print(json.dumps({"status": "exists", "graph": existing_graph}))
        return

    task_plan = load_json(Path(args.task_plan), "task-plan.json")

    # task-plan 기본 검증
    tasks = task_plan.get("tasks", [])
    if not tasks:
        print(json.dumps({"error": "task-plan.json에 tasks가 비어있습니다"}), file=sys.stderr)
        sys.exit(2)

    for t in tasks:
        for field in ("task_id", "jira_key", "type", "priority", "title", "description"):
            if field not in t:
                print(json.dumps({"error": f"task에 필수 필드 누락: {field}", "task": t.get("jira_key", "?")}), file=sys.stderr)
                sys.exit(2)

    # 계층형 티켓 트리 생성 (tickets/{L0}/{L1}/{L2}/ticket.json)
    generate_ticket_tree(source, run_dir)

    # Task 디렉토리 + dependency-graph.json 생성
    result = scaffold_tasks(task_plan, run_dir, args.ticket_key)

    print(json.dumps({
        "status": "created",
        "ticket_key": args.ticket_key,
        "levels": {k: len(v) for k, v in levels.items()},
        **result,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
