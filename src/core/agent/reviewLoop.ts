import { Task } from '../../integration/store/coreStore';

/** Titles of the viability-review tasks the loop creates, e.g. "Verdict round 2". */
const VERDICT_PREFIX = 'Verdict round ';

export const isVerdictTask = (t: Task) => t.title.startsWith(VERDICT_PREFIX);
export const verdictTitle = (round: number) => `${VERDICT_PREFIX}${round}`;

/** Number of the latest verdict round that has been requested (0 if none). */
export function latestVerdictRound(tasks: Task[]): number {
  return tasks.filter(isVerdictTask).reduce((max, t) => Math.max(max, Number(t.title.slice(VERDICT_PREFIX.length)) || 0), 0);
}

/** Verdict tasks of one round, with whether each advisor passed the draft. */
export function verdictsForRound(tasks: Task[], round: number) {
  return tasks
    .filter(t => t.title === verdictTitle(round))
    .map(t => ({ task: t, passed: /VERDICT:\s*PASS/i.test(t.output ?? '') && !/VERDICT:\s*FAIL/i.test(t.output ?? '') }));
}

export function verdictTaskDescription(draft: string): string {
  return `The Board Chair drafted this plan:\n"""\n${draft}\n"""\nJudge it from your role: would this actually work for the target consumer? Start your output with exactly "VERDICT: PASS" or "VERDICT: FAIL". Then give the single biggest blocking objection (if FAIL) and the specific change that would fix it.`;
}

export const REVISION_PROMPT = 'The advisors have returned verdicts on your draft (see the board). Rewrite the memo to resolve every FAIL objection with a concrete change to the plan, then call deliver_project. If every verdict is PASS, deliver the memo as it stands.';
