---
name: no-redis
description: >
  프로젝트에서 Redis 사용을 금지한다. Redis 관련 import, 의존성, 설정이 없는지 검증한다.
  프로젝트 절대 규칙: 캐시는 Caffeine 로컬 캐시만 허용.
  Use this skill when: 모든 Java 파일이 생성되거나 수정될 때. 캐시 관련 코드가 포함될 때.
---

# no-redis — Redis 사용 금지 검증

## 검증 대상
모든 `*.java` 파일, `build.gradle`, `application.yml`

## 검증 규칙 (절대 규칙 — 예외 없음)

1. Redis 관련 import 금지: `RedisTemplate`, `StringRedisTemplate`, `Jedis`, `Lettuce`, `RedisConnection`
2. Redis 관련 의존성 금지: `spring-boot-starter-data-redis`, `jedis`, `lettuce-core`
3. Redis 관련 설정 금지: `spring.redis.*`, `spring.data.redis.*`
4. `@EnableCaching` + `RedisCacheManager` 조합 금지

## 검증 방법

```java
// PASS — Caffeine 사용
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public CacheManager cacheManager() {
        return new CaffeineCacheManager("points");
    }
}

// FAIL — Redis 사용
import org.springframework.data.redis.core.RedisTemplate;
@Autowired private RedisTemplate<String, String> redisTemplate;
```

## 자동 수정

1. Redis import 제거
2. Caffeine 대체 코드 안내 출력
3. build.gradle에서 Redis 의존성 제거

## Gotchas

- 이 규칙은 프로젝트 절대 규칙이다. 어떤 경우에도 예외 없음
- Caffeine은 로컬 캐시이므로 멀티 인스턴스 환경에서 캐시 정합성 제약이 있다
- 세션 스토어도 Redis 대신 DB 또는 JWT 기반 사용

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
