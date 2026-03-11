---
name: atlas
description: >
  Jira 티켓을 분석하여 프로젝트 컨벤션에 맞는 코드를 자동 생성하는 5단계 파이프라인.
  learn으로 컨벤션을 학습하고, analyze로 티켓을 Task로 분해하며, plan으로 실행 계획을 수립하고,
  execute로 코드를 생성한다. 티켓 기반 자동화, 컨벤션 학습, 코드 생성, Task 분해가 필요할 때 사용.
user-invocable: true
argument-hint: "learn|analyze|plan|execute|complete [options]"
---

# Atlas

Jira 티켓 → 코드 자동 생성 파이프라인: `/learn → /analyze → /plan → /execute → /complete`

## 서브커맨드 라우팅

현재 요청: `$ARGUMENTS`

서브커맨드(`$0`)에 따라 해당 스킬 파일을 읽고 지시를 따른다:

| 서브커맨드 | 스킬 파일               | 설명                                         |
| ---------- | ----------------------- | -------------------------------------------- |
| `learn`    | `skills/learn/learn.md` | 프로젝트 컨벤션 분석 → conventions.json 생성 |

옵션(`$1` 이후)은 각 스킬 파일의 지시에 따라 처리한다.
모든 상대 경로는 이 SKILL.md가 위치한 디렉토리(`${CLAUDE_SKILL_DIR}`) 기준이다.

## 실행 규칙

1. **스킬 파일을 먼저 읽는다**: 서브커맨드에 해당하는 스킬 파일(`skills/<subcmd>/`)을 읽고 그 지시를 따른다.
2. **스키마를 따른다**: 산출물 생성 시 `schemas/` 하위의 해당 스키마를 읽어서 구조를 확인한다.
3. **증거를 남긴다**: 스텝 완료 후 post-step Hook 스크립트를 Bash로 실행하여 산출물을 스키마 검증하고 `.automation/evidence/{step}.validated.json`을 생성한다.
4. **다음 스텝은 증거만 확인한다**: 스텝 시작 전 pre-step Hook 스크립트를 실행하여 이전 스텝의 증거 파일 존재 + `status=validated`를 확인한다.

## 환경 설정

스킬 루트에 `.env`가 없으면 `.env.example`을 복사하고 값을 채운다:

```bash
cp ${CLAUDE_SKILL_DIR}/.env.example ${CLAUDE_SKILL_DIR}/.env
```

## 참조 문서

- [Hook 아키텍처](references/hook-architecture.md) — post-step/pre-step Hook 구조
- [컨벤션 레이어](references/convention-layers.md) — Layer 0~4 우선순위 규칙
