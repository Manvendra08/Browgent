import { AgentAction } from './types';
import { DOMState, PerceivedElement } from '../content/types';
import { isRestrictedUrl } from './restricted';
import { GoalKind } from './agent';

export type AuditorGateStatus = 'approved' | 'rejected' | 'early_finish';

export interface AuditorReflectionInput {
  goal: string;
  goalKind: GoalKind;
  action: AgentAction;
  thought: string;
  domState: DOMState;
  elements: PerceivedElement[];
  actionHistory?: AgentAction[];
  stepNumber: number;
  maxSteps: number;
  urlHistory?: string[];
  lastError?: string;
}

export interface AuditorReflectionVerdict {
  status: AuditorGateStatus;
  reason: string;
  correctionHint?: string;
  suggestedAction?: AgentAction;
}

export interface IAuditorReflectionGate {
  reflect(
    input: AuditorReflectionInput,
  ): Promise<AuditorReflectionVerdict> | AuditorReflectionVerdict;
  checkElementRecovery(input: AuditorReflectionInput): AuditorReflectionVerdict | null;
  checkActionDrift(input: AuditorReflectionInput): AuditorReflectionVerdict | null;
  checkGoalSatisfaction(input: AuditorReflectionInput): AuditorReflectionVerdict | null;
}

const ACTION_SUCCESS_PATTERNS = [
  /\b(?:order placed|order confirmed|thank you for your order|payment successful|purchase complete)\b/i,
  /\b(?:application submitted|successfully submitted|your submission has been received|form submitted)\b/i,
  /\b(?:registration complete|account created|sign up successful|welcome aboard)\b/i,
  /\b(?:booking confirmed|reservation confirmed|appointment scheduled)\b/i,
  /\b(?:transaction successful|transfer complete)\b/i,
];

export class AuditorReflectionGate implements IAuditorReflectionGate {
  /**
   * Main reflection entry point. Executes fast synchronous heuristic checks first,
   * catching stale element IDs, action loops/drift, and premature/redundant actions
   * before any CDP command is sent to the browser.
   */
  public async reflect(input: AuditorReflectionInput): Promise<AuditorReflectionVerdict> {
    // 1. Element Recovery & Stale Reference Check
    const recoveryVerdict = this.checkElementRecovery(input);
    if (recoveryVerdict) {
      return recoveryVerdict;
    }

    // 2. Action Drift & Loop Detection
    const driftVerdict = this.checkActionDrift(input);
    if (driftVerdict) {
      return driftVerdict;
    }

    // 3. Goal Satisfaction & Early Finish Check
    const satisfactionVerdict = this.checkGoalSatisfaction(input);
    if (satisfactionVerdict) {
      return satisfactionVerdict;
    }

    // Default: action approved for execution
    return {
      status: 'approved',
      reason: 'Action passed all heuristic validation checks.',
    };
  }

  /**
   * Stale element reference detection and substitute recovery advisory.
   * Catches cases where element IDs changed due to SPA re-rendering or dynamic DOM replacement.
   */
  public checkElementRecovery(input: AuditorReflectionInput): AuditorReflectionVerdict | null {
    const { action, elements } = input;

    // Check actions that require an element target
    if (
      action.action === 'click' ||
      action.action === 'type' ||
      action.action === 'select_option' ||
      action.action === 'hover'
    ) {
      const targetId = action.elementId;

      // Ensure valid ID
      if (typeof targetId !== 'number' || targetId <= 0) {
        return {
          status: 'rejected',
          reason: `Invalid element ID [${targetId}]. Element IDs must be positive 1-based integers.`,
          correctionHint: `Element ID [${targetId}] is invalid. Look at the INTERACTIVE ELEMENTS list in the current perception and choose a valid [1], [2], [3]... ID.`,
        };
      }

      if (elements && elements.length > 0) {
        const found = elements.find((el) => el.id === targetId);

        if (found) {
          // Element exists in current perception. Check disabled status.
          if (found.disabled && (action.action === 'click' || action.action === 'type')) {
            const name = found.text || found.label || found.role || found.tagName;
            return {
              status: 'rejected',
              reason: `Element [${targetId}] ("${name.slice(0, 30)}") is currently disabled.`,
              correctionHint: `Element [${targetId}] is disabled. Ensure all required predecessor fields or checkboxes are filled first, or wait if the page is currently loading/submitting.`,
            };
          }
          return null;
        }

        // Element was NOT found in the perception tree (stale ID). Search for substitute.
        const substitute = this.findMatchingSubstitute(action, elements);
        if (substitute) {
          const subName =
            substitute.text || substitute.label || substitute.placeholder || substitute.role || '';
          return {
            status: 'rejected',
            reason: `Stale element reference: ID [${targetId}] does not exist in the current DOM.`,
            correctionHint: `Element [${targetId}] was not found in the live DOM (it was replaced or re-rendered). A matching ${substitute.role || substitute.tagName} ("${subName.slice(0, 30)}") is available at ID [${substitute.id}]. Target ID [${substitute.id}] instead.`,
            suggestedAction: { ...action, elementId: substitute.id },
          };
        }

        const availableSample = elements
          .slice(0, 6)
          .map(
            (e) => `[${e.id}] ${e.role || e.tagName}: "${(e.text || e.label || '').slice(0, 16)}"`,
          )
          .join(', ');

        return {
          status: 'rejected',
          reason: `Element [${targetId}] not found in live perception tree.`,
          correctionHint: `Element [${targetId}] no longer exists on the page. Available active elements include: ${availableSample || 'none'}. Re-examine the active element list and pick an existing element ID.`,
        };
      }
    }

    return null;
  }

  /**
   * Action drift and loop detection.
   * Catches circular action loops, restricted navigation, same-URL reloads,
   * excessive waits, and downward scrolling past the page bottom.
   */
  public checkActionDrift(input: AuditorReflectionInput): AuditorReflectionVerdict | null {
    const { action, domState, actionHistory = [] } = input;

    // 1. Restricted URL or Same-Page Redundant Navigation Check
    if (action.action === 'navigate') {
      if (isRestrictedUrl(action.url)) {
        return {
          status: 'rejected',
          reason: `Navigation to restricted URL "${action.url}" blocked.`,
          correctionHint: `Navigation to "${action.url}" is forbidden by security policy (browser internal schemes or cloud metadata endpoints). Stay within public websites to achieve: "${input.goal}".`,
        };
      }

      const cleanCurrent = (domState.url || '').split('#')[0].replace(/\/$/, '').toLowerCase();
      const cleanTarget = (action.url || '').split('#')[0].replace(/\/$/, '').toLowerCase();
      if (cleanCurrent && cleanTarget && cleanCurrent === cleanTarget) {
        return {
          status: 'rejected',
          reason: `Redundant navigation to current URL "${action.url}".`,
          correctionHint: `You are already on "${domState.url}". Do not re-navigate to the identical page. Interact directly with the elements already visible.`,
        };
      }
    }

    // 2. Scroll Boundary Check (Scrolling down while already at bottom)
    if (action.action === 'scroll' && action.direction === 'down') {
      if (domState.viewport?.atBottom) {
        return {
          status: 'rejected',
          reason: 'Cannot scroll down further: viewport is already at the bottom of the page.',
          correctionHint:
            'You have reached the bottom of the page. Do not scroll down anymore. Look at the visible interactive elements, or scroll up if you need to find earlier sections.',
        };
      }
    }

    // 3. Consecutive Wait Overload Check
    if (action.action === 'wait') {
      const recentWaits = actionHistory.slice(-2).filter((a) => a.action === 'wait').length;
      if (recentWaits >= 2) {
        return {
          status: 'rejected',
          reason: 'Excessive consecutive wait actions without intermediate state progression.',
          correctionHint:
            'The browser has already waited across multiple consecutive steps. Do not wait again; inspect the current page content and choose a concrete action or finish.',
        };
      }
    }

    // 4. Oscillating / Ping-Pong Action Sequence Detection (A -> B -> A -> B)
    if (actionHistory.length >= 3) {
      const aPrev = JSON.stringify(actionHistory[actionHistory.length - 1]);
      const aPrevPrev = JSON.stringify(actionHistory[actionHistory.length - 2]);
      const aPrevPrevPrev = JSON.stringify(actionHistory[actionHistory.length - 3]);
      const aCurrent = JSON.stringify(action);

      // Pattern: [A, B, A] -> now proposing B
      if (aCurrent === aPrevPrev && aPrev === aPrevPrevPrev && aCurrent !== aPrev) {
        return {
          status: 'rejected',
          reason: 'Oscillating action loop detected (alternating between two identical actions).',
          correctionHint:
            'You are stuck in a 2-step toggle cycle (alternating between two actions). Break out of the loop by selecting a different element or completing the task.',
        };
      }
    }

    return null;
  }

  /**
   * Goal satisfaction check.
   * Proactively detects when a mutating goal is already confirmed on page
   * and blocks premature finish when required form validations are broken.
   */
  public checkGoalSatisfaction(input: AuditorReflectionInput): AuditorReflectionVerdict | null {
    const { action, domState, goalKind } = input;

    // Check 1: Premature Finish with Active Form Validation Errors
    if (action.action === 'finish') {
      if (
        goalKind === 'action' &&
        domState.validationErrors &&
        domState.validationErrors.length > 0
      ) {
        return {
          status: 'rejected',
          reason: `Cannot finish: on-page form validation errors detected (${domState.validationErrors.join(', ')}).`,
          correctionHint: `The form has active validation errors: "${domState.validationErrors.join('; ')}". Resolve the invalid inputs before finishing.`,
        };
      }
    }

    // Check 2: Early Goal Satisfaction (Success message already visible on page)
    if (action.action !== 'finish' && action.action !== 'fail') {
      if (goalKind === 'action') {
        const pageText = `${domState.title || ''} ${domState.textExcerpt || ''}`;
        const hasSuccessMessage = ACTION_SUCCESS_PATTERNS.some((pattern) => pattern.test(pageText));

        if (hasSuccessMessage) {
          const snippetMatch = ACTION_SUCCESS_PATTERNS.map((p) => pageText.match(p)).find(Boolean);
          const matchedText = snippetMatch ? snippetMatch[0] : 'Confirmation banner';

          return {
            status: 'early_finish',
            reason: `Goal satisfaction detected on page: "${matchedText}".`,
            correctionHint: `The page already displays proof of completion ("${matchedText}"). Call "finish" with a summary of the confirmation instead of continuing unnecessary actions.`,
            suggestedAction: {
              action: 'finish',
              summary: `Goal completed successfully: on-page confirmation ("${matchedText}") verified on ${domState.title || domState.url}.`,
            },
          };
        }
      }
    }

    return null;
  }

  /**
   * Heuristic search to match a stale element ID with its re-rendered equivalent
   * based on tagName, role, label, text, or placeholder.
   */
  private findMatchingSubstitute(
    action: AgentAction & { elementId?: number; text?: string },
    elements: PerceivedElement[],
  ): PerceivedElement | undefined {
    // If action is a type action, look for an input/textarea with similar attributes
    if (action.action === 'type') {
      return elements.find(
        (el) =>
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.role === 'textbox') &&
          !el.disabled,
      );
    }

    return undefined;
  }
}

export const defaultAuditorReflectionGate = new AuditorReflectionGate();
