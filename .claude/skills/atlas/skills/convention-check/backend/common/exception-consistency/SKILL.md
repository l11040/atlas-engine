---
name: exception-consistency
description: >
  도메인 계층 전체에서 예외 타입이 일관되게 사용되는지 검증한다.
  엔티티와 서비스 모두 DomainException을 사용해야 하며, IllegalStateException 등 Java 기본 예외를 혼용하지 않는다.
  Use this skill when: Service/Entity 클래스가 생성되거나 수정될 때.
---

# exception-consistency — 예외 타입 일관성 검증

## 검증 대상
`*Service.java` 파일 + `@Entity` 어노테이션이 있는 모든 `.java` 파일

**주의**: Entity 접미사(`*Entity.java`)에 의존하지 않는다. `@Entity` 어노테이션으로 엔티티를 식별한다.

## 검증 규칙

1. 도메인 로직의 예외는 **프로젝트 DomainException** (또는 BaseException) 사용
2. `IllegalStateException`, `IllegalArgumentException` 등 Java 기본 예외 금지
3. 엔티티 도메인 메서드(상태 전이 guard 등)에서도 DomainException 사용
4. catch 블록에서 기본 예외를 DomainException으로 래핑해야 함

## 검증 방법

```java
// PASS — DomainException 일관 사용
public void mature() {
    if (this.grantStatus != GrantStatus.PENDING) {
        throw new DomainException(DomainBaseResponseStatus.INVALID_GRANT_STATUS);
    }
    this.grantStatus = GrantStatus.AVAILABLE;
}

// FAIL — IllegalStateException 사용 (혼용)
public void mature() {
    if (this.grantStatus != GrantStatus.PENDING) {
        throw new IllegalStateException("Grant is not PENDING");  // FAIL
    }
}

// FAIL — 서비스는 DomainException, 엔티티는 IllegalState (혼용)
// Service: throw new DomainException(...)
// Entity:  throw new IllegalStateException(...)
```

## 자동 수정

1. `IllegalStateException` → `DomainException` 변환
2. 메시지 문자열 → ResponseStatus enum 매핑 필요 (수동 판단)

## 추가 검증: 에러코드 존재 확인

DomainException에 전달하는 ResponseStatus enum에 필요한 에러코드가 존재하는지도 확인한다:

```java
// PASS — 에러코드가 enum에 존재
throw new DomainException(DomainBaseResponseStatus.GRANT_NOT_FOUND);
// DomainBaseResponseStatus에 GRANT_NOT_FOUND가 정의되어 있음

// WARN — 에러코드 부재 (컴파일 에러이므로 높은 우선순위)
throw new DomainException(DomainBaseResponseStatus.POINT_LIMIT_EXCEEDED);
// DomainBaseResponseStatus에 POINT_LIMIT_EXCEEDED가 없음
```

## Gotchas

- 프로젝트마다 예외 클래스명이 다름 (DomainException, BaseException, BusinessException 등). conventions.json 참조
- 엔티티에서 DomainException을 쓰려면 core 모듈에 해당 클래스가 있어야 함
- v0.4.0/v0.4.2에서 달성, v0.4.3에서 엔티티만 IllegalState로 퇴행한 반복 패턴
- `@Entity` 어노테이션으로 엔티티를 식별해야 함 — `*Entity.java` 파일명 패턴에 의존하면 접미사 미사용 프로젝트에서 검증 누락 발생

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
