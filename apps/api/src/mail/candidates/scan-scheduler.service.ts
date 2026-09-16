import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CandidatesService } from './candidates.service';

// 기획서 3.4.2 "등록된 Gmail 계정들을 주기적으로(예: 몇 시간 간격) 스캔". Gmail 토큰이 서버
// 관리 키로 암호화되어 있어(기술설계서 7.2 옵션 a) 세션 잠금 상태와 무관하게 동작할 수 있다.
@Injectable()
export class ScanSchedulerService {
  private readonly logger = new Logger(ScanSchedulerService.name);

  constructor(private readonly candidatesService: CandidatesService) {}

  @Cron(CronExpression.EVERY_3_HOURS)
  async handleScheduledScan(): Promise<void> {
    this.logger.log('예약된 메일 스캔 시작');
    const result = await this.candidatesService.scanAll();
    this.logger.log(
      `예약된 메일 스캔 완료 — 계정 ${result.scannedAccounts}개 스캔, 후보 ${result.createdCandidates}건 생성` +
        (result.failedAccounts > 0 ? `, ${result.failedAccounts}개 계정 실패` : ''),
    );
  }
}
