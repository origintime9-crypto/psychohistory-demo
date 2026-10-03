import { step } from '../engine/dynamics';
import { initialChronicle } from '../engine/campaign';
import { describeEvent, PHASE_NAMES } from '../engine/flavor';
import type { Params } from '../engine/params';
import { stream } from '../engine/rng';
import { storyEvent } from '../engine/story';
import type { StoryEvent } from '../engine/story';
import { BOOKS } from '../engine/books';
import type { Action, Event, State, StepResult, World } from '../engine/types';
import { initialState } from '../engine/worldgen';
import { initialStrategy } from '../engine/strategy';

export interface ArchiveFrame {
  state: State;
  events: Event[];
  story?: StepResult['story'];
  dispatch?: ReturnType<typeof storyEvent>;
}
export interface SectorRecord {
  turn: number;
  title: string;
  text: string;
  context: string;
  tone: 'crisis' | 'science' | 'politics';
  source?: string;
}
export function storyTone(event: StoryEvent | null | undefined): 'science' | 'politics' {
  return event?.source?.book === 'second' ||
    ['archives', 'second-foundation', 'seldon-trial', 'trantor-library', 'bayta-secret'].includes(
      event?.id ?? '',
    )
    ? 'science'
    : 'politics';
}
export function storyReference(event: StoryEvent | null | undefined) {
  return event?.source
    ? `《${BOOKS[event.source.book].title}》 · ${event.source.characters.join(' / ')}`
    : undefined;
}

/** Read-only replay uses its own reality stream; it never advances the live session. */
export function galaxyArchive(world: World, params: Params, actions: Action[]): ArchiveFrame[] {
  const reality = stream(world.seed, 'reality');
  let state = initialState(world);
  if (params.strategic) state.strategic = initialStrategy(world);
  if (params.campaign) state.chronicle = initialChronicle();
  const frames: ArchiveFrame[] = [{ state, events: [] }];
  for (const action of actions) {
    const dispatch = storyEvent(world, state, params);
    const result = step(world, state, action, reality, params);
    state = result.state;
    frames.push({ state, events: result.events, story: result.story, dispatch });
  }
  return frames;
}

export function sectorRecords(world: World, frames: ArchiveFrame[], sector: number, turn: number) {
  const records: SectorRecord[] = [
    {
      turn: 0,
      title: sector === world.terminus ? '端点星 · 知识的种子' : '银河档案开始记录',
      text:
        sector === world.terminus
          ? '远离川陀的边疆世界被选为基地。知识保存与当地稳定，将共同决定文明能否走出黑暗。'
          : `${world.names[sector]}被纳入谢顿计划。初始状态：${PHASE_NAMES[frames[0].state.phase[sector]]}。`,
      context: `与 ${world.neighbors[sector].length} 个邻区相连；本档案记录这局合成银河的实际经历。`,
      tone: 'science',
    },
  ];
  for (const frame of frames) {
    if (frame.state.turn > turn) break;
    if (frame.story?.target === sector)
      records.push({
        turn: frame.state.turn,
        title: frame.story.title,
        text: `${frame.story.label}。${frame.story.text}`,
        context: `${frame.dispatch?.body ?? ''} ${frame.dispatch?.why ?? ''}`,
        tone: storyTone(frame.dispatch),
        source: storyReference(frame.dispatch),
      });
    for (const event of frame.events) {
      if (event.sector !== sector) continue;
      records.push({
        turn: frame.state.turn,
        title: `${PHASE_NAMES[event.from]} → ${PHASE_NAMES[event.to]}`,
        text: describeEvent(world, event),
        context: `邻接星域：${world.neighbors[sector].map((i) => world.names[i]).join('、')}。联系线显示模型的邻区作用通道；一次同步变动并不证明因果。`,
        tone: event.to === 0 ? 'science' : 'crisis',
      });
    }
  }
  return records.reverse();
}
