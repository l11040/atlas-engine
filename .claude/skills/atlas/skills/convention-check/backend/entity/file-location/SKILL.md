---
name: file-location
description: >
  JPA 엔티티 파일이 core/entity/{도메인}/ 하위에 위치하는지 검증한다.
  멀티모듈 구조에서 엔티티는 core 모듈에만 존재해야 한다.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성될 때.
---

# file-location (entity) — 엔티티 파일 위치 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. 파일 경로가 `core/entity/{도메인}/` 패턴에 맞아야 한다
2. 클래스명이 `{Name}Entity` 접미사를 가져야 한다
3. api, admin, vendor, batch 모듈에 엔티티가 위치하면 FAIL

## 검증 방법

```
// PASS
core/src/main/java/.../core/entity/point/PointEntity.java
core/src/main/java/.../core/entity/order/OrderEntity.java

// FAIL — 잘못된 모듈
api/src/main/java/.../api/entity/PointEntity.java

// FAIL — 접미사 누락
core/src/main/java/.../core/entity/point/Point.java
```

## 자동 수정

파일 이동은 위험하므로 **경고만** 출력. 수동 이동 안내.

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
