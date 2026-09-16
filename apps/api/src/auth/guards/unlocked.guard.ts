import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { UnlockKeyStoreService } from '../unlock-key-store.service';

// 기술설계서 3장: "마스터 비밀번호로 잠금 해제되지 않은 세션은 계정/비밀번호 관련
// API에서 401을 반환한다". session.unlocked 플래그와 실제 메모리 키 존재 여부를 함께
// 확인한다 (서버 재시작으로 키만 사라지고 세션 쿠키/DB 레코드는 남아 있는 경우 대비).
// touch()는 idle 타임아웃(자동 잠금, 기획서 3.3)도 함께 검사한다 — 타임아웃을 넘겼으면
// 키가 사라진 것과 동일하게 취급하고 세션 플래그도 맞춰준다.
@Injectable()
export class UnlockedGuard implements CanActivate {
  constructor(private readonly unlockKeyStore: UnlockKeyStoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session?.userId) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const key = this.unlockKeyStore.touch(req.session.id);
    if (!req.session.unlocked || !key) {
      req.session.unlocked = false;
      throw new UnauthorizedException('마스터 비밀번호로 잠금 해제가 필요합니다.');
    }

    (req as Request & { encryptionKey: Buffer }).encryptionKey = key;
    return true;
  }
}
