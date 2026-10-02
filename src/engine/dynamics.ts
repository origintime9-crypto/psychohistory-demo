import { applyAction, validateAction } from './cards';
import { neighborhood, transitionProbabilities } from './hazard';
import { DEFAULT_PARAMS, type Params } from './params';
import { Rng } from './rng';
import { muleTurn } from './mule';
import { applyStoryChoice, storyEvent, storyUnavailable } from './story';
import {
  clamp,
  cloneState,
  counts,
  type Action,
  type Event,
  type Phase,
  type State,
  type StepResult,
  type World,
} from './types';
const relax = (x: number, target: number, alpha: number, noise: number) =>
  clamp(x + alpha * (clamp(target) - x) + noise);
/** Pure world/state transformation; only the explicitly injected RNG is consumed. */
export function step(
  world: World,
  input: State,
  action: Action,
  rng: Rng,
  p: Params = DEFAULT_PARAMS,
  options: { captureImpact?: boolean; storySeed?: string } = {},
): StepResult {
  const dispatch = storyEvent(world, input, p, options.storySeed);
  if (!dispatch && action.eventChoice !== undefined) throw new Error('当前回合没有该事件');
  let influence = input.influence;
  if (dispatch) {
    const option = dispatch.choices.find((c) => c.id === (action.eventChoice ?? 'defer'));
    if (!option) throw new Error('未知事件选项');
    const unavailable = storyUnavailable(input, option);
    if (unavailable) throw new Error(unavailable);
    const gain = option.chance
      ? Math.min(option.effect.influence ?? 0, option.failure?.influence ?? 0)
      : (option.effect.influence ?? 0);
    influence = Math.min(8, influence - (option.cost.influence ?? 0) + gain);
  }
  // Costs and phases are known before any stochastic outcome. Validation consumes no RNG.
  validateAction(world, { ...input, influence }, action);
  const reformDraw = rng.uniform();
  const [shockNormal] = rng.normalPair();
  const shockDraw = rng.uniform();
  const storyDraw = rng.uniform();
  const resolved = dispatch
    ? applyStoryChoice(world, input, dispatch, action.eventChoice ?? 'defer', storyDraw)
    : null;
  const eventState = resolved?.state ?? input;
  const applied = applyAction(world, eventState, action, reformDraw, p);
  const s = applied.state;
  const impact = options.captureImpact ? cloneState(s) : undefined;
  const muleEvent = p.mule && !s.muleOccurred && s.turn + 1 === muleTurn(world.seed);
  const shock =
    (p.commonShock
      ? p.shockSD * shockNormal + (shockDraw < p.shockProbability ? p.shockJump : 0)
      : 0) + (muleEvent ? p.muleShock : 0);
  if (muleEvent) s.muleOccurred = true;
  const events: Event[] = [];
  const nextPhase = new Uint8Array(world.n);
  const noise = new Float64Array(8);
  // Every sector consumes 9 uniforms in every phase, including absorbing independent worlds.
  for (let i = 0; i < world.n; i++) {
    const u = rng.uniform();
    rng.fillNormals(noise);
    const prob = transitionProbabilities(world, s, i, shock, p);
    let cumulative = 0,
      to: Phase = 3;
    for (let k = 0; k < 4; k++) {
      cumulative += prob[k];
      if (u < cumulative) {
        to = k as Phase;
        break;
      }
    }
    nextPhase[i] = to;
    if (to !== s.phase[i]) events.push({ sector: i, from: s.phase[i] as Phase, to });
    // Drifts are synchronous: all right-hand sides use the post-action, pre-transition state.
    const unrest = to === 1 ? 1 : 0,
      rebellion = to === 2 ? 1 : 0;
    const [c] = neighborhood(world, s, i, p);
    const geff = s.governance * Math.exp(-world.distance[i] / 0.8);
    const eps = (k: number) => p.driftNoise * noise[k];
    const pressure =
      relax(s.pressure[i], p.pressureTarget, 0.15, eps(0)) - 0.03 * unrest - 0.08 * rebellion;
    const prosperity =
      relax(
        s.prosperity[i],
        1.1 - 0.7 * s.pressure[i] - 0.3 * (s.tax - 0.2) - 0.2 * (1 - s.treasury) + s.education[i],
        0.4,
        eps(1),
      ) -
      0.04 * unrest -
      0.1 * rebellion;
    const elites = clamp(
      s.elites[i] +
        0.15 * s.pressure[i] * (1 - s.elites[i]) -
        (0.03 + 0.07 * s.treasury) * s.elites[i] -
        (0.05 * unrest + 0.2 * rebellion) * s.elites[i] +
        eps(2),
    );
    const faction = relax(
      s.faction[i],
      s.elites[i] + 0.2 * c - (p.religionFaction ?? 0.3) * s.religion[i],
      0.3,
      eps(3),
    );
    const legitimacy =
      relax(
        s.legitimacy[i],
        0.85 -
          0.35 * world.distance[i] -
          0.6 * (s.tax - 0.2) -
          0.2 * c +
          (p.religionLegitimacy ?? 0.25) * s.religion[i] +
          0.1 * geff,
        0.3,
        eps(4),
      ) -
      0.05 * rebellion;
    // Neighbors use only old discrete phases. Local continuous drifts may be stored now;
    // the phase array and empire variables are committed only after every sector is evaluated.
    s.pressure[i] = clamp(pressure);
    s.prosperity[i] = clamp(prosperity);
    s.elites[i] = clamp(elites);
    s.faction[i] = clamp(faction);
    s.legitimacy[i] = clamp(legitimacy);
    s.religion[i] *= p.religionRetention ?? 0.7;
    s.education[i] *= 0.85;
    s.garrison[i] *= 0.9;
  }
  s.phase = nextPhase;
  if (p.fiscalFeedback) {
    let income = 0,
      expense = 0;
    for (let i = 0; i < world.n; i++) {
      const phase = s.phase[i];
      income +=
        s.tax *
        world.weights[i] *
        s.prosperity[i] *
        (phase === 0 ? 1 : phase === 1 ? 0.6 : phase === 2 ? 0.1 : 0);
      expense += p.expense * world.weights[i] * (0.6 + 0.4 * world.distance[i]);
    }
    const c = counts(s);
    expense += (p.rebellionExpense * c.rebellion) / world.n;
    s.treasury = clamp(s.treasury + p.budgetSpeed * (income - expense));
    s.governance = relax(
      s.governance,
      0.25 + 0.5 * s.treasury - (p.prestigeLoss * c.independent) / world.n + s.reform,
      0.3,
      0,
    );
  }
  s.reform *= 0.97;
  if (s.taxReliefTurns > 0) {
    s.taxReliefTurns--;
    if (s.taxReliefTurns === 0) s.tax = s.baseTax;
  }
  s.influence = Math.min(8, s.influence + p.influenceRecovery);
  s.turn++;
  return {
    state: s,
    events,
    shock,
    reformFailed: applied.reformFailed,
    muleEvent,
    impact,
    story: resolved?.story,
  };
}
