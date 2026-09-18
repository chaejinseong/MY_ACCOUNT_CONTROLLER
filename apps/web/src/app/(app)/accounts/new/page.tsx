"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { PasswordField } from "@/components/PasswordField";

export default function NewAccountPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/accounts", {
        method: "POST",
        body: JSON.stringify({
          serviceName: form.get("serviceName"),
          urlOrAppName: form.get("urlOrAppName"),
          category: form.get("category"),
          loginId: form.get("loginId"),
          password,
          memo: form.get("memo") || undefined,
        }),
      });
      router.push("/accounts");
    } catch (err) {
      setError(getErrorMessage(err, "계정을 저장하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">새 계정 등록</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="서비스명" name="serviceName" required />
        <Field label="URL 또는 앱 이름" name="urlOrAppName" required />
        <Field label="카테고리" name="category" placeholder="금융/쇼핑/SNS/업무/기타" required />
        <Field label="아이디" name="loginId" required />
        <PasswordField label="비밀번호" value={password} onChange={setPassword} required />
        <Field label="메모" name="memo" />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}): ReactNode {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
