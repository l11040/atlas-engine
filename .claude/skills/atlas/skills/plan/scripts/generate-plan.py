# /// script
# dependencies = []
# ///
"""
Wave 기반 실행 계획 생성기 — Kahn's Algorithm으로 DAG를 위상 정렬하여 Wave로 분할한다.

Usage:
  python3 scripts/generate-plan.py --ticket-key GRID-2 --run-dir /path/to/.automation/runs/GRID-2-a1b2c3d4

Exit codes:
  0: 성공
  1: 인자 오류 또는 파일 누락
  2: 순환 의존성 감지
  3: Task 수 불일치
"""
import argparse
import json
import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="DAG 위상 정렬 → Wave 기반 실행 계획 생성",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python3 generate-plan.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2
  python3 generate-plan.py --ticket-key GRID-2 --run-dir .automation/runs/GRID-2-a1b2 --force""",
    )
    parser.add_argument("--ticket-key", required=True, help="Jira 티켓 키 (예: GRID-2)")
    parser.add_argument("--run-dir", required=True, help="run 디렉토리 경로")
    parser.add_argument("--force", action="store_true", help="기존 실행 계획 덮어쓰기")
    parser.add_argument("--output", help="출력 파일 경로 (기본: {run-dir}/execution-plan.json)")
    return parser.parse_args()


def load_json(path: Path, label: str) -> dict:
    if not path.exists():
        print(json.dumps({"error": f"{label} not found: {path}"}), file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def collect_task_ids(run_dir: Path) -> set[str]:
    """tasks/ 하위의 모든 Task ID를 수집한다."""
    task_ids = set()
    tasks_dir = run_dir / "tasks"
    if not tasks_dir.exists():
        return task_ids
    for task_json in tasks_dir.glob("TASK-*/meta/task.json"):
        task_ids.add(task_json.parent.parent.name)
    return task_ids


def collect_expected_files(run_dir: Path) -> dict[str, list[str]]:
    """각 Task의 expected_files를 수집한다."""
    result = {}
    tasks_dir = run_dir / "tasks"
    if not tasks_dir.exists():
        return result
    for task_json in tasks_dir.glob("TASK-*/meta/task.json"):
        with open(task_json) as f:
            meta = json.load(f)
        task_id = meta.get("task_id", task_json.parent.parent.name)
        result[task_id] = meta.get("expected_files", [])
    return result


def topological_sort_waves(nodes: list[dict], edges: list[dict]) -> list[list[str]]:
    """Kahn's Algorithm으로 DAG를 Wave 단위로 위상 정렬한다.

    Returns:
        Wave 리스트. 각 Wave는 병렬 실행 가능한 Task ID 리스트.

    Raises:
        SystemExit(2): 순환 의존성 감지 시
    """
    node_ids = {n["task_id"] for n in nodes}
    in_degree = {nid: 0 for nid in node_ids}
    adjacency = {nid: [] for nid in node_ids}

    for edge in edges:
        src, dst = edge["from"], edge["to"]
        if src in node_ids and dst in node_ids:
            adjacency[src].append(dst)
            in_degree[dst] += 1

    waves = []
    remaining = set(node_ids)

    while remaining:
        # in_degree가 0인 노드를 현재 Wave에 배치
        wave = sorted([nid for nid in remaining if in_degree[nid] == 0])
        if not wave:
            cycle_nodes = sorted(remaining)
            print(
                json.dumps({
                    "error": "순환 의존성 감지",
                    "cycle_candidates": cycle_nodes,
                }),
                file=sys.stderr,
            )
            sys.exit(2)

        waves.append(wave)
        for nid in wave:
            remaining.discard(nid)
            for neighbor in adjacency[nid]:
                in_degree[neighbor] -= 1

    return waves


def detect_file_conflicts(waves: list[list[str]], expected_files: dict[str, list[str]]) -> list[dict]:
    """같은 Wave 내에서 expected_files가 겹치는 Task를 감지한다."""
    warnings = []
    for i, wave in enumerate(waves):
        file_owners: dict[str, list[str]] = {}
        for task_id in wave:
            for f in expected_files.get(task_id, []):
                file_owners.setdefault(f, []).append(task_id)
        for f, owners in file_owners.items():
            if len(owners) > 1:
                warnings.append({
                    "wave_index": i,
                    "file": f,
                    "conflicting_tasks": owners,
                })
    return warnings


def main():
    args = parse_args()
    run_dir = Path(args.run_dir)
    output_path = Path(args.output) if args.output else run_dir / "execution-plan.json"

    # 기존 계획 확인
    if output_path.exists() and not args.force:
        existing = load_json(output_path, "execution-plan.json")
        print(json.dumps({"status": "exists", "plan": existing}))
        sys.exit(0)

    # 입력 로드
    graph = load_json(run_dir / "dependency-graph.json", "dependency-graph.json")
    actual_task_ids = collect_task_ids(run_dir)
    expected_files = collect_expected_files(run_dir)

    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    graph_task_ids = {n["task_id"] for n in nodes}

    # DAG 노드와 실제 Task 파일 수 일치 확인
    if graph_task_ids != actual_task_ids:
        only_in_graph = sorted(graph_task_ids - actual_task_ids)
        only_in_fs = sorted(actual_task_ids - graph_task_ids)
        print(
            json.dumps({
                "error": "dependency-graph 노드와 실제 Task 불일치",
                "only_in_graph": only_in_graph,
                "only_in_filesystem": only_in_fs,
            }),
            file=sys.stderr,
        )
        sys.exit(3)

    # Wave 분할
    waves = topological_sort_waves(nodes, edges)

    # 파일 충돌 감지
    conflicts = detect_file_conflicts(waves, expected_files)

    # execution-plan.json 생성
    plan = {
        "ticket_key": args.ticket_key,
        "waves": [
            {
                "wave_index": i,
                "task_ids": wave,
                "parallel": len(wave) > 1,
            }
            for i, wave in enumerate(waves)
        ],
        "total_tasks": sum(len(w) for w in waves),
        "file_conflicts": conflicts,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

    # 결과 출력
    result = {"status": "created", "plan": plan}
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
