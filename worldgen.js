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
  { type: "凡俗", danger: 0, realm: 1, flavor: [
    "山脚小镇，凡人聚居，偶有散修往来",
    "临水城池，商旅往来，三教九流杂处",
    "边陲村落，鸡犬相闻，民风淳朴",
    "通衢大邑，市声鼎沸，坊规森严",
    "渔港小镇，咸风裹腥，船歌彻夜",
    "塞外孤城，黄沙蔽日，戍卒望乡",
  ] },
  { type: "宗门", danger: 1, realm: 1, flavor: [
    "正道大宗，藏经阁底蕴深厚",
    "隐世剑宗，门规森严，弟子不苟言笑",
    "散修联盟，兼容并包，鱼龙混杂",
    "千年古观，道韵悠长，香火不绝",
    "佛门净地，暮鼓晨钟，檀烟绕殿",
    "魔道别院，亦正亦邪，门前血藤缠绕",
  ] },
  { type: "荒野", danger: 3, realm: 2, flavor: [
    "终年雾气弥漫，妖兽出没，药草遍地",
    "古木参天，灵气氤氲，却暗藏杀机",
    "乱石戈壁，风沙蔽日，行旅多殁于此",
    "枯草连天的荒原，狐狼结群，夜有绿瞳成排",
    "湿热雨林，藤萝蔽天，瘴虫噬人于无形",
    "冰封峡谷，朔风如刀，冻尸悬于绝壁",
  ] },
  { type: "坊市", danger: 1, realm: 2, flavor: [
    "修士交易之所，丹药法宝琳琅满目",
    "黑市暗涌，真假难辨，杀人越货者众",
    "沿河夜市，画舫连舟，灯影里皆藏价码",
    "边境互市，人妖杂处，一句不合便拔刀",
    "地下鬼市，只认暗号不认脸，交易皆以魂灯为凭",
    "灵矿小镇，矿工满面尘灰，赌石摊前围满赌徒",
  ] },
  { type: "禁地", danger: 5, realm: 3, flavor: [
    "瘴气弥漫的深谷，传闻有魔修出没",
    "上古战场，怨魂不息，白骨露于野",
    "绝灵死地，万物不生，擅入者多无归",
    "倒悬深渊，石笋如獠牙，底有不可名状之物低鸣",
    "焚天熔狱，岩浆奔流，空气中浮着焦裂的魂屑",
    "亡灵渡口，忘川水黑，摆渡老叟只收寿元不收银",
  ] },
  { type: "秘境", danger: 6, realm: 3, flavor: [
    "上古遗迹，传承可寻，然守卫森严",
    "洞天福地，机缘暗藏，时空错乱",
    "残界碎片，落地即异，常人难辨东西",
    "浮空仙岛，云阶千叠，岛心有未醒的古修",
    "镜湖幻境，水底另有一界，照影者见己之死",
    "万妖遗巢，巢壁皆以妖骨垒成，巢中蛋鸣如泣",
  ] },
  { type: "试炼", danger: 8, realm: 5, flavor: [
    "古塔通天，层层皆有考验",
    "剑冢森森，杀机暗伏，唯剑修可入",
    "九死桥横亘虚空，过者得道，坠者化灰",
    "焚心阵内，妄念皆成实体，斩不尽便被吞",
    "雷池试道，每步皆引天雷灌顶，肉身即试金石",
    "无回廊，入者记忆逐刻剥落，尽头方知是谁",
  ] },
  { type: "仙迹", danger: 10, realm: 7, flavor: [
    "飞升仙人遗留之宫，霞光万道",
    "传说中的蓬莱药洲，凡人难觅其踪",
    "不周山残脊，撑天之柱折断处，仍漏着太古清气",
    "归墟之门，万水尽头，门后是无始无终的寂静",
    "九霄云阙，阶上步步走漏光阴，登顶者已历三世",
    "菩提道场，一株枯树半边生叶半边燃，叶落处皆成偈语",
  ] },
];

// 各类地域的多感官环境质感（生成世界之"展示不告知"种子；写法与静态 LOCATIONS.sensory 同源）
// 让 AI 在生成世界里也有可化用的气味/声响/触感/光影锚点，而非凭空编造或无锚可化。
const REGION_SENSORY = {
  "凡俗": [
    "青石阶上凝着隔夜的露，挑担货郎的铜铃一声挨着一声；谁家灶膛飘出米香，混着巷尾艾草煮水的苦青气，惊起檐下避露的麻雀。",
    "晨光斜进窄巷，晾衣竹竿上水珠滴答落在石臼里；远处磨剪子的吆喝拖得老长，蒸糕的热气漫过脚踝，混着墙角猫崽的呼噜。",
    "河埠头的腥风裹着鱼鳞的银亮，浣衣棒捶在青石上砰砰作响；卖糖人的老汉摇着拨浪鼓，糖稀的暖甜压过了水草的腐气。",
    "暮色降时炊烟连成灰蓝的幕，谁家窗里漏出半句胡琴，拉得断断续续；风里夹着新晒被褥的太阳味，教人想起久未归的家。",
    "集日刚散，满地鸡毛与烂菜叶混着马蹄印；卖艺的锣声还嗡在耳里，一缕炸油条的香从巷尾飘来，又被风卷散。",
    "夜雨敲在瓦上当当错落，檐沟淌水成帘；油灯下老朽拨着算盘，珠子噼啪，混着门外野猫拖长了的嘶叫，衬得小镇更静。",
  ],
  "宗门": [
    "晚钟撞过层层飞檐，余音里裹着老松脂的暖香与一缕新鲜墨气——似有人方才在抄经；阶前香灰被风卷起，落在肩头尚温。",
    "山门石狮被香火熏得发亮，弟子练剑的破空声此起彼伏；廊下煮茶的咕嘟声混着远处钟磬，空气里有檀香与薄汗交缠。",
    "藏经阁的木梯被踏得发亮，纸页翻动声沙沙如蚕食叶；高处漏下的光柱里浮尘慢舞，墨与陈年虫蛀的苦香缠成一团。",
    "晨课的诵声响成一片，震得梁上积尘簌簌落下；蒲团旁供着的清水映着烛火，空气里是线香燃尽的尾甜与旧木的温吞。",
    "试剑坪上剑气纵横，青砖被犁出道道白痕；收剑时衣袂带起的风里有铁锈与汗，还有师兄袖中揣着的桂花酿的淡香。",
    "后山禁地的结界微微嗡鸣，越靠近越觉头皮发紧；石径两侧的守山石兽眼窝里幽光一闪，似在数着来人的呼吸。",
  ],
  "荒野": [
    "白雾漫过膝头，凉意直钻脚踝；腐叶与湿泥的腥甜壅在鼻端。忽有鸟啼裂空，又猛地噤声，林子静得能听见自己心跳撞在耳膜上。",
    "乱石戈壁的风沙打在脸上发涩，远处枯树杈丫如爪；脚底碎石滚动声惊起一窜细碎蹄音，又迅速没入苍黄。",
    "雨林的湿热裹着腐花与蚁群的甜腥，藤蔓垂落处滴下水珠，砸在肩头冰凉；远处似有巨物拨开枝叶，整片林子随之低伏。",
    "冰谷的朔风如刀刮过耳廓，呼气瞬间成白雾又被风撕碎；绝壁上冻尸的衣摆僵直如旗，脚下冰裂的细响让人不敢落脚。",
    "荒原的枯草没过脚踝，每走一步都惊起一片扑棱棱的飞虫；天边低垂的云压着紫，远处狐群的绿瞳在暮色里连成一线。",
    "溶洞外的雾带着硫的刺鼻，岩缝里渗出的水叮咚落入暗河；手电般的光扫过处，石壁上密密麻麻的爪痕教人脊背发凉。",
  ],
  "坊市": [
    "灵石相击的脆响混着南腔北调的吆喝，炸炉丹药的焦苦、新锻铁器的腥锈、还有不知谁袖中脂粉的甜腻，在人群蒸腾的热气里绞成一团。",
    "沿街布棚被风吹得噼啪作响，灵兽笼里传出低低嘶鸣；一股烤灵薯的甜香撞上丹药铺的清凉药气，教人一时分不清南北。",
    "画舫连舟，桨声搅碎灯影；舱里碰杯的脆响混着丝竹，水面上浮着酒香与脂粉，偶尔有失手落水的灵器'扑通'一声沉了底。",
    "鬼市的灯笼是惨绿色的，照得每张脸都像蒙了层灰；交易只在袖中捏指比划，偶尔有魂灯幽幽亮起，映出摊主没有瞳孔的眼。",
    "赌石摊前围满人，切石声'刺啦'带起石粉；有人爆出狂喜的嚎，有人瘫坐咒骂，铁锈与汗的味道在闷热的棚里发酵。",
    "矿镇的空气永远浮着一层灰，矿工咳嗽声此起彼伏；远处选矿的哗啦水声里，混着灵矿被碾碎时那一丝极淡的清冽。",
  ],
  "禁地": [
    "青绿的瘴气贴着地皮游走，腥甜得像烂熟后发酵的果子；谷底飘来断续低语，听不真切，寒意却已顺着尾椎一节节爬上后颈。",
    "断碑半埋在黑土里，缝隙渗出幽蓝微光；风穿过白骨堆发出呜咽，空气里是铁锈与陈年血气的混合，舌根无端泛起腥味。",
    "倒悬深渊底的风是往上走的，带着碎岩的凉；石笋如獠牙垂到眼前，深处传来不可名状之物的吞咽，每一下都震得牙关发酸。",
    "熔狱的热浪扑面，皮肤瞬间绷紧；岩浆奔流的轰鸣盖过一切，空气里浮着焦裂的魂屑，吸一口便如吞下烧红的针。",
    "忘川水黑得吞光，摆渡老叟的桨划开细密的腥；对岸似有万千冤魂在低语，每听清一个字，心头便莫名空了一块。",
    "死地寸草不生，连风都寂；脚下枯白的骨粉一踩就陷，远处一座无门之殿静静立着，殿前香案上的供品却还新鲜。",
  ],
  "秘境": [
    "千百柄断剑斜插在崖壁里，风灌过剑窟，铮铮如千百人同啸；剑意凛冽，刮得面颊生疼，连呼吸都像吞了碎冰。",
    "洞府石门爬满发光苔痕，灵气浓得几乎凝成雾；水滴落在玉髓上的清响回荡不绝，深处似有器物嗡鸣，引得掌心微麻。",
    "浮空岛的云阶每踏一级便轻一寸，仿佛身子要飘起来；岛心古修的呼吸长如潮汐，周身瑞气随呼吸明灭，照得人影忽长忽短。",
    "镜湖水面平得没有一丝纹，俯身却见水中另有一界——那边的'你'正缓缓抬头，瞳孔里映出这边的自己。",
    "万妖遗巢以骨垒成，蛋鸣如婴泣自巢心传来；巢壁缝隙渗出黏稠的暖腥，每走一步，脚下都陷进半指深的软骨粉。",
    "残界碎片悬浮在虚空中，落地处引力忽左忽右；远处一截古殿飞檐缓缓旋转，檐角铜铃响起的瞬间，时间仿佛倒流了一息。",
  ],
  "试炼": [
    "塔身没入云海，风在层叠回廊间撞出连绵长啸；每踏上一级石阶，壁上禁制便嗡然一震，脚底麻意顺腿筋直窜后心。",
    "剑冢森森，万剑倒插如林，寒气从地底渗出；偶有剑鸣自远处传来，像是有人在看不见的尽头比斗，杀意凝成细针扎在太阳穴。",
    "无回廊两侧是无尽的镜，每面镜里都是回忆里最悔的那一幕；越往前走脚步越重，身后的影子却越来越不甘心地在拽。",
    "焚心阵内妄念凝成实体，方才还温言软语的故人，转眼化作獠牙扑来；斩碎一个，便有一缕自己的气息被吞没。",
    "雷池的紫电在脚下炸开，焦味钻进鼻腔；每一次引雷灌顶都像有人攥着心脉拧，撑过去一步，皮肉便裂开又愈合。",
    "九死桥悬在虚空裂谷上，桥板随脚步明灭；桥下是翻涌的劫云，偶尔探出一只骨爪想勾脚踝，风里全是铁与骨的腥。",
  ],
  "仙迹": [
    "琼楼玉宇浮在云涛之上，仙乐缥缈得辨不出宫商；瑞光如细雨垂落，万籁俱寂，只剩一道似钟非钟的道音在颅骨里嗡鸣。",
    "霞光铺成碎金般的路，异香不似人间花木，倒像把整座春山熬成了蜜；远处仙禽掠过，羽尖拖出的光痕久久不散。",
    "不周山残脊断处仍漏着太古清气，吸一口便觉五脏六腑被洗过；撑天柱的裂痕里偶有金液滴落，落地即化作小小的虹。",
    "归墟之门半开，门后是无始无终的寂静，连自己的心跳都显得吵；门缝溢出的光不暖不冷，照见的事物都失了颜色。",
    "九霄云阙的阶上步步走漏光阴，才上三级便觉指尖枯了一寸；登顶回望，山下已是三世草木枯荣。",
    "菩提道场一株枯树，半边生叶半边燃着无烟的火；叶落处皆成偈语，火过处灰里又抽出新绿，香是冷的，却暖了神魂。",
  ],
};

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
  "后山禁地立着七根无字碑，据说刻着历代掌门的死因",
  "入门弟子须以心头血喂养一枚本命玉简，玉碎则人亡",
  "宗门岁岁举办'问心会'，答错者须自断一指",
  "藏经阁最深处锁着一只空棺，棺上写着'待主归来'",
  "护山大阵以三千活人魂魄为引，每逢朔日便哀嚎不绝",
  "门中长老皆戴着青铜面具，少有人见过他们摘下面具的模样",
  "镇派灵兽是一头瞎眼的老龟，据说它活过了三朝更迭",
  "弟子入门第一课是亲手埋葬一名同门，美其名曰'悟死'",
  "宗门地底埋着一座活的迷宫，进去迷路的人从未出来过",
  "门派信物是一枚会流泪的铜铃，每逢劫难便自鸣不止",
  "每年重阳，掌门须独自进入后山，归来时总少了些什么",
  "弟子修至金丹，须剜出一颗内丹献给宗门，作为忠诚之证",
  "山门两侧石狮口中含珠，珠落则护山大阵自行崩解",
  "宗门圣地为一片永不结冰的寒潭，潭底沉着历代逆徒的尸骨",
];

const NPC_SURNAME = ["云", "风", "墨", "苏", "叶", "楚", "凌", "白", "洛", "沈", "顾", "萧", "陆", "谢", "秦", "慕容", "上官", "司徒", "南宫", "北冥", "东方", "百里"];
const NPC_GIVEN = ["无尘", "清虚", "凌霄", "听雪", "忘机", "逸尘", "长歌", "惊鸿", "若虚", "玄机", "问天", "星辰", "沧海", "清风", "问情", "破军", "贪狼", "青鸾", "墨白", "寒衣", "照影", "晚晴", "扶摇", "知微"];
const NPC_TITLE = ["长老", "圣女", "魔尊", "散人", "丹师", "剑痴", "妖王", "器灵", "神算", "药童", "执事", "护法", "传人", "游侠", "鬼医", "巡察使"];
const NPC_TRAIT = ["喜怒无常", "城府极深", "嗜酒如命", "仁义为先", "冷若冰霜", "贪财好利", "痴迷炼器", "心系苍生", "诡计多端", "沉默寡言", "傲骨嶙峋", "外冷内热", "烂漫天真", "睚眦必报", "慈悲带刀", "痴情种", "怕死如命", "偏执成狂", "游戏人间", "重诺轻生", "食古不化", "见猎心喜", "守口如瓶", "悯妖如己", "嗜赌成性", "厌弃红尘", "以怨报德", "滴水之恩必偿", "口蜜腹剑", "铁面无私", "天涯孤客", "胸有丘壑"];

const RUMOR_TEMPLATES = [
  "传闻${region}深处封印着上古${thing}，得之可${benefit}。",
  "坊间盛传${faction}手中握有${secret}，引发诸方觊觎。",
  "${npc}据传已闭关百年，欲参透那桩${mystery}。",
  "${region}近来灵气异动，似有${thing}将出世，${faction}已暗中派人镇守。",
  "有散修赌咒，${npc}曾于${region}得一${secret}，自此修为突飞猛进。",
  "${faction}高价悬赏${region}中的${thing}，传言得主可${benefit}。",
  "${npc}三日前现身${region}，袖中似藏着半卷${secret}，惊动一方。",
  "有酒客醉语：${region}地下镇着一桩${mystery}，每逢血月便有异声。",
  "${faction}与${npc}结下死仇，只为争那件藏于${region}的${thing}。",
  "${region}老樵夫说，山崩时露出过${secret}的入口，至今无人敢入。",
  "传闻${npc}以${thing}为媒，窥见一线${mystery}，自此性情大变。",
  "${faction}宗祠夜夜有哭声，族中长老讳莫如深，似与${secret}有关。",
  "${region}的井水近来泛红，乡民传是${thing}将醒的征兆。",
  "江湖传${npc}将${secret}一分为三，藏于${region}三地，集齐者可${benefit}。",
  "${faction}倾力封锁${region}，只因那里埋着关乎${mystery}的禁忌。",
  "落魄散修临终漏口风：${region}尽头的${thing}，正是${npc}当年陨落之因。",
  "有童谣唱遍${region}：'碑开则劫至'，所指似是那桩${mystery}。",
  "${faction}圣物失窃，线索皆指向携${secret}遁入${region}的${npc}。",
  "${region}每逢雷夜便浮起一座虚桥，传说桥那头锁着${thing}。",
  "${npc}立誓：寻回失落的${thing}前，绝不踏出${region}一步。",
  "${faction}以十万灵石购得残图，图上标着${region}中${thing}的方位。",
  "${region}最近迁来一批哑仆，只知日夜挖掘，似在找${secret}。",
];
const RUMOR_THING = ["残阵", "妖丹", "仙骸", "古碑", "灵脉", "魔兵", "道果", "先天灵根", "龙鳞", "星盘", "血玉", "魂灯", "骨笛", "雷池", "幻镜", "妖丹", "剑冢", "药典", "天书残页", "玄龟甲", "九幽锁", "万年蚕茧"];
const RUMOR_BENEFIT = ["功参造化", "延寿百年", "威震一方", "破境无碍", "白日飞升", "肉身成圣", "断肢重生", "窥见天机", "号令群妖", "剑心通明", "逆乱阴阳", "重铸根基", "免却心魔", "唤醒前世", "踏碎虚空", "炼化业火", "通晓万法", "不死不灭", "渡尽劫波", "执掌一界", "洗尽铅华", "超脱因果"];
const RUMOR_SECRET = ["失传秘典", "通天灵宝", "宗门秘辛", "长生药方", "夺舍之术", "上古血誓", "龙族遗训", "断魂琴谱", "星官手札", "幽冥路引", "九转丹方", "镇界符印", "噬魂咒文", "轮回簿残页", "补天遗石", "万妖图录", "虚空阵图", "谪仙罪印", "天命嫁衣", "太古签文", "无字天碑", "彼岸花种"];
const RUMOR_MYSTERY = ["轮回之秘", "飞升之径", "时空裂隙", "以魂饲剑之法", "逆天改命之术", "山海倾覆之因", "万古寂灭之劫", "仙人下凡之真意", "天道残缺之由", "众生棋局之主", "有情皆苦之谶", "诸界同源之证", "光阴倒流之法", "神魂不灭之论", "因果倒置之祸", "九霄之上有人", "大梦谁先觉", "血肉为祭之盟", "镜中另有一界", "无名无相之道", "万物有灵之秘", "归墟尽头之境"];

const TREASURE_SPOT = ["寒潭", "古洞", "枯井", "断碑之下", "老树空心", "祭坛残垣", "剑痕石壁", "沉沙之底", "冰川裂隙", "雷劫残坑", "悬空岛腹", "无底竖井", "血祭石台", "残破丹炉", "妖兽巢穴", "星陨深坑", "镜湖之心", "骨林深处", "云外孤峰", "地火熔窟", "遗忘回廊", "虚空裂隙"];
const TREASURE_ITEM = ["万年灵乳", "太古剑胚", "九转金丹方", "御风翅", "避水珠", "摄魂铃", "养魂木", "破障神符", "虚空法相图", "龙血锻骨膏", "星陨铁母", "太素清气", "轮回往生灯", "千机傀儡核", "菩提明心叶", "噬魂魔刃", "补天五色石", "九幽黄泉引", "混元一气幡", "须弥纳戒", "天命签筒", "太古妖丹"];

const OMENS = [
  "本界灵气近来异动，传闻有大机缘将现于世间。",
  "血月将至，魔修蠢动，正道各派严阵以待。",
  "千年一遇的灵潮正在酝酿，闭关事半功倍。",
  "上古封印松动，邪祟时有现身，凡俗惶惶。",
  "星陨如雨，天机紊乱，神算者皆言变数将至。",
  "灵脉迁徙，诸多秘境入口随之浮现，引无数修士竞折腰。",
  "南海生莲，传闻花开之时，可得一缕成仙之机。",
  "北原雪线退去三里，露出一截刻满符文的远古脊骨。",
  "万剑崖一夜尽折，剑修皆言：'剑道将易主。'",
  "凡间骤现长明不灭的灯火，据说照处必有重宝。",
  "东海潮水倒灌三日，露出水底一座沉睡的城。",
  "诸宗掌门同时梦见同一句谶语：'第九界开了。'",
  "灵药一夜成精，化作孩童满山奔跑，见人便躲。",
  "天裂一缝，漏下几滴金雨，落地生出不死草。",
  "古战场亡魂集体噤声，似在等待某个名字被念出。",
  "坊市惊现会说话的残简，只肯对缘法深厚者开口。",
  "本界寿星接连坐化，临终皆指天而笑，无人知其意。",
  "十万大山深处传来龙吟，沉寂千年的妖族圣鼓随之擂响。",
  "一道无源剑光悬于中州上空，七日不散，削尽来犯之念。",
  "稚童皆能夜观星象，老者却说：'星早就错了位。'",
  "忘川水倒流半刻，溺死之人纷纷睁眼，又说不出话。",
  "九霄垂下一根银线，触者皆闻一声'归来'，如见故人。",
];

// ---------- 下级地点（每域若干处，构成"几百个地方"的密集世界） ----------
// 类型：hub=可歇脚/交易的平和点；其余按危险增量标定
// hooks：本类型地点专属的剧情钩子（每回合随机抽一条），让"古墓/妖洞/茶楼/药市"等不同地点自然衍生出截然不同的事件
const SUBLOC_TYPES = [
  { type: "村寨", suf: "村", dangerAdj: -1, hub: true,  flavor: ["炊烟袅袅，鸡犬相闻，村民多以渔猎耕织为生"],
    hooks: ["村中张灯结彩正在办丧/婚，亡者家属/喜婆泣笑不一，背后藏一段陈年旧怨",
            "老井一夜枯干，井底浮出一面铜镜，镜中人脸并非映者",
            "猎户失踪归来，怀中抱回一只满身符文的幼狐",
            "粮仓夜间起火却无人伤亡，灰烬下露出半截带字的古碑"] },
  { type: "集镇", suf: "集", dangerAdj: 0,  hub: true,  flavor: ["三教九流汇聚，叫卖声不绝，暗中也做着见不得光的买卖"],
    hooks: ["镇上贴出江湖令悬赏某失踪剑客，赏银却被反复划去重贴",
            "货郎卖一种叫'归乡酒'的玩意儿，喝过的人都忘记了离别的人",
            "赌坊设了一个'不许说真话'局，连场内侍卫都被套了进去",
            "一名穿旧袍的老者摆摊替人写绝笔信，每个客人都哭得不能自己"] },
  { type: "客栈", suf: "驿", dangerAdj: -1, hub: true,  flavor: ["歇脚打尖之所，往来修士在此交换消息，酒肆后常藏着密谈"],
    hooks: ["地字号房一夜三易其主，每位住客次日都失了一缕记忆",
            "掌柜言道近日无人住过、却每日有同样账单寄出",
            "酒肆后院老井传出吟诗声，扔石子进去会被一句诗'骂'回来",
            "某位住客留下一只内丹形状的酒盏便失踪，盏内灵气今晨忽转"] },
  { type: "茶楼", suf: "楼", dangerAdj: -1, hub: true,  flavor: ["一盏清茶听尽江湖事，说书人讲的尽是别处奇闻"],
    hooks: ["说书先生新本正讲到'某某大侠的陨落之夜'，台下某位戴斗笠者忽然离席",
            "二楼雅间独饮的女子点了七盏茶，每盏价格皆不同，却只饮一口",
            "今日无人知会却满座，他们似乎都在等同一个消息",
            "说书人讲到'那年的仙魔会战'，掌柜慌忙关灯打烊，往外声称'没有今夜'"] },
  { type: "药市", suf: "市", dangerAdj: 0,  hub: true,  flavor: ["灵草丹丸琳琅，药香混杂汗气，懂行的方能淘到真宝"],
    hooks: ["一枚号称'九转还魂丹'被三方暗中出价，价格成了一种暗号",
            "药炉老匠当街试验一种新火候，围观者中一人忽然呕血",
            "毒宗弟子混入其中收购某味草，有人上前低声一语对方便仓皇遁走",
            "收摊的老妪遗落一只玉瓶，瓶中液体会随看见的人说不同的话"] },
  { type: "书院", suf: "斋", dangerAdj: -1, hub: true,  flavor: ["朗朗书声里藏着道韵，寒门子弟于此借读书明理"],
    hooks: ["山长深夜将一卷竹简交你过目，嘱'读后即焚'，内容涉朝代更迭",
            "晨读弟子齐声背的经文里夹了一行只有你能听见的秘语",
            "书院地窖挖出一具衣着华贵的枯骨，胸中抱着一枚未消化的道种",
            "论道会上有人以'情'破理，把山长辩得哑口片刻"] },
  { type: "武馆", suf: "武馆", dangerAdj: 0, hub: true, flavor: ["演武场上拳脚生风，馆主多是身经百战的旧人"],
    hooks: ["踢馆者点名要战馆主旧日爱徒，胜者可带走一柄馆中长刀",
            "演武场夜里传出铁器入肉之声，晨起却无人受伤",
            "馆中师叔一夜白头，闭门不出，临门时留下一句'叛徒未死'",
            "拳谱一页写着'于第七式中藏杀招'，曾有人照练过——已不知所踪"] },
  { type: "医馆", suf: "医馆", dangerAdj: -1, hub: true, flavor: ["悬壶济世，亦有以人试药的邪医混迹其中"],
    hooks: ["邪医留下一瓶未命名的药丸，主治'忘情'，但副作用会忘命",
            "急症求诊的孩子说出的话与祖父昨夜梦中所闻一字不差",
            "馆主夜间为人诊治时对方忽变为邪物，馆主熟稔地一掌拍碎",
            "一副五脏六腑图解竟出自三百年前的禁书，被装裱挂于厅堂"] },
  { type: "船坞", suf: "津", dangerAdj: 0,  hub: true,  flavor: ["桅杆如林，船歌彻夜，水客们赌咒说见过水底古城"],
    hooks: ["一位船员声称夜半梦见自己在水底点着红灯笼赶路",
            "昨夜归来渔船上挂着的网捕到一块刻满道文的鳞片",
            "船坞老船匠私下说，新船下水前都得先由他往龙骨下血祭——'以前的规矩'",
            "船歌里夹了一句听不懂的语言，但每个哼唱的人都潸然泪下"] },
  { type: "渔村", suf: "渔村", dangerAdj: -1, hub: true, flavor: ["咸风裹腥，渔火点点，老渔夫的见闻比县志还厚"],
    hooks: ["风浪过后村前的礁石群里搁浅了一条银色大鱼，鱼在哭",
            "村长出示一枚世代供奉的'溺者令'，令上姓名会不断更迭",
            "出海归来的人不认得妻子，却对一条鱼行礼像对故人",
            "夜半所有渔火忽然同时熄灭，又同时亮起——只换了颜色"] },
  { type: "猎户", suf: "猎庄", dangerAdj: -1, hub: true, flavor: ["猎户结庄而居，对地界险恶处了如指掌"],
    hooks: ["猎头奉劝不要往东走三日，并指给你一处'前辈埋骨'的洞",
            "围猎中捕获的山魁求你转交一封给某位旧同学的绝笔信",
            "猎庄地下石室里摆满形状各异的'镇灵木牌'，每一块都写着名字",
            "昨日追入林中的猎户今晨归来，却忘了自己是谁"] },
  { type: "道观", suf: "观", dangerAdj: 0,  hub: false, flavor: ["香火缭绕，道韵悠长，观中人或已看破红尘，或另有所图"],
    hooks: ["观主请你于三清像前点一炷香，火焰颜色不对你会冷汗直流",
            "院中枯井连月呜咽，今晨你听得见里头在数自己的生辰",
            "夜半钟声无人撞却响三十六下，院中弟子皆避",
            "供桌上的枣泥里藏着一枚玉简，需以舌尖血方可解封"] },
  { type: "剑坪", suf: "坪", dangerAdj: 1,  hub: false, flavor: ["断剑插地成林，杀气未散，是试剑者也在此印证剑心"],
    hooks: ["断剑群里有一柄会在你靠近时微微震颤，拔则风起云变",
            "昨夜有剑修立剑于坪心立誓，剑光直升霄汉却未离去人",
            "你试剑斩落一片叶时，听见有剑说'等了三百年，就为等你这一斩'",
            "断剑插得最深处那柄，对着你要一段情债"] },
  { type: "灵泉", suf: "泉", dangerAdj: 0,  hub: false, flavor: ["灵泉汩汩，雾气蒸腾，入浴可洗去一身尘秽与暗伤"],
    hooks: ["泉眼在子时吐出一枚带字的小石片，'她在第三层'",
            "泉水在某位沐浴者入水时骤温，对别人却冰凉入骨",
            "泉底放着一面鼎镜，水面会映出你身后另一个人影",
            "浴后伤是好了，但身上多出一道原先没有的剑痕"] },
  { type: "药谷", suf: "谷", dangerAdj: 1,  hub: false, flavor: ["灵药遍野却守护森严，采药人十去其三"],
    hooks: ["谷口石像睁眼，指向'沿此径向第七步'，错位将撞上毒瘴",
            "采药女笑着送你一颗'金丹'，其实是化形未全的幼蛟",
            "谷中有一味'忘忧草'，老者说他已为其除草七次仍想再除一次",
            "你脚下的'药草'其实是被封印的妖物，某一声雷响便醒"] },
  { type: "古墓", suf: "冢", dangerAdj: 3,  hub: false, flavor: ["封土之下埋着上古修士，陪葬的机缘与杀机同样可观"],
    hooks: ["墓门以八字咒封，须由活人念出死者名讳方可启——'你叫什么'",
            "墓室壁画会随你的步伐'补'上你未竟之事",
            "陪葬的金缕玉衣竟然在呼吸，胸膛处裹着的不是枯骨而是一枚元婴",
            "主墓室棺椁中浮出一张字条：'我等你很久了。带我去见如今的宗门'"] },
  { type: "妖洞", suf: "妖窟", dangerAdj: 3,  hub: false, flavor: ["腥风自洞中涌出，洞壁画满爪痕，深处似有绿瞳窥伺"],
    hooks: ["洞口守护的幼妖冲你作揖，'请把娘亲的遗物送还妖王城'",
            "洞壁爪痕里嵌着一柄前次遇害者的剑，剑主在梦里向你讨债",
            "深入便见一窝尚未睁眼的幼崽，母妖不在——但附近气场很重",
            "洞底有一人形石，被缚妖链锁着，看见你后说出一段你前世的话"] },
  { type: "魔窟", suf: "魔窟", dangerAdj: 4,  hub: false, flavor: ["魔气渗壁，怨魂哀嚎，闯入者多被同化成了新的 guards"],
    hooks: ["窟内守卫全是'昨日还活着'的江湖人，他们的眼里还有你认得的光",
            "窟中王座上坐着一具'你'的骸骨，颈项挂着你的入门玉牌",
            "魔气在你耳边低语你近来最不愿面对的一个失误，并要你从它手里接下'赎罪之刃'",
            "窟底潭水不染尘，倒映的是你从来没见过的'另一段自己'"] },
  { type: "残阵", suf: "残阵", dangerAdj: 3,  hub: false, flavor: ["上古杀阵余威尚在，一步踏错便万箭穿心"],
    hooks: ["阵中幽灵托出半枚令牌，'合则全，缺则亡'",
            "你踏入的那一步地面亮起阵纹——你前世曾踏出的那一步",
            "主阵眼被人偷换了一颗核心，'原来阵主就站在你身后'",
            "阵灵现身对你行礼：'前辈子你替我留的火种，今日请收回去'"] },
  { type: "祭坛", suf: "祭坛", dangerAdj: 2,  hub: false, flavor: ["血色符文在石上流转，似在等候某个被献祭的名字"],
    hooks: ["祭坛附近发现一具新亡的胎儿尸，裹着与你血脉相连的法器",
            "坛上文在你念出后会变更——它听见了你的名字",
            "祭坛朝某方向下跪，那个方向正是你宿仇所在",
            "夜半祭坛自己点燃香火，对你的所在地遥遥一叩"] },
  { type: "废墟", suf: "墟", dangerAdj: 2,  hub: false, flavor: ["倾颓的殿宇半埋黄沙，风穿过梁柱如泣如诉"],
    hooks: ["残壁上忽然出现一面完整铜镜，镜中是当年的开派大典",
            "沙下露出一只手，手心里攥着你师门遗失的那件信物",
            "风过处一缕残魂飘至你耳畔：'莫去那条路，某人正等着你'",
            "主殿牌匾跌落，恰露出下一行的字——'第几代弟子不肖'"] },
  { type: "矿洞", suf: "矿", dangerAdj: 2,  hub: false, flavor: ["幽深矿道里灵矿与尸骨同眠，矿工满面尘灰"],
    hooks: ["矿道尽头矿灯一盏不灭，灯下骸骨正是失踪数月的同门",
            "凿到一种会发出低声呢喃的灵矿，呢喃内容是你接下来要做的一件事",
            "矿壁上刻着前辈们留下的'不可再挖一尺'，原因无人记起",
            "矿底发现一窝刚孵化的灵虫，虫鸣声传出洞口外百丈"] },
  { type: "秘洞", suf: "秘窟", dangerAdj: 2,  hub: false, flavor: ["洞壁生着发光苔痕，深处或有未醒的古修遗蜕"],
    hooks: ["苔光在你靠近时熄灭了一盏，仿佛有人捂住一盏灯",
            "洞中某处有一人形石榻，榻上遗蜕散发你熟悉的灵气",
            "秘窟入口石壁上画着前代修士的闭关图，你正好坐在他当年所坐的位置",
            "洞口处刻着'回来'，是你上一世的字迹"] },
  { type: "古战场", suf: "古战场", dangerAdj: 3, hub: false, flavor: ["白骨露于野，断戟插满焦土，夜半犹闻金戈之声"],
    hooks: ["白骨群中有一具穿着你师门服饰，怀中抱着一封印未拆的战报",
            "夜半的'金戈'其实是列阵魂在排演明日你将踏入的某一战",
            "残戟林立中一柄应你之意而起，剑灵对你说'这次让我替你做主一次'",
            "焦土中露出一卷未完成的《仙史》，其中一页写着你师祖年轻时的事"] },
  { type: "天梯", suf: "天梯", dangerAdj: 1,  hub: false, flavor: ["千级石阶直入云霄，每登一级便轻一寸，登顶者已历三世"],
    hooks: ["第七级台阶处放着一只你前世用过的酒壶，壶中还有半盏温酒",
            "每级石阶刻的是同一个名字——'他'，越往上名字越发清晰",
            "中途有人影对你微笑：'等你第三世再登顶，那时我便随你'",
            "登顶后云海中只剩一面古镜，镜中映出一位与你长得很像、却老得多的女子"] },
  { type: "星台", suf: "星台", dangerAdj: 1,  hub: false, flavor: ["夜观星象的祭台，石面刻满失传的星官手札"],
    hooks: ["今夜主星被黑雾遮蔽，预示你宿敌将走近三步之内",
            "你伸手触台，掌心多了一颗星——并闻得一段远古之誓",
            "手札里有一页被撕去，留痕是'曾判某人性命，今为其书'",
            "星台中央忽然陷下一寸，落出一枚尚未命名的星官印"] },
  { type: "妖市", suf: "妖市", dangerAdj: 2,  hub: false, flavor: ["人妖杂处的暗市，只认暗号不认脸，交易皆以魂灯为凭"],
    hooks: ["摊主伸手要的不是灵石，是'你童年最难言的一个秘密'",
            "妖市的灯火依次熄灭又亮起，跟着你走了三条巷",
            "一只幼狐抱着你的脚踝泪眼说：'先把它交给我，不要让王先拿到'",
            "今日暗市挂出悬赏，悬赏的不是命，是你身上某段功法的源头"] },
  { type: "鬼市", suf: "鬼市", dangerAdj: 2,  hub: false, flavor: ["惨绿灯笼照得每张脸都蒙了灰，摊主多无瞳孔"],
    hooks: ["摊主亮出一卷'替生死簿'，让你在空白处签下明日所遇者之名",
            "你的旧相识鬼魂在摊前等你，手里攥着一封你前世写给她却没寄出的信",
            "今天某位摊主摘下面具，正是昨日还活着的某个师兄",
            "鬼市尽头开了一桌酒，坐着的全是'曾被你救过或被你负过'的亡魂"] },
];
// 雅致地名构件
const SUBLOC_PREFIX = ["浣","听","栖","忘","落","归","漱","枕","沐","霁","岚","渚","岫","澧","潇","潆","潋","青","寒","烟","月","云","星","霜","雪","花","柳","桃","竹","松","枫","梅","兰","芷","蘅","萍","菱","荷","汀","沚","矶","溪","沧","苍","凌","碧","幽","玄","沉","栖","浮","澹"];
const SUBLOC_MID = ["溪","谷","崖","渊","岭","峰","涧","林","浦","渡","关","城","镇","墟","寨","坊","市","巷","观","台","阁","亭","桥","洞","府","庄","院","庐","斋","馆","津","滨","畔","湄","浒"];

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
      const sensoryPool = REGION_SENSORY[t.type] || REGION_SENSORY["凡俗"];
      return {
        name: nm, type: t.type, danger: t.danger, realm: t.realm, desc: pick(t.flavor),
        sensory: pick(sensoryPool),
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

    // 4) 名动人物（每个都有独立档案与立绘，可随剧情生长记忆）
    const npcs = [];
    const ncount = ri(8, 12);
    const titleGender = (t) => {
      if (/圣女|仙子|女侠|妖姬|魔女|道姑|巫女|狐女|鬼姬|女帝|婆婆|娘/.test(t)) return "f";
      if (/魔尊|道长|狂徒|侠客|书生|壮士|公子|大哥/.test(t)) return "m";
      return rng() < 0.5 ? "m" : "f";
    };
    const titleArche = (t) => {
      if (/圣女|仙子|女侠|妖姬|魔女|道姑|巫女|狐女|鬼姬|女帝/.test(t)) return "xianzi";
      if (/魔尊|魔|邪/.test(t)) return "mo";
      if (/道长|散人|真人|游侠/.test(t)) return "xia";
      if (/剑痴|剑/.test(t)) return "sword";
      if (/丹师|药|医/.test(t)) return "alchemist";
      if (/妖王|妖/.test(t)) return "yaoxiu";
      if (/鬼|幽|冥/.test(t)) return "ghost";
      if (/器灵|器/.test(t)) return "spirit";
      if (/神算|巡察|执事|护法|传人|长老/.test(t)) return "scholar";
      return "scholar";
    };
    const npcGoal = ["寻回失落的本命法宝","参透一道悬而未解的古阵","了结百年前的一桩血仇","护佑门下弟子平安成长","窥破此界飞升之秘","积攒灵石重振门楣","寻访生死未卜的旧友","镇压体内躁动的凶煞之气","替恩主完成未竟遗愿","在乱世中为弱小者争一线生机","赎去年少时铸下的大错","等一个再也不会来的人"];
    const npcBond = ["与" + pick(factions).name + "有旧","曾是" + pick(factions).name + "的死敌","暗中庇佑着一方凡俗村落","与某位名动人物有血缘之契","门下弟子遍及各域","似乎识得玩家前世残魂","背着一道不可言说的禁令"];
    for (let i = 0; i < ncount; i++) {
      let nm, g = 0;
      do { nm = pick(NPC_SURNAME) + pick(NPC_GIVEN); g++; } while (npcs.some((n) => n.name === nm) && g < 30);
      const title = pick(NPC_TITLE);
      const trait = pick(NPC_TRAIT);
      const gender = titleGender(title);
      const arche = titleArche(title);
      npcs.push({
        name: nm,
        title, trait, gender, arche,
        where: pick(regions).name,
        portraitSeed: hashSeed(nm) >>> 0,
        appearance: (gender === "f" ? "身姿娉婷" : "风骨凛然") + "，着" + pick(["青","素","绯","玄","月白","黯","雪","朱"]) + "色衣袍，眉眼间自有" + pick(["清冷","倔强","忧郁","疏离","狡黠","悲悯","傲然"]) + "之色",
        profile: {
          backstory: `${nm}以${title}之姿行走世间，性情${trait}。`,
          goal: pick(npcGoal),
          bond: pick(npcBond),
        },
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

    // 6.5) 下级地点（每域若干处，构成"几百个地方"的密集世界版图）
    const sublocations = [];
    const subUsed = new Set();
    const subName = (t) => {
      let nm, g = 0;
      do { nm = pick(SUBLOC_PREFIX) + pick(SUBLOC_MID) + t.suf; g++; }
      while (subUsed.has(nm) && g < 40);
      if (subUsed.has(nm)) nm = nm + ri(1, 99);
      subUsed.add(nm);
      return nm;
    };
    regions.forEach((r) => {
      const n = 12 + Math.floor(rng() * 11); // 每域 12-22 处
      for (let k = 0; k < n; k++) {
        let t;
        if (r.type === "凡俗" || r.type === "坊市") {
          const pool = SUBLOC_TYPES.filter(x => x.hub);
          t = pool[Math.floor(rng() * pool.length)];
        } else if (r.type === "禁地" || r.type === "试炼" || r.type === "秘境") {
          const pool = SUBLOC_TYPES.filter(x => !x.hub && x.dangerAdj >= 2);
          t = pool[Math.floor(rng() * pool.length)] || SUBLOC_TYPES[Math.floor(rng() * SUBLOC_TYPES.length)];
        } else {
          t = SUBLOC_TYPES[Math.floor(rng() * SUBLOC_TYPES.length)];
        }
        const nm = subName(t);
        const danger = Math.max(0, Math.min(10, r.danger + t.dangerAdj + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0)));
        // 故事钩子：从该类型钩子池随机抽 1 个，让"古墓/妖洞/茶楼/药市"等不同类型自然衍生出截然不同的事件
        const hook = (t.hooks && t.hooks.length) ? t.hooks[Math.floor(rng() * t.hooks.length)] : "";
        // 距离（里）：按当前 macro 中心极坐标 + 当前 sub 极坐标粗算；以 1 单位 ≈ 18 里估算，便于与脚程比对
        const cx = (macroByName[r.macro].zone.x0 + macroByName[r.macro].zone.x1) / 2;
        const cy = (macroByName[r.macro].zone.y0 + macroByName[r.macro].zone.y1) / 2;
        const dx = (r.x + (rng() - 0.5) * 60) - cx;
        const dy = (r.y + (rng() - 0.5) * 50) - cy;
        const baseFromRegionCenter = Math.round(Math.hypot(dx, dy) * 18);
        sublocations.push({
          id: r.name + "::" + k, region: r.name, macro: r.macro, type: t.type, hub: !!t.hub,
          name: nm, danger, desc: pick(t.flavor), hook,
          baseFromRegionCenter, // 距所属地域中心的里数（玩家从宗门/中心出发时用）
        });
      }
    });

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

    // 9) 关卡设计：标记可选分支节点（秘境/副本/支线），并确保每类至少一个
    const BRANCH_OF_TYPE = { "秘境": "secret", "试炼": "trial" };
    regions.forEach((r) => {
      if (BRANCH_OF_TYPE[r.type]) {
        r.branch = BRANCH_OF_TYPE[r.type];
        if (r.branch === "secret") r.timed = ri(4, 8); // 限时窗口（程）
      }
    });
    // 支线·恩怨：把一个带秘闻的地域（坊市/凡俗/宗门）标为 sidequest
    const sideCand = regions.filter((r) => ["坊市", "凡俗", "宗门"].indexOf(r.type) >= 0 && rumors.some((ru) => ru.indexOf(r.name) >= 0));
    if (sideCand.length) sideCand[0].branch = "sidequest";
    const ensureBranch = (type, branch, danger) => {
      if (regions.some((r) => r.branch === branch)) return;
      const cand = regions.find((r) => r.type !== "禁地" && r.type !== "仙迹") || regions[0];
      const tpl = REGION_TYPES.find((x) => x.type === type);
      cand.type = type; cand.danger = danger; cand.branch = branch;
      cand.desc = tpl ? pick(tpl.flavor) : cand.desc;
      if (branch === "secret") cand.timed = ri(4, 8);
    };
    ensureBranch("秘境", "secret", 6);
    ensureBranch("试炼", "trial", 8);
    ensureBranch("坊市", "sidequest", 1);

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
      sublocations,
      startLocation,
      startMacro,
    };
  },

  // 本地周常秘境：基于"年-周"种子生成，整周稳定、每周刷新；作为回访理由（跨玩家排行延后）
  weeklySecretRealm(seedBase) {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
    const rng = this.mulberry32(this.hashSeed((seedBase || "wk") + "-" + now.getFullYear() + "-W" + week));
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const macro = MACRO_REGIONS[Math.floor(rng() * MACRO_REGIONS.length)];
    const zone = macro.zone;
    return {
      name: pick(REGION_PREFIX) + pick(REGION_MID) + "·周秘",
      type: "秘境", danger: 9, realm: 7,
      desc: "本周限时开启的古老秘境，灵潮涌动，机缘与凶险并存——错过本周便须再候七日轮回。",
      sensory: "秘境入口的灵潮扑面，凉意里裹着千年未散的檀腥与金属鸣振；岩缝间金纹流转如活物游走，每迈一步都有细碎禁制在足底苏醒。",
      macro: macro.name,
      x: Math.floor(zone.x0 + rng() * (zone.x1 - zone.x0)),
      y: Math.floor(zone.y0 + rng() * (zone.y1 - zone.y0)),
      branch: "weekly", timed: 7, weekly: true,
      weekLabel: now.getFullYear() + "-W" + week,
    };
  },
};

// Node 端导出（浏览器中 module 未定义，自动跳过）
if (typeof module !== "undefined" && module.exports) {
  module.exports = WorldGen;
}
