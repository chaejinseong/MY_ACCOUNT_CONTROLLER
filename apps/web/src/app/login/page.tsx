"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { authenticateWithStoredDevice, hasStoredDevice } from "@/lib/webauthn";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = searchParams.get("step"); // "setup" | "unlock" | null
  const initialError = searchParams.get("error");

  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [canUseBiometric, setCanUseBiometric] = useState(false);
  const [confirmedNoRecovery, setConfirmedNoRecovery] = useState(false);

  useEffect(() => {
    if (step === "unlock") {
      hasStoredDevice().then(setCanUseBiometric);
    }
  }, [step]);

  async function handleGoogleLogin() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/google/start");
      window.location.href = url;
    } catch (err) {
      setError(getErrorMessage(err, "Google 로그인을 시작하지 못했습니다."));
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const password = new FormData(event.currentTarget).get("password") as string;
    const endpoint = step === "setup" ? "/auth/master-password/setup" : "/auth/unlock";

    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ password }) });
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err, "처리하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBiometricUnlock() {
    setError(null);
    setSubmitting(true);
    try {
      const { response, password } = await authenticateWithStoredDevice();
      await apiFetch("/auth/webauthn/authenticate", {
        method: "POST",
        body: JSON.stringify({ response, password }),
      });
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err, "생체인증으로 잠금 해제하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "setup" || step === "unlock") {
    return (
      <div className="w-full max-w-sm space-y-4">
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <h1 className="text-xl font-semibold">
            {step === "setup" ? "마스터 비밀번호 설정" : "마스터 비밀번호 입력"}
          </h1>
          <p className="text-sm text-neutral-500">
            {step === "setup"
              ? "모든 계정 정보를 암호화하는 데 쓰이는 비밀번호입니다."
              : "등록된 계정 정보를 열람하려면 마스터 비밀번호로 잠금을 해제해야 합니다."}
          </p>
          {step === "setup" && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">이 비밀번호는 저를 포함해 아무도 복구해드릴 수 없습니다.</p>
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                분실 시 저장된 모든 계정 정보는 영구히 복구 불가능합니다. 이 기기에서 생체인증(지문/Face
                ID)을 등록해두면 이후 다시 타이핑할 일을 줄일 수 있지만, 근본적인 복구 수단은 아닙니다.
              </p>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmedNoRecovery}
                  onChange={(e) => setConfirmedNoRecovery(e.target.checked)}
                  className="mt-0.5"
                />
                <span>복구 수단이 없다는 것을 이해했습니다.</span>
              </label>
            </div>
          )}
          <input
            name="password"
            type="password"
            required
            minLength={step === "setup" ? 8 : undefined}
            placeholder="마스터 비밀번호"
            className="w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || (step === "setup" && !confirmedNoRecovery)}
            className="w-full rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {submitting ? "처리 중..." : step === "setup" ? "설정하고 시작하기" : "잠금 해제"}
          </button>
        </form>

        {canUseBiometric && (
          <>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              또는
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={submitting}
              className="w-full rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              이 기기의 생체인증으로 잠금 해제
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-xl font-semibold">통합 계정관리 프로그램</h1>
      <p className="text-sm text-neutral-500">Google 계정으로 로그인하세요.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Google로 로그인
      </button>
    </div>
  );
}

// useSearchParams()는 Suspense 경계가 필요하다 (Next.js App Router 정적 렌더링 제약).
export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
