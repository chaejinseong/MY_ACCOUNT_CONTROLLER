import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// LoggedInGuard 또는 UnlockedGuard가 먼저 세션에 userId가 있는지 확인해둔 라우트에서만 쓴다.
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.session.userId as string;
});
