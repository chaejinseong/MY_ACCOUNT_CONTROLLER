import { Controller, Delete, Get, HttpCode, Logger, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EmailAccountsService } from './email-accounts.service';
import { GmailOAuthService } from './gmail-oauth.service';
import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';

@Controller('email-accounts')
export class EmailAccountsController {
  private readonly logger = new Logger(EmailAccountsController.name);

  constructor(
    private readonly emailAccountsService: EmailAccountsService,
    private readonly gmailOAuth: GmailOAuthService,
  ) {}

  @Get()
  @UseGuards(LoggedInGuard)
  findAll(@CurrentUserId() userId: string) {
    return this.emailAccountsService.findAll(userId);
  }

  // Gmail 토큰은 서버 관리 키로 암호화되므로(기술설계서 7.2 옵션 a) 세션 잠금 해제 없이
  // 로그인만 되어 있으면 연동을 시작할 수 있다.
  @Get('oauth/start')
  @UseGuards(LoggedInGuard)
  oauthStart(@Req() req: Request) {
    const state = this.gmailOAuth.generateState();
    req.session.gmailOAuthState = state;
    return { url: this.gmailOAuth.buildAuthUrl(state) };
  }

  // Google이 브라우저를 이 URL로 리다이렉트시켜서 들어오는 요청이라 가드 대신 수동으로
  // 세션 상태를 확인하고, 결과와 무관하게 항상 프론트로 302 리다이렉트한다
  // (auth.controller.ts의 google/callback과 동일한 패턴).
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    const redirect = (path: string) => res.redirect(`${frontendOrigin}${path}`);

    try {
      if (!state || state !== req.session.gmailOAuthState) {
        throw new Error('OAuth state가 일치하지 않습니다.');
      }
      delete req.session.gmailOAuthState;

      if (!userId) {
        throw new Error('로그인이 필요합니다.');
      }

      const tokens = await this.gmailOAuth.exchangeCodeForTokens(code);
      await this.emailAccountsService.createFromGmail(userId, tokens);

      redirect('/mail/rules?connected=1');
    } catch (err: any) {
      this.logger.error(`Gmail OAuth 콜백 실패: ${err.message}`, err.stack);
      redirect(`/mail/rules?error=${encodeURIComponent(err.message ?? 'Gmail 연동에 실패했습니다.')}`);
    }
  }

  @Delete(':id')
  @UseGuards(LoggedInGuard)
  @HttpCode(200)
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.emailAccountsService.remove(userId, id);
    return { removed: true };
  }
}
