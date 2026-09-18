"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState, type FormEvent } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { PasswordField } from "@/components/PasswordField";

interface AccountDetail {
  id: string;
  serviceName: string;
  urlOrAppName: string;
  category: string;
  loginId: string;
  memo: string | null;
  password: string;
}

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    apiFetch<AccountDetail>(`/accounts/${id}`)
      .then(setAccount)
      .catch((err) => setError(getErrorMessage(err, "계정을 불러오지 못했습니다.")));
  }, [id]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const password = newPassword;

    try {
      const updated = await apiFetch<AccountDetail>(`/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          serviceName: form.get("serviceName"),
          urlOrAppName: form.get("urlOrAppName"),
          category: form.get("category"),
          loginId: form.get("loginId"),
          memo: form.get("memo") || undefined,
          // 빈 값이면 기존 비밀번호를 그대로 유지 (매번 재입력 강요하지 않음)
          ...(password ? { password } : {}),
        }),
      });
      setAccount({ ...updated, password: password || account!.password });
      setNewPassword("");
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "저장하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 계정을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setError(null);
    try {
      await apiFetch(`/accounts/${id}`, { method: "DELETE" });
      router.push("/accounts");
    } catch (err) {
      setError(getErrorMessage(err, "삭제하지 못했습니다."));
    }
  }

  if (error && !account) return <p className="text-sm text-red-600">{error}</p>;
  if (!account) return <p className="text-sm text-neutral-500">불러오는 중...</p>;

  if (editing) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">계정 수정</h1>
        <form onSubmit={handleSave} className="space-y-3">
          <Field label="서비스명" name="serviceName" defaultValue={account.serviceName} required />
          <Field label="URL 또는 앱 이름" name="urlOrAppName" defaultValue={account.urlOrAppName} required />
          <Field label="카테고리" name="category" defaultValue={account.category} required />
          <Field label="아이디" name="loginId" defaultValue={account.loginId} required />
          <PasswordField label="새 비밀번호 (변경 시에만 입력)" value={newPassword} onChange={setNewPassword} />
          <Field label="메모" name="memo" defaultValue={account.memo ?? ""} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{account.serviceName}</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-neutral-500 hover:underline">
            수정
          </button>
          <button type="button" onClick={handleDelete} className="text-sm text-red-600 hover:underline">
            삭제
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <dl className="space-y-3 text-sm">
        <Row label="URL / 앱 이름" value={account.urlOrAppName} />
        <Row label="카테고리" value={account.category} />
        <Row label="아이디" value={account.loginId} />
        <div className="flex items-end justify-between gap-2">
          <Row label="비밀번호" value={showPassword ? account.password : "••••••••"} />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="mb-0.5 text-xs text-neutral-500 hover:underline"
          >
            {showPassword ? "숨기기" : "보기"}
          </button>
        </div>
        {account.memo && <Row label="메모" value={account.memo} />}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
