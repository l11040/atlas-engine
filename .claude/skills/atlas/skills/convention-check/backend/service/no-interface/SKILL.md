---
name: no-interface
description: >
  Service가 불필요한 인터페이스 없이 구현체만 존재하는지 검증한다.
  구현체가 하나뿐인 인터페이스는 불필요한 추상화이며 코드 복잡성만 증가시킨다.
  Use this skill when: Service 클래스(*Service.java)가 생성될 때.
---

# no-interface — 불필요한 인터페이스 검증

## 검증 대상
`*Service.java` 파일

## 검증 규칙

1. Service 클래스가 인터페이스를 `implements` 하지 않아야 한다
2. 같은 패키지에 `{Name}Service` 인터페이스 + `{Name}ServiceImpl` 구현체 패턴이 없어야 한다
3. 예외: 외부 라이브러리 인터페이스(UserDetailsService 등)는 허용

## 검증 방법

```java
// PASS — 직접 구현체
@Service
public class PointService {
    public void earnPoints(...) { }
}

// FAIL — 불필요한 인터페이스
public interface PointService { void earnPoints(...); }

@Service
public class PointServiceImpl implements PointService {
    public void earnPoints(...) { }
}
```

## 자동 수정

경고만 출력. 인터페이스 제거는 영향 범위가 넓어 수동 처리.

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
