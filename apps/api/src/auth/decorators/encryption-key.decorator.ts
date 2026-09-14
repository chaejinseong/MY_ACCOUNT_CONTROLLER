import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// UnlockedGuard가 req.encryptionKey를 채워둔 뒤에만 값이 있다 — 이 데코레이터를 쓰는
// 라우트에는 반드시 @UseGuards(UnlockedGuard)를 같이 붙여야 한다.
export const EncryptionKey = createParamDecorator((_: unknown, ctx: ExecutionContext): Buffer => {
  const req = ctx.switchToHttp().getRequest<Request & { encryptionKey: Buffer }>();
  return req.encryptionKey;
});
