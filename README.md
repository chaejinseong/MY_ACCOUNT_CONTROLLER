# 통합 계정관리 프로그램 (MyVault)

여러 사이트에 흩어진 계정/비밀번호를 암호화해서 한 곳에서 관리하고, 다중 Gmail 계정에
쌓이는 메일을 규칙 기반으로 자동 분류·정리해주는 1인 개발 개인용 웹 애플리케이션입니다.
기획부터 보안 설계, 배포(원격 상시 접속 환경 구축)까지 전 과정을 직접 설계하고
구현했습니다.

> 회사/불특정 다수를 위한 서비스가 아니라 **개발자 본인이 매일 실사용하는 도구**를
> 만든다는 전제로, "실제로 매일 쓸 만한가"를 기준 삼아 최소 기능부터 점진적으로
> 확장하는 방식으로 개발했습니다.

---

## 1. 왜 만들었는가

두 가지 실제 문제에서 출발했습니다.

1. 계정이 너무 많아지면서 비밀번호를 **안전하게, 그러나 찾기 쉽게** 보관할 방법이 필요했습니다.
2. 여러 Gmail 계정에 쌓이는 메일 대부분은 정기적으로 지우거나 스팸 처리해도 되는데, 매번
   손으로 정리하기는 귀찮고, 정작 중요한 메일은 그 사이에 묻혀서 놓치기 쉬웠습니다.

이 두 문제를 하나의 도구에서, "믿을 수 있는 보안 구조" 위에서 풀어보는 것을 목표로
삼았습니다.

## 2. 핵심 기능

| 기능 | 설명 |
|---|---|
| 계정/비밀번호 관리 | 사이트별 아이디·비밀번호를 암호화 저장, 카테고리/검색으로 조회 |
| 비밀번호 생성기 | 혼동되기 쉬운 문자(I/l/O/0/1) 제외, 문자 클래스별 최소 1개 보장, 안전한 난수(`crypto.randomInt`) 기반 |
| 대시보드 | 등록 계정 수 / 오늘의 검토함 대기 건수 / 중요 메일 건수를 요약 카드로 표시 |
| Gmail 자동 분류 | 발신자·제목 키워드·본문 키워드·이모지 포함·첨부파일 유무 5가지 조건을 AND/OR로 조합한 규칙 엔진 |
| 매일 아침 승인 플로우 | 규칙에 매칭된 메일을 "오늘의 검토함"에 모아두고, 사람이 최종 승인해야만 실제 Gmail에서 삭제/스팸 처리 (오탐 방지를 위해 자동 삭제는 하지 않음) |
| 중요 메일 알림 | "중요" 규칙에 걸린 메일은 자동 처리 대상에서 완전히 제외, 대시보드에 계정별 집계로 요약 |
| WebAuthn 생체인증 | 신뢰 기기에서 지문/Face ID로 마스터 비밀번호 타이핑을 대체 (완전한 대체가 아니라 "타이핑 생략" — 아래 보안 설계 참고) |
| 데이터 백업/내보내기 | 마스터 비밀번호와 별개인 "내보내기 비밀번호"로 전체 계정을 재암호화한 파일로 내려받고 복원 가능 |
| 원격 상시 접속 | Tailscale + pm2로 개인 네트워크상 어디서든 HTTPS로 접속 가능한 상시 구동 환경 구축 |

## 3. 기술 스택

| 영역 | 선택 | 선택 이유 |
|---|---|---|
| 프론트엔드 | Next.js 16 (App Router) + React 19 + TypeScript | 파일 기반 라우팅으로 화면 구성이 직관적, 백엔드와 타입 공유 용이 |
| 스타일링 | Tailwind CSS v4 | 1인 개발에서 별도 디자인 시스템 없이 빠르게 화면 구현 |
| 백엔드 | NestJS 12 (Node.js + TypeScript) | 모듈/프로바이더 구조가 "메일 서비스 Provider 플러그인" 설계와 정확히 맞아떨어짐 |
| 데이터베이스 | PostgreSQL (Docker Compose) | 관계형 데이터에 적합, `JSONB`로 가변 스키마(규칙 조건 등) 수용 |
| ORM | Prisma 7.x | 스키마 파일 하나로 타입·마이그레이션 동시 관리, `@prisma/adapter-pg`로 런타임 커넥션 분리 |
| 앱 로그인 | Google OAuth 2.0 | 자체 회원가입/비밀번호 재설정 기능을 직접 구현하지 않기 위함. Gmail 연동과 스코프를 분리해 요청(incremental authorization) |
| 데이터 암호화 | Argon2id(키 유도) + AES-256-GCM(대칭키 암호화) | Argon2id는 현재 권장되는 brute-force 저항 KDF, GCM은 무결성 검증까지 포함 |
| 생체인증 | WebAuthn (`@simplewebauthn`) + PRF 확장 | 감싸진 마스터 비밀번호를 기기 로컬(IndexedDB)에만 보관, 서버는 원본 키를 절대 보유하지 않음 |
| 세션 관리 | `express-session` + `connect-pg-simple` (httpOnly 쿠키) | JWT 대신 서버 세션을 사용해 프론트 JS가 토큰을 직접 다루지 않게 함 (XSS 내성) |
| Gmail 연동 | `googleapis` (공식 클라이언트) | OAuth 토큰 갱신·메일 조회/라벨/삭제 API 처리 |
| 스케줄링 | `@nestjs/schedule` | 별도 큐 서버 없이 NestJS 내에서 주기적 메일 스캔 크론 등록 |
| 원격 접속 | Tailscale (WireGuard 기반 VPN 메시) | 공인 인터넷에 노출하지 않고 개인 기기 간 사설망 + 자동 HTTPS 인증서 |
| 프로세스 관리 | pm2 + macOS launchd | 터미널 종료/재부팅과 무관하게 서버 상시 구동, 자동 재시작 |

## 4. 아키텍처

모노레포 구조로 프론트엔드/백엔드를 한 저장소에 명확히 분리했습니다.

```
my_account_mail_controler/
├── apps/
│   ├── web/                     # Next.js 프론트엔드 (포트 3000)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── login/
│   │       │   └── (app)/
│   │       │       ├── accounts/
│   │       │       ├── mail/
│   │       │       └── settings/
│   │       ├── components/
│   │       └── lib/             # apiFetch, webauthn 유틸
│   └── api/                      # NestJS 백엔드 (포트 3001, /api/v1)
│       └── src/
│           ├── auth/             # Google OAuth, 마스터 비밀번호, WebAuthn
│           ├── accounts/         # 계정/비밀번호 CRUD, 생성기, 백업/복원
│           ├── email-accounts/   # Gmail 계정 연결(OAuth)
│           ├── mail/
│           │   ├── providers/    # gmail.provider.ts — 새 메일 서비스는 모듈만 추가
│           │   ├── rules/        # 조건 기반 규칙 엔진
│           │   └── candidates/   # 후보 메일 대기함 / 승인 플로우
│           ├── notifications/
│           │   └── channels/     # in-app (확장 시 push/email/slack 추가 가능)
│           └── common/
│               ├── crypto/       # Argon2id + AES-256-GCM (CryptoService)
│               └── logging/
├── packages/shared-types/        # 프론트/백엔드 공용 TypeScript 타입
├── prisma/schema.prisma          # DB 스키마 (ERD 아래 참고)
└── docker-compose.yml            # Postgres 로컬 구동
```

**요청 흐름 (예: 계정 비밀번호 조회)**

```
브라우저 (Next.js, :3000)
   │  fetch(credentials: "include")
   ▼
NestJS API (:3001, /api/v1)
   │  세션 쿠키로 사용자 식별 → UnlockedGuard로 "마스터 비밀번호 잠금 해제 상태" 확인
   ▼
AccountsService → Prisma → PostgreSQL (encrypted_password 컬럼)
   │  UnlockKeyStoreService에서 세션ID로 AES 키를 조회해 복호화 (키는 DB에 없음)
   ▼
복호화된 비밀번호를 세션 응답으로만 반환 (평문은 저장되지 않음)
```

### 주요 데이터 모델

`User(구글 로그인 신원) — Account(사이트 계정) / EmailAccount(연결된 Gmail) —
EmailRule(규칙) — EmailRuleCondition(조건 1~5개) — EmailCandidate(후보 메일)`
구조로, `providerType` / `conditionType` / `actionType` / `channelType`을 Prisma enum이
아닌 String으로 두어 **스키마 변경 없이 새 값만 추가**하면 기능이 확장되도록 설계했습니다
(예: Gmail 외 메일 서비스 추가, 새 규칙 조건 추가, 새 알림 채널 추가).

## 5. 보안 설계 (이 프로젝트의 핵심)

가장 공들인 부분입니다. **"앱 로그인"과 "데이터 열람 자격"을 완전히 분리된 두 단계**로
설계했습니다 — 한쪽이 뚫려도 다른 쪽 없이는 데이터를 열 수 없게 하기 위함입니다.

- **1단계, 신원 확인 — Google OAuth 로그인**: "누가" 접속했는지만 확인. 비밀번호 저장/재설정
  기능을 직접 만들지 않아도 되는 부수 효과도 있습니다.
- **2단계, 데이터 열람 자격 — 마스터 비밀번호**: Google 계정과 **절대 연결하지 않습니다.**
  "구글 이메일로 마스터 비밀번호 재설정" 같은 기능을 의도적으로 만들지 않았는데, 이런 기능이
  있으면 구글 계정이 뚫렸을 때 마스터 비밀번호까지 우회할 수 있어 두 단계를 분리한 의미가
  없어지기 때문입니다.

**암호화 키를 세션(DB)에 절대 넣지 않는 구조**: 마스터 비밀번호에서 Argon2id로 유도한
AES-256 키는 `UnlockKeyStoreService`라는 별도의 서버 메모리 저장소에만 존재합니다. 세션
정보는 Postgres 테이블(`connect-pg-simple`)에 저장되지만, 이 키는 거기 들어가지 않습니다.
DB가 통째로 유출되어도 이미 로그인된 세션의 평문 접근 키까지 같이 새어나가지 않게 하기
위한 설계이며, 대가로 서버 프로세스가 재시작되면 모든 세션이 다시 "잠금" 상태로 돌아가는데
이건 의도된 동작입니다.

**WebAuthn PRF 확장을 이용한 생체인증**: 지문/Face ID는 마스터 비밀번호를 "대체"하는 게
아니라 "타이핑을 생략"해줄 뿐입니다. 구현 방식이 핵심인데, 감싸진 마스터 비밀번호를
매번 WebAuthn PRF 확장으로 다시 유도되는 대칭키로 감싸서 브라우저 IndexedDB에 저장합니다.
즉 raw 키 자체는 저장되지 않고, **생체인증에 성공하는 순간에만 존재하는 유도값**이라
IndexedDB가 통째로 털려도 아무것도 복호화할 수 없습니다. 등록되지 않은 새 기기에서는
항상 마스터 비밀번호가 필요합니다.

**마스터 비밀번호 복구 정책 — 의도적으로 "복구 불가"를 선택**: Bitwarden류의 복구 키
발급(key-wrapping) 방식도 검토했지만, 1인용 도구 규모에서는 별도 복구 시스템을 설계·구현·
유지하는 비용이 이득보다 크고 복구 키 자체가 새로운 유출 지점이 된다고 판단해 채택하지
않았습니다. 대신 (1) 마스터 비밀번호를 잊으면 데이터가 영구히 복구 불가능함을 정책으로
명시하고, (2) WebAuthn 등록으로 일상적으로 비밀번호를 다시 타이핑할 일 자체를 줄여
"잊어버릴" 상황을 최소화하는 방식(제로 구현 비용)을 함께 채택했습니다. 이건 리스크가
아니라 트레이드오프를 검토하고 내린 의도된 설계 결정입니다.

**Gmail 토큰만 예외적으로 서버 관리 키 사용**: 사이트 비밀번호(Account)는 마스터
비밀번호로만 풀리는 완전한 제로놀리지 구조를 유지하지만, Gmail의 access/refresh 토큰은
서버가 별도로 관리하는 키(`GMAIL_TOKEN_ENCRYPTION_KEY`, 환경변수로만 관리)로 암호화합니다.
"아침에 열어보면 이미 정리되어 있다"는 자동 백그라운드 스캔 경험이, 마스터 비밀번호 유도
키(잠금 해제된 세션에만 존재)로는 새벽 시간대에 원천적으로 불가능하기 때문에 내린
트레이드오프입니다. 두 토큰(access/refresh)을 별도 컬럼으로 암호화해, 자주 갱신되는
access token만 재암호화하고 수명이 긴 refresh token은 불필요하게 노출되지 않게 했습니다.

**데이터 백업/내보내기의 별도 암호화**: 처음에는 평문 JSON으로 내보내는 안을 검토했지만,
"내 PC가 해킹당하면 디스크에 남은 백업 파일 자체가 새로운 공격 표면이 된다"는 문제를
스스로 지적하고 설계를 변경했습니다. 최종적으로 내보내기 시점에 **마스터 비밀번호와
독립된 별도의 "내보내기 비밀번호"** 로 재암호화한 파일을 생성하도록 구현해, 파일이
유출되어도 내보내기 비밀번호 없이는 무의미한 암호문일 뿐이게 만들었습니다.

## 6. 원격 상시 접속 환경 구축

집 안에서만 켜둔 서버를 외부에서도 안전하게 쓸 수 있도록 다음을 직접 구성했습니다.

- **Tailscale**: 공인 인터넷에 포트를 열지 않고, WireGuard 기반 사설 네트워크(tailnet)로만
  접근 가능하게 구성. Tailscale의 MagicDNS + 무료 HTTPS 인증서(Let's Encrypt 연동) 기능으로
  `https://<device>.<tailnet>.ts.net` 형태의 진짜 HTTPS 주소를 확보했습니다.
- **포트 분리 유지**: 기존 로컬 개발 구조(프론트 3000 / 백엔드 3001, CORS로 분리)를 그대로
  살려 `tailscale serve`로 443→3000, 8443→3001을 각각 프록시했습니다.
- **트러블슈팅 사례**: 처음엔 개발 모드(HMR 웹소켓)가 Tailscale의 HTTPS 프록시를 통과하지
  못해 화면은 정상 렌더링되지만 클릭 이벤트가 전혀 붙지 않는(하이드레이션 실패) 문제를
  겪었습니다. 브라우저 콘솔의 반복적인 WebSocket 연결 실패 로그를 근거로 원인을 특정하고,
  프론트엔드를 프로덕션 빌드(`next build` + `next start`)로 전환해 HMR 의존성 자체를
  제거하는 방식으로 해결했습니다.
- **pm2 + launchd**: API/웹 서버를 pm2로 등록해 터미널을 닫아도 계속 구동되게 하고,
  `pm2 startup`으로 macOS launchd에 등록해 재부팅 후에도 자동 복구되도록 구성했습니다.

## 7. 주요 API (발췌)

베이스 경로 `/api/v1`, 세션 쿠키 기반 인증. 잠금 해제되지 않은 세션은 계정 관련 API에서 401.

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/auth/google/start` / `/auth/google/callback` | 앱 로그인 (Google OAuth) |
| POST | `/auth/master-password/setup` / `/auth/unlock` | 마스터 비밀번호 최초 설정 / 잠금 해제 |
| POST | `/auth/webauthn/register`, `/authenticate` | 생체인증 등록 / 인증 |
| GET/POST/PUT/DELETE | `/accounts` | 계정 CRUD |
| POST | `/accounts/generate-password` | 비밀번호 생성기 |
| POST | `/accounts/export`, `/accounts/import` | 암호화 백업 내보내기/복원 |
| GET | `/email-accounts/oauth/start`, `/callback` | Gmail 계정 연결 (OAuth) |
| GET/POST/PUT/DELETE | `/email-rules` | 메일 분류 규칙 CRUD (조건 1~5개, AND/OR) |
| GET | `/email-candidates?status=pending` | 오늘의 검토함 |
| POST | `/email-candidates/:id/approve`, `/exclude` | 개별 승인/제외 |
| POST | `/email-candidates/approve-all` | 전체 승인 |
| GET | `/notifications/summary` | 계정별 중요 메일 집계 (대시보드) |

## 8. 확장 가능하게 설계한 지점

- **메일 Provider 플러그인 구조**: 규칙 엔진/승인 플로우는 공통 코어, "Gmail에서 메일을
  읽고 처리하는 방법"만 Provider 모듈로 분리. 다른 메일 서비스 추가 시 `providerType` 값
  하나와 Provider 모듈만 새로 구현하면 됩니다.
- **규칙 조건 확장**: `condition_type`에 새 값만 추가하면 정규식, 메일 크기 등 새 조건
  종류를 스키마 변경 없이 추가 가능.
- **알림 채널 확장**: 현재 인앱 요약뿐이지만 `channel_type` 값 추가로 push/email/슬랙 등을
  나중에 채널 모듈만 얹어서 확장 가능.
- **클라이언트 확장**: 백엔드를 프론트와 분리된 API 서버로 둬서, 나중에 모바일 앱/브라우저
  확장이 생겨도 같은 API를 재사용 가능.

## 9. 로컬 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. Postgres 실행
docker compose up -d

# 3. 환경변수 설정
cp .env.example .env   # Google OAuth 클라이언트 등 값 채우기

# 4. DB 마이그레이션
npx prisma migrate dev

# 5. 개발 서버 실행 (각각 별도 터미널)
npm run start:dev --workspace=apps-api   # http://localhost:3001
npm run dev --workspace=apps-web         # http://localhost:3000
```

## 10. 향후 계획 (Phase 4, 보류)

현재 핵심 기능(Phase 1~3: 계정 관리, Gmail 연동, 승인 플로우)은 완성된 상태이며, 아래는
의도적으로 후순위로 미뤄둔 확장 과제입니다.

- 비밀번호 재사용 탐지 (동일 비밀번호를 여러 사이트에 쓰고 있을 때 경고)
- 2단계 인증(OTP) 도입
- 모바일 최적화 / PWA
- 브라우저 확장 연동 (자동 로그인 입력)
- 카카오 계정 관리 범위 확대 (카카오톡 메시지 자동화는 공식 API 미지원으로 범위 제외)

---

*개인 사용 목적의 1인 개발 프로젝트로, 기획서·기술설계서 작성부터 보안 설계, 백엔드/프론트엔드
구현, 원격 접속 인프라 구축까지 전 과정을 직접 진행했습니다.*
