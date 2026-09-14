# 계정관리 프로그램 - 프로젝트 컨텍스트

이 파일은 Claude Code(터미널)가 세션 시작 시 자동으로 읽는 파일입니다.
Cowork 채팅에서 기획~설계~초기 구현까지 진행하다 이어받는 시점의 상태를 요약합니다.

## 문서부터 읽을 것

- `docs/기획서.md` — 기능 정의, 사용 흐름, 보안 방향, 확장성 원칙 (v0.5)
- `docs/기술설계서.md` — 기술스택, ERD, API 명세, 화면/폴더 구조 (v0.4)

이 프로젝트의 모든 설계 결정(왜 이렇게 만들었는지)은 위 두 문서에 기록되어 있다.
새 기능을 만들기 전에 이 문서와 맞는지 먼저 확인할 것. 문서와 다르게 구현해야 할
이유가 생기면 문서도 같이 갱신한다.

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
- [ ] TypeScript는 `5.9.3`으로 고정되어 있음 (최신 `7.x`는 Nest CLI 빌드 도구와
      호환 안 됨 — 임의로 업그레이드하지 말 것)

## 아직 구현 안 된 것 (TODO로 표시되어 있음)

- WebAuthn의 client-side 절반(브라우저에서 `navigator.credentials.create/get` 호출,
  생체인증으로 얻은 비밀(PRF 확장 등)로 마스터 비밀번호를 로컬에 감싸서 저장/복호화) —
  서버쪽 절반(옵션 발급/검증/TrustedDevice 저장)은 구현 완료. `apps/web`의 `/settings`에서
  "이 기기 생체인증 등록" 버튼과 함께 구현하면 자연스러움.
- Gmail Provider (`mail/providers/gmail.provider.ts`) — 실제 Gmail API 호출 없음, 빈 스텁.
  Google OAuth 클라이언트 자체는 `auth/google-oauth.service.ts`에 있지만 앱 로그인 스코프
  전용이라 Gmail 스코프는 별도로 다시 요청해야 함(incremental authorization, 아직 미구현).
- `apps/web`의 인증 가드가 클라이언트 전용(`useSession` + `useEffect` 리다이렉트)이라
  보호된 페이지가 잠깐 "확인 중..."을 보여준 뒤에야 리다이렉트됨 — `middleware.ts`로
  옮기면 서버에서 먼저 걸러서 깜빡임을 없앨 수 있음.
- `apps/web`의 `/mail/rules`, `/mail/review`, `/mail/important`, `/settings`는
  아직 백엔드 로직이 없어서 순수 placeholder임 (대응하는 NestJS 로직이 생기면 같이 구현).
- 마스터 비밀번호 **복구 수단**(오프라인 복구 키/문구, 기획서 7장) — 설계도 아직 없음.
  지금 상태로는 마스터 비밀번호 분실 시 데이터 영구 접근 불가.
- `AccountsController`에 PUT/DELETE(`/accounts/:id` 수정/삭제)가 API 명세(3.2)에는
  있지만 아직 구현 안 됨 — 지금은 GET(목록/상세)·POST(생성)만 있음.
- Google Cloud Console에 실제 OAuth 클라이언트 등록이 아직 안 됨 — `.env`의
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`이 `REPLACE_ME` placeholder 상태라
  로그인 흐름 전체를 E2E로 테스트할 수 없음 (사용자가 브라우저에서 직접 등록해야 함).
- `DATABASE_URL`도 아직 placeholder라 실제 Postgres가 준비되기 전까진 세션 저장/
  User·Account 생성 등 DB를 실제로 만지는 흐름은 전부 미검증 상태.

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
2. Google Cloud Console에서 OAuth 클라이언트 등록 (사용자 본인이 브라우저에서 진행) —
   등록 후 `.env`의 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL`을
   실제 값으로 교체하면 로그인 흐름을 실기기에서 처음으로 E2E 테스트할 수 있음
3. ~~마스터 비밀번호 → 키 유도(Argon2id) + AES-256-GCM 암복호화 유틸 구현~~ 완료 (2026-09-09),
   ~~AuthService/AccountsService에 실제로 연결~~ 완료 (2026-09-14)
4. ~~WebAuthn 등록/인증 플로우 실제 구현~~ 서버쪽 완료 (2026-09-14) — client-side(PRF로
   마스터 비밀번호 감싸기/복호화)는 apps/web 작업 때 마저 구현
5. ~~Next.js(`apps/web`) 스캐폴딩 및 기술설계서 4장 라우트 구성~~ 완료 (2026-09-14) —
   라우트 8개 전부 생성, `/login`·`/accounts`·`/accounts/new`·`/accounts/[id]`는 실제
   백엔드 연동까지 구현. CORS(`FRONTEND_ORIGIN`)와 `google/callback`의 실제 리다이렉트도
   이때 같이 처리함.
6. 다음 후보 (우선순위 미정, 상황에 따라 선택):
   - 실제 Postgres 준비 → `DATABASE_URL` 교체 → 로그인/unlock/accounts CRUD/WebAuthn
     E2E 테스트 — 지금까지는 빌드/타입체크/부분 기동으로만 검증됨. 이게 되면 나머지
     항목들도 비로소 끝까지 테스트 가능해짐.
   - Google Cloud Console에서 실제 OAuth 클라이언트 등록 (사용자 본인이 진행)
   - WebAuthn client-side(브라우저 `navigator.credentials.*` + PRF로 마스터 비밀번호
     로컬 감싸기) — `apps/web`의 `/settings`에 붙이면 자연스러움
   - `AccountsController`에 PUT/DELETE 추가 (API 명세 3.2에는 있는데 아직 없음)
   - Gmail Provider 실제 구현 + `/mail/*` 화면 백엔드 연동
