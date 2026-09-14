// Prisma 7부터 datasource url을 schema.prisma가 아니라 여기서 관리한다.
// (prisma generate/migrate 등 CLI 전용 설정 — 런타임 PrismaClient는 adapter로 따로 연결한다.)
// Prisma 7 CLI는 더 이상 .env를 자동으로 읽지 않으므로 여기서 직접 로드한다.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
