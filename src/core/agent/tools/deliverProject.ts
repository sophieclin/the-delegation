import { AgentActionContext } from '../ToolRegistry';
import { useCoreStore } from '../../../integration/store/coreStore';
import { useTeamStore } from '../../../integration/store/teamStore';
import { AGENTIC_SETS } from '../../../data/agents';
import { latestVerdictRound, verdictsForRound, verdictTitle, verdictTaskDescription } from '../reviewLoop';

export function deliverProject(agent: AgentActionContext, args: { output: string }): boolean {
  const store = useCoreStore.getState();
  const { output } = args;

  // VALIDATION: Only Lead Agent (index 1) can deliver
  if (store.phase !== 'working') return false;
  
  // SAFETY: Prevent project delivery if subagents are still working or waiting for approval
  const pendingTasks = store.tasks.filter(t => t.status === 'in_progress' || t.status === 'on_hold');
  if (pendingTasks.length > 0) {
    const names = pendingTasks.map(t => t.title).join(', ');
    agent.appendHistory({
      role: 'user',
      content: `[SYSTEM] You cannot deliver the project yet. There are pending tasks: ${names}. All subagents must finish their work first.`,
      metadata: { internal: true }
    });
    return false;
  }

  const teamId = useTeamStore.getState().selectedAgentSetId;
  const activeTeam = useTeamStore.getState().customSystems.find(s => s.id === teamId) 
    || AGENTIC_SETS.find(s => s.id === teamId);

  // REVIEW LOOP: send the draft to the advisors and only accept it once they all pass it
  // (or the round limit is hit). Rejecting here leaves the project 'working'; the new verdict
  // tasks run, and when they finish the lead is asked to deliver again.
  const loop = activeTeam?.reviewLoop;
  const advisors: number[] = (agent.data.subagents ?? []).map((a: any) => a.index);
  let finalOutput = output;
  if (loop && advisors.length > 0) {
    const round = latestVerdictRound(store.tasks);
    const verdicts = verdictsForRound(store.tasks, round);
    const allPassed = round > 0 && verdicts.every(v => v.passed);
    if (!allPassed && round < loop.maxRounds) {
      const next = round + 1;
      advisors.forEach(id => store.addTask({
        title: verdictTitle(next),
        description: verdictTaskDescription(output),
        assignedAgentId: id,
        status: 'scheduled',
        requiresUserApproval: false
      }));
      store.addLogEntry({ agentIndex: agent.data.index, action: `sent the draft for review (round ${next} of ${loop.maxRounds})`, taskId: undefined });
      return false;
    }
    if (!allPassed) {
      finalOutput += '\n\n> Unresolved after the final review round: ' + verdicts.filter(v => !v.passed).map(v => v.task.title).length + ' advisor(s) still said FAIL. See the board for their objections.';
    }
  }

  const isMultimodal = activeTeam?.outputType && activeTeam.outputType !== 'text';

  if (isMultimodal) {
    store.setIsGeneratingAsset(true);
    // We don't set phase to 'done' yet, AgentHost will handle generation then set phase to done.
  } else {
    store.setFinalOutput(finalOutput);
    store.setPhase('done');
  }
  
  // Mark remaining active tasks for this agent as done
  store.tasks.filter(t => t.assignedAgentId === agent.data.index && t.status === 'in_progress')
    .forEach(t => store.updateTaskStatus(t.id, 'done'));
    
  store.addLogEntry({ agentIndex: agent.data.index, action: 'delivered final project results', taskId: undefined });
  
  return true;
}
