import { describe, expect, it } from 'vitest';
import { applyAction, CARD_IDS, CARDS, drawHand, validateAction } from '../../src/engine/cards';
import { atlasPosition, ATLAS_SIZE } from '../../src/engine/atlas';
import { decadeChapter } from '../../src/engine/decade';
import { step } from '../../src/engine/dynamics';
import { forecast, compareActions } from '../../src/engine/forecast';
import { transitionProbabilities } from '../../src/engine/hazard';
import { DEFAULT_PARAMS } from '../../src/engine/params';
import { stream } from '../../src/engine/rng';
import { impactTargets, routeTo } from '../../src/engine/strategy';
import {
  applyStoryChoice,
  previewStoryChoice,
  storyBudget,
  storyEvent,
} from '../../src/engine/story';
import { ARRAY_KEYS, STRATEGIC_KEYS, cloneState, type Action } from '../../src/engine/types';
import { createSession, emptyGame, gameReducer } from '../../src/ui/gameReducer';
import { galaxyArchive } from '../../src/ui/galaxyArchive';
import { modelFingerprint, restoreGame, serializeGame } from '../../src/ui/saveGame';

const params = { ...DEFAULT_PARAMS, strategic: true, atlas: true, campaign: true };
const fresh = (seed = 'strategy-test', n = 30) => createSession(seed, n, params);

describe('新版星图与卡牌', () => {
  it('30、50、80 星区与照片锚点对应，图连通，坐标不会逃出地图', () => {
    for (const n of [30, 50, 80]) {
      const { world } = fresh('atlas', n);
      expect(world.names[world.capital]).toBe('川陀');
      expect(world.names[world.terminus]).toBe('端点星');
      const visited = new Set([0]);
      const queue = [0];
      for (const i of queue)
        for (const j of world.neighbors[i])
          if (!visited.has(j)) {
            visited.add(j);
            queue.push(j);
          }
      expect(visited.size).toBe(n);
      for (let i = 0; i < n; i++) {
        const [x, y] = atlasPosition(world, i);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(ATLAS_SIZE.width);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(ATLAS_SIZE.height);
      }
    }
  });
  it('共有 13 种牌，新手牌为 5 张加等待，确定且无重复，所有种类都可抽到', () => {
    const { world } = fresh();
    expect(Object.keys(CARDS)).toHaveLength(13);
    const seen = new Set<string>();
    for (let turn = 0; turn < 30; turn++) {
      const hand = drawHand(world, turn, params);
      expect(hand).toHaveLength(6);
      expect(new Set(hand).size).toBe(6);
      expect(hand).toEqual(drawHand(world, turn, params));
      hand.forEach((id) => seen.add(id));
      expect(drawHand(world, turn)).toHaveLength(4);
    }
    expect(seen.size).toBe(13);
  });
  it('六种新牌改变不同的战略条件，不修改输入，旧存档不能使用新版牌', () => {
    const { world, state } = fresh();
    const original = cloneState(state);
    state.influence = 8;
    original.influence = 8;
    for (const card of [
      'relief',
      'convoy',
      'trade',
      'diplomacy',
      'intelligence',
      'evacuation',
    ] as const) {
      const next = applyAction(world, state, { card, target: 3 }, 0, params).state;
      expect(next.treasury).toBeLessThan(state.treasury);
      expect(next.strategic!.fatigue[3]).toBeGreaterThan(0);
      expect(next).not.toEqual(state);
    }
    expect(state).toEqual(original);
    expect(() =>
      validateAction(world, { ...state, strategic: undefined }, { card: 'relief', target: 3 }),
    ).toThrow('新版');
  });
  it('干预不能通过独立星区，航线必须由图中的相邻可达星区组成', () => {
    const { world, state } = fresh();
    const target = world.terminus;
    const route = routeTo(world, state, target);
    expect(route[0]).toBe(world.capital);
    expect(route.at(-1)).toBe(target);
    for (let i = 1; i < route.length; i++)
      expect(world.neighbors[route[i - 1]]).toContain(route[i]);
    for (const i of world.neighbors[target]) state.phase[i] = 3;
    expect(routeTo(world, state, target)).toEqual([]);
    expect(impactTargets(world, state, target)).toEqual([[target, 1]]);
  });
  it('补给与贸易改善风险，重复干预递减，情报降低共同冲击敏感度', () => {
    const { world, state } = fresh();
    state.influence = 8;
    const first = applyAction(world, state, { card: 'trade', target: 3 }, 0, params).state;
    expect(transitionProbabilities(world, first, 3, 0, params)[1]).toBeLessThan(
      transitionProbabilities(world, state, 3, 0, params)[1],
    );
    first.influence = 8;
    const second = applyAction(world, first, { card: 'trade', target: 3 }, 0, params).state;
    expect(second.strategic!.trade[3] - first.strategic!.trade[3]).toBeLessThan(
      first.strategic!.trade[3] - state.strategic!.trade[3],
    );
    const informed = applyAction(
      world,
      state,
      { card: 'intelligence', target: 4 },
      0,
      params,
    ).state;
    expect(transitionProbabilities(world, informed, 4, 1.5, params)[1]).toBeLessThan(
      transitionProbabilities(world, state, 4, 1.5, params)[1],
    );
  });
});

describe('事件算法与十年手记', () => {
  it('成功率根据当前局势变化，预览和实际使用同一概率', () => {
    const { world, state } = fresh();
    const eventParams = { ...params, campaign: false, storyChance: 1 };
    let event = storyEvent(world, state, eventParams)!;
    for (let turn = 0; turn < 30; turn++) {
      state.turn = turn;
      event = storyEvent(world, state, eventParams)!;
      if (event?.choices.some((c) => c.chance !== undefined && c.chance > 0 && c.chance < 1)) break;
    }
    const choice = event.choices.find((c) => c.chance !== undefined)!;
    expect(choice).toBeDefined();
    const tuned = cloneState(state);
    tuned.strategic!.intelligence[event.target] = 1;
    const informed = storyEvent(world, tuned, eventParams)!;
    expect(informed.choices.find((c) => c.id === choice.id)!.chance).toBeGreaterThan(
      choice.chance!,
    );
    expect(
      applyStoryChoice(world, state, event, choice.id, choice.chance! - 1e-6).story.success,
    ).toBe(true);
    expect(
      applyStoryChoice(world, state, event, choice.id, choice.chance! + 1e-6).story.success,
    ).toBe(false);
    const win = applyStoryChoice(world, state, event, choice.id, 0).state;
    const loss = applyStoryChoice(world, state, event, choice.id, 1).state;
    expect(previewStoryChoice(world, state, event, choice.id).treasury).toBeCloseTo(
      win.treasury * choice.chance! + loss.treasury * (1 - choice.chance!),
      12,
    );
  });
  it('事件与新牌共享资源，拒绝行动发生在消耗随机数之前', () => {
    const { world, state } = fresh();
    state.treasury = 0.01;
    const rng = stream('invalid', 'reality'),
      copy = rng.clone();
    expect(() =>
      step(world, state, { card: 'relief', target: 3, eventChoice: 'defer' }, rng, params),
    ).toThrow('国库');
    expect(rng.uniform()).toBe(copy.uniform());
    const event = storyEvent(world, state, params)!;
    for (const option of event.choices) {
      const budget = storyBudget(state, option);
      expect(budget.treasury).toBeGreaterThanOrEqual(0);
    }
  });
  it('固定随机预算为 5 + 9N，新策略有界且独立状态不可逆', () => {
    const { world, state } = fresh();
    state.phase[6] = 3;
    const rng = stream('fixed', 'reality'),
      copy = rng.clone();
    const result = step(world, state, { card: 'noop', eventChoice: 'defer' }, rng, params);
    for (let i = 0; i < 5 + 9 * world.n; i++) copy.uniform();
    expect(rng.uniform()).toBe(copy.uniform());
    expect(result.state.phase[6]).toBe(3);
    for (const k of STRATEGIC_KEYS)
      for (const value of result.state.strategic![k]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
  });
  it('手记约一千字，可重现，并与真正发生的独立和事件结果一致', () => {
    const { world, state } = fresh();
    const action: Action = { card: 'noop', eventChoice: 'defer' };
    const result = step(world, state, action, stream(world.seed, 'reality'), params);
    const chapter = decadeChapter(world, state, action, result);
    expect(chapter.paragraphs.join('').length).toBeGreaterThanOrEqual(900);
    expect(chapter.paragraphs.join('').length).toBeLessThanOrEqual(1400);
    expect(chapter).toEqual(decadeChapter(world, state, action, result));
    expect(chapter.paragraphs.join('')).toContain(result.story!.label);
    for (const event of result.events.filter((e) => e.to === 3).slice(0, 3))
      expect(chapter.paragraphs.join('')).toContain(world.names[event.sector]);
  });
  it('预先安排的卡牌在回复事件时保留，重复推进同一回合无效', () => {
    let game = gameReducer(emptyGame(true), {
      type: 'START',
      seed: 'narrative-flow',
      n: 30,
      mule: false,
    });
    const session = game.session!;
    const card = drawHand(session.world, 0, params).find(
      (id) => CARDS[id].cost <= 2 && id !== 'noop',
    )!;
    const action = { card, ...(CARDS[card].targeted ? { target: 3 } : {}) };
    game = gameReducer(game, { type: 'SELECT_ACTION', action });
    game = gameReducer(game, { type: 'SELECT_EVENT', choice: 'defer' });
    expect(game.action.card).toBe(card);
    const prediction = forecast(session.world, session.state, game.action, {
      M: 8,
      H: 1,
      params,
      seed: 'narrative-flow-preview',
    });
    const request = { type: 'ADVANCE' as const, turn: 0, forecast: prediction };
    game = gameReducer(game, request);
    expect(game.error).toBeNull();
    expect(game.session!.state.turn).toBe(1);
    expect(gameReducer(game, request).session!.state.turn).toBe(1);
    const restored = restoreGame(serializeGame(game)!);
    expect(restored.status).toBe('revealing');
    expect(restored.reveal?.turn).toBe(1);
    expect(restored.session!.chapters).toEqual(game.session!.chapters);
    for (const k of ARRAY_KEYS) expect(restored.session!.state[k]).toEqual(game.session!.state[k]);
    expect(restored.session!.state.strategic).toEqual(game.session!.state.strategic);
    expect(restored.session!.lastOutcome!.chapter).toEqual(game.session!.lastOutcome!.chapter);
    const read = gameReducer(gameReducer(game, { type: 'CLEAR_REVEAL' }), {
      type: 'FINISH_REVEAL',
    });
    const readRestored = restoreGame(serializeGame(read)!);
    expect(readRestored.status).toBe('playing');
    expect(readRestored.reveal).toBeNull();
    const frames = galaxyArchive(session.world, params, game.session!.actions);
    expect(frames.at(-1)!.state).toEqual(game.session!.state);
  });
  it('新版配对预测可以自比较为零，且不会改变当前状态', () => {
    const { world, state } = fresh();
    const snapshot = cloneState(state);
    const action: Action = { card: 'relief', target: 5, eventChoice: 'defer' };
    const result = compareActions(world, state, action, action, {
      M: 12,
      H: 2,
      params,
      seed: 'strategy-crn',
    });
    expect(result.meanDelta).toBe(0);
    expect(result.scoreDelta).toBe(0);
    expect(state).toEqual(snapshot);
  });
  it('最后一卷先阅读，刷新仍可继续，读完进入结局并能回看地图', () => {
    let game = gameReducer(emptyGame(true), {
      type: 'START',
      seed: 'final-chapter',
      n: 30,
      mule: false,
    });
    for (let turn = 0; turn < 30; turn++) {
      const session = game.session!;
      if (storyEvent(session.world, session.state, session.params))
        game = gameReducer(game, { type: 'SELECT_EVENT', choice: 'defer' });
      const prediction = forecast(session.world, session.state, game.action, {
        M: 4,
        H: 1,
        params: session.params,
        seed: 'final-chapter-preview',
      });
      game = gameReducer(game, { type: 'ADVANCE', turn, forecast: prediction });
      expect(game.error).toBeNull();
      expect(game.status).toBe('revealing');
      if (turn < 29)
        game = gameReducer(gameReducer(game, { type: 'CLEAR_REVEAL' }), {
          type: 'FINISH_REVEAL',
        });
    }
    const restored = restoreGame(serializeGame(game)!);
    expect(restored.status).toBe('revealing');
    expect(restored.session!.chapters).toHaveLength(30);
    expect(restored.reveal!.turn).toBe(30);
    const ended = gameReducer(gameReducer(restored, { type: 'CLEAR_REVEAL' }), {
      type: 'FINISH_REVEAL',
    });
    expect(restoreGame(serializeGame(ended)!).status).toBe('ended');
    const review = gameReducer(gameReducer(ended, { type: 'REVIEW' }), {
      type: 'VIEW',
      view: 'empire',
    });
    expect(review.status).toBe('reviewing');
    expect(review.view).toBe('empire');
    expect(review.session!.actions).toEqual(ended.session!.actions);
  });
  it('原有存档指纹不变，新模型指纹隔离，拒绝多余参数', () => {
    expect(modelFingerprint(DEFAULT_PARAMS)).toBe('ecd3b21d');
    expect(modelFingerprint({ ...DEFAULT_PARAMS, campaign: true })).toBe('01f5e147');
    expect(modelFingerprint(params)).not.toBe('01f5e147');
    const game = gameReducer(emptyGame(true), {
      type: 'START',
      seed: 'secure-save',
      n: 30,
      mule: false,
    });
    const saved = JSON.parse(serializeGame(game)!);
    saved.params.unknown = true;
    saved.fingerprint = modelFingerprint(saved.params);
    expect(() => restoreGame(JSON.stringify(saved))).toThrow('参数');
  });
  it('完整三十回合的所有新数组有界，叙事不更改模拟随机流', () => {
    const { world, state: initial } = fresh('full-strategy');
    let state = initial;
    const rng = stream(world.seed, 'reality');
    for (let turn = 0; turn < 30; turn++) {
      state.influence = 8;
      state.treasury = Math.max(state.treasury, 0.2);
      const event = storyEvent(world, state, params);
      const card =
        drawHand(world, turn, params).find(
          (id) => id !== 'noop' && id !== 'tax' && state.phase.some((p) => p !== 3),
        ) ?? 'noop';
      const action: Action = {
        card,
        ...(CARDS[card].targeted ? { target: state.phase.findIndex((p) => p !== 3) } : {}),
        ...(event ? { eventChoice: 'defer' } : {}),
      };
      const result = step(world, state, action, rng, params);
      const streamSnapshot = rng.clone();
      const chapter = decadeChapter(world, state, action, result);
      expect(chapter.paragraphs.join('').length).toBeGreaterThanOrEqual(900);
      expect(chapter.paragraphs.join('').length).toBeLessThanOrEqual(1400);
      expect(chapter.paragraphs.join('')).not.toMatch(/背景图|查看插画|影响力 [+-]/);
      if (turn === 29) expect(chapter.paragraphs.join('')).toContain('第三百年');
      expect(rng.clone().uniform()).toBe(streamSnapshot.uniform());
      state = result.state;
      for (const k of STRATEGIC_KEYS)
        for (const value of state.strategic![k])
          expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
    }
    expect(state.turn).toBe(30);
    expect(CARD_IDS).toHaveLength(12);
  });
});
