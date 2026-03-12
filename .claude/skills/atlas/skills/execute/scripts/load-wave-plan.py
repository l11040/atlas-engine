#!/usr/bin/env python3
"""실행 매니페스트 로더.

execution-plan.json + 각 Task의 meta/status를 읽어 실행 매니페스트를 stdout으로 출력한다.
COMPLETED Task는 자동 스킵하여 재개를 지원한다.

Exit codes:
  0: 성공
  1: 인자 오류 또는 파일 누락
  2: 모든 Task가 이미 완료됨
"""

import argparse
import json
import os
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Wave 기반 실행 매니페스트 로더")
    parser.add_argument("--ticket-key", required=True, help="Jira 티켓 키 (예: GRID-2)")
    parser.add_argument("--run-dir", required=True, help="Run 디렉토리 경로")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    plan_file = run_dir / "execution-plan.json"

    if not plan_file.exists():
        print(json.dumps({"error": f"execution-plan.json not found: {plan_file}"}))
        sys.exit(1)

    plan = load_json(plan_file)
    tasks_dir = run_dir / "tasks"
    tickets_dir = run_dir / "tickets"

    # 목적: file_conflicts를 Wave별 딕셔너리로 변환
    conflict_map: dict[int, list[dict]] = {}
    for fc in plan.get("file_conflicts", []):
        wi = fc["wave_index"]
        conflict_map.setdefault(wi, []).append(fc)

    waves = []
    total_pending = 0
    total_skipped = 0

    for wave in plan["waves"]:
        wave_index = wave["wave_index"]
        parallel = wave.get("parallel", False)
        has_conflicts = wave_index in conflict_map

        tasks = []
        for task_id in wave["task_ids"]:
            task_dir = tasks_dir / task_id
            meta_file = task_dir / "meta" / "task.json"
            status_file = task_dir / "state" / "status.json"

            if not meta_file.exists() or not status_file.exists():
                print(
                    json.dumps({"error": f"Task 파일 누락: {task_id}"}),
                    file=sys.stderr,
                )
                sys.exit(1)

            meta = load_json(meta_file)
            status = load_json(status_file)

            current_status = status.get("status", "PENDING")

            # 목적: COMPLETED Task는 스킵
            if current_status == "COMPLETED":
                total_skipped += 1
                continue

            total_pending += 1

            # 목적: 티켓 파일 경로 계산 (Claude가 컨텍스트로 읽을 수 있도록)
            ticket_paths = []
            jira_key = meta.get("metadata", {}).get("jira_key", "")
            story_key = meta.get("metadata", {}).get("story_key", "")
            if jira_key and story_key and tickets_dir.exists():
                # 목적: 티켓 트리에서 해당 L2 + L1 경로 탐색
                for ticket_json in tickets_dir.rglob("*/ticket.json"):
                    parent_name = ticket_json.parent.name
                    if parent_name == jira_key or parent_name == story_key:
                        ticket_paths.append(str(ticket_json))

            tasks.append({
                "task_id": task_id,
                "type": meta.get("type", ""),
                "title": meta.get("title", ""),
                "priority": meta.get("priority", "medium"),
                "status": current_status,
                "retry_count": status.get("retry_count", 0),
                "max_retries": status.get("max_retries", 2),
                "dependencies": meta.get("dependencies", []),
                "expected_files": meta.get("expected_files", []),
                "acceptance_criteria_count": len(meta.get("acceptance_criteria", [])),
                "policy_refs": meta.get("policy_refs", []),
                "ticket_paths": ticket_paths,
            })

        if tasks:
            waves.append({
                "wave_index": wave_index,
                "parallel": parallel and not has_conflicts,
                "has_file_conflicts": has_conflicts,
                "file_conflicts": conflict_map.get(wave_index, []),
                "tasks": tasks,
            })

    # 목적: 모든 Task가 이미 완료된 경우
    if total_pending == 0:
        result = {
            "status": "all_completed",
            "ticket_key": args.ticket_key,
            "total_skipped": total_skipped,
            "message": "모든 Task가 이미 COMPLETED 상태입니다.",
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(2)

    result = {
        "status": "ready",
        "ticket_key": args.ticket_key,
        "total_pending": total_pending,
        "total_skipped": total_skipped,
        "waves": waves,
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
