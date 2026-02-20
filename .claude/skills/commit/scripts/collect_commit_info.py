#!/usr/bin/env python3
"""
커밋 정보 수집 스크립트

스테이징된 변경 사항을 분석하여 커밋 메시지 작성에 필요한 정보를 JSON으로 출력합니다.
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional


def run_git_command(args: list[str]) -> str:
    """Git 명령어 실행"""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return e.stdout or ""


def get_staged_diff() -> str:
    """스테이징된 변경 사항의 diff 반환"""
    return run_git_command(["diff", "--cached"])


def get_staged_files() -> list[dict]:
    """스테이징된 파일 목록과 상태 반환"""
    output = run_git_command(["diff", "--cached", "--name-status"])
    files = []

    status_map = {
        "A": "added",
        "M": "modified",
        "D": "deleted",
        "R": "renamed",
        "C": "copied",
    }

    for line in output.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            status_code = parts[0][0]  # R100 -> R
            files.append({
                "status": status_map.get(status_code, "unknown"),
                "path": parts[-1],  # 이름 변경 시 새 이름 사용
            })

    return files


def extract_issue_number(file_path: str) -> Optional[str]:
    """
    공용 컴포넌트 파일에서 이슈번호 추출

    파일 상단 주석에서 `// component-path #이슈번호` 형식을 찾음
    """
    if not file_path.startswith("src/components/"):
        return None

    try:
        path = Path(file_path)
        if not path.exists():
            return None

        content = path.read_text(encoding="utf-8")
        # 첫 10줄만 검사
        lines = content.split("\n")[:10]

        for line in lines:
            # // component-path #401 형식 매칭
            match = re.search(r"//.*#(\d+)", line)
            if match:
                return match.group(1)
    except Exception:
        pass

    return None


def get_recent_commits(count: int = 5) -> list[str]:
    """최근 커밋 메시지 반환 (스타일 참고용)"""
    output = run_git_command(["log", f"-{count}", "--pretty=format:%s"])
    return [msg for msg in output.strip().split("\n") if msg]


def categorize_changes(files: list[dict]) -> dict:
    """변경 파일들을 카테고리별로 분류"""
    categories = {
        "components": [],
        "pages": [],
        "api": [],
        "config": [],
        "tests": [],
        "docs": [],
        "styles": [],
        "other": [],
    }

    for file in files:
        path = file["path"]

        if "/components/" in path or path.startswith("components/"):
            categories["components"].append(path)
        elif "/pages/" in path or "/app/" in path:
            categories["pages"].append(path)
        elif "/api/" in path or "api." in path:
            categories["api"].append(path)
        elif any(cfg in path for cfg in ["config", ".json", ".yaml", ".yml", ".env"]):
            categories["config"].append(path)
        elif "test" in path or "spec" in path or "__tests__" in path:
            categories["tests"].append(path)
        elif path.endswith(".md") or "/docs/" in path:
            categories["docs"].append(path)
        elif any(style in path for style in [".css", ".scss", ".styled"]):
            categories["styles"].append(path)
        else:
            categories["other"].append(path)

    # 빈 카테고리 제거
    return {k: v for k, v in categories.items() if v}


def suggest_commit_type(categories: dict, files: list[dict]) -> str:
    """변경 사항 기반 커밋 타입 제안"""
    # 모든 파일이 삭제된 경우
    if all(f["status"] == "deleted" for f in files):
        return "chore"

    # 테스트만 변경
    if list(categories.keys()) == ["tests"]:
        return "test"

    # 문서만 변경
    if list(categories.keys()) == ["docs"]:
        return "docs"

    # 설정만 변경
    if list(categories.keys()) == ["config"]:
        return "chore"

    # 스타일만 변경
    if list(categories.keys()) == ["styles"]:
        return "style"

    # 새 파일 추가가 주된 경우
    added_count = sum(1 for f in files if f["status"] == "added")
    if added_count > len(files) / 2:
        return "feat"

    return "feat"  # 기본값


def main():
    """메인 함수"""
    # 스테이징된 파일 확인
    staged_files = get_staged_files()

    if not staged_files:
        print(json.dumps({
            "error": "스테이징된 변경 사항이 없습니다.",
            "hint": "git add <files>로 파일을 스테이징하세요.",
        }, ensure_ascii=False, indent=2))
        sys.exit(1)

    # diff 수집
    diff = get_staged_diff()

    # 이슈번호 추출 (공용 컴포넌트)
    issue_numbers = []
    for file in staged_files:
        issue = extract_issue_number(file["path"])
        if issue and issue not in issue_numbers:
            issue_numbers.append(issue)

    # 카테고리 분류
    categories = categorize_changes(staged_files)

    # 커밋 타입 제안
    suggested_type = suggest_commit_type(categories, staged_files)

    # 최근 커밋 (스타일 참고)
    recent_commits = get_recent_commits()

    # 결과 출력
    result = {
        "staged_files": staged_files,
        "file_count": len(staged_files),
        "categories": categories,
        "suggested_type": suggested_type,
        "issue_numbers": issue_numbers,
        "recent_commits": recent_commits,
        "diff": diff[:10000] if len(diff) > 10000 else diff,  # 너무 긴 diff 제한
        "diff_truncated": len(diff) > 10000,
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
