// WebAuthn PRF 확장으로 유도한 비밀을 마스터 비밀번호를 감싸는 AES 키로 바꾸는 유틸.
// PRF 출력 자체를 AES 키로 바로 쓰지 않고 HKDF를 한 번 더 거친다 — 이 앱 전용 용도로
// 도메인을 분리해두려는 목적(다른 용도로 같은 PRF 비밀이 재사용되더라도 여기서 나온
// 키는 그것과 달라지게).
const HKDF_INFO = new TextEncoder().encode("account-manager:webauthn-master-password-wrap:v1");
const HKDF_SALT = new TextEncoder().encode("account-manager:webauthn-prf-salt:v1");

// WebAuthn PRF eval 입력값(first)으로 쓰는 고정 상수. 비밀일 필요는 없다 — 실제 비밀은
// 인증기 내부 키 + 이 credential에서만 나온다. 같은 credential + 같은 salt = 항상 같은 출력.
export async function getPrfEvalSalt(): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", HKDF_SALT);
}

async function deriveWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function wrapMasterPassword(
  prfOutput: ArrayBuffer,
  masterPassword: string,
): Promise<{ iv: string; ciphertext: string }> {
  const key = await deriveWrappingKey(prfOutput);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(masterPassword),
  );
  return { iv: toBase64(iv.buffer), ciphertext: toBase64(ciphertext) };
}

export async function unwrapMasterPassword(
  prfOutput: ArrayBuffer,
  wrapped: { iv: string; ciphertext: string },
): Promise<string> {
  const key = await deriveWrappingKey(prfOutput);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(wrapped.iv) },
    key,
    fromBase64(wrapped.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
