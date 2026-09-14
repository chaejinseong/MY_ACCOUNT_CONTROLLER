import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { WebAuthnService } from './webauthn.service';
import { UnlockKeyStoreService } from './unlock-key-store.service';
import { UnlockedGuard } from './guards/unlocked.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthService, WebAuthnService, UnlockKeyStoreService, UnlockedGuard],
  exports: [UnlockKeyStoreService, UnlockedGuard],
})
export class AuthModule {}
