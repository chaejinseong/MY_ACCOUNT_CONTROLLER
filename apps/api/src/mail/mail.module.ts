import { Module } from '@nestjs/common';
import { RulesController } from './rules/rules.controller';
import { RulesService } from './rules/rules.service';
import { CandidatesController } from './candidates/candidates.controller';
import { CandidatesService } from './candidates/candidates.service';
import { ScanSchedulerService } from './candidates/scan-scheduler.service';
import { GmailProvider } from './providers/gmail.provider';
import { MailProviderRegistryService } from './providers/mail-provider-registry.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RulesController, CandidatesController],
  providers: [RulesService, CandidatesService, ScanSchedulerService, GmailProvider, MailProviderRegistryService],
})
export class MailModule {}
