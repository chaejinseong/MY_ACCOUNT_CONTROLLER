import { Injectable } from '@nestjs/common';
import { MailProvider, RawMailMessage } from './mail-provider.interface';

// TODO: googleapis 연동, OAuth 토큰 갱신, 실제 Gmail API 호출 미구현.
// 지금은 Provider 구조가 실제로 갈아 끼워지는지 확인하는 단계의 뼈대.
@Injectable()
export class GmailProvider implements MailProvider {
  providerType = 'gmail';

  async listCandidateMessages(_emailAccountId: string): Promise<RawMailMessage[]> {
    return [];
  }

  async applyAction(
    _emailAccountId: string,
    _externalMessageId: string,
    _action: 'delete' | 'spam',
  ): Promise<void> {
    return;
  }
}
