import {
  browserSupportsWebAuthn,
  bufferToBase64URLString,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./api";
import { getPrfEvalSalt, unwrapMasterPassword, wrapMasterPassword } from "./webauthn-crypto";
import {
  deleteWrappedMasterPassword,
  getWrappedMasterPassword,
  listWrappedCredentialIds,
  saveWrappedMasterPassword,
} from "./webauthn-storage";

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

// "이 기기에 등록된 생체인증이 있는가"는 서버(TrustedDevice)가 아니라 이 브라우저의
// IndexedDB 기준이다 — 서버에는 등록됐어도 이 기기가 아니면(또는 PRF 미지원이었다면)
// 여기엔 아무것도 없어서 자동 잠금해제 버튼을 보여줄 수 없다.
export async function hasStoredDevice(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const ids = await listWrappedCredentialIds();
  return ids.length > 0;
}

export interface RegisterResult {
  deviceId: string;
  prfSupported: boolean;
}

// masterPassword는 반드시 "방금 사용자가 직접 입력한" 값이어야 한다 — 그걸 이 기기에만
// 감싸서 저장해두는 게 이 함수의 핵심이다 (서버는 평문 비밀번호를 다시 보지 않는다).
export async function registerThisDevice(deviceLabel: string, masterPassword: string): Promise<RegisterResult> {
  const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>("/auth/webauthn/register-options", {
    method: "POST",
  });

  const regResponse = await startRegistration({ optionsJSON: options });

  const device = await apiFetch<{ id: string; deviceLabel: string }>("/auth/webauthn/register", {
    method: "POST",
    body: JSON.stringify({ deviceLabel, response: regResponse }),
  });

  const prfSupported = !!regResponse.clientExtensionResults?.prf?.enabled;
  if (prfSupported) {
    // 등록(create) 시점엔 PRF eval 결과를 안정적으로 못 받는 브라우저가 많아서, 방금 만든
    // credential로 "이 기기에서만" 검증 없는 로컬 assertion을 한 번 더 받아 그 결과로
    // 실제 비밀을 유도한다 (서버에는 전송하지 않음 — 순수 로컬 키 유도용).
    const salt = await getPrfEvalSalt();
    const primingOptions: PublicKeyCredentialRequestOptionsJSON = {
      challenge: bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(32)).buffer),
      allowCredentials: [{ id: regResponse.id, type: "public-key" }],
      userVerification: "required",
      extensions: { prf: { eval: { first: salt } } },
    };
    const primingAssertion = await startAuthentication({ optionsJSON: primingOptions });
    const prfOutput = primingAssertion.clientExtensionResults?.prf?.results?.first;
    if (prfOutput) {
      const wrapped = await wrapMasterPassword(prfOutput as ArrayBuffer, masterPassword);
      await saveWrappedMasterPassword({ credentialId: regResponse.id, ...wrapped });
    }
  }

  return { deviceId: device.id, prfSupported };
}

export interface StoredDeviceAuthResult {
  response: AuthenticationResponseJSON;
  password: string;
}

// 성공하면 { response, password }를 돌려준다 — 호출자가 이걸 그대로
// POST /auth/webauthn/authenticate에 실어 보내면 된다.
export async function authenticateWithStoredDevice(): Promise<StoredDeviceAuthResult> {
  const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>("/auth/webauthn/authenticate-options", {
    method: "POST",
  });

  const salt = await getPrfEvalSalt();
  const assertion = await startAuthentication({
    optionsJSON: { ...options, extensions: { ...options.extensions, prf: { eval: { first: salt } } } },
  });

  const wrapped = await getWrappedMasterPassword(assertion.id);
  const prfOutput = assertion.clientExtensionResults?.prf?.results?.first;
  if (!wrapped || !prfOutput) {
    throw new Error("이 기기에 저장된 생체인증 정보를 찾을 수 없습니다. 마스터 비밀번호로 잠금 해제해주세요.");
  }

  const password = await unwrapMasterPassword(prfOutput as ArrayBuffer, wrapped);
  return { response: assertion, password };
}

export async function forgetThisDevice(credentialId: string): Promise<void> {
  await deleteWrappedMasterPassword(credentialId);
}
