import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
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

  // 기술설계서 3.2: 비밀번호 생성기. 잠금 해제된 세션이면 누구나 호출 가능 (암호화 키는 안 씀).
  @Post('generate-password')
  generatePassword(
    @Body()
    options: {
      length?: number;
      includeUppercase?: boolean;
      includeLowercase?: boolean;
      includeNumbers?: boolean;
      includeSymbols?: boolean;
    },
  ) {
    return this.accountsService.generatePassword(options ?? {});
  }

  // 기획서 "백업/내보내기": 마스터 비밀번호로 잠금 해제된 세션에서만 호출 가능.
  @Post('export')
  exportAccounts(
    @CurrentUserId() userId: string,
    @EncryptionKey() encryptionKey: Buffer,
    @Body() body: { exportPassword: string },
  ) {
    return this.accountsService.exportAccounts(userId, encryptionKey, body.exportPassword);
  }

  @Post('import')
  importAccounts(
    @CurrentUserId() userId: string,
    @EncryptionKey() encryptionKey: Buffer,
    @Body() body: { exportPassword: string; file: { version: number; salt: string; payload: string } },
  ) {
    return this.accountsService.importAccounts(userId, encryptionKey, body.exportPassword, body.file);
  }

  @Put(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @EncryptionKey() encryptionKey: Buffer,
    @Body() body: any,
  ) {
    return this.accountsService.update(userId, id, encryptionKey, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.accountsService.remove(userId, id);
    return { removed: true };
  }
}
