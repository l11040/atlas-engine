---
name: caffeine-only
description: >
  캐시 사용 시 Caffeine 로컬 캐시만 사용하는지 검증한다.
  @Cacheable, CacheManager 등 캐시 코드가 Caffeine 기반인지 확인.
  Use this skill when: 캐시 관련 코드(@Cacheable, CacheManager)가 추가될 때.
---

# caffeine-only — Caffeine 캐시 전용 검증

## 검증 대상
캐시 관련 코드가 포함된 `*.java` 파일

## 검증 규칙

1. `@Cacheable`, `@CacheEvict`, `@CachePut` 사용 시 CacheManager가 `CaffeineCacheManager`
2. `EhCache`, `Hazelcast`, `Infinispan` 등 다른 캐시 구현체 금지
3. 캐시 설정에 TTL, maximumSize 등 적절한 eviction 정책 설정

## 검증 방법

```java
// PASS
@Cacheable(value = "points", key = "#id")
public PointDetailResponse getPoint(Long id) { }

// CacheConfig에 CaffeineCacheManager 사용 확인

// FAIL — EhCache 사용
@Bean
public CacheManager cacheManager() {
    return new EhCacheCacheManager(...);
}
```

## 자동 수정

경고만 출력. 캐시 구현체 변경은 영향 범위가 넓어 수동 처리.

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
