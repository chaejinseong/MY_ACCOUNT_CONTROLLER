import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// DB 접근을 위한 공용 서비스. 다른 모든 모듈은 PrismaClient를 직접 만들지 않고
// 이 서비스를 주입받아 쓴다 (기술설계서 5장 common/ 폴더 구조 참고).
// Prisma 7부터 datasource url을 schema.prisma가 아니라 adapter로 런타임에 넘겨야 한다
// (CLI 쪽 설정은 prisma.config.ts 참고).
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
