"use client";

import { use, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

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
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    apiFetch<AccountDetail>(`/accounts/${id}`)
      .then(setAccount)
      .catch((err) => setError(err instanceof ApiError ? err.message : "계정을 불러오지 못했습니다."));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!account) return <p className="text-sm text-neutral-500">불러오는 중...</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">{account.serviceName}</h1>
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
