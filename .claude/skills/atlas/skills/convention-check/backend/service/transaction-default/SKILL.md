---
name: transaction-default
description: >
  Service 클래스의 트랜잭션 설정을 검증한다. 기본 readOnly=true, CUD 메서드만 @Transactional.
  잘못된 트랜잭션 설정은 성능 저하나 데이터 불일치를 유발한다.
  Use this skill when: Service 클래스(*Service.java)가 생성되거나 수정될 때.
---

# transaction-default — 트랜잭션 기본값 검증

## 검증 대상
`*Service.java` 파일

## 검증 규칙

1. 클래스 레벨에 `@Transactional(readOnly = true)` 존재
2. CUD 메서드(create, update, delete, save, register 등)에 `@Transactional` (readOnly 없음) 존재
3. 읽기 전용 메서드에 `@Transactional` (readOnly=false)가 붙어있으면 FAIL

## 검증 방법

```java
// PASS
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PointService {

    public PointDetailResponse getPoint(Long id) { }  // 클래스 레벨 readOnly 상속

    @Transactional  // CUD는 readOnly 오버라이드
    public void earnPoints(EarnPointsRequest request) { }
}

// FAIL — 클래스 레벨 @Transactional 누락
@Service
public class PointService {
    @Transactional
    public PointDetailResponse getPoint(Long id) { }  // 읽기인데 readOnly 아님
}
```

## 자동 수정

1. 클래스에 `@Transactional(readOnly = true)` 추가
2. CUD 메서드에 `@Transactional` 추가
3. import: `org.springframework.transaction.annotation.Transactional`

## Gotchas

- 클래스 레벨 `readOnly = true`가 있으면 개별 읽기 메서드에 어노테이션 불필요
- `@Transactional`만 쓰면 readOnly=false가 기본값 → CUD에 적합

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
