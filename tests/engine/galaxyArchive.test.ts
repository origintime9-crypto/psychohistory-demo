import { describe, expect, it } from 'vitest';
import { step } from '../../src/engine/dynamics';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../../src/engine/params';
import { stream } from '../../src/engine/rng';
import { storyEvent } from '../../src/engine/story';
import { cloneState, type Action } from '../../src/engine/types';
import { generateWorld, initialState } from '../../src/engine/worldgen';
import { galaxyArchive, sectorRecords } from '../../src/ui/galaxyArchive';

describe('银河档案只读重放', () => {
  it.each([30, 50, 80])('%i 星区的全部回合与独立现实路径一致，包括事件与骡', (n) => {
    const world = generateWorld(`archive:${n}`, { n });
    const params = { ...DEFAULT_PARAMS, mule: true };
    const reality = stream(world.seed, 'reality');
    let state = initialState(world);
    const actions: Action[] = [];
    const actual = [cloneState(state)];
    for (let t = 0; t < TOTAL_TURNS; t++) {
      const event = storyEvent(world, state, params);
      const action: Action = { card: 'noop', ...(event ? { eventChoice: 'defer' } : {}) };
      actions.push(action);
      state = step(world, state, action, reality, params).state;
      actual.push(cloneState(state));
    }
    const liveRngBefore = reality.clone();
    const archive = galaxyArchive(world, params, actions);
    expect(archive.map((f) => f.state)).toEqual(actual);
    expect(archive).toHaveLength(TOTAL_TURNS + 1);
    expect(reality.uniform()).toBe(liveRngBefore.uniform());
    expect(archive.at(-1)!.state.muleOccurred).toBe(true);
    expect(archive[0].state).toEqual(initialState(world));
  });

  it('急电档案对应实际回应，回看不泄露之后的事件', () => {
    const world = generateWorld('archive-records', { n: 30 });
    const event = storyEvent(world, initialState(world))!;
    const archive = galaxyArchive(world, DEFAULT_PARAMS, [{ card: 'noop', eventChoice: 'aid' }]);
    const initial = sectorRecords(world, archive, event.target, 0);
    const after = sectorRecords(world, archive, event.target, 1);
    expect(initial.every((record) => record.turn === 0)).toBe(true);
    expect(initial.some((record) => record.title === event.title)).toBe(false);
    expect(
      after.some(
        (record) => record.title === event.title && record.text.includes(event.choices[0].label),
      ),
    ).toBe(true);
    expect(archive[1].story?.target).toBe(event.target);
  });
});
