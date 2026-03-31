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

// PASS — 여러 구체적 예외 + noSkip으로 치명적 예외 보호
.<Grant, Grant>chunk(100)
    .faultTolerant()
    .skip(OptimisticLockingFailureException.class)
    .skip(DataIntegrityViolationException.class)
    .skipLimit(100)
    .noSkip(NullPointerException.class)

// FAIL — 무제한 skip + 범용 예외
.<Grant, Grant>chunk(100)
    .faultTolerant()
    .skip(Exception.class)
    .skipLimit(Integer.MAX_VALUE)
```

### 구체적 대안 예시 (AI가 "그러면 뭘 써야 하지?"에서 막히지 않도록)

| 배치 유형 | skip 대상 예외 | skipLimit | 이유 |
|-----------|---------------|-----------|------|
| 상태 전이 (활성화, 만료) | `OptimisticLockingFailureException` | 100 | 동시 수정은 재시도로 해결 |
| 외부 API 연동 | `FeignException`, `RestClientException` | 50 | 일시적 네트워크 오류 허용 |
| 데이터 정합성 보정 | `DataIntegrityViolationException` | 200 | UK 충돌 등 스킵 가능 |
| 알림 발송 | `MessagingException` | Integer.MAX_VALUE (허용) | 알림 실패는 치명적이지 않음 |

```java
// BAD — 이렇게 쓰지 마라
.skip(Exception.class).skipLimit(Integer.MAX_VALUE)

// GOOD — 도메인에 맞는 구체적 예외 + 합리적 상한
.skip(OptimisticLockingFailureException.class)
.skip(DataIntegrityViolationException.class)
.skipLimit(100)
.noSkip(NullPointerException.class)
.noSkip(ClassCastException.class)
```

## 자동 수정

경고만 출력. skipLimit 값과 예외 타입은 비즈니스 판단 필요.

## Gotchas

- `skipLimit(Integer.MAX_VALUE)`는 모든 에러를 무시하므로 데이터 유실 위험
- 배치 처리 중 예외를 삼키면 Slack 알림도 의미가 없어짐
- `noSkip()`으로 절대 건너뛰면 안 되는 예외를 명시하는 것도 좋은 패턴
- v0.4.x에서 5버전 연속 `skip(Exception.class).skipLimit(Integer.MAX_VALUE)` 위반 — 위 대안 예시를 참고

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
