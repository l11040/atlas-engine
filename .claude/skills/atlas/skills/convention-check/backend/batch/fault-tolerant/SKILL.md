---
name: fault-tolerant
description: >
  Spring Batch의 faultTolerant 설정에서 skipLimit이 적절한 값인지, skip 대상 예외가 구체적인지 검증한다.
  무제한 skip은 데이터 유실을 감지할 수 없다.
  Use this skill when: Spring Batch Step 정의가 생성될 때.
---

# fault-tolerant — Batch faultTolerant 설정 검증

## 검증 대상
`*Config.java` (Spring Batch Step 정의)

## 검증 규칙

1. `skipLimit(Integer.MAX_VALUE)` 금지 — 적절한 상한값 필수 (예: 100, 1000)
2. `skip(Exception.class)` 금지 — 구체적 예외 클래스 지정 (예: `skip(DataIntegrityViolationException.class)`)
3. `retryLimit`과 `retry()` 설정 시에도 구체적 예외 지정
4. `skipPolicy` 사용 시 로그 기록 필수

## 검증 방법

```java
// PASS — 구체적 예외 + 적절한 상한
.<Grant, Grant>chunk(100)
    .faultTolerant()
    .skip(DataIntegrityViolationException.class)
    .skipLimit(100)

// FAIL — 무제한 skip + 범용 예외
.<Grant, Grant>chunk(100)
    .faultTolerant()
    .skip(Exception.class)
    .skipLimit(Integer.MAX_VALUE)
```

## 자동 수정

경고만 출력. skipLimit 값과 예외 타입은 비즈니스 판단 필요.

## Gotchas

- `skipLimit(Integer.MAX_VALUE)`는 모든 에러를 무시하므로 데이터 유실 위험
- 배치 처리 중 예외를 삼키면 Slack 알림도 의미가 없어짐
- `noSkip()`으로 절대 건너뛰면 안 되는 예외를 명시하는 것도 좋은 패턴

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
