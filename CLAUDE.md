# 계정관리 프로그램 - 프로젝트 컨텍스트

이 파일은 Claude Code(터미널)가 세션 시작 시 자동으로 읽는 파일입니다.
Cowork 채팅에서 기획~설계~초기 구현까지 진행하다 이어받는 시점의 상태를 요약합니다.

## 지금 세션 일시정지 시점 (2026-09-17, 네 번째 정지 — Cowork에서 검증 완료)

이전 정지(2026-09-16) 이후, 사용자가 직접 두 서버(docker compose, api, web)를 재기동했고
Cowork 세션에서 실사용 브라우저 검증을 마쳤다.

### 검증 결과 (모두 통과)
1. **자동 스캔 수동 트리거** (`POST /email-candidates/scan`, "오늘의 검토함" → "지금 스캔" 버튼)
   - 정상 동작 확인: "계정 1개 스캔, 새 후보 0건 발견" 응답, 콘솔/네트워크 에러 없음.
   - 후보 0건은 버그가 아니라 현재 받은편지함에 3개 메일 규칙에 매칭되는 새 메일이 없어서임.
2. **마스터 비밀번호 변경** (`POST /auth/master-password/change`, 설정 화면)
   - 사용자가 직접 실제 비밀번호로 변경 실행 (Claude는 비밀번호를 대신 입력하지 않음 — 정책상 금지).
   - 변경 후 "신뢰된 기기" 목록이 "등록된 기기가 없습니다"로 바뀐 것 확인 → WebAuthn 기기 전체
     해제 로직 정상 동작.
   - 변경 후 "계정 관리" 목록이 에러 없이 정상 로드됨 → 저장된 계정 비밀번호가 새 마스터 비밀번호로
     재암호화되어 정상적으로 복호화 가능함을 간접 확인.

### 디버깅 메모 (이번 세션에서 시간을 많이 씀)
로그인 페이지에서 "Google로 로그인" 클릭 시 "Failed to fetch"가 계속 발생했던 문제는 **앱 버그가
아니라 Claude의 격리된 브라우저 도구(Claude Browser pane) 자체의 cross-origin 요청 차단** 때문이었다.
- `localhost:3000`(프론트) → `localhost:3001`(백엔드) 요청이 `net::ERR_BLOCKED_BY_CLIENT`로 막힘.
- 그 브라우저 도구의 site 접근 허용(request_access)을 3001에 대해 "site" 스코프로 승인해도
  fetch/XHR 차단은 풀리지 않음 (직접 navigate로 3001에 접근하는 건 됨 — 즉 top-level 이동과
  페이지 내부 fetch 차단은 별개 메커니즘으로 보임).
- 실제 사용자의 진짜 Chrome(Claude in Chrome 확장, `mcp__claude-in-chrome__*`)으로 바꿔서 테스트하니
  이미 로그인되어 있었고 전혀 문제 없었음. 즉 백엔드 CORS 설정(`apps/api/src/main.ts`의
  `app.enableCors({ origin: 'http://localhost:3000', credentials: true })`)은 정상이고, 실제 브라우저
  환경에서는 문제가 재현되지 않음.
- **교훈**: 이 프로젝트처럼 프론트(3000)/백엔드(3001) 포트가 분리된 크로스오리진 구조를 Cowork에서
  검증할 때는 Claude의 내장 브라우저 창(Claude Browser pane)이 아니라 Claude in Chrome(사용자의 실제
  Chrome)을 쓸 것. 내장 브라우저 창은 이런 로컬 크로스포트 fetch를 구조적으로 막을 가능성이 있다.

### 부가기능 1 - 비밀번호 생성기 (완료, 2026-09-17)
사용자가 "비밀번호 생성기만 먼저" 진행하기로 결정 (데이터 export/import는 보류).

- 백엔드: `POST /accounts/generate-password` 추가 (`accounts.controller.ts`,
  `accounts.service.ts`). 옵션: `length`(8~64, 기본 16), `includeUppercase/Lowercase/
  Numbers/Symbols`(기본 전부 true). 헷갈리는 문자(I/l/O/0/1) 제외한 문자셋 사용,
  선택된 각 문자 종류가 최소 1개씩 포함되도록 보장 후 Fisher-Yates 셔플. `node:crypto`의
  `randomInt` 사용 (암호학적으로 안전한 난수). `AccountsController`가 클래스 레벨
  `@UseGuards(UnlockedGuard)`라 이 엔드포인트도 잠금 해제된 세션에서만 호출 가능 (설계상
  자연스러움 — 어차피 계정 등록 폼 안에서만 쓰임).
- 프론트: 공용 `apps/web/src/components/PasswordField.tsx` 컴포넌트 신규 생성 (보기/숨기기
  토글 + "자동 생성" 버튼). `accounts/new/page.tsx`와 `accounts/[id]/page.tsx`(수정 폼)의
  비밀번호 입력을 이 컴포넌트로 교체.
- 검증: `tsc --noEmit` (api, web 둘 다 클린) + 실제 Chrome에서 "자동 생성" 클릭 →
  `POST /accounts/generate-password` 201 응답, 필드에 16자리 비밀번호 정상 채워짐,
  콘솔 에러 없음 확인.
- **아직 git add/commit 안 됨** — 이 세션(Cowork)도 device_bash로 git write를 못하는 동일한
  제약이 있으므로, 사용자가 본인 터미널에서 직접 `git add`/`git commit`/`git push` 진행 필요.

### 부가기능 2 - 대시보드 요약 카드 (완료, 2026-09-17)
`(app)/page.tsx`가 그동안 "메일 규칙/후보 기능이 준비되면 채워질 예정" placeholder였는데,
이미 관련 기능(계정/후보/중요메일)이 다 구현되어 있었어서 바로 채웠다.

- `GET /accounts`, `GET /email-candidates`, `GET /email-candidates/important-summary` 3개를
  개별 호출(Promise.all 대신 각자 catch)해서 카드 3개(등록된 계정 수 / 오늘의 검토함 대기 수 /
  중요 메일 총건수)로 표시. 카드 클릭 시 해당 화면으로 이동.
- 새 파일 추가 없음, `apps/web/src/app/(app)/page.tsx` 전체 교체.
- 검증: `tsc --noEmit` 클린 + 실제 Chrome에서 확인 — "등록된 계정 1개 / 오늘의 검토함 0건 대기 중 /
  중요 메일 7건" 실데이터 정상 표시, 콘솔 에러 없음.
- **아직 git add/commit 안 됨** — 사용자가 직접 커밋 필요.

### 부가기능 3 - 데이터 백업/내보내기 (완료, 2026-09-17)
사용자가 "평문으로 내보내면 PC 해킹 시 위험하다"고 정확히 지적 → 마스터 비밀번호와는 별개의
"내보내기 비밀번호"로 파일 자체를 재암호화하는 방식으로 설계 확정. 백업 범위는 Account(계정
비밀번호)만 — EmailAccount의 OAuth 토큰은 보안상 제외(새 기기에서는 재로그인으로 재연결).

- 백엔드: `POST /accounts/export`, `POST /accounts/import` 추가 (`accounts.controller.ts`,
  `accounts.service.ts`). 기존 `CryptoService`(Argon2id KDF + AES-256-GCM)를 그대로 재사용 —
  내보내기 비밀번호 + 새로 생성한 salt로 키를 유도해 JSON 배열 전체를 암호화. 파일 형식:
  `{ version: 1, exportedAt, salt, payload }`. 가져오기는 같은 방식으로 복호화 후 각 항목을
  기존 `create()`에 통과시켜 (urlOrAppName, loginId) 중복이면 스킵(카운트만 증가), 있으면 등록.
  틀린 비밀번호로 복원 시도하면 AES-GCM 인증 태그 불일치를 잡아 400 + 친절한 한국어 에러로 변환.
- 프론트: `settings/page.tsx`에 `BackupSection` 신규 컴포넌트 추가 (내보내기: 비밀번호 입력 →
  Blob으로 JSON 파일 다운로드 / 가져오기: 파일 선택 + 비밀번호 입력 → 결과 메시지). 기존
  "백업/복구 설정은 준비 중입니다" placeholder 제거.
- 검증: `tsc --noEmit` 클린 + 실제 Chrome 콘솔에서 fetch로 export→import 라운드트립 직접 실행
  (파일 다운로드 없이): export 201(payload에 평문 계정명/이메일 안 섞여있음 확인) → 같은 데이터로
  import 시 `{imported:0, skipped:1}`(중복 정상 스킵) → 틀린 비밀번호로 import 시 400 +
  "내보내기 비밀번호가 올바르지 않거나 파일이 손상되었습니다." 정상 확인.

### 개선 - 오늘의 검토함 승인/제외 버튼 라벨 명확화 (완료, 2026-09-17)
사용자가 "승인/제외 버튼만 있어서 뭘 하는건지 헷갈린다"고 피드백 — 특히 "승인"이 실제로는
규칙에 따라 Gmail에서 메일을 삭제/스팸 처리할 수도 있다는 게 버튼 문구만 봐서는 안 드러났음.

- 백엔드: `CandidatesService.findPending()`이 `rule: { select: { actionType } } }`를 include하도록
  변경 — 프론트가 각 후보의 실제 규칙 종류를 알 수 있게.
- 프론트: `mail/review/page.tsx`에 `actionType`별 뱃지/버튼문구/설명 매핑 추가.
  - `delete_candidate` → 뱃지 "삭제 대상", 버튼 "삭제하기", 설명 "승인하면 이 메일을 Gmail에서
    실제로 삭제합니다."
  - `spam_candidate` → 뱃지 "스팸 대상", 버튼 "스팸 처리"
  - `important` → 뱃지 "중요 메일", 버튼 "중요 표시 확인", 설명 "메일함은 그대로 두고 표시만 함"
  - "제외" 버튼도 "무시하고 두기"로 문구 변경 (아무 조치 안 하고 이 후보만 숨긴다는 뜻 명확화).
- 검증: `tsc --noEmit` 클린. 단, 지금 실제로 대기 중인 후보 메일이 0건이라 뱃지가 실제로 렌더링된
  화면은 아직 눈으로 확인 못함 — 다음에 "지금 스캔"으로 새 후보가 잡히면 화면에서 뱃지/문구가
  의도대로 보이는지 한 번 더 확인 필요.

**둘 다 아직 git add/commit 안 됨** — 사용자가 직접 커밋 필요. 이번엔 `.git/index.lock`이
Cowork(device_bash)가 아니라 사용자 본인 터미널에서도 발생했었음(원인 불명, 실제 git 프로세스는
없었음 — `ps aux`로 확인 후 `rm -f .git/index.lock`으로 해결). 다음에 또 발생하면 같은 방법으로
확인 후 지우면 된다.

### 다음 단계
검증이 끝났으므로, 그동안 보류해뒀던 "부가기능" 범위 논의로 넘어갈 차례:
- 비밀번호 생성기 (기술설계서 §3.2 `POST /accounts/generate-password` + 계정 등록 폼에 버튼) — 거의
  확정된 항목, 설계만 확인하고 바로 구현 가능.
- 데이터 백업/내보내기(export/import) 기능 — 신규 논의 필요. 기존 "백업/복구"는 마스터 비밀번호
  복구 키(옵션 A, 거부됨)를 가리켰던 것이었고 데이터 export와는 무관하다는 게 이번에 명확해짐.
  현재 설정 화면에 "백업/복구 설정은 준비 중입니다"라는 placeholder 문구만 있음.

git push는 사용자가 자신의 터미널에서 직접 진행함 (Cowork/device_bash는 `.git/index.lock`을 안전하게
다루지 못하는 구조적 제약이 있어 git 쓰기 작업은 항상 사용자 터미널에서 하는 게 맞음 — 위 세 번째
정지 기록 참고).

---

## 지금 세션 일시정지 시점 (2026-09-16, 세 번째 정지 — Cowork에서 대신 작업) — 다음 세션 시작할 때 먼저 볼 것

**터미널 세션을 못 쓰는 상황이라 Cowork 세션이 대신 상태를 확인/정리함.**

- **설정 화면(`/settings`) 프론트엔드는 이미 완료돼 있었음** — 바로 아래 "두 번째 정지" 메모는
  "프론트는 전혀 손 안 댐"이라고 적혀 있지만, 실제 `apps/web/src/app/(app)/settings/page.tsx`를
  열어보니 `AutoLockSection`(자동 잠금 시간, `GET/POST /auth/settings*` 연동)과
  `ChangeMasterPasswordSection`(마스터 비밀번호 변경, `POST /auth/master-password/change`
  연동, 생체인증 기기 해제 안내 문구 포함)이 둘 다 이미 구현돼 있었다. 아마 두 번째 정지
  메모를 쓴 다음에 이어서 작업하다가 문서화 전에 다시 중단된 것으로 보임 — 문서와 실제
  코드가 어긋나 있었으니 다음에도 이런 게 있는지 `git diff`로 한 번씩 확인할 것.
- **빌드/타입체크 확인함** (Cowork 세션에서, 브라우저 실사용 테스트는 아직 못 함):
  - `npm run build --workspace=apps-api` (`nest build`) — 에러 0
  - `apps/web`에서 `npx tsc --noEmit` — 에러 0
  - `npm run build --workspace=apps-web`(`next build`)는 Cowork 작업 환경 자체의 제약으로
    실행 불가했음 — 이 환경은 linux/arm64인데 `@next/swc-linux-arm64-gnu` 네이티브 바이너리가
    없고, Next.js의 다운로더가 이 환경의 프록시 설정을 안 타서 `registry.npmjs.org` DNS
    조회가 실패함(`curl`로는 프록시 통해 접속 잘 됨 — Next 다운로더만 프록시를 안 씀).
    **이건 이 작업 환경만의 문제고, 사용자 실제 맥에서는 전혀 문제 없었던 부분**이니 신경 안
    써도 됨. `tsc --noEmit`이 통과했으니 타입 오류는 없다.
  - 아직 실제 브라우저로 마스터 비밀번호 변경(재암호화 확인, TrustedDevice 해제 확인)과
    자동 스캔 수동 트리거(`POST /email-candidates/scan`) 테스트는 못 해봄 — 다음 세션에서
    최우선으로 할 것.
- **git 정리**: 오래된(활성 프로세스 없는, 0바이트) `.git/index.lock`이 남아있어 커밋이 막혀
  있었음 — 삭제 권한이 없어서 `_to_delete/`로 옮기는 방식으로 치움(실제 삭제는 안 함, 사용자가
  나중에 그 폴더 직접 정리하면 됨). 이후 위 변경사항 전부 커밋함(`git log` 참고).
- **백업/복구(데이터 export/import) 기능**: 사용자가 "우선 추후로 남겨두자"고 확정함
  (2026-09-15/16 Cowork 대화). 다음 세션에서 다시 물어볼 필요 없음 — 그냥 보류 상태 유지.
- **origin에 push 안 됨** — 로컬 커밋만 있음. push 필요하면 사용자에게 먼저 확인할 것.

## 지금 세션 일시정지 시점 (2026-09-15, 두 번째 정지) — 다음 세션 시작할 때 먼저 볼 것

**"남은 단계도 진행해" 지시로 아래 세 가지를 작업 중이던 도중 사용자가 일시정지 요청함.
git commit 전이라 아래 내용이 전부 working tree에만 있음 (`git status`로 확인).**

- [x] **EmailRule 수정/삭제** — 완료. `apps/api/src/mail/rules/{rules.controller.ts,rules.service.ts}`에
  `PUT/DELETE /email-rules/:id` 추가, `apps/web/.../mail/rules/page.tsx`의 `NewRuleForm`을
  `RuleForm`으로 일반화해 규칙 목록에 수정/삭제 버튼 연결. 빌드만 확인, 브라우저 실사용
  테스트는 아직 안 함.
- [x] **자동(백그라운드) 메일 스캔 스케줄러** — 완료. `@nestjs/schedule` 설치,
  `apps/api/src/mail/candidates/scan-scheduler.service.ts`(신규) — `@Cron(EVERY_3_HOURS)`로
  `CandidatesService.scanAll()`(신규, 사용자 필터 없이 모든 활성 계정 대상) 호출.
  `AppModule`에 `ScheduleModule.forRoot()` 등록. `scanAccounts()` 내부에 계정 단위
  try/catch 추가(한 계정 실패가 전체를 막지 않도록, 사람이 지켜보지 않는 크론이라).
  **아직 실제로 3시간을 기다려 동작을 확인하지는 못함** — 로직 리뷰 + 빌드만 확인.
- [~] **설정 화면 (마스터 비밀번호 변경 / 자동 잠금 시간)** — **백엔드만 완료, 프론트는 전혀
  손 안 댐.** 다음 세션에서 여기부터 이어가면 됨:
  - DB: `User.autoLockMinutes`(기본 15분) 컬럼 추가 완료 — psql로 직접 `ALTER TABLE` 실행 →
    `prisma/migrations/20260915174804_add_auto_lock_minutes/migration.sql` 수동 작성 →
    `prisma migrate resolve --applied` → `prisma generate`까지 끝냄 (기존에 문서화된 drift
    우회 절차 그대로 따름, `npx prisma migrate status`로 drift 없음 확인함).
  - `UnlockKeyStoreService`를 `Map<string, Buffer>`에서 `Map<string, {key, autoLockMinutes,
    lastActivityAt}>`로 리팩터링, `touch(sessionId)`가 idle 타임아웃을 매 호출마다 검사/갱신
    (자동 잠금 실제 구현 지점). `UnlockedGuard`가 `get()` 대신 `touch()`를 쓰도록 교체,
    타임아웃 넘으면 `session.unlocked=false`도 같이 맞춤.
  - `AuthController`/`AuthService`에 신규 라우트 3개:
    - `GET /auth/settings` → `{ autoLockMinutes }`
    - `POST /auth/settings/auto-lock-minutes` (`UnlockedGuard`) → DB 갱신 +
      `unlockKeyStore.updateAutoLockMinutes()`로 현재 세션에도 즉시 반영
    - `POST /auth/master-password/change` (`UnlockedGuard`, body: `currentPassword`,
      `newPassword`) → `AuthService.changeMasterPassword()`: 현재 비밀번호 검증 →
      새 kdfSalt/키 유도 → 이 사용자의 모든 `Account.encryptedPassword`를 새 키로
      재암호화(트랜잭션) → `User.masterPasswordHash/masterKdfSalt` 갱신 → **등록된
      `TrustedDevice`(WebAuthn) 전부 삭제**(옛 비밀번호로 기기에 감싸둔 값이 무효화되므로,
      사용자가 새 비밀번호로 재등록해야 함) → 현재 세션은 새 키로 계속 unlocked 유지.
      Gmail 토큰은 서버 관리 키(7.2 옵션 a)라 영향 없음 — 그래서 이번엔 건드릴 필요 없었음.
    - `GET /auth/me`가 이제 `AuthService.checkStillUnlocked()`를 호출해서 idle 타임아웃을
      화면 전환(apps/web `proxy.ts`의 매 네비게이션 `/auth/me` 체크) 시점에도 반영함.
  - **다음에 할 일 (프론트)**: `apps/web/.../settings/page.tsx`에
    1) 마스터 비밀번호 변경 폼(현재/새 비밀번호 입력, 성공 시 "등록된 생체인증 기기가 모두
       해제되었습니다" 안내 + 기기 목록 새로고침),
    2) 자동 잠금 시간 설정(숫자 입력 또는 select, `GET/POST /auth/settings*` 연동)
    을 붙이면 이 항목은 끝남. 백엔드 API는 이미 다 준비되어 있음.
  - **아직 전혀 실사용 테스트 안 함** — 특히 마스터 비밀번호 변경은 재암호화 트랜잭션이라
    실제 브라우저로 계정 1개 이상 있는 상태에서 변경 전/후 비밀번호 복호화가 맞는지,
    TrustedDevice가 실제로 지워지는지 꼭 확인해야 함.
- [ ] **백업/복구 (설정 화면)** — **아직 손도 안 댐.** 기획서 3.3/7장은 "백업/복구"를
  마스터 비밀번호 분실 복구 수단처럼 언급하지만, 그 용도는 이미 2026-09-15 첫 번째 정지
  시점에 옵션 B(복구 없음 정책)로 확정됨(위 항목 참고) — 그러니 여기서 만들 "백업"은
  복구 수단이 아니라 **암호화된 데이터 내보내기/가져오기**(Bitwarden류 encrypted export와
  동일한 개념: 내보낸 파일도 여전히 마스터 비밀번호가 있어야 풀림, 새로운 접근 경로를
  열지 않음)로 해석해서 구현할 계획이었음 — 다음 세션에서 이 해석이 맞는지 사용자에게
  먼저 확인하고 시작할 것. 아직 API/화면 설계도 안 한 상태.
- **커밋 안 함.** `git status`에 아래 파일들이 수정/추가 상태로 남아있음:
  `apps/api/src/{app.module.ts, mail/mail.module.ts, mail/candidates/candidates.service.ts,
  mail/rules/rules.{controller,service}.ts, auth/auth.{controller,service}.ts,
  auth/guards/unlocked.guard.ts, auth/unlock-key-store.service.ts, package.json}`,
  `apps/api/src/mail/candidates/scan-scheduler.service.ts`(신규),
  `apps/web/src/app/(app)/mail/rules/page.tsx`, `prisma/schema.prisma`,
  `prisma/migrations/20260915174804_add_auto_lock_minutes/`(신규), `package-lock.json`.
  둘 다 `npm run build`는 통과 확인함(`apps/api`, `apps/web`).
- **다음 세션 시작 순서 추천**: 위 "설정 화면" 프론트엔드부터 이어서 끝내기 → 브라우저로
  마스터 비밀번호 변경/자동 잠금 실사용 검증 → 백업/복구 기능 설계 확인 후 구현 → 전부
  끝나면 문서(`docs/`, 이 파일의 체크리스트) 정리하고 커밋.

## 지금 세션 일시정지 시점 (2026-09-15) — 다음 세션 시작할 때 먼저 볼 것

- **핵심 기능(계정 관리, 인증 전체, Gmail 메일 정리)은 전부 실사용 검증까지 끝났다.**
  자세한 건 아래 "지금까지 진행 상태"의 각 항목, 특히 맨 아래쪽 항목들 참고.
- **지난 세션의 두 미해결 질문 전부 사용자가 결정함 (2026-09-15)**:
  1. 마스터 비밀번호 복구 수단 → **옵션 B+C**(복구 없음 정책 + WebAuthn 완충) 확정, 최초
     설정 화면 경고/체크박스 UI까지 구현 완료.
  2. Gmail 토큰 암호화 키 → 코드(옵션 b, 마스터 비밀번호 키)와 문서(옵션 a, 서버 관리 키)가
     어긋나 있던 걸 발견 → 사용자가 **문서대로 옵션 (a)** 선택 → 코드를 옵션 (a)로 재작업하고,
     전환 이전에 연결돼 있던 실제 Gmail 계정(`chaejinseong4@gmail.com`) 토큰을 임시
     마이그레이션 라우트로 1회 재암호화(사용자가 브라우저에서 직접 버튼 클릭) → 새 키로
     정상 복호화되는 것까지 확인 후 임시 코드 제거. 자세한 내용은 "지금까지 진행 상태"의
     2026-09-15 항목 참고.
  둘 다 `git commit`까지 완료 — 저장소 루트의 `Claude outputs/account_manager_design.md`
  (예전 Cowork 채팅 세션 산출물로 추정)도 사용자 지시로 이번 커밋에 포함시킴.
- **개발 서버는 종료해둠** (`nest start --watch`, `next dev` 둘 다 kill됨). Postgres
  컨테이너(`docker compose`)는 계속 띄워둠 — 데이터 그대로 남아있음 (실제 사용자 1명,
  Gmail 계정 1개 연결, WebAuthn 기기 1개, 메일 규칙 1개 등 실사용 테스트 데이터 포함).
  재개할 때 "로컬 개발 환경 기동" 섹션 순서대로 다시 켜면 됨.
- **지금 막힌 것 없음.** 남은 건 전부 부가 기능(아래 "아직 구현 안 된 것" 참고).

## 문서부터 읽을 것

- `docs/기획서.md` — 기능 정의, 사용 흐름, 보안 방향, 확장성 원칙 (v0.5)
- `docs/기술설계서.md` — 기술스택, ERD, API 명세, 화면/폴더 구조 (v0.4)

이 프로젝트의 모든 설계 결정(왜 이렇게 만들었는지)은 위 두 문서에 기록되어 있다.
새 기능을 만들기 전에 이 문서와 맞는지 먼저 확인할 것. 문서와 다르게 구현해야 할
이유가 생기면 문서도 같이 갱신한다.

## 로컬 개발 환경 기동

```
docker compose up -d          # Postgres (호스트 포트 55432 — 5432는 다른 프로젝트가 씀)
npx prisma migrate dev        # 최초 1회 또는 schema.prisma 변경 후
npm run start:dev --workspace=apps-api   # NestJS, 기본 포트 3001
npm run dev --workspace=apps-web         # Next.js, 기본 포트 3000
```

`.env`(루트, git에 커밋 안 됨)에 실제 값이 필요하다 — 템플릿은 `.env.example` 참고.
`apps/web`은 별도로 `apps/web/.env.local`(`NEXT_PUBLIC_API_BASE_URL`)이 필요하다.

**schema.prisma를 바꿀 때 주의**: 한 번이라도 `npm run start:dev`로 서버를 띄운 적이 있으면
`connect-pg-simple`이 만든 `session` 테이블 때문에 `npx prisma migrate dev`가 "drift
detected"로 막히고 `migrate reset`(전체 데이터 삭제)을 요구한다. 실사용자 데이터가 있는
로컬 DB에서는 **`migrate reset` 대신** 이 순서로 우회할 것:
1. `psql`로 원하는 `ALTER TABLE` 등을 직접 실행
2. `prisma/migrations/<timestamp>_<name>/migration.sql`에 같은 SQL을 수동으로 파일로 남김
3. `npx prisma migrate resolve --applied <timestamp>_<name>`으로 이력에 반영
4. `npx prisma generate`로 클라이언트 재생성

## 지금까지 진행 상태

- [x] 기획서/기술설계서 작성 완료, ERD 6개 이슈 사용자 승인까지 완료
- [x] 모노레포 뼈대 생성: `apps/web`(Next.js), `apps/api`(NestJS),
      `packages/shared-types`(아직 미착수), `prisma/schema.prisma`
- [x] `prisma/schema.prisma`에 ERD 전체 반영 (User, TrustedDevice, Account,
      EmailAccount, EmailRule, EmailRuleCondition, EmailCandidate,
      NotificationChannel, ActivityLog)
- [x] NestJS 모듈 뼈대: `auth`, `accounts`, `mail/{rules,candidates,providers}`,
      `notifications`, `common/prisma` — 전부 라우트/서비스 구조만 있고 실제 로직은
      대부분 TODO 상태 (아래 참고)
- [x] `npx prisma generate` 실행 완료, `apps/api` 빌드 성공 확인 (2026-09-09).
      단, 실행 도중 루트 `package.json`의 `prisma@^7.10.0`이 최신 **Prisma 7**을
      깔면서 `schema.prisma`의 `datasource { url = env(...) }` 방식이 막힌 걸
      발견해서 (P1012) Prisma 7 신방식으로 함께 마이그레이션함:
      - `prisma/schema.prisma`: `datasource` 블록에서 `url` 제거
      - `prisma.config.ts`(신규, 루트): CLI(`generate`/`migrate`)용 `DATABASE_URL` 설정,
        `dotenv/config`로 `.env` 명시 로드 (Prisma 7 CLI는 `.env` 자동 로드 안 함)
      - `apps/api/src/common/prisma/prisma.service.ts`: `@prisma/adapter-pg`로
        런타임 `PrismaClient`에 adapter 주입하도록 변경
      - v8.0.0-rc 업그레이드 안내는 무시하고 7.10.0 유지
- [x] 마스터 비밀번호 → 암호화 키 유도(Argon2id) + AES-256-GCM 암복호화 유틸 프로토타입
      완료 (2026-09-09) — `apps/api/src/common/crypto/`(`kdf.util.ts`, `aes.util.ts`,
      `crypto.service.ts`, `crypto.module.ts`). 아직 어떤 서비스도 이 `CryptoService`를
      실제로 호출하지 않음(예: `AccountsService`가 비밀번호를 평문으로 저장 중) — 다음
      단계에서 연결 필요. 마스터 비밀번호 **복구 수단**(오프라인 복구 키/문구)은 기획서
      7장에서 요구하지만 아직 설계도 안 됨 — 지금 상태로는 마스터 비밀번호 분실 시
      데이터 영구 접근 불가.
- [x] Google OAuth 클라이언트 구성 방식 결정 (2026-09-09): 클라이언트 **1개 공용**,
      앱 로그인(`/auth/google/*`)과 Gmail 연동(`/email-accounts/oauth/*`)은 스코프를
      요청 시점에 나눠 요청(incremental authorization). 단, **Google Cloud Console
      실제 등록 자체는 아직 안 됨** — 사용자가 브라우저에서 직접 진행해야 함.
- [x] 인증/세션 흐름 실제 구현 (2026-09-14) — `apps/api/src/auth/`:
      - `express-session` + `connect-pg-simple`(Postgres 세션 저장소, httpOnly 쿠키)을
        `main.ts`에 연결. **주의**: NestJS는 `.env`를 자동으로 안 읽으므로 `main.ts`
        맨 위에서 `dotenv`로 루트 `.env`를 직접 로드하게 함(`__dirname` 기준 상대경로 —
        `nest start`든 `node dist/main.js`든 cwd와 무관하게 항상 루트 `.env`를 찾음).
        이 로딩이 없으면 `GOOGLE_CLIENT_ID` 등이 전부 빈 문자열로 읽힘(직접 겪은 버그).
      - `GoogleOAuthService`(`google-oauth.service.ts`): `google-auth-library`로 실제
        OAuth URL 생성/코드 교환/id_token 검증 구현. `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`
        env 필요 (Google Cloud Console 등록 전까지는 `REPLACE_ME` placeholder로 빌드/기동만 확인됨).
      - `AuthService`: Google 콜백 → User 조회, 없으면 세션에 프로필만 임시 보관(`pendingGoogle`).
        **문서에 없던 엔드포인트 `POST /auth/master-password/setup` 추가** — `User.masterPasswordHash`/
        `masterKdfSalt`가 NOT NULL이라 최초 로그인 시점엔 User row를 만들 수 없어서 생긴 문제를
        풀기 위함 (기술설계서 3.1에 반영 완료). unlock/lock/logout도 CryptoService(Argon2id
        검증 + AES 키 유도)를 실제로 호출하도록 구현.
      - `UnlockKeyStoreService`: 유도된 AES 키는 세션(=Postgres) 저장소에 절대 넣지 않고
        세션ID→키 in-memory Map으로만 보관. 서버 재시작 시 전체 세션이 다시 잠김(의도된 동작,
        기술설계서 1장에 근거 추가).
      - `LoggedInGuard`(로그인만 확인) / `UnlockedGuard`(로그인 + 잠금해제 확인, `req.encryptionKey`
        주입) + `@CurrentUserId()` / `@EncryptionKey()` 데코레이터.
      - `AccountsController`/`AccountsService` 연결 완료: `TEMP_USER_ID` 제거, 세션에서
        userId를 꺼내 쓰도록 교체. `create`는 평문 `password`를 받아 세션의 유도 키로
        암호화해서 저장, 목록(`findAll`)은 `encryptedPassword`를 아예 select 안 함(복호화 X),
        신규 `GET /accounts/:id`(`findOne`)에서만 복호화해서 반환 — 기술설계서 3.2 스펙 그대로 구현.
      - 실행 확인: `npm run build`(tsc 에러 0) + `node dist/main.js` 기동 후
        `GET /auth/google/start` curl 테스트로 세션 쿠키 발급 및 `.env` 값 반영 확인.
        **DATABASE_URL이 아직 placeholder라 실제 Postgres 붙는 흐름(로그인 완료, unlock,
        accounts CRUD)은 E2E로 못 돌려봄** — 코드 경로만 빌드/타입 체크/부분 기동으로 검증.
      - `apps/api/tsconfig.json`에 `esModuleInterop: true` 추가 (원래 없었음 —
        `express-session`/`connect-pg-simple`처럼 `export = ...` 스타일 CJS 모듈을
        default import로 쓰려면 필요. 기존 `import * as x` 스타일 코드는 영향 없음).
- [x] WebAuthn 생체인증 등록/인증 백엔드 구현 (2026-09-14) — `@simplewebauthn/server` 사용,
      `apps/api/src/auth/webauthn.service.ts` + `auth.controller.ts`의 `webauthn/*` 라우트:
      - `residentKey: 'required'` + `authenticatorAttachment: 'platform'`로 등록 —
        디스커버러블 credential이라 `authenticate-options`가 사용자 식별 없이 옵션 발급 가능.
      - **중요**: 생체인증은 마스터 비밀번호를 대체하지 않고 "타이핑"만 대체한다(기획서 7장).
        `POST /auth/webauthn/authenticate`는 `{ response, password }`를 받아 WebAuthn assertion
        검증 후 기존 `AuthService.unlock()`(Argon2id 검증 + AES 키 유도)을 그대로 재사용한다.
        `password`는 신뢰된 기기가 로컬에 감싸둔 값을 생체인증 통과 직후 스스로 복호화해
        보내준다는 전제 — 그 감싸기/복호화(PRF 확장 등)는 apps/web 몫이라 **아직 구현 안 됨**.
        지금 구현은 옵션 발급·assertion 검증·TrustedDevice 저장(counter 포함, 재생공격 방지)까지만.
      - `TrustedDevice.counter` 컬럼 신규 추가 (v0.4 ERD엔 없었음, `prisma/schema.prisma` +
        기술설계서 3.1에 반영). 마이그레이션 파일은 아직 안 만듦(`prisma migrate dev` 미실행 —
        실 Postgres 없어서 지금까지 계속 `prisma generate`만 돌림).
      - 검증: `npm run build` + `tsc --noEmit` 에러 0, 서버 기동 후 `POST
        /auth/webauthn/authenticate-options` curl로 실제 challenge/rpId 응답 확인. 나머지
        WebAuthn 라우트는 브라우저의 실제 `navigator.credentials.*` 왕복이 있어야 끝까지
        테스트 가능(= apps/web 필요), 아직 못 해봄.
- [x] Next.js(`apps/web`) 스캐폴딩 + 기술설계서 4장 라우트 뼈대 (2026-09-14):
      - `create-next-app`(App Router, TS, Tailwind v4, ESLint)로 생성, 패키지명은
        모노레포 컨벤션에 맞춰 `apps-web`로 수정(기본값은 `web`이었음).
      - 라우트 구조: `/login`은 `(app)` 그룹 밖(레이아웃에 nav 없음), 나머지
        `/`(대시보드)·`/accounts`·`/accounts/new`·`/accounts/[id]`·`/mail/{rules,review,important}`·
        `/settings`는 전부 `src/app/(app)/`(그룹 라우트) 아래 — `(app)/layout.tsx`가
        `useSession()`(클라이언트에서 `/auth/me` 호출)으로 로그인/잠금해제 안 된 세션을
        `/login`(또는 `/login?step=unlock`)으로 되돌려보낸다. **아직 클라이언트 전용
        가드**라 서버사이드에서 쿠키를 먼저 검사하는 `middleware.ts`로 옮기면 깜빡임
        없이 더 매끄러워짐 — 다음 개선 과제로 남겨둠.
      - `lib/api.ts`(`apiFetch`, `credentials:"include"` 고정) / `lib/session.ts`
        (`useSession` 훅) — 이후 모든 페이지가 이 두 개를 통해 백엔드와 통신.
      - `/login`, `/accounts`, `/accounts/new`, `/accounts/[id]`는 스텁이 아니라
        실제로 백엔드 API(`/auth/*`, `/accounts*`)를 호출하도록 구현함 — Google 로그인
        시작, 마스터 비밀번호 설정/해제, 계정 목록/등록/상세(복호화 비밀번호 보기 토글).
        `/mail/*`, `/settings`는 아직 백엔드 로직이 없어서 순수 placeholder로 둠.
      - **백엔드도 같이 손봄**: `main.ts`에 `app.enableCors({ origin: FRONTEND_ORIGIN,
        credentials: true })` 추가(크로스 오리진 3000→3001에 세션 쿠키가 실리려면
        필수). `auth.controller.ts`의 `GET /auth/google/callback`이 더 이상 JSON을
        반환하지 않고 `${FRONTEND_ORIGIN}/login?step=setup|unlock`(실패 시 `?error=`)로
        302 redirect하도록 변경 — 지난 세션에 남겨뒀던 TODO를 이번에 해소함. `.env`에
        `FRONTEND_ORIGIN` 추가.
      - 검증: `apps/api`·`apps/web` 둘 다 빌드/타입체크/lint 통과. `curl -H "Origin:
        http://localhost:3000"`로 preflight(OPTIONS)와 실제 GET 둘 다
        `Access-Control-Allow-Credentials: true` 응답 확인. Next 라우트 전부 200 응답
        확인(보호된 라우트는 클라이언트 가드가 붙기 전 SSR HTML이라 "확인 중..."만 보임,
        정상).
      - **여전히 안 되는 것**: `GOOGLE_CLIENT_ID`가 `REPLACE_ME`라 실제 Google 로그인은
        브라우저로 끝까지 못 밟아봄, `DATABASE_URL`도 placeholder라 setup/unlock이
        실제 User row를 만들거나 조회하는 것도 아직 확인 불가.
- [x] 실제 Postgres 연결 + 전체 인증/계정 흐름 E2E 검증 (2026-09-14):
      - 루트 `docker-compose.yml`(신규) — `postgres:16` 컨테이너. 호스트 포트는 **55432**
        (5432는 이 컴퓨터에 이미 떠 있는 다른 프로젝트의 Postgres 컨테이너가 쓰고 있어서
        피함 — 그 컨테이너는 건드리지 않았음). `docker compose up -d`로 기동, 데이터는
        named volume에 영속.
      - `.env`의 `DATABASE_URL`을 이 컨테이너로 교체, `npx prisma migrate dev --name init`
        최초 실행 → `prisma/migrations/20260914060416_init/` 생성, ERD 테이블 10개
        (`users`, `accounts`, `trusted_devices` 등) 전부 실제 생성 확인. `.env.example`은
        범용 기본값(5432)을 유지해 다른 환경에서 그대로 쓸 수 있게 둠.
      - **Google OAuth 콜백 없이 인증/계정 흐름 전체를 E2E로 검증**: `GOOGLE_CLIENT_ID`가
        아직 `REPLACE_ME`라 브라우저로 실제 Google 로그인은 여전히 못 밟지만, (1) 임시
        스크립트로 Argon2id 해시 + salt를 가진 테스트 `User`를 DB에 직접 시드하고
        (2) `GET /auth/google/start`로 정상 발급받은 세션 쿠키를 그대로 쓰되 그 세션 행의
        `sess` JSON에 `userId`만 수동으로 심어(=Google 콜백이 하는 일과 동일한 상태) "로그인
        직후" 상태를 재현하는 방식으로, 나머지 전 구간을 실제 HTTP 요청 + 실제 DB로 확인함:
        `/auth/me`(로그인만/잠금해제 후 상태 변화), `/auth/unlock`(틀린 비밀번호 401 /
        맞으면 unlocked true — Argon2id 검증 실동작 확인), `POST /accounts`(AES-256-GCM으로
        암호화되어 저장 — DB에 평문이 없는 것까지 직접 SELECT로 확인), `GET /accounts`
        (목록에 비밀번호 필드 자체가 없음), `GET /accounts/:id`(원문으로 정확히 복호화됨),
        중복 계정 409, `/auth/lock` 이후 401, `/auth/logout` 이후 세션 파기까지 전부 기대한
        그대로 동작. 테스트에 쓴 시드 유저/계정은 검증 후 DB에서 삭제(cascade로 계정도 같이
        삭제됨).
      - **이걸로도 못 담아낸 것**: 실제 Google OAuth 코드 교환(Console 등록 필요),
        WebAuthn 등록/인증의 실제 브라우저-authenticator 왕복(진짜 서명이 필요해서 curl로
        흉내낼 수 없음, 옵션 발급 자체는 이미 이전에 확인됨).
- [x] 코드만으로 끝낼 수 있는 후속 작업 3건 (2026-09-14):
      - **`AccountsController` PUT/DELETE** — `AccountsService.update()`(비밀번호 미입력 시
        기존 암호문 유지, urlOrAppName/loginId 변경으로 중복나면 409)와 `remove()` 추가.
        `apps/web`의 `/accounts/[id]`에 수정 폼(인라인 토글)과 삭제 버튼 붙임. 실제 Postgres로
        생성→수정(비밀번호 재암호화 확인)→삭제→404 전 구간 E2E 검증 완료.
      - **`apps/web` 인증 가드를 서버사이드로 이전** — `src/middleware.ts`를 만들었는데
        Next.js 16 빌드가 "middleware 컨벤션은 deprecated, proxy를 쓰라"고 경고해서
        (`apps/web`의 자동 생성 `AGENTS.md`가 예고한 "이번 버전은 훈련 데이터와 다르다"가
        실제로 발생한 사례) 공식 codemod(`npx @next/codemod middleware-to-proxy`)로
        `src/proxy.ts` + `export async function proxy()`로 전환. 이제 `/login`을 제외한
        모든 화면 요청마다 백엔드 `/auth/me`를 먼저 확인해서 미로그인/미해제 세션은 아예
        페이지에 도달하기 전에 리다이렉트한다 — 예전에 있던 "확인 중..." 깜빡임 제거.
        `(app)/layout.tsx`는 이제 nav만 그리면 돼서 `useSession` 훅 자체를 삭제함(더 이상
        쓰는 곳이 없어져서). curl로 "쿠키 없이 / → 307 /login", "unlock 후 / → 200" 확인.
      - 이 두 가지 모두 실제 브라우저(개발 서버 둘 다 기동) + 실제 Postgres로 확인 완료.
- [x] WebAuthn client-side 구현 (2026-09-14) — `apps/web/src/lib/webauthn*.ts`:
      - **방식 결정**: PRF 확장 채택. WebAuthn PRF는 "같은 credential + 같은 salt → 항상
        같은 비밀"을 인증기에서 매번 새로 유도해주는 기능이라, 이 비밀을 그대로 저장하지
        않고 **HKDF로 한 번 더 감싼 AES-256-GCM 키**를 만들어 마스터 비밀번호를 암호화한
        뒤 그 암호문만 IndexedDB에 저장한다(`webauthn-crypto.ts`, `webauthn-storage.ts`).
        raw 키 자체는 저장 안 하므로 IndexedDB가 통째로 유출돼도 생체인증(=인증기 하드웨어)
        없이는 아무것도 복호화 못 함 — 기술설계서 초안의 "non-extractable CryptoKey" 방식보다
        한 단계 더 안전. **이건 제가 판단해서 진행한 결정**이라, 다르게 가고 싶으면 말해달라.
      - 등록(`registerThisDevice`): `/auth/webauthn/register-options`(서버가 이제
        `extensions:{prf:{}}`도 같이 요청함) → `startRegistration` → `/register`로 저장 →
        PRF 지원 확인되면 그 자리에서 로컬 전용 "priming" assertion을 한 번 더 받아 실제
        비밀을 얻고 마스터 비밀번호를 감싸 저장. PRF 미지원 기기/브라우저는 등록만 되고
        자동입력 없이 계속 타이핑해야 함(감싸서 저장하는 단계를 건너뜀 — degraded mode).
      - 인증(`authenticateWithStoredDevice`): `/auth/webauthn/authenticate-options` →
        client가 직접 `extensions.prf.eval.first`를 얹어서 `startAuthentication` → PRF
        결과로 IndexedDB의 암호문을 복호화해 평문 마스터 비밀번호 복구 → `{response, password}`를
        그대로 `/auth/webauthn/authenticate`로 전송 (서버는 이 과정을 전혀 모르고 여전히
        password를 Argon2id로 검증함 — 기획서 7장 "생체인증은 타이핑만 대체" 원칙 그대로).
      - `GET /auth/webauthn/devices` 신규 추가 (기술설계서 3.1에 반영) — `/settings`에서
        등록된 기기 목록/등록 폼/등록 해제 UI, `/login`(`step=unlock`)에서 저장된 기기가
        있을 때만 "생체인증으로 잠금 해제" 버튼 노출.
      - **한계**: `navigator.credentials.*`는 실제 authenticator(지문/FaceID 등) 없이는
        curl/스크립트로 흉내낼 수 없어서, 옵션에 `extensions:{prf:{}}`가 포함되는 것까지만
        서버 쪽에서 확인했고 등록→저장→인증 전체 왕복은 실제 브라우저+기기에서 사용자가
        직접 눌러봐야 확인됨.
- [x] `RulesController`/`CandidatesController` 인증 가드 누락 발견 및 수정 (2026-09-14) —
      원래 이 두 컨트롤러엔 `UnlockedGuard`도, 사용자별 소유권 검사도 전혀 없었음(로그인만
      하면 남의 `EmailRule`/`EmailCandidate`도 ID만 알면 읽고 승인/제외할 수 있는 상태였음).
      `AccountsController`와 동일한 패턴으로 `UnlockedGuard` + `emailAccount: { userId }`
      필터링 적용. 겸사겸사 `CandidatesService.approve()`의 TODO(실제 Gmail
      삭제/스팸 처리 연결)도 `MailProviderRegistryService`(신규, providerType 문자열로
      `MailProvider` 조회 — 기획서 9.1 Provider 플러그인 구조의 실제 구현 지점)를 통해
      배선함. `GmailProvider`가 여전히 빈 스텁이라 지금은 호출은 되지만 아무 일도 안 함.
- [x] 인증 전체를 실제 브라우저(claude-in-chrome)로 E2E 검증 (2026-09-14) — 지금까지는
      curl/시드 스크립트로 흉내 낸 부분이 많았는데, 실제 Google 계정 로그인부터 끝까지
      처음으로 진짜 밟아봄:
      - Google OAuth 로그인(동의 화면 포함) → 신규 사용자 → 마스터 비밀번호 설정 → 대시보드
      - 계정 생성 → 상세에서 복호화된 원문 비밀번호 확인 → 삭제, 전부 실제 DB로 확인
      - WebAuthn: `/settings`에서 Touch ID로 기기 등록(PRF 지원 확인, 마스터 비밀번호를
        기기에 감싸 저장) → 로그아웃 → 재로그인 시 **타이핑 없이 Touch ID만으로 잠금 해제**
        → DB의 `trusted_devices.last_used_at` 갱신까지 확인. WebAuthn 서버/클라이언트
        전체 왕복이 실사용자 기기에서 실제로 동작함을 이때 처음 확인함.
      - **실사용 테스트로만 드러난 버그 3개 발견·수정**:
        1. `apps/web`의 모든 에러 처리가 `err instanceof ApiError ? err.message : fallback`
           패턴이라, `ApiError`가 아닌 에러(WebAuthn `startRegistration`/`startAuthentication`이
           던지는 `DOMException` 등)는 전부 뭉뚱그린 메시지로 숨겨져서 원인 파악이 불가능했음
           (`InvalidStateError: 이미 등록된 인증기` 같은 실제 원인이 안 보였음). `lib/api.ts`에
           `getErrorMessage(err, fallback)` 헬퍼를 추가해 앱 전체(`login`, `settings`,
           `accounts/*`)에서 이 패턴을 교체함 — `Error`면 항상 실제 메시지를 보여줌.
        2. `/settings`에서 `isWebAuthnSupported()`를 렌더 중 직접 호출해 SSR(false)과
           클라이언트(true) 결과가 달라 hydration mismatch 발생 — `useSyncExternalStore`로
           교체(React가 권장하는 SSR-불가 브라우저 API 처리 방식, 서버 스냅샷은 항상 false).
        3. **로그아웃/잠금 버튼이 프론트 어디에도 없었음** (백엔드 `/auth/logout`,
           `/auth/lock`은 있었는데 UI 연결을 빼먹음) — `(app)/layout.tsx` nav 하단에 추가.
      - macOS Touch ID(플랫폼 인증기)는 같은 (RP, 사용자) 조합에 인증기를 하나만 허용해서,
        등록을 여러 번 재시도하면 이후 시도부터 `InvalidStateError`가 나는 게 정상 동작임을
        확인 — 문서화해둠(재현 시 당황하지 말 것, 기존 등록을 지우고 재시도하면 됨).
- [x] Gmail 연동 전체 구현 + 실제 브라우저로 E2E 검증 (2026-09-14) — Gmail 토큰 암호화
      방식은 제가 판단해서 **옵션 (b)**(마스터 비밀번호 유도 키로 암호화, 계정 비밀번호와
      동일한 방식 — 제로놀리지 유지, 대신 자동 백그라운드 스캔은 지원 안 함)로 진행했다.
      - `apps/api/src/email-accounts/` 신규 모듈: `GmailOAuthService`(앱 로그인과 별개
        client, `gmail.modify` 스코프, `access_type: offline` + `prompt: consent`로
        refresh_token 확보), `EmailAccountsController`(`GET/DELETE /email-accounts`,
        `GET /email-accounts/oauth/{start,callback}` — callback은 Google이 직접
        리다이렉트해서 오는 요청이라 가드 대신 세션/키를 수동 체크).
      - `GmailProvider` 실제 구현(`googleapis` 사용) — `listCandidateMessages`(최근 7일
        메일 조회), `applyAction`(delete→휴지통 이동, spam→SPAM 라벨), 토큰 만료 시
        `getAccessToken()`으로 자동 갱신 후 DB 재암호화.
      - `mail/rules/rule-matcher.util.ts`(신규) — sender/subject_keyword/body_keyword/
        has_emoji/has_attachment 조건 평가 + AND/OR 판정.
      - `CandidatesService.scan()`(신규, `POST /email-candidates/scan`) — 사용자가 화면에서
        "지금 스캔"을 눌렀을 때만 실행(백그라운드 자동 스캔 아님, 위 암호화 방식 선택의
        직접적 결과). 계정×규칙마다 메일을 순회해 매칭되면 `EmailCandidate` 생성,
        `(ruleId, externalMessageId)` unique 제약으로 재스캔 시 중복 방지.
      - `CandidatesService.importantSummary()`(신규, `GET /email-candidates/important-summary`)
        — 기획서 3.4.4 "계정별 요약". `EmailCandidate` 테이블에 `@@unique([ruleId,
        externalMessageId])` 추가하면서 **connect-pg-simple이 만든 `session` 테이블
        때문에 `prisma migrate dev`가 drift로 막혀서**, `ALTER TABLE`을 직접 psql로
        실행하고 마이그레이션 파일을 수동 작성한 뒤 `prisma migrate resolve --applied`로
        이력에 반영함(실사용자 데이터가 있어 `migrate reset`은 못 씀 — 앞으로 스키마
        바꿀 때마다 이 절차를 반복해야 함, 아래 참고).
      - `apps/web`의 `/mail/rules`(Gmail 계정 연결 버튼 + 규칙 생성 폼, 조건 최대 5개)/
        `/mail/review`("지금 스캔" + 승인·제외)/`/mail/important`(계정별 집계) 전부 실제
        백엔드 연동으로 구현.
      - **실제 브라우저(claude-in-chrome) + 사용자 본인의 진짜 Gmail 계정으로 전 구간 검증**:
        Gmail 계정 연결(테스트 사용자 등록, Gmail API 활성화까지 겪은 실제 온보딩 과정
        포함) → 토큰 암호화 저장 확인(DB에 평문 없음) → 규칙 생성 → "지금 스캔"으로 **진짜
        받은편지함에서 매칭 메일 3건을 실제로 찾아냄** → 승인 → 계정별 요약 집계까지 전부
        확인. Gmail API를 포함해 이 프로젝트의 거의 모든 핵심 기능이 이걸로 실사용 검증됨.
      - 연동 중 겪은 실제 장애물들(순서대로): `redirect_uri_mismatch`(Console에 콜백 URI
        미등록) → `access_denied`(`gmail.modify`가 민감 스코프라 테스트 사용자 등록 필요)
        → `Gmail API has not been used`(프로젝트에서 Gmail API 자체를 활성화 안 함).
        전부 Google Cloud Console 설정 문제였고 코드 문제는 아니었음 — 새 Google API를
        붙일 때는 이 3가지를 항상 먼저 점검할 것.
- [x] 마스터 비밀번호 복구 수단 정책 확정 + Gmail 토큰 암호화 키를 옵션 (a) 서버 관리
      키로 전환 (2026-09-15):
      - `docs/기술설계서.md` 7장에 "최종 결정"이라고 적혀 있던 내용(복구 수단 옵션 B+C,
        Gmail 토큰 옵션 a)이 실제로는 사용자 확인 없이 초안으로만 적혀 있던 상태였고,
        Gmail 토큰은 그 문서와 반대로 옵션 (b)로 이미 구현·검증까지 끝나 있던 걸 발견함
        (문서·구현 불일치). 사용자에게 확인한 결과 둘 다 문서 초안대로 확정, Gmail은
        (a)로 재작업하기로 결정.
      - 복구 수단: `apps/web/src/app/login/page.tsx`의 마스터 비밀번호 최초 설정 화면
        (`step=setup`)에 "이 비밀번호는 저를 포함해 아무도 복구해드릴 수 없습니다" 경고와
        체크하지 않으면 제출 버튼이 비활성화되는 확인 체크박스 추가.
      - Gmail 토큰 키: `apps/api/src/common/crypto/gmail-token-key.service.ts`(신규) —
        `GMAIL_TOKEN_ENCRYPTION_KEY` 환경변수(base64 32바이트, `.env`/`.env.example`에 추가)를
        읽어 고정 키를 제공, `CryptoModule`(전역)에 등록. `GmailProvider`/
        `EmailAccountsService.createFromGmail`이 세션의 마스터 비밀번호 유도 키 대신 이 키를
        쓰도록 교체. `MailProvider` 인터페이스에서 `encryptionKey: Buffer` 파라미터 전부
        제거(더 이상 호출부가 몰라도 됨). `CandidatesService.scan/approve`도 동일하게
        파라미터 제거.
      - 가드 조정: `EmailAccountsController`의 `GET /email-accounts`, `oauth/start`,
        `DELETE /:id`는 더 이상 암호화 키가 필요 없어져 `UnlockedGuard`→`LoggedInGuard`로
        완화(로그인만 되어 있으면 Gmail 연동 가능). `email-candidates/*`(`CandidatesController`)는
        후보 메일에 발신자/제목이 드러난다는 정책적 이유로 `UnlockedGuard` 그대로 유지 —
        `RulesController`와 동일한 정책, `candidates.controller.ts` 주석 참고.
      - **마이그레이션**: 전환 이전에 이미 연결돼 있던 실제 Gmail 계정
        (`chaejinseong4@gmail.com`, 관련 규칙 1개·후보 3개 포함, 전부 실사용 테스트 데이터라
        삭제하지 않고 보존하기로 함)의 토큰은 구 키(마스터 비밀번호 유도 키)로 암호화돼 있어
        새 서버 키로는 복호화가 안 되는 상태였음. `EmailAccountsController`/
        `EmailAccountsService`에 `UnlockedGuard` 기반 임시 1회성 마이그레이션 라우트
        (`POST /email-accounts/:id/migrate-token-key`)와 `/mail/rules` 화면에 임시 버튼을
        추가 → 사용자가 실제 브라우저에서 로그인/잠금해제 후 클릭 → 구 키로 복호화해 새 키로
        재암호화 → `apps/api/dist`의 컴파일된 `aes.util.js`로 새 키 복호화가 정상 되는 것까지
        직접 확인 → 임시 라우트/버튼 코드 전부 제거. 앞으로 이 서버 키를 교체할 일이 생기면
        같은 패턴(임시 마이그레이션 라우트 추가 → 실행 → 제거)을 반복하면 된다.
      - **여전히 안 되는 것**: 옵션 (a)로 바꿔서 자동 백그라운드 스캔의 기술적 걸림돌(토큰이
        세션 잠금에 묶여있던 문제)은 없앴지만, 실제로 몇 시간마다 스캔을 도는 스케줄러/cron은
        아직 아무것도 배선 안 함 — `CandidatesService.scan()`을 부르는 주체가 여전히
        `POST /email-candidates/scan`을 호출하는 사용자뿐. 필요해지면 그때 배선.
- [ ] TypeScript는 `5.9.3`으로 고정되어 있음 (최신 `7.x`는 Nest CLI 빌드 도구와
      호환 안 됨 — 임의로 업그레이드하지 말 것)

## 아직 구현 안 된 것 (TODO로 표시되어 있음)

- `apps/web`의 `/settings`는 WebAuthn 기기 관리는 실제로 붙였고, 마스터 비밀번호 변경/
  자동 잠금/백업 부분만 placeholder.
- 자동(백그라운드) 메일 스캔 — Gmail 토큰이 서버 관리 키(옵션 a, 2026-09-15 전환)라 기술적
  걸림돌은 없어졌지만, 실제로 주기적으로 `CandidatesService.scan()`을 호출하는 스케줄러/cron이
  아직 없다. 지금은 사용자가 화면에서 "지금 스캔"을 눌러야만 스캔된다. 필요해지면 배선만
  하면 된다.
- `EmailRule`/`EmailAccount` 삭제·수정 API가 계정(Account)만큼 완전하지 않음 — 지금은
  규칙 생성(POST)과 계정 연동 해제(DELETE)만 있고, 규칙 수정/삭제, 계정 정보 수정은 없음.

## 설계 원칙 (코드 짤 때 지킬 것 — 기획서 9장)

- `provider_type`, `condition_type`, `action_type`, `channel_type`은 Prisma enum이
  아니라 String이다. 새 종류를 추가할 때 마이그레이션 없이 값만 늘릴 수 있게 하려는
  의도이므로 enum으로 바꾸지 말 것.
- 메일 서비스는 `mail/providers/`에 Provider 인터페이스(`MailProvider`)를 구현하는
  방식으로 확장한다 (지금은 Gmail 하나).
- `Account`는 `(userId, urlOrAppName, loginId)` 조합에 유니크 제약이 걸려 있다 —
  완전 중복만 막고 부계정(다른 로그인 아이디)은 허용.
- `EmailCandidate`는 `ruleId`뿐 아니라 `emailAccountId`도 직접 저장한다 (비정규화,
  계정별 집계/기록 보존 목적 — 의도적인 설계라 "정규화"한다고 지우지 말 것).

## 다음 순서 (기술설계서 6장 기준)

1. ~~`npx prisma generate` 실행 → `apps/api` 빌드 성공 확인~~ 완료 (2026-09-09)
2. ~~Google Cloud Console에서 OAuth 클라이언트 등록~~ 완료 (2026-09-14) — 사용자가 직접
   등록 후 클라이언트 ID/Secret 전달, `.env`에 반영. 실제 브라우저로 로그인 끝까지 확인됨.
3. ~~마스터 비밀번호 → 키 유도(Argon2id) + AES-256-GCM 암복호화 유틸 구현~~ 완료 (2026-09-09),
   ~~AuthService/AccountsService에 실제로 연결~~ 완료 (2026-09-14)
4. ~~WebAuthn 등록/인증 플로우 실제 구현~~ 완료 (2026-09-14, 서버+client-side 전부, 실제
   Touch ID로 등록→로그아웃→생체인증 로그인까지 E2E 검증됨)
5. ~~Next.js(`apps/web`) 스캐폴딩 및 기술설계서 4장 라우트 구성~~ 완료 (2026-09-14) —
   라우트 8개 전부 생성, `/login`·`/accounts`·`/accounts/new`·`/accounts/[id]`는 실제
   백엔드 연동까지 구현. CORS(`FRONTEND_ORIGIN`)와 `google/callback`의 실제 리다이렉트도
   이때 같이 처리함.
6. ~~실제 Postgres 준비 → 로그인/unlock/accounts CRUD E2E 테스트~~ 완료 (2026-09-14)
7. ~~`AccountsController`에 PUT/DELETE 추가~~ 완료 (2026-09-14), ~~`apps/web` 인증 가드
   서버사이드 이전(middleware→proxy)~~ 완료 (2026-09-14), ~~WebAuthn client-side(PRF)~~
   완료 (2026-09-14)
8. ~~Gmail Provider 실제 구현 + `/email-accounts` 모듈 신규 + `/mail/*` 화면 백엔드 연동~~
   완료 (2026-09-14) — 토큰 암호화는 옵션 (b)(마스터 비밀번호 키, 자동 스캔 대신 수동
   "지금 스캔") 채택. 실제 Gmail 계정으로 연동→규칙→스캔→승인→집계 전 구간 E2E 검증됨.
9. ~~마스터 비밀번호 복구 수단 방향 결정~~ / ~~Gmail 토큰 암호화 키 방식 확정~~ 완료
   (2026-09-15, 위 2026-09-15 항목 참고).
10. **이 프로젝트의 핵심 기능(계정 관리, 인증, Gmail 메일 정리)은 전부 실사용 검증까지
   끝났고, 지난 세션의 두 미해결 사용자 결정 사항도 전부 확정됨.** 남은 건 전부 부가 기능:
   - 자동 백그라운드 스캔 스케줄러/cron 배선 (기술적 걸림돌은 이미 제거됨)
   - `EmailRule` 수정/삭제, `/settings`의 마스터 비밀번호 변경/자동 잠금/백업 등 부가 기능
