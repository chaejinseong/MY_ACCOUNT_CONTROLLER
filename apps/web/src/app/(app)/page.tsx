"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface AccountListItem {
  id: string;
}

interface CandidateItem {
  id: string;
}

interface ImportantSummaryItem {
  emailAccountId: string;
  displayName: string;
  importantCount: number;
}

export default function DashboardPage() {
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [importantSummary, setImportantSummary] = useState<ImportantSummaryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 카드 3개 중 하나가 실패해도 나머지는 보여준다 — Promise.all 대신 개별 처리.
    apiFetch<AccountListItem[]>("/accounts")
      .then((list) => setAccountCount(list.length))
      .catch((err) => setError(getErrorMessage(err, "계정 정보를 불러오지 못했습니다.")));

    apiFetch<CandidateItem[]>("/email-candidates")
      .then((list) => setPendingCount(list.length))
      .catch((err) => setError(getErrorMessage(err, "오늘의 검토함 정보를 불러오지 못했습니다.")));

    apiFetch<ImportantSummaryItem[]>("/email-candidates/important-summary")
      .then(setImportantSummary)
      .catch((err) => setError(getErrorMessage(err, "중요 메일 정보를 불러오지 못했습니다.")));
  }, []);

  const importantTotal = importantSummary?.reduce((sum, item) => sum + item.importantCount, 0) ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">대시보드</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          href="/accounts"
          label="등록된 계정"
          value={accountCount}
          unit="개"
        />
        <SummaryCard
          href="/mail/review"
          label="오늘의 검토함"
          value={pendingCount}
          unit="건 대기 중"
        />
        <SummaryCard
          href="/mail/important"
          label="중요 메일"
          value={importantTotal}
          unit="건"
        />
      </div>
    </div>
  );
}

function SummaryCard({
  href,
  label,
  value,
  unit,
}: {
  href: string;
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded border border-neutral-200 px-4 py-3 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
    >
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value === null ? "…" : value}
        <span className="ml-1 text-sm font-normal text-neutral-500">{unit}</span>
      </p>
    </Link>
  );
}
