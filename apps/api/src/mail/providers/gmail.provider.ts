import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { gmail_v1, google } from 'googleapis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { GmailTokenKeyService } from '../../common/crypto/gmail-token-key.service';
import { MailProvider, RawMailMessage } from './mail-provider.interface';

@Injectable()
export class GmailProvider implements MailProvider {
  providerType = 'gmail';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokenKey: GmailTokenKeyService,
  ) {}

  // 토큰이 만료 임박이면 google-auth-library가 refresh_token으로 알아서 새 access_token을
  // 받아온다 — 그러면 DB에 저장된 암호문도 같이 갱신해서 다음 호출 때 재사용한다.
  private async getAuthorizedClient(emailAccountId: string): Promise<OAuth2Client> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({ where: { id: emailAccountId } });
    const key = this.tokenKey.key;

    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
    client.setCredentials({
      access_token: this.crypto.decrypt(account.encryptedAccessToken, key),
      refresh_token: this.crypto.decrypt(account.encryptedRefreshToken, key),
      expiry_date: account.tokenExpiresAt?.getTime(),
    });

    const previousAccessToken = client.credentials.access_token;
    await client.getAccessToken(); // 만료 임박이면 내부적으로 자동 갱신
    if (client.credentials.access_token && client.credentials.access_token !== previousAccessToken) {
      await this.prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          encryptedAccessToken: this.crypto.encrypt(client.credentials.access_token, key),
          tokenExpiresAt: client.credentials.expiry_date ? new Date(client.credentials.expiry_date) : null,
        },
      });
    }

    return client;
  }

  async listCandidateMessages(emailAccountId: string): Promise<RawMailMessage[]> {
    const auth = await this.getAuthorizedClient(emailAccountId);
    const gmail = google.gmail({ version: 'v1', auth });

    // 기획서 3.4.2: 주기적 스캔이라 매번 전체 메일함이 아니라 최근 것만 본다.
    const list = await gmail.users.messages.list({ userId: 'me', maxResults: 50, q: 'newer_than:7d' });
    const messageIds = list.data.messages ?? [];

    const messages = await Promise.all(
      messageIds.map(async (m) => {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: m.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return this.toRawMailMessage(full.data);
      }),
    );

    return messages;
  }

  async applyAction(emailAccountId: string, externalMessageId: string, action: 'delete' | 'spam'): Promise<void> {
    const auth = await this.getAuthorizedClient(emailAccountId);
    const gmail = google.gmail({ version: 'v1', auth });

    if (action === 'delete') {
      // 영구 삭제가 아니라 휴지통으로 이동 — 기획서 3.4.1 "이 시점에는 실제 메일함을
      // 건드리지 않는다"는 후보 적재 단계 얘기고, 승인 이후엔 실제로 옮기는 게 맞다.
      await gmail.users.messages.trash({ userId: 'me', id: externalMessageId });
    } else {
      await gmail.users.messages.modify({
        userId: 'me',
        id: externalMessageId,
        requestBody: { addLabelIds: ['SPAM'] },
      });
    }
  }

  private toRawMailMessage(message: gmail_v1.Schema$Message): RawMailMessage {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    return {
      externalMessageId: message.id!,
      sender: header('From'),
      subject: header('Subject'),
      bodyPreview: message.snippet ?? '',
      receivedAt: header('Date') ? new Date(header('Date')) : new Date(Number(message.internalDate ?? 0)),
      hasAttachment: (message.payload?.parts ?? []).some((part) => !!part.filename),
    };
  }
}
