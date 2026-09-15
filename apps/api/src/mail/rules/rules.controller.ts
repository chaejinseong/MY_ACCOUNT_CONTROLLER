import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RulesService } from './rules.service';
import { UnlockedGuard } from '../../auth/guards/unlocked.guard';
import { CurrentUserId } from '../../auth/decorators/current-user-id.decorator';

// 메일 규칙은 계정 목록만큼은 아니어도 사용자의 메일 처리 방식을 드러내는 정보라
// 계정/비밀번호 API와 동일하게 잠금 해제된 세션을 요구한다.
@UseGuards(UnlockedGuard)
@Controller('email-rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  findAll(@CurrentUserId() userId: string, @Query('emailAccountId') emailAccountId?: string) {
    return this.rulesService.findAll(userId, emailAccountId);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: any) {
    return this.rulesService.create(userId, body);
  }
}
