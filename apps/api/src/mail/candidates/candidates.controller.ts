import { Controller, Get, Param, Post } from '@nestjs/common';
import { CandidatesService } from './candidates.service';

@Controller('email-candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  findPending() {
    return this.candidatesService.findPending();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.candidatesService.approve(id);
  }

  @Post(':id/exclude')
  exclude(@Param('id') id: string) {
    return this.candidatesService.exclude(id);
  }
}
