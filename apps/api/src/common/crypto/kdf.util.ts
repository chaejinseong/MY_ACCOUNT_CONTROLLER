import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

// 기획서 7장: 마스터 비밀번호는 두 가지 용도로 쓰인다.
// 1) hashMasterPassword/verifyMasterPassword — 비밀번호 자체가 맞는지 검증 (User.masterPasswordHash)
// 2) deriveEncryptionKey — 같은 비밀번호에서 AES-256-GCM 키를 결정적으로(같은 입력→같은 키) 유도
//    (User.masterKdfSalt). 두 용도의 salt를 분리해 검증용 해시가 노출돼도 암호화 키 유도에는 못 쓰게 한다.
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

const AES_256_KEY_LENGTH = 32;

export function generateKdfSalt(): string {
  return randomBytes(16).toString('base64');
}

export function hashMasterPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2ID_OPTIONS);
}

export function verifyMasterPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function deriveEncryptionKey(password: string, kdfSaltBase64: string): Promise<Buffer> {
  const salt = Buffer.from(kdfSaltBase64, 'base64');
  return argon2.hash(password, {
    ...ARGON2ID_OPTIONS,
    salt,
    raw: true,
    hashLength: AES_256_KEY_LENGTH,
  });
}
