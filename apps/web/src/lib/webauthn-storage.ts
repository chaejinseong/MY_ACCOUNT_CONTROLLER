// 생체인증으로 잠금해제할 때 쓸 "감싸진 마스터 비밀번호"를 이 기기의 브라우저에만
// 저장한다 (서버에는 절대 보내지 않음 — 기술설계서 2.2 "감싸진 암호화 키는 서버가 아닌
// 해당 기기에만 보관"). 감싸는 키 자체는 저장하지 않고 매번 WebAuthn PRF로 다시 유도하므로
// (webauthn-crypto.ts), 여기 저장되는 값만으로는 아무것도 복호화할 수 없다.
const DB_NAME = "account-manager-webauthn";
const STORE_NAME = "wrapped-master-password";

export interface WrappedMasterPassword {
  credentialId: string; // WebAuthn credential id (base64url) — 조회 키
  iv: string; // base64
  ciphertext: string; // base64
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "credentialId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWrappedMasterPassword(entry: WrappedMasterPassword): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getWrappedMasterPassword(credentialId: string): Promise<WrappedMasterPassword | undefined> {
  const db = await openDb();
  const result = await new Promise<WrappedMasterPassword | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(credentialId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function listWrappedCredentialIds(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys;
}

export async function deleteWrappedMasterPassword(credentialId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(credentialId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
