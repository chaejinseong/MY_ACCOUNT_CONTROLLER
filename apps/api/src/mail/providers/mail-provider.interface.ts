// 기획서 9.1 "Provider 플러그인 구조": 새 메일 서비스를 추가할 때 이 인터페이스만
// 구현하면 규칙 엔진/승인 플로우 등 공통 코어는 그대로 재사용할 수 있다.
export interface MailProvider {
  providerType: string; // 'gmail' 등
  listCandidateMessages(emailAccountId: string): Promise<RawMailMessage[]>;
  applyAction(
    emailAccountId: string,
    externalMessageId: string,
    action: 'delete' | 'spam',
  ): Promise<void>;
}

export interface RawMailMessage {
  externalMessageId: string;
  sender: string;
  subject: string;
  bodyPreview: string;
  receivedAt: Date;
  hasAttachment: boolean;
}
