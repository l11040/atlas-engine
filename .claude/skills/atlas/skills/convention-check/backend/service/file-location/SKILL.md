---
name: file-location
description: >
  Service 파일이 프로젝트의 서비스 배치 전략에 맞는 위치에 있는지 검증한다. (적응형)
  멀티모듈 프로젝트에서 core 강제 vs 모듈별 배치 허용 등 전략이 다르다.
  기존 서비스 파일 배치를 스캔하여 프로젝트의 실제 전략을 감지한 뒤 검증한다.
  Use this skill when: Service 클래스(*Service.java)가 생성될 때.
---

# file-location (service) — Service 파일 위치 검증 (적응형)

## 검증 대상
`*Service.java` 파일

## 배치 전략 감지 (실행 전 필수)

```
1. 기존 *Service.java 파일의 모듈별 분포를 확인한다
2. 배치 전략 판정:
   a. 90% 이상이 core 모듈 → core 강제 전략
   b. fo/bo/api 등 개별 모듈에도 Service가 분산 → 모듈별 배치 전략
   c. core + 개별 모듈 혼용 → 재사용 범위 기반 전략
3. 감지된 전략으로 검증 실행
```

## 검증 규칙

### 전략 A: core 강제

1. 경로가 `core/service/{도메인}/` 패턴이어야 한다
2. fo, bo, api 등 개별 모듈에 비즈니스 Service가 있으면 FAIL

### 전략 B: 모듈별 배치 허용

1. 각 모듈 내 적절한 위치에 있으면 PASS:
   - FO 전용: `fo/domains/{domain}/` (PASS)
   - BO 전용: `bo/domains/{domain}/` (PASS)
   - 공통: `core/service/{domain}/` (PASS)
   - Batch: `batch/domain/{domain}/` (PASS)
2. 모듈별 배치 기준은 **재사용 범위**:
   - FO+BO 양쪽에서 사용 → core에 있어야 함 (다른 모듈에 있으면 WARN)
   - 한쪽에서만 사용 → 해당 모듈에 있어도 PASS
3. core에 있으면서 한쪽에서만 사용 → WARN (과잉 공유)

## 검증 방법

```
// 전략 B — 모듈별 배치 허용

// PASS — BO 전용 서비스가 BO 모듈에 위치
bo/src/main/java/.../bo/domains/point/GrantService.java

// PASS — 공통 서비스가 core에 위치
core/src/main/java/.../core/service/point/PointService.java

// PASS — Batch 서비스가 batch 모듈에 위치
batch/src/main/java/.../batch/domain/point/processor/GrantActivationProcessor.java

// WARN — core에 있지만 BO에서만 호출 (과잉 공유)
core/src/main/java/.../core/service/admin/AdminOnlyService.java
```

## 자동 수정

경고만 출력. 모듈 간 파일 이동은 빌드 설정 변경이 필요하므로 수동 판단.

## Gotchas

- Batch Job의 Processor/Tasklet은 batch 모듈에 있어도 됨
- Controller에서 직접 비즈니스 로직을 구현하면 어떤 전략이든 FAIL
- 감지 불가 시 WARN으로 처리하고 스킵

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
