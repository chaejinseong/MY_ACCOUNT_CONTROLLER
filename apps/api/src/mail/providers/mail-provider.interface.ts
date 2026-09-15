// 기획서 9.1 "Provider 플러그인 구조": 새 메일 서비스를 추가할 때 이 인터페이스만
// 구현하면 규칙 엔진/승인 플로우 등 공통 코어는 그대로 재사용할 수 있다.
//
// EmailAccount에 저장된 access/refresh 토큰은 서버 관리 키(GmailTokenKeyService, 기술설계서
// 7.2 옵션 a)로 암호화돼 있다 — 마스터 비밀번호/세션 잠금 상태와 무관하게 Provider가 항상
// 복호화할 수 있다. Account(사이트 비밀번호)와 달리 자동 백그라운드 스캔을 지원하기 위한
// 의도적 설계다.
export interface MailProvider {
  providerType: string; // 'gmail' 등
  listCandidateMessages(emailAccountId: string): Promise<RawMailMessage[]>;
  applyAction(emailAccountId: string, externalMessageId: string, action: 'delete' | 'spam'): Promise<void>;
}

export interface RawMailMessage {
  externalMessageId: string;
  sender: string;
  subject: string;
  bodyPreview: string;
  receivedAt: Date;
  hasAttachment: boolean;
}
