import { DEFAULT_PARAMS, TOTAL_TURNS, type Params } from './params';
import { stream } from './rng';
import { campaignEvent, initialChronicle } from './campaign';
import type { LegacyField } from './types';
import type { BookId } from './books';
import { clamp, cloneState, counts, type State, type StoryChoiceId, type World } from './types';

type LocalField =
  | 'prosperity'
  | 'pressure'
  | 'elites'
  | 'faction'
  | 'legitimacy'
  | 'religion'
  | 'education'
  | 'garrison'
  | 'openness';
interface Effect {
  legacy?: Partial<Record<LegacyField, number>>;
  local?: Partial<Record<LocalField, number>>;
  foundation?: number;
  governance?: number;
  treasury?: number;
  influence?: number;
}
export interface StoryChoice {
  id: StoryChoiceId;
  label: string;
  description: string;
  cost: { influence?: number; treasury?: number };
  effect: Effect;
  chance?: number;
  failure?: Effect;
  result: string;
  failureResult?: string;
  future?: string;
}
export interface StoryEvent {
  id: string;
  title: string;
  sender: string;
  target: number;
  location: string;
  body: string;
  why: string;
  choices: StoryChoice[];
  source?: { book: BookId; chapter: string; characters: string[]; note: string };
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const choice = (
  id: StoryChoiceId,
  label: string,
  description: string,
  cost: StoryChoice['cost'],
  effect: Effect,
  result: string,
  extra: Partial<StoryChoice> = {},
): StoryChoice => ({ id, label, description, cost, effect, result, ...extra });

/** Current dispatch is visible. Future dispatches are sampled from another stream by forecasts. */
export function storyEvent(
  world: World,
  s: State,
  p: Params = DEFAULT_PARAMS,
  seed = world.seed,
): StoryEvent | null {
  if (!p.storyEvents || s.turn >= TOTAL_TURNS) return null;
  if (p.campaign) {
    const chapter = campaignEvent(world, s);
    if (chapter) return chapter;
  }
  if (s.turn === 1) return null;
  const rng = stream(seed, `dispatch-v3:${s.turn}`);
  if (s.turn !== 0 && rng.uniform() >= p.storyChance) return null;
  const active = Array.from(s.phase, (phase, i) => (phase < 3 ? i : -1)).filter((i) => i >= 0);
  if (!active.length) return null;
  const c = counts(s);
  const weights = [
    1.2,
    0.7 + (c.crisis / world.n) * 4,
    0.8 + (1 - s.foundation),
    1,
    0.5 + (1 - s.treasury) * 3,
    0.8,
    0.4 + (c.independent / world.n) * 4,
    s.turn >= 10 ? 1.2 : 0.2,
  ];
  const ids = [
    'food',
    'governor',
    'archives',
    'autonomy',
    'credit',
    'belief',
    'refugees',
    'second-foundation',
  ];
  if (s.lastStory && ids.includes(s.lastStory)) weights[ids.indexOf(s.lastStory)] *= 0.15;
  let selected = 0;
  if (s.turn !== 0) {
    let draw = rng.uniform() * weights.reduce((sum, v) => sum + v, 0);
    for (let i = 0; i < weights.length; i++) {
      draw -= weights[i];
      if (draw <= 0) {
        selected = i;
        break;
      }
    }
  }
  const rank = (i: number) =>
    selected === 0 || selected === 6
      ? s.pressure[i]
      : selected === 1 || selected === 3
        ? s.faction[i] + s.phase[i] * 0.25
        : selected === 5
          ? s.religion[i] + s.openness[i] * 0.2
          : 1 - s.prosperity[i];
  const ranked = [...active].sort((a, b) => rank(b) - rank(a));
  const target =
    selected === 2 || selected === 7
      ? s.phase[world.terminus] < 3
        ? world.terminus
        : ranked[0]
      : ranked[rng.int(Math.min(4, ranked.length))];
  const name = world.names[target];
  const base = { id: ids[selected], target, location: name };
  switch (selected) {
    case 0:
      return {
        ...base,
        title: '粮船没有抵达',
        sender: `${name} · 民政署急电`,
        body: `${name}的补给船队停在了失修的跃迁港。粮价上扬，居民开始聚集在总督府外。地方官请求你调拨物资，商会则愿意赊账——条件是获得港口的席位。`,
        why: `当地人口压力 ${pct(s.pressure[target])}、繁荣 ${pct(s.prosperity[target])}。缓解匮乏能降低动荡风险，但谁承担费用会改变下一场争执。`,
        choices: [
          choice(
            'aid',
            '拨款恢复补给',
            '国库 −4.5 个百分点；本地繁荣 +18、人口压力 −12、合法性 +6 个百分点，邻区效果减半。',
            { treasury: 0.045 },
            { local: { prosperity: 0.18, pressure: -0.12, legitimacy: 0.06 } },
            '补给港重新开放。粮价暂时回落，居民散去；国库为这批物资付出了代价。',
          ),
          choice(
            'bargain',
            '让商会垫付',
            '影响力 −1；本地繁荣 +6、合法性 +10，但精英竞争 +6 个百分点。',
            { influence: 1 },
            { local: { prosperity: 0.06, legitimacy: 0.1, elites: 0.06 } },
            '商会的货船进港了。危机得到缓解，新的港口席位也让地方权力竞争更激烈。',
          ),
          choice(
            'defer',
            '让地方自行解决',
            '保留资源；本地繁荣 −4、合法性 −2.5 个百分点。',
            {},
            { local: { prosperity: -0.04, legitimacy: -0.025 } },
            '帝国没有拨款。地方官自行组织配给，积怨留在了港口。',
          ),
        ],
      };
    case 1:
      return {
        ...base,
        title: '总督拒绝帝国命令',
        sender: `${name} · 边疆使团`,
        body: `${name}的总督扣下了帝国税款。他声称边疆需要自己决定支出的权力。驻军请求增援，地方议会希望先派使者谈判。`,
        why: `当地派系化 ${pct(s.faction[target])}、合法性 ${pct(s.legitimacy[target])}。谈判可能缓解对立；军事约束来得更快，也会损伤信任。`,
        choices: [
          choice(
            'aid',
            '派使者促成和解',
            '影响力 −2；70% 成功：派系化 −15、合法性 +10；失败：派系化 +8 个百分点。',
            { influence: 2 },
            { local: { faction: -0.15, legitimacy: 0.1 } },
            '使者带回一份税款和解协议。总督暂时接受了帝国的安排。',
            {
              chance: 0.7,
              failure: { local: { faction: 0.08 } },
              failureResult: '使者被拒之门外。总督将谈判宣传为帝国软弱，地方派系更敢于公开对抗。',
            },
          ),
          choice(
            'bargain',
            '增派驻军约束总督',
            '国库 −3；本地驻军 +25，但合法性 −5 个百分点。',
            { treasury: 0.03 },
            { local: { garrison: 0.25, legitimacy: -0.05 } },
            '驻军进驻税务港。帝国加强了约束，居民对这次强硬行动心怀戒备。',
          ),
          choice(
            'defer',
            '暂不介入',
            '保留资源；本地派系化 +6、合法性 −4 个百分点。',
            {},
            { local: { faction: 0.06, legitimacy: -0.04 } },
            '边疆继续等待川陀的回应。总督获得了更多时间组织自己的支持者。',
          ),
        ],
      };
    case 2:
      return {
        ...base,
        title: '装得下多少文明',
        sender: `${name} · 百科全书委员会`,
        body: `运往${name}的船舱只剩最后一批。科学家希望运走实验室，行政官要求先保证居民安置。你可以追加资金，也可以为知识转移争取政治支持。`,
        why: `基地进度 ${pct(s.foundation)}。这里的选择会改变保存的知识，也影响接收星区的负担。`,
        choices: [
          choice(
            'aid',
            '追加一支知识船队',
            '国库 −4；基地 +2.5、本地教育 +6；精英竞争 +3 个百分点。',
            { treasury: 0.04 },
            { foundation: 0.025, local: { education: 0.06, elites: 0.03 } },
            '实验设备和档案进入船舱。基地保存了更多知识，接收地也要安置更多学者。',
          ),
          choice(
            'bargain',
            '争取地方共同承办',
            '影响力 −1；基地 +1.2、本地教育 +2.5、繁荣 +5 个百分点。',
            { influence: 1 },
            { foundation: 0.012, local: { education: 0.025, prosperity: 0.05 } },
            '地方学院参与了移交。船队较小，但知识获得了新的落脚点。',
          ),
          choice(
            'defer',
            '先留在原地',
            '基地 −0.5 个百分点；本地人口压力 +4 个百分点。',
            {},
            { foundation: -0.005, local: { pressure: 0.04 } },
            '这批档案仍留在旧仓库。工作人员继续等待下一张船票。',
          ),
        ],
      };
    case 3:
      return {
        ...base,
        title: '自治请愿送抵川陀',
        sender: `${name} · 地方议会`,
        body: `${name}的议会要求公开预算并扩大地方表决权。改革派和旧贵族都在争取这次议程。你可以承认部分诉求，也可以先加强行政约束。`,
        why: `政体开放度 ${pct(s.openness[target])}、派系化 ${pct(s.faction[target])}。过渡到半开放状态可能带来新风险，支持改革也能提升眼下的合法性。`,
        choices: [
          choice(
            'aid',
            '接受有限自治',
            '影响力 −1；开放度 +15、合法性 +12、派系化 −4 个百分点。',
            { influence: 1 },
            { local: { openness: 0.15, legitimacy: 0.12, faction: -0.04 } },
            '议会获得新的表决权。一部分反对者回到谈判桌，政治过渡仍需要继续照看。',
          ),
          choice(
            'bargain',
            '先恢复行政约束',
            '国库 −2.5；驻军 +18、全帝国治理 +2.5；本地合法性 −2.5 个百分点。',
            { treasury: 0.025 },
            { governance: 0.025, local: { garrison: 0.18, legitimacy: -0.025 } },
            '新的行政督察抵达。秩序得到加强，请愿者却没有得到期待的答复。',
          ),
          choice(
            'defer',
            '搁置请愿',
            '保留资源；本地派系化 +7 个百分点。',
            {},
            { local: { faction: 0.07 } },
            '请愿进入等待名单。不同派系开始在街头争夺这份议程。',
          ),
        ],
      };
    case 4:
      return {
        ...base,
        title: '商会的贷款条件',
        sender: '川陀 · 帝国财政署',
        body: `商会愿意向帝国提供一笔周转金，条件是把${name}的公共采购交给它。议会认为还可以尝试一次政治协调，争取更温和的援助条件。`,
        why: `当前国库 ${pct(s.treasury)}。借款能缓解财政压力，也可能让少数商人掌握更大权力。`,
        choices: [
          choice(
            'aid',
            '接受商会条件',
            '国库 +6；本地派系化 +10、精英竞争 +7 个百分点。',
            {},
            { treasury: 0.06, local: { faction: 0.1, elites: 0.07 } },
            '周转金进入国库。商会获得采购权，地方权力开始向新的利益集团集中。',
          ),
          choice(
            'bargain',
            '协调低息援助',
            '影响力 −2；80% 成功：国库 +5、治理 +2；失败仅国库 +1 个百分点。',
            { influence: 2 },
            { treasury: 0.05, governance: 0.02 },
            '协调获得支持。帝国拿到了附加条件较少的援助。',
            {
              chance: 0.8,
              failure: { treasury: 0.01 },
              failureResult: '各方没有达成完整协议。少量援助到账，大部分周转需求仍未解决。',
            },
          ),
          choice(
            'defer',
            '拒绝这份贷款',
            '国库不变；额外积蓄 1 点影响力。',
            {},
            { influence: 1 },
            '帝国拒绝了商会的条件，保留了下一次协调的空间。',
          ),
        ],
      };
    case 5:
      return {
        ...base,
        title: '科学教与学院的争执',
        sender: `${name} · 公共教育院`,
        body: `${name}的科学教希望由教团管理技术培训，学院则要求公开知识。两边都能维持生产，居民却开始围绕谁有权解释科学分成阵营。`,
        why: `宗教影响 ${pct(s.religion[target])}、开放度 ${pct(s.openness[target])}。知识传播和共同信念各有作用，强行统一路线也会带来反作用。`,
        choices: [
          choice(
            'aid',
            '支持公开学院',
            '影响力 −1；繁荣 +10、开放度 +8；宗教影响 −12 个百分点。',
            { influence: 1 },
            { local: { prosperity: 0.1, openness: 0.08, religion: -0.12 } },
            '公开课程开始招生。居民获得了更多技术渠道，教团的影响相应减弱。',
          ),
          choice(
            'bargain',
            '由科学教维持培训',
            '影响力 −1；宗教影响 +20、派系化 −8；开放度 −6 个百分点。',
            { influence: 1 },
            { local: { religion: 0.2, faction: -0.08, openness: -0.06 } },
            '教团恢复了统一培训。秩序暂时缓和，独立学院的空间却缩小了。',
          ),
          choice(
            'defer',
            '不替任何一方背书',
            '本地合法性 −4、派系化 +7 个百分点。',
            {},
            { local: { legitimacy: -0.04, faction: 0.07 } },
            '争执继续。双方都将帝国的沉默解释为对自己的不公。',
          ),
        ],
      };
    case 6:
      return {
        ...base,
        title: '避难船队请求靠港',
        sender: `${name} · 航道监察站`,
        body: `一批居民从失去联系的星区逃来，正在${name}外等待靠港。船上有工程师，也有失去家园的地方官。接纳他们能带来技能，安置不当也会加剧竞争。`,
        why: `帝国已失去 ${c.independent} 个星区。当地人口压力 ${pct(s.pressure[target])}，安置方式会决定这批人口怎样融入。`,
        choices: [
          choice(
            'aid',
            '开放港口并拨款安置',
            '国库 −3.5；繁荣 +7、合法性 +8；精英竞争 +8 个百分点。',
            { treasury: 0.035 },
            { local: { prosperity: 0.07, legitimacy: 0.08, elites: 0.08 } },
            '船队获准靠港。新的居民带来技能，安置与职位分配也成为地方官的下一项工作。',
          ),
          choice(
            'bargain',
            '协调分散安置',
            '影响力 −1；人口压力 −10、教育 +3、合法性 +4 个百分点。',
            { influence: 1 },
            { local: { pressure: -0.1, education: 0.03, legitimacy: 0.04 } },
            '邻近港口分担了安置。人群没有全部挤在一座城市，工程师开始参加重建。',
          ),
          choice(
            'defer',
            '关闭港口',
            '保留资源；本地及邻区合法性下降，本地 −7 个百分点。',
            {},
            { local: { legitimacy: -0.07 } },
            '船队被迫继续寻找落脚点。这条命令传遍邻近港口，帝国的声望受到损伤。',
          ),
        ],
      };
    default:
      return {
        ...base,
        title: '一封没有署名的密信',
        sender: '密封航道 · 来源不明',
        body: `密信指出${name}的精英竞争将拖垮下一批知识移交。寄信者愿意在幕后协调，但要求你为此消耗一部分政治支持。委员会更希望把钱直接花在档案保存上。`,
        why: `当地精英竞争 ${pct(s.elites[target])}。政治协调与知识保存都能留下成果，资源足够支持哪一边？`,
        choices: [
          choice(
            'aid',
            '接受幕后协调',
            '影响力 −2；治理 +8、本地精英竞争 −8、合法性 +3 个百分点。',
            { influence: 2 },
            { governance: 0.08, local: { elites: -0.08, legitimacy: 0.03 } },
            '几场争夺职位的会议悄然平息。没人公开解释是谁促成了这次协调。',
          ),
          choice(
            'bargain',
            '为档案增设保险仓',
            '国库 −3；基地 +2.5、本地教育 +3 个百分点。',
            { treasury: 0.03 },
            { foundation: 0.025, local: { education: 0.03 } },
            '档案有了另一份备份。政治争执仍在继续，文明却多留住了一点知识。',
          ),
          choice(
            'defer',
            '不回应密信',
            '保留资源；本地派系化 +4 个百分点。',
            {},
            { local: { faction: 0.04 } },
            '密信被封存。地方委员会继续独自处理越来越尖锐的争执。',
          ),
        ],
      };
  }
}

export function storyUnavailable(s: State, option: StoryChoice): string | null {
  if (s.influence < (option.cost.influence ?? 0)) return '影响力不足';
  if (s.treasury + 1e-9 < (option.cost.treasury ?? 0)) return '国库不足';
  return null;
}
export function applyStoryChoice(
  world: World,
  input: State,
  event: StoryEvent,
  id: StoryChoiceId,
  uniform: number,
) {
  const option = event.choices.find((c) => c.id === id);
  if (!option) throw new Error('未知事件选项');
  const unavailable = storyUnavailable(input, option);
  if (unavailable) throw new Error(unavailable);
  const s = cloneState(input);
  s.influence -= option.cost.influence ?? 0;
  s.treasury = clamp(s.treasury - (option.cost.treasury ?? 0));
  const success = uniform < (option.chance ?? 1);
  const effect = success ? option.effect : (option.failure ?? {});
  if (event.source) {
    s.chronicle ??= initialChronicle();
    for (const key of ['diplomacy', 'trade', 'secrecy'] as const)
      s.chronicle[key] = clamp(s.chronicle[key] + (effect.legacy?.[key] ?? 0));
    s.chronicle.resolved[event.id] = { choice: id, label: option.label, success, turn: s.turn + 1 };
  }
  s.foundation = clamp(s.foundation + (effect.foundation ?? 0));
  s.treasury = clamp(s.treasury + (effect.treasury ?? 0));
  s.governance = clamp(s.governance + (effect.governance ?? 0));
  s.influence = Math.min(8, s.influence + (effect.influence ?? 0));
  for (const [i, weight] of [
    [event.target, 1],
    ...world.neighbors[event.target].map((i) => [i, 0.5]),
  ]) {
    if (s.phase[i] === 3) continue;
    for (const [key, value] of Object.entries(effect.local ?? {})) {
      const field = key as LocalField;
      s[field][i] = clamp(s[field][i] + value! * weight);
    }
  }
  s.lastStory = event.id;
  return {
    state: s,
    story: {
      id: event.id,
      title: event.title,
      target: event.target,
      choice: id,
      label: option.label,
      success,
      text: success ? option.result : (option.failureResult ?? '协调没有成功。'),
    },
  };
}
/** A displayed preview uses expected effects; the real event will use a fresh reality draw. */
export function previewStoryChoice(
  world: World,
  input: State,
  event: StoryEvent | null,
  id?: StoryChoiceId,
): State {
  if (!event) return input;
  const option = event.choices.find((c) => c.id === (id ?? 'defer'))!;
  const win = applyStoryChoice(world, input, event, option.id, 0).state;
  if (!option.chance) return win;
  const loss = applyStoryChoice(world, input, event, option.id, 1).state;
  for (const key of [
    'prosperity',
    'pressure',
    'elites',
    'faction',
    'legitimacy',
    'religion',
    'education',
    'garrison',
    'openness',
  ] as const)
    for (let i = 0; i < world.n; i++)
      win[key][i] = win[key][i] * option.chance + loss[key][i] * (1 - option.chance);
  for (const key of ['foundation', 'treasury', 'governance', 'influence'] as const)
    win[key] = win[key] * option.chance + loss[key] * (1 - option.chance);
  if (win.chronicle && loss.chronicle)
    for (const key of ['diplomacy', 'trade', 'secrecy'] as const)
      win.chronicle[key] =
        win.chronicle[key] * option.chance + loss.chronicle[key] * (1 - option.chance);
  return win;
}
