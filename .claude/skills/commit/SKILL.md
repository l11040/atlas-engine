# 커밋 메시지 작성 스킬

변경 사항을 분석하여 컨벤션에 맞는 커밋 메시지를 한글로 작성합니다.

## 실행 지침

### 1단계: 변경 사항 수집

다음 스크립트를 실행하여 스테이징된 변경 사항을 수집하세요:

```bash
python3 .claude/skills/commit/scripts/collect_commit_info.py
```

스크립트가 반환하는 JSON:

```json
{
  "staged_files": [{ "status": "modified", "path": "src/app/page.tsx" }],
  "file_count": 1,
  "categories": { "pages": ["src/app/page.tsx"] },
  "suggested_type": "feat",
  "issue_numbers": ["401"],
  "recent_commits": ["feat: 로그인 기능 추가", "fix: 버튼 클릭 오류 수정"],
  "diff": "...",
  "diff_truncated": false
}
```

**에러 발생 시**: 스테이징된 파일이 없으면 에러 메시지와 함께 힌트가 출력됩니다.

### 2단계: 커밋 타입 결정

스크립트의 `suggested_type`을 참고하되, diff 내용을 분석하여 최종 결정하세요:

| 타입       | 설명                         | 예시                                 |
| ---------- | ---------------------------- | ------------------------------------ |
| `feat`     | 새로운 기능 추가             | `feat: 사용자 로그인 기능 추가`      |
| `fix`      | 버그 수정                    | `fix: null 포인터 에러 해결`         |
| `docs`     | 문서 변경                    | `docs: API 문서 업데이트`            |
| `style`    | 코드 포맷팅 (동작 변경 없음) | `style: prettier로 코드 포맷팅`      |
| `refactor` | 리팩토링 (기능 변경 없음)    | `refactor: 헬퍼 함수 분리`           |
| `test`     | 테스트 추가/수정             | `test: 인증 유닛 테스트 추가`        |
| `chore`    | 빌드, 설정 등 기타           | `chore: 의존성 업데이트`             |
| `perf`     | 성능 개선                    | `perf: 데이터베이스 쿼리 최적화`     |
| `ci`       | CI/CD 설정 변경              | `ci: GitHub Actions 워크플로우 추가` |

### 3단계: 커밋 메시지 형식

```
<type>(<scope>): <타이틀>

<본문>
```

#### 규칙

1. **타입**: 위 표에서 선택 (필수, 영문)
2. **스코프**: `categories`의 주요 카테고리 참고 (선택, 예: `auth`, `api`, `ui`)
3. **타이틀**:
   - 50자 이내
   - **한글로 작성**
   - 명사형으로 끝내기 (추가, 수정, 개선 등)
   - 마침표 없음
4. **본문**:
   - 한 줄 띄우고 작성
   - **한글로 작성**
   - 변경 이유와 내용 설명

### 4단계: 이슈번호 처리

스크립트의 `issue_numbers` 배열에 값이 있으면 커밋 메시지 타이틀에 포함:

```
fix(app-bar): 스크롤 숨김 시 safe-area 영역 노출 문제 해결 #401

- AppBar가 스크롤로 숨겨질 때 노치 영역을 가리는 커버 추가
- bgColor prop 추가로 배경색 통합 관리
```

### 5단계: 커밋 메시지 제안

수집된 정보를 바탕으로:

1. 커밋 타이틀과 본문을 제안
2. 사용자 확인 요청
3. 확인 후 커밋 실행:

```bash
git commit -m "<title>" -m "<body>"
```

### 예시

**수집 결과**:

```json
{
  "suggested_type": "feat",
  "categories": { "api": ["src/api/auth.ts"] },
  "issue_numbers": []
}
```

**제안 메시지**:

```
feat(auth): 로그인 API 입력 유효성 검사 추가

- 이메일 형식 유효성 검사 추가
- 비밀번호 길이 검사 추가
- 적절한 에러 메시지 반환
```

### 주의사항

- 하나의 커밋에는 하나의 논리적 변경만 포함
- `file_count`가 많고 `categories`가 다양하면 커밋 분리 제안
- 민감한 정보(비밀번호, API 키 등)가 diff에 포함되지 않았는지 확인
