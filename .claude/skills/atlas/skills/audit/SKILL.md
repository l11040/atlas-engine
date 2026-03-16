---
name: audit
description: >
  execute 완료 후 생성된 전체 코드를 conventions.json 기준으로 의미론적 감사.
  domain_lint(패턴 매칭)와 redteam(기능 결함)이 못 잡는 스타일·네이밍·패턴 위반을 검출한다.
---

# /audit — 컨벤션 준수 감사

## 목적

execute 단계에서 생성된 코드가 `conventions.json`의 **모든 카테고리**를 의미론적으로 준수하는지 감사한다.

### 기존 검증과의 차이

| 검증 | 시점 | 대상 | 방법 |
|------|------|------|------|
| `validate.sh --domain-lint` | Task별 | `domain_lint` 배열만 | 패턴 매칭 (grep) |
| redteam | Task별 | 기능 결함 (동시성, 상태전이, 무결성) | LLM 검토 |
| **audit** | **execute 완료 후** | **conventions.json 전체** | **LLM 의미론적 감사** |

## 실행 흐름

### 1. 입력 수집

1. `${RUN_DIR}/evidence/execute/done.json` 존재를 확인한다 (execute 완료 전제)
2. `${PROJECT_ROOT}/.automation/conventions.json`을 읽는다
3. 전체 task를 순회하여 `status=done`인 task의 생성/수정 파일 목록을 수집한다
   - `evidence/execute/task-{id}/generate.json`에서 `files_created` + `files_modified` 추출
4. 수집된 파일을 실제로 읽는다

### 2. 카테고리별 감사

conventions.json의 각 카테고리에 대해 **전체 파일을 한 번에** 감사한다.
Agent tool로 카테고리별 서브에이전트를 **병렬 실행**한다.

#### 감사 카테고리

| 카테고리 | conventions.json 키 | 검사 내용 |
|----------|---------------------|-----------|
| **naming** | `naming` | 파일명, 클래스명, 메서드명, 변수명이 네이밍 규칙을 따르는가 |
| **style** | `style` | 들여쓰기, 줄 길이, 중괄호 스타일, import 순서 |
| **annotations** | `annotations` | 레이어별 어노테이션이 올바르게 사용되었는가 |
| **patterns** | `patterns` | 디자인/구현 패턴이 프로젝트 관례대로 적용되었는가 |
| **forbidden** | `forbidden` | 금지 사항이 코드에 존재하지 않는가 |
| **required** | `required` | 필수 사항이 코드에 반영되어 있는가 |

#### 서브에이전트 실행 규칙

1. 각 에이전트는 **conventions.json의 해당 카테고리 규칙 + 실제 코드**를 입력받는다
2. 에이전트는 위반 사항을 `checks` 배열로 반환한다 (redteam과 동일한 `line_ref` 증거 규칙)
3. 위반 심각도: `high` (반드시 수정), `medium` (선별 수정 — 수정 가치 판단 후 결정), `low` (보고만)
4. 에이전트는 **수정 지시만 반환** (직접 수정하지 않음)

#### 검사 ID 체계

감사 항목은 카테고리별 접두사를 사용한다:

| 접두사 | 카테고리 | 예시 |
|--------|----------|------|
| `NAM-` | naming | `NAM-1`: 파일명이 네이밍 규칙에 맞지 않음 |
| `STY-` | style | `STY-1`: import 순서 위반 |
| `ANN-` | annotations | `ANN-1`: 레이어에 맞지 않는 어노테이션 사용 |
| `PAT-` | patterns | `PAT-1`: 프로젝트 패턴과 다른 구현 |
| `FBD-` | forbidden | `FBD-1`: 금지 사항 위반 |
| `REQ-` | required | `REQ-1`: 필수 사항 누락 |

### 3. 피드백 반영

#### 3-1. HIGH 위반 — 무조건 수정

1. 모든 에이전트 결과를 모아서 high 위반을 목록화한다
2. 수정 지시를 코드에 반영한다
3. 수정된 파일을 `validate.sh`로 재검증한다 (domain_lint 회귀 방지)
4. fix 커밋을 생성한다:
   ```
   fix({scope}): audit 컨벤션 위반 수정
   ```
5. 증거: `record_audit_fix_evidence`로 수정 내역을 기록한다

#### 3-2. MEDIUM 위반 — 선별 수정

MEDIUM 위반은 일괄 수정하지 않는다. 각 항목을 아래 기준으로 **수정 가치를 판단**한 뒤, 가치 있는 항목만 수정한다.

**수정 기준:**

| 판단 | 수정 여부 | 예시 |
|------|-----------|------|
| 런타임 영향이 있거나 후속 개발에 혼란을 주는 경우 | 수정 | 선언만 있고 실제 동작하지 않는 설정, 잘못된 에러코드 |
| 기존 코드베이스와 명확히 불일치하는 경우 | 수정 | 같은 레이어 다른 서비스에는 있는 어노테이션 누락 |
| 의도된 설계 결정이거나 실질적 영향이 없는 경우 | 스킵 | 응답 전용 DTO에 @Setter 불필요, 서비스 분리 방식 차이 |
| 수정 범위가 넓어 회귀 위험이 높은 경우 | 스킵 | 10개 Enum 일괄 메서드 추가 등 |

**실행 절차:**

1. MEDIUM 위반 목록을 위 기준으로 분류하여 **수정/스킵 판정표**를 작성한다
2. 판정표를 사용자에게 보고한다 (수정 이유와 스킵 이유를 함께 명시)
3. 수정 대상 항목을 코드에 반영한다
4. HIGH 수정과 함께 fix 커밋에 포함하거나, 별도 fix 커밋을 생성한다
5. 스킵 항목은 audit-summary.json의 `medium_skipped` 필드에 사유와 함께 기록한다

#### 3-3. LOW 위반 — 보고만

low는 보고만 하고 수정하지 않는다.

### 4. 증거 기록

```bash
# 카테고리별 감사 결과
record_audit_evidence "$RUN_DIR" "naming" "$CHECKS_JSON" "$FIXES_JSON"
record_audit_evidence "$RUN_DIR" "style" "$CHECKS_JSON"
# ...

# 전체 요약
record_audit_summary "$RUN_DIR" "$CATEGORIES_JSON" "$TOTAL_VIOLATIONS" "$TOTAL_FIXES"
```

### 5. 완료

`evidence/audit/done.json` 기록.

## 감사 규칙

### 예외 처리

- **override가 적용된 항목**: Task의 `overrides`에서 `decision: "ac"`인 항목은 해당 convention 위반이 아니다. 감사 시 override 목록을 참조하여 false positive를 방지한다.
- **test 파일**: 테스트 코드는 style/annotations 감사에서 관대하게 처리한다 (예: 메서드명에 한글 허용 등).
- **기존 코드**: 이번 run에서 **생성/수정된 파일만** 감사 대상이다. 기존 코드는 감사하지 않는다.

### Cross-task 일관성

서로 다른 task에서 생성된 파일 간에 일관성이 있는지도 확인한다:
- 동일 패키지 내 클래스들의 네이밍 패턴 일관성
- 동일 레이어 클래스들의 어노테이션 사용 일관성
- DTO 패턴의 일관성 (Request/Response 접미사 등)

## 산출물 구조

```
evidence/
└── audit/
    ├── audit-naming.json       ← 카테고리별 감사 결과
    ├── audit-style.json
    ├── audit-annotations.json
    ├── audit-patterns.json
    ├── audit-forbidden.json
    ├── audit-required.json
    ├── audit-summary.json      ← 전체 요약
    ├── audit-fix.json          ← 수정 내역 (있을 때만)
    └── done.json
```
