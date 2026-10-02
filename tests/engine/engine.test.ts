import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyAction, CARDS, drawHand } from '../../src/engine/cards';
import { step } from '../../src/engine/dynamics';
import {
  compareActions,
  designEffect,
  forecast,
  poissonBinomial,
  prepareBaseline,
  previewAction,
} from '../../src/engine/forecast';
import { ambiguity, onsetProbability, transitionProbabilities } from '../../src/engine/hazard';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../../src/engine/params';
import { Rng, stream } from '../../src/engine/rng';
import { score } from '../../src/engine/scoring';
import { ARRAY_KEYS, cloneState } from '../../src/engine/types';
import { generateWorld, initialState } from '../../src/engine/worldgen';
const world = generateWorld('test', { n: 30 }),
  state = initialState(world);
const independent = {
  ...DEFAULT_PARAMS,
  contagion: false,
  commonShock: false,
  fiscalFeedback: false,
  storyEvents: false,
};
describe('随机流与世界', () => {
  it('复现且命名流隔离', () => {
    const a = new Rng('a'),
      b = new Rng('a'),
      c = new Rng('b');
    const values = Array.from({ length: 1000 }, () => a.uniform());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b.uniform()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(c.uniform()).not.toBe(values[0]);
  });
  it('各尺寸图连通、对称、无自环，泊松距离与预算归一', () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(30, 50, 80), (seed, n) => {
        const w = generateWorld(seed, { n });
        expect(w).toEqual(generateWorld(seed, { n }));
        expect(w.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
        const visited = new Set([0]),
          queue = [0];
        while (queue.length) {
          const i = queue.pop()!;
          for (const j of w.neighbors[i]) {
            expect(j).not.toBe(i);
            expect(w.neighbors[j]).toContain(i);
            if (!visited.has(j)) {
              visited.add(j);
              queue.push(j);
            }
          }
        }
        expect(visited.size).toBe(n);
        for (let i = 0; i < n; i++)
          for (let j = 0; j < i; j++)
            expect(Math.hypot(w.x[i] - w.x[j], w.y[i] - w.y[j])).toBeGreaterThanOrEqual(
              1.08 / Math.sqrt(n) - 1e-12,
            );
      }),
      { numRuns: 16 },
    );
  });
  it('整局复现，预测不会消耗现实流', () => {
    const play = (withForecast: boolean) => {
      let s = state;
      const rng = stream(world.seed, 'reality');
      for (let t = 0; t < TOTAL_TURNS; t++) {
        if (withForecast)
          forecast(world, s, { card: 'noop' }, { M: 8, H: 1, seed: `forecast:${t}` });
        s = step(world, s, { card: 'noop' }, rng).state;
      }
      return s;
    };
    expect(play(true)).toEqual(play(false));
  });
});
describe('动力学与风险', () => {
  it('不修改输入，1000 步有界，独立吸收', () => {
    const before = cloneState(state);
    let s = state;
    const rng = new Rng(99);
    for (let t = 0; t < 1000; t++) {
      const next = step(world, s, { card: 'noop' }, rng).state;
      for (const key of ARRAY_KEYS.filter((k) => k !== 'phase' && k !== 'sermons'))
        for (const v of next[key]) expect(v >= 0 && v <= 1 && Number.isFinite(v)).toBe(true);
      for (const key of ['treasury', 'governance', 'tax', 'foundation', 'reform'] as const)
        expect(next[key] >= 0 && next[key] <= 1).toBe(true);
      for (let i = 0; i < world.n; i++) if (s.phase[i] === 3) expect(next.phase[i]).toBe(3);
      expect(next.influence).toBeLessThanOrEqual(8);
      s = next;
    }
    expect(state).toEqual(before);
  });
  it('随机状态转移归一', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 3 }),
        (x, phase) => {
          const s = cloneState(state);
          for (const key of ARRAY_KEYS.filter((k) => k !== 'phase' && k !== 'sermons'))
            s[key].fill(x);
          s.phase[0] = phase;
          const p = transitionProbabilities(world, s, 0, 0.5, DEFAULT_PARAMS);
          expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
          expect(p.every((v) => v >= 0 && v <= 1)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
  it('风险单调，混合政体峰值位于 0.5', () => {
    const risk = (s = state, c = 0, z = 0) => onsetProbability(s, 0, c, z, DEFAULT_PARAMS);
    const base = risk();
    for (const [key, direction] of [
      ['prosperity', -1],
      ['legitimacy', -1],
      ['faction', 1],
    ] as const) {
      const s = cloneState(state);
      s[key][0] += 0.1;
      expect(Math.sign(risk(s) - base)).toBe(direction);
    }
    expect(risk(state, 0.2)).toBeGreaterThan(base);
    expect(risk(state, 0, 0.3)).toBeGreaterThan(base);
    const s = cloneState(state);
    s.treasury += 0.1;
    expect(risk(s)).toBeLessThan(base);
    for (let i = 0; i <= 100; i++) expect(ambiguity(i / 100)).toBeLessThanOrEqual(ambiguity(0.5));
  });
  it('分支不改变抽样预算', () => {
    const a = new Rng(101),
      b = new Rng(101),
      s = cloneState(state);
    s.phase.fill(3);
    step(world, state, { card: 'noop' }, a);
    step(world, s, { card: 'reform' }, b);
    expect(a.uniform()).toBe(b.uniform());
  });
});
describe('干预与评分', () => {
  it('全部卡的即时方向、副作用与输入隔离', () => {
    const original = cloneState(state);
    const s = cloneState(state);
    s.influence = 8;
    const act = (card: keyof typeof CARDS, u = 0) =>
      applyAction(world, s, { card, target: 0 }, u).state;
    expect(act('academy').prosperity[0]).toBeGreaterThan(s.prosperity[0]);
    expect(act('academy').pressure[0]).toBeLessThan(s.pressure[0]);
    expect(act('academy').elites[0]).toBeGreaterThan(s.elites[0]);
    expect(act('religion').religion[0]).toBeGreaterThan(s.religion[0]);
    expect(act('religion').faction[0]).toBeLessThan(s.faction[0]);
    expect(act('elites').elites[0]).toBeLessThan(s.elites[0]);
    expect(act('elites').treasury).toBeLessThan(s.treasury);
    expect(act('tax').tax).toBeLessThan(s.tax);
    expect(act('reform').governance).toBeGreaterThan(s.governance);
    expect(act('reform', 0.99).elites[0]).toBeGreaterThan(s.elites[0]);
    expect(act('foundation').foundation).toBeGreaterThan(s.foundation);
    expect(act('noop').influence).toBe(8);
    expect(state).toEqual(original);
    expect(drawHand(world, 0)).toHaveLength(4);
    expect(new Set(drawHand(world, 0)).size).toBe(4);
  });
  it('费用与独立目标不合法时拒绝', () => {
    const s = cloneState(state);
    s.influence = 0;
    expect(() => applyAction(world, s, { card: 'foundation' }, 0)).toThrow('影响力');
    s.influence = 8;
    s.phase[0] = 3;
    expect(() => applyAction(world, s, { card: 'academy', target: 0 }, 0)).toThrow('目标');
  });
  it('无效行动不消耗现实随机流', () => {
    const a = new Rng('invalid-action'),
      b = a.clone();
    const s = cloneState(state);
    s.influence = 0;
    expect(() => step(world, s, { card: 'foundation' }, a)).toThrow();
    expect(a.uniform()).toBe(b.uniform());
  });
  it('黑暗时代端点、维稳基础分与末三回合', () => {
    expect(score(0, [{ stable: 0 }]).darkness).toBe(30000);
    expect(score(0, [{ stable: 1 }]).Q).toBeCloseTo(Math.sqrt(0.1));
    expect(score(0, [{ stable: 1 }]).darkness).toBeLessThan(30000);
    expect(score(1, [{ stable: 1 }]).darkness).toBe(1000);
    expect(
      score(1, [{ stable: 0 }, { stable: 0.9 }, { stable: 0.9 }, { stable: 0.9 }]).S,
    ).toBeCloseTo(0.9);
  });
});
describe('预测与统计', () => {
  it('独立蒙特卡洛与精确 Poisson–二项分布一致', () => {
    const probs = Array.from(
      { length: world.n },
      (_, i) => 1 - transitionProbabilities(world, state, i, 0, independent)[0],
    );
    const exact = poissonBinomial(probs);
    const result = forecast(
      world,
      state,
      { card: 'noop' },
      { M: 12000, H: 1, seed: 'exact-check', params: independent },
    );
    expect(result.points[0].mean).toBeCloseTo(
      probs.reduce((a, b) => a + b, 0),
      1,
    );
    expect(result.histogram.reduce((sum, p, k) => sum + Math.abs(p - exact[k]), 0)).toBeLessThan(
      0.08,
    );
    expect(result.design.deff).toBeGreaterThan(0.94);
    expect(result.design.deff).toBeLessThan(1.06);
  });
  it('Poisson–二项端点与概率校验', () => {
    expect(poissonBinomial([0, 1, 0.5])).toEqual([0, 0.5, 0.5, 0]);
    expect(() => poissonBinomial([1.1])).toThrow();
  });
  it('自比较为零，CRN 减少有效干预比较的标准误', () => {
    const options = { M: 2000, H: 1, seed: 'crn-test', params: independent };
    const same = compareActions(
      world,
      state,
      { card: 'academy', target: 0 },
      { card: 'academy', target: 0 },
      options,
    );
    expect(same.meanDelta).toBe(0);
    expect(same.standardError).toBe(0);
    const paired = compareActions(
        world,
        state,
        { card: 'noop' },
        { card: 'academy', target: 0 },
        options,
      ),
      unpaired = compareActions(
        world,
        state,
        { card: 'noop' },
        { card: 'academy', target: 0 },
        options,
        false,
      );
    expect(paired.standardError).toBeLessThan(unpaired.standardError * 0.3);
    expect(paired.meanDelta).toBeLessThan(0);
  });
  it('异质独立方差基准、完全相关与确定性退化', () => {
    expect(designEffect([new Uint8Array(3), new Uint8Array(3)]).deff).toBe(1);
    expect(
      designEffect([
        [0, 0, 0],
        [1, 1, 1],
      ]).deff,
    ).toBeCloseTo(3);
    expect(
      designEffect([
        [0, 0, 0],
        [1, 1, 1],
      ]).effectiveN,
    ).toBeCloseTo(1);
  });
  it('缓存基线与重新采样的配对结果完全一致', () => {
    const opts = { M: 64, H: 3, seed: 'cache-test' },
      action = { card: 'reform' as const };
    const uncached = previewAction(world, state, action, opts),
      baseline = prepareBaseline(world, state, opts);
    expect(previewAction(world, state, action, opts, baseline)).toEqual(uncached);
  });
  it('改革缓冲延续到治理目标，重建后改善后续平息率', () => {
    const s = cloneState(state);
    s.influence = 8;
    const after = applyAction(world, s, { card: 'reform' }, 0).state;
    expect(after.reform).toBe(0.25);
    const result = step(world, after, { card: 'noop' }, new Rng('persistent')).state;
    expect(result.reform).toBeCloseTo(0.25 * 0.97);
    const control = cloneState(after);
    control.reform = 0;
    expect(result.governance).toBeGreaterThan(
      step(world, control, { card: 'noop' }, new Rng('persistent')).state.governance,
    );
  });
});
