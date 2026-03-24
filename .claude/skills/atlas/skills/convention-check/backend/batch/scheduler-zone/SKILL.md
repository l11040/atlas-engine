---
name: scheduler-zone
description: >
  @Scheduled cron에 zone = "Asia/Seoul"이 명시되었는지 검증한다.
  zone 미지정 시 서버 timezone에 의존하여 배포 환경마다 다르게 동작할 수 있다.
  Use this skill when: Scheduler 클래스(*Scheduler.java)가 생성될 때.
---

# scheduler-zone — @Scheduled zone 검증

## 검증 대상
`*Scheduler.java` 파일

## 검증 규칙

1. `@Scheduled(cron = "...")` 사용 시 `zone` 속성 필수
2. zone 값은 `"Asia/Seoul"` (한국 서비스 기준)
3. fixedRate/fixedDelay는 zone 불필요 (밀리초 기반)

## 검증 방법

```java
// PASS
@Scheduled(cron = "0 0 0 * * *", zone = "Asia/Seoul")
public void activatePendingGrants() { ... }

// FAIL — zone 누락
@Scheduled(cron = "0 0 0 * * *")
public void activatePendingGrants() { ... }

// SKIP — cron 미사용
@Scheduled(fixedRate = 60000)
public void healthCheck() { ... }
```

## 자동 수정

1. `@Scheduled` 어노테이션에 `zone = "Asia/Seoul"` 추가

## Gotchas

- UTC 서버에서 zone 없이 `0 0 0 * * *` → UTC 자정 = KST 09:00 (의도와 다름)
- v0.4.0/v0.4.3에서 달성, v0.4.1/v0.4.2에서 퇴행한 진동 패턴 항목

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
