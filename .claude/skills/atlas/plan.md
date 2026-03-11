# plan — 실행 계획 수립

## 목적

요구사항과 위험 평가를 기반으로 AI 코딩 에이전트가 실행할 태스크 목록, 스코프, 실행 순서를 결정한다.

## 전제 조건

- `.harness/requirements.json` 존재 (analyze 단계 완료)
- `.harness/risk.json` 존재 (analyze 단계 완료)
- `.harness/.env`의 `TARGET_PROJECT_DIR` 설정됨

## 실행 지침

### 1단계: 입력 읽기

Read 도구로 `.harness/requirements.json`과 `.harness/risk.json`을 읽는다.

### 2단계: 프로젝트 구조 탐색

`TARGET_PROJECT_DIR`에서:
- 디렉토리 트리를 `ls`로 파악한다
- 주요 모듈 경계를 확인한다 (features/, components/, services/ 등)
- 요구사항에 관련된 기존 코드를 Read/Grep 도구로 탐색한다
- 각 태스크가 수정해야 할 파일 범위를 추정한다

### 3단계: 실행 계획 작성

**모든 텍스트 값은 한글로 작성한다. 코드 경로, 명령어, ID만 영어를 허용한다.**

```json
{
  "tasks": [
    {
      "id": "T-1",
      "title": "한글로 간략 제목",
      "description": "한글로 상세 구현 설명. AI 에이전트가 이것만 읽고 구현할 수 있을 정도로 구체적으로 작성",
      "linked_ac_ids": ["AC-1", "AC-2"],
      "deps": [],
      "scope": {
        "editable_paths": ["src/features/auth/**"],
        "forbidden_paths": ["src/components/ui/**", "node_modules/**"]
      },
      "verify_cmd": "pnpm typecheck && pnpm test -- --grep 'auth'"
    }
  ],
  "execution_order": ["T-1", "T-2", "T-3"],
  "validation_strategy": "한글로 종단 간 검증 범위를 요약",
  "rollback_strategy": "한글로 배포/검증 실패 시 롤백 단계를 설명"
}
```

**태스크 설계 규칙:**

| 규칙 | 설명 |
|------|------|
| **단일 책임** | 각 태스크는 AI 에이전트가 완료할 수 있는 하나의 집중된 작업 단위. 태스크당 1~3개 파일 목표 |
| **큰 변경 분할** | 큰 변경은 독립적으로 검증 가능한 작은 태스크로 분할 |
| **ID 규칙** | `T-1`, `T-2` 등 순차적 |
| **AC 커버리지** | 모든 AC가 최소 하나의 태스크에 `linked_ac_ids`로 연결되어야 함 |
| **의존성** | `deps`에 이 태스크 전에 완료해야 하는 태스크 ID를 나열. 없으면 빈 배열 |
| **스코프 구체성** | `editable_paths`는 프로젝트 구조 기반의 구체적인 Glob 패턴. 넓은 `**/*`는 사용하지 않음 |
| **forbidden 필수** | `forbidden_paths`에 자동 생성 파일, UI 라이브러리, node_modules 등을 명시 |
| **verify_cmd** | `.harness/.env`의 `VERIFY_CMD`를 기본값으로 사용하되, 태스크별 관련 테스트만 실행하도록 override |
| **위험 반영** | 고위험 요소가 있으면 명시적 검증 태스크를 추가 |
| **execution_order** | 의존성을 고려한 위상 정렬. deps가 먼저 오도록 |

`.harness/plan.json`에 Write 도구로 저장한다.

## 완료 후 사용자에게 보여줄 내용

태스크 목록을 표 형태로:

```
[plan 완료]
| ID  | 제목 | 연결 AC | 의존 | 수정 범위 |
|-----|------|---------|------|----------|
| T-1 | ... | AC-1 | - | src/features/auth/** |
| T-2 | ... | AC-2 | T-1 | src/api/** |

실행 순서: T-1 → T-2
검증 전략: ...
```
