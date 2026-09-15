"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { forgetThisDevice, isWebAuthnSupported, registerThisDevice } from "@/lib/webauthn";

interface TrustedDeviceItem {
  id: string;
  deviceLabel: string;
  webauthnCredentialId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const noopSubscribe = () => () => {};

export default function SettingsPage() {
  const [devices, setDevices] = useState<TrustedDeviceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  // isWebAuthnSupported()는 window에 의존해 서버/클라이언트 첫 렌더 결과가 달라진다
  // (hydration mismatch) — 서버 스냅샷은 항상 false, 클라이언트는 mount 후 실제 값을
  // 쓰게 한다 (React가 권장하는 SSR-불가 브라우저 API 처리 방식).
  const supported = useSyncExternalStore(noopSubscribe, isWebAuthnSupported, () => false);

  function loadDevices() {
    apiFetch<TrustedDeviceItem[]>("/auth/webauthn/devices")
      .then(setDevices)
      .catch((err) => setError(getErrorMessage(err, "기기 목록을 불러오지 못했습니다.")));
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setRegistering(true);

    const form = new FormData(event.currentTarget);
    const deviceLabel = (form.get("deviceLabel") as string) || "이 브라우저";
    const password = form.get("password") as string;

    try {
      const result = await registerThisDevice(deviceLabel, password);
      setInfo(
        result.prfSupported
          ? "이 기기에 생체인증을 등록했습니다. 다음부터는 로그인 화면에서 타이핑 없이 잠금 해제할 수 있습니다."
          : "이 기기에 생체인증을 등록했지만, 이 브라우저는 자동 비밀번호 입력 기능(PRF)을 지원하지 않아 마스터 비밀번호는 계속 입력해야 합니다.",
      );
      (event.target as HTMLFormElement).reset();
      loadDevices();
    } catch (err) {
      setError(getErrorMessage(err, "생체인증 등록에 실패했습니다."));
    } finally {
      setRegistering(false);
    }
  }

  async function handleRemove(device: TrustedDeviceItem) {
    if (!confirm(`"${device.deviceLabel}" 기기의 생체인증 등록을 해제할까요?`)) return;
    setError(null);
    try {
      await apiFetch(`/auth/webauthn/${device.id}`, { method: "DELETE" });
      await forgetThisDevice(device.webauthnCredentialId);
      loadDevices();
    } catch (err) {
      setError(getErrorMessage(err, "기기 등록 해제에 실패했습니다."));
    }
  }

  return (
    <div className="max-w-md space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">설정</h1>
        <p className="text-sm text-neutral-500">
          마스터 비밀번호 변경, 자동 잠금 시간, 백업/복구 설정은 준비 중입니다.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          신뢰된 기기 (생체인증)
        </h2>

        {!supported && (
          <p className="text-sm text-neutral-500">
            이 브라우저는 생체인증(WebAuthn)을 지원하지 않습니다.
          </p>
        )}

        {devices && devices.length > 0 && (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <div>
                  <p>{device.deviceLabel}</p>
                  <p className="text-xs text-neutral-500">
                    등록일 {new Date(device.createdAt).toLocaleDateString()}
                    {device.lastUsedAt && ` · 마지막 사용 ${new Date(device.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(device)}
                  className="text-xs text-red-600 hover:underline"
                >
                  등록 해제
                </button>
              </li>
            ))}
          </ul>
        )}

        {devices && devices.length === 0 && (
          <p className="text-sm text-neutral-500">등록된 기기가 없습니다.</p>
        )}

        {supported && (
          <form onSubmit={handleRegister} className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">
              이 기기를 등록하려면 확인을 위해 마스터 비밀번호를 다시 입력하세요.
            </p>
            <input
              name="deviceLabel"
              type="text"
              placeholder="기기 이름 (예: MacBook Air)"
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="마스터 비밀번호"
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              disabled={registering}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {registering ? "등록 중..." : "이 기기 생체인증 등록"}
            </button>
          </form>
        )}

        {info && <p className="text-sm text-green-700 dark:text-green-500">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
