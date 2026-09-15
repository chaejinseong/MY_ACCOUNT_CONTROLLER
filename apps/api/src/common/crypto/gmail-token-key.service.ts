import { Injectable, OnModuleInit } from '@nestjs/common';

// Gmail access/refresh 토큰 전용 서버 관리 키 (기술설계서 7.2, 옵션 a로 최종 확정 — 2026-09-15).
// Account(사이트 비밀번호)는 여전히 마스터 비밀번호 유도 키로만 풀리는 완전한 제로놀리지를
// 유지하지만, Gmail 토큰만은 예외적으로 이 서버 키를 쓴다 — 세션/잠금 상태와 무관하게 항상
// 존재해야 "자동 백그라운드 스캔"(기획서 3.4.2)이 성립하기 때문. 대가는 DB가 통째로 유출되면
// 이 토큰만은 서버 프로세스 밖(환경변수)의 키 없이는 안전하지 않다는 것 — 의도적으로 좁힌
// 제로놀리지 범위다. 키는 DB/저장소에 절대 두지 않고 GMAIL_TOKEN_ENCRYPTION_KEY 환경변수로만
// 관리한다. 교체 시 이미 연결된 Gmail 계정은 전부 재연결해야 한다(구 키로 암호화된 토큰은
// 새 키로 복호화 불가).
@Injectable()
export class GmailTokenKeyService implements OnModuleInit {
  private _key!: Buffer;

  onModuleInit(): void {
    const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'GMAIL_TOKEN_ENCRYPTION_KEY가 설정되지 않았습니다 — base64로 인코딩된 32바이트 키가 필요합니다. ' +
          `생성 예: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(`GMAIL_TOKEN_ENCRYPTION_KEY는 base64 디코딩 후 32바이트여야 합니다 (현재 ${key.length}바이트).`);
    }
    this._key = key;
  }

  get key(): Buffer {
    return this._key;
  }
}
