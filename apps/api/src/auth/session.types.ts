import 'express-session';

// express-session 세션 하나에 실릴 수 있는 값들. 마스터 비밀번호에서 유도한 암호화 키는
// 절대 여기 넣지 않는다 — 이 값들은 Postgres 세션 테이블에 그대로 저장되기 때문이다
// (키는 UnlockKeyStoreService가 서버 프로세스 메모리에만 들고 있는다).
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    unlocked?: boolean;
    oauthState?: string;
    gmailOAuthState?: string;
    pendingGoogle?: {
      sub: string;
      email: string;
    };
    currentWebauthnChallenge?: string;
  }
}
