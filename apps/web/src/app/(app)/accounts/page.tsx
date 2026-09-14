"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface AccountListItem {
  id: string;
  serviceName: string;
  urlOrAppName: string;
  category: string;
  loginId: string;
  memo: string | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AccountListItem[]>("/accounts")
      .then(setAccounts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "계정을 불러오지 못했습니다."));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">계정 관리</h1>
        <Link
          href="/accounts/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          + 새 계정
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!accounts && !error && <p className="text-sm text-neutral-500">불러오는 중...</p>}
      {accounts && accounts.length === 0 && (
        <p className="text-sm text-neutral-500">등록된 계정이 없습니다.</p>
      )}

      {accounts && accounts.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <th className="py-2 font-medium">서비스</th>
              <th className="py-2 font-medium">카테고리</th>
              <th className="py-2 font-medium">아이디</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2">
                  <Link href={`/accounts/${account.id}`} className="hover:underline">
                    {account.serviceName}
                  </Link>
                  <span className="ml-2 text-neutral-500">{account.urlOrAppName}</span>
                </td>
                <td className="py-2">{account.category}</td>
                <td className="py-2">{account.loginId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
