// ============================================================
//  《浮生仙途》世界种子系统
//  由 seed 确定性生成世界要素：界名 / 版图 / 宗门 / 人物 / 秘闻 / 机缘 / 异象
//  World Seed Generator — deterministic world generation
// ============================================================

// ---------- 确定性随机：字符串哈希 + mulberry32 ----------
function hashSeed(str) {
  str = String(str);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  // 二次混淆，减少短串碰撞
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 词库 ----------
const WORLD_PREFIX = ["九霄", "太虚", "苍梧", "幽冥", "玄黄", "碧落", "洪荒", "万古", "无垠", "混沌", "须弥", "轮回", "大荒", "灵霄", "九垓"];
const WORLD_SUFFIX = ["寰宇", "仙域", "灵界", "秘境", "天洲", "虚海", "神洲", "幻境", "洞天", "渊域", "荒原", "星海"];

const REGION_PREFIX = ["青", "苍", "幽", "玄", "碧", "血", "霜", "云", "墨", "赤", "紫", "灵", "幻", "荒", "葬", "听", "落", "归", "忘", "焚", "沉", "栖", "寒", "流", "漱", "玉"];
const REGION_MID = ["云", "霞", "冥", "虚", "海", "渊", "峰", "谷", "原", "泽", "岭", "涧", "墟", "林", "崖", "河", "山", "城", "州", "域", "岚", "川", "荒", "丘", "渚"];

const REGION_TYPES = [
  { type: "凡俗", danger: 0, realm: 1, flavor: ["山脚小镇，凡人聚居，偶有散修往来", "临水城池，商旅往来，三教九流杂处", "边陲村落，鸡犬相闻，民风淳朴"] },
  { type: "宗门", danger: 1, realm: 1, flavor: ["正道大宗，藏经阁底蕴深厚", "隐世剑宗，门规森严，弟子不苟言笑", "散修联盟，兼容并包，鱼龙混杂"] },
  { type: "荒野", danger: 3, realm: 2, flavor: ["终年雾气弥漫，妖兽出没，药草遍地", "古木参天，灵气氤氲，却暗藏杀机", "乱石戈壁，风沙蔽日，行旅多殁于此"] },
  { type: "坊市", danger: 1, realm: 2, flavor: ["修士交易之所，丹药法宝琳琅满目", "黑市暗涌，真假难辨，杀人越货者众"] },
  { type: "禁地", danger: 5, realm: 3, flavor: ["瘴气弥漫的深谷，传闻有魔修出没", "上古战场，怨魂不息，白骨露于野", "绝灵死地，万物不生，擅入者多无归"] },
  { type: "秘境", danger: 6, realm: 3, flavor: ["上古遗迹，传承可寻，然守卫森严", "洞天福地，机缘暗藏，时空错乱", "残界碎片，落地即异，常人难辨东西"] },
  { type: "试炼", danger: 8, realm: 5, flavor: ["古塔通天，层层皆有考验", "剑冢森森，杀机暗伏，唯剑修可入"] },
  { type: "仙迹", danger: 10, realm: 7, flavor: ["飞升仙人遗留之宫，霞光万道", "传说中的蓬莱药洲，凡人难觅其踪"] },
];

// 宏观疆域（六域）：构成世界版图骨架，并为每域划定地图坐标框（SVG 1000x680 空间）
const MACRO_REGIONS = [
  { name: "中州", flavor: "天下中枢，宗门林立，灵脉交汇，正道共主之所在。", zone: { x0: 340, y0: 235, x1: 660, y1: 465 } },
  { name: "东域", flavor: "东海之滨，商港云集，散修异族往来，机变百出。", zone: { x0: 705, y0: 250, x1: 955, y1: 525 } },
  { name: "西域", flavor: "大漠黄沙，古国废墟，魔修刀客横行，埋金无数。", zone: { x0: 45, y0: 250, x1: 295, y1: 525 } },
  { name: "南疆", flavor: "十万大山，瘴疠蛮荒，巫蛊妖族共居，凶险无比。", zone: { x0: 300, y0: 520, x1: 700, y1: 660 } },
  { name: "北原", flavor: "冰封雪野，蛮族游牧，古战场遗魂不息，豪勇尚武。", zone: { x0: 250, y0: 30, x1: 750, y1: 200 } },
  { name: "海外", flavor: "蓬莱诸岛，仙踪渺茫，灵气最盛却最难寻，传为飞升之径。", zone: { x0: 780, y0: 40, x1: 970, y1: 205 } },
];

const SECT_PREFIX = ["太玄", "凌霄", "幽冥", "赤火", "碧落", "苍梧", "无极", "九幽", "紫宸", "寒山", "流云", "沉沙", "焚天", "听雪", "归尘", "万剑", "漱玉", "星陨"];
const SECT_CORE = ["剑", "丹", "符", "阵", "器", "魂", "妖", "魔", "雷", "风", "星", "禅", "水", "毒"];
const SECT_SUFFIX = ["宗", "门", "派", "教", "阁", "殿", "谷", "岛", "山", "宫", "庭", "崖"];
const SECT_DISPOSITION = ["正道名门", "魔道巨擘", "亦正亦邪", "散修联盟", "妖族圣地", "隐世古宗", "皇朝供奉"];
const SECT_SIGIL = [
  "镇派之宝为一柄断剑，据说曾斩过真龙",
  "门人皆以银面具示人，真容无人得见",
  "山门悬九盏长明灯，灯灭则门派将倾",
  "传功大殿藏于地下，地面只余一口古井",
  "弟子额间有朱砂印记，可辨同门真伪",
  "以豢养老妖为护山，山脚常闻异啸",
  "掌门一脉世代单传，传男不传女",
  "门规首条：见利忘义者，逐出师门",
];

const NPC_SURNAME = ["云", "风", "墨", "苏", "叶", "楚", "凌", "白", "洛", "沈", "顾", "萧", "陆", "谢", "秦", "慕容", "上官", "司徒", "南宫", "北冥", "东方", "百里"];
const NPC_GIVEN = ["无尘", "清虚", "凌霄", "听雪", "忘机", "逸尘", "长歌", "惊鸿", "若虚", "玄机", "问天", "星辰", "沧海", "清风", "问情", "破军", "贪狼", "青鸾", "墨白", "寒衣", "照影", "晚晴", "扶摇", "知微"];
const NPC_TITLE = ["长老", "圣女", "魔尊", "散人", "丹师", "剑痴", "妖王", "器灵", "神算", "药童", "执事", "护法", "传人", "游侠", "鬼医", "巡察使"];
const NPC_TRAIT = ["喜怒无常", "城府极深", "嗜酒如命", "仁义为先", "冷若冰霜", "贪财好利", "痴迷炼器", "心系苍生", "诡计多端", "沉默寡言", "傲骨嶙峋", "外冷内热"];

const RUMOR_TEMPLATES = [
  "传闻${region}深处封印着上古${thing}，得之可${benefit}。",
  "坊间盛传${faction}手中握有${secret}，引发诸方觊觎。",
  "${npc}据传已闭关百年，欲参透那桩${mystery}。",
  "${region}近来灵气异动，似有${thing}将出世，${faction}已暗中派人镇守。",
  "有散修赌咒，${npc}曾于${region}得一${secret}，自此修为突飞猛进。",
];
const RUMOR_THING = ["残阵", "妖丹", "仙骸", "古碑", "灵脉", "魔兵", "道果", "先天灵根"];
const RUMOR_BENEFIT = ["功参造化", "延寿百年", "威震一方", "破境无碍", "白日飞升"];
const RUMOR_SECRET = ["失传秘典", "通天灵宝", "宗门秘辛", "长生药方", "夺舍之术"];
const RUMOR_MYSTERY = ["轮回之秘", "飞升之径", "时空裂隙", "以魂饲剑之法", "逆天改命之术"];

const TREASURE_SPOT = ["寒潭", "古洞", "枯井", "断碑之下", "老树空心", "祭坛残垣", "剑痕石壁", "沉沙之底"];
const TREASURE_ITEM = ["万年灵乳", "太古剑胚", "九转金丹方", "御风翅", "避水珠", "摄魂铃", "养魂木", "破障神符"];

const OMENS = [
  "本界灵气近来异动，传闻有大机缘将现于世间。",
  "血月将至，魔修蠢动，正道各派严阵以待。",
  "千年一遇的灵潮正在酝酿，闭关事半功倍。",
  "上古封印松动，邪祟时有现身，凡俗惶惶。",
  "星陨如雨，天机紊乱，神算者皆言变数将至。",
  "灵脉迁徙，诸多秘境入口随之浮现，引无数修士竞折腰。",
  "南海生莲，传闻花开之时，可得一缕成仙之机。",
];

// ---------- 生成器 ----------
const WorldGen = {
  hashSeed,
  mulberry32,

  // 生成一个随机可读的种子串（用于「随机世界」）
  randomSeed() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  // 由种子确定性生成整个世界（wish 为玩家许愿文本，可轻度偏置风土）
  generateWorld(seed, wish) {
    const s = (seed == null || seed === "") ? this.randomSeed() : String(seed);
    const rng = this.mulberry32(this.hashSeed(s));
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    const fill = (tpl, map) => tpl.replace(/\$\{(\w+)\}/g, (_, k) => (map[k] != null ? map[k] : ""));

    // 许愿关键词 → 相关地域类型（轻度偏置，不喧宾夺主；精彩程度不因灵力值分级）
    const wishText = (wish && typeof wish === "string" && wish.trim()) ? wish.trim() : "";
    const THEME_MAP = { "魔": ["禁地", "试炼"], "妖": ["荒野"], "剑": ["试炼"], "佛": ["宗门"], "仙": ["仙迹", "秘境"], "凡": ["凡俗"], "龙": ["秘境"], "丹": ["宗门"], "毒": ["禁地"], "鬼": ["禁地", "秘境"], "器": ["宗门"], "战": ["试炼"], "海": ["坊市"] };
    let themedTypes = [];
    if (wishText) { for (const k in THEME_MAP) { if (wishText.indexOf(k) >= 0) themedTypes = themedTypes.concat(THEME_MAP[k]); } }
    themedTypes = themedTypes.filter((v, i, a) => a.indexOf(v) === i);
    const pickType = () => {
      if (themedTypes.length && rng() < 0.45) {
        const t = REGION_TYPES.find((x) => themedTypes.indexOf(x.type) >= 0);
        if (t) return t;
      }
      return pick(REGION_TYPES);
    };

    // 1) 界名
    const worldName = pick(WORLD_PREFIX) + pick(WORLD_SUFFIX);

    // 2) 地域（版图节点，按宏观疆域分布并生成地图坐标，构成大世界版图）
    const regions = [];
    const usedNames = new Set();
    const macroByName = {};
    MACRO_REGIONS.forEach((m) => { macroByName[m.name] = m; });
    const makeRegion = (macroName, t) => {
      const zone = macroByName[macroName].zone;
      let nm, guard = 0;
      do { nm = pick(REGION_PREFIX) + pick(REGION_MID); guard++; } while (usedNames.has(nm) && guard < 30);
      usedNames.add(nm);
      return {
        name: nm, type: t.type, danger: t.danger, realm: t.realm, desc: pick(t.flavor),
        macro: macroName,
        x: ri(zone.x0, zone.x1),
        y: ri(zone.y0, zone.y1),
      };
    };
    const ensureType = (type) => {
      if (regions.some((r) => r.type === type)) return;
      const t = REGION_TYPES.find((x) => x.type === type);
      const idx = ri(0, regions.length - 1);
      const macroName = regions[idx].macro;
      regions[idx] = makeRegion(macroName, t);
    };
    const regionCount = ri(14, 16);
    // 第一轮：每个宏观疆域至少 1 个地域，撑起版图骨架
    MACRO_REGIONS.forEach((m) => regions.push(makeRegion(m.name, pickType())));
    // 第二轮：随机补足，疆域与类型均随机，丰富世界
    while (regions.length < regionCount) {
      regions.push(makeRegion(pick(MACRO_REGIONS).name, pickType()));
    }
    // 保证关键类型存在（起点宗门/凡俗、险地禁地）
    ensureType("宗门");
    ensureType("凡俗");
    ensureType("禁地");
    const startCandidates = regions.filter((r) => r.type === "宗门" || r.type === "凡俗");
    const startRegion = startCandidates[0] || regions[0];
    const startLocation = startRegion.name;
    const startMacro = startRegion.macro;

    // 3) 宗门势力
    const factions = [];
    const fcount = ri(3, 4);
    for (let i = 0; i < fcount; i++) {
      let nm, g = 0;
      do { nm = pick(SECT_PREFIX) + pick(SECT_CORE) + pick(SECT_SUFFIX); g++; } while (factions.some((f) => f.name === nm) && g < 30);
      factions.push({
        name: nm,
        disposition: pick(SECT_DISPOSITION),
        base: pick(regions).name,
        sigil: pick(SECT_SIGIL),
      });
    }

    // 4) 名动人物
    const npcs = [];
    const ncount = ri(4, 5);
    for (let i = 0; i < ncount; i++) {
      let nm, g = 0;
      do { nm = pick(NPC_SURNAME) + pick(NPC_GIVEN); g++; } while (npcs.some((n) => n.name === nm) && g < 30);
      npcs.push({
        name: nm,
        title: pick(NPC_TITLE),
        trait: pick(NPC_TRAIT),
        where: pick(regions).name,
      });
    }

    // 5) 江湖秘闻
    const rumors = [];
    for (let i = 0; i < 3; i++) {
      const tpl = pick(RUMOR_TEMPLATES);
      rumors.push(fill(tpl, {
        region: pick(regions).name,
        faction: pick(factions).name,
        npc: pick(npcs).name,
        thing: pick(RUMOR_THING),
        benefit: pick(RUMOR_BENEFIT),
        secret: pick(RUMOR_SECRET),
        mystery: pick(RUMOR_MYSTERY),
      }));
    }

    // 6) 暗藏机缘
    const treasures = [];
    for (let i = 0; i < 2; i++) {
      const spot = pick(TREASURE_SPOT);
      const item = pick(TREASURE_ITEM);
      const region = pick(regions).name;
      treasures.push({ name: item, where: region, desc: `于${region}的${spot}中，藏有${item}。` });
    }

    // 7) 天地异象
    const omen = pick(OMENS);

    // 7.5) 修炼体系（每界独有之"方言"：灵根/血脉/命格/道种/元素亲和/灵枢……核心皆为灵力）
    const SYS_LIST = (typeof CULTIVATION_SYSTEMS !== "undefined" && CULTIVATION_SYSTEMS.length) ? CULTIVATION_SYSTEMS : null;
    const SYS_IDS = SYS_LIST ? SYS_LIST.map(s => s.id) : ["lingen"];
    // 许愿关键词 → 体系（精确偏置；按"身份定义"在前、"道路"在后排序，使「以战证道的妖狼」锁定血脉界而非道种界）
    const SYSTEM_BIAS = {
      "妖": "xuema", "狼": "xuema", "妖兽": "xuema", "兽": "xuema", "血脉": "xuema", "龙": "xuema", "凤": "xuema", "麒麟": "xuema", "玄武": "xuema", "朱雀": "xuema", "白虎": "xuema",
      "机": "lingshu", "械": "lingshu", "科技": "lingshu", "灵枢": "lingshu", "机关": "lingshu",
      "儒": "rudao", "道理": "rudao", "文": "rudao", "圣人": "rudao", "礼": "rudao", "浩然": "rudao", "书院": "rudao",
      "武": "wudao", "体修": "wudao", "武夫": "wudao", "肉身": "wudao", "锻体": "wudao", "拳": "wudao", "气血": "wudao",
      "元素": "yuansu", "法师": "yuansu", "炎": "yuansu", "雷": "yuansu", "霜": "yuansu", "冰": "yuansu", "风": "yuansu",
      "命格": "mingge", "星": "mingge", "天机": "mingge", "紫微": "mingge",
      "证道": "daozhong", "道种": "daozhong", "剑道": "daozhong", "剑修": "daozhong", "以战证道": "daozhong", "剑": "daozhong",
      "灵根": "lingen", "五行": "lingen", "修仙": "lingen", "仙": "lingen",
    };
    let sysId = "lingen";
    let wishMatched = false;
    if (wishText) {
      for (const k in SYSTEM_BIAS) { if (wishText.indexOf(k) >= 0) { sysId = SYSTEM_BIAS[k]; wishMatched = true; break; } }
    }
    if (!wishMatched && SYS_IDS.length > 1 && rng() < 0.55) {
      // 无许愿偏置时，过半世界并非经典灵根界，以体现诸天万界之异
      sysId = SYS_IDS[Math.floor(rng() * SYS_IDS.length)];
    }

    // 8) 灵力值（驱动境界上限，不驱动精彩程度；无论高低，世界同样精彩凶险）
    const spirit = ri(3, 9);
    const realmCapLevel = spirit <= 3 ? 4 : spirit <= 5 ? 6 : spirit <= 7 ? 8 : 10;

    return {
      seed: s,
      id: this.hashSeed(s) >>> 0,
      name: worldName,
      omen,
      spirit,
      realmCapLevel,
      cultivationSystem: sysId,
      wish: wishText,
      macroRegions: MACRO_REGIONS.map((m) => ({ name: m.name, flavor: m.flavor })),
      regions,
      factions,
      npcs,
      rumors,
      treasures,
      startLocation,
      startMacro,
    };
  },
};

// Node 端导出（浏览器中 module 未定义，自动跳过）
if (typeof module !== "undefined" && module.exports) {
  module.exports = WorldGen;
}
