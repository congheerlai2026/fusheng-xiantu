// ============================================================
//  《浮生仙途》仙侠世界数据
//  Xianxia World Data Module
// ============================================================

// ---- 修炼境界体系 ----
const REALMS = [
  { name: "炼气期", level: 1, desc: "初引灵气入体，周身如浸温泉，指尖微麻，寿元延至百二", maxQi: 100,     breakthroughDiff: 0.2  },
  { name: "筑基期", level: 2, desc: "灵力由气态凝为液，丹田蓄起一汪清泉，举手生风，寿元至两百", maxQi: 300,     breakthroughDiff: 0.35 },
  { name: "金丹期", level: 3, desc: "灵力压缩成丹，丹田一点如落日悬照，可御器凌空，寿元五百",   maxQi: 800,     breakthroughDiff: 0.5  },
  { name: "元婴期", level: 4, desc: "元婴坐镇泥丸，神识外放如涟漪扩散，可夺天地之威，寿元至千载",     maxQi: 2000,    breakthroughDiff: 0.65 },
  { name: "化神期", level: 5, desc: "神念化虚，一念动则风云随形，寿元两千",   maxQi: 5000,    breakthroughDiff: 0.78 },
  { name: "炼虚期", level: 6, desc: "肉身渐融天地，吐纳皆引动灵潮，寿元五千",       maxQi: 12000,   breakthroughDiff: 0.88 },
  { name: "合体期", level: 7, desc: "天人如合，法力如海无边，寿元万载",       maxQi: 30000,   breakthroughDiff: 0.94 },
  { name: "渡劫期", level: 8, desc: "天劫将至，每道雷都是生死关，紫电灌体时痛彻神魂，寿元两万",       maxQi: 80000,   breakthroughDiff: 0.98 },
  { name: "大乘期", level: 9, desc: "半步飞升，道韵自成，吐息皆含法则，寿元五万",       maxQi: 200000,  breakthroughDiff: 0.99 },
  { name: "飞升期", level: 10,desc: "白日飞升，肉身化圣，超脱轮回",       maxQi: Infinity,breakthroughDiff: 1.0  },
];

// ---- 突破基础成功率（随境界递减：新手易、老手难）----
// 键 = 正在冲击的境界 level（2=炼气→筑基 … 10=大乘→飞升）
// 设计原则：早期高、后期低，契合"难度随幕递增"。
const BREAKTHROUGH_BASE = { 2: 0.85, 3: 0.75, 4: 0.62, 5: 0.50, 6: 0.40, 7: 0.32, 8: 0.25, 9: 0.15, 10: 0.06 };

// ---- 五行灵根 ----
const SPIRITUAL_ROOTS = [
  { name: "金灵根", element: "金", desc: "锋锐刚猛，善攻伐，剑修之根",       affinity: { 攻击: 1.3, 防御: 1.0, 修炼: 1.0 } },
  { name: "木灵根", element: "木", desc: "生生不息，善疗愈炼丹，寿元绵长",   affinity: { 攻击: 0.9, 防御: 1.1, 修炼: 1.2 } },
  { name: "水灵根", element: "水", desc: "至柔至变，善幻术神通，灵动飘逸",   affinity: { 攻击: 1.0, 防御: 1.1, 修炼: 1.05} },
  { name: "火灵根", element: "火", desc: "霸道炽烈，善焚天炼器，攻伐无双",   affinity: { 攻击: 1.35,防御: 0.85,修炼: 0.95} },
  { name: "土灵根", element: "土", desc: "厚重如山，善阵法防御，根基稳固",   affinity: { 攻击: 0.95,防御: 1.3, 修炼: 1.05} },
  { name: "雷灵根", element: "雷", desc: "天威煌煌，至刚至速，万中无一",     affinity: { 攻击: 1.4, 防御: 0.9, 修炼: 1.1 }, rare: true },
  { name: "冰灵根", element: "冰", desc: "至寒至寂，善封印控场，杀伐暗藏",   affinity: { 攻击: 1.15,防御: 1.15,修炼: 1.0 }, rare: true },
  { name: "混沌灵根", element: "混沌", desc: "五行俱全，万法皆通，亿中无一", affinity: { 攻击: 1.2, 防御: 1.2, 修炼: 1.3 }, rare: true },
];

// ---- 诸天万界·修炼体系（每界独有之"方言"）----
// 核心皆为"天地灵力"的契合；但不同世界以不同名相称其修行之基。
// 灵根只是其中之一；血脉、命格、道种、元素亲和、灵枢等皆可为本界体系。
// 每个体系自带一套"资质/特质"列表（traits），供角色生成时抽取。
const CULTIVATION_SYSTEMS = [
  {
    id: "lingen",
    name: "灵根",
    desc: "以先天灵根引动天地灵气，五行及变异灵根为修行之基。",
    traits: SPIRITUAL_ROOTS,
  },
  {
    id: "xuema",
    name: "血脉",
    desc: "以血脉承袭先祖之力，觉醒血脉者天赋异禀，然血脉有纯净驳杂之分。",
    traits: [
      { name: "真龙血脉", element: "龙", desc: "承上古真龙之血，肉身强横，威压天生", affinity: { 攻击: 1.35, 防御: 1.2, 修炼: 1.0 }, rare: true },
      { name: "凤凰血脉", element: "凰", desc: "浴火重生，神识与治愈之力卓绝", affinity: { 攻击: 1.1, 防御: 1.0, 修炼: 1.25 }, rare: true },
      { name: "玄武血脉", element: "龟", desc: "负天之壳，防御与寿元冠绝", affinity: { 攻击: 0.9, 防御: 1.5, 修炼: 1.05 } },
      { name: "朱雀血脉", element: "雀", desc: "焚天之炎，攻伐凌厉", affinity: { 攻击: 1.4, 防御: 0.9, 修炼: 1.0 }, rare: true },
      { name: "白虎血脉", element: "虎", desc: "杀伐之主，战意磅礴", affinity: { 攻击: 1.45, 防御: 1.0, 修炼: 0.95 } },
      { name: "麒麟血脉", element: "麟", desc: "祥瑞之兽，全才而均衡", affinity: { 攻击: 1.1, 防御: 1.1, 修炼: 1.2 }, rare: true },
      { name: "凡血之躯", element: "凡", desc: "无显赫血脉，唯仗自身苦修", affinity: { 攻击: 1.0, 防御: 1.0, 修炼: 1.0 } },
      { name: "混血杂裔", element: "混", desc: "数脉交杂，资质驳而不纯，变数亦大", affinity: { 攻击: 1.05, 防御: 1.05, 修炼: 1.05 } },
    ],
  },
  {
    id: "mingge",
    name: "命格",
    desc: "以先天命格定修行之途，星盘落处，命数迥异。",
    traits: [
      { name: "紫微命", element: "帝", desc: "紫微临命，领袖之格，气运昌隆", affinity: { 攻击: 1.05, 防御: 1.1, 修炼: 1.2 }, rare: true },
      { name: "贪狼命", element: "桃花", desc: "贪狼入命，机智权变，桃花与机缘并随", affinity: { 攻击: 1.15, 防御: 0.95, 修炼: 1.15 } },
      { name: "七杀命", element: "杀", desc: "七杀在命，杀伐决断，攻战无前", affinity: { 攻击: 1.4, 防御: 0.95, 修炼: 0.95 } },
      { name: "破军命", element: "破", desc: "破军在命，破旧立新，敢为天下先", affinity: { 攻击: 1.2, 防御: 1.0, 修炼: 1.1 } },
      { name: "天机命", element: "机", desc: "天机深藏，推演如神，悟性超群", affinity: { 攻击: 0.95, 防御: 1.05, 修炼: 1.35 }, rare: true },
      { name: "孤辰命", element: "孤", desc: "孤辰照命，独立独行，少助亦少累", affinity: { 攻击: 1.1, 防御: 1.1, 修炼: 1.05 } },
      { name: "福德命", element: "福", desc: "福德护身，逢凶化吉，安稳修行", affinity: { 攻击: 0.95, 防御: 1.15, 修炼: 1.1 } },
      { name: "平凡命", element: "常", desc: "命格平平，全凭自身造化", affinity: { 攻击: 1.0, 防御: 1.0, 修炼: 1.0 } },
    ],
  },
  {
    id: "daozhong",
    name: "道种",
    desc: "以一道为种，种于心田，专精制胜，万法归一道途。",
    traits: [
      { name: "剑种", element: "剑", desc: "剑心种下，一剑光寒十九洲", affinity: { 攻击: 1.45, 防御: 0.9, 修炼: 1.05 } },
      { name: "丹种", element: "丹", desc: "丹道为种，炼丹通神", affinity: { 攻击: 0.9, 防御: 1.05, 修炼: 1.3 } },
      { name: "阵种", element: "阵", desc: "阵法为种，困敌于方寸", affinity: { 攻击: 1.0, 防御: 1.4, 修炼: 1.0 } },
      { name: "符种", element: "符", desc: "符箓为种，万符听令", affinity: { 攻击: 1.2, 防御: 1.1, 修炼: 1.05 } },
      { name: "器种", element: "器", desc: "器道为种，炼器成圣", affinity: { 攻击: 1.25, 防御: 1.15, 修炼: 1.0 } },
      { name: "情种", element: "情", desc: "以情入道，至情至性", affinity: { 攻击: 0.95, 防御: 1.0, 修炼: 1.25 } },
      { name: "杀种", element: "杀", desc: "杀伐证道，以战养战", affinity: { 攻击: 1.5, 防御: 0.85, 修炼: 0.95 } },
      { name: "无名种", element: "无", desc: "道种未明，尚需自觅其途", affinity: { 攻击: 1.0, 防御: 1.0, 修炼: 1.0 } },
    ],
  },
  {
    id: "yuansu",
    name: "元素亲和",
    desc: "以对天地元素的先天亲和力修行，元素即是道。",
    traits: [
      { name: "炎之亲和", element: "炎", desc: "炽炎为引，焚尽诸邪", affinity: { 攻击: 1.4, 防御: 0.9, 修炼: 1.05 } },
      { name: "霜之亲和", element: "霜", desc: "寒霜为引，封敌于瞬", affinity: { 攻击: 1.1, 防御: 1.2, 修炼: 1.05 } },
      { name: "雷之亲和", element: "雷", desc: "雷霆为引，至速至刚", affinity: { 攻击: 1.45, 防御: 0.9, 修炼: 1.1 }, rare: true },
      { name: "风之亲和", element: "风", desc: "长风为引，飘忽难测", affinity: { 攻击: 1.2, 防御: 1.0, 修炼: 1.1 } },
      { name: "岩之亲和", element: "岩", desc: "厚土为引，坚不可摧", affinity: { 攻击: 0.95, 防御: 1.45, 修炼: 1.0 } },
      { name: "光之亲和", element: "光", desc: "光明为引，普照涤秽", affinity: { 攻击: 1.1, 防御: 1.1, 修炼: 1.2 } },
      { name: "暗之亲和", element: "暗", desc: "幽暗为引，诡谲莫测", affinity: { 攻击: 1.3, 防御: 1.0, 修炼: 1.05 } },
      { name: "均衡亲和", element: "均", desc: "诸元素无偏，平稳前行", affinity: { 攻击: 1.0, 防御: 1.0, 修炼: 1.0 } },
    ],
  },
  {
    id: "lingshu",
    name: "灵枢",
    desc: "以灵枢共鸣天地机括，器与灵合，别开生面。",
    traits: [
      { name: "金枢", element: "金", desc: "灵枢属金，锋锐无匹", affinity: { 攻击: 1.35, 防御: 1.0, 修炼: 1.0 } },
      { name: "木枢", element: "木", desc: "灵枢属木，生生不息", affinity: { 攻击: 0.9, 防御: 1.1, 修炼: 1.2 } },
      { name: "水枢", element: "水", desc: "灵枢属水，至柔化刚", affinity: { 攻击: 1.0, 防御: 1.1, 修炼: 1.05 } },
      { name: "火枢", element: "火", desc: "灵枢属火，熯天炽地", affinity: { 攻击: 1.35, 防御: 0.85, 修炼: 0.95 } },
      { name: "土枢", element: "土", desc: "灵枢属土，厚重如山", affinity: { 攻击: 0.95, 防御: 1.3, 修炼: 1.05 } },
      { name: "星枢", element: "星", desc: "灵枢应星，玄妙难测", affinity: { 攻击: 1.1, 防御: 1.1, 修炼: 1.2 }, rare: true },
      { name: "虚枢", element: "虚", desc: "灵枢入虚，虚实相生", affinity: { 攻击: 1.15, 防御: 1.05, 修炼: 1.15 } },
      { name: "浑枢", element: "浑", desc: "灵枢未分，浑然一体", affinity: { 攻击: 1.0, 防御: 1.0, 修炼: 1.0 } },
    ],
  },
];

// ---- 功法神通 ----
const TECHNIQUES = {
  // 基础功法（新手）
  basic: [
    { name: "吐纳诀",   type: "修炼", realm_req: 1, desc: "最基础的引气法门，缓慢而稳",           effect: { 修炼速度: 1.0 } },
    { name: "五行归元功", type: "修炼", realm_req: 1, desc: "调和五行灵气，万法归一",             effect: { 修炼速度: 1.15 } },
    { name: "金光咒",   type: "防御", realm_req: 1, desc: "口诵金光神咒，身泛金光可御外邪",       effect: { 防御: 1.2 } },
  ],
  // 进阶功法
  intermediate: [
    { name: "太乙炼丹术", type: "炼丹", realm_req: 2, desc: "太乙门秘传丹方，可炼制中品丹药",     effect: { 炼丹: 1.3 } },
    { name: "玄天剑诀",   type: "攻击", realm_req: 2, desc: "剑出如虹，一剑破万法",               effect: { 攻击: 1.35 } },
    { name: "缩地成寸",   type: "身法", realm_req: 2, desc: "一步千里的遁法",                     effect: { 闪避: 1.5 } },
    { name: "天眼通",     type: "神通", realm_req: 3, desc: "开启天眼，可观气运、察因果",         effect: { 感知: 2.0 } },
  ],
  // 顶级功法
  advanced: [
    { name: "九转玄功",     type: "体修", realm_req: 4, desc: "九转炼体，肉身成圣",               effect: { 防御: 2.0, 攻击: 1.5 } },
    { name: "大衍天机诀",   type: "天机", realm_req: 4, desc: "推演天机，可窥未来一角",           effect: { 感知: 3.0, 悟性: 1.5 } },
    { name: "一念花开",     type: "神通", realm_req: 5, desc: "一念之间，花开天下，可度化众生",   effect: { 神识: 3.0 } },
    { name: "逆乱阴阳",     type: "禁术", realm_req: 5, desc: "逆转阴阳，夺天造化，代价极大",     effect: { 攻击: 3.0, 寿元消耗: -100 } },
  ],
};

// ---- 丹药 ----
const PILLS = [
  { name: "聚气丹",   grade: "下品", realm_req: 1, desc: "凝聚灵气，加速修炼",          effect: { 灵力: +20 },         price: 10  },
  { name: "培元丹",   grade: "下品", realm_req: 1, desc: "培固元本，疗愈内伤",          effect: { 生命: +50 },         price: 15  },
  { name: "洗髓丹",   grade: "中品", realm_req: 2, desc: "洗髓伐骨，改善资质",          effect: { 悟性: +5 },          price: 200 },
  { name: "破障丹",   grade: "中品", realm_req: 2, desc: "助破境之丹，增加突破几率",    effect: { 突破率: +0.15 },    price: 500 },
  { name: "回春丹",   grade: "中品", realm_req: 2, desc: "起死回生，重伤速愈",          effect: { 生命: +500 },       price: 300 },
  { name: "凝神丹",   grade: "上品", realm_req: 3, desc: "凝练神识，防走火入魔",        effect: { 神识: +100 },       price: 1000},
  { name: "九转还魂丹", grade: "极品", realm_req: 4, desc: "续命还魂，阎王难收",         effect: { 复活: true },       price: 100000 },
];

// ---- 地点 ----
const LOCATIONS = [
  { name: "青云镇",     type: "凡俗", desc: "山脚小镇，凡人聚居，偶有散修往来",     danger: 0,    realm_suggest: 1, scene: "mountain_gate",
    sensory: "晨雾压低了屋檐，青石板上凝着隔夜的露，踩上去沁凉；巷口炊饼的焦香混着谁家艾草煮水的苦青味，挑担货郎的铜铃一声挨着一声，惊起檐下避露的麻雀。" },
  { name: "落霞宗",     type: "宗门", desc: "正道大宗，入门之所，藏经阁底蕴深厚",   danger: 1,    realm_suggest: 1, scene: "sect_hall",
    sensory: "夕照把九重飞檐镀成赤金，藏经阁的钟声撞过层层屋脊，余音里裹着老松脂的暖香与一缕新鲜墨气——似有人方才在抄经。" },
  { name: "迷雾森林",   type: "荒野", desc: "终年雾气弥漫，妖兽出没，药草遍地",     danger: 3,    realm_suggest: 2, scene: "bamboo_forest",
    sensory: "白雾漫过膝头，凉意直钻脚踝；腐叶与湿泥的腥甜壅在鼻端。忽有鸟啼裂空，又猛地噤声，林子静得能听见自己心跳撞在耳膜上。" },
  { name: "万宝坊市",   type: "坊市", desc: "修士交易之所，丹药法宝琳琅满目",       danger: 1,    realm_suggest: 2, scene: "market",
    sensory: "灵石相击的脆响混着南腔北调的吆喝，炸炉丹药的焦苦、新锻铁器的腥锈、还有不知谁袖中脂粉的甜腻，在人群蒸腾的热气里绞成一团。" },
  { name: "幽冥谷",     type: "禁地", desc: "瘴气弥漫的深谷，传闻有魔修出没",       danger: 5,    realm_suggest: 3, scene: "ghost_realm",
    sensory: "青绿的瘴气贴着地皮游走，腥甜得像烂熟后发酵的果子；谷底飘来断续低语，听不真切，寒意却已顺着尾椎一节节爬上后颈。" },
  { name: "天剑崖",     type: "秘境", desc: "上古剑修遗迹，藏有无上剑道传承",       danger: 6,    realm_suggest: 3, scene: "secret_realm",
    sensory: "千百柄断剑斜插在崖壁里，风灌过剑窟，铮铮如千百人同啸；剑意凛冽，刮得面颊生疼，连呼吸都像吞了碎冰。" },
  { name: "龙脉秘境",   type: "秘境", desc: "上古龙族遗留之地，机缘与凶险并存",     danger: 7,    realm_suggest: 4, scene: "star_sky",
    sensory: "地底传来沉闷龙吟，灵气像活水般在足底涌动；星辉与金芒自岩缝里渗出，落在手背上凉丝丝地游走，似有鳞甲擦过。" },
  { name: "通天塔",     type: "试炼", desc: "直通天际的古塔，层层皆有考验",         danger: 8,    realm_suggest: 5, scene: "cloud_palace",
    sensory: "塔身没入云海，风在层叠回廊间撞出连绵长啸；每踏上一级石阶，壁上禁制便嗡然一震，脚底麻意顺腿筋直窜后心。" },
  { name: "九幽黄泉",   type: "禁地", desc: "连通幽冥之地，生死交界之处",           danger: 9,    realm_suggest: 6, scene: "ghost_realm",
    sensory: "忘川水黑得不见底，对岸血色彼岸花成片燃烧；哭嚎与嬉笑绞缠着从水面底下浮上来，幽蓝魂火贴地飘荡，像无数睁开的眼。" },
  { name: "紫霄天宫",   type: "仙迹", desc: "传闻中飞升仙人遗留的宫殿",             danger: 10,   realm_suggest: 7, scene: "cloud_palace",
    sensory: "琼楼玉宇浮在云涛之上，仙乐缥缈得辨不出宫商；瑞光如细雨垂落，万籁俱寂，只剩一道似钟非钟的道音在颅骨里嗡鸣。" },
];

// ---- 初始可选出身 ----
const BACKGROUNDS = [
  { name: "寒门子弟", desc: "出身贫寒，自幼父母双亡，偶得残卷开始修仙",     bonus: { 灵石: 0,   功法: "吐纳诀",     悟性: 8 } },
  { name: "宗门弟子", desc: "自幼拜入落霞宗，得师长教导，根基扎实",         bonus: { 灵石: 50,  功法: "五行归元功", 悟性: 6 } },
  { name: "世家子弟", desc: "修仙世家出身，资源丰厚，但纨绔难免",           bonus: { 灵石: 500, 功法: "金光咒",     悟性: 5 } },
  { name: "妖族血脉", desc: "身怀妖族血脉，天生神力但易遭正道排斥",         bonus: { 灵石: 0,   功法: "吐纳诀",     悟性: 5, 体质: 1.5 } },
  { name: "转世重修", desc: "前世为大能，转世重修，悟性超群但灵根受损",     bonus: { 灵石: 100, 功法: "吐纳诀",     悟性: 15, 灵根弱化: true } },
];

// ---- 性别 / 真身（仅作中性身份标识，不预设任何剧情走向） ----
const GENDERS = [
  { id: "male",   name: "男",         desc: "以男相入世修行" },
  { id: "female", name: "女",         desc: "以女相入世修行" },
  { id: "bag",    name: "超市购物袋",  desc: "以一只会说话的超市购物袋之身入世，立志修仙（？）", joke: true,
    premise: "你本是一只超市购物袋，机缘巧合开了灵智，立志修仙——无手无脚，以意念与哗啦之声交流，靠飘移移动。" },
];

// ---- 天气与时段 ----
const TIMES_OF_DAY = ["卯时", "辰时", "巳时", "午时", "未时", "申时", "酉时", "戌时", "亥时", "子时", "丑时", "寅时"];
const WEATHERS = [
  { name: "晴空万里", desc: "阳光普照，灵气平和",       effect: {} },
  { name: "细雨绵绵", desc: "天降甘霖，水灵气略盛",     effect: { 水灵气: 1.2 } },
  { name: "雷云密布", desc: "雷霆将至，雷灵气暴涨",     effect: { 雷灵气: 2.0 } },
  { name: "大雾弥漫", desc: "浓雾遮天，感知下降",       effect: { 感知: 0.6 } },
  { name: "灵雨倾盆", desc: "百年难遇的灵雨，加速修炼", effect: { 修炼速度: 1.5 } },
  { name: "血月当空", desc: "诡异血月，魔气弥漫",       effect: { 走火概率: 2.0 } },
];

// ---- 生活技能（参考《凡人修仙传》《一念逍遥》《鬼谷八荒》《觅长生》等仙侠世界观）----
// 每种技能含多条「进阶之路」：玩家依自身选择决定专精走向，走向不同则玩法与剧情各异。
const LIFE_SKILLS = [
  { name: "炼丹", desc: "以灵草异火炼制丹药，疗伤、突破、增益皆赖于此。",
    flavor: "丹炉前一立便是三日三夜，守火候、辨药性，指缝被灵火灼出一层薄茧；成则丹香盈室、满室生春，败则焦黑溅身、毒烟呛喉。",
    paths: [
      { key: "丹王道", desc: "专精炼制疗伤与突破之丹，救人济世，丹香盈世。" },
      { key: "毒丹道", desc: "以毒入丹，杀人于无形，亦能以毒攻毒。" },
      { key: "异火丹道", desc: "收异火为炉，炼出的丹药自带火属神效，威能倍增。" },
    ] },
  { name: "炼器", desc: "采灵矿、引真火，锻造法宝利器。",
    flavor: "引真火淬灵矿，锤下火星四溅，匠人须以灵识护住雏形，不被凉铁吸气夺走；一柄好器出炉时通体嗡鸣，掌心却被烫得皮开肉绽。",
    paths: [
      { key: "本命法宝", desc: "以精血祭炼与本命相连的法宝，威力随主成长。" },
      { key: "攻伐利器", desc: "专铸剑戈斧钺等杀伐之器，锋锐无匹。" },
      { key: "防御重器", desc: "铸盾甲塔印等守御之宝，护身护阵。" },
    ] },
  { name: "符箓", desc: "以朱砂灵墨绘符，引天地之力为用。",
    flavor: "朱砂调灵墨，一笔落纸便再难更改，画错一道符纹整张便废；成符入手微烫，似有雷在纸里沉睡。",
    paths: [
      { key: "攻伐符", desc: "雷符火符等杀伐之符，随手可发。" },
      { key: "护身符", desc: "护身、避灾、隐身之符，保命为上。" },
      { key: "召物符", desc: "可召灵兽、储物、传讯，妙用无穷。" },
    ] },
  { name: "阵法", desc: "布阵引灵，困敌、聚灵、传送皆成。",
    flavor: "踏罡步斗、以灵石为眼布阵，一子错则全盘反噬，布阵人先受阵力撕扯；成阵那刻地脉轻颤，发丝无风自动。",
    paths: [
      { key: "杀阵", desc: "困杀之阵，入者九死一生。" },
      { key: "聚灵阵", desc: "引动地脉灵气，修炼事半功倍。" },
      { key: "守护阵", desc: "护山大阵，宗门根基所在。" },
    ] },
  { name: "灵植", desc: "培育灵草灵谷，自有药圃一方。",
    flavor: "躬身药圃，指尖沾泥，晨昏以水灵气浇灌；灵草抽芽时叶尖凝露如泪，十年方得一株成材，其间虫蛀兽踏皆是劫。",
    paths: [
      { key: "药草培育", desc: "专育疗伤突破之灵草，坐拥药田。" },
      { key: "灵谷农道", desc: "种灵谷养灵兽，以农入道，仓廪丰实。" },
      { key: "诡植培育", desc: "育食人花、噬魂藤等凶植，攻守兼备。" },
    ] },
  { name: "御兽", desc: "驯养灵兽妖禽，立契伴修。",
    flavor: "以血契羁灵兽，痛痒与共——兽伤则主创、兽死则主损寿；驯服那刻，它湿冷的鼻息第一次主动蹭上你手背。",
    paths: [
      { key: "战兽之道", desc: "驯凶兽为战宠，冲锋陷阵。" },
      { key: "探兽之道", desc: "驯灵禽寻矿探路，伴行千里。" },
      { key: "心兽之道", desc: "与灵兽通心语，以情入道。" },
    ] },
  { name: "灵膳", desc: "以灵材烹制增益膳食，食补亦修行。",
    flavor: "灵材入鼎，火候差一分则味败效散；一席好膳起锅时满室异香，食客尝一口便灵台清明，而掌勺者往往已站得双腿僵直。",
    paths: [
      { key: "补益灵膳", desc: "固本培元，食之修为精进。" },
      { key: "百味灵膳", desc: "以极致美味结交群修，广结善缘。" },
      { key: "暗膳", desc: "膳中藏毒藏补，亦可杀人于餐桌。" },
    ] },
  { name: "琴艺", desc: "以琴音入道，弦动天地。",
    flavor: "弦动则神识随音走，杀伐之曲弹罢唇角溢血、识海如被千针扎；一曲终了，指尖琴茧与心神俱疲，却换得满座噤声。",
    paths: [
      { key: "杀伐琴音", desc: "弦如利刃，音波伤敌于无形。" },
      { key: "清心琴音", desc: "琴音宁神，助人以道心御劫。" },
      { key: "惑心琴音", desc: "音乱心神，惑敌于心。" },
    ] },
  { name: "鉴宝", desc: "辨灵材、识古物、探矿脉，慧眼识珍。",
    flavor: "以神识探物，灵材真伪在指尖毫厘间现形；淘得重宝时心头一跳，亦常伴赝品蒙尘、慧眼被辱的尴尬。",
    paths: [
      { key: "探脉", desc: "寻灵矿灵脉，富甲一方。" },
      { key: "辨物", desc: "鉴宝识伪，淘得重宝。" },
      { key: "古风考据", desc: "考据古修遗物，通晓古今秘辛。" },
    ] },
  { name: "机关", desc: "造傀儡、设机巧，以工巧入道。",
    flavor: "榫卯入微，差之毫厘则机括卡死反噬；一具傀儡睁眼那刻，齿轮咬合的细响如心跳，造物者竟分不清是谁在喘息。",
    paths: [
      { key: "傀儡术", desc: "造机关傀儡代战代劳。" },
      { key: "机关阵", desc: "设机关暗道，守御攻防。" },
      { key: "巧工", desc: "造便民机巧，以工济世。" },
    ] },
];

// ---- 以技证道（生活技能亦可飞升）----
const CRAFT_DAO = {
  desc: "修仙不止练功。生活技能练至「登峰造极」（熟练度满 100）并择定登顶之路、由此悟出独属自己的「道」，即可触发「以技证道飞升」（event_flag: craft_ascension）——不必先至大乘/飞升期，肉身凡胎亦可凭一艺通天。",
  maxProficiency: 100,
};

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { REALMS, SPIRITUAL_ROOTS, CULTIVATION_SYSTEMS, BREAKTHROUGH_BASE, TECHNIQUES, PILLS, LOCATIONS, BACKGROUNDS, GENDERS, TIMES_OF_DAY, WEATHERS, LIFE_SKILLS, CRAFT_DAO };
}
