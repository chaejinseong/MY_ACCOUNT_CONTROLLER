import { Injectable } from '@nestjs/common';

interface UnlockEntry {
  key: Buffer;
  autoLockMinutes: number;
  lastActivityAt: number;
}

// 마스터 비밀번호에서 유도한 AES 키는 세션 저장소(Postgres)에 절대 넣지 않는다 —
// 세션 쿠키나 DB가 털려도 이 키만은 서버 프로세스 메모리 밖으로 나가지 않게 하기 위함이다.
// 따라서 서버가 재시작되면 모든 세션은 다시 "잠금" 상태로 돌아간다 (의도된 동작).
// 자동 잠금(기획서 3.3, 설정 화면의 "자동 잠금 시간")도 같은 메모리에 idle 타임아웃으로
// 구현한다 — touch()가 매 요청마다 idle 시간을 검사/갱신하는 단일 지점이다.
@Injectable()
export class UnlockKeyStoreService {
  private readonly entries = new Map<string, UnlockEntry>();

  set(sessionId: string, key: Buffer, autoLockMinutes: number): void {
    this.entries.set(sessionId, { key, autoLockMinutes, lastActivityAt: Date.now() });
  }

  // 키가 아직 idle 타임아웃 안이면 활동 시각을 갱신하고 키를 반환한다. 타임아웃을
  // 넘겼으면 항목을 지우고 undefined를 반환한다(= 자동 잠금).
  touch(sessionId: string): Buffer | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;

    const idleMs = Date.now() - entry.lastActivityAt;
    if (idleMs > entry.autoLockMinutes * 60_000) {
      this.entries.delete(sessionId);
      return undefined;
    }

    entry.lastActivityAt = Date.now();
    return entry.key;
  }

  // idle 검사 없이 그냥 조회만 한다 — 이미 UnlockedGuard 등에서 touch()로 확인한 뒤
  // 같은 요청 안에서 재사용할 때 쓴다.
  get(sessionId: string): Buffer | undefined {
    return this.entries.get(sessionId)?.key;
  }

  // 설정 화면에서 자동 잠금 시간을 바꾸면 다음 잠금해제를 기다리지 않고 바로 반영한다.
  updateAutoLockMinutes(sessionId: string, autoLockMinutes: number): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.autoLockMinutes = autoLockMinutes;
  }

  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}
