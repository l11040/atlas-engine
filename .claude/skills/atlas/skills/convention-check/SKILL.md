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
│   ├── entity/                       ← 엔티티 (7 스킬)
│   │   ├── base-entity/SKILL.md
│   │   ├── optimistic-lock/SKILL.md
│   │   ├── soft-delete/SKILL.md
│   │   ├── audit-listener/SKILL.md
│   │   ├── protected-constructor/SKILL.md
│   │   ├── enum-mapping/SKILL.md
│   │   └── file-location/SKILL.md
│   ├── api/                          ← API (5 스킬)
│   │   ├── response-wrapper/SKILL.md
│   │   ├── swagger-docs/SKILL.md
│   │   ├── global-exception/SKILL.md
│   │   ├── dto-naming/SKILL.md
│   │   └── controller-location/SKILL.md
│   ├── service/                      ← 서비스 (3 스킬)
│   │   ├── transaction-default/SKILL.md
│   │   ├── no-interface/SKILL.md
│   │   └── file-location/SKILL.md
│   ├── repository/                   ← 리포지토리 (2 스킬)
│   │   ├── jpa-repository/SKILL.md
│   │   └── querydsl-separation/SKILL.md
│   ├── common/                       ← 공통 (4 스킬)
│   │   ├── no-redis/SKILL.md
│   │   ├── caffeine-only/SKILL.md
│   │   ├── idempotency/SKILL.md
│   │   └── n-plus-one/SKILL.md
│   └── migration/                    ← 마이그레이션 (4 스킬)
│       ├── flyway-naming/SKILL.md
│       ├── soft-delete-column/SKILL.md
│       ├── version-column/SKILL.md
│       └── audit-columns/SKILL.md
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

**백엔드 25개 + 프론트엔드 9개 = 총 34개 컨벤션 스킬**

## 실행 절차

### 1. 레지스트리 로드

`convention-registry.yaml`을 읽어 전체 컨벤션 목록을 로드한다.

### 2. 파일 패턴 매칭

Task의 files를 분석하여 해당하는 컨벤션 그룹을 활성화한다:

```
Task files 예시:
  - core/entity/point/PointEntity.java
  - core/entity/point/PointTypeEntity.java
  - core/service/point/PointService.java
  - fo/domains/point/controller/PointController.java

→ 활성화되는 그룹:
  - backend-entity (ENT-001~007)
  - backend-service (SVC-001~003)
  - backend-api (API-001~005)
  - backend-common (CMN-001~004) ← 모든 Java 파일에 공통
```

### 3. 개별 스킬 실행

활성화된 그룹의 각 스킬에 대해:

1. 해당 스킬의 `SKILL.md`를 읽는다 (progressive disclosure)
2. 검증 규칙에 따라 대상 파일을 검사한다
3. PASS/FAIL + 증거를 수집한다
4. `priority: critical` + `auto_fix: true`인 FAIL 항목은 자동 수정을 시도한다
5. 자동 수정 후 해당 항목만 재검증한다

### 4. 증거 기록

모든 스킬 실행 결과를 모아 증거를 기록한다:

```bash
bash scripts/record-convention-evidence.sh \
  --run-dir "${RUN_DIR}" \
  --task-id "${TASK_ID}" \
  --results '{ "checks": [...], "summary": { "total": 34, "pass": 32, "fail": 2, "pass_rate": 0.941 } }'
```

증거 파일: `evidence/execute/task-{id}/convention-check.json`

### 5. 결과 보고

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
