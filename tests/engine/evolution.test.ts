import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARDS, drawHand, validateAction } from '../../src/engine/cards';
import { CHAPTERS, REACTIVE_CHAPTERS } from '../../src/engine/campaign';
import { decadeChapter } from '../../src/engine/decade';
import { step } from '../../src/engine/dynamics';
import { compareActions, forecast } from '../../src/engine/forecast';
import { DEFAULT_PARAMS } from '../../src/engine/params';
import { hashSeed, stream } from '../../src/engine/rng';
import {
  applyStoryChoice,
  previewStoryChoice,
  storyBudget,
  storyEvent,
  storyUnavailable,
} from '../../src/engine/story';
import {
  ARRAY_KEYS,
  STRATEGIC_KEYS,
  cloneState,
  type Action,
  type State,
} from '../../src/engine/types';
import { createSession, emptyGame, gameReducer } from '../../src/ui/gameReducer';
import { galaxyArchive } from '../../src/ui/galaxyArchive';
import { modelFingerprint, restoreGame, serializeGame } from '../../src/ui/saveGame';
import { atlasPosition } from '../../src/engine/atlas';
import { ATLAS_DISTRICTS, ATLAS_INK, atlasLabels } from '../../src/ui/atlasDrawing';
import AdministrativeMap from '../../src/ui/AdministrativeMap';

const params = { ...DEFAULT_PARAMS, strategic: true, atlas: true, campaign: true, evolving: true };
const fresh = (seed = 'branching-letters', n = 30) => createSession(seed, n, params);

describe('选择记忆与随机的后续来信', () => {
  it('上一版战略存档的完整现实路径与指纹保持不变', () => {
    const oldParams = { ...DEFAULT_PARAMS, campaign: true, strategic: true, atlas: true };
    const {
      world,
      state: initial,
      reality,
    } = createSession('previous-strategic-release', 50, oldParams);
    let state = initial;
    for (let turn = 0; turn < 30; turn++) {
      const event = storyEvent(world, state, oldParams);
      if (event) expect(event.choices).toHaveLength(3);
      state = step(
        world,
        state,
        { card: 'noop', ...(event ? { eventChoice: 'defer' as const } : {}) },
        reality,
        oldParams,
      ).state;
    }
    const plain: Record<string, unknown> = { ...state };
    for (const key of ARRAY_KEYS) plain[key] = Array.from(state[key]);
    plain.strategic = Object.fromEntries(
      STRATEGIC_KEYS.map((key) => [key, Array.from(state.strategic![key])]),
    );
    expect(modelFingerprint(oldParams)).toBe('de5470d3');
    expect(hashSeed(JSON.stringify(plain)).toString(16)).toBe('672c4586');
    expect(reality.uniform()).toBe(0.41703663603402674);
    expect(state.decisions).toBeUndefined();
  });

  it('每个主线和响应章节均有四个不同的回应，回合一不再是空白', () => {
    const { world, state } = fresh();
    for (const chapter of CHAPTERS) {
      const s = cloneState(state);
      s.turn = chapter.due;
      for (const done of CHAPTERS.filter((c) => c.due < s.turn))
        s.chronicle!.resolved[done.id] = {
          choice: 'defer',
          label: '旧回应',
          success: true,
          turn: done.due + 1,
        };
      const event = storyEvent(world, s, params)!;
      expect(event.id).toBe(chapter.id);
      expect(event.choices).toHaveLength(4);
      expect(new Set(event.choices.map((c) => c.id)).size).toBe(4);
      expect(new Set(event.choices.map((c) => c.label)).size).toBe(4);
      expect(event.choices.every((c) => c.voice && c.approach)).toBe(true);
      expect(event.choices.find((c) => c.id === 'improvise')!.chance).toBeGreaterThan(0);
    }
    const s = cloneState(state);
    s.muleOccurred = true;
    s.turn = 20;
    for (const chapter of REACTIVE_CHAPTERS) {
      const event = storyEvent(world, s, params)!;
      expect(event.id).toBe(chapter.id);
      expect(event.choices.length).toBeGreaterThanOrEqual(4);
      s.chronicle!.resolved[event.id] = {
        choice: 'defer',
        label: '旧回应',
        success: true,
        turn: s.turn + 1,
      };
      s.turn += 2;
    }
    state.turn = 1;
    expect(storyEvent(world, state, params)!.choices.length).toBeGreaterThanOrEqual(4);
  });

  it('不同的过去选择解锁不同回应，来信引用真实的旧选择', () => {
    const { world, state } = fresh();
    const event = storyEvent(world, state, params)!;
    const learned = applyStoryChoice(world, state, event, 'aid', 0).state;
    const agreed = applyStoryChoice(world, state, event, 'bargain', 0).state;
    learned.turn = agreed.turn = 1;
    const a = storyEvent(world, learned, params)!;
    const b = storyEvent(world, agreed, params)!;
    expect(a.choices.length).toBeGreaterThanOrEqual(5);
    expect(b.choices.length).toBeGreaterThanOrEqual(5);
    expect(a.choices.find((c) => c.id === 'recall')!.approach).toBe('knowledge');
    expect(b.choices.find((c) => c.id === 'recall')!.approach).toBe('accord');
    expect(a.choices.find((c) => c.id === 'recall')!.label).not.toBe(
      b.choices.find((c) => c.id === 'recall')!.label,
    );
    expect(a.body).toContain(event.choices[0].label);
    expect(b.body).toContain(event.choices[1].label);
    expect(a.body).toContain('12067');
    expect(state.decisions!.history).toEqual([]);
  });

  it('成功与失败产生不同的旧事和回应，解决后记录交接而不修改输入', () => {
    let sawBoth = false;
    for (let seed = 0; seed < 40 && !sawBoth; seed++) {
      const { world, state } = fresh(`echo-branches-${seed}`);
      const first = storyEvent(world, state, params)!;
      const win = applyStoryChoice(world, state, first, 'improvise', 0).state;
      const loss = applyStoryChoice(world, state, first, 'improvise', 1).state;
      win.turn = win.decisions!.history[0].due;
      loss.turn = loss.decisions!.history[0].due;
      const p = { ...params, campaign: false };
      const a = storyEvent(world, win, p)!;
      const b = storyEvent(world, loss, p)!;
      if (a.revisits === undefined || b.revisits === undefined) continue;
      sawBoth = true;
      expect(a.echo!.success).toBe(true);
      expect(b.echo!.success).toBe(false);
      expect(a.title).not.toBe(b.title);
      expect(a.body).not.toBe(b.body);
      expect(a.choices.find((c) => c.id === 'improvise')!.label).not.toBe(
        b.choices.find((c) => c.id === 'improvise')!.label,
      );
      const snapshot = cloneState(win);
      const next = applyStoryChoice(world, win, a, 'defer', 0).state;
      expect(next.decisions!.history[0].revisited).toBe(win.turn + 1);
      expect(win).toEqual(snapshot);
      expect(win.decisions!.history[0].revisited).toBeUndefined();
      const nextLoss = applyStoryChoice(world, loss, b, 'recall', 1).state;
      expect(nextLoss.decisions!.history.at(-1)!.success).toBe(false);
    }
    expect(sawBoth).toBe(true);
  });

  it('同类协作的过往成败影响交涉，但不保证成功，也不读取未发生的骡', () => {
    const { world, state } = fresh();
    const first = storyEvent(world, state, params)!;
    const remembered = applyStoryChoice(world, state, first, 'improvise', 0).state;
    remembered.turn = 1;
    const failed = cloneState(remembered);
    failed.decisions!.history[0].success = false;
    const success = storyEvent(world, remembered, params)!;
    const failure = storyEvent(world, failed, params)!;
    const a = success.choices.find((c) => c.id === 'recall')!;
    const b = failure.choices.find((c) => c.id === 'recall')!;
    expect(a.chance).toBeGreaterThan(b.chance!);
    expect(a.chance).toBeLessThan(1);
    expect(b.chance).toBeGreaterThan(0);
    expect(a.chanceFactors!.some((f) => f.label.includes('此前'))).toBe(true);
    expect(storyEvent(world, remembered, { ...params, mule: true })).toEqual(
      storyEvent(world, remembered, { ...params, mule: false }),
    );
  });

  it('全部失守或资源耗尽时仍有至少四个回应，不会复活独立星区', () => {
    const { world, state, reality } = fresh();
    state.phase.fill(3);
    state.influence = state.treasury = 0;
    const event = storyEvent(world, state, params)!;
    expect(event.id).toBe('exile-ledger');
    expect(event.choices).toHaveLength(4);
    expect(event.choices.every((c) => storyUnavailable(state, c) === null)).toBe(true);
    for (const choice of event.choices) {
      const result = step(
        world,
        state,
        { card: 'noop', eventChoice: choice.id },
        reality.clone(),
        params,
      );
      expect(result.state.phase.every((p) => p === 3)).toBe(true);
      expect(result.state.treasury).toBeGreaterThanOrEqual(0);
      expect(result.state.influence).toBeGreaterThanOrEqual(0);
    }
    expect(storyEvent(world, state, { ...params, storyEvents: false })).toBeNull();
    state.turn = 30;
    expect(storyEvent(world, state, params)).toBeNull();
  });

  it('不同随机世界实际出现成功和失败，所有选择仍使用固定随机预算', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 24; seed++) {
      const { world, state, reality } = fresh(`random-intervention-${seed}`);
      const control = reality.clone();
      const result = step(
        world,
        state,
        { card: 'noop', eventChoice: 'improvise' },
        reality,
        params,
      );
      outcomes.add(result.story!.success);
      expect(result.state.decisions!.history.at(-1)!.success).toBe(result.story!.success);
      for (let draw = 0; draw < 5 + 9 * world.n; draw++) control.uniform();
      expect(reality.uniform()).toBe(control.uniform());
    }
    expect(outcomes.size).toBe(2);
    const { world, state, reality } = fresh('recall-budget');
    const result = step(world, state, { card: 'noop', eventChoice: 'bargain' }, reality, params);
    const snapshot = reality.clone();
    step(world, result.state, { card: 'noop', eventChoice: 'recall' }, reality, params);
    for (let draw = 0; draw < 5 + 9 * world.n; draw++) snapshot.uniform();
    expect(reality.uniform()).toBe(snapshot.uniform());
    const poor = cloneState(result.state);
    poor.influence = poor.treasury = 0;
    const check = reality.clone();
    expect(() =>
      step(world, poor, { card: 'relief', target: 3, eventChoice: 'recall' }, reality, params),
    ).toThrow();
    expect(reality.uniform()).toBe(check.uniform());
  });

  it('预测与阅读不改记忆或现实随机流，配对预测可自比较为零', () => {
    const { world, state, reality } = fresh();
    const snapshot = cloneState(state);
    const nextRandom = reality.clone().uniform();
    const event = storyEvent(world, state, params)!;
    previewStoryChoice(world, state, event, 'improvise');
    const action: Action = { card: 'noop', eventChoice: 'improvise' };
    const comparison = compareActions(world, state, action, action, {
      M: 8,
      H: 4,
      params,
      seed: 'memory-crn',
    });
    expect(comparison.meanDelta).toBe(0);
    expect(comparison.scoreDelta).toBe(0);
    expect(state).toEqual(snapshot);
    expect(reality.clone().uniform()).toBe(nextRandom);
  });

  it('新版存档与星图重放完整恢复选择记忆、来信、手记及最终结局', () => {
    let game = gameReducer(emptyGame(true), {
      type: 'START',
      seed: 'save-branching',
      n: 30,
      mule: true,
    });
    for (let turn = 0; turn < 30; turn++) {
      const session = game.session!;
      const event = storyEvent(session.world, session.state, session.params)!;
      const option = event.choices.filter((c) => !storyUnavailable(session.state, c)).at(turn % 3)!;
      game = gameReducer(game, { type: 'SELECT_EVENT', choice: option?.id ?? 'defer' });
      const prediction = forecast(session.world, session.state, game.action, {
        M: 4,
        H: 1,
        params: session.params,
        seed: 'save-preview',
      });
      game = gameReducer(game, { type: 'ADVANCE', turn, forecast: prediction });
      expect(game.error).toBeNull();
      if (turn % 5 === 0 || turn === 29) {
        const restored = restoreGame(serializeGame(game)!);
        expect(restored.status).toBe('revealing');
        expect(restored.session!.state).toEqual(game.session!.state);
        expect(restored.session!.chapters).toEqual(game.session!.chapters);
        const frames = galaxyArchive(session.world, session.params, game.session!.actions);
        expect(frames.at(-1)!.state).toEqual(game.session!.state);
        expect(frames.at(-1)!.story).toEqual(game.session!.lastOutcome!.story);
        game = restored;
      }
      if (turn < 29)
        game = gameReducer(gameReducer(game, { type: 'CLEAR_REVEAL' }), { type: 'FINISH_REVEAL' });
    }
    expect(game.session!.state.decisions!.history).toHaveLength(30);
    const ended = gameReducer(game, { type: 'FINISH_REVEAL' });
    expect(restoreGame(serializeGame(ended)!).status).toBe('ended');
    expect(modelFingerprint(params)).not.toBe(modelFingerprint({ ...params, evolving: undefined }));
  });

  it('多个种子与选择的完整三百年：每回合四选以上、手记不足两千字、状态有界', () => {
    const seen = new Set<string>();
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 18; seed++) {
      const game = createSession(`literary-branches-${seed}`, [30, 50, 80][seed % 3], {
        ...params,
        mule: seed % 2 === 0,
      });
      const { world, reality } = game;
      let state = game.state;
      const picker = stream(world.seed, 'test-decisions');
      for (let turn = 0; turn < 30; turn++) {
        const event = storyEvent(world, state, game.params)!;
        seen.add(event.id);
        expect(event.choices.length).toBeGreaterThanOrEqual(4);
        const options = event.choices.filter((c) => !storyUnavailable(state, c));
        expect(options.length).toBeGreaterThan(0);
        const choice = options[picker.int(options.length)];
        const budget = storyBudget(state, choice);
        const possible: Action[] = drawHand(world, turn, game.params)
          .map((card) => ({
            card,
            eventChoice: choice.id,
            ...(CARDS[card].targeted ? { target: state.phase.findIndex((p) => p !== 3) } : {}),
          }))
          .filter((action) => {
            try {
              validateAction(world, budget, action);
              return true;
            } catch {
              return false;
            }
          });
        const action = possible[picker.int(possible.length)];
        const original = cloneState(state);
        const result = step(world, state, action, reality, game.params);
        const rngSnapshot = reality.clone();
        const chapter = decadeChapter(world, state, action, result);
        const text = chapter.paragraphs.join('');
        expect(text.length, `${world.seed}/${turn}/${choice.id}`).toBeGreaterThanOrEqual(1500);
        expect(text.length, `${world.seed}/${turn}/${choice.id}`).toBeLessThan(2000);
        expect(text).toContain(result.story!.label);
        expect(text).toContain(result.story!.text);
        if (result.story?.echo) expect(text).toContain(result.story.echo.label);
        if (turn === 29) expect(text).toContain('第三百年');
        expect(reality.clone().uniform()).toBe(rngSnapshot.uniform());
        expect(state).toEqual(original);
        expect(result.state.decisions!.history).toHaveLength(turn + 1);
        outcomes.add(result.story!.success);
        state = result.state;
        for (const key of [
          ...ARRAY_KEYS.filter((k) => k !== 'phase' && k !== 'sermons'),
          ...STRATEGIC_KEYS,
        ]) {
          const values =
            key in state
              ? (state[key as keyof State] as Float64Array)
              : state.strategic![key as (typeof STRATEGIC_KEYS)[number]];
          expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
            true,
          );
        }
      }
    }
    expect(seen.size).toBeGreaterThan(30);
    expect(seen.has('vault-mismatch')).toBe(true);
    expect(outcomes.size).toBe(2);
  });
});

describe('独立重绘的行政星图', () => {
  it('地图实际渲染为独立的可交互矢量节点，不包含照片或图片标签', () => {
    const { world, state } = fresh('vector-map', 50);
    const sectors = world.names.map((label) => ({
      label,
      phase: 0 as const,
      status: '稳定',
      color: '#92cfb6',
    }));
    const markup = renderToStaticMarkup(
      createElement(AdministrativeMap, {
        world,
        state,
        sectors,
        layer: 'risk',
        network: true,
        onSelect: () => {},
      }),
    );
    expect(markup).toContain('川陀');
    expect(markup).toContain('端点星');
    expect(markup).toContain('蓝移星区');
    expect(markup.match(/data-atlas-node=/g)).toHaveLength(world.n);
    expect(markup).not.toMatch(/<image|<img|galactic-administration-reference|\.jpg/);
  });

  it('有八个参考星区与完整旋臂，所有星名来自游戏节点而非照片', () => {
    expect(ATLAS_DISTRICTS).toHaveLength(8);
    expect(ATLAS_INK.arms).toHaveLength(4);
    expect(ATLAS_INK.dust.length).toBeGreaterThan(1000);
    for (const district of ATLAS_DISTRICTS) {
      expect(district.outline.startsWith('M')).toBe(true);
      expect(district.outline.endsWith('Z')).toBe(true);
    }
  });

  it('桌面和手机的文字稳定、有界、互不重叠，缩放重新排布', () => {
    const { world } = fresh('chart-labels', 80);
    const positions = Array.from({ length: world.n }, (_, i) => atlasPosition(world, i));
    for (const viewport of [
      { width: 1100, height: 680 },
      { width: 358, height: 300 },
    ]) {
      for (const camera of [
        { x: 0, y: 0, k: 1 },
        { x: -680, y: -300, k: 2.5 },
      ]) {
        const labels = atlasLabels(world, positions, camera, viewport, world.capital);
        expect(labels.length).toBeGreaterThan(5);
        expect(labels).toEqual(atlasLabels(world, positions, camera, viewport, world.capital));
        const scale = Math.min(viewport.width / 1344, viewport.height / 910);
        const offsetX = (viewport.width - 1344 * scale) / 2;
        const offsetY = (viewport.height - 910 * scale) / 2;
        const boxes = labels.map((label) => {
          const width = world.names[label.i].length * label.font * scale * camera.k;
          const x = ((positions[label.i][0] + label.dx) * camera.k + camera.x) * scale + offsetX;
          const y = ((positions[label.i][1] + label.dy) * camera.k + camera.y) * scale + offsetY;
          return {
            x: x - (label.anchor === 'end' ? width : 0),
            y: y - label.font * scale * camera.k,
            w: width,
            h: label.font * scale * camera.k,
          };
        });
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(viewport.width);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.y + a.h).toBeLessThanOrEqual(viewport.height);
          for (const b of boxes.slice(i + 1))
            expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(
              false,
            );
        }
      }
    }
  });
});
