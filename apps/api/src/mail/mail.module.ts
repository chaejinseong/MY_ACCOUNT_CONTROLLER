import { Module } from '@nestjs/common';
import { RulesController } from './rules/rules.controller';
import { RulesService } from './rules/rules.service';
import { CandidatesController } from './candidates/candidates.controller';
import { CandidatesService } from './candidates/candidates.service';
import { GmailProvider } from './providers/gmail.provider';

@Module({
  controllers: [RulesController, CandidatesController],
  providers: [RulesService, CandidatesService, GmailProvider],
})
export class MailModule {}
