# 프로젝트 고유 컨벤션

이 디렉토리에 프로젝트별 고유 컨벤션 스킬을 추가한다.

## 추가 방법

1. 컨벤션명으로 폴더 생성: `project/{convention-name}/SKILL.md`
2. SKILL.md에 frontmatter + 검증 규칙 작성 (다른 스킬 참고)
3. `../convention-registry.yaml`에 등록

## 예시

```
project/
├── custom-error-code/SKILL.md     # 프로젝트 고유 에러 코드 체계
├── tenant-isolation/SKILL.md      # 멀티테넌트 격리 검증
└── audit-log-required/SKILL.md    # 특정 API에 감사 로그 필수
```

## 네이밍 규칙

- ID 접두사: `PRJ-NNN` (PRJ-001, PRJ-002, ...)
- 카테고리: `project`
