---
name: file-location
description: >
  Service 파일이 core/service/{도메인}/ 하위에 위치하는지 검증한다.
  Service는 core 모듈에서 공유되므로 fo/bo/api 등 개별 모듈에 위치하면 안 된다.
  Use this skill when: Service 클래스(*Service.java)가 생성될 때.
---

# file-location (service) — Service 파일 위치 검증

## 검증 대상
`*Service.java` 파일

## 검증 규칙

1. 경로가 `core/service/{도메인}/` 또는 `core/src/main/java/.../core/service/` 패턴
2. **fo, bo, api, admin, vendor, batch** 모듈에 비즈니스 Service가 있으면 FAIL
3. 이유: core에 있어야 FO/BO 양쪽에서 재사용 가능. FO 전용은 BO 확장 시 서비스 중복 발생

## 검증 방법

```
// PASS — core 모듈
core/src/main/java/.../core/service/point/PointEarnService.java

// FAIL — FO 모듈 (BO에서 재사용 불가)
fo/src/main/java/.../fo/domains/point/service/PointEarnService.java

// FAIL — BO 모듈
bo/src/main/java/.../bo/service/PointService.java
```

## 자동 수정

경고만 출력. 모듈 간 파일 이동은 빌드 설정 변경이 필요하므로 수동 판단.

## Gotchas

- v0.4.1/v0.4.2에서 core로 이동했으나 v0.4.3에서 FO로 퇴행한 반복 패턴
- Batch Job의 Tasklet/Service는 batch 모듈에 있어도 됨 (비즈니스 로직은 core Service 호출)
- Controller → core Service → Repository 구조가 표준

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
