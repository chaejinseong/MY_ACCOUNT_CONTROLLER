import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { GmailTokenKeyService } from './gmail-token-key.service';

@Global()
@Module({
  providers: [CryptoService, GmailTokenKeyService],
  exports: [CryptoService, GmailTokenKeyService],
})
export class CryptoModule {}
