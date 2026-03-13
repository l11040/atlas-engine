# BE 레드팀 체크리스트

레이어별 병렬 에이전트가 사용하는 검토 기준.

## 레이어 구성

| 레이어 | 에이전트 이름 | 검토 대상 |
|--------|-------------|----------|
| `domain` | Review {scope} entities | Entity, Enum, 연관관계 |
| `schema` | Review {scope} schema | Migration SQL |
| `repository` | Review {scope} repositories | Repository, QueryDsl |
| `service` | Review {scope} services | Service, Controller, DTO |
| `batch` | Review {scope} batch | Config, Processor, Scheduler |

## domain

- [ ] Entity 필드가 AC 요구사항을 모두 충족하는가
- [ ] 연관관계 매핑이 올바른가 (ManyToOne/OneToMany, cascade, orphanRemoval)
- [ ] Enum 값이 도메인 요구사항을 빠짐없이 반영하는가
- [ ] BaseEntity 상속, soft-delete 패턴 준수
- [ ] 비즈니스 메서드가 도메인 로직을 캡슐화하는가

## schema

- [ ] 모든 FK가 정의되었는가
- [ ] NOT NULL 제약이 적절한가
- [ ] 인덱스가 쿼리 패턴에 맞게 설정되었는가
- [ ] 컬럼 타입/길이가 적절한가 (varchar 길이, decimal 정밀도)
- [ ] 네이밍이 conventions를 따르는가

## repository

- [ ] JPQL/QueryDsl 쿼리가 정확한가
- [ ] N+1 문제 방지 (fetch join, @EntityGraph)
- [ ] 페이징 쿼리 최적화 (count 쿼리 분리)
- [ ] 커스텀 메서드 시그니처가 서비스 요구에 맞는가

## service

- [ ] @Transactional 경계가 적절한가 (readOnly 분리)
- [ ] 입력 검증이 충분한가
- [ ] DTO ↔ Entity 변환이 올바른가
- [ ] 에러 코드/메시지가 적절한가

## batch

- [ ] chunk size가 적절한가
- [ ] reader/processor/writer 체인이 올바른가
- [ ] 재시작 시 중복 처리 방지
- [ ] 스케줄러 cron 표현식 검증
