import { ResearchReport, Opportunity, WorldBible, Storyboard, ProductionPlan } from './schemas';
import { ResearchEvidence } from './research-schemas';
import { Project, AgentRunLog } from './project-schemas';
import { CostEntry } from './asset-schemas';
import { createLLMProvider, llmProviderName } from '@/providers/factory';
import { createResearchProvider } from '@/providers/research-factory';
import { ResearchAgent } from '@/agents/research-agent';
import { OpportunityAgent } from '@/agents/opportunity-agent';
import { WorldBuilderAgent } from '@/agents/world-builder-agent';
import { StoryboardAgent } from '@/agents/storyboard-agent';
import { ProductionPlannerAgent } from '@/agents/production-planner-agent';
import { ProjectStore } from '@/store/project-store';

export type PipelineStage =
  | 'IDLE' | 'RESEARCH' | 'OPPORTUNITY' | 'CREATIVE_DIRECTION'
  | 'WORLD_BUILDING' | 'STORYBOARDING' | 'PRODUCTION_PLANNING'
  | 'COMPLETE' | 'ERROR';

export interface PipelineState {
  stage: PipelineStage;
  projectId?: string;
  error?: string;
  research?: ResearchReport;
  researchEvidence?: ResearchEvidence[];
  opportunity?: Opportunity;
  worldBible?: WorldBible;
  storyboard?: Storyboard;
  productionPlan?: ProductionPlan;
  logs: AgentRunLog[];
}

/**
 * Rescale shot durations so they sum to exactly `targetSec`.
 *
 * Proportional to what the storyboard asked for, floored at 1s per shot, with the rounding
 * remainder handed to the longest shots first so a correction is least visible where it matters
 * least. Returns the input untouched when it already adds up, or when there is nothing to scale.
 */
export function reconcileShotDurations<T extends { duration: string }>(shots: T[], targetSec: number): T[] {
  if (shots.length === 0 || targetSec <= 0) return shots;

  const raw = shots.map((s) => Math.max(0, parseInt(s.duration) || 0));
  const total = raw.reduce((a, b) => a + b, 0);
  if (total === targetSec) return shots;

  // Below one second per shot there is nothing to distribute; give every shot the floor and accept
  // that the total will exceed the request rather than emitting zero-length clips.
  if (targetSec <= shots.length) {
    console.warn(`[ORCHESTRATOR] ${shots.length} shots cannot fit ${targetSec}s; using 1s each`);
    return shots.map((s) => ({ ...s, duration: "1" }));
  }

  const weights = total > 0 ? raw : raw.map(() => 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const scaled = weights.map((w) => Math.max(1, Math.floor((w / weightSum) * targetSec)));

  let remainder = targetSec - scaled.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  for (let k = 0; remainder !== 0 && k < order.length * Math.abs(remainder) + order.length; k++) {
    const i = order[k % order.length];
    if (remainder > 0) { scaled[i] += 1; remainder -= 1; }
    else if (scaled[i] > 1) { scaled[i] -= 1; remainder += 1; }
  }

  console.warn(`[ORCHESTRATOR] Duration drift corrected: ${total}s planned -> ${targetSec}s requested`);
  return shots.map((s, i) => ({ ...s, duration: String(scaled[i]) }));
}

export class ProductionPipeline {
  private researchAgent: ResearchAgent;
  private opportunityAgent: OpportunityAgent;
  private worldBuilderAgent: WorldBuilderAgent;
  private storyboardAgent: StoryboardAgent;
  private productionPlannerAgent: ProductionPlannerAgent;

  private listeners: ((state: PipelineState) => void)[] = [];

  constructor(private store: ProjectStore) {
    const llm = createLLMProvider();
    this.researchAgent = new ResearchAgent(llm, createResearchProvider());
    this.opportunityAgent = new OpportunityAgent(llm);
    this.worldBuilderAgent = new WorldBuilderAgent(llm);
    this.storyboardAgent = new StoryboardAgent(llm);
    this.productionPlannerAgent = new ProductionPlannerAgent(llm);
  }

  subscribe(listener: (state: PipelineState) => void) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(state: PipelineState) {
    this.listeners.forEach(l => l(state));
  }

  /** Creates the project and kicks off a DETACHED run (server-side fire-and-forget). */
  async start(prompt: string, style: string, duration: number, budgetUSD?: number, ownerUid?: string): Promise<string> {
    const project = await this.store.createProject(this.initialProjectData(prompt, style, duration, budgetUSD, ownerUid));
    void this.run(project, prompt, style, duration).catch((e) =>
      console.error("[PIPELINE] detached run failed:", e)
    );
    return project.id;
  }

  /** Creates the project and awaits completion (tests / local tooling). */
  async execute(prompt: string, style: string, duration: number, budgetUSD?: number, ownerUid?: string): Promise<PipelineState> {
    const project = await this.store.createProject(this.initialProjectData(prompt, style, duration, budgetUSD, ownerUid));
    return this.run(project, prompt, style, duration);
  }

  private initialProjectData(prompt: string, style: string, duration: number, budgetUSD?: number, ownerUid?: string) {
    return {
      title: 'Untitled Production',
      userGoal: prompt,
      style,
      requestedDuration: duration,
      status: 'CREATED' as const,
      llmProvider: process.env.LLM_PROVIDER ?? 'gemini',
      budgetUSD,
      ownerUid,
    };
  }

  private async run(projectArg: Project, prompt: string, style: string, duration: number): Promise<PipelineState> {
    let project = projectArg;
    let state: PipelineState = { stage: 'RESEARCH', projectId: project.id, logs: [] };
    this.emit(state);

    // Real spend ledger: LLM entries (Vertex) + later generation entries (AssetDirector)
    let ledger: CostEntry[] = [...(project.costLedger ?? [])];

    const track = (
      agentName: string,
      r: { usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; latencyMs: number; model?: string; costUSD?: number }
    ) => {
      if (r.usage) state.logs.push({ agentName, ...r.usage, latencyMs: r.latencyMs, model: r.model });
      if (r.costUSD != null && r.costUSD > 0) {
        ledger.push({
          at: Date.now(),
          kind: "llm",
          provider: llmProviderName(),
          model: r.model,
          costUSD: r.costUSD,
          note: agentName,
        });
      }
    };

    try {
      // 1. Research
      const researchResult = await this.researchAgent.run(prompt);
      state.research = researchResult.report;
      state.researchEvidence = researchResult.evidence;
      track('ResearchAgent (Queries)', researchResult.queriesResult);
      track('ResearchAgent (Synthesis)', researchResult.reportResult);
      project = await this.store.updateProject(project.id, {
        research: state.research, researchEvidence: state.researchEvidence,
        logs: state.logs, costLedger: ledger, status: 'RESEARCH_COMPLETE'
      }) ?? project;
      state.stage = 'OPPORTUNITY'; this.emit(state);

      // 2. Opportunity
      const oppResult = await this.opportunityAgent.run(state.research, prompt);
      state.opportunity = oppResult.data;
      track('OpportunityAgent', oppResult);
      project = await this.store.updateProject(project.id, {
        opportunity: state.opportunity, logs: state.logs, costLedger: ledger, status: 'OPPORTUNITY_COMPLETE'
      }) ?? project;
      state.stage = 'CREATIVE_DIRECTION'; this.emit(state);

      // 3 & 4. World Building
      const wbResult = await this.worldBuilderAgent.run(state.opportunity, style, prompt);
      state.worldBible = wbResult.data;
      track('WorldBuilderAgent', wbResult);
      project = await this.store.updateProject(project.id, {
        worldBible: state.worldBible, title: state.worldBible.title,
        logs: state.logs, costLedger: ledger, status: 'WORLD_COMPLETE'
      }) ?? project;
      state.stage = 'STORYBOARDING'; this.emit(state);

      // 5. Storyboarding
      const sbResult = await this.storyboardAgent.run(state.worldBible, duration, prompt);
      state.storyboard = sbResult.data;
      track('StoryboardAgent', sbResult);

      // The storyboard prompt demands the shot durations sum to the requested runtime, but an LLM
      // doing arithmetic is a hope, not a guarantee — and every downstream cost estimate, Veo
      // render length and final cut length is derived from these numbers. Reconcile deterministically
      // rather than shipping a "15 second" film that runs 23 seconds.
      state.storyboard = { ...state.storyboard, shots: reconcileShotDurations(state.storyboard.shots, duration) };

      project = await this.store.updateProject(project.id, {
        storyboard: state.storyboard, logs: state.logs, costLedger: ledger, status: 'STORYBOARD_COMPLETE'
      }) ?? project;
      state.stage = 'PRODUCTION_PLANNING'; this.emit(state);

      // 6. Production Planning
      const ppResult = await this.productionPlannerAgent.run(state.storyboard);
      state.productionPlan = ppResult.data;
      track('ProductionPlannerAgent', ppResult);
      await this.store.updateProject(project.id, {
        productionPlan: state.productionPlan, logs: state.logs, costLedger: ledger, status: 'COMPLETED'
      });
      state.stage = 'COMPLETE'; this.emit(state);

    } catch (error: any) {
      state.stage = 'ERROR';
      state.error = error.message || "An unknown error occurred.";
      await this.store.updateProject(project.id, {
        status: 'FAILED_WITH_PARTIAL_ARTIFACTS', error: state.error, logs: state.logs, costLedger: ledger
      });
      this.emit(state);
    }

    return state;
  }
}