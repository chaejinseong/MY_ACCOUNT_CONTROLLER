"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = searchParams.get("step"); // "setup" | "unlock" | null
  const initialError = searchParams.get("error");

  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleLogin() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/auth/google/start");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google 로그인을 시작하지 못했습니다.");
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
      setError(err instanceof ApiError ? err.message : "처리하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "setup" || step === "unlock") {
    return (
      <form onSubmit={handlePasswordSubmit} className="w-full max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">
          {step === "setup" ? "마스터 비밀번호 설정" : "마스터 비밀번호 입력"}
        </h1>
        <p className="text-sm text-neutral-500">
          {step === "setup"
            ? "모든 계정 정보를 암호화하는 데 쓰이는 비밀번호입니다. 분실하면 복구할 수 없으니 안전하게 보관하세요."
            : "등록된 계정 정보를 열람하려면 마스터 비밀번호로 잠금을 해제해야 합니다."}
        </p>
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
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {submitting ? "처리 중..." : step === "setup" ? "설정하고 시작하기" : "잠금 해제"}
        </button>
      </form>
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
