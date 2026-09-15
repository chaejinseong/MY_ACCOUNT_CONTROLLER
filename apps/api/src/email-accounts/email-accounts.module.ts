import { Module } from '@nestjs/common';
import { EmailAccountsController } from './email-accounts.controller';
import { EmailAccountsService } from './email-accounts.service';
import { GmailOAuthService } from './gmail-oauth.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EmailAccountsController],
  providers: [EmailAccountsService, GmailOAuthService],
})
export class EmailAccountsModule {}
