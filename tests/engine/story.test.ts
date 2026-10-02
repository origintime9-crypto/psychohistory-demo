import { describe, expect, it } from 'vitest';
import { step } from '../../src/engine/dynamics';
import { forecast, prepareBaseline, previewAction } from '../../src/engine/forecast';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../../src/engine/params';
import { stream } from '../../src/engine/rng';
import {
  applyStoryChoice,
  previewStoryChoice,
  storyEvent,
  storyUnavailable,
} from '../../src/engine/story';
import { initialState, generateWorld } from '../../src/engine/worldgen';
import { emptyGame, gameReducer } from '../../src/ui/gameReducer';
import { restoreGame, serializeGame } from '../../src/ui/saveGame';

describe('随机事件与可玩选择', () => {
  it('30 回合里的急电随种子和局势变化，第一回合有可理解的事件', () => {
    const kinds = new Set<string>(),
      calendars = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const world = generateWorld(`story-diversity:${i}`, { n: 30 }),
        state = initialState(world),
        turns: number[] = [];
      expect(storyEvent(world, state)?.id).toBe('food');
      for (let turn = 0; turn < TOTAL_TURNS; turn++) {
        state.turn = turn;
        const event = storyEvent(world, state);
        expect(storyEvent(world, state)).toEqual(event);
        if (event) {
          kinds.add(event.id);
          turns.push(turn);
          expect(state.phase[event.target]).not.toBe(3);
        }
      }
      calendars.add(turns.join(','));
    }
    expect(kinds.size).toBe(8);
    expect(calendars.size).toBeGreaterThan(15);
  });
  it('援助与等待改变真实状态，输入保持不变，费用与可负担判断一致', () => {
    const world = generateWorld('story-costs', { n: 30 }),
      s = initialState(world),
      original = initialState(world),
      event = storyEvent(world, s)!;
    const helped = applyStoryChoice(world, s, event, 'aid', 0).state,
      waited = applyStoryChoice(world, s, event, 'defer', 0).state;
    expect(s).toEqual(original);
    expect(helped.treasury).toBeCloseTo(s.treasury - 0.045);
    expect(helped.prosperity[event.target]).toBeGreaterThan(waited.prosperity[event.target]);
    expect(helped.pressure[event.target]).toBeLessThan(waited.pressure[event.target]);
    s.treasury = 0.01;
    expect(storyUnavailable(s, event.choices[0])).toBe('国库不足');
    expect(() => applyStoryChoice(world, s, event, 'aid', 0)).toThrow('国库');
  });
  it('有概率的谈判包含失败分支，预览用加权效果，失败仍付费用', () => {
    const world = generateWorld('story-branch', { n: 30 }),
      s = initialState(world);
    s.influence = 8;
    let event = null;
    for (let t = 2; t < 200; t++) {
      s.turn = t % TOTAL_TURNS;
      const e = storyEvent(world, s, { ...DEFAULT_PARAMS, storyChance: 1 }, `branch:${t}`);
      if (e?.id === 'governor') {
        event = e;
        break;
      }
    }
    expect(event).not.toBeNull();
    const win = applyStoryChoice(world, s, event!, 'aid', 0),
      loss = applyStoryChoice(world, s, event!, 'aid', 0.99),
      preview = previewStoryChoice(world, s, event!, 'aid');
    expect(win.story.success).toBe(true);
    expect(loss.story.success).toBe(false);
    expect(win.state.influence).toBe(6);
    expect(loss.state.influence).toBe(6);
    expect(preview.faction[event!.target]).toBeCloseTo(
      0.7 * win.state.faction[event!.target] + 0.3 * loss.state.faction[event!.target],
    );
  });
  it('事件选项共享卡牌资源，无效组合不会消耗现实随机流', () => {
    const world = generateWorld('story-combined', { n: 30 }),
      s = initialState(world),
      rng = stream(world.seed, 'reality'),
      original = rng.clone();
    s.influence = 2;
    expect(() =>
      step(world, s, { card: 'academy', target: 0, eventChoice: 'bargain' }, rng),
    ).toThrow('影响力');
    expect(rng.uniform()).toBe(original.uniform());
  });
  it('事件回应进入配对基线，当前急电一致、后续事件通过独立流采样', () => {
    const world = generateWorld('story-preview', { n: 30 }),
      s = initialState(world),
      options = { M: 32, H: 5, seed: 'story-paired', terminal: true, eventChoice: 'aid' as const };
    const baseline = prepareBaseline(world, s, options),
      same = previewAction(world, s, { card: 'noop', eventChoice: 'aid' }, options, baseline);
    expect(same.comparison.scoreDelta).toBe(0);
    expect(same.forecast).toEqual(baseline.result);
    expect(forecast(world, s, { card: 'noop', eventChoice: 'aid' }, options)).toEqual(
      same.forecast,
    );
  });
  it('引导与事件都能续玩，不能绕过事件，重复推进不会重付费用', () => {
    const world = generateWorld('story-save', { n: 30 });
    let game = gameReducer(emptyGame(), { type: 'START', seed: world.seed, n: 30, mule: false });
    expect(restoreGame(serializeGame(game)!).view).toBe('briefing');
    game = gameReducer(game, { type: 'TUTORIAL_DISMISS' });
    const f = forecast(
      world,
      game.session!.state,
      { card: 'noop' },
      { M: 8, H: 1, seed: 'story-save:predict' },
    );
    expect(gameReducer(game, { type: 'ADVANCE', turn: 0, forecast: f }).session!.state.turn).toBe(
      0,
    );
    game = gameReducer(game, { type: 'SELECT_EVENT', choice: 'aid' });
    expect(restoreGame(serializeGame(game)!).action.eventChoice).toBe('aid');
    const event = { type: 'ADVANCE' as const, turn: 0, forecast: f },
      next = gameReducer(game, event);
    expect(next.session!.state.turn).toBe(1);
    expect(gameReducer(next, event)).toBe(next);
    expect(restoreGame(serializeGame(next)!).session!.lastOutcome).toEqual(
      next.session!.lastOutcome,
    );
  });
});
