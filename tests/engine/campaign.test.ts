import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  REACTIVE_CHAPTERS,
  campaignEnding,
  campaignEvent,
  initialChronicle,
} from '../../src/engine/campaign';
import { step } from '../../src/engine/dynamics';
import { forecast } from '../../src/engine/forecast';
import { muleTurn } from '../../src/engine/mule';
import { DEFAULT_PARAMS } from '../../src/engine/params';
import { stream } from '../../src/engine/rng';
import { applyStoryChoice, previewStoryChoice, storyEvent } from '../../src/engine/story';
import { cloneState, type StoryChoiceId } from '../../src/engine/types';
import { generateWorld, initialState } from '../../src/engine/worldgen';
import { advanceSession, createSession, emptyGame, type Game } from '../../src/ui/gameReducer';
import { galaxyArchive, sectorRecords } from '../../src/ui/galaxyArchive';
import { modelFingerprint, restoreGame, serializeGame } from '../../src/ui/saveGame';

const params = { ...DEFAULT_PARAMS, campaign: true, mule: true };
const fixture = (seed = 'canon', n = 30) => {
  const world = generateWorld(seed, { n });
  return { world, state: { ...initialState(world), chronicle: initialChronicle() } };
};
function atChapter(id: string) {
  const f = fixture();
  const chapter = CHAPTERS.find((c) => c.id === id)!;
  f.state.turn = chapter.due;
  for (const previous of CHAPTERS.filter((c) => c.due < chapter.due))
    f.state.chronicle.resolved[previous.id] = {
      choice: 'defer',
      label: '等待',
      success: true,
      turn: previous.due + 1,
    };
  return f;
}
describe('原著剧情传承', () => {
  it('12 个主线与骡后 3 个章节均只出现一次；延迟仍会补发', () => {
    for (const delay of [0, 1, 2]) {
      const { world } = fixture(`canon-calendar:${delay}`);
      let state = { ...initialState(world), chronicle: initialChronicle() };
      const seen: string[] = [];
      for (let turn = 0; turn < 30; turn++) {
        state.turn = turn;
        state.muleOccurred = turn >= 20 + delay;
        const event = campaignEvent(world, state);
        if (!event) continue;
        seen.push(event.id);
        expect(event.source).toBeDefined();
        expect(event.choices).toHaveLength(3);
        expect(event.choices.find((c) => c.id === 'defer')!.cost).toEqual({});
        state = applyStoryChoice(world, state, event, 'defer', 0).state as typeof state;
      }
      expect(seen).toHaveLength(15);
      expect(new Set(seen).size).toBe(15);
      expect(seen).toContain('palver');
    }
    const { world, state } = fixture();
    state.turn = 8;
    expect(campaignEvent(world, state)?.id).toBe('seldon-trial');
  });
  it('马洛听证的公开与秘密选择改变禁运成功率和保密度', () => {
    const { world, state } = atChapter('mallow-trial');
    const trial = campaignEvent(world, state)!;
    const publicRoute = applyStoryChoice(world, state, trial, 'aid', 0).state;
    const secretRoute = applyStoryChoice(world, state, trial, 'bargain', 0).state;
    publicRoute.turn = secretRoute.turn = 12;
    const publicWar = campaignEvent(world, publicRoute)!;
    const secretWar = campaignEvent(world, secretRoute)!;
    expect(publicWar.id).toBe('trade-war');
    expect(publicWar.choices[0].chance).toBeGreaterThan(secretWar.choices[0].chance!);
    expect(publicRoute.chronicle!.secrecy).toBeLessThan(secretRoute.chronicle!.secrecy);
    expect(publicWar.body).toContain('公开听证');
  });
  it('保存产业会提高里奥斯撤军后的恢复；成功不被写成决定皇帝召回', () => {
    const { world, state } = atChapter('riose-front');
    const front = campaignEvent(world, state)!;
    const industrial = applyStoryChoice(world, state, front, 'aid', 0).state;
    const court = applyStoryChoice(world, state, front, 'bargain', 0).state;
    industrial.turn = court.turn = 18;
    const a = campaignEvent(world, industrial)!,
      b = campaignEvent(world, court)!;
    expect(a.choices[0].effect.local!.prosperity).toBeGreaterThan(
      b.choices[0].effect.local!.prosperity!,
    );
    expect(b.body).toContain('没有证据');
  });
  it('失败仍付费并记录失败；概率预览加权传承积累，不修改输入', () => {
    const { world, state } = atChapter('four-kingdoms');
    const before = cloneState(state),
      event = campaignEvent(world, state)!;
    const win = applyStoryChoice(world, state, event, 'aid', 0).state;
    const loss = applyStoryChoice(world, state, event, 'aid', 0.999).state;
    const preview = previewStoryChoice(world, state, event, 'aid');
    expect(state).toEqual(before);
    expect(loss.influence).toBe(state.influence - 2);
    expect(loss.chronicle!.resolved[event.id].success).toBe(false);
    expect(preview.chronicle!.diplomacy).toBeCloseTo(
      win.chronicle!.diplomacy * event.choices[0].chance! +
        loss.chronicle!.diplomacy * (1 - event.choices[0].chance!),
    );
    expect(cloneState(state).chronicle!.resolved).not.toBe(state.chronicle.resolved);
  });
  it('不会提前透露骡；叙事冲击在帝国反攻后，预测仍排除未观察冲击', () => {
    const { world, state } = atChapter('star-end');
    expect(campaignEvent(world, state)?.id).toBe('star-end');
    state.muleOccurred = true;
    expect(campaignEvent(world, state)?.id).toBe('vault-mismatch');
    expect(muleTurn(world.seed, true)).toBeGreaterThanOrEqual(20);
    expect(muleTurn(world.seed, true)).toBeLessThanOrEqual(22);
    state.muleOccurred = false;
    state.turn = muleTurn(world.seed, true) - 1;
    const current = storyEvent(world, state, params);
    const action = { card: 'noop' as const, ...(current ? { eventChoice: 'defer' as const } : {}) };
    const options = { M: 8, H: 2, seed: 'canon-mule-forecast', params };
    expect(forecast(world, state, action, options)).toEqual(
      forecast(world, state, action, { ...options, params: { ...params, mule: false } }),
    );
  });
  it('独立星区不会被剧情复活；原地点失守时转由活跃星区接报', () => {
    const { world, state } = fixture();
    state.phase[world.terminus] = 3;
    const event = campaignEvent(world, state)!;
    expect(state.phase[event.target]).not.toBe(3);
    expect(applyStoryChoice(world, state, event, 'aid', 0).state.phase[world.terminus]).toBe(3);
    state.phase.fill(3);
    expect(campaignEvent(world, state)).toBeNull();
  });
  it('30/50/80 星区完整剧情可续玩、重放星图、预测不消耗现实流', () => {
    for (const n of [30, 50, 80]) {
      let session = createSession(`canon-replay:${n}`, n, params);
      for (let turn = 0; turn < 30; turn++) {
        const event = storyEvent(session.world, session.state, params);
        const choice =
          event?.choices.find(
            (c) =>
              c.id === 'bargain' &&
              (c.cost.influence ?? 0) <= session.state.influence &&
              (c.cost.treasury ?? 0) <= session.state.treasury,
          )?.id ?? 'defer';
        const action = {
          card: 'noop' as const,
          ...(event ? { eventChoice: choice as StoryChoiceId } : {}),
        };
        const f = forecast(session.world, session.state, action, {
          M: 2,
          H: 1,
          seed: `canon-predict:${turn}`,
          params,
        });
        session = advanceSession(session, action, f).session;
      }
      const game: Game = { ...emptyGame(true), session, status: 'ended' };
      const restored = restoreGame(serializeGame(game)!);
      expect(restored.session!.state).toEqual(session.state);
      const archive = galaxyArchive(session.world, params, session.actions);
      expect(archive.at(-1)!.state).toEqual(session.state);
      const target = archive[1].story!.target;
      expect(sectorRecords(session.world, archive, target, 0).some((r) => r.source)).toBe(false);
      expect(
        sectorRecords(session.world, archive, target, 1).some(
          (r) => r.source?.includes('盖尔·多尼克') && r.tone === 'science',
        ),
      ).toBe(true);
      expect(session.state.turn).toBe(30);
      expect(session.state.chronicle!.resolved.palver).toBeDefined();
      expect(Object.keys(session.state.chronicle!.resolved)).toHaveLength(
        CHAPTERS.length + REACTIVE_CHAPTERS.length,
      );
      expect(campaignEnding(session.state)).not.toBeNull();
    }
  });
  it('经典存档仍按旧指纹恢复，剧情分支保持固定现实抽样预算', () => {
    const classic = createSession('legacy-save', 30, { ...DEFAULT_PARAMS });
    const game = { ...emptyGame(true), session: classic, status: 'playing' as const };
    expect(restoreGame(serializeGame(game)!).session!.state.chronicle).toBeUndefined();
    expect(modelFingerprint(params)).not.toBe(modelFingerprint({ ...DEFAULT_PARAMS }));
    const { world, state } = fixture();
    const a = stream(world.seed, 'reality'),
      b = a.clone();
    step(world, state, { card: 'noop', eventChoice: 'aid' }, a, params);
    step(world, state, { card: 'noop', eventChoice: 'defer' }, b, params);
    expect(a.uniform()).toBe(b.uniform());
  });
});
