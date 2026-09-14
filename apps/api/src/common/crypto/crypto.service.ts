import { Injectable } from '@nestjs/common';
import * as kdf from './kdf.util';
import * as aes from './aes.util';

// 다른 모듈은 이 서비스를 주입받아 쓴다 (PrismaService와 동일한 패턴).
// 주의: 유도된 암호화 키(Buffer)는 이 서비스가 저장/캐싱하지 않는다 — 호출한 쪽(세션/잠금해제
// 로직)이 메모리에서만 들고 있다가 필요할 때마다 encrypt/decrypt에 넘겨야 한다.
@Injectable()
export class CryptoService {
  generateKdfSalt(): string {
    return kdf.generateKdfSalt();
  }

  hashMasterPassword(password: string): Promise<string> {
    return kdf.hashMasterPassword(password);
  }

  verifyMasterPassword(password: string, hash: string): Promise<boolean> {
    return kdf.verifyMasterPassword(password, hash);
  }

  deriveEncryptionKey(password: string, kdfSaltBase64: string): Promise<Buffer> {
    return kdf.deriveEncryptionKey(password, kdfSaltBase64);
  }

  encrypt(plaintext: string, key: Buffer): string {
    return aes.encrypt(plaintext, key);
  }

  decrypt(payload: string, key: Buffer): string {
    return aes.decrypt(payload, key);
  }
}
