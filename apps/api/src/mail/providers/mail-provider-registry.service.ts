import { Injectable, NotFoundException } from '@nestjs/common';
import { MailProvider } from './mail-provider.interface';
import { GmailProvider } from './gmail.provider';

// 기획서 9.1 "Provider 플러그인 구조"의 실제 조회 지점 — 호출하는 쪽(CandidatesService 등)이
// GmailProvider를 직접 알 필요 없이 EmailAccount.providerType 문자열만으로 찾게 한다.
// 새 메일 서비스를 추가하면 여기 생성자에 한 줄만 더 등록하면 된다.
@Injectable()
export class MailProviderRegistryService {
  private readonly providers: Map<string, MailProvider>;

  constructor(gmailProvider: GmailProvider) {
    this.providers = new Map([[gmailProvider.providerType, gmailProvider]]);
  }

  get(providerType: string): MailProvider {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new NotFoundException(`지원하지 않는 메일 provider입니다: ${providerType}`);
    }
    return provider;
  }
}
