// ============================================================
//  AI 接口层
//  支持 OpenAI 兼容 API (DeepSeek / Qwen / OpenAI / 本地 Ollama)
// ============================================================

const AIService = {
  // 读取本地配置
  getConfig() {
    return {
      apiKey:  localStorage.getItem("xianxia_api_key")  || "",
      baseURL: localStorage.getItem("xianxia_base_url") || "https://api.deepseek.com/v1",
      model:   localStorage.getItem("xianxia_model")   || "deepseek-v4-flash",
      temperature: parseFloat(localStorage.getItem("xianxia_temperature") || "0.85"),
      maxTokens:   parseInt(localStorage.getItem("xianxia_max_tokens") || "2000"),
    };
  },

  saveConfig(cfg) {
    localStorage.setItem("xianxia_api_key",  cfg.apiKey);
    localStorage.setItem("xianxia_base_url", cfg.baseURL);
    localStorage.setItem("xianxia_model",    cfg.model);
    localStorage.setItem("xianxia_temperature", String(cfg.temperature));
    localStorage.setItem("xianxia_max_tokens",  String(cfg.maxTokens));
  },

  hasConfig() {
    return !!this.getConfig().apiKey;
  },

  // 构建系统提示词：定义仙侠世界规则
  // ============ 玩家身份卡 / 灵宠卡 · 固定锚定（根治人设漂移） ============
  // 上方【当前角色状态】已全量灌入 character JSON，但机器可读的 JSON 混在易变数值里，
  // AI 易在长线中"漂移"身份（擅自改名、遗忘灵宠、按性别/出身预设命运）。
  // 此卡以自然语言 + 强指令显式锚定"叙事口径"的固定事实，与 JSON 互为表里。
  buildIdentityBlock(state) {
    const c = state.character || {};
    const name = c.name || "无名修士";
    const genderName = c.genderName
      || ((typeof GENDERS !== "undefined" && GENDERS.find)
        ? (GENDERS.find(g => g.id === c.gender) || {}).name : "")
      || "修士";
    const formName = c.formName || "人族";
    const rootDesc = (c.root || "灵根") + (c.element ? "（" + c.element + "）" : "");
    const aff = c.affinity || {};
    const affStr = `攻伐×${aff.攻击 != null ? aff.攻击 : 1}/守御×${aff.防御 != null ? aff.防御 : 1}/进境×${aff.修炼 != null ? aff.修炼 : 1}`;
    let card = `【玩家身份卡 · 固定锚定 · 绝不可漂移（务必始终以此为准）】\n`;
    card += `· 道号/姓名：${name}（此后全剧统一以「${name}」相称，不得改名、不得用其他代称或绰号代指本尊）\n`;
    card += `· 真身/形态：${formName}（魂穿之身，决定肉身与感官，非可随意更换之皮囊）\n`;
    card += `· 性别：${genderName}（仅影响 NPC 称谓礼数，见【身份与公平】，不得据此预设性格、际遇或命运）\n`;
    card += `· 出身：${c.background || "未知"}（来历背景，非命运枷锁——寒门亦可登顶，世家亦会陨落）\n`;
    card += `· 修行体系：${c.cultivationSystem || "灵根"} ｜ 本修之道：${rootDesc} ｜ 资质 ${affStr}\n`;
    card += `· 当前境界：${c.realm || "炼气期"}（第 ${c.realmLevel || 1} 大境）\n`;
    if (c.wish) card += `· 许愿：${c.wish}（暗线，自然呼应，不可喧宾夺主）\n`;
    if (Array.isArray(c.systems) && c.systems.length) {
      card += `· 金手指/系统：${c.systems.join("、")}（永久有效、始终在场，须周期性自然登场）\n`;
    }
    // 灵宠卡（固定羁绊，AI 最易遗忘的一环）
    card += `\n【灵宠卡 · 固定羁绊 · 务必牢记】\n`;
    if (c.pet && c.pet.name) {
      card += `· 名号：${c.pet.name} ｜ 类属：${c.pet.type || "灵兽"} ｜ 成长：${typeof c.pet.growth === "number" ? c.pet.growth : 0}\n`;
      if (c.pet.desc) card += `· 来历/特质：${c.pet.desc}\n`;
      card += `（灵宠是玩家早期最暖记忆点，须始终记得其名号与羁绊、自然融入日常剧情；不得擅自让其消失、改名或与既有性格矛盾。）\n`;
    } else {
      card += `玩家当前尚未缔结灵宠（前 3 程内本就不该有；此后机缘缔结须立即登记并牢记其名号与羁绊）。\n`;
    }
    return card;
  },

  buildSystemPrompt(state) {
    const memoryBlock = (state.memory && state.memory.length)
      ? state.memory.join("\n")
      : "（尚无记忆，这是旅途之初）";
    const c = state.character;
    const playstyleBlock = this.buildPlaystyleBlock(state);
    return `你是一款仙侠文字RPG《浮生仙途》的游戏主持人(GM)。你负责推动剧情、判定结果、演绎有血有肉的NPC。请以成熟网文作者的笔力去写。

【世界设定】
- 诸天万界，修行体系因界而异：本界以「${state.world.cultivationSystemName || "灵根"}」为修行之基（有的世界称灵根，有的称血脉、命格、道种、元素亲和、灵枢、儒道或武道；核心皆是对天地灵力的契合）。境界、功法、丹药、天劫、宗门、秘境为本界常制。
- 世界残酷而真实：修士争斗、资源匮乏、天劫无情、魔道横行、因果必报。
- NPC有独立性格、目的与记忆，会依据玩家声望、过往恩怨、当前处境做出不同反应；可给重要NPC起名，并让其反复登场。
- 玩家会受伤、会衰老、会死亡；死亡即终局，无重生（除非剧情明确给予续命之物）。

【当前角色状态】
${JSON.stringify(state.character, null, 2)}
（注意：character.inventory 为玩家当前储物袋清单；本回合若有物品增减，必须在 state_changes.items_gained / items_lost 中同步，否则储物袋不会更新。）

【玩家身份卡 · 固定锚定 · 绝不漂移（与上方角色状态 JSON 互为表里，此卡为「叙事口径」锚点）】
${this.buildIdentityBlock(state)}

【当前世界状态】
${JSON.stringify((() => { const w = Object.assign({}, state.world); delete w.gen; return w; })(), null, 2)}

【本界天地 · 此界天地已锁定，务必遵循其设定，剧情须贴合同一方世界，不可随意切换世界背景】
${this.buildWorldBlock(state)}

【当前地点 · 感官简报 · 须融于描写】
${this.buildLocationBrief(state)}

【玩家金手指 / 系统 · 务必持续记忆，绝不遗忘】
${(() => {
  const syss = (state.character && state.character.systems) || [];
  if (!syss.length) return "（玩家当前未觉醒任何金手指 / 系统）";
  return `玩家拥有的金手指 / 系统如下，是其修行之路的重要组成部分，须始终牢记并自然融入剧情：\n` +
    syss.map(s => `  · ${s}`).join("\n") +
    `\n注意：即使【仙途记忆】中未再提及，这些系统也【始终有效、始终在场】。须周期性让系统自然登场（发布任务、结算签到奖励、弹出提示、记录成就等），保持存在感；不可让其在后续剧情中无声消失。`;
})()}

【仙途记忆 · 务必参考以保持连贯】
${memoryBlock}

【主线 · 中央冲突 · 仙途之 spine · 务必贯穿始终】
${this.buildMainPlotBlock(state)}

【伏笔 · 暗线编织与回收 · 务必遵循】
${this.buildThreadBlock(state)}

【人物好感 · 务必参考以演绎 NPC 态度】
${(() => {
  const npcs = (state.npcs && Object.keys(state.npcs).length) ? state.npcs : null;
  if (!npcs) return "（尚无相交之人）";
  const lines = Object.keys(npcs).map(name => {
    const n = npcs[name];
    const a = n.affinity || 0;
    let senti = "中立";
    if (a >= 60) senti = "生死之交"; else if (a >= 30) senti = "亲近"; else if (a >= 10) senti = "友善";
    else if (a <= -60) senti = "敌对"; else if (a <= -30) senti = "忌惮"; else if (a <= -10) senti = "疏远";
    const extra = n.title ? `（${n.title}）` : "";
    return `  - ${name}${extra}：好感 ${a > 0 ? "+" : ""}${a}（${senti}）`;
  });
  return lines.join("\n");
})()}
- 对已有 NPC 一律使用与本表完全一致的名字（如"苏璃"勿写作"苏仙子"），以便好感累积到同一人；新登场的重要人物也请采用稳定全名。
- 玩家行侠仗义、救人济世、除暴安良，应在 state_changes.justice_change 记正数、对受益 NPC 在 npc_affinity_change 记正数；若行凶作恶、背信弃义、残害无辜，则在 evil_change 记正数、相关 NPC 好感记负数。NPC 态度须随好感真实起伏（友善者愿相助，敌对者或暗下杀手）。

【身份与公平 · 务必遵守】
- 性别、真身（如"超市购物袋"）等仅为角色的身份标识，用于NPC以相应礼数称谓相称（男称道友/道长，女称仙子/道友，异类亦以道友待之），不得以此预设其性格、际遇、能力或剧情走向。
- 男或女、出身寒门或世家，都可能在任何道路上成就或陨落。剧情走向完全由玩家自己的选择驱动，而非由出生标签决定。

【玩家风格 · 由其行为自然生长，须顺应而非预设】
${playstyleBlock}
- 以上风格完全来自玩家至今的实际选择，并非出生设定。请在后续剧情中顺应其偏好，多给予此类机缘与挑战；若玩家转向新行为，风格随之改变。
- 严禁以性别、出身等身份标签预设剧情走向或限制玩家可走的道路。

【本回合节奏指令 · 由体验引擎依当前境界与程数下发，务必遵循】
${this.buildPacingBlock(state)}

【叙事篇幅 · 由玩家所选节奏决定，务必严格遵循】
${this.buildNarrativeModeBlock(state)}

【仙侠风物图谱 · 可自然化入剧情，增世界质感】
- 本界修行之基为「${c.cultivationSystem || "灵根"}」：修行者各承一道（玩家为「${c.root}」${c.element ? "，属"+c.element : ""}；攻伐×${c.affinity.攻击}/守御×${c.affinity.防御}/进境×${c.affinity.修炼}）。资质影响进境速度，非定命运；除本界体系外，亦有宗门、妖兽、丹道法宝、秘境禁地、天材地宝、正邪之争等常制。
- 宗门架构：大宗多设诸脉（剑脉、丹脉、器脉、阵脉、符脉、道脉、戒律），外门→内门→亲传逐级资源递增；中立商盟（如天星商会）发布任务、以稀缺资源（筑基丹等）为酬。
- 妖兽灵兽：分九阶对应境界（一阶≈炼气，九阶≈渡劫）；化形级以上近人族。收服灵兽常立血契，可通心语、共享修为；神兽血脉（青龙/白虎/朱雀/玄武）稀有而强。灵宠可伴战、探矿、采药。
- 丹道法宝：丹药分疗伤/突破/增益/毒/特殊诸类（辟谷丹、聚气丹、筑基丹、回春丹…），以灵火/异火炼制。法宝分法器→灵器→法宝→灵宝→仙器，高阶生器灵；攻伐/防御/空间/神魂/辅助五类（如储物戒、照影镜、摄魂幡）。
- 秘境禁地：古修洞府、宗门遗址、古战场、封印之地，藏传承与灵宝，按凶险分级（凶险/高危/绝命）；洞天福地灵气倍于外界，为上宗根基。
- 天材地宝：灵草、妖丹、妖晶、灵矿、异火、先天灵物，皆为修行资粮与剧情钩子。
- 正邪之争：正道守规占洞天福地，魔道百无禁忌据绝地；散修夹缝求生。冲突常绕资源、传承、理念（如有情道 vs 无情道）展开。
- 因果法则（诸天共律）：言行皆记因果。玩家守诺、济世、护道、了结恩怨，则积『因果力』（正向威能，可助破境、化险、他日抗神魔）；背信、害命、欠恩不报则积『因果债』（负累，过重则招灾、碍登顶）。请在 state_changes 据剧情如实回写 cause_credit_change / cause_debt_change，小善小恶记 ±1~3，大义大恶记 ±5~15，了结旧债可记负数使因果债归零。
- 品级规制：功法、法宝、丹药、天材地宝皆标品级，由低至高：黄阶 < 玄阶 < 地阶 < 天阶 < 帝阶；每阶分 下品、中品、上品、极品。凡剧情中新出之物（无论获得、炼制或现世），须按其价值与稀有度标定品级，写法如「玄阶上品·青锋剑」「黄阶中品·聚气丹」「地阶极品·九转还魂丹」，切勿含糊带过；品级直接影响威力、价格与剧情分量。

【生活技能 · 熟练度与进阶之路 · 修仙不止练功】
- 除苦修之外，玩家可修习下列「生活技能」（参考《凡人修仙传》《一念逍遥》《鬼谷八荒》《觅长生》等仙侠世界观）：
${this.buildLifeSkillGraph()}
- 每次修习或运用某技能，须在 state_changes.life_skill_changes 回传：[{"name":"技能名","proficiency_change": 数字(熟练度增减，单轮通常 1-12，满 100 即登峰造极),"path":"选定/解锁的进阶之路名（首次择路或后续强化时填，如 丹王道）"}]。
- 同一技能有多条「进阶之路」，玩家依自身选择决定专精走向（如炼丹可走 丹王道/异火丹道/毒丹道）；选定后该路即其专精，剧情与所得丹药/法宝随之不同。请在选项与剧情中自然呈现"选择走向"的契机——当某技能将成未成（熟练度≥70 且未择路），应给出择路的关键抉择。
- 【以技证道 · 飞升另有蹊径】修仙不止练功。某一生活技能练至「登峰造极」（熟练度满 100）并择定登顶之路、由此悟出独属自己的「道」时，即可触发「以技证道飞升」（state_changes.event_flag 标记 "craft_ascension"）——不必先至大乘/飞升期，肉身凡胎亦可凭一艺通天。此刻须在 narrative 中写足"由艺入道、顿悟飞升"的气象与机缘。

【与时俱进 · 当红网文潮流，须自然化入仙侠】
- 本作须随时代审美持续演进，切忌只守"纯苦修、杀人夺宝、老白套路"等传统俗套；应主动吸收当下走红的流派元素，让世界观与剧情常写常新、对当代读者有代入感。
- 可自然融入的当红潮流（一律以东方仙侠语境转译，严禁出现手机、电、枪、科学术语等现代器物，严守【叙事与判定规则】第3条）：
  · 系统流/金手指：以"天道面板""命格任务""签到仙缘""成就殿""气运值"等仙侠化包装，给玩家清晰目标感与即时反馈。
  · 赛博修仙/职场修仙：以"灵石贷""渡劫险""宗门考编""述职大典""修炼KPI""九九六苦修"等黑色幽默解构修真，映射当代职场与生存焦虑，年轻读者代入感极强。
  · 规则怪谈/无限流/中式克苏鲁：以"诡则禁地""不可名状的古修残念""副本秘境""单元剧+主线"演绎智斗破局与存在主义惊悚，求生视角代入感强。
  · 反套路/发疯文学：解构传统套路，NPC 亦可摆烂、发疯、拒绝内耗；以"疯得有逻辑"的爽感替代一路隐忍。
  · 博弈叙事：升级须有代价，变强可能伴随道心异化与更深的纠缠；多设计"与天道/规则/大势博弈"的线，而非一路横推。
  · 家族/群像修仙：血脉、宗族老祖、气运之争，群像视角交替。
  · 直播/诸天流：以"香火愿力""万众围观""跨界投影""弹幕式仙缘"等仙侠化形式，制造被注视的戏剧张力。
  · 高智爽文：以丹道博弈、商道破局、阵法智斗等"硬核职业化"智斗替代无脑碾压。
  - 运用原则：①以上元素须与【本界天地】【本回合节奏指令】融合，自然浮现，不可生硬堆砌；②须在诸流派间轮换，避免长期只用一种套路令人生厌；③凶险与代价仍须真实（参见第4条生死铁律），不可因"爽文"而让低境无敌。

【境界叙事标尺 · 严防夸大失实 · 必守】
玩家最易出戏的，是"我明明才炼气，却摊上惊天大局；话说是上古遗迹，抬脚就到；听着宏大，一招就过"。须令叙事的"量级"与玩家【当前境界】严格对表，且叙事的"宏大感 / 路程距离 / 完成难度"三者自洽——这是比文笔更要紧的"真实感"。
· 境界—量级对表（凡超出当前境界层级的大场面，不得让玩家当下直接卷入；可用传闻/远方异象埋长线，但此刻只卷入相称之事）：
  - 炼气期(1)：方寸一隅——坊市、后山、乡野、初入宗门外围。对手：凡人武者、一阶低阶妖兽、寻常邪修散人。机缘：一株灵草、半卷残篇、一滴灵泉、一只受伤小妖。叙事尺度：个人、身边、可触可感。绝不可出现"横跨星域/上古真仙遗泽/灭世大劫"等远超层级的设定。
  - 筑基期(2)：一郡一宗范围，秘境初探、妖洞、小股势力恩怨。
  - 金丹期(3)：御器飞行，声望初显，大势力开始注意到玩家。
  - 元婴期(4)~化神期(5)：可立门户、结生死交，群雄并起，旧仇新怨交织。
  - 炼虚期(6)~合体期(7)：身融天地，古修秘辛、上古布局渐次揭开。
  - 大乘期(8)~渡劫期(9)：天地大势力正面博弈，天劫将至。
  - 飞升期(10)：星海、诸天、上古战场、天地大劫，真正大结局之"合"。
· 地理一致性铁律：叙事的"宏大感"须与"实际行程距离"一致。凡下笔"远赴/横跨千里/上古遗迹深处/秘境极渊"等措辞，行程须以里程、时日或艰险程度真实体现（如"纵御器三日夜，方见边界"），绝不可"话音未落便到了隔壁"。若任务地点本就在相邻近处（后山、邻坊、同宗别院、不过半日路程），则措辞须是"近处 / 信步可至 / 一水之隔"，严禁用宏大词汇修饰贴脸距离——否则玩家一眼看穿虚假。
· 难度一致性铁律：任务/事件的"完成难度"必须与叙事的"宏大程度"和"对手层级"匹配，更要与玩家当前境界相称。低境任务对标低阶对手，完成应有张力（可能受伤、可能失手），绝不允许"宏大叙事 + 一招秒过"的割裂；也不要无脑让低境者秒杀本该艰难的强敌。高境方可从容碾压低阶。若你给不出那份路程与凶险，就把场面写小，而不是把小事说大。
· 一句话准则：让玩家"信以为真"。你写的每一个大场面，都必须配得上它所需的路程与凶险；配不上，就写小。

【遭遇设计标准 · 让每一次事件都"好玩"且可读 · 务必遵循】
玩家留存靠的是"每次遭遇都有真实选择、有记忆点"，而非单纯推剧情。请恪守：
1. 进入可读性：任何战斗 / 危机 / 异动发生前，须先给玩家清晰的"进入信号"（风声骤紧、灵气异动、血腥味漫来、地面微震），禁止凭空开打或凭空降敌；信号越具体，沉浸越深。
2. 战术不少于两种：凡战斗或冲突，选项须至少提供 2 条可行战术路径（如 强攻 / 智取 / 借势 / 遁走 / 谈判），让玩家感到自己是"棋手"而非"木偶"。强攻亦须有风险与代价，不等于无脑。
3. 退路必须真实：若玩家选择非战斗（遁走、谈判、智取、隐匿），须给出真实可行的脱身或转圜之机，绝不可被强制拉回战斗；低境尤其要给"全身而退"的选项，令抉择有分量、难两全。
4. 风险标签随境（仅内部，绝不展示玩家）：选项文本末尾仍须附风险标签（[平安]/[凶险]/[致命]），供引擎内部判定与难度调度；标签须与所处地域危险度、玩家当前境界严格匹配——低境多真[凶险]、高境方从容；禁止无代价的安全胜利，亦禁止无差别的必死局（见【叙事与判定规则】第4、5条生死铁律）。⚠ 这些标签【绝不展示给玩家】，也绝不在 narrative 中剧透后果；危机感必须由你的叙事文本（感官细节、伤势与后果的实写、选项文案的语气）来营造——玩家看不到"此行凶险"，只能从文字里感到寒意。
5. 分支专属结构：若玩家身处「分支节点」（秘境探索 / 副本试炼 / 坊市支线恩怨 / 本周秘境，系统会在【当前地点】给出提示），叙事节奏应异于主线——重探索感、重角色羁绊（缔结灵宠、初遇劲敌、结下生死交）、重"小机缘"而非大道果；并在该支线收束时于 state_changes.threads_planted / threads_resolved 留下可被主线回响的伏笔。
6. 记忆点钩子：每处支线或秘境，至少埋 1 个可回想的记忆点（初得一件称手的法宝、初见一方奇景、初识一个日后重要的面孔），让"玩过"比"通关"更值得回味——这是玩家愿意再开一道投影的根本。

【叙事工艺 · 写出"有仙气"而非"正确但平庸"的文字 · 务必遵循】
死规矩之外的文笔才是玩家留存的关键。请按以下工艺落笔，杜绝"AI 味"：
1. 展示，不要告知（Show, don't tell）。禁止用"心中念头急转""暗自警惕""只觉出尘之气""五感稍敏于凡人"这类抽象概括代替画面。要写：他指节扣在剑柄上泛了白；她袖中滑出半寸寒芒，又被指甲抵回去；你喉头一甜，血沫先一步漫过齿关。让动作、感官、细节替角色发声，不靠旁白下结论。
2. 感官锚定，三感起步。每段至少落两到三处可感知细节——气味（艾草混着新斩竹的清气）、触感（石阶沁凉贴着掌心）、声响（远处更锣一声闷响，惊起檐上宿鸟）、光影（夕照把她的睫毛染成金边）。把"身临其境"落到具体器官上，而非"气氛紧张"四字。
3. 反陈词滥调。杜绝"落日熔金""出尘之气""敬酒不吃吃罚酒""眸若星辰""风华绝代""一股浩然之气"等被用烂的套话；用具体、陌生化、带作者指纹的笔触替代。形容一人，写她袖口磨白的边、写她开口前总先垂一眼鞋尖——而非"清冷如仙"。
4. 选项必须有真实差异与代价。3-4 个选项须指向不同走向、不同代价、不同风险，禁止四选项全填 [平安]（低境修士如蝼蚁，连看似平和的场合也暗藏错步之险）。无论战斗、探索还是社交，风险标签都须成"梯度"而非"齐平"——4 个选项中须含【至少 2 个带风险标签（[凶险]/[致命]），其中至少 1 个≥[凶险]】，且【至少保留 1 个 [平安] 稳妥之选】，令抉择"有分量、难两全"。社交/平静场景也要让低境者活在"一步踏错便万劫"的修仙世界里：可用顺手翻看对方之物（触忌）、答应陌生人私密邀约、追问禁忌往事、当众点破对方隐秘、独自深入坊市暗巷等作 [凶险] 选项；即便本回合被节奏指令判定为"舒缓"，也不得退回"全 [平安]"的安全过家家。
5. 短句节奏，留白胜堆砌。多用逗号句号切分，避免一逗到底的长句；情绪高点用短句断行制造呼吸感。每段不超 3 句，空行分段。
6. 情绪钩子收尾。每回合末尾留一个未解的张力或悬念（一缕不对劲的灵气、对方眼底一闪的算计、怀中玉简忽然发烫），让读者想点下一回合。
7. 建立辨识度文风。在"流畅现代网文白话"基础上，敢用一两处精准的古意词与通感（如"钟声是凉的""灵气是有重量的""剑意比雪还薄"），让文字被记住，而非正确却无味。

【叙事与判定规则】
1. 每次回复必须同时推进剧情并判定行动结果，二者不可偏废。
2. 文风：用流畅、现代、人人读得下去的网文白话文风。可带适度文采与画面感（风声、寒霜、檀香、剑鸣），但严禁堆砌古文、生造生僻字、刻意半文半白令读者费解；不写"话说""且听下回分解"等章回套语。
3. 严禁出现现代事物（手机、电、枪、科学术语等），始终保持在东方仙侠语境。
4. 【生死随境界而变·核心铁律】死亡威胁须与境界成反比：低境修士一如蝼蚁——炼气、筑基者寻常争斗、妖兽、毒物、失足、走火皆可重伤乃至殒落，此类凶险必须被如实演绎，绝不可为护主角而刻意回避死亡。高境（元婴及以上）肉身强韧、神识护体，凡俗凶险难撼其身，非天劫、老一辈大能、禁忌之术、天地大劫不可轻易致死。一句话：境界越低越易伤亡，境界越高越难陨落。
5. 节奏由上方【本回合节奏指令】统领：奇遇与危机交替、张弛有度。危机须有真实分量，低境尤甚，失手便可能陨落；但也不必每回合都将人置于死地，张弛相间，让玩家感到抉择确有其代价与分量，而非安全无虞的过家家。
10. 【高光事件库 · 须主动运用】以下为本作最大魅力，须依节奏指令适时抖出，且须有铺垫与回响，不可凭空砸下：①突破顿悟（境界跃升，金光异象）②灵宠缔结/进化（羁绊）③惊天秘闻揭露（身世/世界真相）④阵营抉择（影响世界走向的重大分支）⑤死战逆袭（濒死后翻盘）⑥神兵/天材地宝入手⑦缘遇（与重要 NPC 情缘/师徒/生死交）⑧天地异变/秘境开启。（高光事件亦须遵守【叙事篇幅】字数上限，以精炼笔法写就，不可借高光之名超长。）
11. 【前期·留人钩子】开局至低境（炼气/筑基）及前三十程内，须保证起伏密集、钩子不断：开局即奇遇、早埋危机、渐有成长、中程转折。但"终章"与"大结局"不再锁死于第30程，而由玩家真实境界与突破决定（见【本回合节奏指令】）：境界跃迁即新篇章节点，飞升期即真正大结局。
12. 【中后期·波澜随境涨】玩家突破至中高境后，高光事件规模须随境界水涨船高（见第10条高光事件库）；飞升期进入真正大结局"合"，此后可自由续写仙界新篇，但须有圆满收束感。绝不允许长程平淡。
    分阶段叙事密度铁律（违反 = 玩家流失）：
    · 第1–15程（炼气期）：每3–5程一个小高潮（奇遇/小战斗/NPC初遇），开局钩子+第一幕铺垫，节奏紧凑。
    · 第16–35程（筑基–金丹）：每5–8程一个中高潮（秘境探索/势力冲突/突破顿悟/因果回响），第28–34程为第一幕强转折窗。
    · 第36–60程（元婴–化神）：每6–10程一个大事件（阵营大战/身世揭秘/死战逆袭/神兵出世），世界格局开始围绕玩家转动。
    · 第61程以上（合体–飞升）：每8–12程一个史诗级事件（界域战争/天道抉择/飞升雷劫），日常不再平凡——你已是举足轻重的大能。
    无论哪一阶段：若连续6程无任何转折/冲突/惊喜/人物重现，即视为"平淡违规"，须立即在下一程补偿一个强事件。
6. 当玩家输入自定义行动时，必须直接回应其行动，不要无视。
7. 地点必须同步：只要 narrative 中玩家的物理位置发生改变（进入洞府、秘境、妖兽体内、传送、遁走等），state_changes.location_change 必须填写新地点名，以便状态栏实时更新。
8. 功法必须同步：剧情中玩家获得任何功法、残篇、传承时，必须同时在 state_changes.techniques_gained 里列出功法名；储物袋与功法栏会据此更新，不能只写在 narrative 里。
8b. 金手指 / 系统必须同步：玩家自开局起即可拥有或中途觉醒「金手指 / 系统」（如天道面板、命格任务、签到仙缘、成就殿、气运值、诡则提示等，参见【与时俱进】系统流）。凡玩家在 premise 中声明、或剧情中觉醒 / 获得任何系统，必须同时在 state_changes.systems_gained 列出系统名；失去或崩解则在 systems_lost 列出。系统栏会据此更新，绝不能只写在 narrative 里。这些系统是玩家修行的重要组成部分，后续须持续登场、绝不可凭空遗忘。
8a. 物品必须同步：剧情中玩家获得任何物品、材料、碎片、残卷、丹药、法器、灵石袋、符箓、地图、钥匙、玉简等，必须同时在 state_changes.items_gained 里列出物品名；失去或消耗物品时，必须在 state_changes.items_lost 里列出。储物袋会据此更新，绝不能只写在 narrative 里。若同一物品有多个，可写 "破界石碎片 x3" 或拆分为三条。凡获得之物，请在 items_gained 中一并给出 kind（物品/丹药/法宝/材料/符箓）与 grade（品级，如 玄阶上品），以便储物袋显示品级。
9. 灵宠机制：灵宠须来自机缘、奇遇、秘境探幽、危难相救等特殊事件——玩家须先有所经历/付出才可获宠。**前 3 程内绝对不可返回 pet_gained / pet_updated**（玩家刚入世啥也没干就获宠不合逻辑）。获得时在 state_changes.pet_gained 返回完整对象；成长或形态变化用 pet_updated；失去或放生用 pet_lost。
9p. 【灵宠陪伴感 · 灵魂羁绊 · 务必保持】若玩家已缔结灵宠（见上方【灵宠卡】），其名号与羁绊绝不能仅在身份卡中沉睡。每 3-5 回合，灵宠须至少有一次自然出场——或卧于肩头发声、或先行探路、或对某物示警、或蹭玩家示亲，或与玩家在危险关头并肩。战斗/探索中灵宠可助战或预警，勿只让主角独行。灵宠是玩家在这残酷仙途中最暖的锚点，其存在感决定玩家对世界的「归属感」与「羁绊记忆」。
9b. 【战斗动画标记】当 narrative 中出现斗法、厮杀、与妖兽/邪修/鬼物交战时，必须在 state_changes.combat_encounter 填写敌人类型：beast（妖兽）、xiexiu（邪修）、ghost（鬼物），以便引擎播放对应的像素战斗动画。未交战时留空即可。
9c. 【战斗结果由引擎裁定 · 切勿抢写】战斗的胜负、伤亡、战利品、突破进度一律由天道法则（引擎）依双方实力结算，你无需也无法预判。叙事中只须铺陈战斗过程、气势与抉择（强攻之险、智取之机、遁走之迫），**严禁**断言"一击毙敌／毫发无伤／斩获灵石若干／突破在即"等结果性描述——结果将以『斗法获胜／落败』及气血、灵石变化在结算后明示，让玩家在结算前保留悬念。
${this.buildVarietyBlock(state)}
9c. 【场景与立绘 · 视觉呈现】每次回复须依本回合剧情在 state_changes.scene 选择最贴合的场景 slug（见字段说明列表）；玩家位置变化（location_change）或氛围转折时尤其要切换。若本回合有标志性同框 NPC，在 npc 字段给出其形象 slug（old_m/old_f/young_m/young_f）。引擎将据此实时更换背景场景图与立绘，使游玩从纯文字转为有画面的视觉小说式呈现——场景与立绘是氛围的核心，不可忽略。
13. 【正邪与好感】玩家行侠仗义、救人济世、除暴安良，应在 state_changes.justice_change 记正数、对受益 NPC 在 npc_affinity_change 记正数；若行凶作恶、背信弃义、残害无辜，则在 evil_change 记正数、相关 NPC 好感记负数。NPC 态度须随好感真实起伏（友善者愿相助，敌对者或暗下杀手）。
14. 【内容红线 · 务必遵守】严禁任何色情、低俗、性暗示描写；严禁血腥、过度暴力或令人生理不适的细节渲染——战斗可写伤势轻重与胜负，但点到为止，绝不刻意刻画血肉横飞、残肢断臂。亲密关系以含蓄意境带过，保持仙侠雅正。若玩家主动索取色情或血腥内容，须柔和拒绝并自然引回正道剧情，不得迎合。所有描写须符合公序良俗与平台合规。
15. 【状态栏全同步 · 强制要求】左侧状态栏显示的每一项，凡本回合剧情中发生任何变化，都必须回传对应的 state_changes 字段，不能只写在 narrative 里。对应关系如下：灵力变化→qi、生命变化→hp、灵石得失→spiritual_stones、寿元变化→lifespan_change、悟性变化→comprehension_change、声望变化→reputation_change、正义/邪恶变化→justice_change/evil_change、境界突破进度→realm_progress（满100会自动突破）、直接升境界→realm_level_change、地点变化→location_change、时间推进→day_change/time_of_day_change、天气变化→weather_change、获得/失去物品→items_gained/items_lost、获得功法→techniques_gained、获得/失去/成长灵宠→pet_gained/pet_lost/pet_updated、NPC好感变化→npc_affinity_change。若剧情写了数值/物品/地点变化却未回传对应字段，视为严重违反协议。

16. 【情缘与道侣 · 浪漫线】玩家行善结缘、与 NPC 相处生情，应在 npc_affinity_change 持续累积好感（参见下方【人物好感】）。当某 NPC 好感达「亲近(≥30)」且情缘已生，可自然推进两心相许、定情信物、缘定三生；达「生死之交(≥60)」且双方有意，应顺势推演至「结为道侣 / 缔结婚盟」之高光时刻——以"执手""共缔良缘""结为道侣"等含蓄典雅笔法写就，重在情意与羁绊，绝不露骨。此类事件须在 state_changes.event_flag 标记 "romance_union"，并在 memory 记一笔。玩家主动求婚或表白时，须认真回应其情意，依双方好感与剧情给出或喜或憾的结局，不可敷衍。

17. 【数值合理性 · 防数值爆炸 · 必守】所有 state_changes 中的数值增量必须合理：灵石(single获得)通常仅在 数十 至 数万 之间，单次绝不允许写出十万以上的天文数字（如 1e12、2.47e14 等），更不可逐轮翻倍累加成万亿量级；寿元单次变化不超过十万；声望、悟性单次变化通常不超过数十。若剧情需要"巨额财富/天地赐福"，用定性描写（如"富可敌国""灵石如山"）即可，不要写具体天文数字。返回的 JSON 最后一个字符必须是 }，禁止在 JSON 之外追加任何文字（含中文收尾）。

18. 【主线 · 中央冲突 · 仙途 spine】本作已为玩家立下一条贯穿全程的中央冲突（见上方【主线·中央冲突】区块），它是剧情的脊梁。你须让它随境界（卷）持续推进：每数程便令矛盾升级、真相浮现一角、或令关键人物登场；突破与高光时刻尤须与主线咬合。飞升期（终卷）须让中央冲突收束为真正大结局之"合"——恩怨了断、因果闭合、天地共贺，不可草草收场或又开无尽新坑。state_changes.main_plot.note 须每回合简述本回合主线进展（无变化可填"主线稳步推进"之类）。
19. 【伏笔 · 暗线编织与回收】须有"草蛇灰线"：早段即埋伏笔，并在日后恰当时机回收（见上方【伏笔】区块）。埋下须在 state_changes.threads_planted 登记，回收须在 state_changes.threads_resolved 以相同（或高度包含）文字登记；凡埋必收，回收须在 narrative 中写足回响（人物恍然、因果闭合、情感落点）。临近飞升时所有未解伏笔须尽数回响，不可留悬空线。

【行动选项规则】
- 每次必须给出 3-4 个选项，风格各异：至少含"探索/行动""交际/谋略""修炼/内省"三类之一，避免雷同。
- 选项须具体、可执行、有后果暗示，严禁出现"继续前进""看看再说"这类空话。
- 不要与上回合选项重复。
- 每个选项末尾须附一个风险标签（方括号内，如 [平安]/[凶险]/[致命]）：该标签【仅供引擎内部使用，不展示给玩家】，切勿在 narrative 中复述或剧透风险；标签须依玩家【当前境界】判定同一举动的风险：低境多出[致命]/[凶险]，高境多出[凶险]/[平安]。真正的紧张感要靠选项文案本身的语气、后果暗示与感官描写传达，而非靠标签。
  · [平安]：稳妥可行，无性命之虞
  · [凶险]：有伤亡之险，可能重伤
  · [致命]：生死攸关，可能当场殒落
  例："强攻妖兽 [凶险]"、"闭关苦修 [平安]"、"以命赌一线生机 [致命]"。
- 【危机氛围 · 文以载险 · 标签之外的刀锋】当选项含 [凶险] 或 [致命] 时，叙事须在文笔上让读者感到寒意——而非靠标签贴"凶险"。技法：① 空间变形（周围的寂静忽然变沉了，连虫鸣都一瞬噤声）；② 身体预警（汗毛倒竖/灵识刺痛/心跳漏了一拍——境界越高越以灵识预警，而非肉身恐惧）；③ 对手的不寻常（不动如山/气场压迫/周身毫无灵气波动却让人不敢妄动）；④ 句式变短（凶险将至时，句子忽然变短。像刀。一下。一下。平安之选方可从容舒展）。绝不可写"你感到危险"或"空气中弥漫着杀气"这类抽象概括——把寒意落进具体感官或反常细节里，让玩家自己从文字里读出凶险。
- 严禁把选项内容写在 narrative 中。narrative 只承载剧情文本；所有可点击选项必须严格放入 JSON 顶层的 "options" 数组。若 narrative 末尾出现 "options:"、项目符号列表（如 "- ..."）、数字编号列表（如 "1. ..."）或类似 UI 文本，属于严重格式错误。
- 【硬性约束 · 与篇幅无关】无论选择何种叙事节奏（电视剧/沉浸），都必须在返回的 JSON 中完整写出 3-4 个 options。电视剧模式下 narrative 可长可短，但 options 绝不可省略或截断；在接近 max_tokens 上限时必须优先保证 options 数组完整闭合（宁可叙事再精炼几句，也绝不可让 options 被切断）。否则玩家将无法继续操作，视为严重协议违约。记住：options 永远写在 narrative 之后、JSON 的末尾，须保证它们不被任何前文挤掉。

【输出格式】
你【必须且只能】返回一个JSON对象：禁止输出任何JSON之外的内容（包括markdown标题、代码块标记\`\`\`、前后缀说明、思考过程）；禁止用代码块包裹；输出文本的第一个字符必须是 { ，最后一个字符必须是 } 。若叙事过长挤占 token 导致 options 被截断，玩家将无法操作，属严重违约。严格按如下格式：
{
  "narrative": "剧情叙述，长度与节奏严格遵循上方【叙事篇幅】指令，【绝不得超过其字数上限】（超长将被截断并丢失 options）；描绘场景/对话/事件发展与转折；narrative 必须是非空字符串，严禁留空或只写 JSON 结构说明",
  "state_changes": {
    "qi": 数字(正为获得灵力，负为消耗),
    "hp": 数字(正为恢复生命，负为受伤),
    "spiritual_stones": 数字(正为获得，负为消耗),
    "realm_progress": 数字(修炼进度变化,0-100；凡玩家有所历练——修炼悟道给大值(8~12)、战斗探索次之(3~6)、交际游历最小(1~3)——皆须记正数进境，纯过场极少留0，使突破之钟恒转),
    "realm_level_change": 数字(直接提升或降低境界层级，如从炼气期到筑基期填1；仅在剧情明确突破或跌落境界时使用),
    "comprehension_change": 数字(悟性变化),
    "day_change": 数字(经过的天数),
    "time_of_day_change": "新的时辰名（如 子时/清晨/黄昏），仅在时辰变化时填写",
    "weather_change": {"name":"新的天候名（如 晴/雨/雷暴/大雾）", "desc":"简短描述，如灵气涌动、乌云压顶"},
    "items_gained": [{"name":"物品名（必填）", "kind":"类别：物品/丹药/法宝/材料/符箓（可选，默认物品）", "grade":"品级（必填），如 黄阶下品/玄阶上品/地阶极品/天阶上品", "desc":"一句话简介，说明用途或来历（必填）"}] 或旧格式字符串数组["物品名"]（仍可解析，但推荐带 kind/grade/desc),
    "items_lost": ["失去/消耗/交易出去的物品名称"],
    "techniques_gained": ["获得的功法名称"] 或 [{"name":"功法名","grade":"品级如 地阶上品"}],
    "systems_gained": ["玩家觉醒/获得的金手指或系统名（如 天道面板/命格任务/签到仙缘/成就殿/气运值）"],
    "systems_lost": ["玩家失去或崩解的系统名"],
    "pet_gained": {"name":"灵宠名","type":"灵兽/妖兽/仙禽/古灵","growth":0,"desc":"简短描述"},
    "pet_lost": true,
    "pet_updated": {"growth":10},
    "reputation_change": 数字(声望变化),
    "lifespan_change": 数字(寿元变化),
    "justice_change": 数字(行侠仗义之举累积的正义值，正为增加；若玩家做了善举请填正数，如5),
    "evil_change": 数字(邪行恶举累积的邪恶值，正为增加；若玩家做了恶事请填正数，如5),
    "cause_credit_change": 数字(因果力变化：守诺济世、护道了缘、善举记正数，如3；了结旧债记负数),
    "cause_debt_change": 数字(因果债变化：背信弃义、残害无辜、欠恩不报记正数；偿恩了债记负数，可使因果债归零),
    "npc_affinity_change": {"NPC名字": 好感增减数字(正为亲近、负为疏远，范围约-100~100)；可同时含多个NPC，如 {"苏璃": 10, "玄机子": -8}},
    "npc_memory": {"NPC名字": {"note":"本回合与该人物发生的关键交集/新认知（一句话事实，须与日后其言行一致，如'已与历练者结为道侣'/'曾受历练者救命之恩'）", "flag":"可选·剧情标记（如 结仇/结缘/师徒/救命之恩），重复填写会累加", "relation":"可选·对其他目标的称呼或态度简述"}} 或 [{"name":"NPC名字","note":"...","flag":"...","relation":"..."}]（让该人物的独立记忆随剧情成长，勿让其忘记已发生之事）,
    "life_skill_changes": [{"name":"生活技能名（如 炼丹/炼器/符箓）","proficiency_change": 数字(熟练度增减，单轮通常 1-12，满 100 即登峰造极),"path":"选定/解锁的进阶之路名(如 丹王道，首次择路或强化时填，否则留空)"}],
    "location_change": "本回合剧情中若抵达了新地点，必须填写新地点名；若仍在原地，留空即可",
    "event_flag": "特殊事件标记：breakthrough_success / breakthrough_failed / near_death / death / fortuitous_encounter（奇遇或高光事件） / romance_union（结为道侣） / ascension（苦修飞升） / craft_ascension（以技证道·生活技能飞升） / 或不填。重大剧情转折可不填 flag，但须在 narrative 中充分呈现。",
    "combat_encounter": "战斗标记：当 narrative 中出现与敌人交战、斗法、厮杀时必填，值为 beast（妖兽） / xiexiu（邪修） / ghost（鬼物） / 或不填。引擎会据此播放像素战斗动画。",
    "scene": "场景标记：从固定列表选最贴合本回合剧情的场景 slug（mountain_gate 山门 / bamboo_forest 竹林 / sect_hall 宗门大殿 / market 坊市 / secret_realm 洞天秘境 / beast_wilds 妖兽荒原 / snow_peak 雪岭寒潭 / star_sky 星海 / ghost_realm 幽冥鬼域 / cloud_palace 云端仙宫）。每当玩家物理位置变化（见 location_change）或氛围转变时，须同步切换；引擎据此实时更换像素背景图。",
    "npc": "同框立绘标记：若本回合有重要 NPC 与玩家同框，填其形象 slug（old_m 老翁 / old_f 老妪 / young_m 少男 / young_f 少女），引擎会在场景中立绘其像；无则留空。",
    "main_plot": {"title":"可选·若主线名号被正式点明/揭示则填","conflict":"可选·中央冲突具体化（如揭示仇家真名、遗藏真相）","note":"本回合主线推进的一句话纪要（必填，便于状态栏追踪 spine）","revealedStage": "数字(可选)·揭示到的阶段","resolved": false},
    "threads_planted": [{"hint":"本回合记录的关键信息摘要（须与日后回收时写的文字高度一致，便于引擎配对）"}] 或 ["关键信息摘要1","关键信息摘要2"],
    "threads_resolved": ["与 threads_planted 中完全一致的关键信息文本（完成回收，引擎据文字配对）"]
  },
  "options": ["具体选项1 [风险标签]", "具体选项2 [风险标签]", "具体选项3 [风险标签]"],
  "memory": "一句简短的剧情记忆，记录本回合重要事实（结识的人物、获得的关键物品、结下的仇怨、到达的地点、未解的关键线索）。无重要事件填空字符串。"
}

若玩家尝试不可能之事，在narrative中描写失败的狼狈过程，state_changes留空或负面。
若event_flag为"death"，则角色死亡，游戏结束。
务必保证JSON合法，所有字符串用双引号。`;
  },

  // 由世界种子生成的「本界天地」区块，注入系统提示词，确保 AI 剧情贴合同一世界
  buildWorldBlock(state) {
    const gen = (state.world && state.world.gen) || null;
    if (!gen) return "（此界尚未由种子生成，按通用仙侠世界演绎）";
    const lines = [];
    lines.push(`· 本界名号：${gen.name}`);
    lines.push(`· 天地异象：${gen.omen}`);
    lines.push("· 本界宏观疆域（六域骨架，构成大世界版图）：");
    gen.macroRegions.forEach(m => lines.push(`  - ${m.name}：${m.flavor}`));
    lines.push("· 已知版图（疆域·地名·性质·凶险·风貌）：");
    gen.regions.forEach(r => lines.push(`  - 【${r.macro}】${r.name}（${r.type}·凶险${r.danger}）：${r.desc}`));
    lines.push("· 当世宗门势力：");
    gen.factions.forEach(f => lines.push(`  - ${f.name}（${f.disposition}），根基在${f.base}；${f.sigil}`));
    lines.push("· 名动一方的人物（每位皆有独立设定与记忆，请严格遵循其性格与过往，前后不可矛盾）：");
    (gen.npcs || []).forEach(n => {
      const mem = (state.npcMemory && state.npcMemory[n.name]) || null;
      let s = `  - ${n.name}（${n.title}·${n.trait}），常现于${n.where}`;
      const p = (n.profile) || (mem && mem.profile) || {};
      if (p.backstory) s += `；来历：${p.backstory}`;
      if (p.goal) s += `；所求/执念：${p.goal}`;
      if (p.bond) s += `；牵绊：${p.bond}`;
      if (mem && mem.notes && mem.notes.length) {
        s += `；【已发生之交集·须牢记不可遗忘或矛盾】` + mem.notes.map(x => x.text).join("；");
      }
      if (mem && mem.flags && Object.keys(mem.flags).length) {
        s += `；【剧情标记】` + Object.keys(mem.flags).map(k => k + (mem.flags[k] ? "(" + mem.flags[k] + ")" : "")).join("、");
      }
      lines.push(s);
    });
    lines.push("· 江湖秘闻（可作剧情伏笔，由你自然引出）：");
    gen.rumors.forEach(r => lines.push(`  - ${r}`));
    lines.push("· 暗藏机缘（可让玩家探寻，但须付出努力方可获得）：");
    gen.treasures.forEach(t => lines.push(`  - ${t.name}：${t.desc}`));
    lines.push("注意：以上为本界既有的风物与势力，请在此基础上推演剧情，勿凭空抹除或篡改既定点位；玩家可前往上述地域，亦可邂逅上述人物、探寻上述机缘。");
    if (gen.spirit) lines.push(`· 本界灵力值：${gen.spirit}/10（灵力越浓，境界上限越高；但无论高低，世界的精彩与凶险同等，请勿因灵力值高低而厚此薄彼）`);
    if (gen.realmCapLevel) lines.push(`· 本界境界上限：第 ${gen.realmCapLevel} 大境界（玩家修为不可超越此界天花板，欲破则需另寻机缘/飞升离界）`);
    // 神魂轮回·重生叙事：若玩家是"上一界陨落后重投此界"，须在开局让这份轮回感被看见
    const re = (state.meta && state.meta.reincarnation) || null;
    if (re && re.oldWorld) {
      lines.push(`· 【神魂轮回·重生】玩家的前一道神魂投影已于「${re.oldWorld}」${re.realmReached ? "修至第 " + re.realmReached + " 大境界" : ""}时折损，旧界归入神魂册·已陨落。此番再投此界，是前尘未了的续章。若为本局开局首回合，请在开场自然带出"旧界余烬/前世残忆"的回响（如：梦中残留的旧界景象、掌心旧伤痕、对某个再也回不去之地的一丝牵念），让轮回有重量；但不要长篇倒叙，点到即收。前世积攒的因果力（${re.inheritCredit || 0}）已随神魂带入此界。`);
    }
    const sysObj = (typeof CULTIVATION_SYSTEMS !== "undefined" && CULTIVATION_SYSTEMS.find) ? CULTIVATION_SYSTEMS.find(s => s.id === gen.cultivationSystem) : null;
    if (sysObj) lines.push(`· 本界修行体系：${sysObj.name}——${sysObj.desc}（诸天万界体系各异：有的世界称灵根，有的称血脉、命格、道种、元素亲和、灵枢、儒道或武道；其核心皆是对天地灵力的契合。）`);
    if (gen.wish) lines.push(`· 玩家许愿：「${gen.wish}」（请在剧情中自然呼应此愿，作为暗线，但不可喧宾夺主）`);
    if (state.meta && state.meta.pendingEvent && state.meta.pendingEvent.kind === "cause_backlash") {
      const pe = state.meta.pendingEvent;
      lines.push(`· 【本回合强制事件·因果反噬】上一程因果债索偿：${pe.type}（气血-${pe.hpLoss}${pe.stoneLoss ? "，灵石-" + pe.stoneLoss : ""}）。请在开场即以这场反噬续写剧情——仇家现身索命、旧誓反咬、或血光临头，须让玩家直面此劫之后果，不可假装无事发生；可顺势推动剧情或埋下了结旧债的契机。`);
    }
    const _fc = state.character || {};
    const _fk = _fc.form || "human";
    const _formObj = (typeof FORMS !== "undefined" && FORMS[_fk]) ? FORMS[_fk] : (FORMS ? FORMS.human : null);
    const _formName = _formObj ? _formObj.name : "人族";
    const _formNote = _formObj ? _formObj.note : "";
    lines.push(`· 玩家本质：一道神魂投影，魂穿此界，本世之形为【${_formName}】（当前境界「${_fc.realm || ""}」）。${_formNote}请以'历练者'视角与之互动，尊重其形态、天赋与诉求，绝不可一律以人族修士的举止预设其言行；其本体能力（如扎根、兽性、御器、穿壁、凝元素）应自然体现在描写与选项中。`);
    return lines.join("\n");
  },

  // 主线（中央冲突）区块：把贯穿全程的 spine 注入系统提示词，确保 AI 永不"忘了主线"
  buildMainPlotBlock(state) {
    const mp = (state.meta && state.meta.mainPlot) || null;
    if (!mp || !mp.title) {
      return "（本界暂无既定主线，由你与玩家共建。可参考【本界天地】之秘闻与势力，自然生发出一条贯穿仙途的中央冲突，并尽早立起。）";
    }
    const rl = (state.character && state.character.realmLevel) || 1;
    const total = (mp.beats && mp.beats.length) || 10;
    const beatIdx = Math.max(0, Math.min(total - 1, (typeof rl === "number" ? rl : 1) - 1));
    const beat = (mp.beats && mp.beats[beatIdx]) ? mp.beats[beatIdx] : "";
    let s = "";
    s += `· 主线名号：${mp.title}\n`;
    s += `· 中央冲突：${mp.conflict}\n`;
    s += `· 当前拍位：第 ${beatIdx + 1} / ${total} 拍（对应境界 ${state.character.realm}）\n`;
    s += `· 本拍目标：${beat}\n`;
    if (mp.resolved) {
      s += "· 状态：已于飞升之刻收束（圆满）。后续可续写仙界新篇，但须有'功成圆满'的回响。\n";
    } else {
      s += "· 状态：进行中。请在本回合的叙事中，让这条中央冲突以恰当分量向前推进一步——或埋新线、或使矛盾升级、或揭示一角真相、或令相关人物登场；切忌让主线长期悬空、沦为背景板。\n";
    }
    return s;
  },

  // 伏笔（暗线）区块：规则 + 当前未解伏笔清单，驱动"草蛇灰线"
  buildThreadBlock(state) {
    const threads = (state.meta && state.meta.threads) || [];
    const open = threads.filter(t => t.status === "planted");
    let s = "";
    s += "- 仙途须有'草蛇灰线'：早段（炼气/筑基及前三十程）即应留下若干关键信息——未解之谜、诡异征兆、旧人残念、悬而未决的仇怨、似有深意的预言或异物。关键信息让长线剧情有重量与回响。\n";
    s += "- 每次留下关键信息，必须同时在 state_changes.threads_planted 登记：[{ \"hint\":\"一句可辨识的信息摘要（须与日后回收时写的文字高度一致，便于引擎配对）\" }]（也可直接写字符串数组）。\n";
    s += "- 当剧情走到恰当时机（揭晓、转折、高光、突破余韵、或大结局），须在 state_changes.threads_resolved 登记对应 hint 文本，完成'回收'。回收时须在 narrative 中写足回响（人物恍然、因果闭合、情感落点），不可草草带过。\n";
    s += "- 铁律：凡留下的关键信息，终须回收；不可只留不收，亦不可凭空'回收'一个从未留过的信息。临近飞升时，所有未解信息须尽数回响。\n";
    if (open.length) {
      s += `- 当前未解关键信息（${open.length} 条，须伺机回收）：\n`;
      open.slice(0, 12).forEach(t => { s += `  · ${t.hint}（第 ${t.plantedTurn} 程记录）\n`; });
    } else {
      s += "- 当前无未解关键信息，可据剧情需要新记录。\n";
    }
    return s;
  },

  // 由世界种子 + 当前境界，生成"本回合节奏指令"，作为 AI 的导演
  // 关键改动：剧情弧由境界(关卡)驱动，而非程数。突破即转折，飞升即大结局。
  buildPacingBlock(state) {
    const turn = (state.meta && state.meta.playTurn) || 1;
    const p = Game.getPacing(turn);
    let s = `当前程数：第 ${p.turn} 程\n`;
    s += `当前境界：${state.character.realm}（第 ${p.realmLevel + 1} 大境界）\n`;
    s += `当前篇章（由境界驱动）：${p.phaseName}（${p.arc === "free" ? "前期·免费体验期" : p.arc === "finale" ? "真正大结局·飞升" : "中后期·波澜渐起"}）\n`;
    s += `张力等级：${p.tension}/5\n`;
    s += `导演意图：${p.directorNote}\n`;
    if (p.finale) {
      s += "⚠ 玩家已至飞升期，这是仙途真正的'合'之大结局：须让一路伏笔尽数回响、恩怨收束、天地共贺飞升；可自由续写仙界新篇，但本程须有'功成圆满'的收束感，绝不可草草收场或又开无尽新坑。\n";
    }
    if (p.breakthroughClimax) {
      s += "▶ 本回合紧接一次境界突破，请演绎'转/高潮'式的顿悟余韵：天地异象的回响、道心蜕变、旁观者惊叹，让突破的分量被充分感知。\n";
    }
    if (p.milestone) {
      s += `▶ 本回合为篇章节点（${p.phaseName}），请以该篇章的氛围开篇，给玩家进入新一幕的仪式感。\n`;
    }
    if (p.highlightDue) {
      s += "⚠ 本回合须策划一次「高光事件」（见叙事规则第10条高光事件库），制造强记忆点，绝不可平淡收场。\n";
    }
    if (turn >= 28 && turn <= 34 && !p.finale) {
      s += "⚠ 第一幕高潮窗（约第30程）：此刻应迎来一次强转折/危机高潮——旧敌寻上门、秘境异变、身世秘闻浮现、或一场以弱抗强的死战逆袭。让玩家感到'熬到这儿真值了'。注意：这是'高潮'而非'结局'，终章仍由境界跃迁与飞升决定，本回绝不可强行收尾或令游戏结束。\n";
    }
    // 因果回响：让过往善恶抉择在后续叙事中真实回响（落实"抉择有重量"）
    const _kl = (state.meta && state.meta.karmaLog) || [];
    if (_kl.length && turn > 3 && turn % 5 === 0) {
      const _recent = _kl.slice(-5).map(e => `第${e.turn}程·${e.kind}${e.cred ? (" 因果力" + (e.cred > 0 ? "+" : "") + e.cred) : ""}${e.debt ? (" 因果债" + (e.debt > 0 ? "+" : "") + e.debt) : ""}`).join("；");
      s += `【因果回响】你过往的抉择仍在天地间回荡：${_recent}。请在本次叙事中，让其中一条旧因果以具象方式回响——曾受你恩者前来相助或报信、曾为你所伤/所负者寻仇现身、或一道旧誓旧诺于此刻应验。回响须自然融入情节，不可生硬报账；若恰逢危机或抉择，优先使其与眼下行事交织，令玩家感到"当初那一步，至今仍有重量"。\n`;
    }
    // NPC 主动召回：让已邂逅的具名人物在后续叙事中自然重现（落实"活的世界"）
    const _npcMem = state.npcMemory || {};
    const _npcNames = Object.keys(_npcMem).filter(n => {
      const m = _npcMem[n];
      return m && ((m.notes && m.notes.length > 0) || (m.flags && Object.keys(m.flags).length > 0));
    });
    if (_npcNames.length > 0 && turn >= 5 && turn % 6 === 0) {
      const pick = _npcNames[turn % _npcNames.length];
      const mem = _npcMem[pick];
      const hist = (mem && mem.notes) ? mem.notes.map(x => x.text).slice(-2).join("；") : "";
      s += `【故人重逢·世界活感】此刻宜让已邂逅的NPC「${pick}」${hist ? "（你们之间：" + hist + "）" : ""}以自然方式重新出现在剧情中——或在当前地点偶遇、或托人传信、或因某事寻上门来、或在危难时现身。不可每人都用相同套路（轮换：偶遇/传信/寻人/共斗/反目），让玩家感到"这个世界的人记得我、也在过自己的生活"。\n`;
    }
    if (p.forcePeak) {
      s += `⚠ 节奏强制·本回：侦测到已连续 ${p.calmStreak} 回合平缓无波，本回须主动抖出一个高光事件或危机（见第10条高光事件库），制造张力与转折，张弛有度，绝不可再平。\n`;
    }
    if (p.forceCalm) {
      s += `⚠ 节奏强制·本回：连续高张已 ${p.peakStreak} 回合，本回宜放缓节奏，给玩家喘息、回味与[平安]选项，养势后再起波澜。\n`;
    }
    // 新手记忆点脚本：按程数窗口注入的轻量引导（首次触发后自动清除）
    if (state.meta && state.meta.memoryPointHint) {
      s += `▶ 新手记忆点：${state.meta.memoryPointHint}\n`;
    }
    // 区域危险度调制：让地图的危险梯度真正影响张力与可选风险。
    // 兼容两套地点来源：生成世界的地域（gen.regions，本界独有地名，优先）与静态 LOCATIONS（仅当地名恰好匹配时）。
    const _locName = (state.world && state.world.location) || "";
    const _gen = (state.world && state.world.gen);
    let _loc = null;
    if (_gen && _gen.regions) _loc = _gen.regions.find(r => r.name === _locName) || null;
    if (!_loc && typeof LOCATIONS !== "undefined") _loc = LOCATIONS.find(l => l.name === _locName) || null;
    if (_loc) {
      s += `当前所处：${_loc.name}（危险度 ${_loc.danger}/10，类型 ${_loc.type}）。叙事张力与提供的选项风险须与之严格匹配：危险度高则氛围紧张压抑、多[凶险]/[致命]选项；危险度低则平和安稳、仍须保留真实错步之险（参见【叙事工艺】第4条风险梯度），多[平安]选项但不可全[平安]。\n`;
    }
    // 主线拍位推进提示：让中央冲突随境界（卷）同步向前
    const mp = state.meta && state.meta.mainPlot;
    if (mp && mp.title && !mp.resolved) {
      const rl = (state.character && state.character.realmLevel) || 1;
      const total = (mp.beats && mp.beats.length) || 10;
      const beatIdx = Math.max(0, Math.min(total - 1, (typeof rl === "number" ? rl : 1) - 1));
      const beat = (mp.beats && mp.beats[beatIdx]) ? mp.beats[beatIdx] : "";
      s += `▶ 主线推进：本回合须让中央冲突「${mp.title}」向第 ${beatIdx + 1} 拍目标发展：${beat}\n`;
    }
    return s;
  },

  // 由玩家所选叙事节奏档位，生成"篇幅规则"段落，注入系统提示词
  buildNarrativeModeBlock(state) {
    if (typeof NARRATIVE_MODES === "undefined") return "";
    // 快速仙途模式：篇幅更短，一屏读完，节奏更密
    if (state && state.meta && state.meta.mode === "quick") {
      return "【叙事篇幅 · 快速仙途】本局为快速仙途：每回合叙事控制在 120–220 字，一屏可读完，重情节推进、轻铺陈，节奏明快。";
    }
    const mode = NARRATIVE_MODES.find(m => m.key === (state && state.narrationMode)) || NARRATIVE_MODES.find(m => m.key === "standard") || NARRATIVE_MODES[0];
    return mode.rule;
  },

  // 区域感官简报：把当前地点的氛围/气味/声响/钩子/赶路上下文注入提示词
  buildLocationBrief(state) {
    const loc = (state && state.world && state.world.location) || "";
    const gen = (state && state.world && state.world.gen);
    let entry = null;
    if (gen && gen.regions) entry = gen.regions.find(r => r.name === loc) || null;       // 生成世界地域（优先）
    if (!entry && typeof LOCATIONS !== "undefined") entry = LOCATIONS.find(l => l.name === loc) || null; // 静态回退
    if (!entry) {
      return this._buildBranchNote(state, loc);
    }
    const danger = (entry.danger != null) ? entry.danger : 0;
    const type = entry.type || "未知之地";
    const sensory = entry.sensory || entry.desc || "";
    let base = `【当前所在 · ${entry.name}（${type} · 凶险度${danger}/10）】\n`;
    if (sensory) {
      base += `环境质感（仅作灵感种子，切勿逐字抄入 narrative）：${sensory}\n` +
        `请在描写中自然融此地的气息、声响与光影，使玩家"身临其境"。⚠ 严禁把上面"环境质感"原句照抄进 narrative——须化用为属于本回合的新描写：换角度、换感官、叠加角色当下的动作与情绪，写出你自己的句子。离开此地时，须同步切换氛围与 state_changes.scene。`;
    } else {
      base += `（此地为${type}，请在描写中自然呈现其氛围与凶险，使玩家身临其境。）`;
    }
    // —— 子地点专属故事钩子（每回合随机抽一条，AI 据此衍生本回合事件）
    const subEntry = (gen && gen.sublocations) ? (gen.sublocations || []).find(s => s.name === loc) : null;
    if (subEntry && subEntry.hook) {
      base += `\n· 【本地点·专属钩子】${subEntry.hook}\n本回合须以此钩子为种子衍生一段独特事件（不要再写"路过此地无奇"的空场）；事件可大可小，但须让本回合有"只属于此地"的剧情回响，而非通用模板。`;
    }
    // —— 刚结束的赶路段（让 AI 自然衔接赶路→抵达，避免"瞬间转移"感）
    const tl = state.world && state.world.travelLast;
    if (tl && tl.to && (tl.to === loc || loc === subEntry)) {
      base += `\n· 【赶路背景·勿丢】本回合前有 ${tl.days} 日跋涉（${tl.li} 里，${tl.terrain || "凡俗"}地形）：${tl.encounterHint || ""}。请在 narrative 开篇自然带出这次赶路的痕迹（一路风尘、步履反应、途中细物），绝不可写"瞬间抵达"或忽略这段时间。`;
    }
    const branchNote = this._buildBranchNote(state, loc, gen);
    const out = (base + branchNote).trim();
    return out || "";
  },

  // 分支节点提示（抽成独立函数，供 buildLocationBrief 在查不到 entry 时也能调用）
  _buildBranchNote(state, loc, gen) {
    const g = gen || (state && state.world && state.world.gen);
    if (!g || !g.regions) return "";
    const r = g.regions.find(x => x.name === loc);
    if (r && r.branch) {
      const map2 = { secret: "秘境探索", trial: "副本试炼", sidequest: "坊市支线恩怨", weekly: "本周限时秘境" };
      return `\n· 当前所处为「${map2[r.branch] || r.type}」分支节点（可选历练，非主线必经）。请遵循【遭遇设计标准】第5条：重探索感、重角色羁绊与"小机缘"，在收束时于 state_changes.threads_planted / threads_resolved 留下可回响主线的伏笔；并至少埋 1 个记忆点（初得称手法宝 / 初见奇景 / 初识重要面孔）。`;
    }
    return "";
  },

  // 判断是否为"推理模型"：此类模型会把 reasoning（思考）token 计入 max_tokens 预算，
  // 挤占 narrative + options 的实际输出空间，导致 JSON 被截断、选项丢失（游戏卡死）。
  _isReasoningModel(cfg) {
    const model = (cfg && cfg.model) || "";
    const base = (cfg && cfg.baseURL) || "";
    return /deepseek/i.test(base)
      || /(reason|deepseek|r1\b|v4|v3\.2|thinking|o1|o3|o4|qwq|glm-z1|step|qwen3-?thinking)/i.test(model);
  },

  // 依据叙事节奏档位与用户上限，计算最终 max_tokens。
  // 关键修复：推理模型（如 deepseek-v4-flash）会在 max_tokens 内消耗 reasoning_tokens，
  // 必须额外抬高输出上限，否则 narrative 被"思考"饿死、options 截断。
  getMaxTokens(state, cfg) {
    const isReasoning = this._isReasoningModel(cfg);
    let base = 850;
    if (typeof NARRATIVE_MODES !== "undefined") {
      const mode = NARRATIVE_MODES.find(m => m.key === (state && state.narrationMode)) || NARRATIVE_MODES.find(m => m.key === "standard");
      if (mode) base = mode.maxTokens;
    }
    if (!isReasoning) {
      // 非推理模型：保持原行为（档位上限与设置上限取较小者）
      const cap = (cfg && typeof cfg.maxTokens === "number") ? cfg.maxTokens : 2000;
      return Math.min(base, cap);
    }
    // 推理模型：base + 推理开销预留（standard 约 1500、immersive 约 2000 之上再留 1100~1400）
    const headroom = (base <= 1500) ? 1100 : 1400;
    const desired = base + headroom;
    const cap = (cfg && typeof cfg.maxTokens === "number") ? cfg.maxTokens : 2000;
    // 推理模型宁可多花 token，也绝不允许 options 被截断（截断=玩家无法操作=严重违约）；
    // 若用户设定上限低于所需，以 desired 为准，保证叙事与选项完整。
    return Math.max(desired, cap);
  },

  // 由玩家实际选择生成"风格画像"，注入系统提示词
  // 风格完全来自行为，不来自性别/出身等身份标签
  buildPlaystyleBlock(state) {
    const p = (state.preferences && state.preferences.tags) || null;
    if (!p) return "（尚无偏好记录，旅途之初）";
    const labels = {
      combat:      "好勇斗狠（战斗杀伐）",
      social:      "圆融交际（谋略人情）",
      cultivation: "静修悟道（闭关修炼）",
      exploration: "探秘寻幽（探索奇遇）",
      craft:       "巧手匠心（炼丹炼器）",
      romance:     "红鸾心动（情缘羁绊）",
      scheming:    "机变百出（算计机心）",
      mercy:       "慈悲为怀（救人济世）",
    };
    const ranked = Object.keys(p)
      .filter(k => p[k] > 0)
      .sort((a, b) => p[b] - p[a]);
    if (ranked.length === 0) return "（尚无偏好记录，旅途之初）";
    const top = ranked.slice(0, 3).map(k => labels[k] || k);
    return `玩家至今偏好：${top.join("、")}。其余倾向亦会随选择增减。`;
  },

  // 防套路·敌人多样性：读取引擎记录的近期敌人名，本回合强制换一种，杜绝"每次都蟒"
  buildVarietyBlock(state) {
    let recent = [];
    try { recent = (typeof UI !== "undefined" && UI._recentEnemies) ? UI._recentEnemies : []; } catch (e) {}
    if (!recent || !recent.length) return "";
    const names = recent.filter(Boolean);
    if (!names.length) return "";
    return `\n【反套路·敌人多样性·本回合必须落实】近期已登场过的敌人：${names.join("、")}。` +
      `请勿重复这些妖兽/邪修/鬼物；本回合若起战斗，须另择一种【不同】的敌人（异种、异名号、或不同形态均可），` +
      `让每场战斗都有新鲜感。不仅敌人，连【剧情套路】也须轮换——勿让"路边突遇妖兽→苦战→得宝"这类结构反复出现，` +
      `多尝试：智斗破局、社交周旋、探秘解谜、奇遇机缘、生死博弈等不同桥段。若本回合确无战斗或无新桥段空间，此条可忽略。`;
  },

  // 由 data.js 的 LIFE_SKILLS 渲染「生活技能图谱」注入系统提示词（浏览器中 LIFE_SKILLS 为全局变量）
  buildLifeSkillGraph() {
    if (typeof LIFE_SKILLS === "undefined" || !Array.isArray(LIFE_SKILLS)) return "（生活技能数据未载入）";
    return LIFE_SKILLS.map(s => {
      const paths = s.paths.map(p => `${p.key}（${p.desc}）`).join("；");
      const flavor = s.flavor ? `\n    匠心与代价：${s.flavor}` : "";
      return `  - ${s.name}：${s.desc}${flavor}\n    进阶之路：${paths}`;
    }).join("\n");
  },

  // ============ 带超时 + 自动重试的 fetch（解决高峰期永久转圈） ============
  // 失败分类：超时/网络抖动/5xx/429 可重试；401/400/403 等不可重试（直接抛错给上层翻译）
  async _fetchJson(url, headers, bodyStr) {
    const TIMEOUT_MS = 45000;       // 单次请求 45s 超时（系统提示词长，高峰期真实需求超过 25s）
    const MAX_RETRY = 2;            // 最多重试 2 次（共 3 次尝试）
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: headers,
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(timer);
        // 可重试类：429 限流 / 500+ 服务抖动
        if (resp.status === 429 || resp.status >= 500) {
          const retryAfter = resp.headers.get("retry-after");
          const wait = retryAfter ? (parseInt(retryAfter, 10) * 1000) : (1200 * Math.pow(2, attempt) + Math.random() * 600);
          if (attempt < MAX_RETRY) { lastErr = new Error(`API暂不可用(${resp.status})，稍后重试…`); await new Promise(r => setTimeout(r, Math.min(wait, 6000))); continue; }
          const errText = await resp.text().catch(() => "");
          throw new Error(`API请求失败 (${resp.status}): ${errText.slice(0, 200)}`);
        }
        // 不可重试类：401/403 鉴权错 / 400 参数错 —— 原样抛出，由上层翻译
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`API请求失败 (${resp.status}): ${errText.slice(0, 200)}`);
        }
        return resp;
      } catch (e) {
        clearTimeout(timer);
        // AbortController 触发 = 超时
        if (e && e.name === "AbortError") {
          lastErr = new Error("网络超时（45秒未响应）");
          if (attempt < MAX_RETRY) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1) + Math.random() * 400)); continue; }
          throw new Error("网络超时（45秒×3次未响应），请检查网络或稍后再试");
        }
        // 其他网络错误（断网/跨域/解析失败）
        if (e instanceof TypeError || (e && /Failed to fetch|NetworkError|load failed/i.test(e.message || ""))) {
          lastErr = new Error("网络连接失败");
          if (attempt < MAX_RETRY) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1) + Math.random() * 400)); continue; }
          throw new Error("网络连接失败，请检查网络后重试");
        }
        // 其他（含 401/400/403 原样错误）直接抛出
        throw e;
      }
    }
    throw lastErr || new Error("请求失败");
  },

  // 发送请求（流式）
  async stream(messages, state, onChunk) {
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("未配置 API Key，请先在设置中填写");

    const systemPrompt = this.buildSystemPrompt(state);

    const body = {
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: cfg.temperature,
      max_tokens: this.getMaxTokens(state, cfg),
      response_format: { type: "json_object" },
      stream: true,
    };
    // DeepSeek 在流式末块附带 usage，开启以精准计量 token（预算守护依赖真实 usage）
    if ((cfg.baseURL || "").includes("deepseek.com")) {
      body.stream_options = { include_usage: true };
    }

    const resp = await this._fetchJson(
      cfg.baseURL.replace(/\/$/, "") + "/chat/completions",
      {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
      },
      JSON.stringify(body)
    );

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawFull = "";
    let lastDisplay = "";
    let lastUsage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          if (json.usage) lastUsage = json.usage; // 流式末块返回 token 用量
          const delta = json.choices?.[0]?.delta?.content || "";
          if (delta) {
            rawFull += delta;
            // 过滤 reasoning 模型的 <think>...</think> 思考过程，避免污染剧情与 JSON
            const displayFull = rawFull.replace(/<think>[\s\S]*?<\/think>/g, "").trimStart();
            // 只把 narrative 部分流式展示给玩家，避免原始 JSON 协议数据泄露到剧情区
            const streamNarrative = this._extractStreamNarrative(displayFull);
            if (streamNarrative !== lastDisplay) {
              const displayDelta = streamNarrative.slice(lastDisplay.length);
              lastDisplay = streamNarrative;
              if (onChunk) onChunk(displayDelta, streamNarrative);
            }
          }
        } catch (e) { /* skip */ }
      }
    }
    this._reportUsage(cfg.model, lastUsage);
    return rawFull;
  },

  // 将真实 token 用量上报给预算守护（TokenBudget）；非浏览器/未定义时安全跳过
  _reportUsage(model, usage) {
    if (!usage || !usage.total_tokens) return;
    try {
      if (typeof TokenBudget !== "undefined" && TokenBudget.record) TokenBudget.record(model, usage);
    } catch (e) { /* 计量失败绝不应影响游戏 */ }
  },

  // 发送请求（非流式，备用）
  async chat(messages, state) {
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("未配置 API Key，请先在设置中填写");

    const systemPrompt = this.buildSystemPrompt(state);

    const body = {
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: cfg.temperature,
      max_tokens: this.getMaxTokens(state, cfg),
      response_format: { type: "json_object" },
    };

    const resp = await this._fetchJson(
      cfg.baseURL.replace(/\/$/, "") + "/chat/completions",
      {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
      },
      JSON.stringify(body)
    );

    const json = await resp.json();
    this._reportUsage(cfg.model, json.usage);
    const content = json.choices?.[0]?.message?.content || "";
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  },

  // 解析AI返回的结构化JSON
  parseResponse(rawText) {
    let text = rawText.trim();
    // 过滤 reasoning 模型的 <think>...</think> 思考过程
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // 去除可能的markdown代码块包裹
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    // 1. 尝试直接解析
    try {
      const direct = JSON.parse(text);
      return this._makeResult(direct, rawText);
    } catch (e) { /* continue */ }

    // 1.5 维修通道：修复常见 AI 笔误（字符串内未转义的换行/回车/制表符、尾随逗号）后再试一次
    const repaired = this._repairJson(text);
    if (repaired && repaired !== text) {
      try {
        const parsed = JSON.parse(repaired);
        return this._makeResult(parsed, rawText);
      } catch (e) { /* continue */ }
    }

    // 2. 用栈匹配找到最外层 { }（避免narrative内{}干扰）
    const balancedJson = this._extractBalancedJson(text);
    if (balancedJson) {
      try {
        const parsed = JSON.parse(balancedJson);
        return this._makeResult(parsed, rawText);
      } catch (e) { /* continue */ }
    }

    // 3. 解析失败，尝试挽救：提取第一个 "narrative" 字段内容；若无则降级呈现（更柔和的兜底文案，不再是"灵机微滞"的玄学感）
    const narrative = this._extractNarrativeFallback(text) || "本程推演稍迟，先给你一招应对——你环顾四周，先择一策而行；下一回合会补全此程。";
    return {
      narrative: narrative,
      state_changes: {},
      options: this._generateFallbackOptions(narrative),
      optionRisks: [],
      memory: "",
      raw: rawText,
      parseError: true,
    };
  },

  _makeResult(parsed, rawText) {
    this._sanitizeOptions(parsed);
    // 最终兜底：如果 options 仍为空，再尝试从完整 raw 文本抢救（例如模型截断在 options 中间）
    if ((!Array.isArray(parsed.options) || parsed.options.length === 0) && rawText) {
      this._sanitizeOptions({ narrative: rawText, options: parsed.options });
      if (Array.isArray(parsed.options) && parsed.options.length > 0) {
        // 抢救到选项后，保持原 narrative 不变（不要替换）
      }
    }
    // 如果仍然为空，生成 3 个通用兜底选项，保证游戏能继续
    if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
      parsed.options = this._generateFallbackOptions(parsed.narrative || rawText);
    }
    // narrative 绝不可回退为 rawText，否则玩家会直接看到 JSON 协议数据
    if (!parsed.narrative || !String(parsed.narrative).trim()) {
      console.error("[AIService] narrative 为空，原始响应：", rawText.slice(0, 800));
      parsed.narrative = "（这一程推演稍迟，先为你开个场——你稳住心神，先择一策而行；下一回合会补全此程的天地变化。）";
    }
    // 解析选项风险标签（[平安]/[凶险]/[致命]）→ optionRisks，并把标签从选项文本中剥离
    const riskMap = { "致命": "lethal", "生死攸关": "lethal", "九死一生": "lethal", "凶险": "danger", "有凶险": "danger", "危险": "danger", "平安": "safe", "稳妥": "safe", "安全": "safe" };
    const cleanOptions = [];
    const optionRisks = [];
    (Array.isArray(parsed.options) ? parsed.options : []).forEach(raw => {
      if (raw && typeof raw === "object") {
        cleanOptions.push(String(raw.text || ""));
        optionRisks.push(raw.risk || "safe");
        return;
      }
      const s = String(raw);
      const m = s.match(/\s*\[([^\]]+)\]\s*$/);
      if (m) {
        const tag = m[1].trim();
        cleanOptions.push(s.slice(0, m.index).trim());
        optionRisks.push(riskMap[tag] || "safe");
      } else {
        cleanOptions.push(s.trim());
        optionRisks.push("safe");
      }
    });
    parsed.options = cleanOptions;
    parsed.optionRisks = optionRisks;

    return {
      narrative: parsed.narrative,
      state_changes: parsed.state_changes || {},
      options: parsed.options,
      optionRisks: parsed.optionRisks,
      memory: (typeof parsed.memory === "string") ? parsed.memory : "",
      raw: rawText,
    };
  },

  // 兜底清理：若 AI 把 options 块误写入 narrative，尝试提取并剥离
  _sanitizeOptions(parsed) {
    if (!parsed || typeof parsed.narrative !== "string") return;
    let text = parsed.narrative;

    // 方案 A：narrative 末尾出现 "options:" / "选项：" 等显式标记
    const markerPattern = /(?:\n\s*)+(?:options|选项|可选行动|行动选项)\s*[:：]/i;
    const markerMatch = text.match(markerPattern);
    if (markerMatch) {
      const before = text.slice(0, markerMatch.index).trim();
      const after = text.slice(markerMatch.index + markerMatch[0].length).trim();
      const extracted = this._extractOptionLines(after);
      if (extracted.length) {
        text = before;
        this._mergeOptions(parsed, extracted);
      }
    }

    // 方案 B：没有显式标记，但 narrative 末尾紧跟 3-5 个列表项（AI 常直接 `- ` 罗列选项）
    const trailingListPattern = /(?:\n|^)\s*([-—*•·]\s+.+|\d+[.、]\s+.+)(?:\n\s*(?:[-—*•·]\s+.+|\d+[.、]\s+.+)){2,4}\s*$/;
    const listMatch = text.match(trailingListPattern);
    if (listMatch) {
      const listStart = listMatch.index;
      const before = text.slice(0, listStart).trim();
      const listText = text.slice(listStart);
      const extracted = this._extractOptionLines(listText);
      if (extracted.length >= 3) {
        text = before;
        this._mergeOptions(parsed, extracted);
      }
    }

    parsed.narrative = text;
  },

  _extractOptionLines(block) {
    const extracted = [];
    block.split(/\n+/).forEach(line => {
      line = line.trim();
      if (!line) return;
      // 去掉列表符号、数字序号、前后引号
      line = line.replace(/^[-—*•·]\s+/, "").replace(/^\d+[.、]\s+/, "");
      line = line.replace(/^["'""''`]+|["'""''`]+$/g, "");
      if (line && line.length > 2) extracted.push(line);
    });
    return extracted;
  },

  _mergeOptions(parsed, extracted) {
    if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
      parsed.options = extracted;
    } else {
      const set = new Set(parsed.options);
      extracted.forEach(o => set.add(o));
      parsed.options = Array.from(set);
    }
  },

  // 栈匹配：从文本中提取最外层合法的 JSON 对象
  _extractBalancedJson(text) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') {
          inString = true;
        } else if (ch === "{") {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === "}") {
          if (depth > 0) {
            depth--;
            if (depth === 0) {
              return text.slice(start, i + 1);
            }
          }
        }
      }
    }
    return null;
  },

  // 维修通道：修复 AI 常见的、会导致 JSON.parse 失败的笔误
  // 1) 字符串值内部出现裸换行/回车/制表符 → 转义为 \n \r \t
  // 2) 对象/数组内的尾随逗号 → 删除
  // 注意：已在引号内且已转义的字符不会被重复转义，避免破坏合法 JSON
  _repairJson(text) {
    if (typeof text !== "string") return text;
    let out = "";
    let inStr = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
      }
      out += ch;
    }
    // 删除对象/数组内的尾随逗号： ,}  ,]
    out = out.replace(/,(\s*[}\]])/g, "$1");
    return out;
  },

  // 从叙事文本生成 3 个通用兜底选项（抢救失败时保证游戏不卡死）
  _generateFallbackOptions(narrative) {
    const n = (narrative || "").trim();
    if (!n) return ["观察四周", "开口询问", "保持警惕"];
    // 尽量根据地点/人物/事件生成一点上下文
    const locMatch = n.match(/(?:身处|位于|在|来到|步入|闯入|抵达|遁入)(?:了|至|进)?["']?([^"'，。\n]{2,8})["']?/);
    const someone = n.match(/([^\s，。]{1,4})(?:弟子|修士|道人|仙子|长老|前辈|前辈|师兄|师姐|师弟|师妹|阁下|道友|少年|少女|老|者|姑娘|公子|汉子)/);
    const place = locMatch ? locMatch[1] : "此地";
    const person = someone ? someone[1] + someone[2] : "附近之人";
    return [
      `在${place}仔细搜寻线索`,
      `与${person}搭话，探听虚实`,
      "静坐调息，巩固当前状态"
    ];
  },


  _extractNarrativeFallback(text) {
    const m = text.match(/"narrative"\s*:\s*"([\s\S]*?)"\s*,\s*"(state_changes|options|memory)"/);
    if (m) {
      return m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return null;
  },

  // 从流式累积的原始 JSON 中，实时提取 narrative 字段内容用于前端展示，避免把 JSON 协议数据直接塞给玩家
  _extractStreamNarrative(raw) {
    let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trimStart();
    if (!text.includes('"narrative"')) return "";
    // 捕获到下一个已知顶层字段或文本末尾；因 narrative 内的引号均经 JSON 转义，不会误截
    const m = text.match(/"narrative"\s*:\s*"([\s\S]*?)(?:(?="\s*,\s*"(?:state_changes|options|memory)")|$)/);
    if (!m) return "";
    return m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  },

  // 生成修士列传（生平小传），流式输出
  async generateBiography(state, onChunk) {
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("未配置 API Key，请先在设置中填写");

    const logText = Game.getBiographyLogText();
    const c = state.character;
    const alive = state.meta.alive;
    const systemPrompt = `你是为古典仙侠游戏《浮生仙途》执笔的史官，需为玩家本轮修仙之旅写一篇修士列传。

要求：
一、笔法半文半白，仿史传体格（可自「某者，某地一道修士也」起笔；若本界以灵根/血脉等特定体系修行，则依其术语落笔），文气须足，可读性强。
二、内容须涵盖：名号与本界修行体系之出身；初入仙途之缘起；一生中三至五处关键转折（奇遇、苦战、恩怨、破境、证道皆可）；最终结局（须契合玩家当下命运——已陨落则写其陨落与遗响，尚在人间则写其处境与未竟之志，已飞升则写其白日飞升、位列仙班之圆满；以技证道者须点出其凭一艺通天之由）；末以「后世评曰」一句收束。
三、须严格依据玩家真实经历撰写，不得编造经历中本无之情节；可渲染意境，然事实当忠于记录。
四、全文约五百至九百字，分二至四段，段与段之间以两个换行分隔。
五、只输出传记正文，请勿附加任何解释、标题或代码围栏。`;

    const userPrompt = `【修士档案】
道号：${c.name}
性别 / 真身：${c.genderName}${c.gender === "bag" ? "（超市购物袋）" : ""}
${c.cultivationSystem || "灵根"}：${c.root}${c.element ? "（属"+c.element+"）" : ""}
出身：${c.background}
最终境界：${c.realm}
声望：${c.reputation}
寿元：${c.lifespan} / ${c.maxLifespan}
存殁：${state.meta && state.meta.ascended ? '已白日飞升，位列仙班' : (alive ? '尚在人间，仙途未竟' : '已陨落')}
所修功法：${c.techniques.length ? c.techniques.join('、') : '无'}
金手指 / 系统：${c.systems && c.systems.length ? c.systems.join('、') : '无'}
生活技能：${c.skills && Object.keys(c.skills).length ? Object.keys(c.skills).map(k => `${k} ${c.skills[k].proficiency}/100${c.skills[k].path ? '〔' + c.skills[k].path + '〕' : ''}`).join('、') : '无'}
随身之物：${c.inventory.length ? c.inventory.map(i => i.name).join('、') : '空'}

${(() => {
  const _mp = state.meta && state.meta.mainPlot;
  const _th = (state.meta && state.meta.threads) || [];
  const _open = _th.filter(t => t.status === "planted").map(t => t.hint);
  const _done = _th.filter(t => t.status === "resolved").map(t => t.hint);
  let _s = "";
  if (_mp && _mp.title) _s += `主线（中央冲突）：${_mp.title}——${_mp.conflict}${_mp.resolved ? "（已于飞升之刻收束）" : "（行进中）"}\n`;
  if (_open.length) _s += "未解关键信息：" + _open.join("、") + "\n";
  if (_done.length) _s += "已闭合线索：" + _done.join("、") + "\n";
  return _s;
})()}
【本次仙途全记录（按时间先后）】
${logText}

请据此为这位修士立传。`;

    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 1200,
      stream: true,
    };
    if ((cfg.baseURL || "").includes("deepseek.com")) {
      body.stream_options = { include_usage: true };
    }

    const resp = await fetch(cfg.baseURL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('API请求失败 (' + resp.status + '): ' + errText.slice(0, 200));
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let bioUsage = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.usage) bioUsage = json.usage;
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            if (onChunk) onChunk(delta, fullText);
          }
        } catch (e) { /* skip */ }
      }
    }
    this._reportUsage(cfg.model, bioUsage);
    return fullText;
  },
};
