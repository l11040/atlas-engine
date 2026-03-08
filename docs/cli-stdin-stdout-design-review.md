# Codex/Claude stdin/stdout 설계 리뷰

## 0. 범위

이 문서는 현재 프로젝트의 CLI I/O 경로를 대상으로 합니다.

- 실시간 세션(UI 경로)
  - `apps/desktop/electron/ipc/register-cli-ipc.ts`
  - `apps/desktop/electron/services/providers/{claude,codex}/*`
- LangChain 경로(백그라운드 플로우)
  - `apps/desktop/electron/services/langchain/cli-llm.ts`
  - `apps/desktop/electron/services/langchain/index.ts`
- 공통 런타임 패키지(이번 변경)
  - `packages/cli-runtime/*`

## 1. 현재 최종 아키텍처

## 1-1. 실행 경로 A: Renderer → IPC → Provider

1. Renderer가 `runCli(request)` 호출
2. IPC가 provider(`claude`/`codex`)를 선택
3. Provider가 `startCliSession()` 호출
4. 런타임이 프로세스 spawn + stdout/stderr 파싱
5. 정규화 이벤트(`CliEvent`)를 onEvent로 emit
6. IPC가 해당 renderer webContents로 이벤트 전달
7. Renderer hook(`useCliSession`)이 상태/타임라인 갱신

## 1-2. 실행 경로 B: LangChain Graph → CliLlm

1. `CliLlm.invokeWithEvents()`가 `runCliToCompletion()` 호출
2. 공통 런타임이 완료까지 이벤트 수집
3. `text` 이벤트를 합쳐 LLM 문자열 응답 생성
4. 나머지 이벤트(`tool-use/result`, `stderr`, `failed`)는 terminal log 생성에 사용

## 1-3. stdin 정책

- 기본: argv 전달(`promptTransport=auto`)
- 장문 프롬프트: stdin 전달 자동 전환(`maxArgPromptLength` 초과 시)
- spawn stdio:
  - stdin payload가 있을 때만 `stdio[0] = "pipe"`
  - 그 외에는 `stdio[0] = "ignore"` 유지

## 1-4. stdout/stderr 정책

- `stdout`
  - Claude: `stream-json` line parser → normalizer
  - Codex: `jsonl` line parser → stateful normalizer
- `stderr`
  - 청크 단위 `stderr` 이벤트로 즉시 전달
  - 실패 시 누적 stderr가 에러 메시지 생성에 활용됨

## 2. 이번 변경으로 적용된 구조 개선

1. 공통 패키지 분리
- `@atlas/cli-runtime` 신설
- 명령행 생성, 파서, 정규화기, 세션 러너 통합

2. 중복 실행 로직 제거
- 기존 provider(claude/codex)별 spawn/timeout/flush/close 로직 중복 제거
- LangChain runner도 동일 코어 사용

3. 이벤트 일관성 강화
- LangChain 경로에서도 `stderr`, `failed/cancelled/completed` 이벤트를 동일 모델로 수집

4. 취소 처리 안전성 강화
- `register-cli-ipc`에서 cancel 요청 시 모든 provider를 순회하여 취소
- 기존: 첫 번째 provider에서 성공 시 조기 return (동일 requestId 다중 실행 시 누락 가능)

5. Codex 다중 파일 변경 추적 개선
- `file_change` 이벤트에서 `file_paths: string[]` 추가
- Renderer hook에서 다중 경로 분리 수집

6. 세션 전략 지원 추가
- 공통 런타임에 `conversation` 옵션 추가
- `new | continue-last | resume-id` 지원
- `ephemeral`(세션 비영속) 옵션 지원

7. 긴 프롬프트 stdin fallback
- `promptTransport=auto`에서 길이가 긴 프롬프트를 stdin으로 전달
- argv 길이 제한 리스크 완화

8. 파싱 오류 가시성 개선
- `parse-error` 이벤트를 정규화 이벤트 모델에 추가
- UI(세션 패널)와 terminal log에 경고/로그 반영

9. 종료 강건성 개선
- cancel/timeout 시 SIGTERM 후 `killGraceMs` 경과 시 SIGKILL fallback

10. 이벤트 모델 어댑터 도입
- runtime event → IPC event 변환 adapter 추가
- 직접 캐스팅 제거로 결합도 완화

## 3. 비판적 설계 검토 (잔여 리스크)

## 3-1. High

1. Claude 인증 상태 판별의 텍스트 의존성
- 파일 기반 휴리스틱은 제거했지만, 여전히 런타임 출력 문자열(`login`, `authentication`)에 의존하는 분기가 남아 있음
- 제안: Claude CLI가 공식 status/diagnostics 명령을 제공하면 해당 명령으로 교체

## 3-2. Medium

2. onEvent 콜백 예외 삼킴
- 런타임 안정성 확보를 위해 콜백 예외를 삼키고 진행
- 문제: 소비자 코드 버그가 조용히 숨겨질 수 있음
- 제안: strict 모드 옵션 도입(콜백 예외를 `failed` 또는 별도 채널로 보고)

3. parse-error 운영 표준화 부족
- `parse-error` 이벤트는 추가했지만, 메트릭/알람 규약은 아직 없음
- 제안: provider별 parse-error rate 대시보드/알람 임계치 정의

## 3-3. Low

4. 테스트 커버리지
- parser/normalizer/session-runner에 fixture 기반 단위 테스트가 아직 없음
- 제안: provider 샘플 로그(golden) 테스트 추가

## 4. 패키지화 평가

## 4-1. 현재 상태

- 패키지명: `@atlas/cli-runtime`
- 위치: `packages/cli-runtime`
- 포함 기능:
  - command builder
  - stream/jsonl parser
  - Claude/Codex normalizer
  - 세션 러너(start/run/stream)
  - 공통 타입 + 실행 에러
- Electron 의존성: 없음
- app 전용 타입 의존성: 없음

## 4-2. 재사용 가능성 판단

- 다른 Node 프로젝트에 이식 가능: 높음
- 브라우저 단독 실행 가능: 낮음 (child_process 의존)
- 확장성: 중간 이상
  - 신규 provider 추가 시 `command + parser + normalizer` 플러그인화가 필요

## 4-3. 패키지화에서 남은 TODO

1. 버전 정책/변경 로그 도입
2. provider별 fixture 기반 테스트 추가
3. parse-error/metrics 인터페이스 표준화
4. 문서화된 semver API 표면 고정

## 5. 결론

이번 변경으로 `stdin/stdout` 처리 핵심 로직은 실질적으로 공통 패키지로 분리되어 중복과 드리프트 리스크가 크게 감소했습니다.

현재 남은 핵심 과제는 다음 두 가지입니다.
- Claude 인증 상태 판별의 공식 status 기반 전환
- parser/normalizer/session-runner 테스트 자동화

위 2개를 마무리하면, 다른 프로젝트로 이식 가능한 운영 등급 패키지에 더 가깝습니다.
