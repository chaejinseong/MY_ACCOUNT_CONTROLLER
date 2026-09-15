import { EmailRule, EmailRuleCondition } from '@prisma/client';
import { RawMailMessage } from '../providers/mail-provider.interface';

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

export type RuleWithConditions = EmailRule & { conditions: EmailRuleCondition[] };

// 기획서 3.4.1: 조건이 1개면 로직 연산자는 의미 없고, 2개 이상부터 AND/OR로 판정한다.
export function messageMatchesRule(message: RawMailMessage, rule: RuleWithConditions): boolean {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions.map((condition) => evaluateCondition(message, condition));
  return rule.logicalOperator === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// condition_value 형태는 기술설계서 2.2 예시를 따른다:
// sender → {"domain": "coupang.com"}, subject_keyword → {"contains": "결제"}
function evaluateCondition(message: RawMailMessage, condition: EmailRuleCondition): boolean {
  const value = condition.conditionValue as Record<string, unknown>;

  switch (condition.conditionType) {
    case 'sender': {
      const domain = typeof value.domain === 'string' ? value.domain : undefined;
      const contains = typeof value.contains === 'string' ? value.contains : undefined;
      const needle = domain ?? contains;
      return !!needle && message.sender.toLowerCase().includes(needle.toLowerCase());
    }
    case 'subject_keyword': {
      const contains = typeof value.contains === 'string' ? value.contains : undefined;
      return !!contains && message.subject.toLowerCase().includes(contains.toLowerCase());
    }
    case 'body_keyword': {
      const contains = typeof value.contains === 'string' ? value.contains : undefined;
      return !!contains && message.bodyPreview.toLowerCase().includes(contains.toLowerCase());
    }
    case 'has_emoji': {
      const expected = value.equals !== false; // 기본값: 이모지가 "있으면" 매칭
      const hasEmoji = EMOJI_REGEX.test(message.subject) || EMOJI_REGEX.test(message.bodyPreview);
      return hasEmoji === expected;
    }
    case 'has_attachment': {
      const expected = value.equals !== false; // 기본값: 첨부파일이 "있으면" 매칭
      return message.hasAttachment === expected;
    }
    default:
      return false;
  }
}
