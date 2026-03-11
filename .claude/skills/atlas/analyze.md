# analyze — 요구사항 분석 및 위험 평가

## 목적

티켓 내용과 대상 프로젝트 코드를 분석하여 구조화된 요구사항과 위험 평가를 추출한다.

## 전제 조건

- `.harness/ticket.json` 존재 (ingest 단계 완료)
- `.harness/.env`의 `TARGET_PROJECT_DIR` 설정됨

## 실행 지침

### 1단계: 컨텍스트 수집

1. `.harness/ticket.json`을 Read 도구로 읽는다.
2. `TARGET_PROJECT_DIR`에서 프로젝트 구조를 파악한다:
   - 루트 디렉토리 `ls`로 전체 구조 파악
   - `package.json`, `tsconfig.json` 등 설정 파일 확인
   - 티켓에 언급된 모듈·파일이 있으면 해당 코드를 Read 도구로 읽는다
   - 관련 디렉토리를 Glob 도구로 탐색한다

### 2단계: 요구사항 추출

티켓 설명을 분석하여 아래 JSON을 작성한다. **모든 텍스트 값은 한글로 작성한다. 코드 식별자와 기술 용어만 영어를 허용한다.**

```json
{
  "acceptance_criteria": [
    { "id": "AC-1", "description": "구체적이고 검증 가능한 기준을 한글로 작성", "testable": true }
  ],
  "test_scenarios": [
    { "id": "TS-1", "description": "AC를 검증하는 테스트 시나리오를 한글로 작성", "linked_ac_ids": ["AC-1"] }
  ],
  "implementation_steps": [
    "기술적 구현 단계를 순서대로 구체적으로 한글 작성"
  ],
  "policy_rules": [
    "비즈니스 규칙, 제약조건, 정책을 한글로 작성"
  ],
  "missing_info": [
    "구현 전 명확히 해야 할 정보 공백을 한글로 작성. 잘 정의되어 있으면 빈 배열"
  ],
  "ambiguities": [
    "모호하거나 충돌하거나 불충분한 서술을 한글로 작성"
  ],
  "dependencies": [
    "기술적 의존성과 전제조건을 한글로 작성"
  ]
}
```

**분석 규칙:**
- `acceptance_criteria`: 모든 인수 기준을 추출. ID는 `AC-1`, `AC-2` 형태. 구체적 테스트로 검증 가능하면 `testable: true`.
- `test_scenarios`: 인수 기준을 커버하는 테스트 시나리오를 생성. 반드시 관련 AC ID를 `linked_ac_ids`에 연결.
- `implementation_steps`: 기술적 구현 단계를 순서대로 분해. 프로젝트 구조를 반영하여 구체적으로 작성.
- `missing_info`: 티켓이 잘 정의되어 있으면 빈 배열. 모호해도 가능한 것을 추출하고 부족한 점만 여기 기록.
- `dependencies`: 외부 라이브러리, API, DB 스키마 등 기술적 전제조건.

`.harness/requirements.json`에 Write 도구로 저장한다.

### 3단계: 위험 평가

요구사항을 기반으로 위험 요인을 평가한다:

```json
{
  "level": "low | medium | high",
  "factors": [
    { "category": "scope | dependency | regression | operational | specification_gap", "description": "한글로 작성", "severity": "low | medium | high" }
  ],
  "recommendation": "팀에 대한 간결한 조언 1~3문장을 한글로 작성"
}
```

**위험 평가 기준:**

| 카테고리 | 평가 항목 |
|----------|----------|
| `scope` | AC 및 구현 단계의 수, 횡단 관심사(인증, i18n, 캐싱), 영향받는 컴포넌트 수 |
| `dependency` | 외부 API 의존성, DB 스키마 변경, 공유 라이브러리 수정, 서비스 간 통신 변경 |
| `regression` | 테스트 커버리지 공백(testable=false인 AC), 누락된 명세, 기존 기능 영향 |
| `operational` | 배포 복잡도(마이그레이션, 피처 플래그), 롤백 난이도, 성능 영향 |
| `specification_gap` | missing_info와 ambiguities의 심각도 |

**전체 레벨 결정:**
- `high`: severity "high" 1개 이상, 또는 "medium" 3개 이상, 또는 치명적 명세 공백
- `medium`: severity "medium" 1~2개, 또는 보통 수준의 명세 공백
- `low`: 모든 요소가 "low"이고 의미 있는 공백 없음

`.harness/risk.json`에 Write 도구로 저장한다.

## 완료 후 사용자에게 보여줄 내용

```
[analyze 완료]
인수 기준: {N}개 (testable: {M}개)
테스트 시나리오: {K}개
위험 수준: {level}
  - {factor.category}: {factor.description} ({factor.severity})
누락 사항: {missing_info 목록 또는 "없음"}
```
