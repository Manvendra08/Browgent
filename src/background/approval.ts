import { AgentAction } from './types';
import { PerceivedElement } from '../content/types';

export interface DestructiveActionEvaluation {
  isDestructive: boolean;
  reason?: string;
  matchedText?: string;
}

const PAYMENT_PATTERN =
  /\b(pay(\s+now)?|purchase|buy(\s+now)?|place\s+order|submit\s+order|complete\s+order|finalize\s+(payment|order)|confirm\s+(payment|order)|transfer\s+(funds|money)|wire\s+transfer|checkout)\b/i;

const DELETION_PATTERN =
  /\b(permanently\s+delete|drop\s+database|destroy(\s+all)?|wipe(\s+all)?|delete(\s+(account|profile|repo|repository|database|data|workspace|project|all|user|files?))?)\b/i;

const ACCOUNT_MGMT_PATTERN =
  /\b(cancel\s+subscription|close\s+account|terminate\s+(account|service))\b/i;

const HIGH_RISK_REMOVAL_PATTERN =
  /\bremove\s+(account|user|member|admin|card|payment\s+method|all)\b/i;

const BENIGN_REMOVAL_EXCLUSIONS =
  /\b(remove\s+(filter|tag|chip|tab|selection|highlight))\b/i;

/**
 * Evaluates whether an agent action is potentially destructive, irreversible,
 * or financial, requiring explicit human-in-the-loop review before execution.
 */
export function evaluateDestructiveAction(
  action: AgentAction,
  elements?: PerceivedElement[],
): DestructiveActionEvaluation {
  if (action.action !== 'click' && action.action !== 'hover') {
    return { isDestructive: false };
  }

  const targetId = action.elementId;
  const element = elements?.find((e) => e.id === targetId);
  if (!element) {
    return { isDestructive: false };
  }

  const candidates = [
    element.text,
    element.label,
    element.ariaLabel,
    element.placeholder,
    element.value,
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

  const combinedText = candidates.join(' ').trim();
  if (!combinedText) {
    return { isDestructive: false };
  }

  // Check benign removals first
  if (BENIGN_REMOVAL_EXCLUSIONS.test(combinedText)) {
    return { isDestructive: false };
  }

  // Check payment / checkout
  const paymentMatch = combinedText.match(PAYMENT_PATTERN);
  if (paymentMatch) {
    return {
      isDestructive: true,
      reason: `Financial action detected: "${combinedText}". Requires user confirmation.`,
      matchedText: paymentMatch[0],
    };
  }

  // Check permanent or high-impact deletion
  const deletionMatch = combinedText.match(DELETION_PATTERN);
  if (deletionMatch) {
    return {
      isDestructive: true,
      reason: `Destructive action detected: "${combinedText}". Requires user confirmation.`,
      matchedText: deletionMatch[0],
    };
  }

  // Check subscription cancellation / termination
  const acctMatch = combinedText.match(ACCOUNT_MGMT_PATTERN);
  if (acctMatch) {
    return {
      isDestructive: true,
      reason: `Account modification detected: "${combinedText}". Requires user confirmation.`,
      matchedText: acctMatch[0],
    };
  }

  // Check high-risk removal
  const removalMatch = combinedText.match(HIGH_RISK_REMOVAL_PATTERN);
  if (removalMatch) {
    return {
      isDestructive: true,
      reason: `Sensitive removal detected: "${combinedText}". Requires user confirmation.`,
      matchedText: removalMatch[0],
    };
  }

  return { isDestructive: false };
}
