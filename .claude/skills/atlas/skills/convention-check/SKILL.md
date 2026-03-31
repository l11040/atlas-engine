---
name: convention-check
description: >
  execute 전후에 프로젝트 수준 컨벤션 준수를 검증한다.
  convention-registry.yaml에 등록된 개별 컨벤션 스킬을 파일 패턴 기반으로 자동 매핑하고,
  각 스킬을 실행하여 결과를 evidence JSON으로 기록한다.
  프로젝트 고유 컨벤션은 project/ 디렉토리에 추가하여 확장 가능.
  Use this skill when: execute 스킬에서 코드 생성 직후 자동 호출된다. 단독 실행도 가능.
---

# /convention-check — 컨벤션 준수 오케스트레이터

## 구조

```
convention-check/
├── SKILL.md                          ← 오케스트레이터 (이 파일)
├── convention-registry.yaml          ← 전체 컨벤션 목록 + 파일 패턴 매핑
├── scripts/
│   └── record-convention-evidence.sh ← 증거 기록 스크립트
├── backend/                          ← 백엔드 컨벤션 스킬
│   ├── entity/                       ← 엔티티 (10 스킬)
│   │   ├── base-entity/SKILL.md
│   │   ├── optimistic-lock/SKILL.md       ← 조건부 적용 (적응형)
│   │   ├── soft-delete/SKILL.md           ← 적응형
│   │   ├── audit-listener/SKILL.md        ← 적응형
│   │   ├── protected-constructor/SKILL.md
│   │   ├── enum-mapping/SKILL.md
│   │   ├── file-location/SKILL.md         ← 적응형
│   │   ├── unique-constraint/SKILL.md
│   │   ├── jpa-relation/SKILL.md
│   │   └── reserved-word-escape/SKILL.md  ← 신규
│   ├── domain/                       ← 엔티티 간 관계/공존 (1 스킬)
│   │   └── version-audited-coexistence/SKILL.md ← 신규 (critical)
│   ├── api/                          ← API (5 스킬)
│   │   ├── response-wrapper/SKILL.md      ← 적응형
│   │   ├── swagger-docs/SKILL.md
│   │   ├── global-exception/SKILL.md
│   │   ├── dto-naming/SKILL.md            ← 적응형
│   │   └── controller-location/SKILL.md
│   ├── service/                      ← 서비스 (3 스킬)
│   │   ├── transaction-default/SKILL.md
│   │   ├── no-interface/SKILL.md
│   │   └── file-location/SKILL.md         ← 적응형
│   ├── repository/                   ← 리포지토리 (2 스킬)
│   │   ├── jpa-repository/SKILL.md
│   │   └── querydsl-separation/SKILL.md
│   ├── common/                       ← 공통 (5 스킬)
│   │   ├── no-redis/SKILL.md
│   │   ├── caffeine-only/SKILL.md
│   │   ├── idempotency/SKILL.md
│   │   ├── n-plus-one/SKILL.md
│   │   └── exception-consistency/SKILL.md ← 강화 (@Entity 기반 감지)
│   ├── migration/                    ← 마이그레이션 (5 스킬)
│   │   ├── flyway-naming/SKILL.md         ← 적응형
│   │   ├── soft-delete-column/SKILL.md
│   │   ├── version-column/SKILL.md
│   │   ├── audit-columns/SKILL.md
│   │   └── unique-index/SKILL.md
│   └── batch/                        ← 배치 (4 스킬)
│       ├── step-scope/SKILL.md
│       ├── fault-tolerant/SKILL.md        ← 강화 (구체적 대안 예시)
│       ├── n-plus-one-batch/SKILL.md
│       └── scheduler-zone/SKILL.md
├── frontend/                         ← 프론트엔드 컨벤션 스킬
│   ├── page/                         ← 페이지 (2 스킬)
│   │   ├── metadata-export/SKILL.md
│   │   └── suspense-boundary/SKILL.md
│   ├── component/                    ← 컴포넌트 (1 스킬)
│   │   └── file-location/SKILL.md
│   ├── state/                        ← 상태관리 (2 스킬)
│   │   ├── tanstack-query/SKILL.md
│   │   └── zustand/SKILL.md
│   ├── api/                          ← API 호출 (2 스킬)
│   │   ├── orval-only/SKILL.md
│   │   └── no-manual-fetch/SKILL.md
│   └── common/                       ← 공통 (2 스킬)
│       ├── kebab-case/SKILL.md
│       └── shadcn-ui/SKILL.md
└── project/                          ← 프로젝트 고유 컨벤션 (확장 포인트)
    └── README.md
```

**백엔드 28개 + 프론트엔드 9개 = 총 37개 컨벤션 스킬**

## 실행 절차

### 1. 레지스트리 로드

`convention-registry.yaml`을 읽어 전체 컨벤션 목록을 로드한다.

### 2. 파일 패턴 매칭 (적응형)

Task의 files를 분석하여 해당하는 컨벤션 그룹을 활성화한다.

**패턴 매칭 우선순위:**
1. `applies_to.patterns` 글로브 매칭 (기본)
2. 패턴 매칭 실패 시 `fallback_detection.annotation` 기반 감지
   - 파일 내용에서 `@Entity` 등 어노테이션을 검색하여 그룹 매칭
   - Entity 접미사를 사용하지 않는 프로젝트에서 false negative 방지

```
Task files 예시 (Entity 접미사 미사용 프로젝트):
  - core/entity/point/PointAccount.java      ← *Entity.java 패턴 불일치
  - core/entity/point/Grant.java             ← but @Entity 어노테이션 존재
  - bo/domains/point/GrantService.java
  - bo/domains/point/controller/GrantController.java

→ 활성화되는 그룹:
  - backend-entity (ENT-001~010)   ← fallback_detection으로 매칭
  - backend-domain (DOM-003)       ← entity/ 경로 + @Entity 감지
  - backend-service (SVC-001~003)
  - backend-api (API-001~005)
  - backend-common (CMN-001~005)   ← 모든 Java 파일에 공통
```

### 3. 프로젝트 패턴 감지 (적응형 스킬 전용)

적응형(adaptive) 스킬은 검증 규칙을 적용하기 전에 프로젝트의 실제 패턴을 감지한다.
이 단계는 **한 번만** 실행하고 결과를 캐싱하여 모든 적응형 스킬이 공유한다.

```
공통 감지 항목:
1. BaseEntity 읽기 → soft-delete 패턴 + audit 메커니즘 감지
2. 기존 엔티티 파일 스캔 → 네이밍 패턴 감지 (Entity 접미사 여부)
3. 기존 Controller 스캔 → 응답 래퍼 패턴 감지
4. 기존 DTO 스캔 → record/class 패턴 감지
5. 기존 마이그레이션 스캔 → 버전 형식 감지
6. 기존 Service 스캔 → 모듈별 배치 전략 감지
```

감지 결과는 각 적응형 스킬의 "패턴 감지" 섹션에서 활용된다.

### 4. 개별 스킬 실행

활성화된 그룹의 각 스킬에 대해:

1. 해당 스킬의 `SKILL.md`를 읽는다 (progressive disclosure)
2. **적응형 스킬이면** 감지된 프로젝트 패턴을 적용한다
3. 검증 규칙에 따라 대상 파일을 검사한다
4. PASS/FAIL + 증거를 수집한다
5. `priority: critical` + `auto_fix: true`인 FAIL 항목은 자동 수정을 시도한다
6. 자동 수정 후 해당 항목만 재검증한다

### 5. 증거 기록

모든 스킬 실행 결과를 모아 증거를 기록한다:

```bash
bash scripts/record-convention-evidence.sh \
  --run-dir "${RUN_DIR}" \
  --task-id "${TASK_ID}" \
  --results '{ "checks": [...], "summary": { "total": 34, "pass": 32, "fail": 2, "pass_rate": 0.941 } }'
```

증거 파일: `evidence/execute/task-{id}/convention-check.json`

### 6. 결과 보고

| 상황 | 다음 행동 |
|------|----------|
| 모든 스킬 PASS | 다음 단계(pre-build)로 진행 |
| FAIL 있지만 자동 수정 성공 | 증거 업데이트 후 다음 단계로 진행 |
| FAIL + 자동 수정 실패 | 사용자에게 보고. completion-gate가 차단 |

## 프로젝트 고유 컨벤션 추가 방법

1. `project/{convention-name}/SKILL.md` 생성
2. `convention-registry.yaml`의 `project-custom` 섹션에 등록
3. `enabled: true` 설정

예시:
```yaml
project-custom:
  path: project
  applies_to:
    patterns: ["*.java"]
  skills:
    - id: PRJ-001
      name: custom-error-code
      priority: high
      auto_fix: false
      enabled: true
```

## completion-gate 연동

**convention-check.json이 없거나 FAIL이 있으면 Task 완료가 물리적으로 차단된다.**
이것이 "스킬을 간헐적으로 안 따르는" 문제의 구조적 해결책이다.
