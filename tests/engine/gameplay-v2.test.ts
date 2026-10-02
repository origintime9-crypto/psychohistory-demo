import { describe, expect, it } from 'vitest';
import { actionUnavailable, applyAction, CARDS, drawHand } from '../../src/engine/cards';
import { expectedOutcomes, shortlistTargets, targetEffects } from '../../src/engine/decisions';
import { step } from '../../src/engine/dynamics';
import {
  compareActions,
  forecast,
  prepareBaseline,
  previewAction,
} from '../../src/engine/forecast';
import { onsetBreakdown, onsetProbability, neighborhood } from '../../src/engine/hazard';
import { muleTurn } from '../../src/engine/mule';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../../src/engine/params';
import { storyEvent } from '../../src/engine/story';
import { stream } from '../../src/engine/rng';
import { score } from '../../src/engine/scoring';
import { cloneState, counts, type CardId } from '../../src/engine/types';
import { generateWorld, initialState } from '../../src/engine/worldgen';
import { availableActions, chooseAction, POLICY_NAMES } from '../../src/sim/policies';
import { cardContext, type CardContext } from '../../src/sim/cardContexts';
import { emptyGame, gameReducer } from '../../src/ui/gameReducer';
import { ResponseGate } from '../../src/ui/responseGate';
import { modelFingerprint, restoreGame, serializeGame } from '../../src/ui/saveGame';
import { ForecastService, type ForecastRequest } from '../../src/worker/forecast.service';

const world = generateWorld('gameplay-v2', { n: 30 });
const fresh = () => {
  const s = initialState(world);
  s.influence = 8;
  return s;
};
const options = { M: 64, H: 1, terminal: true, seed: 'terminal-test' };

describe('每卡终局收益回归', () => {
  it('六种干预在预先声明的合成场景中，平均终局得分高于按兵不动', () => {
    const contexts: [CardId, CardContext][] = [
      ['academy', 'natural-turn-4'],
      ['religion', 'natural-turn-4'],
      ['elites', 'elite-competition'],
      ['tax', 'fiscal-buffer'],
      ['reform', 'natural-turn-4'],
      ['foundation', 'natural-turn-4'],
    ];
    for (const [card, context] of contexts) {
      let sum = 0;
      for (let i = 0; i < 10; i++) {
        const { world, state, history, params } = cardContext(`card-regression:${i}`, context);
        const opts = { ...options, seed: `${world.seed}:paired`, params, history };
        const action = CARDS[card].targeted
          ? shortlistTargets(world, state, card, params, 1)[0]
          : { card };
        sum += previewAction(world, state, action, opts, prepareBaseline(world, state, opts))
          .comparison.scoreDelta;
      }
      expect(sum / 10, `${card} in ${context}`).toBeGreaterThan(0);
    }
  }, 30000);
});

describe('平衡机制 v2', () => {
  it('维稳有基础分；基地和稳定均增加成绩', () => {
    expect(score(0, [{ stable: 0.59 }]).Q).toBeGreaterThan(0.2);
    expect(score(0, [{ stable: 0.59 }]).darkness).toBeLessThan(15000);
    expect(score(0.2, [{ stable: 0.59 }]).Q).toBeGreaterThan(score(0, [{ stable: 0.59 }]).Q);
    expect(score(0.2, [{ stable: 0.8 }]).Q).toBeGreaterThan(score(0.2, [{ stable: 0.59 }]).Q);
  });
  it('减税持续四步、不叠加，到期恢复原税率', () => {
    let s = fresh();
    const original = cloneState(s),
      rng = stream('tax-duration', 'reality');
    const applied = applyAction(world, s, { card: 'tax' }, 0).state;
    expect(applied.legitimacy[0]).toBeGreaterThan(s.legitimacy[0]);
    expect(expectedOutcomes(world, applied, DEFAULT_PARAMS).crisis).toBeLessThan(
      expectedOutcomes(world, s, DEFAULT_PARAMS).crisis,
    );
    expect(actionUnavailable(world, applied, 'tax')).toContain('生效');
    expect(() => applyAction(world, applied, { card: 'tax' }, 0)).toThrow('叠加');
    for (let i = 0; i < 4; i++) {
      s = step(world, s, { card: i === 0 ? 'tax' : 'noop' }, rng).state;
      expect(s.taxReliefTurns).toBe(3 - i);
      expect(s.tax).toBeCloseTo(i === 3 ? original.tax : original.tax - 0.05);
    }
    expect(s.baseTax).toBe(original.tax);
    expect(original).toEqual(fresh());
  });
  it('精英卡在高竞争邻区有即时收益，财政成本只扣一次', () => {
    const s = fresh(),
      neighbor = world.neighbors[0][0];
    s.elites.fill(0.8);
    s.faction.fill(0.8);
    s.phase[0] = 1;
    const after = applyAction(world, s, { card: 'elites', target: 0 }, 0).state;
    expect(after.elites[0]).toBeCloseTo(0.55);
    expect(after.elites[neighbor]).toBeCloseTo(0.675);
    expect(after.treasury).toBeCloseTo(s.treasury - 0.01);
    expect(expectedOutcomes(world, after, DEFAULT_PARAMS).stable).toBeGreaterThan(
      expectedOutcomes(world, s, DEFAULT_PARAMS).stable,
    );
  });
  it('基地收益递减、依赖稳定与端点星，满进度继续产出知识', () => {
    const s = fresh(),
      rich = cloneState(s);
    rich.foundation = 0.8;
    const gain = (input: typeof s) =>
      applyAction(world, input, { card: 'foundation' }, 0).state.foundation - input.foundation;
    expect(gain(rich)).toBeLessThan(gain(s));
    const lost = cloneState(s);
    lost.phase[world.terminus] = 3;
    expect(gain(lost)).toBeLessThan(gain(s));
    rich.foundation = 1;
    const full = applyAction(world, rich, { card: 'foundation' }, 0).state;
    expect(full.foundation).toBe(1);
    expect(full.treasury).toBeGreaterThan(rich.treasury);
    expect(full.education[0]).toBeGreaterThan(rich.education[0]);
  });
  it('按兵不动能积攒未来二费行动，普通恢复只有一点', () => {
    const s = fresh();
    s.influence = 2;
    const rng = stream('resources', 'reality');
    const after = step(world, s, { card: 'academy', target: 0 }, rng.clone()).state;
    expect(after.influence).toBe(1);
    expect(actionUnavailable(world, after, 'academy')).toContain('不足');
    const saved = step(world, after, { card: 'noop' }, rng).state;
    expect(saved.influence).toBe(4);
    expect(actionUnavailable(world, saved, 'academy')).toBeNull();
  });
  it('风险分解与实际新动荡公式相符，不伪装为概率份额', () => {
    const s = fresh(),
      c = neighborhood(world, s, 0, DEFAULT_PARAMS)[0];
    const eta =
      DEFAULT_PARAMS.beta0 +
      onsetBreakdown(s, 0, c, DEFAULT_PARAMS).reduce((sum, t) => sum + t.value, 0);
    expect(-Math.expm1(-10 * Math.exp(eta))).toBeCloseTo(
      onsetProbability(s, 0, c, 0, DEFAULT_PARAMS),
      14,
    );
    expect(
      targetEffects(world, s, 'elites', DEFAULT_PARAMS).every((e) =>
        Number.isFinite(e.crisisDelta),
      ),
    ).toBe(true);
  });
});

describe('未知骡事件与终局预览', () => {
  it('出现时刻随种子变化，仅出现一次，不改变随机流预算', () => {
    expect(
      new Set(Array.from({ length: 30 }, (_, i) => muleTurn(`seed-${i}`))).size,
    ).toBeGreaterThan(4);
    const s = fresh();
    s.turn = muleTurn(world.seed) - 1;
    const a = stream('mule-budget', 'reality'),
      b = a.clone();
    const result = step(world, s, { card: 'noop' }, a, {
      ...DEFAULT_PARAMS,
      mule: true,
      commonShock: false,
    });
    step(world, s, { card: 'noop' }, b, { ...DEFAULT_PARAMS, mule: false, commonShock: false });
    expect(result.muleEvent).toBe(true);
    expect(result.state.muleOccurred).toBe(true);
    expect(a.uniform()).toBe(b.uniform());
    expect(
      step(world, result.state, { card: 'noop' }, a, { ...DEFAULT_PARAMS, mule: true }).muleEvent,
    ).toBe(false);
    expect(s.muleOccurred).toBe(false);
  });
  it('预测不知道开局的骡设定，未建模冲击能击穿事前区间', () => {
    const s = fresh();
    s.turn = muleTurn(world.seed) - 1;
    const known = { ...DEFAULT_PARAMS, commonShock: false, mule: false },
      unknown = { ...known, mule: true };
    const opts = { M: 256, H: 1, seed: 'unknown-mule-check', params: known };
    const f = forecast(world, s, { card: 'noop' }, opts);
    expect(forecast(world, s, { card: 'noop' }, { ...opts, params: unknown })).toEqual(f);
    const result = step(
      world,
      s,
      { card: 'noop' },
      stream('unknown-mule-check', 'reality'),
      unknown,
    );
    expect(counts(result.state).crisis).toBeGreaterThan(f.points[0].hi90);
  });
  it('终局稳定包括已经发生的末三回合，短图和终局评分分开', () => {
    const s = fresh();
    s.turn = TOTAL_TURNS - 1;
    const f = forecast(
      world,
      s,
      { card: 'noop' },
      {
        M: 64,
        H: 1,
        terminal: true,
        seed: 'late-game',
        history: [{ stable: 0.2 }, { stable: 0.4 }],
      },
    );
    const without = forecast(world, s, { card: 'noop' }, { M: 64, H: 1, seed: 'late-game' });
    expect(f.projection.S).toBeCloseTo((0.2 + 0.4 + without.projection.S) / 3, 12);
    expect(f.projection.complete).toBe(true);
    const early = forecast(world, fresh(), { card: 'noop' }, options);
    expect(early.H).toBe(1);
    expect(early.projection.horizon).toBe(TOTAL_TURNS);
  });
  it('ΔQ、ΔS、Δ国库、Δ黑暗时代与完整终局配对一致', () => {
    const s = fresh(),
      action = { card: 'tax' as const };
    const base = prepareBaseline(world, s, options),
      candidate = previewAction(world, s, action, options, base);
    expect(candidate.comparison.scoreDelta).toBeCloseTo(
      candidate.forecast.projection.Q - base.result.projection.Q,
      12,
    );
    expect(candidate.comparison.stabilityDelta).toBeCloseTo(
      candidate.forecast.projection.S - base.result.projection.S,
      12,
    );
    expect(candidate.comparison.treasuryDelta).toBeCloseTo(
      candidate.forecast.projection.treasury - base.result.projection.treasury,
      12,
    );
    expect(candidate.comparison.darknessDelta).toBeCloseTo(
      candidate.forecast.projection.darkness - base.result.projection.darkness,
      8,
    );
    expect(compareActions(world, s, action, action, options).scoreStandardError).toBe(0);
  });
});

describe('策略、Worker 与断点续玩', () => {
  it('各策略始终选择可负担、在手牌中的有效行动，不修改现实流', () => {
    for (const policy of POLICY_NAMES) {
      let s = initialState(world);
      const reality = stream(world.seed, 'reality'),
        choice = stream(world.seed, `policy:${policy}`);
      for (let t = 0; t < TOTAL_TURNS; t++) {
        const before = cloneState(s),
          clonedReality = reality.clone(),
          action = chooseAction(policy, world, s, choice);
        expect(s).toEqual(before);
        expect(drawHand(world, t)).toContain(action.card);
        expect(availableActions(world, s)).toContainEqual(action);
        expect(reality.clone().uniform()).toBe(clonedReality.uniform());
        s = step(world, s, action, reality).state;
      }
    }
  }, 30000);
  it('不同开关仅影响所请求的对照，旧会话和缓存参数不能混用', () => {
    const service = new ForecastService();
    const q: ForecastRequest = {
      id: 1,
      session: 1,
      kind: 'baseline',
      world,
      state: fresh(),
      action: { card: 'noop' },
      M: 8,
      H: 1,
      seed: 'worker-test',
      params: DEFAULT_PARAMS as typeof DEFAULT_PARAMS,
    };
    service.execute(q);
    const changed = {
      ...q,
      id: 2,
      baselineId: 1,
      kind: 'preview' as const,
      params: { ...DEFAULT_PARAMS, commonShock: false, contagion: false, fiscalFeedback: false },
      action: { card: 'tax' as const },
    };
    const response = service.execute(changed)!;
    expect(response).toEqual(
      previewAction(world, q.state, changed.action, {
        M: 8,
        H: 1,
        seed: q.seed,
        terminal: true,
        params: changed.params,
      }),
    );
    service.execute({ ...q, session: 2, id: 3 });
    expect(service.execute(changed)).toBeNull();
  });
  it('迟到的成功、错误和跨通道回复不会覆盖新选择', () => {
    const gate = new ResponseGate();
    gate.start(1);
    gate.expect('preview', 1);
    gate.expect('preview', 2);
    gate.expect('contrast', 3);
    expect(gate.accepts({ session: 1, kind: 'preview', id: 1 })).toBe(false);
    expect(gate.accepts({ session: 1, kind: 'preview', id: 2 })).toBe(true);
    expect(gate.accepts({ session: 1, kind: 'contrast', id: 2 })).toBe(false);
    gate.start(2);
    gate.expect('preview', 4);
    expect(gate.accepts({ session: 1, kind: 'contrast', id: 3 })).toBe(false);
  });
  it('reducer 双调用是纯的、重复执行只前进一次，种子和行动能恢复整局', () => {
    let game = gameReducer(emptyGame(true), { type: 'START', seed: world.seed, n: 30, mule: true });
    for (let turn = 0; turn < TOTAL_TURNS; turn++) {
      const s = game.session!,
        originalRng = s.reality.clone();
      if (storyEvent(s.world, s.state, s.params))
        game = gameReducer(game, { type: 'SELECT_EVENT', choice: 'defer' });
      const f = forecast(s.world, s.state, game.action, {
        M: 8,
        H: 1,
        seed: `resume:${turn}`,
        params: s.params,
      });
      const event = { type: 'ADVANCE' as const, turn, forecast: f },
        next = gameReducer(game, event);
      expect(gameReducer(game, event)).toEqual(next);
      expect(s.reality.clone().uniform()).toBe(originalRng.uniform());
      expect(gameReducer(next, event)).toBe(next);
      game = gameReducer(next, { type: 'FINISH_REVEAL' });
      const restored = restoreGame(serializeGame(game)!);
      expect(restored.session!.state).toEqual(game.session!.state);
      expect(restored.session!.history).toEqual(game.session!.history);
      expect(restored.session!.observations).toEqual(game.session!.observations);
      expect(restored.session!.reality.clone().uniform()).toBe(
        game.session!.reality.clone().uniform(),
      );
    }
    expect(game.status).toBe('ended');
    expect(restoreGame(serializeGame(game)!).status).toBe('ended');
  }, 30000);
  it('拒绝损坏、超长、版本不兼容和被篡改的行动存档', () => {
    const game = gameReducer(emptyGame(), { type: 'START', seed: world.seed, n: 30, mule: false }),
      saved = JSON.parse(serializeGame(game)!);
    expect(() => restoreGame('not-json')).toThrow();
    expect(() => restoreGame(JSON.stringify({ ...saved, model: 'synthetic-v1' }))).toThrow(
      '不兼容',
    );
    expect(() =>
      restoreGame(
        JSON.stringify({ ...saved, actions: Array(TOTAL_TURNS + 1).fill({ card: 'noop' }) }),
      ),
    ).toThrow('行动');
    expect(() =>
      restoreGame(JSON.stringify({ ...saved, params: { ...saved.params, foundationGain: 0.9 } })),
    ).toThrow('参数');
    const missing = { ...saved.params };
    delete missing.taxDuration;
    expect(() =>
      restoreGame(
        JSON.stringify({
          ...saved,
          params: missing,
          fingerprint: modelFingerprint(missing),
        }),
      ),
    ).toThrow('参数');
    expect(() => restoreGame(JSON.stringify({ ...saved, tutorialDone: 'yes' }))).toThrow('引导');
  });
});
