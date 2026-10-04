import { hashSeed, stream } from './rng';
import type { StoryChoice, StoryEffect, StoryEvent } from './story';
import { clamp, type Approach, type DecisionRecord, type State, type World } from './types';

const route: Record<string, readonly Approach[]> = {
  food: ['care', 'commerce', 'restraint'],
  governor: ['accord', 'force', 'restraint'],
  archives: ['knowledge', 'commerce', 'restraint'],
  autonomy: ['accord', 'force', 'restraint'],
  credit: ['commerce', 'accord', 'restraint'],
  belief: ['knowledge', 'shadow', 'restraint'],
  refugees: ['care', 'knowledge', 'restraint'],
  'second-foundation': ['shadow', 'knowledge', 'restraint'],
  'seldon-trial': ['knowledge', 'accord', 'shadow'],
  'four-kingdoms': ['accord', 'commerce', 'restraint'],
  wienis: ['force', 'knowledge', 'force'],
  askone: ['commerce', 'accord', 'restraint'],
  'mallow-trial': ['accord', 'shadow', 'restraint'],
  'trade-war': ['commerce', 'accord', 'restraint'],
  'riose-front': ['care', 'shadow', 'force'],
  'imperial-recall': ['accord', 'commerce', 'restraint'],
  'trantor-library': ['knowledge', 'accord', 'restraint'],
  'vault-mismatch': ['shadow', 'accord', 'restraint'],
  'bayta-secret': ['shadow', 'accord', 'restraint'],
  channis: ['shadow', 'care', 'restraint'],
  'star-end': ['shadow', 'knowledge', 'care'],
  arcadia: ['care', 'commerce', 'force'],
  palver: ['shadow', 'accord', 'knowledge'],
};

const voices: Record<string, readonly string[]> = {
  food: [
    '先把公共粮船开过去。分配名单由街区共同签收。',
    '请商会接手运输，条件在居民代表面前谈。',
    '让地方先处理，运力暂不从别处调来。',
  ],
  governor: [
    '派代表去谈，先听清他拒绝命令的理由。',
    '派驻监察队。地方官署不能另立一套命令。',
    '暂不回应，继续保留往来的通信。',
  ],
  archives: [
    '把设备和书稿一起运走，先给它们找到落脚处。',
    '先保住人和手艺，机器可以随后补齐。',
    '让当地继续保管，暂不安排新的航次。',
  ],
  autonomy: [
    '承认地方的议事权，让他们自己选出代表。',
    '先恢复直属管理，税务和驻军不能分开办。',
    '将请愿留待下次会议，不先作出承诺。',
  ],
  credit: [
    '接受商会的借款，产权条件也记入公文。',
    '以跨区担保重新谈利息，不把地方交出去。',
    '不借这笔钱。让财政署另排支出的次序。',
  ],
  belief: [
    '开放学院，让居民亲自了解设备和技术。',
    '把设备交给科学教，让共同仪式维系使用者。',
    '保持现有安排，先不改变学校与教团的关系。',
  ],
  refugees: [
    '打开接收站。先让抵达的人有床位和食物。',
    '按技术专长安排安置，学校和工坊共同接人。',
    '暂不扩大接收，先照看现有居民。',
  ],
  'second-foundation': [
    '接受秘密协调，但联络名单不得进入公报。',
    '把支援交给公开学院，不建立另一套指挥体系。',
    '不向未知的联络者作出承诺。',
  ],
  'seldon-trial': [
    '设备和档案先登船。这些东西不能留在审判庭。',
    '给邻近港口写信，让流亡者有地方停靠。',
    '蓝图封存。不要让所有人都知道完整的安排。',
  ],
  'four-kingdoms': [
    '四家都来担保，谁也不能独占基地。',
    '先与一家签约，把眼前的订单落实。',
    '仍向川陀请示，在答复抵达之前不另签条约。',
  ],
  wienis: [
    '请维护员拒绝为进攻服务，不先向舰队开火。',
    '用公开培训换停火，让技术进入更多人的手里。',
    '撤回顾问，边界的守备不能再松懈。',
  ],
  askone: [
    '让波尼兹去谈交易，先把戈洛夫带回来。',
    '要求公开听证，把技术禁令一并讲清楚。',
    '船队先撤出当地，不再追加新的交易。',
  ],
  'mallow-trial': [
    '公开那份现场记录，让指控者也当众回答。',
    '交给独立审查员。证人和取证渠道需要保护。',
    '接受委员会现有的裁决，不另开听证。',
  ],
  'trade-war': [
    '请其他商会接下订单，一起撑过禁运。',
    '用维护协定重新谈采购，不让工厂继续等。',
    '缩小生产规模，先把现有工厂留下来。',
  ],
  'riose-front': [
    '分散工厂，把技术人员接到安全的地方。',
    '把前线的消息送进宫廷。将军并非没有掣肘。',
    '守住眼前的防线，不向宫廷作出新的承诺。',
  ],
  'imperial-recall': [
    '以正式公文确认撤军，不让真空拖成另一场战争。',
    '让商人先回港，剩下的条款随后再谈。',
    '先不庆祝，也不向新任将领许诺任何事。',
  ],
  'trantor-library': [
    '派船去接书稿和资料员，不只接走目录。',
    '请留下的人共同保管，文库不交给一家。',
    '先保住已运出的副本，剩余的交给当地。',
  ],
  'vault-mismatch': [
    '先封存记录，让小组核对偏差来自哪里。',
    '把问题公开，允许各地提交不同的解释。',
    '不改变现有工作。眼前的生活仍需有人照看。',
  ],
  'bayta-secret': [
    '索引交给可信的小组，不让联络者暴露。',
    '公开核验的方法，但不交出完整位置。',
    '停止这次追索，先留下已经找到的知识。',
  ],
  channis: [
    '维持诱饵，把真正的联络分散到别处。',
    '公开证伪，不让那个无辜港口再受牵连。',
    '切断这条线，联络人暂时不要露面。',
  ],
  'star-end': [
    '让不同小组秘密核验，不急着写出唯一的坐标。',
    '公开研究规则，所有结论都应能被复查。',
    '先修复现存的学校和工厂。搜索可以等。',
  ],
  arcadia: [
    '护送她离开，保留她自己写下的判断。',
    '请商队递信，不把联络人的名字交给检查站。',
    '先关闭高风险航线，不再派更多人进去。',
  ],
  palver: [
    '保留秘密协作，但要把责任写进内部的协定。',
    '公布权责，让后人也能修改这份章程。',
    '把剩余资源交给公开学院，不替后人定下全部安排。',
  ],
};

function response(
  id: StoryChoice['id'],
  label: string,
  voice: string,
  approach: Approach,
  effect: StoryEffect,
  result: string,
  extra: Partial<StoryChoice> = {},
): StoryChoice {
  return { id, label, voice, approach, description: voice, cost: {}, effect, result, ...extra };
}

const alternative = (
  label: string,
  voice: string,
  approach: Approach,
  effect: StoryEffect,
  result: string,
  failure: StoryEffect,
  failureResult: string,
  chance = 0.6,
) =>
  response('improvise', label, voice, approach, effect, result, { chance, failure, failureResult });

// Each fourth response is a distinct compromise, not a stronger version of the first response.
const alternatives: Record<string, StoryChoice> = {
  food: alternative(
    '先建地方粮食互助仓',
    '拨不出整支粮船，就让附近仓库先互借。秋收后必须归还。',
    'care',
    { local: { pressure: -0.06, prosperity: 0.035, faction: 0.025 }, strategic: { supply: 0.12 } },
    '互助仓接通了几个街区。粮食先送到了，归还的期限也写进了下一年的账簿。',
    { local: { legitimacy: -0.04, faction: 0.04 } },
    '几家仓库拒绝互借。居民记住了已经张贴、却没有兑现的领粮通告。',
  ),
  governor: alternative(
    '让地方重新选举总督',
    '不先替任何一方背书。请居民选出一个能够答复的人。',
    'accord',
    { local: { openness: 0.1, legitimacy: 0.07, faction: -0.06 }, strategic: { autonomy: 0.1 } },
    '新一轮选举产生了代表。旧总督离任，地方开始要求川陀承认自己的程序。',
    { local: { faction: 0.07, legitimacy: -0.035 } },
    '旧总督拒绝交接。两份选举结果同时送抵川陀，地方的争执反而扩大了。',
    0.52,
  ),
  archives: alternative(
    '把老师留在各地，互寄副本',
    '不只建一座文库。请学校轮流誊写，索引由端点星保管。',
    'knowledge',
    {
      foundation: 0.016,
      local: { education: 0.04 },
      legacy: { diplomacy: 0.055, secrecy: -0.035 },
    },
    '学校开始交换副本。资料分散保管，地方教师也获得了新的工作。',
    { local: { education: -0.015 }, legacy: { secrecy: -0.03 } },
    '各地采用了不同的索引，第一批副本无法互相核对。教师仍在等一份统一目录。',
    0.67,
  ),
  autonomy: alternative(
    '只让渡税务，保留共同法庭',
    '地方自己收税，跨区纠纷仍交共同法庭。先试行一届。',
    'accord',
    {
      local: { legitimacy: 0.08, openness: 0.06 },
      strategic: { autonomy: 0.16 },
      treasury: -0.012,
    },
    '试行章程得到签署。税务下放，几起跨区争议仍送进共同法庭。',
    { local: { faction: 0.06 }, treasury: -0.01 },
    '地方接受了税权，却拒绝共同法庭的裁决。新章程留下了两种互相矛盾的解释。',
  ),
  credit: alternative(
    '发行由港口共同认购的债券',
    '把借款拆成小份，向各港口公开账期，不给一家商会独占。',
    'commerce',
    { treasury: 0.04, local: { elites: 0.035 }, legacy: { trade: 0.07, diplomacy: 0.035 } },
    '港口分摊了借款。国库得到了周转资金，也多了许多按期询问偿付的小股东。',
    { treasury: -0.01, local: { legitimacy: -0.025 } },
    '债券认购没有凑足。港口要求撤回承诺，财政署只得重新安排已经开出的支票。',
    0.58,
  ),
  belief: alternative(
    '让教团与学院共管设备',
    '维护交给工程师，仪式由居民决定。双方都不得把别人挡在门外。',
    'accord',
    { local: { education: 0.05, legitimacy: 0.07, religion: 0.035 }, legacy: { diplomacy: 0.04 } },
    '工程师与教团签下共管书。设备继续运转，门口第一次贴出了面向所有居民的使用时段。',
    { local: { faction: 0.06, openness: -0.02 } },
    '双方都要求最后决定权。设备仍在，门口却出现了两份互相冲突的通告。',
  ),
  refugees: alternative(
    '给接收家庭土地使用权',
    '不只安置在营地。请愿意接收的家庭与工坊共同担保。',
    'care',
    { local: { pressure: -0.07, prosperity: 0.055, elites: 0.025 }, strategic: { autonomy: 0.08 } },
    '一批接收家庭签了担保书。新来的人搬出临时营地，也开始面对土地边界与工钱的争议。',
    { local: { pressure: 0.04, faction: 0.045 } },
    '担保人没有履约。营地没能关闭，居民又多了一场关于土地分配的争执。',
  ),
  'second-foundation': alternative(
    '只接受匿名的纠错报告',
    '不要让他们直接下命令。把建议留下，交公开部门逐条核验。',
    'knowledge',
    {
      governance: 0.035,
      local: { education: 0.035 },
      strategic: { intelligence: 0.12 },
      legacy: { secrecy: 0.035 },
    },
    '匿名报告经过复查才被采用。几处档案错误得到纠正，联络者没有获得直接指挥权。',
    { governance: -0.02, local: { faction: 0.035 } },
    '匿名报告混入了错误线索。公开部门花了很久才把旧记录重新查清。',
    0.65,
  ),
  'seldon-trial': alternative(
    '把流亡者分成几批安置',
    '端点星保管总目录，其他港口先收下家庭和学徒。名单要彼此留底。',
    'care',
    {
      foundation: 0.014,
      local: { pressure: -0.05, education: 0.035 },
      legacy: { diplomacy: 0.06, secrecy: -0.035 },
    },
    '分批安置得到了接纳。几个港口留下了流亡者的名字，端点星也不必独自承担最初的拥挤。',
    { local: { pressure: 0.04 }, foundation: 0.004 },
    '几个接收港口临时改变了条件。最后一批家庭仍挤在端点星，分散的资料还没有收齐。',
    0.66,
  ),
  'four-kingdoms': alternative(
    '建立不归王室独占的维修公会',
    '顾问由公会派遣，四家都可以用，也都不能带走整支队伍。',
    'knowledge',
    { local: { education: 0.055, faction: -0.065 }, legacy: { trade: 0.08, secrecy: -0.035 } },
    '维修公会开始接单。技术人员能跨越王国边界，王室不得再把他们列入自己的私产。',
    { local: { faction: 0.04, prosperity: -0.025 } },
    '王室各自扣住了顾问。公会有了章程，却暂时没有能够自由往来的队伍。',
  ),
  wienis: alternative(
    '让舰上的技术人员自行表决',
    '把进攻命令交给真正维护战舰的人讨论。不要替他们伪造一封回信。',
    'accord',
    { local: { legitimacy: 0.09, faction: -0.09 }, legacy: { diplomacy: 0.08, secrecy: -0.04 } },
    '技术人员拒绝执行进攻命令。王室开始调查投票，却无法让失去维护支持的战舰继续推进。',
    { local: { garrison: -0.035, faction: 0.06 } },
    '表决被军官中止。部分维护员遭到扣押，停火的要求没能传到指挥舰。',
    0.5,
  ),
  askone: alternative(
    '让当地工坊自行生产样机',
    '不再只卖成品。先把一份能检验的图纸交给工匠，营救条件随后再谈。',
    'knowledge',
    { local: { education: 0.075, prosperity: 0.06 }, legacy: { trade: 0.07, secrecy: -0.09 } },
    '工坊造出了样机。禁令开始受到本地使用者的质疑，戈洛夫得以离开扣留处。',
    { local: { prosperity: -0.025 }, legacy: { secrecy: -0.06 } },
    '样机没有通过检验。图纸已经流出，扣留戈洛夫的官员却仍拒绝松口。',
    0.64,
  ),
  'mallow-trial': alternative(
    '让船员与证人共同作证',
    '不只播放记录。请在场的人来回答，听证会也须保护他们的身份。',
    'accord',
    { local: { legitimacy: 0.085, faction: -0.055 }, legacy: { diplomacy: 0.07, trade: 0.06 } },
    '多名证人的叙述互相印证。听证会撤回指控，并留下了可供以后复查的证词。',
    { local: { legitimacy: -0.035 }, legacy: { secrecy: -0.035 } },
    '证词中的时序出现矛盾。听证延期，几位船员的身份也被反对者认了出来。',
    0.63,
  ),
  'trade-war': alternative(
    '将生产转交边疆合作工坊',
    '让没有参与禁运的工坊接手一部分订单，基地保留检验和培训。',
    'commerce',
    {
      local: { prosperity: 0.065, elites: 0.04 },
      strategic: { trade: 0.16 },
      legacy: { trade: 0.1, secrecy: -0.04 },
    },
    '合作工坊承接了订单。封锁没有立即消失，但停工的工人开始在新的名单上找到工作。',
    { treasury: -0.018, local: { prosperity: -0.03 } },
    '交货规格没能统一。合作工坊积压了半成品，旧工厂也没有及时恢复订单。',
    0.56,
  ),
  'riose-front': alternative(
    '争取沿途驻军保持中立',
    '请港口只接收民用船，不为任何一方进攻提供中转。愿意的人共同签名。',
    'accord',
    {
      local: { faction: -0.08, legitimacy: 0.055 },
      strategic: { supply: 0.1, autonomy: 0.08 },
      legacy: { diplomacy: 0.07 },
    },
    '几个港口共同宣布中立。民用航次继续，里奥斯必须另找军用中转站。',
    { local: { garrison: -0.04, prosperity: -0.03 } },
    '中立声明没有被军队接受。参与签名的港口被加强检查，民用运输也受到拖累。',
    0.46,
  ),
  'imperial-recall': alternative(
    '让地方议会接管空出的港口',
    '驻军撤离后，不再立刻换一支驻军。请本地议会接手港务。',
    'accord',
    {
      local: { legitimacy: 0.08, openness: 0.06 },
      strategic: { autonomy: 0.13 },
      legacy: { diplomacy: 0.06 },
    },
    '地方议会接过港务印章。航次恢复，但共同的税务安排还需要重谈。',
    { local: { faction: 0.055 }, strategic: { supply: -0.04 } },
    '议会为接管权争执。撤走的驻军留下了仓库，新的管理员却迟迟没有到岗。',
    0.65,
  ),
  'trantor-library': alternative(
    '让各学校认领不同的书卷',
    '船位不够，就别把所有书装到同一个目的地。目录必须在端点星留副本。',
    'knowledge',
    { foundation: 0.024, local: { education: 0.06 }, legacy: { diplomacy: 0.06, secrecy: -0.055 } },
    '书卷分别送入几所学校。目录留下了去向，部分资料员也随自己的藏书换了新住处。',
    { foundation: 0.007, local: { education: -0.02 } },
    '几批书卷错过了航班。已经运出的资料被保存下来，目录中仍留着未能确认的空栏。',
    0.64,
  ),
  'vault-mismatch': alternative(
    '请各地只报告能核实的异常',
    '不用一个新预言替换旧预言。先把实际见到的人和事情送来。',
    'knowledge',
    {
      governance: 0.03,
      local: { education: 0.035 },
      strategic: { intelligence: 0.15 },
      legacy: { secrecy: -0.035 },
    },
    '各地开始校验目击报告。一些谣言被排除，关于骡的消息也不再只剩一种说法。',
    { local: { faction: 0.04 }, governance: -0.015 },
    '报告中混入了互相抄写的传闻。通信室忙于复查，真正的目击者仍在等待询问。',
    0.62,
  ),
  'bayta-secret': alternative(
    '拆开索引，只保留交叉校验',
    '没有人单独持有全部位置。每一份抄件都应能发现另一份的错误。',
    'shadow',
    {
      foundation: 0.016,
      strategic: { intelligence: 0.1 },
      legacy: { secrecy: 0.1, diplomacy: -0.025 },
    },
    '索引分散保存。抄件互相校验，单一联络点不再能够交出全部线索。',
    { foundation: -0.005, legacy: { secrecy: -0.055 } },
    '交叉索引缺少了一个关键编号。联络者不知道缺口发生在哪一段，搜寻只能暂缓。',
    0.59,
  ),
  channis: alternative(
    '安排可以验证的民用航班',
    '别只布置诱饵。让公开的货单证明这个港口并没有隐藏一支舰队。',
    'commerce',
    { local: { legitimacy: 0.075, prosperity: 0.045 }, legacy: { trade: 0.075, secrecy: -0.035 } },
    '民用货单得到查验。港口摆脱了部分嫌疑，船员开始重新接受普通订单。',
    { local: { prosperity: -0.025 }, legacy: { secrecy: -0.05 } },
    '货单被认为是掩饰。检查扩大到正常商船，联络者不得不停止使用这条线路。',
    0.58,
  ),
  'star-end': alternative(
    '核对旧城的地址变迁',
    '星名会变，学校和档案的迁移记录还在。请当地资料员逐一核对。',
    'knowledge',
    {
      foundation: 0.018,
      local: { education: 0.045 },
      strategic: { intelligence: 0.1 },
      legacy: { trade: 0.035 },
    },
    '旧目录排除了几个错误目的地。资料员保留了尚待核验的地址，没有将猜测写成定论。',
    { foundation: 0.003, local: { pressure: 0.02 } },
    '几个旧地址指向已经不存在的学校。小组带回了副本，却仍无法确认最后的去向。',
    0.61,
  ),
  arcadia: alternative(
    '公开寻人，拒绝交出证词',
    '请民用港口协助接人。她的安全和她提供的信息，必须分开处理。',
    'care',
    { local: { legitimacy: 0.075, openness: 0.06 }, legacy: { diplomacy: 0.09, secrecy: -0.06 } },
    '港口接到了阿卡蒂。她以自己的名字寄出消息，没有被迫先交出证词换取船票。',
    { local: { legitimacy: -0.035 }, legacy: { secrecy: -0.04 } },
    '公开寻人的通告让检查者提前知道了去向。护送队不得不另找一个港口。',
    0.55,
  ),
  palver: alternative(
    '设立可以撤销授权的跨区议会',
    '共同事务交给选出的代表。秘密协作必须定期重新征得授权。',
    'accord',
    {
      foundation: 0.019,
      local: { openness: 0.09, legitimacy: 0.085 },
      legacy: { diplomacy: 0.09, secrecy: -0.06 },
    },
    '议会章程经过表决。协调者保留了工作，也接受了后人可以撤销授权的条款。',
    { local: { faction: 0.05 }, legacy: { diplomacy: -0.035 } },
    '各地没有同意共同的授权期限。临时议会留下了记录，完整章程仍须由下一代继续商议。',
    0.62,
  ),
};

const relationship: Record<
  Approach,
  { label: string; voice: string; effect: StoryEffect; failure: StoryEffect }
> = {
  care: {
    label: '请当年的接收家庭共同担保',
    voice: '把旧的安置名册送去，请曾经接到支援的人自己决定是否帮忙。',
    effect: { local: { legitimacy: 0.07, pressure: -0.055 }, strategic: { supply: 0.1 } },
    failure: { local: { legitimacy: -0.025, pressure: 0.02 } },
  },
  commerce: {
    label: '借用旧商路，分担这次开支',
    voice: '请以前合作的商队议价，不要把新的费用藏进旧合同。',
    effect: {
      treasury: 0.025,
      strategic: { trade: 0.12 },
      local: { prosperity: 0.055, elites: 0.02 },
    },
    failure: { treasury: -0.012, local: { prosperity: -0.02 } },
  },
  accord: {
    label: '请旧协定的签署者来调停',
    voice: '把以前共同签过的条款带来。新的安排也要让对方重新答应。',
    effect: { local: { faction: -0.09, legitimacy: 0.075 }, legacy: { diplomacy: 0.055 } },
    failure: { local: { faction: 0.04 }, legacy: { diplomacy: -0.025 } },
  },
  force: {
    label: '请原有守备队协助交接',
    voice: '请曾执行命令的队伍出面，但这一次先列清楚撤回的期限。',
    effect: {
      local: { garrison: 0.1, faction: -0.04, legitimacy: -0.02 },
      strategic: { supply: 0.08 },
    },
    failure: { local: { faction: 0.055, legitimacy: -0.03 } },
  },
  knowledge: {
    label: '请以前的学徒提供办法',
    voice: '不要再只向他们发设备。把问题送去，听听他们学会之后的回答。',
    effect: { foundation: 0.01, local: { education: 0.065, prosperity: 0.04 } },
    failure: { local: { legitimacy: -0.02 }, foundation: 0.002 },
  },
  shadow: {
    label: '启用保留下来的联络人',
    voice: '只告诉联络人必须知道的部分。不要让一封回信暴露整张名单。',
    effect: { governance: 0.03, strategic: { intelligence: 0.14 }, legacy: { secrecy: 0.045 } },
    failure: { local: { faction: 0.04 }, legacy: { secrecy: -0.065 } },
  },
  restraint: {
    label: '请此前自行办事的地方共同处理',
    voice: '以前没有替他们作主，这一次也请他们自己提出能够接受的条件。',
    effect: {
      local: { legitimacy: 0.05, openness: 0.055 },
      strategic: { autonomy: 0.08 },
      legacy: { diplomacy: 0.035 },
    },
    failure: { local: { faction: 0.035, legitimacy: -0.02 } },
  },
};

function previousDecision(s: State, event: StoryEvent): DecisionRecord | undefined {
  const wanted = new Set(event.choices.map((c, i) => c.approach ?? route[event.id]?.[i]));
  return s.decisions?.history
    .filter((r) => r.turn <= s.turn && s.turn - r.turn <= 9)
    .map((r) => ({
      r,
      rank: (r.target === event.target ? 5 : 0) + (wanted.has(r.approach) ? 3 : 0) + r.turn / 30,
    }))
    .sort((a, b) => b.rank - a.rank)[0]?.r;
}

function rememberedOption(world: World, record: DecisionRecord, s: State): StoryChoice {
  const relation = relationship[record.approach];
  const displaced = s.phase[record.target] === 3;
  return response(
    'recall',
    record.success ? relation.label : '重新召集那次未能合作的人',
    record.success
      ? relation.voice
      : `把“${record.label}”那次未办成的原因一起带去。这回先让对方说出条件。`,
    record.approach,
    relation.effect,
    `${world.names[record.target]}的${displaced ? '旧联系人' : '联系人'}答应了新的安排。对方提起“${record.label}”，要求这一回仍把往来记在同一份卷宗里。`,
    {
      chance: record.success ? 0.7 : 0.5,
      failure: relation.failure,
      failureResult: `${world.names[record.target]}的联系人没有接受新的条件。旧事被重新提起，双方却没有因为认识得更久就自动达成一致。`,
    },
  );
}

type EchoResponse = readonly [label: string, voice: string, result: string];
const ECHO_RESPONSES: Record<
  Approach,
  readonly [EchoResponse, EchoResponse, EchoResponse, EchoResponse]
> = {
  care: [
    [
      '共同登记接收资格与土地使用权',
      '把新来的家庭和原有居民都请到场。已经答应的条件不能只留在营地门口。',
      '接收名册与土地登记得到共同确认。新的家庭有了能够查询的条目，旧居民也留下了需要继续办理的申请。',
    ],
    [
      '让工坊与家庭分担接收',
      '把住房、岗位和担保分别列清。不要再让一位营地负责人包办所有承诺。',
      '工坊与接收家庭签了新的担保。申请人知道可以向谁询问工作与住处，不必再只在同一个窗口等待。',
    ],
    [
      '允许街区自行处理新的申请',
      '保留公开申诉，名单怎么改，请居民留下自己的会议记录。',
      '街区接手了新的申请。条件不再由一个办事员独自解释，居民也要面对彼此不同的要求。',
    ],
    [
      '让接收街区轮流派出代表',
      '代表不能只来自最早登记的家庭。任期结束后重新选出经办人。',
      '街区完成了代表交接。旧申请随名册移交，新来的人也能参与下一轮讨论。',
    ],
  ],
  commerce: [
    [
      '公开审查商会的独占条款',
      '把旧合同拿出来，工坊和船主都要能说明当年究竟答应了什么。',
      '合同经过公开核对。商会保留了已经确认的订单，也接受了不再独占所有船位的条款。',
    ],
    [
      '给合作工坊一份新的维修订单',
      '先交付一批双方都能检验的零件，未结的旧账也要单独列出。',
      '维修订单开始交付。工坊与商船有了能够逐批确认的往来，旧欠款没有被藏进新货单。',
    ],
    [
      '不再自动延长独家合同',
      '现有货单照约办理，下一批订单由各家自己谈，不替任何一家继续背书。',
      '独家合同没有自动续期。商会仍有客户，工坊也开始询问别处的买家，新的争议留给了下一次议价。',
    ],
    [
      '轮换港务会议中的货运席位',
      '小工坊也要有一次发言的船期。每届重新核定席位，不让旧订单永久决定谁能说话。',
      '货运席位完成轮换。原商会交出了部分排期权，也将尚未交货的清单交给新代表核对。',
    ],
  ],
  accord: [
    [
      '把代表更替程序写进协定',
      '新代表可以提出修改，但不能只凭换届就撤掉此前已经签收的职责。',
      '协定补上了代表更替的程序。各方仍可提出异议，但需要共同确认哪些条款正在生效。',
    ],
    [
      '先共同管理一处民用中转站',
      '把争议留在会议记录里，先试办一件能够按期交付的共同事务。',
      '中转站开始共同接收民用货物。双方逐项核对交付，没有把合作视为放弃其他尚未谈妥的条件。',
    ],
    [
      '保留各地不同的执行办法',
      '共同条款以外的事由地方自己定，改过的版本都要公开留底。',
      '地方获得了修订余地。统一章程没有覆盖全部事务，不同解释也被留在了可查询的记录中。',
    ],
    [
      '由各地轮任共同议事主持人',
      '不要再让当年的签约人永久主持。每一届都让其他地方有机会提出议程。',
      '共同会议完成了轮任。新主持人接到了未办结的事项，也必须接受其他代表提出议程。',
    ],
  ],
  force: [
    [
      '公开审查临时守备的授权',
      '请军民双方核对命令，哪些已经到期、哪些仍有依据，都要给出署名答复。',
      '守备授权经过共同核对。到期的临时措施列入交接，仍需保留的职责也有了可查询的期限。',
    ],
    [
      '先修复民用中转站的交接',
      '军需和居民的货单分开核对。撤军不该把正常航次也一并留在待办栏里。',
      '民用中转开始交接。港务员能单独确认居民物资，不必再等整支守备队的全部账目结清。',
    ],
    [
      '同意地方逐步收回临时管理权',
      '把实际接管的日期寄来。共同监督留下，但不再用旧授权无限拖延交接。',
      '地方开始接收临时管理事务。驻军仍有未结的交付，民用部门却不必继续等待同一枚军用印章。',
    ],
    [
      '限定守备期限，交还民用港务',
      '留下的是明确的期限，不是又一份可以无限延长的临时命令。',
      '守备安排补上了交接期限。民用港务归还地方，新的负责人接过了尚待核对的货单。',
    ],
  ],
  knowledge: [
    [
      '让学校共同签署修订规则',
      '教师和资料员都要参与。可以改图纸，也必须让下一位使用者看得出改过哪里。',
      '学校共同确认了修订规则。新图纸保留了版本，旧实验的失败记录没有被丢进废纸箱。',
    ],
    [
      '先让学校共同检验',
      '索引和图纸一起送去，没有通过检验的不能直接交付。',
      '学校交换了检验记录。教师留下了可以复现的方法，也标出仍不能确认的部分。',
    ],
    [
      '允许各校保留自己的副本',
      '不必先把所有材料收回端点星。改过的索引要能让其他学校查到。',
      '各校保留了副本。目录没有被收进唯一的柜子，资料员也必须继续协调不同学校的版本。',
    ],
    [
      '由不同学校轮任核验小组',
      '校验职责不能一直留在最早的委员会。下一届请新的教师参与。',
      '核验小组完成交接。新教师接过了目录，也接到了那些尚未通过复查的图纸。',
    ],
  ],
  shadow: [
    [
      '让独立小组核验联络授权',
      '可以不公开姓名，但谁有权提出建议，不能只靠上一位联络人一句保证。',
      '新的授权经过独立核验。联络者继续工作，却不能仅凭匿名信件要求公开部门执行命令。',
    ],
    [
      '请商队提供独立通信渠道',
      '通信另走一条民用线路。货单照常留底，不将船员当成无需知情的掩护。',
      '商队接受了新的通信安排。联络不再集中在同一地址，船员也知道哪一批信需要另行签收。',
    ],
    [
      '由各地自行审查收到的建议',
      '暂不设一位总联络人。只有当地核验过的事项才交付执行。',
      '各地接手了建议核验。联络名单没有立即合并，地方部门也承担了更多解释和复查的工作。',
    ],
    [
      '轮换联络职责，保留独立签收',
      '旧联系人可以退下，交接不能只换一个名字。每一段职责都要有人分别确认。',
      '联络职责完成轮换。旧地址停止接收新命令，独立签收记录仍可核验交接。',
    ],
  ],
  restraint: [
    [
      '正式承认地方的议事程序',
      '他们已经开过会议，就先核对纪要。不要要求所有人从第一份请示重新开始。',
      '地方议事程序得到承认。纪要与反对意见一起归档，新的代表知道哪些安排已经办理。',
    ],
    [
      '连接已经成立的地方合作项目',
      '请各地自己提出可共同交付的事项，川陀先承担一部分接洽费用。',
      '地方项目开始交换订单。共同交付有了经办人，原有的不同办法没有被一道新命令抹掉。',
    ],
    [
      '只要求公开地方会议记录',
      '不再替地方排全部次序。不同的意见也应随纪要寄来。',
      '地方保留了安排事务的权力。议事记录开始送往公共档案，居民仍需要自行协调分歧。',
    ],
    [
      '请地方轮流主持跨区协商',
      '把提出议程的机会交给不同地方。主持权不必永远跟着川陀的回信走。',
      '跨区协商采用了轮任。地方代表有了提出共同事项的机会，也接下了需要向别人答复的职责。',
    ],
  ],
};

const REOPEN: Record<Approach, string> = {
  care: '重查接收资格与旧申请',
  commerce: '公开核对未结清的货单',
  accord: '重新确认两份未签完的纪要',
  force: '公开调查失效的守备授权',
  knowledge: '重新核对遗漏的资料编号',
  shadow: '独立核验被截获的通信',
  restraint: '补发地方未收到的正式答复',
};
const RETRY: Record<Approach, readonly [string, string]> = {
  care: ['先由一个街区重新接收', '只接下能够签收的名额，不再先贴出一张没有人负责的名单。'],
  commerce: ['从一批小额维修订单重新试行', '规格与交货逐件核对，不再用下一批订单遮住上一笔欠款。'],
  accord: [
    '先试行一条双方都签字的条款',
    '没有共同签字的仍留在争议栏，不强行宣称整份协定已经生效。',
  ],
  force: ['先在一个民用港口完成交接', '先确认能真正移交的设备，再讨论扩大到其他驻地。'],
  knowledge: [
    '先核验一组能够复现的图纸',
    '没有核对过的编号暂不继续转寄。先让教师实际做出一件能够使用的设备。',
  ],
  shadow: [
    '只核验一段索引，暂停整网联络',
    '不要重新接通全部旧地址。先确认其中一份抄件没有被改过。',
  ],
  restraint: ['先确认一项地方已经办完的事务', '核对确实收到的答复，再决定是否恢复共同办理。'],
};

function followup(world: World, s: State, record: DecisionRecord, seed: string): StoryEvent {
  const original = world.names[record.target];
  const displaced = s.phase[record.target] === 3;
  const target = displaced ? s.phase.findIndex((p) => p < 3) : record.target;
  const location = target < 0 ? world.terminus : target;
  const variants = stream(seed, `letter-scene:${s.turn}:${record.turn}`).int(2);
  const place = displaced ? `从${original}迁出的联系人` : `${original}的联系人`;
  const intro = `银河纪元 ${12067 + (record.turn - 1) * 10}，你对“${record.title}”的回复是“${record.label}”。${record.success ? '当时的安排办成了。' : '当时的安排没能办成。'}如今，${place}又寄来一封信。`;
  const scenes: Record<Approach, readonly [string, string, string, string]> = {
    care: [
      '粮仓之外的争执',
      '等候回信的街区',
      variants
        ? '接收站询问，已经搬出去的家庭是否仍有资格领用公共物资。原来的居民要求优先补齐学校和医疗名额，管理者不愿独自决定谁可以继续留下。'
        : '当年的安置名册已经换过一位负责人。新的申请人要求采用同样的条件，原有的担保家庭却说，他们也还在等一份正式的土地证明。',
      '旧的申请没有从名册上消失。街区代表将当年的通告附在信后，要求你先说明哪些承诺仍然有效，再讨论是否接受新的安排。',
    ],
    commerce: [
      '账本之外的席位',
      '违约之后的商队',
      variants
        ? '商人愿意继续接单，但他们要求在港务会议中拥有席位。小工坊担心大商会把船位全部拿走，提出轮流使用仓库。'
        : '一批依靠旧商路成长的工坊准备自行签约。商会要求继续独家销售，工坊则认为培训期结束后就不该再被限制。',
      '几艘船还留着上一批未结清的货单。船主不肯再只凭一封公文启航，要求新的合同写清谁承担延误，又由谁确认交货。',
    ],
    accord: [
      '协定之后，谁来解释',
      '没有签完的那份协定',
      variants
        ? '旧条约解决了当年的争端，却没有写明新一届代表如何接替。两方都承认签名的有效性，也都认为自己的解释应当成为惯例。'
        : '地方代表要求把临时协定改成长期章程。反对者担心川陀在下一次争议中收回承诺，要求先把撤销条件写出来。',
      '上次会议的两份纪要仍互相矛盾。地方愿意重新谈判，但拒绝先接受旧委员会的解释，新来的代表要求亲自参加。',
    ],
    force: [
      '留下来的守备队',
      '命令之后的问责',
      '原有的守备安排仍有人记得。地方询问，临时措施何时撤回；队伍的负责人则要求保证交接之后，日常补给不会中断。',
      '执行过命令的队伍提交了新的名单，地方代表同时要求问责。双方都说自己在上次行动中承受了损失，不愿再接下一道含糊的命令。',
    ],
    knowledge: [
      '学徒寄回了自己的图纸',
      '目录里空着的一栏',
      variants
        ? '当年的学徒已经能独立检验设备。他们寄来改过的图纸，请求开放使用；原来的委员会认为修改必须先送回端点星批准。'
        : '学校寄来一份新的课程表。教师希望把保管的副本交给邻区使用，文库负责人担心索引分散之后，再也查不清谁改过哪一页。',
      '资料员找到了上次遗漏的编号。他们愿意再做一轮核验，但需要学校和运输部门共同确认，不能再用已经失效的地址寄送资料。',
    ],
    shadow: [
      '联络人换了一个名字',
      '被识破的通信',
      '旧联络者准备退休，希望把职责交给另一人。无人知道新名字是否可信，公开部门也开始追问这些建议究竟由谁签署。',
      '一封曾经用过的通信被人截获。联络者要求切断旧地址，也有人主张公开核对信件，免得无关的学校和港口一并受到怀疑。',
    ],
    restraint: [
      '没有川陀命令的会议',
      '迟来的地方答复',
      variants
        ? '地方按自己的办法处理了一些事务，现在要求川陀正式承认这套程序。另一些居民则要求恢复共同监督，认为未经讨论的惯例也可能不公。'
        : '当地没有等新的命令，自己召开了会议。秘书寄来纪要，请你决定是否接受已经作出的安排，而不是重新从第一封请示谈起。',
      '地方要求重新确认川陀是否仍愿意参与。代表不愿把沉默理解为永久的放弃，也不愿让迟到的命令抹去已经作过的安排。',
    ],
  };
  const scene = scenes[record.approach];
  const replies = ECHO_RESPONSES[record.approach];
  const aid = response(
    'aid',
    record.success ? replies[0][0] : REOPEN[record.approach],
    record.success ? replies[0][1] : '先听经办人和受影响的人分别说完，不急着替旧决定辩解。',
    'accord',
    { local: { legitimacy: 0.08, faction: -0.06, openness: 0.05 }, legacy: { diplomacy: 0.055 } },
    replies[0][2],
    {
      cost: { influence: 1 },
      chance: 0.7,
      failure: { local: { faction: 0.04 } },
      failureResult:
        '公开会议没能形成共同文本。各方留下了自己的说明，下一届代表还得面对这份未签完的文件。',
    },
  );
  const bargain = response(
    'bargain',
    replies[1][0],
    replies[1][1],
    record.approach === 'knowledge' ? 'knowledge' : 'commerce',
    {
      local: { prosperity: 0.065, education: 0.035 },
      strategic: { trade: 0.09 },
      legacy: { trade: 0.05 },
    },
    replies[1][2],
    { cost: { treasury: 0.018 } },
  );
  const defer = response(
    'defer',
    record.success ? replies[2][0] : '停止旧项目，公开未完成清单',
    record.success ? replies[2][1] : '不再追加同一份承诺。未办成的事项不能被记成已经结案。',
    'restraint',
    {
      local: { openness: 0.06, faction: 0.025 },
      strategic: { autonomy: 0.07 },
      legacy: { secrecy: -0.025 },
    },
    record.success
      ? replies[2][2]
      : '地方收到了停止旧项目的答复。未完成的事项单独留下，经办人不能再将它们记作已经签收。',
  );
  const fourth = record.success
    ? alternative(
        replies[3][0],
        replies[3][1],
        'accord',
        {
          local: { legitimacy: 0.065, elites: -0.04 },
          strategic: { autonomy: 0.1 },
          governance: 0.02,
        },
        replies[3][2],
        { local: { faction: 0.055 }, strategic: { supply: -0.025 } },
        '轮任名单遭到抵制。交接停在两份没有共同签字的名册之间。',
        0.59,
      )
    : alternative(
        RETRY[record.approach][0],
        RETRY[record.approach][1],
        record.approach === 'shadow' ? 'knowledge' : record.approach,
        {
          local: { legitimacy: 0.045, prosperity: 0.045 },
          foundation: 0.006,
          strategic: { supply: 0.065 },
        },
        '小规模试行留下了可以核验的交付。代表同意据此讨论下一批安排，而不是再重复上一封保证。',
        { local: { legitimacy: -0.025, pressure: 0.025 } },
        '试行项目也没能按约交付。旧申请人要求暂停新的募集，先把已经领用的物资查清。',
        0.54,
      );
  return {
    id: `echo-${record.turn}-${record.approach}`,
    title: scene[record.success ? 0 : 1],
    sender: `${original} · ${record.success ? '原协作代表' : '未结案事务处'}`,
    target: location,
    location: world.names[location],
    body:
      intro +
      scene[record.success ? 2 : 3] +
      (displaced
        ? `原星区已经脱离帝国，这封来信经由${world.names[location]}转交，旧的管辖权不能再作为命令的依据。`
        : ''),
    why: '这封来信来自已经作出的决定，办理结果会留下新的后续。',
    choices: [aid, bargain, defer, fourth],
    echo: record,
    revisits: record.turn,
  };
}

function exileLetter(world: World, s: State): StoryEvent {
  return {
    id: 'exile-ledger',
    title: '边界之外的收信地址',
    sender: '端点星 · 迁徙资料员',
    target: world.terminus,
    location: world.names[world.terminus],
    body: '原有的星区都已脱离帝国。资料员仍收到来自学校和民用港口的信，询问旧的目录还能否借用。你不能命令这些世界恢复原来的管辖关系，但仍可以决定如何保存、交换手中的知识。',
    why: '独立不可逆；只能继续安排公开知识与协作。',
    choices: [
      response(
        'aid',
        '将副本交给民用学校',
        '公开目录，让愿意接收的人自行抄录。',
        'knowledge',
        { foundation: 0.012, legacy: { secrecy: -0.04 } },
        '民用学校接到了公开副本。旧税务关系没有恢复，书卷却找到了新的读者。',
      ),
      response(
        'bargain',
        '通过商队交换缺失的资料',
        '不用旧军令换通行。按对方认可的条件交易。',
        'commerce',
        { foundation: 0.006, treasury: 0.012, legacy: { trade: 0.04 } },
        '商队带回了一批资料。新的交换不再以帝国名义签署。',
      ),
      response(
        'defer',
        '只维护现有文库',
        '暂不扩张，先把留下的目录逐页核对。',
        'restraint',
        { foundation: 0.004 },
        '资料员继续维护文库。旧边界没有改变，已经保存的内容仍在。',
      ),
      alternative(
        '分散寄存，保留交叉索引',
        '让不同学校保管不同书卷，仍能彼此核验。',
        'shadow',
        { foundation: 0.017, legacy: { secrecy: 0.06 } },
        '几所学校接受了寄存。目录没有合并到一处，书卷的去向仍可核验。',
        { foundation: -0.003 },
        '一批寄存件没有得到回执。资料员保留了寄送记录，没有将缺失的书卷登记为完好。',
        0.63,
      ),
    ],
    echo: s.decisions?.history.at(-1),
  };
}

/** Only observed history chooses branches. Named streams never consume the live simulation RNG. */
export function evolvingEvent(
  world: World,
  s: State,
  base: StoryEvent | null,
  seed: string,
): StoryEvent {
  const history = s.decisions?.history ?? [];
  const signature = history
    .slice(-6)
    .map((r) => `${r.event}:${r.choice}:${+r.success}`)
    .join('/');
  const rng = stream(seed, `letters-v1:${s.turn}:${signature}`);
  const eligible = history.filter(
    (r) => r.due <= s.turn && r.revisited === undefined && s.turn - r.turn <= 8,
  );
  let event = base;
  if (!base?.source && eligible.length && rng.uniform() < 0.68) {
    const weights = eligible.map(
      (r) =>
        (r.success ? 1 : 1.6) *
        (r.target === base?.target ? 1.5 : 1) *
        (1 + (s.turn - r.due) * 0.2),
    );
    let draw = rng.uniform() * weights.reduce((a, b) => a + b, 0);
    let picked = eligible.at(-1)!;
    for (let i = 0; i < eligible.length; i++) {
      draw -= weights[i];
      if (draw <= 0) {
        picked = eligible[i];
        break;
      }
    }
    event = followup(world, s, picked, seed);
  }
  event ??= exileLetter(world, s);
  const choices: StoryChoice[] = event.choices.map((c, i) => ({
    ...c,
    approach: c.approach ?? route[event.id]?.[i] ?? 'restraint',
    voice: c.voice ?? voices[event.id]?.[i],
  }));
  if (choices.length < 4) {
    const fourth = alternatives[event.id];
    if (!fourth) throw new Error(`来信缺少第四种回应：${event.id}`);
    choices.push({ ...fourth });
  }
  const prior = event.echo ?? previousDecision(s, { ...event, choices });
  if (prior) choices.push(rememberedOption(world, prior, s));
  const context =
    prior && !event.echo
      ? `秘书另附上一封旧信：在银河纪元 ${12067 + (prior.turn - 1) * 10}，你曾对“${prior.title}”选择“${prior.label}”。${prior.success ? `${world.names[prior.target]}的协作联系人仍可联系，但新的帮助需要重新商议。` : '那次安排没有办成，经办人要求这一次先查清旧条件，再作承诺。'}`
      : '';
  return { ...event, choices, echo: prior, body: event.body + context };
}

export function historyFactors(
  s: State,
  event: StoryEvent,
  option: StoryChoice,
): { label: string; value: number }[] {
  if (!option.approach || !s.decisions) return [];
  const relevant = s.decisions.history.filter(
    (r) => r.approach === option.approach && s.turn - r.turn <= 9,
  );
  if (!relevant.length) return [];
  const value = relevant.reduce(
    (v, r) =>
      v +
      (r.success ? 0.15 : -0.19) *
        (r.target === event.target ? 1.4 : 1) *
        Math.pow(0.85, s.turn - r.turn),
    0,
  );
  return [{ label: '此前同类协作的信誉', value: clamp(value, -0.5, 0.5) }];
}

export function rememberDecision(
  world: World,
  s: State,
  event: StoryEvent,
  option: StoryChoice,
  success: boolean,
) {
  if (!s.decisions || !option.approach) return;
  if (event.revisits !== undefined) {
    const origin = s.decisions.history.find((r) => r.turn === event.revisits);
    if (origin) origin.revisited = s.turn + 1;
  }
  const turn = s.turn + 1;
  s.decisions.history.push({
    turn,
    event: event.id,
    title: event.title,
    target: event.target,
    choice: option.id,
    label: option.label,
    approach: option.approach,
    success,
    due: turn + 1 + (hashSeed(`${world.seed}:${turn}:${event.id}:${option.id}:${success}`) % 3),
  });
  s.decisions.history = s.decisions.history.slice(-30);
}
