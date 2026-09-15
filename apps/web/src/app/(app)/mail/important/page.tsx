"use client";

import { useEffect, useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface ImportantSummaryItem {
  emailAccountId: string;
  displayName: string;
  importantCount: number;
}

export default function MailImportantPage() {
  const [summary, setSummary] = useState<ImportantSummaryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ImportantSummaryItem[]>("/email-candidates/important-summary")
      .then(setSummary)
      .catch((err) => setError(getErrorMessage(err, "중요 메일 요약을 불러오지 못했습니다.")));
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">중요 메일 알림함</h1>
      <p className="text-sm text-neutral-500">
        &quot;중요&quot; 규칙에 매칭되어 승인된 메일 개수를 계정별로 보여줍니다.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!summary && !error && <p className="text-sm text-neutral-500">불러오는 중...</p>}
      {summary && summary.length === 0 && (
        <p className="text-sm text-neutral-500">연결된 메일 계정이 없습니다.</p>
      )}

      {summary && summary.length > 0 && (
        <ul className="space-y-2">
          {summary.map((item) => (
            <li
              key={item.emailAccountId}
              className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <span>{item.displayName}</span>
              <span className="font-medium">{item.importantCount}건</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
