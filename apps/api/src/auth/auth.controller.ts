import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { LoggedInGuard } from './guards/logged-in.guard';
import { UnlockedGuard } from './guards/unlocked.guard';
import { CurrentUserId } from './decorators/current-user-id.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  @Get('google/start')
  googleStart(@Req() req: Request) {
    return { url: this.authService.createGoogleAuthUrl(req.session) };
  }

  // apps/web의 /login 화면으로 되돌려보낸다 — step 쿼리로 다음에 뭘 보여줄지 알려준다.
  // (신규 사용자는 마스터 비밀번호 설정, 기존 사용자는 잠금해제 입력.)
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    try {
      const result = await this.authService.handleGoogleCallback(code, state, req.session);
      const step = result.status === 'needs_master_password_setup' ? 'setup' : 'unlock';
      res.redirect(`${frontendOrigin}/login?step=${step}`);
    } catch (err: any) {
      const message = err?.message ?? '로그인에 실패했습니다.';
      res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(message)}`);
    }
  }

  // 최초 Google 로그인 직후, 아직 마스터 비밀번호가 없는 사용자를 위한 최초 설정 라우트.
  // 기술설계서 3.1에는 명시돼 있지 않던 엔드포인트라 문서에도 같이 추가했다 (User 생성 시점 문제).
  @Post('master-password/setup')
  async setupMasterPassword(@Body('password') password: string, @Req() req: Request) {
    return this.authService.setupMasterPassword(req.session, password);
  }

  @Post('unlock')
  @UseGuards(LoggedInGuard)
  @HttpCode(200)
  async unlock(@Body('password') password: string, @Req() req: Request, @CurrentUserId() userId: string) {
    await this.authService.unlock(req.session, userId, password);
    return { unlocked: true };
  }

  @Post('lock')
  @UseGuards(LoggedInGuard)
  @HttpCode(200)
  lock(@Req() req: Request) {
    this.authService.lock(req.session);
    return { unlocked: false };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.authService.logout(req.session);
    req.session.destroy(() => {});
    res.clearCookie('sid');
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(LoggedInGuard)
  me(@Req() req: Request) {
    return { userId: req.session.userId, unlocked: !!req.session.unlocked };
  }

  // --- WebAuthn: 신뢰된 기기에서 마스터 비밀번호 "타이핑"을 생략해주는 기능.

  @Get('webauthn/devices')
  @UseGuards(UnlockedGuard)
  async webauthnDevices(@CurrentUserId() userId: string) {
    return this.webAuthnService.listDevices(userId);
  }

  @Post('webauthn/register-options')
  @UseGuards(UnlockedGuard)
  @HttpCode(200)
  async webauthnRegisterOptions(@CurrentUserId() userId: string, @Req() req: Request) {
    const options = await this.webAuthnService.createRegistrationOptions(userId);
    req.session.currentWebauthnChallenge = options.challenge;
    return options;
  }

  @Post('webauthn/register')
  @UseGuards(UnlockedGuard)
  async webauthnRegister(
    @CurrentUserId() userId: string,
    @Body('deviceLabel') deviceLabel: string,
    @Body('response') response: RegistrationResponseJSON,
    @Req() req: Request,
  ) {
    const expectedChallenge = req.session.currentWebauthnChallenge;
    if (!expectedChallenge) {
      throw new UnauthorizedException('먼저 register-options를 호출해주세요.');
    }
    delete req.session.currentWebauthnChallenge;
    const device = await this.webAuthnService.verifyRegistration(userId, deviceLabel, expectedChallenge, response);
    return { id: device.id, deviceLabel: device.deviceLabel };
  }

  @Post('webauthn/authenticate-options')
  @HttpCode(200)
  async webauthnAuthenticateOptions(@Req() req: Request) {
    const options = await this.webAuthnService.createAuthenticationOptions();
    req.session.currentWebauthnChallenge = options.challenge;
    return options;
  }

  // 생체인증 성공 = "타이핑을 생략"했을 뿐, 마스터 비밀번호 자체는 여전히 서버가 검증한다
  // (기획서 7장 원칙 유지). password는 apps/web이 WebAuthn PRF 확장으로 유도한 키로
  // 기기 로컬(IndexedDB)에 감싸둔 값을 생체인증 통과 직후 복호화해 보내준 것이다
  // (apps/web/src/lib/webauthn.ts 참고) — 서버는 그 과정을 전혀 모르고 그냥 검증만 한다.
  @Post('webauthn/authenticate')
  @HttpCode(200)
  async webauthnAuthenticate(
    @Body('response') response: AuthenticationResponseJSON,
    @Body('password') password: string,
    @Req() req: Request,
  ) {
    const expectedChallenge = req.session.currentWebauthnChallenge;
    if (!expectedChallenge) {
      throw new UnauthorizedException('먼저 authenticate-options를 호출해주세요.');
    }
    delete req.session.currentWebauthnChallenge;

    const device = await this.webAuthnService.verifyAuthentication(expectedChallenge, response);
    req.session.userId = device.userId;
    await this.authService.unlock(req.session, device.userId, password);
    return { unlocked: true };
  }

  @Delete('webauthn/:deviceId')
  @UseGuards(UnlockedGuard)
  @HttpCode(200)
  async webauthnRemove(@CurrentUserId() userId: string, @Param('deviceId') deviceId: string) {
    await this.webAuthnService.removeDevice(userId, deviceId);
    return { removed: true };
  }
}
