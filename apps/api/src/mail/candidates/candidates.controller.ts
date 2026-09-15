import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { UnlockedGuard } from '../../auth/guards/unlocked.guard';
import { CurrentUserId } from '../../auth/decorators/current-user-id.decorator';

// 후보 메일에는 발신자/제목이 드러나므로 RulesController와 동일하게 잠금 해제된 세션을
// 요구한다 — Gmail 토큰 자체는 서버 관리 키라 기술적으로는 필요 없지만(candidates.service.ts
// 참고) 이건 정책적 선택이다.
@UseGuards(UnlockedGuard)
@Controller('email-candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  findPending(@CurrentUserId() userId: string) {
    return this.candidatesService.findPending(userId);
  }

  @Post('scan')
  scan(@CurrentUserId() userId: string) {
    return this.candidatesService.scan(userId);
  }

  @Get('important-summary')
  importantSummary(@CurrentUserId() userId: string) {
    return this.candidatesService.importantSummary(userId);
  }

  @Post(':id/approve')
  approve(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.approve(userId, id);
  }

  @Post(':id/exclude')
  exclude(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.exclude(userId, id);
  }
}
