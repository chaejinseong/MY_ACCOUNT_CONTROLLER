"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface EmailAccountItem {
  id: string;
  providerType: string;
  displayName: string;
  isActive: boolean;
  connectedAt: string;
}

interface RuleCondition {
  conditionType: string;
  conditionValue: Record<string, unknown>;
}

interface EmailRuleItem {
  id: string;
  emailAccountId: string;
  logicalOperator: "AND" | "OR";
  actionType: string;
  isActive: boolean;
  conditions: RuleCondition[];
}

const CONDITION_TYPES = [
  { value: "sender", label: "발신자" },
  { value: "subject_keyword", label: "제목 키워드" },
  { value: "body_keyword", label: "본문 키워드" },
  { value: "has_emoji", label: "이모티콘 포함" },
  { value: "has_attachment", label: "첨부파일 있음" },
];

const ACTION_TYPES = [
  { value: "delete_candidate", label: "삭제 후보" },
  { value: "spam_candidate", label: "스팸 후보" },
  { value: "important", label: "중요 표시" },
];

function conditionSummary(condition: RuleCondition): string {
  const label = CONDITION_TYPES.find((c) => c.value === condition.conditionType)?.label ?? condition.conditionType;
  const value = condition.conditionValue;
  if ("contains" in value || "domain" in value) {
    return `${label}: ${value.domain ?? value.contains}`;
  }
  return `${label}: ${value.equals === false ? "아니오" : "예"}`;
}

function actionLabel(actionType: string): string {
  return ACTION_TYPES.find((a) => a.value === actionType)?.label ?? actionType;
}

function MailRulesContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const connectError = searchParams.get("error");

  const [accounts, setAccounts] = useState<EmailAccountItem[] | null>(null);
  const [rulesByAccount, setRulesByAccount] = useState<Record<string, EmailRuleItem[]>>({});
  const [error, setError] = useState<string | null>(connectError);
  const [connecting, setConnecting] = useState(false);

  function loadAccounts() {
    apiFetch<EmailAccountItem[]>("/email-accounts")
      .then((data) => {
        setAccounts(data);
        data.forEach((account) => loadRules(account.id));
      })
      .catch((err) => setError(getErrorMessage(err, "연결된 메일 계정을 불러오지 못했습니다.")));
  }

  function loadRules(emailAccountId: string) {
    apiFetch<EmailRuleItem[]>(`/email-rules?emailAccountId=${emailAccountId}`)
      .then((rules) => setRulesByAccount((prev) => ({ ...prev, [emailAccountId]: rules })))
      .catch(() => {});
  }

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/email-accounts/oauth/start");
      window.location.href = url;
    } catch (err) {
      setError(getErrorMessage(err, "Gmail 연동을 시작하지 못했습니다."));
      setConnecting(false);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm("이 Gmail 계정 연동을 해제할까요? 연결된 규칙도 함께 삭제됩니다.")) return;
    try {
      await apiFetch(`/email-accounts/${accountId}`, { method: "DELETE" });
      loadAccounts();
    } catch (err) {
      setError(getErrorMessage(err, "연동 해제에 실패했습니다."));
    }
  }


  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">메일 규칙</h1>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {connecting ? "연결 중..." : "+ Gmail 계정 연결"}
        </button>
      </div>

      {connected && <p className="text-sm text-green-700 dark:text-green-500">Gmail 계정을 연결했습니다.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!accounts && <p className="text-sm text-neutral-500">불러오는 중...</p>}
      {accounts && accounts.length === 0 && (
        <p className="text-sm text-neutral-500">연결된 Gmail 계정이 없습니다. 위 버튼으로 연결해보세요.</p>
      )}

      {accounts?.map((account) => (
        <section key={account.id} className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{account.displayName}</p>
              <p className="text-xs text-neutral-500">
                {account.providerType} · 연결일 {new Date(account.connectedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDisconnect(account.id)}
              className="text-xs text-red-600 hover:underline"
            >
              연동 해제
            </button>
          </div>

          <ul className="space-y-1">
            {(rulesByAccount[account.id] ?? []).map((rule) => (
              <li key={rule.id} className="rounded bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
                <span className="font-medium">{actionLabel(rule.actionType)}</span>
                {" — "}
                {rule.conditions.map(conditionSummary).join(rule.conditions.length > 1 ? ` ${rule.logicalOperator} ` : "")}
              </li>
            ))}
            {(rulesByAccount[account.id] ?? []).length === 0 && (
              <li className="text-sm text-neutral-500">등록된 규칙이 없습니다.</li>
            )}
          </ul>

          <NewRuleForm
            emailAccountId={account.id}
            onCreated={() => loadRules(account.id)}
          />
        </section>
      ))}
    </div>
  );
}

function NewRuleForm({ emailAccountId, onCreated }: { emailAccountId: string; onCreated: () => void }) {
  const [conditions, setConditions] = useState<RuleCondition[]>([{ conditionType: "sender", conditionValue: {} }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateCondition(index: number, patch: Partial<RuleCondition>) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    if (conditions.length >= 5) return;
    setConditions((prev) => [...prev, { conditionType: "sender", conditionValue: {} }]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/email-rules", {
        method: "POST",
        body: JSON.stringify({
          emailAccountId,
          actionType: form.get("actionType"),
          logicalOperator: form.get("logicalOperator") ?? "AND",
          conditions,
        }),
      });
      setConditions([{ conditionType: "sender", conditionValue: {} }]);
      (event.target as HTMLFormElement).reset();
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, "규칙을 저장하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <div className="flex gap-2">
        <select name="actionType" className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        {conditions.length > 1 && (
          <select name="logicalOperator" className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            <option value="AND">AND (모두 만족)</option>
            <option value="OR">OR (하나만 만족)</option>
          </select>
        )}
      </div>

      {conditions.map((condition, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={condition.conditionType}
            onChange={(e) => updateCondition(index, { conditionType: e.target.value, conditionValue: {} })}
            className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {CONDITION_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {condition.conditionType === "sender" ? (
            <input
              type="text"
              placeholder="도메인 (예: coupang.com)"
              onChange={(e) => updateCondition(index, { conditionValue: { domain: e.target.value } })}
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          ) : condition.conditionType === "subject_keyword" || condition.conditionType === "body_keyword" ? (
            <input
              type="text"
              placeholder="포함할 단어"
              onChange={(e) => updateCondition(index, { conditionValue: { contains: e.target.value } })}
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          ) : (
            <span className="flex-1 text-xs text-neutral-500">포함되어 있으면 매칭</span>
          )}

          {conditions.length > 1 && (
            <button type="button" onClick={() => removeCondition(index)} className="text-xs text-red-600">
              삭제
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        {conditions.length < 5 && (
          <button type="button" onClick={addCondition} className="text-xs text-neutral-500 hover:underline">
            + 조건 추가
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded border border-neutral-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
        >
          {submitting ? "저장 중..." : "규칙 추가"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export default function MailRulesPage() {
  return (
    <Suspense fallback={null}>
      <MailRulesContent />
    </Suspense>
  );
}
