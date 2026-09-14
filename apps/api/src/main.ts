import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

// nest CLI/컴파일된 dist 어디서 실행하든(cwd가 apps/api든 repo root든) 루트 .env를 항상
// 찾도록 __dirname 기준 상대 경로로 로드한다. prisma.config.ts는 CLI 전용이라 이 런타임
// 진입점에서는 별도로 로드해야 한다.
loadEnv({ path: join(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { AppModule } from './app.module';

// 기술설계서 1장: httpOnly 쿠키 기반 서버 세션, 세션 저장소는 Postgres 테이블
// (connect-pg-simple이 최초 실행 시 자동 생성). 마스터 비밀번호 유도 키는 여기 담기지
// 않는다 — auth/unlock-key-store.service.ts가 별도로 서버 메모리에만 보관한다.
function buildSessionMiddleware() {
  const PgSession = connectPgSimple(session);
  const store = new PgSession({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    createTableIfMissing: true,
  });

  return session({
    store,
    secret: process.env.SESSION_SECRET ?? 'dev-only-change-me',
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14일
    },
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // apps/web이 다른 포트(3000)에서 서비스되는 크로스 오리진 요청이라 CORS가 필요하다.
  // credentials: true가 없으면 httpOnly 세션 쿠키가 브라우저에서 아예 실리지 않는다.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.use(buildSessionMiddleware());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
