import type { StoryChoice, StoryEvent } from './story';
import { clamp, type ChronicleState, type LegacyField, type State, type World } from './types';

export const LEGACIES: { key: LegacyField; label: string; use: string }[] = [
  {
    key: 'diplomacy',
    label: '外交承诺',
    use: '提高四王国调停、维恩尼斯危机与帝国前线的协商成功率。',
  },
  { key: 'trade', label: '贸易网络', use: '提高贸易封锁与档案转移成功率；决定商贸结局。' },
  {
    key: 'secrecy',
    label: '保密度',
    use: '提高骡之后的秘密行动成功率；公开信息可能损失这项积累。',
  },
];
export function initialChronicle(): ChronicleState {
  return { diplomacy: 0.35, trade: 0.15, secrecy: 0.65, resolved: {} };
}
export const CHAPTERS = [
  { id: 'seldon-trial', due: 0, title: '审判之后，驶向端点星', era: '计划的种子' },
  { id: 'four-kingdoms', due: 3, title: '四个王国，一颗无矿之星', era: '哈定的制衡' },
  { id: 'wienis', due: 6, title: '维恩尼斯的最后通牒', era: '哈定的制衡' },
  { id: 'askone', due: 8, title: '阿斯康的禁令', era: '行商时代' },
  { id: 'mallow-trial', due: 10, title: '马洛受审', era: '行商时代' },
  { id: 'trade-war', due: 12, title: '科瑞尔停止采购', era: '行商时代' },
  { id: 'riose-front', due: 15, title: '贝尔·里奥斯的进军', era: '帝国的回光' },
  { id: 'imperial-recall', due: 18, title: '皇帝召回自己的将军', era: '帝国的回光' },
  { id: 'trantor-library', due: 19, title: '川陀图书馆的最后航班', era: '知识的流亡' },
  { id: 'star-end', due: 24, title: '群星的尽头在哪里', era: '另一座基地' },
  { id: 'arcadia', due: 27, title: '阿卡蒂的航线', era: '另一座基地' },
  { id: 'palver', due: 29, title: '计划需要怎样的守护者', era: '另一座基地' },
] as const;
export const REACTIVE_CHAPTERS = [
  { id: 'vault-mismatch', title: '穹窿回答了另一个问题' },
  { id: 'bayta-secret', title: '贝泰留下的警告' },
  { id: 'channis', title: '罗瑟姆的诱饵' },
] as const;
export const chapterTitle = (id: string) =>
  [...CHAPTERS, ...REACTIVE_CHAPTERS].find((c) => c.id === id)?.title ?? id;
const option = (
  id: StoryChoice['id'],
  label: string,
  description: string,
  cost: StoryChoice['cost'],
  effect: StoryChoice['effect'],
  result: string,
  future: string,
  extra: Partial<StoryChoice> = {},
): StoryChoice => ({ id, label, description, cost, effect, result, future, ...extra });
const odds = (value: number) => clamp(value, 0.2, 0.92);

/** Calendar chapters are public story structure; reactive chapters read only an observed shock. */
export function campaignEvent(world: World, s: State): StoryEvent | null {
  const active = Array.from(s.phase, (phase, i) => (phase < 3 ? i : -1)).filter((i) => i >= 0);
  if (!active.length || s.turn >= 30) return null;
  const legacy = s.chronicle ?? initialChronicle(),
    done = legacy.resolved;
  let id: string | undefined;
  if (s.muleOccurred) {
    if (!done['vault-mismatch']) id = 'vault-mismatch';
    else if (!done['bayta-secret'] && s.turn >= done['vault-mismatch'].turn) id = 'bayta-secret';
    else if (!done.channis && done['bayta-secret'] && s.turn >= done['bayta-secret'].turn + 1)
      id = 'channis';
  }
  id ??= CHAPTERS.find((c) => c.due <= s.turn && !done[c.id])?.id;
  if (!id) return null;
  const targetAt = (name: string, fallback = world.terminus) => {
    const index = world.names.indexOf(name);
    return index >= 0 && s.phase[index] < 3 ? index : s.phase[fallback] < 3 ? fallback : active[0];
  };
  const target = targetAt(
    ['imperial-recall', 'trantor-library', 'bayta-secret', 'palver'].includes(id)
      ? '川陀'
      : ['four-kingdoms', 'wienis'].includes(id)
        ? '安纳克里昂'
        : ['mallow-trial', 'trade-war'].includes(id)
          ? '科瑞尔'
          : id === 'arcadia'
            ? '卡尔甘'
            : '端点星',
  );
  const base = { id, target, location: world.names[target] };
  const source = (
    book: 'foundation' | 'empire' | 'second',
    chapter: string,
    characters: string[],
    note: string,
  ) => ({ book, chapter, characters, note });
  const why = `承诺 ${Math.round(legacy.diplomacy * 100)}% · 贸易 ${Math.round(legacy.trade * 100)}% · 保密 ${Math.round(legacy.secrecy * 100)}%。本地效果传递给邻区（减半）；剧情积累会影响后续章节。`;
  switch (id) {
    case 'seldon-trial':
      return {
        ...base,
        sender: '盖尔·多尼克 · 流亡筹备处',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '心理史学家',
          ['哈里·谢顿', '盖尔·多尼克'],
          '谢顿受审后，百科全书计划被安置到端点星。',
        ),
        body: '审判已结束。端点星的船票可以带走实验设备，也可以用来安置技术人员。你接过谢顿计划的第一份预算：给流亡者一个实验室，还是先为他们争取周边世界的支持？',
        choices: [
          option(
            'aid',
            '运走实验室与档案',
            '国库 −4；基地 +2.5、本地教育 +6 个百分点；贸易网络 +8。',
            { treasury: 0.04 },
            { foundation: 0.025, local: { education: 0.06 }, legacy: { trade: 0.08 } },
            '设备启航。流亡者开始建立可以交给下一代的技术网络。',
            '技术货物为行商时代积累贸易网络。',
          ),
          option(
            'bargain',
            '与边疆签订安置协定',
            '影响力 −1；基地 +1.2、合法性 +8；外交承诺 +18。',
            { influence: 1 },
            { foundation: 0.012, local: { legitimacy: 0.08 }, legacy: { diplomacy: 0.18 } },
            '邻近世界答应提供港口。协定成为日后调停的依据。',
            '四王国危机将更容易达成协商。',
          ),
          option(
            'defer',
            '优先保存计划的秘密',
            '基地 +0.5；本地人口压力 +4；保密度 +10。',
            {},
            { foundation: 0.005, local: { pressure: 0.04 }, legacy: { secrecy: 0.1 } },
            '完整蓝图被封存。流亡者要用更少的支持开始生活。',
            '保留资源并提高保密度，安置压力由地方承担。',
          ),
        ],
      };
    case 'four-kingdoms':
      return {
        ...base,
        sender: '萨尔沃·哈定 · 端点星市政厅',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '百科全书编纂者',
          ['萨尔沃·哈定', '刘易斯·皮雷纳'],
          '哈定利用四王国的相互制衡保住缺乏资源的端点星。',
        ),
        body: '安纳克里昂要求独占基地的技术顾问。哈定建议邀请其他三个王国参与协商，让任何一家都无法单独控制端点星。委员会仍在等待川陀的权威背书。',
        choices: [
          option(
            'aid',
            '邀请四王国共同担保',
            '影响力 −2；成功：派系化 −12、合法性 +10，外交承诺 +18；失败：派系化 +5。',
            { influence: 2 },
            { local: { faction: -0.12, legitimacy: 0.1 }, legacy: { diplomacy: 0.18 } },
            '各王国承认共同担保。端点星赢得了谁都无法独占的空间。',
            '成功率随既有外交承诺上升。',
            {
              chance: odds(0.5 + 0.4 * legacy.diplomacy),
              failure: { local: { faction: 0.05 }, legacy: { diplomacy: -0.05 } },
              failureResult: '担保会议破裂。哈定仍须应对一个试图独占技术的邻国。',
            },
          ),
          option(
            'bargain',
            '用技术换一份双边条约',
            '国库 −2；繁荣 +10，外交承诺 +6、贸易网络 +12。',
            { treasury: 0.02 },
            { local: { prosperity: 0.1 }, legacy: { diplomacy: 0.06, trade: 0.12 } },
            '条约带来了订单，也把部分技术安排交给了单一伙伴。',
            '稳步建立贸易，制衡承诺增长较少。',
          ),
          option(
            'defer',
            '等待帝国作出答复',
            '合法性 −6；外交承诺 −8。',
            {},
            { local: { legitimacy: -0.06 }, legacy: { diplomacy: -0.08 } },
            '帝国的答复迟迟没有抵达。邻国正在替端点星决定下一步。',
            '省下资源，但削弱日后协商基础。',
          ),
        ],
      };
    case 'wienis':
      return {
        ...base,
        sender: '哈定 · 技术维护处',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '市长',
          ['萨尔沃·哈定', '维恩尼斯'],
          '原著危机涉及安纳克里昂舰队对基地技术与科学教的依赖。',
        ),
        body: '一艘翻修过的旧帝国战舰驶向边界。哈定不愿与它比拼火力：舰队的维护员、港口和训练都依赖基地。你可以组织维护人员拒绝为进攻服务，也可以争取王室撤回最后通牒。',
        choices: [
          option(
            'aid',
            '组织维护网络拒绝进攻',
            '影响力 −2；成功：派系化 −14、驻军 +12，外交承诺 +10；失败：合法性 −8。',
            { influence: 2 },
            { local: { faction: -0.14, garrison: 0.12 }, legacy: { diplomacy: 0.1 } },
            '维护网络停止为进攻提供支持。战舰的威慑变成了王室的内部争执。',
            '外交承诺与当地科学教影响共同提高成功率。',
            {
              chance: odds(0.45 + 0.3 * legacy.diplomacy + 0.25 * s.religion[target]),
              failure: { local: { legitimacy: -0.08 }, legacy: { diplomacy: -0.05 } },
              failureResult: '维护人员没有形成共同立场。最后通牒仍然有效。',
            },
          ),
          option(
            'bargain',
            '开放技术培训换取停火',
            '国库 −3；教育 +7、合法性 +8；贸易 +10、保密 −8。',
            { treasury: 0.03 },
            {
              local: { education: 0.07, legitimacy: 0.08 },
              legacy: { trade: 0.1, secrecy: -0.08 },
            },
            '公开培训成为停火条款。基地失去了一部分技术秘密，获得了新的使用者。',
            '扩大贸易网络，也让秘密更难保存。',
          ),
          option(
            'defer',
            '撤回顾问并守住边界',
            '驻军 +8、繁荣 −6；外交承诺 −8。',
            {},
            { local: { garrison: 0.08, prosperity: -0.06 }, legacy: { diplomacy: -0.08 } },
            '顾问撤离，边界进入戒备。原有合作也随之中断。',
            '即时防御加强，后续协商更困难。',
          ),
        ],
      };
    case 'askone':
      return {
        ...base,
        sender: '利马尔·波尼兹 · 行商航道',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '行商',
          ['利马尔·波尼兹', '艾斯克尔·戈洛夫'],
          '戈洛夫在阿斯康被扣留，波尼兹用贸易与技术解决困局。',
        ),
        body: '行商的技术展示触犯了当地禁令，戈洛夫被扣留。波尼兹认为，只要让议员看到技术能带来的收入，就能打开牢门。另一个办法是把争议提交公开听证，但商机可能因此流失。',
        choices: [
          option(
            'aid',
            '安排技术交易换取释放',
            '国库 −2.5；繁荣 +12、精英竞争 +5；贸易 +20、保密 −8。',
            { treasury: 0.025 },
            { local: { prosperity: 0.12, elites: 0.05 }, legacy: { trade: 0.2, secrecy: -0.08 } },
            '交易促成释放。商路打开了，议员们也开始争夺收益。',
            '贸易封锁会受益于这批新客户，地方竞争随之增加。',
          ),
          option(
            'bargain',
            '要求公开听证与技术豁免',
            '影响力 −1；合法性 +10、开放度 +6；外交承诺 +12。',
            { influence: 1 },
            { local: { legitimacy: 0.1, openness: 0.06 }, legacy: { diplomacy: 0.12 } },
            '技术豁免经过听证。行商获得更明确的规则，利润没有独占在一人手中。',
            '提高外交承诺，放弃更快的贸易扩张。',
          ),
          option(
            'defer',
            '暂停当地交易',
            '繁荣 −4；贸易网络 −8。',
            {},
            { local: { prosperity: -0.04 }, legacy: { trade: -0.08 } },
            '船队离开港口。营救交给地方交涉，新的客户网络暂时中断。',
            '不支付费用，后续贸易影响力减弱。',
          ),
        ],
      };
    case 'mallow-trial':
      return {
        ...base,
        sender: '霍伯·马洛 · 市政听证会',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '商业王侯',
          ['霍伯·马洛', '乔尔·帕尔马'],
          '马洛以记录揭露科瑞尔的假传教士挑衅，并主张以贸易维系基地。',
        ),
        body: '马洛被指控抛弃一名传教士。他带回了一份可能揭露挑衅的现场记录。公开它能洗清指控，也会暴露商队的取证方式；秘密提交则能保住渠道，却难以说服所有人。',
        choices: [
          option(
            'aid',
            '在听证会上公开记录',
            '影响力 −1；合法性 +12、派系化 −8；贸易 +15、保密 −15。',
            { influence: 1 },
            {
              local: { legitimacy: 0.12, faction: -0.08 },
              legacy: { trade: 0.15, secrecy: -0.15 },
            },
            '记录证明了挑衅。市政厅开始接受马洛以贸易代替强制教化的路线。',
            '贸易网络增长，秘密取证渠道更难继续使用。',
          ),
          option(
            'bargain',
            '只向独立审查员提交',
            '影响力 −1；合法性 +6；贸易 +8、保密 +8。',
            { influence: 1 },
            { local: { legitimacy: 0.06 }, legacy: { trade: 0.08, secrecy: 0.08 } },
            '审查员确认了记录。公众仍有疑问，但商队保住了自己的渠道。',
            '为后期秘密行动积累保密度。',
          ),
          option(
            'defer',
            '接受旧委员会的裁决',
            '派系化 +8；贸易 −12、外交承诺 −5。',
            {},
            { local: { faction: 0.08 }, legacy: { trade: -0.12, diplomacy: -0.05 } },
            '记录没有进入听证。行商路线失去了政治支持。',
            '保留费用，削弱下一场贸易危机的筹码。',
          ),
        ],
      };
    case 'trade-war':
      return {
        ...base,
        sender: '马洛 · 商会联合署',
        title: chapterTitle(id),
        why,
        source: source(
          'foundation',
          '商业王侯',
          ['霍伯·马洛'],
          '科瑞尔危机体现了对基地商品的经济依赖。',
        ),
        body: `科瑞尔拒绝继续采购基地商品。${done['mallow-trial']?.choice === 'aid' ? '马洛的公开听证仍在商会间流传。' : '马洛要求用现有客户网络撑过封锁。'}这是一场耐心的较量：维持禁运需要足够多的替代订单，否则先停工的可能是你自己的工厂。`,
        choices: [
          option(
            'aid',
            '联合商会维持禁运',
            '影响力 −2；成功：国库 +5、基地 +2、繁荣 +10；失败：国库 −3、繁荣 −8。',
            { influence: 2 },
            {
              treasury: 0.05,
              foundation: 0.02,
              local: { prosperity: 0.1 },
              legacy: { trade: 0.1 },
            },
            '替代订单支撑了工厂。依赖基地设备的科瑞尔回到谈判桌。',
            '成功率 = 45% + 贸易网络×35% + 外交承诺×15%（上限92%）。',
            {
              chance: odds(0.45 + 0.35 * legacy.trade + 0.15 * legacy.diplomacy),
              failure: { treasury: -0.03, local: { prosperity: -0.08 }, legacy: { trade: -0.08 } },
              failureResult: '客户网络不足以填补订单。停工先冲击了基地自己的工厂。',
            },
          ),
          option(
            'bargain',
            '以技术维护协定结束封锁',
            '国库 −2；繁荣 +8、合法性 +5；贸易 +6、外交承诺 +8。',
            { treasury: 0.02 },
            {
              local: { prosperity: 0.08, legitimacy: 0.05 },
              legacy: { trade: 0.06, diplomacy: 0.08 },
            },
            '维护协定使订单恢复。你付出了补贴，换取较低风险的结束方式。',
            '稳定的恢复路线，放弃禁运的更大收益。',
          ),
          option(
            'defer',
            '收缩订单，保住现有工厂',
            '繁荣 −5；贸易网络 −5。',
            {},
            { local: { prosperity: -0.05 }, legacy: { trade: -0.05 } },
            '工厂转为低负荷生产。封锁没有立即结束，国库也未承担新的补贴。',
            '保留政治资源，贸易积累有所损失。',
          ),
        ],
      };
    case 'riose-front':
      return {
        ...base,
        sender: '杜锡姆·巴尔 · 前线密报',
        title: chapterTitle(id),
        why,
        source: source(
          'empire',
          '将军',
          ['贝尔·里奥斯', '杜锡姆·巴尔', '拉森·德弗斯'],
          '里奥斯进攻基地；巴尔与德弗斯尝试寻找帝国内部的解法。',
        ),
        body: '帝国仍有足以击败边疆的舰队。里奥斯的推进切断了一条商路。巴尔提醒你：前线胜负并非唯一变量，一个屡战屡胜的将军也会令皇帝不安。你可以保存工业，或冒险把消息送入宫廷。',
        choices: [
          option(
            'aid',
            '分散生产，守住技术人员',
            '国库 −3.5；驻军 +15、教育 +5、基地 +1.5；贸易 +8。',
            { treasury: 0.035 },
            {
              local: { garrison: 0.15, education: 0.05 },
              foundation: 0.015,
              legacy: { trade: 0.08 },
            },
            '车间分散到多个港口。舰队推进仍在继续，知识与生产没有押在一座城里。',
            '将军被召回时，保存的产业更容易恢复。',
          ),
          option(
            'bargain',
            '派德弗斯潜入帝国宫廷',
            '影响力 −2；成功：治理 +5、派系化 −8、保密 +8；失败：合法性 −6、保密 −10。',
            { influence: 2 },
            { governance: 0.05, local: { faction: -0.08 }, legacy: { secrecy: 0.08 } },
            '消息到达宫廷。一些官员开始质疑前线将军获得的权力。',
            '成功率随外交承诺与保密度上升；无法保证皇帝的决定。',
            {
              chance: odds(0.35 + 0.25 * legacy.diplomacy + 0.25 * legacy.secrecy),
              failure: { local: { legitimacy: -0.06 }, legacy: { secrecy: -0.1 } },
              failureResult: '使者未能接近皇帝。前线依旧需要自行承担防守。',
            },
          ),
          option(
            'defer',
            '撤离前线并等待帝国变化',
            '繁荣 −8、基地 +0.5；保密 +5。',
            {},
            { local: { prosperity: -0.08 }, foundation: 0.005, legacy: { secrecy: 0.05 } },
            '技术资料随撤离船队离开。你保存了火种，代价是前线的生活继续恶化。',
            '保存少量知识，产业恢复基础较弱。',
          ),
        ],
      };
    case 'imperial-recall':
      return {
        ...base,
        sender: '帝国航道监察署',
        title: chapterTitle(id),
        why,
        source: source(
          'empire',
          '将军',
          ['克里昂二世', '贝尔·里奥斯'],
          '原著中皇帝召回里奥斯，体现了皇权与强势将军的结构性冲突。',
        ),
        body: `宫廷下令召回里奥斯。${done['riose-front']?.choice === 'aid' ? '分散的车间还在，你可以尽快恢复生产。' : done['riose-front']?.success && done['riose-front']?.choice === 'bargain' ? '你的消息曾进入宫廷，但没有证据说明它决定了召回。' : '即使没有成功游说，皇帝仍担心将军获得过大的权力。'}帝国的内部矛盾给了基地一段喘息。如何使用它？`,
        choices: [
          option(
            'aid',
            '恢复民用航线与车间',
            '国库 −2.5；繁荣 +12（此前保存工业则 +18）；贸易 +10。',
            { treasury: 0.025 },
            {
              local: { prosperity: done['riose-front']?.choice === 'aid' ? 0.18 : 0.12 },
              legacy: { trade: 0.1 },
            },
            '民用航线恢复。前线保存得越多，停战后的生活恢复得越快。',
            '上一章保存工业的选择带来额外繁荣收益。',
          ),
          option(
            'bargain',
            '把停战写成长期港口协定',
            '影响力 −1；合法性 +10、派系化 −6；外交承诺 +15。',
            { influence: 1 },
            { local: { legitimacy: 0.1, faction: -0.06 }, legacy: { diplomacy: 0.15 } },
            '新的协定限制了港口被军方征用。它能维持多久，仍取决于下一任统治者。',
            '扩展外交承诺，增强后续公开协作与结局基础。',
          ),
          option(
            'defer',
            '让地方自行恢复',
            '繁荣 +3；影响力 +1。',
            {},
            { local: { prosperity: 0.03 }, influence: 1 },
            '局部贸易自行恢复。你保留了应对下一场危机的政治资源。',
            '恢复较慢，积蓄一点评估后续局势的影响力。',
          ),
        ],
      };
    case 'trantor-library':
      return {
        ...base,
        sender: '川陀 · 图书馆保管处',
        title: chapterTitle(id),
        why,
        source: source(
          'empire',
          '骡',
          ['川陀图书馆的学者'],
          '帝国衰落后，川陀图书馆仍保存着可供寻找基地线索的知识。',
        ),
        body: '旧都的行政体系已难以照看全部馆藏。保管员请求一条安全航线，让索引、档案和研究人员离开高风险港口。商业航线可以分散运输，单独护航则会立即消耗国库。',
        choices: [
          option(
            'aid',
            '拨款护送学者与馆藏',
            '国库 −4；基地 +3、教育 +8；保密 +8。',
            { treasury: 0.04 },
            { foundation: 0.03, local: { education: 0.08 }, legacy: { secrecy: 0.08 } },
            '分批馆藏与学者离开港口。保管员把完整索引留给了可信的继承者。',
            '提高保密度，为后续寻找第二基地保留线索。',
          ),
          option(
            'bargain',
            '借商船分散转移索引',
            '影响力 −1；成功：基地 +2.5、教育 +6；失败：基地 +0.5。',
            { influence: 1 },
            { foundation: 0.025, local: { education: 0.06 } },
            '多个贸易港收到索引副本。知识不再只存在于一座图书馆。',
            '成功率随贸易网络上升。',
            {
              chance: odds(0.45 + 0.4 * legacy.trade),
              failure: { foundation: 0.005 },
              failureResult: '封锁中只有少量索引抵达。更多船仍在等待可靠的客户港口。',
            },
          ),
          option(
            'defer',
            '就地封存馆藏',
            '基地 +0.5；保密 +5、贸易 −4。',
            {},
            { foundation: 0.005, legacy: { secrecy: 0.05, trade: -0.04 } },
            '馆藏仍在川陀，秘密保管的索引没有公开。它能否传下去，要看未来谁找到这里。',
            '费用较低，知识保存收益有限。',
          ),
        ],
      };
    case 'vault-mismatch':
      return {
        ...base,
        sender: '端点星 · 穹窿值守组',
        title: chapterTitle(id),
        why,
        source: source(
          'empire',
          '骡',
          ['哈里·谢顿', '骡'],
          '骡的出现使谢顿预录的危机解释与真实局势错位。',
        ),
        body: '冲击已经发生，穹窿的录影却仍在谈论另一种冲突。模型解释不了这次突变。你可以公开承认失效并调整协调方式，或先让秘密工作组调查，避免新的恐慌。',
        choices: [
          option(
            'aid',
            '公开误差，组织跨区互助',
            '影响力 −1；合法性 +10、派系化 −8；外交承诺 +15、保密 −12。',
            { influence: 1 },
            {
              local: { legitimacy: 0.1, faction: -0.08 },
              legacy: { diplomacy: 0.15, secrecy: -0.12 },
            },
            '人们得知模型的边界。互助网络开始接手录影没有给出的答案。',
            '公开信任增强，后续秘密行动更容易暴露。',
          ),
          option(
            'bargain',
            '建立秘密调查小组',
            '影响力 −2；教育 +6、派系化 −4；保密 +15。',
            { influence: 2 },
            { local: { education: 0.06, faction: -0.04 }, legacy: { secrecy: 0.15 } },
            '调查组独立于例行预测运行。它被要求寻找一种模型从未纳入的干预。',
            '提高贝泰与罗瑟姆章节的秘密行动成功率。',
          ),
          option(
            'defer',
            '暂时继续依照录影行动',
            '合法性 −8、派系化 +8；外交承诺 −8。',
            {},
            { local: { legitimacy: -0.08, faction: 0.08 }, legacy: { diplomacy: -0.08 } },
            '录影不能解释眼下的变化。协调者开始各自寻找答案。',
            '保留资源，局部信任进一步受损。',
          ),
        ],
      };
    case 'bayta-secret':
      return {
        ...base,
        sender: '贝泰·达瑞尔 · 川陀研究小组',
        title: chapterTitle(id),
        why,
        source: source(
          'empire',
          '骡',
          ['贝泰·达瑞尔', '托兰·达瑞尔', '艾布林·米斯'],
          '贝泰阻止第二基地的位置被泄露；情感操控改变了寻找者之间的信任。',
        ),
        body: '研究小组找到了通向另一座基地的线索。贝泰警告：信任本身可能已被操控。公开线索会让更多人参与寻找，也可能让敌人先到达。你愿意为保护位置承担多少政治代价？',
        choices: [
          option(
            'aid',
            '限制知情者并分割索引',
            '影响力 −2；成功：基地 +2、保密 +15；失败：保密 −15、派系化 +6。',
            { influence: 2 },
            { foundation: 0.02, legacy: { secrecy: 0.15 } },
            '索引被分开保管。任何一个被操控的知情者都不能独自暴露完整航线。',
            '成功率 = 45% + 保密度×45%；成功后利于诱饵行动。',
            {
              chance: odds(0.45 + 0.45 * legacy.secrecy),
              failure: { local: { faction: 0.06 }, legacy: { secrecy: -0.15 } },
              failureResult: '保管链出现漏洞。贝泰要求后续调查立即改变航线。',
            },
          ),
          option(
            'bargain',
            '公布调查方法，隐藏目的地',
            '影响力 −1；教育 +7、合法性 +6；外交承诺 +8、保密 −5。',
            { influence: 1 },
            {
              local: { education: 0.07, legitimacy: 0.06 },
              legacy: { diplomacy: 0.08, secrecy: -0.05 },
            },
            '调查方法可以被独立检查，目的地仍在少数人手中。怀疑没有消失，却有了可讨论的依据。',
            '提高公开信任，付出少量保密度。',
          ),
          option(
            'defer',
            '停止追索，保存现有知识',
            '基地 +0.5；保密 +5。',
            {},
            { foundation: 0.005, legacy: { secrecy: 0.05 } },
            '小组停止进一步定位。已经找到的知识留下了，位置暂时没有传出。',
            '低成本保存路线，放弃本次更大的知识收益。',
          ),
        ],
      };
    case 'channis':
      return {
        ...base,
        sender: '第二基地 · 未署名航道情报',
        title: chapterTitle(id),
        why,
        source: source(
          'second',
          '寻找骡',
          ['贝尔·查尼斯', '汉·普利吉', '第一发言者'],
          '塔泽达与罗瑟姆的搜索涉及诱饵与心理干预。',
        ),
        body: '追踪者相信一条异常清晰的航线通向目标。一封密报建议让这条线索继续显得可信，把真正的协调网络藏在另一侧。公开证伪更安全，却会丢掉这次误导对手的机会。',
        choices: [
          option(
            'aid',
            '维持诱饵，分散真实联络',
            '影响力 −2；成功：治理 +5、派系化 −12、保密 +10；失败：合法性 −7、保密 −12。',
            { influence: 2 },
            { governance: 0.05, local: { faction: -0.12 }, legacy: { secrecy: 0.1 } },
            '追踪者追着错误的线索离开。协调网络获得了继续工作的时间。',
            '保密度提高成功率；此前贝泰成功保护索引再加10%。',
            {
              chance: odds(
                0.4 +
                  0.35 * legacy.secrecy +
                  (done['bayta-secret']?.success && done['bayta-secret']?.choice === 'aid'
                    ? 0.1
                    : 0),
              ),
              failure: { local: { legitimacy: -0.07 }, legacy: { secrecy: -0.12 } },
              failureResult: '诱饵被识破。公开生活与秘密网络都受到新的怀疑。',
            },
          ),
          option(
            'bargain',
            '公开证伪并保护无辜港口',
            '国库 −2；合法性 +10、派系化 −5；外交承诺 +12、保密 −8。',
            { treasury: 0.02 },
            {
              local: { legitimacy: 0.1, faction: -0.05 },
              legacy: { diplomacy: 0.12, secrecy: -0.08 },
            },
            '错误航线被公开证伪。一个无辜港口免于继续卷入搜寻。',
            '放弃诱饵收益，增强公开协作能力。',
          ),
          option(
            'defer',
            '切断这一条联络',
            '保密 +5；贸易 −5。',
            {},
            { legacy: { secrecy: 0.05, trade: -0.05 } },
            '这条航道沉默了。追踪暂时停止，正常贸易也失去一个节点。',
            '用贸易连通性换取有限的保密收益。',
          ),
        ],
      };
    case 'star-end':
      return {
        ...base,
        sender: '达瑞尔研究组 · 星图索引',
        title: chapterTitle(id),
        why,
        source: source(
          'second',
          '寻找基地',
          ['达瑞尔家族', '第二基地'],
          '第二基地的位置与“群星尽头”的理解，是搜索与误导的重要线索。',
        ),
        body: '各地交来互相矛盾的星图。有人按距离寻找，有人按帝国的旧知识中心寻找。你可以建立秘密核验网，也可以公开研究规则，让寻找者彼此校验。目的地不会仅凭一条传闻就写进地图。',
        choices: [
          option(
            'aid',
            '以秘密小组交叉核验',
            '影响力 −1；基地 +1.5、保密 +12；开放度 −4。',
            { influence: 1 },
            { foundation: 0.015, local: { openness: -0.04 }, legacy: { secrecy: 0.12 } },
            '小组保留多个假设。完整位置没有进入公共地图。',
            '提高最终秘密协作路线的能力。',
          ),
          option(
            'bargain',
            '公开规则，禁止单点结论',
            '国库 −2；教育 +8、合法性 +7；外交承诺 +12、保密 −8。',
            { treasury: 0.02 },
            {
              local: { education: 0.08, legitimacy: 0.07 },
              legacy: { diplomacy: 0.12, secrecy: -0.08 },
            },
            '多地学者可以复核研究规则。错误结论不再由一个委员会独占。',
            '增强公开制度路线，牺牲部分秘密空间。',
          ),
          option(
            'defer',
            '先修复第一基地的生活',
            '繁荣 +5、贸易 +5。',
            {},
            { local: { prosperity: 0.05 }, legacy: { trade: 0.05 } },
            '搜索暂停。现存世界的工厂与学校继续运转。',
            '不投入搜索，少量加强商贸结局基础。',
          ),
        ],
      };
    case 'arcadia':
      return {
        ...base,
        sender: '阿卡蒂·达瑞尔 · 航道短讯',
        title: chapterTitle(id),
        why,
        source: source(
          'second',
          '寻找基地',
          ['阿卡蒂·达瑞尔', '霍米尔·孟恩', '普利姆·帕尔弗'],
          '阿卡蒂从卡尔甘逃往川陀；她的消息与帕尔弗的角色影响了基地的局势。',
        ),
        body: '卡尔甘的军事野心使一名年轻调查者陷入危险。阿卡蒂的消息需要经过川陀的民用航线才能返回。把她当作情报工具可能得到更多线索，先保护她则要放弃对消息的完全控制。',
        choices: [
          option(
            'aid',
            '护送调查者，保持消息独立',
            '国库 −3；合法性 +10、基地 +1；外交承诺 +15。',
            { treasury: 0.03 },
            { local: { legitimacy: 0.1 }, foundation: 0.01, legacy: { diplomacy: 0.15 } },
            '阿卡蒂安全抵达。消息保留了她自己的判断，没有被改成政治口号。',
            '为公开制度结局积累外交承诺。',
          ),
          option(
            'bargain',
            '借商队递送，隐藏联络人',
            '影响力 −1；基地 +1.5；贸易 +8、保密 +8。',
            { influence: 1 },
            { foundation: 0.015, legacy: { trade: 0.08, secrecy: 0.08 } },
            '消息随商队绕过检查。收信人知道了结论，仍不知道所有联络者。',
            '同时加强贸易与最终秘密协作能力。',
          ),
          option(
            'defer',
            '暂时关闭高风险航线',
            '驻军 +8；外交承诺 −8、贸易 −6。',
            {},
            { local: { garrison: 0.08 }, legacy: { diplomacy: -0.08, trade: -0.06 } },
            '检查站加强戒备。调查者仍需寻找其他安全航线。',
            '局部防御提高，协作网络收缩。',
          ),
        ],
      };
    case 'palver':
      return {
        ...base,
        sender: '普利姆·帕尔弗 · 民用贸易代表',
        title: chapterTitle(id),
        why,
        source: source(
          'second',
          '寻找基地',
          ['普利姆·帕尔弗', '第一发言者'],
          '帕尔弗的公开身份与第二基地的隐秘角色形成双重叙事。',
        ),
        body: '最后一份协定送抵市政厅。隐秘协调能帮助恢复秩序，也会让公众无法检查谁在影响自己的判断。贸易自治保存多个声音，却不保证它们总能达成一致。你要把怎样的制度留给下一代？',
        choices: [
          option(
            'aid',
            '保留两座基地的秘密协作',
            '影响力 −2；成功：基地 +3、治理 +5、保密 +10；失败：派系化 +8、保密 −10。',
            { influence: 2 },
            { foundation: 0.03, governance: 0.05, legacy: { secrecy: 0.1 } },
            '协作机制留下了。下一代将得到更多支撑，也继承了无法公开检验的权力。',
            '保密度决定成功率；有机会形成“双基地协作”结局。',
            {
              chance: odds(0.4 + 0.45 * legacy.secrecy),
              failure: { local: { faction: 0.08 }, legacy: { secrecy: -0.1 } },
              failureResult: '隐秘协定没有建立信任。下一代需要重新安排谁有权影响计划。',
            },
          ),
          option(
            'bargain',
            '公布权责，建立贸易自治章程',
            '国库 −2；合法性 +12、开放度 +8；外交承诺 +12、贸易 +10、保密 −10。',
            { treasury: 0.02 },
            {
              local: { legitimacy: 0.12, openness: 0.08 },
              legacy: { diplomacy: 0.12, trade: 0.1, secrecy: -0.1 },
            },
            '章程可以被公开修改。秩序仍有争执，但商路与权责不再由少数人独占。',
            '加强“商路共同体”或“公开协约”结局。',
          ),
          option(
            'defer',
            '把全部资源交给公开学院',
            '基地 +1、教育 +5；贸易 +4、保密 −4。',
            {},
            {
              foundation: 0.01,
              local: { education: 0.05 },
              legacy: { trade: 0.04, secrecy: -0.04 },
            },
            '学院接过了剩余资源。你没有替下一代决定全部政治安排。',
            '保存知识，让后人自行决定制度。',
          ),
        ],
      };
    default:
      return null;
  }
}

/** A narrative route complements the unchanged stability/knowledge score. */
export function campaignEnding(s: State) {
  const c = s.chronicle;
  if (!c) return null;
  if (c.resolved.palver?.choice === 'aid' && c.resolved.palver.success && c.secrecy >= 0.6)
    return {
      title: '双基地协作',
      text: '公开的知识体系与隐秘的协调网络共同留下。后人也继承了监督这种权力的难题。',
    };
  if (c.trade >= 0.65)
    return {
      title: '商路共同体',
      text: '你建立的客户、港口与技术网络继续连接星区。各地将在相互依赖中协商下一种秩序。',
    };
  if (c.diplomacy >= 0.65)
    return {
      title: '公开协约',
      text: '跨区承诺与可讨论的规则成为最深的积累。未来的协调者必须继续争取公众的信任。',
    };
  return {
    title: '学院的火种',
    text: '没有一条路线独占未来。留下的档案与学院，仍让下一代有机会重新选择。',
  };
}
