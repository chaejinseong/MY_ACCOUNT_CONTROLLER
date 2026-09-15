import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { EmailAccountsModule } from './email-accounts/email-accounts.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    AuthModule,
    AccountsModule,
    EmailAccountsModule,
    MailModule,
    NotificationsModule,
  ],
})
export class AppModule {}
