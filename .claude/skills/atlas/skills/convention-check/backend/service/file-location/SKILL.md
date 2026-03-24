---
name: file-location
description: >
  Service 파일이 core/service/{도메인}/ 하위에 위치하는지 검증한다.
  Service는 core 모듈에서 공유되므로 api/admin 등 개별 모듈에 위치하면 안 된다.
  Use this skill when: Service 클래스(*Service.java)가 생성될 때.
---

# file-location (service) — Service 파일 위치 검증

## 검증 대상
`*Service.java` 파일

## 검증 규칙

1. 경로가 `core/service/{도메인}/` 패턴
2. api, admin, vendor 모듈에 Service가 있으면 FAIL

## 검증 방법

```
// PASS
core/src/main/java/.../core/service/point/PointService.java

// FAIL
api/src/main/java/.../api/service/PointService.java
```

## 자동 수정

경고만 출력.

## 증거 포맷

```json
{
  "id": "SVC-003",
  "category": "backend/service",
  "rule": "Service 파일 위치",
  "status": "PASS|FAIL",
  "evidence": "core/service/{도메인}/ 확인|잘못된 위치"
}
```
