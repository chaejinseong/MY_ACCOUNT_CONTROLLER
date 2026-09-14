import { Injectable } from '@nestjs/common';

// 마스터 비밀번호에서 유도한 AES 키는 세션 저장소(Postgres)에 절대 넣지 않는다 —
// 세션 쿠키나 DB가 털려도 이 키만은 서버 프로세스 메모리 밖으로 나가지 않게 하기 위함이다.
// 따라서 서버가 재시작되면 모든 세션은 다시 "잠금" 상태로 돌아간다 (의도된 동작).
@Injectable()
export class UnlockKeyStoreService {
  private readonly keysBySessionId = new Map<string, Buffer>();

  set(sessionId: string, key: Buffer): void {
    this.keysBySessionId.set(sessionId, key);
  }

  get(sessionId: string): Buffer | undefined {
    return this.keysBySessionId.get(sessionId);
  }

  delete(sessionId: string): void {
    this.keysBySessionId.delete(sessionId);
  }
}
