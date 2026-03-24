---
name: controller-location
description: >
  Controller 파일이 {module}/domains/{도메인}/controller/ 하위에 위치하는지 검증한다.
  멀티모듈 구조에서 Controller는 api/admin/vendor 등 각 모듈의 domains 하위에 존재해야 한다.
  Use this skill when: Controller 클래스(*Controller.java)가 생성될 때.
---

# controller-location — Controller 파일 위치 검증

## 검증 대상
`*Controller.java` 파일

## 검증 규칙

1. 경로가 `{module}/domains/{도메인}/controller/` 패턴
2. 모듈: api(FO), admin(BO), vendor(입점사) 중 하나
3. Controller가 core 모듈에 있으면 FAIL

## 검증 방법

```
// PASS
fo/src/main/java/.../fo/domains/point/controller/PointController.java
admin/src/main/java/.../admin/domains/point/controller/PointAdminController.java

// FAIL — core 모듈에 Controller
core/src/main/java/.../core/controller/PointController.java
```

## 자동 수정

경고만 출력.

## 증거 포맷

```json
{
  "id": "API-005",
  "category": "backend/api",
  "rule": "Controller 파일 위치",
  "status": "PASS|FAIL",
  "evidence": "{module}/domains/{도메인}/controller/ 확인|잘못된 위치"
}
```
