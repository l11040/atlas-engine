---
name: step-scope
description: >
  Spring Batch의 ItemReader/ItemProcessor/ItemWriter에 @StepScope가 적용되었는지 검증한다.
  @StepScope 없이는 JobParameter 주입이 불가하고 스레드 안전성이 보장되지 않는다.
  Use this skill when: Spring Batch Config 또는 Reader/Processor/Writer가 생성될 때.
---

# step-scope — @StepScope 적용 검증

## 검증 대상
`*Config.java` (Spring Batch Job/Step 정의), `*Reader.java`, `*Processor.java`, `*Writer.java`

## 검증 규칙

1. `@Bean`으로 등록하는 ItemReader/ItemProcessor/ItemWriter에 `@StepScope` 필수
2. `@StepScope` Bean은 `@Value("#{jobParameters['key']}")` 로 JobParameter 주입 가능
3. JobParameter로 날짜를 받으면 `LocalDateTime` 타입 + `@DateTimeFormat` 사용

## 검증 방법

```java
// PASS
@Bean
@StepScope
public JpaPagingItemReader<Grant> grantActivationReader(
        @Value("#{jobParameters['targetDate']}") LocalDateTime targetDate) {
    // ...
}

// FAIL — @StepScope 누락
@Bean
public JpaPagingItemReader<Grant> grantActivationReader() {
    // JobParameter 주입 불가, 매번 같은 쿼리 실행
}

// FAIL — String JobParameter (LocalDateTime 미사용)
@Value("#{jobParameters['targetDate']}") String targetDate
```

## 자동 수정

1. `@StepScope` 어노테이션 추가
2. `import org.springframework.batch.core.configuration.annotation.StepScope;` 추가

## Gotchas

- `@StepScope`는 프록시를 생성하므로 반환 타입이 구체 클래스여야 함 (인터페이스 X)
- `@StepScope` Bean은 Step 실행마다 새로 생성됨 — 상태를 가져도 안전
- 4개 버전 연속 미적용된 항목 — conventions.json에 명시해도 AI가 놓치는 대표적 패턴

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
