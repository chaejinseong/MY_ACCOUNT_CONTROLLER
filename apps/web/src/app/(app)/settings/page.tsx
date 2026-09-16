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
        <p className="text-sm text-neutral-500">백업/복구 설정은 준비 중입니다.</p>
      </div>

      <AutoLockSection />

      <ChangeMasterPasswordSection onChanged={loadDevices} />

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

function AutoLockSection() {
  const [autoLockMinutes, setAutoLockMinutes] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ autoLockMinutes: number }>("/auth/settings")
      .then((data) => setAutoLockMinutes(data.autoLockMinutes))
      .catch((err) => setError(getErrorMessage(err, "설정을 불러오지 못했습니다.")));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (autoLockMinutes == null) return;
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      await apiFetch("/auth/settings/auto-lock-minutes", {
        method: "POST",
        body: JSON.stringify({ autoLockMinutes }),
      });
      setInfo("자동 잠금 시간을 저장했습니다.");
    } catch (err) {
      setError(getErrorMessage(err, "자동 잠금 시간을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">자동 잠금</h2>
      <p className="text-xs text-neutral-500">
        이 시간 동안 앱을 사용하지 않으면 자동으로 잠깁니다. 다시 열람하려면 마스터 비밀번호(또는 등록된 기기의
        생체인증)로 잠금을 해제해야 합니다.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={240}
          value={autoLockMinutes ?? ""}
          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          disabled={autoLockMinutes == null}
          className="w-24 rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-sm text-neutral-500">분</span>
        <button
          type="submit"
          disabled={saving || autoLockMinutes == null}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
      {info && <p className="text-sm text-green-700 dark:text-green-500">{info}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function ChangeMasterPasswordSection({ onChanged }: { onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const form = new FormData(event.currentTarget);
    const currentPassword = form.get("currentPassword") as string;
    const newPassword = form.get("newPassword") as string;
    const confirmPassword = form.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<{ changed: true; revokedDevices: number }>("/auth/master-password/change", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setInfo(
        result.revokedDevices > 0
          ? `마스터 비밀번호를 변경했습니다. 등록돼 있던 생체인증 기기 ${result.revokedDevices}개가 모두 해제되었으니, 필요하면 아래에서 새 비밀번호로 다시 등록하세요.`
          : "마스터 비밀번호를 변경했습니다.",
      );
      (event.target as HTMLFormElement).reset();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "마스터 비밀번호를 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">마스터 비밀번호 변경</h2>
      <p className="text-xs text-neutral-500">
        변경하면 저장된 모든 계정 비밀번호가 새 마스터 비밀번호로 다시 암호화됩니다. 등록된 생체인증 기기는
        전부 해제되니 이후 다시 등록해야 합니다.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          name="currentPassword"
          type="password"
          required
          placeholder="현재 마스터 비밀번호"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          placeholder="새 마스터 비밀번호"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          placeholder="새 마스터 비밀번호 확인"
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? "변경 중..." : "마스터 비밀번호 변경"}
        </button>
      </form>
      {info && <p className="text-sm text-green-700 dark:text-green-500">{info}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
