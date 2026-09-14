import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global로 등록해서 각 feature 모듈에서 매번 import하지 않아도 PrismaService를 쓸 수 있게 한다.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
