import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { UnlockedGuard } from '../auth/guards/unlocked.guard';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';
import { EncryptionKey } from '../auth/decorators/encryption-key.decorator';

// 기술설계서 3장: 계정/비밀번호 API는 전부 "마스터 비밀번호로 잠금 해제된 세션"이 전제.
@UseGuards(UnlockedGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll(
    @CurrentUserId() userId: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
  ) {
    return this.accountsService.findAll(userId, category, q);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @EncryptionKey() encryptionKey: Buffer,
  ) {
    return this.accountsService.findOne(userId, id, encryptionKey);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @EncryptionKey() encryptionKey: Buffer,
    @Body() body: any,
  ) {
    return this.accountsService.create(userId, encryptionKey, body);
  }
}
