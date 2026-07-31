// ============================================================
//  《浮生仙途》游戏引擎
//  Game Engine & State Manager
// ============================================================

// 叙事节奏（篇幅档位）：由玩家在选人页/设置页选择，决定每回合文本长度与 max_tokens 上限
// 注：原「短剧形式」与「电视剧形式」已融合为单一的「电视剧形式」（可长可短、快节奏到情景交融），
// 仅保留「电视剧形式」与「沉浸世界」两档，降低玩家选择负担。
const NARRATIVE_MODES = [
  { key: "standard",  label: "电视剧形式", desc: "快节奏到情景交融·可长可短·一屏至数屏",     maxTokens: 2000,
    rule: "【叙事篇幅 · 电视剧形式】每回合主线叙事控制在 200-450 字（4-7 句），手机一至三屏可读完。融合短剧的明快与电视剧的情景交融：以关键动作、对话与决断推进为主，可配一两笔感官细节（风声、剑鸣、檀香）与适度心理活动点缀，情景交融但不拖沓；空行分段，每段不超 3 句。无论篇幅长短，都必须保证返回完整的 JSON，尤其是 options 数组须有 3-4 个具体选项，每个选项一句话即可；宁可叙事再精炼，也绝不可截断 options。" },
  { key: "immersive", label: "沉浸世界", desc: "详尽沉浸·意境铺陈·长篇仙侠",       maxTokens: 2000,
    rule: "【叙事篇幅 · 沉浸世界】每回合主线叙事可写至 500-800 字，充分铺陈意境、感官细节、环境描写与人物心理，营造沉浸式仙侠世界。仍可空行分段提升可读性，但允许较长篇幅与细腻笔触。必须保证 JSON 完整，options 数组始终含 3-4 个选项。" },
];

// 品级徽章配色：依据阶位（黄/玄/地/天/帝）返回内联样式
function gradeBadgeStyle(grade) {
  const g = grade || "";
  let color = "#b08d57"; // 黄阶（默认）
  if (g.indexOf("玄") >= 0) color = "#5fae8c";
  else if (g.indexOf("地") >= 0) color = "#5b8fd6";
  else if (g.indexOf("天") >= 0) color = "#a877d8";
  else if (g.indexOf("帝") >= 0) color = "#d9a93a";
  return `display:inline-block;font-size:11px;padding:1px 6px;border-radius:3px;margin-right:6px;color:${color};background:${color}22;border:1px solid ${color}55;`;
}

const Game = {
  state: null,       // 当前游戏状态
  history: [],      // 对话历史（传给AI）
  log: [],          // 故事展示日志（用于恢复显示与滚动回看）
  isProcessing: false,
  lastSnapshot: null, // 本回合快照（用于刷新重试）

  // ============ 初始化新角色 ============
  // seed: 世界种子（字符串）。留空则随机生成——同一种子必得同一方天地。
  createCharacter(opts) {
    // 兼容旧调用：createCharacter(name, rootIndex, bgIndex, genderIndex, seed, narrationMode)
    if (opts && typeof opts !== "object") {
      opts = { name: arguments[0], rootIndex: arguments[1], bgIndex: arguments[2], genderIndex: arguments[3], seed: arguments[4], narrationMode: arguments[5] };
    }
    opts = opts || {};
    const name = opts.name;
    const rootIndex = (opts.rootIndex != null) ? opts.rootIndex : null;
    const bgIndex = (opts.bgIndex != null) ? opts.bgIndex : Math.floor(Math.random() * BACKGROUNDS.length);
    const genderIndex = (opts.genderIndex != null) ? opts.genderIndex : Math.floor(Math.random() * GENDERS.filter((g) => !g.joke).length);
    const seed = (opts.seed != null && opts.seed !== "") ? opts.seed : WorldGen.randomSeed();
    const narrationMode = opts.narrationMode || "standard";
    const bg = BACKGROUNDS[bgIndex];
    const gender = GENDERS[genderIndex] || GENDERS[0];
    const realm0 = REALMS[0];
    const formKey = opts.form || "human";
    const FORM = (typeof FORMS !== "undefined" && FORMS[formKey]) ? FORMS[formKey] : (FORMS ? FORMS.human : null);
    const formRealm0 = (FORM && FORM.realms && FORM.realms[0]) ? FORM.realms[0] : realm0.name;

    // 由世界种子确定性生成此界天地（许愿可轻度偏置风土）
    const gen = WorldGen.generateWorld(seed, opts.wish);

    // 本界修炼体系（诸天万界各有其"方言"）：灵根/血脉/命格/道种/元素亲和/灵枢……
    const cultSystem = (typeof CULTIVATION_SYSTEMS !== "undefined" && CULTIVATION_SYSTEMS.find)
      ? (CULTIVATION_SYSTEMS.find((s) => s.id === gen.cultivationSystem) || CULTIVATION_SYSTEMS[0])
      : null;
    const traitList = cultSystem ? cultSystem.traits : (typeof SPIRITUAL_ROOTS !== "undefined" ? SPIRITUAL_ROOTS : [{ name: "灵根", element: "", affinity: { 攻击: 1, 防御: 1, 修炼: 1 } }]);
    const traitIndex = (rootIndex != null && rootIndex < traitList.length) ? rootIndex : Math.floor(Math.random() * traitList.length);
    const root = traitList[traitIndex];
    const cultivationSystemName = cultSystem ? cultSystem.name : "灵根";

    // 主线（中央冲突）：从原型库随机择一，并以本界天地（种子）填充占位符，同源同界
    let mainPlot = null;
    if (typeof MAIN_PLOT_ARCHETYPES !== "undefined" && MAIN_PLOT_ARCHETYPES.length) {
      const arche = MAIN_PLOT_ARCHETYPES[Math.floor(Math.random() * MAIN_PLOT_ARCHETYPES.length)];
      const pick = (arr, fb) => (arr && arr.length) ? arr[Math.floor(Math.random() * arr.length)] : fb;
      const faction = pick(gen.factions, { name: "某个古老宗门" }).name;
      // 锚定：{rumor} 优先取本界一条真·江湖秘闻（让"世界传闻"即"主线素材"，两条话本合流）；
      // 若本界未生成秘闻，再退化成一句通用秘闻。
      const rumor = pick(gen.rumors, "一桩被岁月掩埋的秘闻");
      const npc = pick(gen.npcs, { name: "一位神秘前辈" }).name;
      // {realm} 在主线文案里指的是"本界某处地域/地名"（如《XX秘典》），并非修炼境界；
      // 故取一个真实生成的地域名，而非 realm0.name（炼气期之类会语义错乱）。
      const regionName = pick(gen.regions, { name: "本界" }).name;
      const fill = (s) => String(s)
        .replace(/\{faction\}/g, faction)
        .replace(/\{rumor\}/g, rumor)
        .replace(/\{npc\}/g, npc)
        .replace(/\{realm\}/g, regionName);
      mainPlot = {
        archetype: arche.id,
        title: arche.title,
        conflict: fill(arche.conflict),
        beats: arche.beats.map(fill),
        resolved: false,
        revealedStage: 0,
        log: [],
      };
    }

    this.state = {
      character: {
        name: name || "无名修士",
        gender: gender.id,
        genderName: gender.name,
        form: formKey,               // 魂穿形态：人/妖/器/灵/草木……任意
        formName: FORM ? FORM.name : "人族",
        wish: opts.wish || null,        // 玩家许愿
        cultivationSystem: cultivationSystemName, // 本界修行体系之名（灵根/血脉/命格…）
        root: root.name,
        element: root.element || "",
        affinity: root.affinity,
        background: bg.name,
        // 修为
        realm: formRealm0,           // 初始境界名随形态而定（树→萌芽期，人→炼气期）
        realmLevel: 1,
        realmProgress: 0,        // 当前境界进度 0-100
        qi: 50,                  // 灵力
        maxQi: realm0.maxQi,
        hp: 100,
        maxHp: 100,
        spiritualStones: bg.bonus.灵石 || 0,
        lifespan: 120,           // 寿元
        maxLifespan: 120,
        reputation: 0,           // 声望
        justice: 0,              // 正义值（侠义之举累积）
        evil: 0,                 // 邪恶值（邪行之举累积）
        comprehension: bg.bonus.悟性 || 6, // 悟性
        constitution: bg.bonus.体质 || 1.0, // 体质倍率
        // 背包（开局即带几件带品级的物品/丹药/法宝，便于直观看到「品级显示」）
        inventory: [
          bg.bonus.功法 ? { name: bg.bonus.功法, type: "功法", grade: "黄阶上品" } : { name: "引气诀", type: "功法", grade: "黄阶下品" },
          { name: "聚气丹", type: "丹药", grade: "黄阶中品", desc: "服之可速复灵力。" },
          { name: "疗伤散", type: "丹药", grade: "黄阶下品", desc: "外伤敷用，止血生肌。" },
          { name: "青锋剑", type: "法宝", grade: "玄阶上品", desc: "三尺青锋，削铁如泥。" },
        ],
        techniques: bg.bonus.功法 ? [bg.bonus.功法] : ["引气诀"],
        // 生活技能：{ 技能名: { proficiency: 0-100, path: 进阶之路名|null } }
        skills: {},
        pills: [],
        // 灵宠
        pet: null,
        // 金手指 / 系统：玩家觉醒或声明的外挂（天道面板、命格任务、签到仙缘等）。
        // 关键：这是【永久属性】，始终随 character 进入系统提示词，绝不依赖易失的 memory 滑窗，
        // 因此 AI 不会像忘记剧情记忆那样忘记玩家的系统。
        systems: [],
        // 因果（剑来式规则内核）：因果力=行之积累的威能(助破境避险)，因果债=欠下的因与诺(负累，过重招灾)
        causeCredit: Math.max(0, Math.floor(opts.inheritCredit || 0)),
        causeDebt: 0,
      },
      world: {
        seed: gen.seed,
        location: gen.startLocation,
        timeOfDay: "辰时",
        day: 1,
        weather: WEATHERS[0],
        weatherIndex: 0,
        spirit: gen.spirit,          // 灵力值（驱动境界上限）
        realmCapLevel: gen.realmCapLevel,
        cultivationSystem: gen.cultivationSystem || "lingen",
        cultivationSystemName: cultivationSystemName,
        wish: gen.wish || null,
        gen: gen,                // 本界天地（确定性生成，随存档保存）
      },
      // 各 NPC 好感度：以人物名为键；开局不预填，仅在剧情中真正结识的人物才入表（met:true）
      npcs: {},
      // 各 NPC 独立记忆：随剧情累积其见闻与标记，每回合注入 AI 提示词，使其"不忘设定、随剧情成长"
      npcMemory: {},
      narrationMode: narrationMode || "standard",  // 叙事节奏档位：short / standard / immersive
      meta: {
        createdAt: Date.now(),
        projectionId: opts.projectionId || ((gen.id) + "-" + Date.now()),
      playTurn: 0,
      alive: true,
      pacing: { calmStreak: 0, peakStreak: 0 },
      mainPlot: mainPlot,
        threads: [],
      },
      memory: [],
      biography: null,
      // 玩家风格画像：完全由实际选择动态累积，不预设
      preferences: {
        tags: { combat: 0, social: 0, cultivation: 0, exploration: 0, craft: 0, romance: 0, scheming: 0, mercy: 0 },
      },
    };

    // 初始化各 NPC 独立记忆（档案来自世界生成；后续由 AI 的 npc_memory 字段累积见闻与标记）
    (gen.npcs || []).forEach(n => {
      if (!this.state.npcMemory[n.name]) {
        this.state.npcMemory[n.name] = {
          profile: n.profile || {},
          arche: n.arche || "", gender: n.gender || "",
          title: n.title || "", trait: n.trait || "", where: n.where || "",
          notes: [], flags: {}, relations: {},
        };
      }
    });

    this.history = [];
    this.log = [];
    this.save();
    return this.state;
  },

  // ============ 体验节奏引擎（境界驱动） ============
  // 让"剧情弧"与"关卡(境界)"用同一时钟：境界即幕，突破即转折，飞升即合。
  // 不再把终章/大结局锁死在第30程，而由玩家真实境界与突破决定。
  getPacing(playTurn) {
    const turn = Math.max(1, (playTurn | 0) || 1);
    // 引擎 realmLevel 为 1 基（1=炼气期 … 10=飞升期），先取原值
    const rlRaw = (this.state && this.state.character) ? this.state.character.realmLevel : 1;
    const maxRl = (typeof REALMS !== "undefined" && REALMS.length) ? REALMS.length - 1 : 9; // 0 基上限(飞升=9)
    // 转为 0 基索引供 ARCS 使用
    const rl = Math.max(0, Math.min(maxRl, (typeof rlRaw === "number" ? rlRaw : 1) - 1));

    // 境界即幕：每个大境界=一卷，对应文艺结构的一幕（起承转合·飞升为"合"）
    const ARCS = [
      { key: "act1",  name: "第一卷·初入凡尘", arc: "free",   tension: 4,
        note: "低境如蝼蚁，凶险密布。以一场令人心痒的开场奇遇勾住玩家，并尽早埋下第一个危机钩子（追杀/异象/旧仇），让他想看后续；此阶段最易受伤乃至殒落，须如实演绎生死分量。" },
      { key: "act2",  name: "第二卷·道基初成", arc: "free",   tension: 4,
        note: "根基渐稳，初入宗门江湖，恩怨初结。平稳探索与市井奇遇交替，但务必安排成长记忆点：初得灵宠、初遇劲敌、或小秘境探幽。" },
      { key: "mid",   name: "第三卷·金丹问道", arc: "rising", tension: 4,
        note: "中点转折。御器飞行、声望初显，大势力开始注意到玩家。安排一次'中点反转'：身世/世界观秘闻浮现，或阵营初冲突，为后半程蓄势。" },
      { key: "act3",  name: "第四卷·元婴争锋", arc: "rising", tension: 4,
        note: "神识初成，可立门户、结生死交。群雄并起，昔日小敌或已成一方豪强；伏笔开始回响，旧仇新怨交织。" },
      { key: "act4",  name: "第五卷·化神称尊", arc: "rising", tension: 4,
        note: "可借天地之力，一方豪雄。势力博弈升级，须有智斗与布局，而非单纯碾压；'升级有代价'的博弈感渐浓。" },
      { key: "act5",  name: "第六卷·炼虚合道", arc: "rising", tension: 4,
        note: "身融天地，古修秘辛、上古布局渐次揭开；世界真相的碎片浮现，主线矛盾逼近台前。" },
      { key: "act6",  name: "第七卷·天人合一", arc: "rising", tension: 5,
        note: "法力无边，天地大势力正面博弈。阵营大战、秘境夺宝规模空前；旧日伏笔须在此卷前后集中回收。" },
      { key: "act7",  name: "第八卷·天劫九死", arc: "rising", tension: 5,
        note: "天劫降临，命悬一线。旧敌新仇总爆发，须有死战逆袭与天地异变；此卷是'高潮'的承压段。" },
      { key: "act8",  name: "第九卷·半步飞升", arc: "rising", tension: 5,
        note: "大乘圆满，飞升在望，诸天异动。各方因'飞升之机'闻风而动，人心浮动，大结局前最后的暗涌。" },
      { key: "finale", name: "终卷·白日飞升",   arc: "finale", tension: 5,
        note: "真正大结局之'合'：飞升成仙，仙途功成，天地共贺。此后非必须终结——可自由续写仙界新篇，但须有'功成圆满'的收束感，伏笔尽数回响。" },
    ];
    const stage = ARCS[rl] || ARCS[0];
    const finale = (typeof rlRaw === "number" && rlRaw >= REALMS.length); // 飞升期=最后境界

    // 里程碑：开篇，或刚完成一次境界跃迁（handleBreakthrough 写入 realmMilestoneTurn）
    const meta = (this.state && this.state.meta) || {};
    let milestone = null;
    if (turn === 1) milestone = stage.name;
    else if (typeof meta.realmMilestoneTurn === "number" && meta.realmMilestoneTurn === turn) milestone = stage.name;

    // 突破余韵：突破发生后的 1-3 程内，导演须演绎"转/高潮"式顿悟余韵
    let breakthroughClimax = false;
    if (typeof meta.breakthroughTurn === "number") {
      const d = turn - meta.breakthroughTurn;
      if (d >= 1 && d <= 3) breakthroughClimax = true;
    }

    // 高光节点：保留按程数的留存节奏（每 6 程一次，特定程加强），与境界弧并行不悖
    const highlightDue = (turn % 6 === 0 && turn > 2) || [6, 12, 18, 24, 30].includes(turn);

    return {
      turn,
      realmLevel: rl,
      phase: stage.key,
      phaseName: stage.name,
      arc: stage.arc,
      tension: stage.tension,
      milestone,
      highlightDue,
      breakthroughClimax,
      finale,
      directorNote: stage.note,
      calmStreak: (this.state && this.state.meta && this.state.meta.pacing) ? (this.state.meta.pacing.calmStreak || 0) : 0,
      peakStreak: (this.state && this.state.meta && this.state.meta.pacing) ? (this.state.meta.pacing.peakStreak || 0) : 0,
      forcePeak: ((this.state && this.state.meta && this.state.meta.pacing) ? (this.state.meta.pacing.calmStreak || 0) : 0) >= 3,
      forceCalm: ((this.state && this.state.meta && this.state.meta.pacing) ? (this.state.meta.pacing.peakStreak || 0) : 0) >= 2,
    };
  },

  // ============ 仙途图谱（关卡脉络 · 境界即关卡） ============
  // 把"关键路径 = 境界阶梯"与"可选分支 = 秘境/试炼/支线/周秘"整理成给玩家看的结构，
  // 用于仙途图谱弹窗与大地图高亮。让玩家始终知道"我在哪、下一步去哪、有哪些支线可玩"。
  getPathInfo() {
    const c = (this.state && this.state.character);
    const gen = (this.state && this.state.world && this.state.world.gen);
    if (!c) return null;
    const rlRaw = (typeof c.realmLevel === "number") ? c.realmLevel : 1;            // 1 基
    const maxRl = (typeof REALMS !== "undefined") ? REALMS.length : 10;
    const targetRl = Math.min(maxRl, rlRaw + 1);

    // 关键路径 = 境界阶梯（炼气→…→飞升），标记 已过/当前/下一步
    const ladder = (typeof REALMS !== "undefined" ? REALMS : []).map((r, i) => {
      const lv = i + 1;
      return {
        level: lv,
        name: r.name,
        done: lv < rlRaw,
        current: lv === rlRaw,
        next: lv === rlRaw + 1,
      };
    });

    const pacing = this.getPacing(this.state.meta ? this.state.meta.playTurn : 1);

    // 可选分支节点（秘境/试炼/支线）——来自 worldgen 标记
    const branches = [];
    if (gen && gen.regions) {
      gen.regions.forEach((r) => {
        if (r.branch === "secret" || r.branch === "trial" || r.branch === "sidequest") {
          branches.push({
            name: r.name, type: r.type, branch: r.branch, danger: r.danger,
            timed: r.timed || 0, desc: r.desc, macro: r.macro,
          });
        }
      });
    }
    // 本周秘境：基于种子确定性生成（整周稳定，过期再候轮回）
    let weekly = null;
    if (gen && typeof WorldGen !== "undefined") {
      try {
        weekly = WorldGen.weeklySecretRealm(gen.seed);
        branches.push({
          name: weekly.name, type: "秘境", branch: "weekly", danger: weekly.danger,
          timed: weekly.timed, desc: weekly.desc, macro: weekly.macro, weekLabel: weekly.weekLabel,
        });
      } catch (e) { /* 周秘生成失败不影响主流程 */ }
    }

    const nextRealmName = (targetRl <= maxRl) ? REALMS[targetRl - 1].name : null;
    const stepsToNext = Math.max(0, targetRl - rlRaw);

    return {
      realmLevel: rlRaw,
      realmName: c.realm,
      nextRealmName,
      stepsToNext,
      actName: pacing.phaseName,
      actKey: pacing.phase,
      finale: pacing.finale,
      ladder,
      branches,
      weeklyName: weekly ? weekly.name : null,
    };
  },

  // ============ 新手前期记忆点脚本（前 30 程强留存） ============
  // 按程数窗口注入轻量引导，制造早期强记忆点（初遇灵宠/初探秘境/初遇劲敌）。
  // 每个记忆点只触发一次；不在窗口内则清除提示，避免重复。
  _maybeInjectMemoryPoint() {
    if (!this.state || !this.state.meta) return;
    const turn = this.state.meta.playTurn; // 此值已在 processAction 中自增为本回合
    const fired = this.state.meta.firedMemoryPoints || (this.state.meta.firedMemoryPoints = {});
    const POINTS = [
      { key: "first_pet", from: 5, to: 9, hint: "新手记忆点·初遇灵宠：本回合或近几回合内，须安排一次灵宠 / 灵兽的邂逅或缔结契机（羁绊初结），作为玩家早期最暖的记忆点——可遇于秘境、坊市，或危难相救之际。" },
      { key: "first_secret", from: 11, to: 16, hint: "新手记忆点·初探秘境：须自然引导玩家踏入一处秘境 / 灵穴探幽，给予探索感与初期小机缘（勿过早给大道果，重在'发现'的惊喜）。" },
      { key: "first_rival", from: 19, to: 25, hint: "新手记忆点·初遇劲敌：须引入一名与玩家棋逢对手、日后可成宿敌或挚友的 NPC，埋下长期羁绊钩子（留名、留悬念、留未了之争）。" },
    ];
    for (const p of POINTS) {
      if (turn >= p.from && turn <= p.to && !fired[p.key]) {
        fired[p.key] = true;
        this.state.meta.memoryPointHint = p.hint;
        return;
      }
    }
    this.state.meta.memoryPointHint = null; // 不在窗口内，清除上回合提示
  },

  // ============ 应用状态变更 ============
  applyChanges(changes) {
    const c = this.state.character;
    const w = this.state.world;
    let ch = changes || {};
    const deltas = [];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // 兼容 AI 可能的单复数/别名写法，防止剧情写了获得功法/换地点但 state_changes 字段名不对
    if (!ch.techniques_gained && ch.technique_gained) {
      ch.techniques_gained = Array.isArray(ch.technique_gained) ? ch.technique_gained : [ch.technique_gained];
    }
    if (!ch.techniques_gained && ch.technique) {
      ch.techniques_gained = Array.isArray(ch.technique) ? ch.technique : [ch.technique];
    }
    if (!ch.techniques_gained && ch.techniques) {
      ch.techniques_gained = Array.isArray(ch.techniques) ? ch.techniques : [ch.techniques];
    }
    if (!ch.location_change && ch.location) ch.location_change = ch.location;
    if (!ch.location_change && ch.new_location) ch.location_change = ch.new_location;

    // 兼容 AI 可能的各种写法：金手指/系统/面板/签到/命格任务/气运值 等
    const sysAliases = ["systems_gained", "system_gained", "system", "systems", "golden_finger", "goldenFinger", "golden_fingers", "goldenFingers", "jinzhichang", "金手指"];
    sysAliases.forEach(k => {
      if (!ch.systems_gained && ch[k] != null) {
        ch.systems_gained = Array.isArray(ch[k]) ? ch[k] : [ch[k]];
      }
    });
    if (!ch.systems_lost && ch.system_lost) {
      ch.systems_lost = Array.isArray(ch.system_lost) ? ch.system_lost : [ch.system_lost];
    }

    if (ch.qi !== undefined) {
      const before = c.qi;
      c.qi = clamp(c.qi + ch.qi, 0, c.maxQi);
      const v = c.qi - before;
      if (v !== 0) deltas.push(`灵力 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.hp !== undefined) {
      const inc = Math.max(-40, Math.min(40, Number(ch.hp) || 0)); // 单次气血增量钳制
      const before = c.hp;
      c.hp = clamp(c.hp + inc, 0, c.maxHp);
      const v = c.hp - before;
      if (v <= 0 && c.hp <= 0) { this.handleDeath(); return { flag: "death", deltas }; }
      if (v !== 0) deltas.push(`气血 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.spiritual_stones !== undefined) {
      // 合理性护栏：单次灵石增量封顶 ±100万，累计封顶 1 亿，防止模型后期写出天文数字逐轮翻倍导致数值爆炸
      let inc = Math.max(-1000000, Math.min(1000000, Number(ch.spiritual_stones) || 0));
      const before = c.spiritualStones;
      c.spiritualStones = Math.max(0, Math.min(100000000, c.spiritualStones + inc));
      const v = c.spiritualStones - before;
      if (v !== 0) deltas.push(`灵石 ${v > 0 ? "+" : ""}${v}`);
    }
    // 是否由 AI 主动给出了进境值（含 0，如"闲游/过场"）。用于区分"AI 漏给"与"AI 主动给少/给0"。
    const rpGiven = ch.realm_progress !== undefined;
    if (rpGiven) {
      const inc = Math.max(-5, Math.min(12, Number(ch.realm_progress) || 0)); // 单次增量钳制，防一回合摸顶
      const before = c.realmProgress;
      c.realmProgress = clamp(c.realmProgress + inc, 0, 100);
      const v = c.realmProgress - before;
      if (c.realmProgress >= 100) {
        const bf = this.handleBreakthrough();
        if (bf === "max_realm") deltas.push("已臻至境，更进无门");
        else deltas.push(bf === "breakthrough_success" ? "突破成功！境界提升" : "突破失败，反噬重伤");
        return { flag: bf, deltas };
      }
      if (v !== 0) deltas.push(`突破进度 ${v > 0 ? "+" : ""}${v}`);
    }
    // 日月精进（保底）：仅当 AI 完全漏给"进境"键时才给极小保底(1)，避免"0 进境卡死"回归；
    // 若 AI 主动给值（含 0，表示本回合无所历练），则尊重之——抉择的轻重由此体现，不被保底稀释。
    if (c.hp > 0 && !rpGiven) {
      const baseline = 1;
      c.realmProgress = clamp(c.realmProgress + baseline, 0, 100);
      if (c.realmProgress >= 100) {
        const bf = this.handleBreakthrough();
        if (bf === "max_realm") deltas.push("已臻至境，更进无门");
        else deltas.push(bf === "breakthrough_success" ? "突破成功！境界提升" : "突破失败，反噬重伤");
        return { flag: bf, deltas };
      }
    }
    if (ch.realm_level_change !== undefined && typeof ch.realm_level_change === "number" && ch.realm_level_change !== 0) {
      const oldLevel = c.realmLevel;
      this._advanceRealm(c.realmLevel + ch.realm_level_change);
      if (c.realmLevel !== oldLevel) deltas.push(`境界变为 ${c.realm}`);
    }
    if (ch.reputation_change !== undefined) {
      const inc = Math.max(-100000, Math.min(100000, Number(ch.reputation_change) || 0));
      const before = c.reputation;
      c.reputation = Math.max(-1000000, Math.min(1000000000, before + inc));
      const v = c.reputation - before;
      if (v !== 0) deltas.push(`声望 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.lifespan_change !== undefined) {
      const inc = Math.max(-100000, Math.min(100000, Number(ch.lifespan_change) || 0));
      const before = c.lifespan;
      c.lifespan = Math.max(0, c.lifespan + inc);
      const v = c.lifespan - before;
      if (c.lifespan <= 0) { this.handleDeath("寿元耗尽，坐化于天地之间"); return { flag: "death", deltas }; }
      if (v !== 0) deltas.push(`寿元 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.comprehension_change !== undefined) {
      const inc = Math.max(-50, Math.min(50, Number(ch.comprehension_change) || 0));
      const before = c.comprehension;
      c.comprehension = Math.max(1, c.comprehension + inc);
      const v = c.comprehension - before;
      if (v !== 0) deltas.push(`悟性 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.location_change && ch.location_change !== w.location) {
      w.location = ch.location_change;
      deltas.push(`抵达 ${w.location}`);
      if (this.currentScreen === "map") this.renderWorldMap(); // 地图打开时实时更新当前位置
    }
    if (ch.day_change !== undefined && typeof ch.day_change === "number" && ch.day_change !== 0) {
      w.day = (w.day || 1) + ch.day_change;
      deltas.push(`时间推进 ${ch.day_change > 0 ? "+" : ""}${ch.day_change} 日`);
    }
    if (ch.time_of_day_change !== undefined && ch.time_of_day_change !== w.timeOfDay) {
      w.timeOfDay = ch.time_of_day_change;
      deltas.push(`时辰变为 ${w.timeOfDay}`);
    }
    if (ch.weather_change && ch.weather_change.name) {
      w.weather = { name: ch.weather_change.name, desc: ch.weather_change.desc || "" };
      deltas.push(`天候变为 ${w.weather.name}`);
    }

    // 正义值 / 邪恶值：两条独立累积轴，均不做负向出界
    if (ch.justice_change !== undefined) {
      const before = c.justice;
      c.justice = Math.max(0, c.justice + ch.justice_change);
      const v = c.justice - before;
      if (v !== 0) deltas.push(`正义 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.evil_change !== undefined) {
      const before = c.evil;
      c.evil = Math.max(0, c.evil + ch.evil_change);
      const v = c.evil - before;
      if (v !== 0) deltas.push(`邪恶 ${v > 0 ? "+" : ""}${v}`);
    }
    // 因果力 / 因果债（剑来式规则内核）：单次增量钳制 ±20，下限 0 不可为负
    if (ch.cause_credit_change !== undefined) {
      const inc = Math.max(-20, Math.min(20, Number(ch.cause_credit_change) || 0));
      const before = c.causeCredit;
      c.causeCredit = Math.max(0, c.causeCredit + inc);
      const v = c.causeCredit - before;
      if (v !== 0) deltas.push(`因果力 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.cause_debt_change !== undefined) {
      const inc = Math.max(-20, Math.min(20, Number(ch.cause_debt_change) || 0));
      const before = c.causeDebt;
      c.causeDebt = Math.max(0, c.causeDebt + inc);
      const v = c.causeDebt - before;
      if (v !== 0) deltas.push(`因果债 ${v > 0 ? "+" : ""}${v}`);
    }
    // 因果回响日志：记录显著善恶抉择，供后续叙事"翻旧账"（落实设计支柱·抉择有重量）
    if (!this.state.meta.karmaLog) this.state.meta.karmaLog = [];
    if (ch.cause_credit_change !== undefined || ch.cause_debt_change !== undefined) {
      const cred = Number(ch.cause_credit_change) || 0;
      const debt = Number(ch.cause_debt_change) || 0;
      if (cred !== 0 || debt !== 0) {
        const kind = cred > 0 ? "行善积德" : cred < 0 ? "了结旧债" : debt > 0 ? "造孽欠债" : "偿恩了债";
        this.state.meta.karmaLog.push({ turn: this.state.meta.playTurn, kind, cred, debt });
        if (this.state.meta.karmaLog.length > 40) this.state.meta.karmaLog.shift();
      }
    }
    // NPC 好感度变更：支持对象 {名字: 增减} 或数组 [{name, change}]
    const npcChanges = ch.npc_affinity_change;
    if (npcChanges) {
      const map = Array.isArray(npcChanges)
        ? npcChanges.reduce((m, x) => { if (x && x.name) m[x.name] = x.change; return m; }, {})
        : npcChanges;
      Object.keys(map).forEach(name => {
        const d = map[name];
        if (typeof d !== "number") return;
        if (!this.state.npcs[name]) {
          this.state.npcs[name] = { affinity: 0, title: "", trait: "", where: "" };
        }
        this.state.npcs[name].met = true; // 标记已在剧情中结识
        const before = this.state.npcs[name].affinity;
        this.state.npcs[name].affinity = Math.max(-100, Math.min(100, before + d));
        const v = this.state.npcs[name].affinity - before;
        if (v !== 0) deltas.push(`「${name}」好感 ${v > 0 ? "+" : ""}${v}`);
      });
    }
    // NPC 独立记忆增长：AI 每回合可把与本界人物发生的关键交集写入 npc_memory，
    // 引擎据此累加其"见闻/标记"，使其设定随剧情成长且不被遗忘（呼应"每个 NPC 有独立记忆"诉求）
    const npcMem = ch.npc_memory;
    if (npcMem) {
      const arr = Array.isArray(npcMem)
        ? npcMem
        : Object.keys(npcMem).map(name => Object.assign({ name }, npcMem[name]));
      arr.forEach(entry => {
        if (!entry || !entry.name) return;
        const nm = entry.name;
        const mem = (this.state.npcMemory[nm] = this.state.npcMemory[nm] || { profile: {}, notes: [], flags: {}, relations: {} });
        if (entry.note) {
          mem.notes = mem.notes || [];
          const text = String(entry.note);
          if (!mem.notes.some(x => x.text === text)) {
            mem.notes.push({ t: (this.state.meta && this.state.meta.playTurn) || 0, text });
          }
        }
        if (entry.flag) {
          mem.flags = mem.flags || {};
          mem.flags[entry.flag] = (mem.flags[entry.flag] || 0) + 1;
        }
        if (entry.relation) {
          mem.relations = mem.relations || {};
          mem.relations[entry.relation] = (mem.relations[entry.relation] || 0) + 1;
        }
      });
    }
    if (ch.items_gained && ch.items_gained.length) {
      const gainedNames = [];
      ch.items_gained.forEach(item => {
        if (typeof item === "string") {
          c.inventory.push({ name: item, type: "物品", desc: "", grade: "" });
          gainedNames.push(item);
        } else if (item && typeof item === "object" && item.name) {
          // kind/type 均可标类别（物品/丹药/法宝/材料/符箓），grade 为品级
          const type = item.kind || item.type || "物品";
          c.inventory.push({ name: item.name, type: type, desc: item.desc || "", grade: item.grade || "" });
          gainedNames.push(item.name);
        }
      });
      if (gainedNames.length) deltas.push(`获得 ${gainedNames.join("、")}`);
    }
    if (ch.items_lost && ch.items_lost.length) {
      ch.items_lost.forEach(itemRef => {
        const itemName = typeof itemRef === "string" ? itemRef : (itemRef && itemRef.name);
        if (!itemName) return;
        const idx = c.inventory.findIndex(i => i.name === itemName);
        if (idx !== -1) c.inventory.splice(idx, 1);
      });
      const lostNames = ch.items_lost.map(x => typeof x === "string" ? x : (x && x.name)).filter(Boolean);
      if (lostNames.length) deltas.push(`失去 ${lostNames.join("、")}`);
    }
    if (ch.techniques_gained && ch.techniques_gained.length) {
      ch.techniques_gained.forEach(t => {
        const tName = (typeof t === "string") ? t : (t && t.name);
        const tGrade = (t && typeof t === "object" && t.grade) ? t.grade : "";
        if (tName && !c.techniques.includes(tName)) {
          c.techniques.push(tName);
          c.inventory.push({ name: tName, type: "功法", grade: tGrade });
        }
      });
      deltas.push(`习得 ${ch.techniques_gained.join("、")}`);
    }
    // 金手指 / 系统：永久写入 character.systems（确保 AI 后续永不遗忘）
    if (ch.systems_gained && ch.systems_gained.length) {
      const gainedNames = [];
      ch.systems_gained.forEach(s => {
        const sName = (typeof s === "string") ? s : (s && (s.name || s.title));
        if (sName && !c.systems.includes(sName)) {
          c.systems.push(sName);
          gainedNames.push(sName);
        }
      });
      if (gainedNames.length) deltas.push(`金手指·${gainedNames.join("、")}`);
    }
    if (ch.systems_lost && ch.systems_lost.length) {
      const lostNames = [];
      ch.systems_lost.forEach(s => {
        const sName = (typeof s === "string") ? s : (s && (s.name || s.title));
        if (!sName) return;
        const idx = c.systems.indexOf(sName);
        if (idx !== -1) { c.systems.splice(idx, 1); lostNames.push(sName); }
      });
      if (lostNames.length) deltas.push(`系统消散·${lostNames.join("、")}`);
    }
    // 生活技能：熟练度累加 + 进阶之路（以技证道的基础）
    if (ch.life_skill_changes && Array.isArray(ch.life_skill_changes)) {
      if (!c.skills) c.skills = {};
      ch.life_skill_changes.forEach(s => {
        const nm = s && s.name;
        if (!nm) return;
        if (!c.skills[nm]) c.skills[nm] = { proficiency: 0, path: null };
        const inc = Math.max(-20, Math.min(20, Number(s.proficiency_change) || 0));
        const before = c.skills[nm].proficiency;
        c.skills[nm].proficiency = Math.max(0, Math.min(100, before + inc));
        if (s.path) c.skills[nm].path = s.path;
        const v = c.skills[nm].proficiency - before;
        if (v !== 0) deltas.push(`【${nm}】熟练度 ${v > 0 ? "+" : ""}${v}${c.skills[nm].path ? "（" + c.skills[nm].path + "）" : ""}`);
      });
    }
    // 灵宠：仅在 ≥ 第 3 程后才允许灵宠事件（首两程玩家啥也没干就获宠不合逻辑）
    // 灵宠应来自机缘/奇遇/秘境等特殊事件，非开局赠送
    const petTurnThreshold = 3;
    const currentTurn = this.state.meta.playTurn || 1;
    if (ch.pet_gained && currentTurn >= petTurnThreshold) {
      c.pet = {
        name: ch.pet_gained.name || "无名灵宠",
        type: ch.pet_gained.type || "灵兽",
        growth: typeof ch.pet_gained.growth === "number" ? ch.pet_gained.growth : 0,
        desc: ch.pet_gained.desc || "",
      };
      deltas.push(`获得灵宠「${c.pet.name}」`);
    }
    if (ch.pet_lost) {
      if (c.pet) {
        const name = c.pet.name;
        c.pet = null;
        deltas.push(`灵宠「${name}」离去`);
      }
    }
    if (ch.pet_updated && c.pet && currentTurn >= petTurnThreshold) {
      if (ch.pet_updated.name) c.pet.name = ch.pet_updated.name;
      if (ch.pet_updated.type) c.pet.type = ch.pet_updated.type;
      if (typeof ch.pet_updated.growth === "number") c.pet.growth = ch.pet_updated.growth;
      if (ch.pet_updated.desc !== undefined) c.pet.desc = ch.pet_updated.desc;
      deltas.push(`灵宠「${c.pet.name}」成长了`);
    }

    // 主线（中央冲突）：合并 AI 回传的推进/揭示/收束，持久化到 meta.mainPlot
    if (ch.main_plot && typeof ch.main_plot === "object") {
      const mp = (this.state.meta.mainPlot || (this.state.meta.mainPlot = { title: "", conflict: "", beats: [], resolved: false, revealedStage: 0, log: [] }));
      if (ch.main_plot.title) mp.title = ch.main_plot.title;
      if (ch.main_plot.conflict) mp.conflict = ch.main_plot.conflict;
      if (Array.isArray(ch.main_plot.beats) && ch.main_plot.beats.length) mp.beats = ch.main_plot.beats;
      if (typeof ch.main_plot.revealedStage === "number") mp.revealedStage = ch.main_plot.revealedStage;
      if (ch.main_plot.resolved === true) mp.resolved = true;
      const note = ch.main_plot.note ? String(ch.main_plot.note) : "";
      if (note) {
        if (!mp.log) mp.log = [];
        mp.log.push({ turn: this.state.meta.playTurn, note: note });
        deltas.push("主线·" + note);
      } else if (ch.main_plot.resolved === true) {
        deltas.push("主线收束·" + (mp.title || "中央冲突"));
      }
    }

    // 伏笔（暗线）：ledger 登记埋下 / 回收，持久化到 meta.threads
    if (!this.state.meta.threads) this.state.meta.threads = [];
    if (ch.threads_planted && Array.isArray(ch.threads_planted) && ch.threads_planted.length) {
      const planted = [];
      ch.threads_planted.forEach(t => {
        const hint = (typeof t === "string") ? t : (t && (t.hint || t.text));
        if (!hint || !String(hint).trim()) return;
        const h = String(hint).trim();
        if (this.state.meta.threads.some(x => x.hint === h)) return; // 同 hint 不重复（无论已埋或已收）
        const obj = { id: "T" + (this.state.meta.threads.length + 1) + "_" + this.state.meta.playTurn, hint: h, plantedTurn: this.state.meta.playTurn, status: "planted" };
        this.state.meta.threads.push(obj);
        planted.push(h);
      });
      if (planted.length) deltas.push("关键信息：" + planted.join("；"));
    }
    if (ch.threads_resolved && Array.isArray(ch.threads_resolved) && ch.threads_resolved.length) {
      const resolvedList = [];
      ch.threads_resolved.forEach(r => {
        const txt = (typeof r === "string") ? r : (r && (r.hint || r.text));
        if (!txt || !String(txt).trim()) return;
        const h = String(txt).trim();
        const cand = this.state.meta.threads.filter(x => x.status === "planted");
        let hit = cand.find(x => x.hint === h);
        if (!hit) hit = cand.find(x => x.hint.indexOf(h) >= 0 || h.indexOf(x.hint) >= 0);
        if (hit) {
          hit.status = "resolved";
          hit.resolvedTurn = this.state.meta.playTurn;
          resolvedList.push(hit.hint);
        } else {
          resolvedList.push(h); // 仍记录回收，防止遗漏
        }
      });
      if (resolvedList.length) deltas.push("线索闭合：" + resolvedList.join("；"));
    }

    // 飞升（苦修或以技证道）：记录成就，便于终章列传写"白日飞升"
    if (ch.event_flag === "ascension" || ch.event_flag === "craft_ascension") {
      this.state.meta.ascended = true;
      this.state.meta.alive = true;
      // 终章收束：主线合龙，未解伏笔尽数回响
      if (this.state.meta.mainPlot) this.state.meta.mainPlot.resolved = true;
      if (this.state.meta.threads) this.state.meta.threads.forEach(t => {
        if (t.status === "planted") { t.status = "resolved"; t.resolvedTurn = this.state.meta.playTurn; }
      });
    }

    this.save();
    return { flag: ch.event_flag || null, deltas };
  },

  // ============ 由选择生长规则：更新玩家风格画像 ============
  // 风格完全来自玩家实际行为，不来自性别/出身等身份标签
  updatePreferences(action, parsed, eventFlag) {
    if (!this.state.preferences) {
      this.state.preferences = { tags: { combat: 0, social: 0, cultivation: 0, exploration: 0, craft: 0, romance: 0, scheming: 0, mercy: 0 } };
    }
    const tags = this.state.preferences.tags;
    const text = (action || "") + " " + ((parsed && parsed.narrative) || "");

    const bump = (k, n = 1) => { tags[k] = (tags[k] || 0) + n; };

    // 1) 从玩家行动文本判定倾向
    if (/战|杀|斩|斗|攻|击|伐|败|敌|厮杀|灭/.test(action)) bump("combat");
    if (/谈|交|问|礼|说|谋|计|结|拜|商|求|请|游说|结交/.test(action)) bump("social");
    if (/修|练|打坐|闭关|吐纳|冥想|悟|参|静修/.test(action)) bump("cultivation");
    if (/探|寻|入|前往|进|搜|觅|游历|秘境|踪/.test(action)) bump("exploration");
    if (/炼|丹|器|阵|符|铸|织|制|鼎/.test(action)) bump("craft");
    if (/情|爱|缘|心|相思|聘|眷|侣/.test(action)) bump("romance");
    if (/骗|偷|诈|窃|算计|阴|诡|陷|诱|瞒/.test(action)) bump("scheming");
    if (/救|助|饶|医|护|施|慈|渡|放/.test(action)) bump("mercy");

    // 2) 从事件标记补充（避免纯叙事回合丢失信号）
    if (eventFlag === "breakthrough_success") bump("cultivation", 2);
    if (eventFlag === "fortuitous_encounter") bump("exploration", 2);
    if (eventFlag === "near_death" || eventFlag === "death") bump("combat", 2);
    if (eventFlag === "breakthrough_failed") bump("cultivation", 1);

    this.save();
  },

  // ============ 处理突破 ============
  handleBreakthrough() {
    const c = this.state.character;
    const RL = (typeof REALMS !== "undefined") ? REALMS : null;
    if (c.realmLevel >= (RL ? RL.length : 10)) { c.realmProgress = 0; return "max_realm"; }
    const nextRealm = RL[c.realmLevel]; // 即将冲击的境界（其 level = realmLevel+1）
    // 形态专属境界名：鬼修→游魂期/厉鬼期…，妖兽→一阶妖兽…，而非一律"炼气/筑基"
    const fr = (typeof FORMS !== "undefined" && FORMS[c.form] && FORMS[c.form].realms) ? FORMS[c.form].realms : null;
    const nextName = (nextRealm && fr && fr[nextRealm.level - 1]) ? fr[nextRealm.level - 1] : (nextRealm ? nextRealm.name : "未知");
    // 基础成功率随境界递减（新手易、老手难）；悟性越高越易；灵力越浓本界越易进境
    const BT_BASE = (typeof BREAKTHROUGH_BASE !== "undefined") ? BREAKTHROUGH_BASE : null;
    const base = (BT_BASE && BT_BASE[nextRealm.level] != null) ? BT_BASE[nextRealm.level] : 0.5;
    const compMod = (c.comprehension - 6) * 0.02;
    const spiritMod = (((this.state.world && this.state.world.spirit) || 5) - 5) * 0.015;
    // 因果反哺突破：因果力助成、因果债碍道
    const causeMod = Math.min(0.10, (c.causeCredit || 0) * 0.0008) - Math.min(0.15, (c.causeDebt || 0) * 0.002);
    const successRate = Math.max(0.03, Math.min(0.96, base + compMod + spiritMod + causeMod));
    const success = Math.random() < successRate;

    if (success) {
      this._advanceRealm(c.realmLevel + 1, nextName);
      return "breakthrough_success";
    } else {
      c.realmProgress = 60; // 回退一些进度
      c.hp = Math.floor(c.hp * 0.5); // 突破失败重伤
      this.state.meta.breakthroughTurn = this.state.meta.playTurn || 1;
      this.save();
      return "breakthrough_failed";
    }
  },

  // 统一的境界跃迁处理：突破成功 与 AI 主动 realm_level_change 都走这里，保证属性成长一致（maxQi/气血/寿元/境界名）
  _advanceRealm(newLevel, forcedName) {
    const c = this.state.character;
    const RL = (typeof REALMS !== "undefined") ? REALMS : null;
    const cap = RL ? RL.length : 10;
    const L = Math.max(1, Math.min(cap, newLevel));
    const fr = (typeof FORMS !== "undefined" && FORMS[c.form] && FORMS[c.form].realms) ? FORMS[c.form].realms : null;
    const nextName = forcedName || ((RL && fr && fr[L - 1]) ? fr[L - 1] : (RL ? RL[Math.max(0, L - 1)].name : "未知"));
    c.realmLevel = L;
    c.realm = nextName;
    c.realmProgress = 0;
    if (RL) {
      const nr = RL[L - 1];
      c.maxQi = nr.maxQi; c.qi = nr.maxQi;
      c.maxLifespan = Math.floor(c.maxLifespan * 1.5); c.lifespan = c.maxLifespan;
      c.maxHp = Math.floor(c.maxHp * 1.3); c.hp = c.maxHp;
    }
    this.state.meta.breakthroughTurn = this.state.meta.playTurn || 1;
    this.state.meta.realmMilestoneTurn = this.state.meta.playTurn || 1;
    this.save();
  },

  // ============ 处理死亡 ============
  handleDeath(reason) {
    this.state.meta.alive = false;
    this.save();
  },

  // ============ 原地去世，转世投胎 ============
  reincarnate() {
    localStorage.removeItem("xianxia_save");
    this.state = null;
    this.history = [];
    this.log = [];
    this.isProcessing = false;
    UI.show("create");
  },

  // ============ 推进时间 ============
  advanceTime() {
    const w = this.state.world;
    const idx = TIMES_OF_DAY.indexOf(w.timeOfDay);
    const next = (idx + 1) % TIMES_OF_DAY.length;
    w.timeOfDay = TIMES_OF_DAY[next];
    if (next === 0) {
      w.day++;
      // 每天消耗1点寿元
      this.state.character.lifespan = Math.max(0, this.state.character.lifespan - 1);
      // 随机天气变化
      if (Math.random() < 0.3) {
        w.weatherIndex = Math.floor(Math.random() * WEATHERS.length);
        w.weather = WEATHERS[w.weatherIndex];
      }
    }
  },

  // ============ 处理玩家行动 ============
  async processAction(action, isOpening = false) {
    if (this.isProcessing || !this.state.meta.alive) return;
    this.isProcessing = true;

    // 保存本回合快照（用于刷新重试：内容卡住时可输入「刷新」重新生成）
    this.lastSnapshot = {
      state: JSON.parse(JSON.stringify(this.state)),
      history: JSON.parse(JSON.stringify(this.history)),
      log: JSON.parse(JSON.stringify(this.log)),
      action: action,
      isOpening: isOpening
    };

    // 记录用户消息（先入历史以便 API 调用）
    this.history.push({ role: "user", content: action });
    // 保留最近12轮上下文控制成本（保证偶数条，维持 user/assistant 配对）
    const MAX_ENTRIES = 24; // 12对
    if (this.history.length > MAX_ENTRIES) {
      const start = this.history.length - MAX_ENTRIES;
      this.history = this.history.slice(start % 2 === 0 ? start : start + 1);
    }

    // 保存回滚点：API 失败时撤消本回合的状态变更
    const rollbackTurn = this.state.meta.playTurn;
    this.state.meta.playTurn++;

    try {
      // 游客离线模式：跳过真实 API，走本地脚本化剧情，零摩擦试玩（不写存档/神魂册）
      if (this._guestMode) {
        const node = GuestMode_next(action);
        const parsed = node;
        const { flag: eventFlag, deltas } = this.applyChanges(parsed.state_changes || {});
        if (!isOpening) this.log.push({ role: "user", text: action });
        this.log.push({ role: "assistant", text: parsed.narrative, options: parsed.options, optionRisks: parsed.optionRisks || [], flag: eventFlag, deltas });
        this.advanceTime();
        return { parsed, eventFlag, deltas };
      }

      let fullText = "";
      // 新手记忆点脚本：按程数窗口注入轻量引导（仅在对应回合触发一次）
      this._maybeInjectMemoryPoint();
      const result = await AIService.stream(
        this.history,
        this.state,
        (delta, full) => { fullText = full; UI.onStreamChunk(delta, full); }
      );

      const parsed = AIService.parseResponse(result);
      // ===== 确定性战斗结算：本回合若触发战斗，由引擎接管 hp/灵石/突破进度，覆盖 AI 随意值 =====
      let combatFlag = null;
      const combatDeltas = [];
      const _enemy = UI.resolveEnemy(parsed);
      if (_enemy) {
        Game._combatEnemy = _enemy;
        // 战场数值交予引擎，避免 AI 在 state_changes 里乱写 hp/灵石/进境
        delete parsed.state_changes.hp;
        delete parsed.state_changes.spiritual_stones;
        delete parsed.state_changes.spiritualStones;
        delete parsed.state_changes.realm_progress;
        const _cr = this.resolveCombat(_enemy, Math.random);
        this.state.meta.lastCombat = {
          win: _cr.win, winProb: +_cr.winProb.toFixed(2),
          playerPower: _cr.playerPower, enemyPower: _cr.enemyPower,
          name: _enemy.name, type: _enemy.type,
        };
        const _ca = this.applyCombatResult(_cr);
        combatFlag = _ca.flag;
        if (_ca.deltas.length) combatDeltas.push(..._ca.deltas);
      } else {
        Game._combatEnemy = null;
      }
      // 内测用户使用计数
      const betaIdx = localStorage.getItem('beta_user_index');
      if (betaIdx) BetaCode.incrementUsage(parseInt(betaIdx));
      const _applied = this.applyChanges(parsed.state_changes);
      let eventFlag = _applied.flag;
      const deltas = _applied.deltas;
      // 合并战斗结算结果（战场数值已由引擎落地，此处并入展示）
      if (combatDeltas.length) deltas.push(...combatDeltas);
      if (combatFlag === "death" || (combatFlag && !eventFlag)) eventFlag = combatFlag;
      // 上一程的强制事件（如因果反噬）已被本次 AI 调用消费，清除标记
      this.state.meta.pendingEvent = null;

      // 节奏控制器：累计近回合"平淡/高张"连续数，供 buildPacingBlock 强制张弛
      const _isPeak = ['breakthrough_success','breakthrough_failed','romance_union','fortuitous_encounter','death','near_death','ascension','craft_ascension'].includes(eventFlag)
        || (parsed.state_changes && parsed.state_changes.combat_encounter);
      if (!this.state.meta.pacing) this.state.meta.pacing = { calmStreak: 0, peakStreak: 0 };
      if (_isPeak) { this.state.meta.pacing.peakStreak++; this.state.meta.pacing.calmStreak = 0; }
      else { this.state.meta.pacing.calmStreak++; this.state.meta.pacing.peakStreak = 0; }

      // 由本次选择更新玩家风格画像（规则随行为生长）
      this.updatePreferences(action, parsed, eventFlag);

      // 写入仙途记忆（控制长度，用于保持剧情连贯）
      this.state.memory = this.state.memory || [];
      if (parsed.memory && parsed.memory.trim()) {
        this.state.memory.push(parsed.memory.trim());
        if (this.state.memory.length > 20) this.state.memory.shift();
      }

      // 记录AI回复（只存narrative部分，节省token）
      this.history.push({ role: "assistant", content: JSON.stringify({
        narrative: parsed.narrative,
        options: parsed.options
      }) });

      // 写入展示日志（不截断，用于重开还原与回看）
      if (!isOpening) {
        this.log.push({ role: "user", text: action });
      }
      this.log.push({ role: "assistant", text: parsed.narrative, options: parsed.options, optionRisks: parsed.optionRisks || [], flag: eventFlag, deltas });

      this.advanceTime();
      this.save();

      // 诸天万界·神魔大战余波：可能引发世界毁灭（元循环）
      const crisis = this.checkWorldCrisis();
      if (crisis && crisis.destroyed) {
        this.destroyWorld(crisis.cause);
      }

      // 因果债过重招灾：旧债索偿，化作强制反噬事件
      const backlash = this.checkCauseBacklash();
      if (backlash && backlash.triggered) {
        const died = this.applyBacklash(backlash);
        if (died) return { parsed, eventFlag: "death", deltas };
      }

      return { parsed, eventFlag, deltas };
    } catch (e) {
      // 回滚：撤消已被推入的用户消息和 playTurn 递增
      if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
        this.history.pop();
      }
      this.state.meta.playTurn = rollbackTurn;
      this.save();
      console.error("[processAction]", e);
      throw e;
    } finally {
      this.isProcessing = false;
    }
  },

  // ============ 存档 ============
  save() {
    if (!this.state) return;
    localStorage.setItem("xianxia_save", JSON.stringify({
      state: this.state,
      history: this.history,
      log: this.log,
    }));
    this._upsertSoul();
  },

  load() {
    const raw = localStorage.getItem("xianxia_save");
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      this.state = data.state;
      this.history = data.history || [];
      this.log = data.log || [];
      // 旧存档兼容：早期版本未存 genderName，按 gender.id 反查补全
      const ch = this.state && this.state.character;
      if (ch && !ch.genderName && ch.gender) {
        const g = GENDERS.find(x => x.id === ch.gender);
        ch.genderName = g ? g.name : ch.gender;
      }
      // 旧存档兼容：补全新增的正义/邪恶与 NPC 好感表
      if (ch) {
        if (typeof ch.justice !== "number") ch.justice = 0;
        if (typeof ch.evil !== "number") ch.evil = 0;
      }
      if (!this.state.npcs) this.state.npcs = {};
      if (!this.state.narrationMode) this.state.narrationMode = "standard";
      // 旧档兼容：补全诸天万界新增字段
      if (!this.state.world) this.state.world = { seed: "", location: "", gen: null };
      if (typeof this.state.world.realmCapLevel !== "number") this.state.world.realmCapLevel = (typeof REALMS !== "undefined" && REALMS.length) ? REALMS.length : 9;
      if (typeof this.state.world.spirit !== "number") this.state.world.spirit = 6;
      if (!this.state.character.form) this.state.character.form = "human";
      if (!this.state.character.formName) {
        const _f0 = (typeof FORMS !== "undefined" && FORMS[this.state.character.form]) ? FORMS[this.state.character.form] : FORMS.human;
        this.state.character.formName = _f0 ? _f0.name : "人族";
      }
      if (!this.state.character.cultivationSystem) this.state.character.cultivationSystem = "灵根";
      if (!this.state.world.cultivationSystemName) this.state.world.cultivationSystemName = this.state.character.cultivationSystem || "灵根";
      if (!this.state.meta) this.state.meta = { playTurn: 0, alive: true };
      if (!this.state.meta.projectionId) this.state.meta.projectionId = ((this.state.world.gen && this.state.world.gen.id) || "p") + "-" + Date.now();
      if (this.state.character.causeCredit == null) this.state.character.causeCredit = 0;
      if (this.state.character.causeDebt == null) this.state.character.causeDebt = 0;
      // 旧档兼容：补全主线（中央冲突）与伏笔 ledger
      if (this.state.meta.mainPlot === undefined) this.state.meta.mainPlot = null;
      if (!this.state.meta.threads) this.state.meta.threads = [];
      // 旧档兼容：给已有 NPC 补 met 标记。预填且好感仍为 0 的视为"未谋面"隐藏；真正结识过（好感被改动过）的保留
      Object.keys(this.state.npcs).forEach(name => {
        const n = this.state.npcs[name];
        if (n.met === undefined) n.met = (typeof n.affinity === "number" && n.affinity !== 0);
      });
      return this.state;
    } catch (e) {
      return null;
    }
  },

  // ============ 神魂册（诸天万界·投影轮回）============
  // 本地注册表：记录所有投影（当前 + 已陨落世界），构成玩家跨世界的"神魂履历"
  _soulKey: "xianxia_soul",
  _worldDestroyedCause: null,
  _worldDestroyedOldName: null,
  _ensureSoulRegistry() {
    try {
      const raw = localStorage.getItem(this._soulKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  },
  _upsertSoul() {
    if (!this.state || !this.state.meta) return;
    const s = this.state;
    const reg = this._ensureSoulRegistry();
    const entry = {
      projectionId: s.meta.projectionId,
      worldName: (s.world.gen && s.world.gen.name) || "未知界",
      seed: s.world.seed,
      spirit: s.world.spirit,
      realmCapLevel: s.world.realmCapLevel,
      wish: s.world.wish || null,
      realmReached: s.character.realmLevel,
      realmName: s.character.realm,
      form: s.character.form,
      genderName: s.character.genderName,
      causeCredit: s.character.causeCredit || 0,
      status: "active",
      turn: s.meta.playTurn,
      createdAt: s.meta.createdAt || Date.now(),
      endedAt: null,
      updatedAt: Date.now(),
      // 跨投影里程碑成就（神魂册勋章，纯荣誉、不卖无敌）
      achievements: (() => {
        const RL = (typeof REALMS !== "undefined") ? REALMS.length : 10;
        const L = s.character.realmLevel || 1;
        const T = s.meta.playTurn || 0;
        const C = s.character.causeCredit || 0;
        const a = [];
        if (L >= 2) a.push("仙途初成");
        if (T >= 100) a.push("百程不辍");
        if (C >= 1000) a.push("千因积善");
        if (L >= RL) a.push("白日飞升");
        return a;
      })(),
    };
    const idx = reg.findIndex((e) => e.projectionId === entry.projectionId);
    if (idx >= 0) reg[idx] = entry; else reg.push(entry);
    try { localStorage.setItem(this._soulKey, JSON.stringify(reg)); } catch (e) {}
  },
  _archiveFallen(projectionId, cause, realmReached) {
    const reg = this._ensureSoulRegistry();
    const e = reg.find((x) => x.projectionId === projectionId);
    if (e) { e.status = "fallen"; e.cause = cause; e.realmReached = realmReached; e.fallenAt = Date.now(); e.endedAt = Date.now(); }
    else { reg.push({ projectionId: projectionId, status: "fallen", cause: cause, realmReached: realmReached, fallenAt: Date.now() }); }
    try { localStorage.setItem(this._soulKey, JSON.stringify(reg)); } catch (err) {}
  },
  // 从许愿文本解析"魂穿形态"（本体种族/物种）。顺序很重要：先草木/花，避免被"妖"误吞
  parseForm(wish) {
    if (!wish || !wish.trim) return "human";
    const w = wish;
    if (/树|木|灵植|妖植|草木|藤|竹|松|柳|槐|榕|菩提|兰|枫/.test(w)) return "tree";
    if (/花|花灵|花妖|花魅|莲/.test(w)) return "flower";
    if (/石|岩|山石|顽石|灵岩|玉髓/.test(w)) return "stone";
    if (/器灵|剑灵|法宝|鼎灵|古钟|钟灵|器魂|器/.test(w)) return "artifact";
    if (/鬼|魂|幽|阴灵|亡灵|鬼修|厉鬼/.test(w)) return "ghost";
    if (/火灵|水灵|风灵|雷灵|冰灵|光灵|元素灵|元素精灵|火之灵|水之灵|火精灵|水精灵|自然之灵|元素之体/.test(w)) return "elemental";
    if (/妖|兽|狼|虎|蛇|狐|龙|鹏|豹|熊|鹰|蛟|麒麟|妖兽|妖修|猫咪|猫/.test(w)) return "beast";
    return "human";
  },
  // 开启一道新投影（神魂再投诸天万界）
  // opts.reincarnation：{ oldWorld, realmReached, cause, inheritCredit } —— 由 destroyWorld 传入，供首回合"重生叙事"使用
  newProjection(opts) {
    opts = opts || {};
    opts.projectionId = opts.projectionId || (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36));
    this.createCharacter(opts);
    if (opts.reincarnation) this.state.meta.reincarnation = opts.reincarnation;
    this._guestMode = !!opts.guest;
    this._guestStep = 0;
    return this.state;
  },
  // 世界被神魔大战波及而湮灭：旧界归入神魂册·已陨落，重投新界
  destroyWorld(cause) {
    const s = this.state;
    if (!s) return null;
    const pid = (s.meta && s.meta.projectionId) || null;
    const oldName = (s.world.gen && s.world.gen.name) || "此界";
    const realmReached = (s.character && s.character.realmLevel) || 1;
    const credit = (s.character && s.character.causeCredit) || 0;
    const inheritCredit = Math.floor(credit * 0.3);
    this._archiveFallen(pid, cause, realmReached);
    this.newProjection({
      inheritCredit: inheritCredit,
      reincarnation: {
        oldWorld: oldName,
        realmReached: realmReached,
        cause: cause,
        inheritCredit: inheritCredit,
      },
    });
    this._worldDestroyedCause = cause;
    this._worldDestroyedOldName = oldName;
    this._inheritedCredit = inheritCredit;
    return this.state;
  },
  consumeWorldDestroyed() {
    const c = this._worldDestroyedCause;
    this._worldDestroyedCause = null;
    this._worldDestroyedOldName = null;
    return c || null;
  },
  // 诸天万界·神魔大战余波：可能引发世界毁灭（元循环）。实力未足本界巅峰则界毁，投影重投。
  checkWorldCrisis() {
    const s = this.state;
    if (!s || !s.meta.alive) return null;
    const turn = s.meta.playTurn;
    if (turn < 12) return null;
    const cap = (s.world.realmCapLevel) || 9;
    const lvl = s.character.realmLevel || 1;
    const chance = 0.022 + (turn - 12) * 0.0014;
    if (Math.random() > chance) return null;
    if (lvl < cap) {
      return { destroyed: true, cause: "神魔大战之余波横跨诸天，灵脉寸断，山河倾覆——此界自此湮灭于轮回。" };
    }
    return { destroyed: false, cause: "神魔大战之余波掠过此界，你以万界神魔之姿镇守，山河无恙。" };
  },

  // 诸天万界·因果债过重招灾：因果债积逾阈值，按超出幅度概率触发反噬/仇家事件
  checkCauseBacklash() {
    const s = this.state;
    if (!s || !s.meta.alive) return null;
    const c = s.character;
    const debt = c.causeDebt || 0;
    const THRESHOLD = 40;
    if (debt < THRESHOLD) return null;
    const turn = s.meta.playTurn;
    const last = (s.meta.lastBacklashTurn != null) ? s.meta.lastBacklashTurn : -99;
    if (turn - last < 3) return null; // 冷却，避免连续刷屏
    const over = debt - THRESHOLD;
    const chance = Math.min(0.4, 0.05 + over * 0.015);
    if (Math.random() > chance) return null;
    const types = ["仇家寻仇", "因果反噬", "血光之灾", "旧誓反噬", "背信反噬"];
    const type = types[debt % types.length];
    const hpLoss = Math.min(40, 8 + Math.floor(over / 3));
    const stoneLoss = Math.min(2000, Math.floor(over * 15));
    s.meta.lastBacklashTurn = turn;
    return { triggered: true, type, hpLoss, stoneLoss, debt };
  },
  applyBacklash(b) {
    const c = this.state.character;
    c.hp = Math.max(0, c.hp - b.hpLoss);
    let died = false;
    if (c.hp <= 0) { died = true; this.handleDeath("因果债索偿，旧怨缠身，气血耗尽而殒"); }
    c.spiritualStones = Math.max(0, c.spiritualStones - b.stoneLoss);
    const text = `⚡ 因果反噬·${b.type}：旧债索偿，气血-${b.hpLoss}${b.stoneLoss ? "，灵石-" + b.stoneLoss : ""}。此劫非战之过，乃往昔所欠之因果临头。`;
    this.state.meta.pendingEvent = { kind: "cause_backlash", type: b.type, hpLoss: b.hpLoss, stoneLoss: b.stoneLoss, text };
    this.state.memory = this.state.memory || [];
    this.state.memory.push(text);
    this.log.push({ role: "assistant", text, flag: "cause_backlash", deltas: ["气血 -" + b.hpLoss] });
    const storyEl = (typeof document !== "undefined") ? document.getElementById("story-text") : null;
    if (storyEl) {
      const d = document.createElement("div");
      d.className = "cause-backlash";
      d.textContent = text;
      storyEl.appendChild(d);
      storyEl.scrollTop = storyEl.scrollHeight;
    }
    this.save();
    return died;
  },
  // 神魂册本地榜：因果力榜 + 修道时长榜（跨玩家榜的本地占位，待 Path B 服务端）
  getSoulRankings() {
    const reg = (this._ensureSoulRegistry ? this._ensureSoulRegistry() : []);
    const now = Date.now();
    const enriched = reg.map(e => {
      const created = e.createdAt || e.updatedAt || 0;
      const ended = e.endedAt || (e.status === "active" ? (e.updatedAt || now) : now);
      const durMs = Math.max(0, ended - created);
      const days = Math.floor(durMs / 86400000);
      const hours = Math.floor(durMs / 3600000);
      return Object.assign({}, e, { durationHours: hours, durLabel: days > 0 ? days + " 日" : (hours > 0 ? hours + " 时" : "片刻") });
    });
    const byCause = enriched.slice().sort((a, b) => (b.causeCredit || 0) - (a.causeCredit || 0));
    const byDuration = enriched.slice().sort((a, b) => (b.durationHours || 0) - (a.durationHours || 0));
    return { byCause, byDuration };
  },

  hasSave() {
    return !!localStorage.getItem("xianxia_save");
  },

  deleteSave() {
    localStorage.removeItem("xianxia_save");
    this.state = null;
    this.history = [];
    this.log = [];
  },

  // ============ 开局引导剧情 ============
  getOpeningPrompt(state) {
    const c = state.character;
    const w = state.world;
    const gen = w.gen || {};
    let intro = `我是「${c.name}」，本相为${c.formName || "人族"}（${c.root}之道），出身「${c.background}」，目前境界${c.realm}。`;
    if (c.gender === "bag") {
      const g = GENDERS.find(x => x.id === "bag");
      if (g && g.premise) intro += `\n${g.premise}\n`;
    } else {
      intro += `\n我以${c.genderName}之身入世修行。`;
    }
    intro += `此界名为「${gen.name || "无名之界"}」${gen.omen ? "，" + gen.omen : ""}`;
    const mp = state.meta && state.meta.mainPlot;
    if (mp && mp.title) {
      intro += `\n我仙途自一段未解的因缘/危机起：${mp.conflict}（此乃贯穿全程的中央冲突，请于开场自然引出其第一缕伏笔，但不必一次说尽，留作长线）。`;
    }
    intro += `此刻我在${w.location}，时值${w.timeOfDay}，天气${w.weather.name}。\n请为我开启修仙之路。\n\n【开局钩子 · 务必遵循】这是玩家第一眼看到的画面，决定他是否继续。开局场景须包含：① 2-3 句具体感官描写（风声/气味/光影/触感）把玩家拉入现场，禁止"晨曦初露，雾气弥漫"这类空泛开头；② 一个不可忽略的张力钩子——一缕异常灵气、一声突兀的动静、一件不该在此的物件、一个举止反常的人——让玩家产生"这是怎么回事"的好奇；③ 钩子须与中央冲突（${mp && mp.title ? mp.conflict : "仙途危机"}）隐约相关，但不要一次点破，留作悬疑。④ 开局须与炼气期量级相称：场景在身边一隅（市井、后山、客栈、宗门外围），对手为寻常人或低阶妖兽，机缘为小机缘；可用远方异象/传闻埋长线，但勿让玩家开场就卷入远超境界的大局面。完毕，给我 3-4 个具体行动选项（至少含 1 个 [凶险] 或 [致命] 选项，风险标签仅内部、绝不展示）。`;
    return intro;
  },

  // ============ 整理生平日志（用于生成传记） ============
  getBiographyLogText() {
    const lines = [];
    this.log.forEach((e, i) => {
      if (e.role === 'user') {
        lines.push(`第${i + 1}步（修士所为）：${e.text}`);
      } else {
        let t = e.text || '';
        if (t.length > 360) t = t.slice(0, 360) + '…';
        lines.push(`第${i + 1}步（天地叙事）：${t}`);
        if (e.deltas && e.deltas.length) lines.push('  变化：' + e.deltas.join('，'));
        if (e.flag) lines.push('  事件：' + e.flag);
      }
    });
    return lines.join('\n');
  },

  // ============ 保存传记 ============
  saveBiography(text) {
    if (this.state) {
      this.state.biography = text;
      this.save();
    }
  },

  // ============ 降级传记（AI 不可用时） ============
  buildFallbackBiography() {
    const c = this.state.character;
    const w = this.state.world;
    const turns = this.log.filter(e => e.role === 'user').length;
    const flags = this.log.map(e => e.flag).filter(Boolean);
    const hasDeath = !this.state.meta.alive;
    const hasBreak = flags.includes('breakthrough_success');
    const hasLuck = flags.includes('fortuitous_encounter');

    let body = `${c.name}者，${c.genderName}${c.gender === "bag" ? "之身" : "修士"}也，本出${c.background}。初踏仙途，于${w.location}发轫，时人未之奇也。\n\n`;
    const mp = this.state.meta && this.state.meta.mainPlot;
    if (mp && mp.title) {
      body += `其仙途有一条贯穿始终的中央冲突——${mp.title}：${mp.conflict}${mp.resolved ? "，终在飞升之刻了断，因果圆满。" : "，虽历千劫而未竟全功。"}\n\n`;
    }
    body += `数载之间，历经${turns}事。`;
    if (hasBreak) body += `曾破境而登${c.realm}，道行骤进；`;
    if (hasLuck) body += `亦逢天降机缘，得异宝神通；`;
    if (hasDeath) body += `然修行多舛，终殒于道途，魂归天地。`;
    else body += `今止步${c.realm}，寿元尚余${c.lifespan}载，仙途漫漫，未竟之志犹存。`;
    body += `\n\n`;
    if (c.inventory.length) body += `平生所蓄：${c.inventory.map(i => i.name).join('、')}。`;
    if (c.techniques.length) body += `所修功法：${c.techniques.join('、')}。`;
    body += `\n\n后世评曰：${hasDeath ? '一抔黄土，掩不尽修士痴心。' : '来日方长，且看他日能否问鼎长生。'}`;
    return body;
  },

  // ===== 确定性战斗结算引擎（纯逻辑，置于 Game，供 processAction 调用）=====
  // 玩家战力由境界/灵力/功法/悟性/金手指真实派生，使"功法、修炼、金手指"不再只是收藏品，
  // 敌人战力由类型+个体强度+世界灵气派生。胜负、伤害、掉落全部由本引擎算定，不再任由 AI 随口编造——
  // 落实"真实生死"与"抉择有重量"：选错强敌=送死，练得越强越能打。
  resolveCombat(enemy, rng) {
    rng = rng || Math.random;
    const c = this.state.character || {};
    const w = this.state.world || {};
    const realmLevel = c.realmLevel || 1;
    const qiRatio = c.maxQi ? (c.qi || 0) / c.maxQi : 0.5;
    const techCount = Math.min(5, (c.techniques || []).length);
    const sysCount = Math.min(3, (c.systems || []).length);
    const compBonus = Math.max(0, (c.comprehension || 6) - 6) * 1.5;
    const playerPower = 12 + realmLevel * 14 + qiRatio * 12 + techCount * 6 + compBonus + sysCount * 5;

    const typeBase = { beast: 8, xiexiu: 24, ghost: 30 }[(enemy && enemy.type)] || 12;
    const slug = (enemy && (enemy.slug || enemy.name)) || "x";
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    const indiMul = 0.8 + (h % 1000) / 1000 * 0.7; // 0.8~1.5 个体强度稳定
    const spirit = (w.spirit || 6);
    // 敌人强度由类型+个体+世界灵气决定，不随玩家境界无脑加成（低级妖兽永远弱，高阶修士可碾压；
    // 真正的挑战来自高阶敌人类型 xiexiu/ghost 与剧情强敌），避免"关卡缩放"抹平强弱对比。
    const enemyPower = typeBase * indiMul * (0.85 + spirit * 0.03);

    const ratio = playerPower / (playerPower + enemyPower);
    const winProb = Math.max(0.06, Math.min(0.94, 0.12 + ratio * 0.86));
    const win = rng() < winProb;

    const maxHp = c.maxHp || 100;
    let hpLoss;
    if (win) {
      hpLoss = Math.round(maxHp * (0.04 + 0.10 * (1 - ratio)) + rng() * maxHp * 0.03);
    } else {
      hpLoss = Math.round(maxHp * (0.28 + 0.40 * (1 - ratio)) + rng() * maxHp * 0.05);
    }
    hpLoss = Math.max(1, hpLoss);

    let stoneGain = 0, progGain = 0, items = [];
    if (win) {
      stoneGain = Math.round(enemyPower * (2 + rng() * 2));
      progGain = Math.round(3 + ratio * 5);
      const dropPool = { beast: "妖丹", xiexiu: "魔核", ghost: "阴魂珠" };
      if (rng() < 0.16 && dropPool[enemy && enemy.type]) items.push(dropPool[enemy.type]);
    }
    return {
      win, winProb,
      playerPower: Math.round(playerPower),
      enemyPower: Math.round(enemyPower),
      hpLoss, stoneGain, progGain, items,
    };
  },

  // 将战斗结算结果落地到角色（不经过通用 hp ±40 钳制，支持重伤致死），返回 deltas/flag 供主流程合并
  applyCombatResult(result) {
    const c = this.state.character;
    const deltas = [];
    c.hp = Math.max(0, (c.hp || 0) - result.hpLoss);
    deltas.push(`气血 -${result.hpLoss}`);
    if (result.win) deltas.push("斗法获胜");
    else deltas.push("斗法落败");
    if (result.stoneGain) {
      c.spiritualStones = (c.spiritualStones || 0) + result.stoneGain;
      deltas.push(`灵石 +${result.stoneGain}`);
    }
    if (result.items && result.items.length) {
      result.items.forEach(n => c.inventory.push({ name: n, type: "物品", desc: "", grade: "" }));
      deltas.push(`获得 ${result.items.join("、")}`);
    }
    if (result.progGain) {
      const before = c.realmProgress || 0;
      c.realmProgress = Math.min(100, before + result.progGain);
      const v = c.realmProgress - before;
      if (v) deltas.push(`突破进度 +${v}`);
      if (c.realmProgress >= 100) {
        const bf = this.handleBreakthrough();
        if (bf === "max_realm") deltas.push("已臻至境，更进无门");
        else deltas.push(bf === "breakthrough_success" ? "突破成功！境界提升" : "突破失败，反噬重伤");
      }
    }
    let flag = null;
    if (c.hp <= 0) {
      const ename = (this.state.meta && this.state.meta.lastCombat && this.state.meta.lastCombat.name) || "强敌";
      this.handleDeath(`战死于${ename}之手，魂归天地`);
      flag = "death";
    }
    return { flag, deltas };
  },

  // ============ 终章回望（即时、不依赖 AI，死亡/飞升当场呈现） ============
  buildEndingRecap(kind) {
    const c = this.state.character;
    const turns = this.log.filter(e => e.role === 'user').length;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const realmName = esc(c.realm);
    const causeNet = (c.causeCredit || 0) - (c.causeDebt || 0);
    const causeTxt = causeNet > 0 ? `积善 ${c.causeCredit || 0}` : (causeNet < 0 ? `欠因果 ${Math.abs(c.causeDebt || 0)}` : `恩怨平平`);
    const isAsc = kind === 'ascension';
    const title = isAsc ? '仙途功成 · 白日飞升' : '仙途终章 · 此生回望';
    const sub = isAsc
      ? `历 ${turns} 程修行，终破樊笼，白日飞升，天地共贺。`
      : `历 ${turns} 程修行，道途止步${realmName}，魂归天地。`;
    return `
      <div class="ending-recap">
        <div class="er-title">${title}</div>
        <div class="er-sub">${sub}</div>
        <div class="er-grid">
          <div><span>道号</span><b>${esc(c.name)}</b></div>
          <div><span>终焉境界</span><b>${realmName}</b></div>
          <div><span>寿元</span><b>${c.lifespan}/${c.maxLifespan} 载</b></div>
          <div><span>灵石</span><b>${c.spiritualStones}</b></div>
          <div><span>声望</span><b>${c.reputation}</b></div>
          <div><span>因果</span><b>${causeTxt}</b></div>
        </div>
        <div class="er-note">${isAsc ? '自此可自由续写仙界新篇，或重入轮回另启一生。' : '仙途如寄，来世若有机缘，再续前缘。'}</div>
      </div>`;
  },
};

// ============================================================
//  内测号管理
// ============================================================
const BetaCode = {
  // UTF-8 安全 base64 编解码（替代废弃的 unescape/escape）
  _toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const bin = Array.from(bytes, b => String.fromCodePoint(b)).join("");
    return btoa(bin);
  },
  _fromBase64(b64) {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.codePointAt(0));
    return new TextDecoder().decode(bytes);
  },

  // 生成5个内测号（编码API配置）
  generate(apiKey, baseURL, model) {
    const codes = [];
    for (let i = 1; i <= 5; i++) {
      const payload = [apiKey, baseURL, model, i].join('|');
      const encoded = this._toBase64(payload);
      const urlSafe = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      codes.push({ code: 'FS-' + urlSafe, index: i });
    }
    return codes;
  },

  // 验证并解码内测号
  // 兼容两种格式：
  //   旧：nonce|apiKey|baseURL|model|index  （5段，带随机前缀，外观各不相同）
  //   新：apiKey|baseURL|model|index        （4段，早期生成）
  validate(code) {
    let text = (code || '').trim();
    if (!text.startsWith('FS-')) return null;
    let encoded = text.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4) encoded += '=';
    try {
      // 优先用新编码器解码；若失败则回退到旧 escape/unescape 兼容旧内测号
      let decoded;
      try {
        decoded = this._fromBase64(encoded);
      } catch (e1) {
        try {
          decoded = decodeURIComponent(escape(atob(encoded)));
        } catch (e2) {
          return null;
        }
      }
      const parts = decoded.split('|');
      let apiKey, baseURL, model, index;
      if (parts.length === 5) {
        apiKey = parts[1]; baseURL = parts[2]; model = parts[3]; index = parseInt(parts[4]);
      } else if (parts.length === 4) {
        apiKey = parts[0]; baseURL = parts[1]; model = parts[2]; index = parseInt(parts[3]);
      } else {
        return null;
      }
      // DeepSeek 旧模型名（deepseek-chat / deepseek-reasoner）已于 2026-07-24 停用，自动迁移到 V4
      if (model === "deepseek-chat" || model === "deepseek-reasoner") model = "deepseek-v4-flash";
      return { apiKey, baseURL, model, index };
    } catch (e) {
      return null;
    }
  },

  getUsage(index) {
    return parseInt(localStorage.getItem('beta_usage_' + index) || '0');
  },

  incrementUsage(index) {
    localStorage.setItem('beta_usage_' + index, this.getUsage(index) + 1);
  },

  getMaxUses() { return 500; },

  isBetaUser() {
    return !!localStorage.getItem('beta_user_index');
  },
};

// ============================================================
//  Token 预算守护（计量 + 护栏）
//  按真实 API 回包 usage 累计 token 与花费，达上限即拦截新剧情。
//  注意：localStorage 是「本机/本浏览器」维度，多设备各自独立计数；
//        共享同一 API Key 时，真正的总额护栏请在 DeepSeek 后台为 Key 设硬上限。
// ============================================================
const TokenBudget = {
  LS_TRACKER: "fs_cost_tracker",
  LS_CONFIG: "fs_budget_config",

  // 默认配置（单价按 deepseek-v4-flash 估算；运营可在设置页调整）
  _defaultConfig() {
    return {
      enabled: true,
      limit: 30,            // 本机预算上限（¥）
      currency: "¥",
      // 各模型单价（¥ / 百万 token）。未列出的模型用 __default__ 兜底。
      prices: {
        "deepseek-v4-flash": { in: 1, out: 2 },
        "deepseek-v4-pro":   { in: 4, out: 8 },
        "__default__":       { in: 1, out: 2 },
      },
      _warnedLevel: "",      // 最近一次提示的警告等级，避免重复刷 toast
    };
  },

  getConfig() {
    let cfg = this._defaultConfig();
    try {
      const raw = localStorage.getItem(this.LS_CONFIG);
      if (raw) {
        const saved = JSON.parse(raw);
        cfg = Object.assign(cfg, saved);
        cfg.prices = Object.assign(this._defaultConfig().prices, saved.prices || {});
      }
    } catch (e) { /* 配置损坏则用默认 */ }
    return cfg;
  },

  saveConfig(cfg) {
    try { localStorage.setItem(this.LS_CONFIG, JSON.stringify(cfg)); } catch (e) {}
  },

  _defaultTracker() {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, calls: 0, byModel: {} };
  },

  getTracker() {
    let t = this._defaultTracker();
    try {
      const raw = localStorage.getItem(this.LS_TRACKER);
      if (raw) t = Object.assign(t, JSON.parse(raw));
    } catch (e) {}
    return t;
  },

  _saveTracker(t) {
    try { localStorage.setItem(this.LS_TRACKER, JSON.stringify(t)); } catch (e) {}
  },

  // usage: { prompt_tokens, completion_tokens, total_tokens }（OpenAI / DeepSeek 兼容格式）
  record(model, usage) {
    if (!usage || !usage.total_tokens) return;
    const cfg = this.getConfig();
    const price = (cfg.prices && cfg.prices[model]) || cfg.prices["__default__"] || { in: 1, out: 2 };
    const pt = usage.prompt_tokens || 0;
    const ct = usage.completion_tokens || 0;
    // 花费（¥）= 输入token/1e6 × 输入单价 + 输出token/1e6 × 输出单价
    const cost = (pt / 1e6) * price.in + (ct / 1e6) * price.out;

    const t = this.getTracker();
    t.promptTokens += pt;
    t.completionTokens += ct;
    t.totalTokens += (usage.total_tokens || (pt + ct));
    t.cost += cost;
    t.calls += 1;
    if (!t.byModel[model]) t.byModel[model] = { calls: 0, cost: 0, tokens: 0 };
    t.byModel[model].calls += 1;
    t.byModel[model].cost += cost;
    t.byModel[model].tokens += (usage.total_tokens || (pt + ct));
    this._saveTracker(t);

  },

  getLimit() { return this.getConfig().limit; },
  getCost() { return this.getTracker().cost; },
  getRemaining() { return Math.max(0, this.getLimit() - this.getCost()); },
  getPercent() {
    const limit = this.getLimit();
    if (limit <= 0) return 100;
    return (this.getCost() / limit) * 100;
  },
  isEnabled() { return !!this.getConfig().enabled; },
  isOver() { return this.getCost() >= this.getLimit(); },
  getLevel() {
    const p = this.getPercent();
    if (p >= 100) return "over";
    if (p >= 80) return "warn";
    return "ok";
  },
  formatCost(n) {
    const cur = this.getConfig().currency || "¥";
    return cur + (Math.round((n || 0) * 100) / 100).toFixed(2);
  },
  // 充值后续用：清零本机计量并重置警告标记
  reset() {
    this._saveTracker(this._defaultTracker());
    const cfg = this.getConfig();
    cfg._warnedLevel = "";
    this.saveConfig(cfg);
  },
};

// ============================================================
//  像素场景库（视觉小说式背景）与按境界默认场景
// ============================================================
const SCENE_LIB = {
  mountain_gate: { file: "scene_mountain_gate.webp", name: "山门" },
  bamboo_forest: { file: "scene_bamboo_forest.webp", name: "竹林" },
  sect_hall:     { file: "scene_sect_hall.webp",     name: "宗门大殿" },
  market:        { file: "scene_market.webp",        name: "坊市" },
  secret_realm:  { file: "scene_secret_realm.webp",  name: "洞天秘境" },
  beast_wilds:   { file: "scene_beast_wilds.webp",   name: "妖兽荒原" },
  snow_peak:     { file: "scene_snow_peak.webp",     name: "雪岭寒潭" },
  star_sky:      { file: "scene_star_sky.webp",      name: "星海" },
  ghost_realm:   { file: "scene_ghost_realm.webp",   name: "幽冥鬼域" },
  cloud_palace:  { file: "scene_cloud_palace.webp",  name: "云端仙宫" },
};
// realmLevel(1基) -> 默认场景 slug
const REALM_SCENE = {
  1: "mountain_gate", 2: "mountain_gate", 3: "bamboo_forest", 4: "bamboo_forest",
  5: "secret_realm", 6: "star_sky", 7: "snow_peak", 8: "cloud_palace",
  9: "cloud_palace", 10: "cloud_palace",
};

// ============================================================
//  游客离线试玩（无需 API Key）：本地脚本化剧情，让新玩家零摩擦感受玩法循环
//  仅作体验入口，不写存档、不参与神魂册/排行；进入游戏后顶部有"配置Key解锁完整AI"提示
// ============================================================
const GUEST_SCRIPT = [
  {
    narrative: "你自一阵清梦中转醒。窗外青峦叠嶂，山门「玄霄宗」四字被晨雾洇得半湿。你记得自己是来此求道的散修，随身唯有半卷残破功诀。廊下扫地的灰袍老者瞥你一眼，未多言，只把扫帚往偏殿一指——那里飘出淡淡药香，混着晨风里的松脂味。",
    options: ["前往偏殿，看看那药香从何而来", "向扫地老者拱手行礼，打听宗门规矩", "先在山门广场打坐，稳固初入此界的气息", "翻看怀中残卷，试着记诵其中口诀"],
    state_changes: {},
  },
  {
    narrative: "偏殿内，一名青衣弟子正守着丹炉。炉中赤焰温吞，一缕青烟笔直升起，竟在半空凝成个小小的丹丸虚影。他见你进来，挑眉道：「师弟也是来蹭丹火的？这炉『培元丹』还需半刻，你若愿替我看火，便分你一粒。」说罢抛来个干净蒲团。",
    options: ["爽快答应替他看火，结识这位青衣弟子", "好奇问他这丹丸有何用处", "婉拒，转而问宗门后山可有灵脉可采", "不动声色，记下丹炉火候的诀窍"],
    state_changes: { items_gained: [{ name: "培元丹", kind: "丹药", desc: "温养灵气的下品丹丸", grade: "下品" }], npc_affinity_change: { "青衣弟子·陆昭": 8 } },
  },
  {
    narrative: "半个时辰后丹成。陆昭抛来一粒温润丹丸，你自己也趁热打坐运转功诀，竟觉丹田一暖，灵力隐隐增长。殿外忽传来钟鸣——宗门开放「试炼林」猎妖，胜者可入藏经阁择一门真传。陆昭眨眼：「想去？我替你报名。」",
    options: ["随陆昭去试炼林，猎妖夺真传", "先服下培元丹，巩固修为再前往", "打听试炼林里都有些什么妖兽", "向陆昭讨教一门入门身法再上路"],
    state_changes: { realm_progress: 12, qi: 20, items_lost: ["培元丹"] },
  },
  {
    narrative: "试炼林外雾气森森。你刚踏进林口，草丛便一阵窸窣——一头赤鳞小蟒昂首吐信，独目泛着幽光。它并不急着扑来，只是缓缓游近，似在掂量你的斤两。林间风过，吹落几片红叶，正落在你剑前。",
    options: ["拔剑示警，先发制人", "以灵力探查这蟒的修为深浅", "且退半步，观察它的行动规律", "抛出一枚培元丹为饵，引它分神"],
    optionRisks: ["lethal", "danger", "safe", "safe"],
    state_changes: { combat_encounter: true },
  },
  {
    narrative: "一番缠斗，你借红叶蔽眼、剑走偏锋，终将赤鳞小蟒逼退入草。虽未取其性命，却摸清了荒野妖兽的凶悍与机变——这一战让你气血微耗，却也赚了实战的胆气。陆昭在不远处抚掌而笑：「有点意思。藏经阁的真传，你够格去挑了。」远处山巅，云海翻涌。",
    options: ["随陆昭直奔藏经阁，择取真传功法", "先就地调息，恢复方才激斗的消耗", "回望试炼林，记下这头蟒的出没之地", "向陆昭打听山巅那座仙宫的来历"],
    state_changes: { realm_progress: 18, cause_credit_change: 6, npc_affinity_change: { "青衣弟子·陆昭": 10 } },
  },
  {
    narrative: "藏经阁九重飞檐下，万卷功诀静卧檀木架。守阁长老睥你一眼，袖中飞出一册落你掌心——《玄天剑诀》，剑出如虹，一剑可破万法。你指尖刚触封面，便觉一缕锐金之气顺经脉游走，与体内灵力隐隐呼应。",
    options: ["当场翻阅剑诀，体会其中剑意", "向长老请教此诀的修行关隘", "将剑诀收入储物袋，留待静处参悟", "问长老：藏经阁可还有契合我灵根的功法"],
    state_changes: { techniques_gained: [{ name: "玄天剑诀", type: "攻击", desc: "剑出如虹，一剑破万法", realm_req: 2 }], realm_progress: 10 },
  },
  {
    narrative: "你辞别宗门下山历练。山道旁茅棚里，一名灰衣散修被两名劫修逼至墙角，肩头血迹未干，却咬牙不肯交出怀中玉匣。他望见你，眼中闪过一丝挣扎的期盼——救，或与劫修一同分那玉匣，只在一念。",
    options: ["拔剑逼退劫修，护下这名散修", "冷眼旁观，转身离去不蹚浑水", "假意相助，暗中以神识探那玉匣", "高声呼喝，引附近修士来主持公道"],
    optionRisks: ["lethal", "safe", "danger", "safe"],
    state_changes: {},
  },
  {
    narrative: "你出手逼退劫修。那散修踉跄起身，将玉匣往你怀里一塞：「此乃我恩师遗物，今日之恩，来日必报。」——你不知这一推却，已在因果簿上结下一笔善缘。三日程后，你于客栈独酌，窗外忽掠过一道熟悉的灰影，似有人护你于暗处退去一桩暗算。",
    options: ["推开方窗查看那道灰影是谁", "不动声色，将这桩暗挡记在心里", "修书一封，托人寻那散修下落", "借机打坐，感应方才那一丝善念余温"],
    state_changes: { cause_credit_change: 10, npc_affinity_change: { "灰衣散修·苏砚": 12 } },
  },
  {
    narrative: "你立于苍梧山巅，风卷起道袍下摆。脚下是刚起步的仙途：一柄未熟的剑、半个肯交托后背的陆昭、一笔尚未还清的因果。身后玄霄宗钟声遥遥，眼前云海尽头，是 AI 实时为你推演的、永无尽头的诸天万界。以上只是「游客试玩」的本地脚本演示——配置 API Key 后，每一个选择都将由 AI 即时演绎：NPC 会记得你、抉择会翻出旧账、生死由你自承。点顶部「设置 / API 配置」填入你的 DeepSeek Key，仙途便真正展开。",
    options: ["前往设置，配置 API Key 解锁完整仙途", "就在这山巅，再看一遍这段演示", "静静站一会儿，看完这山巅风景"],
    state_changes: {},
  },
];
function GuestMode_isActive() { return !!(Game && Game._guestMode); }
function GuestMode_next(action) {
  const idx = (Game._guestStep || 0);
  const node = GUEST_SCRIPT[Math.min(idx, GUEST_SCRIPT.length - 1)];
  Game._guestStep = idx + 1;
  // 末节点循环回最后一段，避免"无内容可玩"
  return JSON.parse(JSON.stringify(node));
}

// ============================================================
//  UI 渲染层
// ============================================================

// ====== 程序化立绘工厂（模块级，UI 内复用） ======

  //  参数化立绘工厂 ArtGen —— 用可组合特征程序化生成长相各异的
  //  修士 / 妖姬 / 魔尊 / 敌人，可达上万种组合（告别写死的 9 种脸）。
  //  配色板(14) × 发型(5) × 衣着(5) × 饰品(5) × 脸型(3) × 性别(2)
  // =====================================================================
  const ArtGen = {
    // 14 套配色板：c1 主袍 c2 次色 c3 高光 c4 点缀 skin 肤 skinSh 肤影 hair 发 hairSh 发影 lip 唇 eye 眼 glow 光晕
    PALETTES: [
      { c1:"#2f6f8f", c2:"#8fd0e8", c3:"#d8f4ff", c4:"#bfeaff", skin:"#fce8dc", skinSh:"#f0d2bc", hair:"#1a1614", hairSh:"#3d3530", lip:"#d47a7a", eye:"#2a1814", glow:"rgba(120,200,235,0.25)" },
      { c1:"#b05080", c2:"#f0b8d8", c3:"#ffd8ee", c4:"#ffc0e8", skin:"#fce8dc", skinSh:"#f0d2bc", hair:"#2e2020", hairSh:"#4a3838", lip:"#e07a8a", eye:"#3a2018", glow:"rgba(220,140,200,0.22)" },
      { c1:"#2a2e3a", c2:"#6a7290", c3:"#aab4d8", c4:"#c8d2f0", skin:"#f0dcc8", skinSh:"#e0c8b0", hair:"#12110f", hairSh:"#2e2a26", lip:"#c06a60", eye:"#2a1a12", glow:"rgba(150,165,210,0.2)" },
      { c1:"#b08028", c2:"#f0d080", c3:"#ffe8a0", c4:"#ffd866", skin:"#f8e0c8", skinSh:"#e6cdb0", hair:"#221a10", hairSh:"#4a3e28", lip:"#c87a5a", eye:"#3a2010", glow:"rgba(240,210,120,0.24)" },
      { c1:"#3a8a5a", c2:"#9fd8b0", c3:"#d0f4dc", c4:"#b8f0c8", skin:"#fce8dc", skinSh:"#f0d2bc", hair:"#1e1a14", hairSh:"#3e3828", lip:"#d07a7a", eye:"#2a1a10", glow:"rgba(120,210,160,0.22)" },
      { c1:"#6a3f9a", c2:"#b890e0", c3:"#e0c8ff", c4:"#d0b0ff", skin:"#f6e2d8", skinSh:"#e8d0c4", hair:"#241828", hairSh:"#443848", lip:"#c878b0", eye:"#2a1828", glow:"rgba(190,140,235,0.24)" },
      { c1:"#a02a2a", c2:"#e89090", c3:"#ffc0c0", c4:"#ff9a9a", skin:"#f4dcc8", skinSh:"#e2c6b2", hair:"#1a0e0e", hairSh:"#3e2828", lip:"#d05a5a", eye:"#2a1410", glow:"rgba(230,110,110,0.24)" },
      { c1:"#5a7a9a", c2:"#c0dcef", c3:"#eaf4ff", c4:"#d8ecff", skin:"#f2e6dc", skinSh:"#e2d4c8", hair:"#2a2e36", hairSh:"#4a4e58", lip:"#c89aa0", eye:"#1a2a3a", glow:"rgba(180,210,240,0.22)" },
      { c1:"#4a5a78", c2:"#9ab0d0", c3:"#cfe0ff", c4:"#b8cce8", skin:"#e2e8f4", skinSh:"#cdd6ea", hair:"#1a2230", hairSh:"#3a4250", lip:"#a890b0", eye:"#dfe9ff", glow:"rgba(160,190,235,0.2)" },
      { c1:"#7a5a30", c2:"#c8a060", c3:"#e8d0a0", c4:"#d8b878", skin:"#f0d8c0", skinSh:"#e0c4a8", hair:"#221a10", hairSh:"#4a3e28", lip:"#b07850", eye:"#3a2010", glow:"rgba(200,160,90,0.2)" },
      { c1:"#34406a", c2:"#7a8fc0", c3:"#b8c8f0", c4:"#a0b8e8", skin:"#f2e2d6", skinSh:"#e2d2c6", hair:"#181a26", hairSh:"#3a3c4a", lip:"#b87888", eye:"#1a1a2a", glow:"rgba(130,155,210,0.22)" },
      { c1:"#9a3a5a", c2:"#e0a0b8", c3:"#ffc8dc", c4:"#f0a8c0", skin:"#fce0d8", skinSh:"#f0d0c6", hair:"#281820", hairSh:"#4c3840", lip:"#e07a90", eye:"#3a1820", glow:"rgba(220,140,170,0.22)" },
      { c1:"#2f7a4a", c2:"#8fd0a0", c3:"#c8f0d0", c4:"#a8e8bc", skin:"#f4e2cc", skinSh:"#e4d2bc", hair:"#1c1a12", hairSh:"#3e3e2e", lip:"#c8786a", eye:"#2a2a10", glow:"rgba(120,200,150,0.2)" },
      { c1:"#6a7080", c2:"#c0c8d8", c3:"#eef2fb", c4:"#d8deec", skin:"#f6ece2", skinSh:"#e8ddd0", hair:"#20222a", hairSh:"#40424a", lip:"#c09098", eye:"#2a2a34", glow:"rgba(180,190,210,0.2)" },
    ],
    _rng(seed) { let a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
    specFromSeed(seed, arche, gender) {
      const r = this._rng(seed);
      const ri = (n) => Math.floor(r() * n);
      return { pal: ri(this.PALETTES.length), hair: ri(5), outfit: ri(5), acc: ri(5), face: ri(3), gender: gender || "f" };
    },

    _defs(c) {
      return `<defs>
        <radialGradient id="agAura" cx="50%" cy="42%" r="52%">
          <stop offset="0%" stop-color="${c.c4}" stop-opacity="0.30"/>
          <stop offset="55%" stop-color="${c.glow}" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="${c.glow}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="agRobe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c.c2}" stop-opacity="0.30"/>
          <stop offset="45%" stop-color="${c.c1}" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="${c.c1}" stop-opacity="0.92"/>
        </linearGradient>
        <linearGradient id="agRobeSh" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${c.c1}" stop-opacity="0.95"/>
          <stop offset="50%" stop-color="${c.c2}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${c.c1}" stop-opacity="0.95"/>
        </linearGradient>
        <filter id="agGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="agSoft"><feGaussianBlur stdDeviation="0.8"/></filter>
      </defs>`;
    },
    _aura(c) {
      return `<ellipse cx="80" cy="115" rx="52" ry="75" fill="url(#agAura)"/>
        <circle cx="38" cy="58" r="1.5" fill="${c.c4}" opacity="0.40"><animate attributeName="cy" values="58;48;58" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.40;0.12;0.40" dur="4s" repeatCount="indefinite"/></circle>
        <circle cx="124" cy="72" r="1.2" fill="${c.c4}" opacity="0.30"><animate attributeName="cy" values="72;62;72" dur="3.5s" repeatCount="indefinite"/></circle>
        <circle cx="50" cy="155" r="1.1" fill="${c.c4}" opacity="0.25"><animate attributeName="cy" values="155;145;155" dur="5s" repeatCount="indefinite"/></circle>
        <circle cx="112" cy="170" r="1.4" fill="${c.c4}" opacity="0.20"><animate attributeName="cy" values="170;160;170" dur="4.5s" repeatCount="indefinite"/></circle>`;
    },

    _body(c, g, o) {
      const belt = `<path d="M58,172 Q80,177 102,172 L101,179 Q80,184 59,179Z" fill="${c.c4}" opacity="0.55"/>
        <path d="M76,174 L84,174 L83,182 L77,182Z" fill="${c.c1}" opacity="0.9"/>`;
      const baseF = `
        <path d="M48,105 Q44,135 52,168 Q56,180 64,186 L96,186 Q104,180 108,168 Q116,135 112,105
                 Q108,94 98,91 Q86,87 80,87 Q74,87 62,91 Q52,94 48,105Z" fill="${c.c1}" opacity="0.93"/>
        <path d="M52,107 Q48,138 54,167 Q58,178 66,183 L94,183 Q102,178 106,167 Q112,138 108,107
                 Q104,97 95,94 Q85,90 80,90 Q75,90 65,94 Q56,97 52,107Z" fill="url(#agRobe)"/>
        <path d="M48,107 Q34,116 24,142 Q22,156 30,175 Q38,166 44,150 Q48,138 50,120Z" fill="${c.c1}" opacity="0.88"/>
        <path d="M46,112 Q36,120 28,142 Q26,154 32,164 Q38,158 44,148 Q48,138 50,122Z" fill="url(#agRobeSh)" opacity="0.5"/>
        <path d="M112,107 Q126,116 136,142 Q138,156 132,175 Q124,166 116,150 Q112,138 110,120Z" fill="${c.c1}" opacity="0.88"/>
        <path d="M114,112 Q124,120 132,142 Q134,154 128,164 Q122,158 116,148 Q112,138 110,122Z" fill="url(#agRobeSh)" opacity="0.5"/>
        <path d="M64,186 Q54,210 50,238 L110,238 Q106,210 96,186Z" fill="${c.c1}" opacity="0.90"/>
        <path d="M66,188 Q58,208 55,234 L105,234 Q102,208 94,188Z" fill="url(#agRobe)"/>
        <ellipse cx="28" cy="171" rx="5" ry="7" fill="${c.skin}" opacity="0.9"/>
        <ellipse cx="132" cy="171" rx="5" ry="7" fill="${c.skin}" opacity="0.9"/>`;
      const baseM = `
        <path d="M46,105 Q42,138 50,172 Q56,188 66,196 L94,196 Q104,188 110,172 Q118,138 114,105
                 Q109,93 97,89 Q85,86 80,86 Q75,86 63,89 Q51,93 46,105Z" fill="${c.c1}" opacity="0.93"/>
        <path d="M50,107 Q46,140 52,171 Q58,185 68,192 L92,192 Q102,185 108,171 Q114,140 110,107
                 Q105,96 95,92 Q85,89 80,89 Q75,89 65,92 Q55,96 50,107Z" fill="url(#agRobe)"/>
        <path d="M46,105 Q32,116 22,145 Q19,162 27,176 Q37,166 46,152 Q50,138 48,118Z" fill="${c.c1}" opacity="0.88"/>
        <path d="M114,105 Q128,116 138,145 Q141,162 133,176 Q123,166 114,152 Q110,138 112,118Z" fill="${c.c1}" opacity="0.88"/>
        <path d="M66,196 Q56,218 52,244 L108,244 Q104,218 94,196Z" fill="${c.c1}" opacity="0.90"/>
        <path d="M68,198 Q60,216 57,240 L103,240 Q100,216 92,198Z" fill="url(#agRobe)"/>
        <ellipse cx="27" cy="174" rx="6" ry="8" fill="${c.skin}" opacity="0.9"/>
        <ellipse cx="133" cy="174" rx="6" ry="8" fill="${c.skin}" opacity="0.9"/>`;
      let body = g === "f" ? baseF : baseM;
      if (o === 1) body += `<path d="M64,94 Q80,106 80,114 Q80,106 96,94 Q86,100 80,110 Q74,100 64,94Z" fill="${c.c3}" opacity="0.45"/>` + belt;
      else if (o === 2) body += `<path d="M60,100 Q80,108 100,100 Q92,105 80,113 Q68,105 60,100Z" fill="${c.c4}" opacity="0.40"/>` + belt;
      else if (o === 3) body += `<path d="M50,108 Q42,117 44,134 L56,127 Q52,118 54,110Z" fill="${c.c3}" opacity="0.60"/><path d="M110,108 Q118,117 116,134 L104,127 Q108,118 106,110Z" fill="${c.c3}" opacity="0.60"/><path d="M68,95 L92,95 L89,103 L71,103Z" fill="${c.c3}" opacity="0.50"/>` + belt;
      else if (o === 4) body += `<path d="M56,158 Q80,166 104,158 L102,154 Q80,162 58,154Z" fill="${c.c4}" opacity="0.35"/><path d="M80,105 Q80,155 80,205" stroke="${c.c4}" stroke-width="1.2" fill="none" opacity="0.40"/>` + belt;
      else body += belt;
      return body;
    },

    _head(idx, c, g) {
      const neck = `<path d="M71,82 L71,92 Q80,97 89,92 L89,82" fill="${c.skin}"/>
        <path d="M73,84 L73,91 Q80,95 87,91 L87,84" fill="${c.skinSh}" opacity="0.5"/>`;
      if (idx === 0) {
        return `<path d="M54,58 Q50,38 62,26 Q72,17 80,16 Q88,17 98,26 Q110,38 106,58
                  Q104,76 95,84 Q87,90 80,90 Q73,90 65,84 Q56,76 54,58Z" fill="${c.skin}"/>` +
               `<path d="M56,60 Q52,42 63,30 Q72,21 80,20 Q88,21 97,30 Q108,42 104,60
                  Q102,77 94,84 Q87,89 80,89 Q73,89 66,84 Q58,77 56,60Z" fill="${c.skinSh}" opacity="0.35"/>` + neck;
      }
      if (idx === 1) {
        return `<path d="M52,56 Q48,36 61,24 Q72,15 80,14 Q89,15 100,24 Q112,36 108,56
                  Q106,75 97,83 Q88,90 80,90 Q72,90 63,83 Q54,75 52,56Z" fill="${c.skin}"/>` +
               `<path d="M54,58 Q50,40 62,28 Q73,19 80,18 Q88,19 99,28 Q110,40 106,58
                  Q104,76 96,83 Q87,89 80,89 Q73,89 64,83 Q56,76 54,58Z" fill="${c.skinSh}" opacity="0.30"/>` + neck;
      }
      return `<path d="M54,57 Q50,40 62,28 Q73,19 80,18 Q88,19 98,28 Q110,40 106,57
                Q104,74 96,82 Q87,89 80,89 Q73,89 66,82 Q57,74 54,57Z" fill="${c.skin}"/>` +
           `<path d="M56,59 Q52,42 63,31 Q73,22 80,21 Q87,22 98,31 Q109,42 105,59
                Q103,75 95,82 Q87,88 80,88 Q73,88 65,81 Q57,75 56,59Z" fill="${c.skinSh}" opacity="0.32"/>` + neck;
    },

    _features(c, g) {
      const eyeY = 55;
      const blush = g === "f"
        ? `<ellipse cx="62" cy="64" rx="6" ry="3.5" fill="#ffb0a0" opacity="0.25"/>
           <ellipse cx="98" cy="64" rx="6" ry="3.5" fill="#ffb0a0" opacity="0.25"/>`
        : "";
      const brow = g === "f"
        ? `<path d="M58,47 Q65,43 73,46" stroke="${c.hairSh}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.75"/>
           <path d="M87,46 Q95,43 102,47" stroke="${c.hairSh}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.75"/>`
        : `<path d="M56,45 Q66,40 77,44" stroke="${c.hairSh}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>
           <path d="M83,44 Q94,40 104,45" stroke="${c.hairSh}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>`;
      const eRx = g === "f" ? 6 : 6.5, eRy = g === "f" ? 4 : 4.4;
      const eyes = `
        <ellipse cx="68" cy="${eyeY}" rx="${eRx}" ry="${eRy}" fill="#fff" opacity="0.95"/>
        <ellipse cx="92" cy="${eyeY}" rx="${eRx}" ry="${eRy}" fill="#fff" opacity="0.95"/>
        <ellipse cx="68.5" cy="${eyeY + 0.5}" rx="3.5" ry="3.8" fill="${c.eye}" opacity="0.92"/>
        <ellipse cx="92.5" cy="${eyeY + 0.5}" rx="3.5" ry="3.8" fill="${c.eye}" opacity="0.92"/>
        <circle cx="70" cy="${eyeY - 1.2}" r="1.6" fill="#fff" opacity="0.95"/>
        <circle cx="94" cy="${eyeY - 1.2}" r="1.6" fill="#fff" opacity="0.95"/>
        <circle cx="67" cy="${eyeY + 1}" r="0.8" fill="#fff" opacity="0.6"/>
        <circle cx="91" cy="${eyeY + 1}" r="0.8" fill="#fff" opacity="0.6"/>`;
      const nose = `<path d="M80,56 Q82.5,63 80,71" stroke="${c.skinSh}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M80,71 Q78,73 80,74" stroke="${c.skinSh}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.5"/>`;
      const lip = g === "f"
        ? `<path d="M73,79 Q80,82.5 87,79" stroke="${c.lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
           <path d="M76,79 Q80,81 84,79" fill="${c.lip}" opacity="0.18"/>`
        : `<path d="M73,80 Q80,83.5 87,80" stroke="${c.lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      const ears = `<ellipse cx="51" cy="58" rx="4" ry="6" fill="${c.skin}" transform="rotate(-10 51 58)"/>
        <ellipse cx="51" cy="58" rx="2" ry="4" fill="${c.skinSh}" opacity="0.4" transform="rotate(-10 51 58)"/>
        <ellipse cx="109" cy="58" rx="4" ry="6" fill="${c.skin}" transform="rotate(10 109 58)"/>
        <ellipse cx="109" cy="58" rx="2" ry="4" fill="${c.skinSh}" opacity="0.4" transform="rotate(10 109 58)"/>`;
      return ears + blush + brow + eyes + nose + lip;
    },

    HAIR_F: [
      (c) => `<path d="M50,56 Q42,32 56,18 Q68,6 80,5 Q90,6 102,18 Q114,32 110,56
                  Q108,72 100,82 Q92,90 80,90 Q68,90 60,82 Q52,72 50,56Z" fill="${c.hair}"/>
        <path d="M48,60 Q36,88 30,140 Q34,108 44,82 Q48,72 48,60Z" fill="${c.hair}" opacity="0.92"/>
        <path d="M112,60 Q124,88 130,140 Q126,108 116,82 Q112,72 112,60Z" fill="${c.hair}" opacity="0.92"/>
        <path d="M54,42 Q58,28 70,20 Q78,15 88,20 Q100,28 104,42
                  Q96,34 86,30 Q76,27 66,30 Q58,34 54,42Z" fill="${c.hairSh}"/>
        <path d="M56,48 Q60,36 72,28 Q80,24 90,28 Q102,36 104,48
                  Q96,42 86,39 Q76,37 66,39 Q58,42 56,48Z" fill="${c.hairSh}" opacity="0.7"/>`,
      (c) => `<path d="M50,56 Q42,32 56,18 Q68,6 80,5 Q90,6 102,18 Q114,32 110,56
                  Q108,72 100,82 Q92,90 80,90 Q68,90 60,82 Q52,72 50,56Z" fill="${c.hair}"/>
        <circle cx="52" cy="36" r="11" fill="${c.hair}"/>
        <circle cx="52" cy="36" r="7" fill="${c.hairSh}"/>
        <circle cx="52" cy="33" r="2.5" fill="${c.c4}" opacity="0.7" filter="url(#agGlow)"/>
        <circle cx="108" cy="36" r="11" fill="${c.hair}"/>
        <circle cx="108" cy="36" r="7" fill="${c.hairSh}"/>
        <circle cx="108" cy="33" r="2.5" fill="${c.c4}" opacity="0.7" filter="url(#agGlow)"/>
        <path d="M50,62 Q38,90 32,138 Q36,108 46,82 Q50,72 50,62Z" fill="${c.hair}" opacity="0.88"/>
        <path d="M110,62 Q122,90 128,138 Q124,108 114,82 Q110,72 110,62Z" fill="${c.hair}" opacity="0.88"/>
        <path d="M56,48 Q60,36 72,28 Q80,24 90,28 Q102,36 104,48
                  Q96,42 86,39 Q76,37 66,39 Q58,42 56,48Z" fill="${c.hairSh}"/>`,
      (c) => `<path d="M50,56 Q42,32 56,18 Q68,6 80,5 Q90,6 102,18 Q114,32 110,56
                  Q108,72 100,82 Q92,90 80,90 Q68,90 60,82 Q52,72 50,56Z" fill="${c.hair}"/>
        <path d="M56,38 Q80,14 104,38 Q96,26 80,24 Q64,26 56,38Z" fill="${c.hairSh}"/>
        <path d="M80,18 Q86,40 82,80 Q78,50 80,18Z" fill="${c.hair}" opacity="0.9"/>
        <path d="M80,18 Q94,35 100,70 Q88,42 82,22Z" fill="${c.hair}" opacity="0.85"/>
        <circle cx="80" cy="16" r="4.5" fill="${c.c4}" opacity="0.65" filter="url(#agGlow)"/>
        <path d="M48,62 Q38,92 34,142 Q38,110 46,84 Q50,74 48,62Z" fill="${c.hair}" opacity="0.85"/>
        <path d="M112,62 Q122,92 126,142 Q122,110 114,84 Q110,74 112,62Z" fill="${c.hair}" opacity="0.85"/>
        <path d="M54,48 Q58,36 70,28 Q78,24 88,28 Q100,36 104,48
                  Q96,42 86,39 Q76,37 66,39 Q58,42 54,48Z" fill="${c.hairSh}"/>`,
      (c) => `<path d="M52,56 Q46,34 58,20 Q70,9 80,8 Q90,9 102,20 Q114,34 108,56
                  Q106,72 98,80 Q90,88 80,88 Q70,88 62,80 Q54,72 52,56Z" fill="${c.hair}"/>
        <path d="M53,44 Q56,34 66,27 Q75,22 85,27 Q95,34 98,44 Q90,38 82,35 Q74,33 66,35 Q58,38 53,44Z" fill="${c.hair}"/>
        <path d="M55,46 Q58,37 68,30 Q76,26 86,30 Q96,37 99,46
                  Q92,41 84,38 Q76,36 67,38 Q59,41 55,46Z" fill="${c.hairSh}" opacity="0.7"/>
        <rect x="73" y="18" width="14" height="7" rx="2.5" fill="${c.c4}" opacity="0.65"/>
        <circle cx="80" cy="16" r="3" fill="${c.c4}" opacity="0.6" filter="url(#agGlow)"/>
        <path d="M50,62 Q42,84 38,120 Q42,96 48,76 Q52,68 50,62Z" fill="${c.hair}" opacity="0.85"/>
        <path d="M110,62 Q118,84 122,120 Q118,96 112,76 Q108,68 110,62Z" fill="${c.hair}" opacity="0.85"/>`,
      (c) => `<path d="M50,56 Q42,32 56,18 Q68,6 80,5 Q90,6 102,18 Q114,32 110,56
                  Q108,72 100,82 Q92,90 80,90 Q68,90 60,82 Q52,72 50,56Z" fill="${c.hair}"/>
        <path d="M48,60 Q34,90 28,148 Q32,112 44,84 Q50,74 48,60Z" fill="${c.hair}" opacity="0.92"/>
        <path d="M112,60 Q126,90 132,148 Q128,112 116,84 Q110,74 112,60Z" fill="${c.hair}" opacity="0.92"/>
        <path d="M34,100 Q30,118 34,134" stroke="${c.hairSh}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.4"/>
        <path d="M126,100 Q130,118 126,134" stroke="${c.hairSh}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.4"/>
        <path d="M54,44 Q58,28 72,19 Q80,14 90,19 Q102,28 106,44
                  Q97,35 86,31 Q76,28 66,31 Q57,35 54,44Z" fill="${c.hairSh}"/>
        <path d="M56,50 Q60,38 72,30 Q80,25 90,30 Q100,38 104,50
                  Q96,43 86,40 Q76,37 67,40 Q58,43 56,50Z" fill="${c.hairSh}" opacity="0.65"/>`,
    ],

    HAIR_M: [
      (c) => `<path d="M52,56 Q44,32 58,18 Q70,7 80,6 Q90,7 102,18 Q116,32 108,56
                  Q106,72 98,80 Q90,88 80,88 Q70,88 62,80 Q54,72 52,56Z" fill="${c.hair}"/>
        <path d="M64,24 Q80,12 96,24 Q88,18 80,17 Q72,18 64,24Z" fill="${c.hairSh}"/>
        <line x1="58" y1="30" x2="102" y2="30" stroke="${c.c4}" stroke-width="2.5" stroke-linecap="round" opacity="0.65"/>
        <rect x="74" y="24" width="12" height="6" rx="1.5" fill="${c.c4}" opacity="0.55"/>
        <path d="M56,52 Q60,38 72,29 Q80,25 88,29 Q100,38 104,52
                  Q96,44 86,40 Q76,38 66,40 Q58,44 56,52Z" fill="${c.hairSh}"/>
        <path d="M50,60 Q38,90 32,140 Q36,108 46,82 Q50,72 50,60Z" fill="${c.hair}" opacity="0.88"/>
        <path d="M110,60 Q122,90 128,140 Q124,108 114,82 Q110,72 110,60Z" fill="${c.hair}" opacity="0.88"/>`,
      (c) => `<path d="M54,56 Q46,34 58,20 Q70,10 80,9 Q90,10 102,20 Q114,34 108,56
                  Q106,72 98,80 Q90,87 80,87 Q70,87 62,80 Q54,72 54,56Z" fill="${c.hair}"/>
        <path d="M56,52 Q60,40 74,31 Q80,27 88,31 Q102,40 104,52
                  Q96,44 86,41 Q76,38 66,41 Q58,44 56,52Z" fill="${c.hairSh}"/>`,
      (c) => `<path d="M52,56 Q44,32 56,18 Q68,6 80,5 Q92,6 104,18 Q116,32 108,56
                  Q106,72 100,82 Q92,90 80,90 Q68,90 60,82 Q52,72 52,56Z" fill="${c.hair}"/>
        <path d="M48,60 Q36,90 30,145 Q34,112 44,84 Q50,74 48,60Z" fill="${c.hair}" opacity="0.90"/>
        <path d="M112,60 Q124,90 130,145 Q126,112 116,84 Q110,74 112,60Z" fill="${c.hair}" opacity="0.90"/>
        <path d="M54,50 Q58,36 70,27 Q78,22 88,27 Q100,36 104,50
                  Q96,42 86,38 Q76,35 66,38 Q58,42 54,50Z" fill="${c.hairSh}"/>`,
      (c) => `<path d="M52,56 Q46,36 58,22 Q70,12 80,11 Q90,12 102,22 Q114,36 108,56
                  Q106,70 98,78 Q90,85 80,85 Q70,85 62,78 Q54,70 52,56Z" fill="${c.hair}"/>
        <path d="M68,26 Q80,16 92,26 Q86,20 80,19 Q74,20 68,26Z" fill="${c.hairSh}"/>
        <path d="M58,32 Q80,28 102,32 L100,38 Q80,34 60,38Z" fill="${c.c4}" opacity="0.55"/>
        <path d="M58,40 Q60,30 72,23 L80,38 Q88,23 100,40 Q98,32 92,28 Q80,24 68,28 Q62,30 58,40Z" fill="${c.hairSh}"/>`,
      (c) => `<path d="M52,56 Q44,32 58,18 Q70,7 80,6 Q90,7 102,18 Q116,32 108,56
                  Q106,72 98,80 Q90,88 80,88 Q70,88 62,80 Q54,72 52,56Z" fill="${c.hair}"/>
        <rect x="62" y="22" width="36" height="6" rx="2" fill="${c.c4}" opacity="0.55"/>
        <line x1="56" y1="32" x2="104" y2="32" stroke="${c.c4}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
        <circle cx="80" cy="19" r="3" fill="${c.c4}" opacity="0.6" filter="url(#agGlow)"/>
        <path d="M56,52 Q60,38 72,29 Q80,25 88,29 Q100,38 104,52
                  Q96,44 86,40 Q76,38 66,40 Q58,44 56,52Z" fill="${c.hairSh}"/>
        <path d="M50,60 Q38,90 32,140 Q36,108 46,82 Q50,72 50,60Z" fill="${c.hair}" opacity="0.88"/>
        <path d="M110,60 Q122,90 128,140 Q124,108 114,82 Q110,72 110,60Z" fill="${c.hair}" opacity="0.88"/>`,
    ],

    ACC: [
      (c, g) => `<line x1="92" y1="28" x2="108" y2="20" stroke="${c.c4}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="109" cy="19" r="2.8" fill="${c.c4}" filter="url(#agGlow)"/>
        <circle cx="91" cy="29" r="2" fill="${c.c4}" opacity="0.7"/>`,
      (c, g) => `<g transform="rotate(-13 128 100)">
        <rect x="124" y="54" width="3.5" height="58" rx="1.5" fill="#e8f0f8" opacity="0.94"/>
        <rect x="125" y="54" width="1.2" height="58" rx="0.6" fill="#fff" opacity="0.55"/>
        <rect x="120" y="104" width="10" height="4.5" rx="1.2" fill="${c.c4}" opacity="0.7"/>
        </g>`,
      (c, g) => `<g transform="translate(120,125)">
        <path d="M0,0 Q13,-5 20,3 Q13,13 0,11 Z" fill="${c.c2}" opacity="0.82" stroke="${c.c4}" stroke-width="1"/>
        <line x1="-2" y1="7" x2="-14" y2="20" stroke="${c.c1}" stroke-width="1.6"/>
        </g>`,
      (c, g) => `<circle cx="128" cy="78" r="10" fill="none" stroke="${c.c4}" stroke-width="1.3" opacity="0.45">
        <animate attributeName="r" values="10;11.5;10" dur="3s" repeatCount="indefinite"/></circle>
        <circle cx="128" cy="78" r="4.5" fill="${c.c3}" opacity="0.35" filter="url(#agGlow)">
        <animate attributeName="opacity" values="0.35;0.55;0.35" dur="2.5s" repeatCount="indefinite"/></circle>`,
      (c, g) => ``,
    ],

  // 非人形态立绘：按魂穿形态画不同剪影（树/花/石/器/鬼/妖兽/元素灵），配色沿用玩家调色板
  being(form, spec) {
    const P = this.PALETTES[spec.pal % this.PALETTES.length];
    const g = (spec.gender === "f") ? "f" : "m";
    const aura = this._aura(P);
    let body = "";
    if (form === "tree") {
      body = `
        <path d="M73,236 Q70,182 75,150 L85,150 Q90,182 87,236 Z" fill="${P.c1}"/>
        <path d="M75,150 Q72,120 78,98 L82,98 Q88,120 85,150 Z" fill="${P.c1}" opacity="0.85"/>
        <ellipse cx="80" cy="76" rx="42" ry="36" fill="${P.c3}" opacity="0.92"/>
        <ellipse cx="54" cy="92" rx="27" ry="25" fill="${P.c2}" opacity="0.9"/>
        <ellipse cx="106" cy="90" rx="29" ry="27" fill="${P.c2}" opacity="0.92"/>
        <ellipse cx="80" cy="58" rx="31" ry="29" fill="${P.c4}" opacity="0.85"/>
        <circle cx="73" cy="150" r="2.8" fill="${P.glow}" opacity="0.95"/>
        <circle cx="87" cy="150" r="2.8" fill="${P.glow}" opacity="0.95"/>
        <ellipse cx="73" cy="150" rx="4.5" ry="4.5" fill="none" stroke="${P.c4}" stroke-width="1" opacity="0.5"/>
        <ellipse cx="87" cy="150" rx="4.5" ry="4.5" fill="none" stroke="${P.c4}" stroke-width="1" opacity="0.5"/>`;
    } else if (form === "flower") {
      body = `
        <path d="M80,238 Q78,202 80,170" stroke="${P.c1}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <ellipse cx="66" cy="198" rx="13" ry="6" fill="${P.c2}" opacity="0.8" transform="rotate(-30 66 198)"/>
        <ellipse cx="94" cy="198" rx="13" ry="6" fill="${P.c2}" opacity="0.8" transform="rotate(30 94 198)"/>
        ${[0,60,120,180,240,300].map(a=>`<ellipse cx="80" cy="118" rx="13" ry="27" fill="${P.c2}" opacity="0.9" transform="rotate(${a} 80 118)"/>`).join("")}
        <circle cx="80" cy="118" r="14" fill="${P.c4}"/>
        <circle cx="76" cy="118" r="2.4" fill="${P.glow}"/><circle cx="84" cy="118" r="2.4" fill="${P.glow}"/>`;
    } else if (form === "stone") {
      body = `
        <path d="M42,238 Q28,188 52,150 Q70,128 98,138 Q128,128 132,172 Q140,214 112,238 Z" fill="${P.c1}"/>
        <path d="M52,150 Q66,140 82,150 Q70,158 60,158 Z" fill="${P.c2}" opacity="0.5"/>
        <path d="M98,138 Q112,150 108,168" stroke="${P.c2}" stroke-width="1.5" fill="none" opacity="0.5"/>
        <circle cx="72" cy="186" r="3" fill="${P.glow}"/><circle cx="92" cy="186" r="3" fill="${P.glow}"/>
        <ellipse cx="72" cy="186" rx="5" ry="5" fill="none" stroke="${P.c4}" stroke-width="1" opacity="0.5"/>
        <ellipse cx="92" cy="186" rx="5" ry="5" fill="none" stroke="${P.c4}" stroke-width="1" opacity="0.5"/>`;
    } else if (form === "artifact") {
      body = `
        <path d="M80,44 L87,96 L85,196 L80,214 L75,196 L73,96 Z" fill="${P.c3}" stroke="${P.c1}" stroke-width="1.5"/>
        <path d="M80,60 L83,110 L80,160 L77,110 Z" fill="${P.c4}" opacity="0.6"/>
        <rect x="60" y="196" width="40" height="6" rx="2" fill="${P.c4}"/>
        <rect x="76" y="202" width="8" height="28" rx="2" fill="${P.c1}"/>
        <circle cx="80" cy="232" r="5" fill="${P.c4}"/>
        <circle cx="80" cy="120" r="3" fill="${P.glow}"><animate attributeName="r" values="3;5;3" dur="2.5s" repeatCount="indefinite"/></circle>`;
    } else if (form === "ghost") {
      body = `
        <path d="M80,72 Q54,92 56,150 Q58,206 80,230 Q102,206 104,150 Q106,92 80,72 Z" fill="${P.c2}" opacity="0.55"/>
        <path d="M80,86 Q62,104 64,150 Q66,196 80,218 Q94,196 96,150 Q98,104 80,86 Z" fill="${P.c3}" opacity="0.5"/>
        <circle cx="72" cy="138" r="4" fill="${P.glow}"/><circle cx="88" cy="138" r="4" fill="${P.glow}"/>
        <path d="M72,162 Q80,170 88,162" stroke="${P.c4}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    } else if (form === "beast") {
      body = `
        <ellipse cx="86" cy="158" rx="44" ry="22" fill="${P.c1}"/>
        <circle cx="46" cy="146" r="18" fill="${P.c1}"/>
        <path d="M34,132 L40,118 L46,130 Z" fill="${P.c1}"/><path d="M52,130 L58,116 L62,130 Z" fill="${P.c1}"/>
        <path d="M30,150 Q24,154 30,160 L36,154 Z" fill="${P.c1}"/>
        <rect x="60" y="176" width="7" height="20" rx="2" fill="${P.c1}"/><rect x="92" y="176" width="7" height="20" rx="2" fill="${P.c1}"/><rect x="108" y="176" width="7" height="20" rx="2" fill="${P.c1}"/><rect x="80" y="178" width="7" height="20" rx="2" fill="${P.c1}"/>
        <path d="M126,150 Q140,140 134,160 Q130,156 126,158 Z" fill="${P.c1}"/>
        <circle cx="40" cy="144" r="3" fill="${P.glow}"/><circle cx="52" cy="144" r="3" fill="${P.glow}"/>`;
    } else if (form === "elemental") {
      body = `
        <circle cx="80" cy="140" r="44" fill="${P.c2}" opacity="0.4" filter="url(#agGlow)"/>
        <circle cx="80" cy="140" r="28" fill="${P.c3}" opacity="0.85"/>
        <circle cx="80" cy="140" r="14" fill="${P.c4}"/>
        <circle cx="80" cy="140" r="50" fill="none" stroke="${P.c4}" stroke-width="1" opacity="0.35"><animate attributeName="r" values="44;54;44" dur="3s" repeatCount="indefinite"/></circle>
        <circle cx="80" cy="100" r="3" fill="${P.glow}"><animate attributeName="cy" values="100;96;100" dur="3s" repeatCount="indefinite"/></circle>
        <circle cx="120" cy="150" r="2.5" fill="${P.glow}"><animate attributeName="cx" values="120;124;120" dur="2.5s" repeatCount="indefinite"/></circle>
        <circle cx="42" cy="150" r="2.5" fill="${P.glow}"/><circle cx="80" cy="186" r="2.5" fill="${P.glow}"/>`;
    } else {
      return this.npc(spec);
    }
    return `<div class="artgen-portrait gender-${g} form-${form}"><svg class="ag-svg" viewBox="0 0 160 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${aura}${body}</svg></div>`;
  },

  // 程序化敌人立绘：依 cfg 配色 + feats 特征（horns/armor/aura/ghost/wisp/eyes3）画一只妖兽剪影
  enemySvg(cfg) {
    cfg = cfg || {};
    const body = cfg.body || "#4a3a30";
    const belly = cfg.belly || "#c9a878";
    const eye = cfg.eye || "#ffcf66";
    const c4 = cfg.c4 || "#ffffff";
    const feats = Array.isArray(cfg.feats) ? cfg.feats : [];
    const has = (x) => feats.indexOf(x) >= 0;
    const ghost = has("ghost") || has("wisp");
    const opacity = ghost ? 0.62 : 1;
    let extra = "";
    if (has("aura")) extra += `<ellipse cx="80" cy="120" rx="64" ry="58" fill="${c4}" opacity="0.14"/>`;
    if (has("horns")) extra += `<path d="M64,56 Q58,40 66,34 Q62,46 70,54 Z" fill="${body}"/><path d="M96,56 Q102,40 94,34 Q98,46 90,54 Z" fill="${body}"/>`;
    if (has("armor")) extra += `<path d="M52,96 Q80,108 108,96 L104,122 Q80,134 56,122 Z" fill="${c4}" opacity="0.5"/>`;
    if (has("eyes3")) extra += `<circle cx="80" cy="72" r="2.4" fill="${eye}"/>`;
    const tail = ghost
      ? `<path d="M118,150 Q140,138 132,170 Q124,154 118,158 Z" fill="${body}" opacity="${opacity}"/>`
      : `<path d="M118,150 Q138,142 132,166 Q126,154 118,158 Z" fill="${body}"/>`;
    return `<svg class="ag-svg ag-enemy" viewBox="0 0 160 200" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="150" rx="50" ry="26" fill="${body}" opacity="${opacity}"/>
      <ellipse cx="80" cy="160" rx="30" ry="14" fill="${belly}" opacity="${opacity}"/>
      <circle cx="52" cy="96" r="22" fill="${body}" opacity="${opacity}"/>
      <path d="M38,86 L44,68 L52,82 Z" fill="${body}" opacity="${opacity}"/>
      <path d="M62,82 L68,66 L74,82 Z" fill="${body}" opacity="${opacity}"/>
      <rect x="60" y="170" width="9" height="22" rx="2" fill="${body}" opacity="${opacity}"/><rect x="91" y="170" width="9" height="22" rx="2" fill="${body}" opacity="${opacity}"/><rect x="40" y="166" width="8" height="20" rx="2" fill="${body}" opacity="${opacity}"/><rect x="112" y="166" width="8" height="20" rx="2" fill="${body}" opacity="${opacity}"/>
      ${tail}
      <circle cx="46" cy="92" r="3.4" fill="${eye}"/><circle cx="60" cy="92" r="3.4" fill="${eye}"/>
      ${extra}
    </svg>`;
  },

    npc(spec) {
      const P = this.PALETTES[spec.pal % this.PALETTES.length];
      const g = (spec.gender === "f") ? "f" : "m";
      const hair = (g === "f" ? this.HAIR_F : this.HAIR_M)[spec.hair % 5](P);
      const body = this._body(P, g, spec.outfit % 5);
      const head = this._head(spec.face % 3, P, g);
      const feat = this._features(P, g);
      const acc = this.ACC[spec.acc % 5](P, g);
      const defs = this._defs(P);
      const aura = this._aura(P);
      return `<div class="artgen-portrait gender-${g}"><svg class="ag-svg" viewBox="0 0 160 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${defs}${aura}${body}${head}${hair}${feat}${acc}</svg></div>`;
    },
  };

const UI = {
  currentScreen: "menu", // menu | create | game | settings

  // ============ 页面切换 ============
  show(screen) {
    this.currentScreen = screen;
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
    document.getElementById("screen-" + screen).classList.add("active");

    if (screen !== "game") this.hideGuestBanner();
    if (screen === "menu") this.renderMenu();
    if (screen === "create") this.renderCreate();
    if (screen === "game") this.renderGame();
    if (screen === "settings") this.renderSettings();
  },

  // ============ 大地图 ============
  // 由世界种子渲染 SVG 大地图（宏观疆域框 + 地域节点 + 灵脉连线 + 当前位置标记）
  renderWorldMap() {
    const gen = (Game.state && Game.state.world && Game.state.world.gen) || null;
    const canvas = document.getElementById("map-canvas");
    const detail = document.getElementById("map-detail");
    const nameEl = document.getElementById("map-world-name");
    const omenEl = document.getElementById("map-omen");
    if (!canvas) return;
    if (!gen) {
      canvas.innerHTML = '<div style="color:var(--text-dim);padding:24px;text-align:center">此界尚未生成世界，请先创建角色。</div>';
      return;
    }
    // 兼容旧版存档（无地图坐标字段）：提示重开新局而非渲染 NaN
    if (!gen.regions[0] || typeof gen.regions[0].x !== "number") {
      canvas.innerHTML = '<div style="color:var(--text-dim);padding:24px;text-align:center">此界为旧版世界，暂无大地图。开启新局即可生成一方大世界。</div>';
      return;
    }
    if (nameEl) nameEl.textContent = gen.name;
    if (omenEl) omenEl.textContent = "天地异象 · " + gen.omen;
    if (detail) detail.innerHTML = '<div class="map-detail-empty">点选地图上的地域节点，查看其风土与凶险。</div>';

    const W = 1000, H = 680;
    const _locRaw = (Game.state.world && Game.state.world.location) || gen.startLocation;
    // 当前位置可能是"地域名"或"子地点名"：兼容子地点，定位其所属地域用于高亮
    const cur = gen.regions.some(r => r.name === _locRaw)
      ? _locRaw
      : (((gen.sublocations || []).find(s => s.name === _locRaw) || {}).region || gen.startLocation);

    const dangerColor = (d) => {
      if (d <= 1) return "#5fae6a";   // 凡俗/平和
      if (d <= 3) return "#4f9ec9";   // 荒野/坊市
      if (d <= 5) return "#e0a23c";   // 禁地
      if (d <= 8) return "#d65a5a";   // 秘境/试炼
      return "#b06bd6";               // 仙迹
    };

    // —— 确定性地形（山川河流）：同一世界每次渲染一致，不抖动 ——
    const mulberry32 = (a) => { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const seedNum = (typeof gen.seed === "number" ? gen.seed : hashStr(String(gen.seed || "xianxia"))) >>> 0;
    const rng = mulberry32(seedNum);
    const mountainLayer = (baseY, amp, step) => {
      let d = `M 0 ${baseY}`, x = 0;
      while (x < W) {
        const peak = baseY - amp * (0.45 + rng() * 0.55);
        const nx = x + step * (0.7 + rng() * 0.7);
        const midx = ((x + nx) / 2).toFixed(1);
        d += ` L ${nx.toFixed(1)} ${baseY} L ${midx} ${peak.toFixed(1)}`;
        x = nx;
      }
      return d + ` L ${W} ${baseY} L ${W} ${H} L 0 ${H} Z`;
    };
    const riverPath = (yBase, amp) => {
      let d = `M -20 ${yBase.toFixed(1)}`, x = -20, y = yBase;
      while (x < W + 20) {
        const nx = x + 80 + rng() * 70;
        const ny = yBase + Math.sin((x + seedNum) * 0.012) * amp + (rng() - 0.5) * 26;
        const cx = ((x + nx) / 2).toFixed(1), cy = ((y + ny) / 2 + (rng() - 0.5) * 20).toFixed(1);
        d += ` Q ${cx} ${cy} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
        x = nx; y = ny;
      }
      return d;
    };
    const mtnBack = mountainLayer(300, 120, 130);
    const mtnFront = mountainLayer(440, 150, 160);
    const river1 = riverPath(370 + rng() * 50, 46);
    const river2 = rng() > 0.45 ? riverPath(520 + rng() * 70, 54) : "";
    const seaBlob = `M 40 ${H - 24} Q 30 ${H - 150} 190 ${H - 160} Q 340 ${H - 170} 320 ${H - 50} Q 300 ${H - 22} 40 ${H - 24} Z`;
    let forest = "";
    const treeN = 16 + Math.floor(rng() * 12);
    for (let i = 0; i < treeN; i++) {
      const tx = 50 + rng() * (W - 100), ty = 400 + rng() * (H - 440);
      forest += `<g class="terr-tree" transform="translate(${tx.toFixed(0)} ${ty.toFixed(0)})">`
        + `<path class="terr-tree-1" d="M0 0 L-7 15 L7 15 Z"/>`
        + `<path class="terr-tree-2" d="M0 -9 L-5 4 L5 4 Z"/>`
        + `<rect class="terr-tree-trunk" x="-1.5" y="15" width="3" height="6"/></g>`;
    }
    let clouds = "";
    const cloudN = 3;
    for (let i = 0; i < cloudN; i++) {
      const cy = 40 + rng() * 170, rx = 42 + rng() * 26, rx2 = 26 + rng() * 18;
      const dur = 42 + rng() * 40, delay = -rng() * dur;
      clouds += `<g class="terr-cloud" style="--dur:${dur.toFixed(0)}s;--delay:${delay.toFixed(0)}s">`
        + `<ellipse cx="0" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${(rx * 0.38).toFixed(0)}"/>`
        + `<ellipse cx="${(rx * 0.7).toFixed(0)}" cy="${(cy + 9).toFixed(0)}" rx="${rx2.toFixed(0)}" ry="${(rx2 * 0.38).toFixed(0)}"/>`
        + `<ellipse cx="${(-rx * 0.6).toFixed(0)}" cy="${(cy + 7).toFixed(0)}" rx="${(rx2 * 0.8).toFixed(0)}" ry="${(rx2 * 0.38).toFixed(0)}"/></g>`;
    }

    // 1) 宏观疆域底框（按地域包围盒计算）
    const box = {};
    gen.regions.forEach(r => {
      const b = box[r.macro] || (box[r.macro] = { x0: r.x, y0: r.y, x1: r.x, y1: r.y });
      b.x0 = Math.min(b.x0, r.x); b.y0 = Math.min(b.y0, r.y);
      b.x1 = Math.max(b.x1, r.x); b.y1 = Math.max(b.y1, r.y);
    });
    const TYPE_GLYPH = { "凡俗":"凡", "宗门":"宗", "荒野":"荒", "坊市":"坊", "禁地":"禁", "秘境":"秘", "试炼":"试", "仙迹":"仙" };
    let zones = "";
    (gen.macroRegions || []).forEach(m => {
      const b = box[m.name]; if (!b) return;
      const x0 = b.x0 - 55, y0 = b.y0 - 45, x1 = b.x1 + 55, y1 = b.y1 + 45;
      const cx = (x0 + x1) / 2;
      zones += `<rect class="map-zone" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="16"></rect>`;
      zones += `<text class="map-zone-label" x="${cx}" y="${y0 + 24}" text-anchor="middle">${m.name}</text>`;
    });

    // 2) 灵脉连线（每个地域连最近的另一个地域）
    const pts = gen.regions;
    const links = [];
    for (let i = 0; i < pts.length; i++) {
      let best = -1, bd = 1e9;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = j; }
      }
      if (best >= 0) {
        const a = Math.min(i, best), b = Math.max(i, best);
        if (!links.some(l => l[0] === a && l[1] === b)) links.push([a, b]);
      }
    }
    let linkSvg = "";
    links.forEach(([a, b]) => {
      const mx = ((pts[a].x + pts[b].x) / 2 + (pts[a].y - pts[b].y) * 0.12).toFixed(1);
      const my = ((pts[a].y + pts[b].y) / 2 + (pts[b].x - pts[a].x) * 0.12).toFixed(1);
      linkSvg += `<path class="map-link" d="M ${pts[a].x} ${pts[a].y} Q ${mx} ${my} ${pts[b].x} ${pts[b].y}"></path>`;
    });

    // 3) 地域节点（域核：发光圆盘 + 类型篆字 + 当前位置脉冲 + 域内胜迹数）
    let nodes = "";
    pts.forEach((r, i) => {
      const isCur = r.name === cur;
      const rad = 12 + Math.min(7, r.danger);
      // 关卡设计：可选分支节点（秘境/试炼/支线）加高亮类，让玩家一眼看到"可玩支线"
      const isBranch = (r.branch === "secret" || r.branch === "trial" || r.branch === "sidequest");
      const branchCls = isBranch ? ("map-branch map-branch-" + r.branch) : "";
      const glyph = TYPE_GLYPH[r.type] || "·";
      const subN = (gen.sublocations || []).filter(s => s.region === r.name).length;
      nodes += `<g class="map-node ${isCur ? "map-current" : ""} ${branchCls}" data-i="${i}" data-branch="${r.branch || ""}" onclick="UI.showRegionDetail(${i})">
        <circle class="node-glow" cx="${r.x}" cy="${r.y}" r="${rad + 11}" fill="${dangerColor(r.danger)}"></circle>
        <circle class="node-core" cx="${r.x}" cy="${r.y}" r="${rad}" fill="${dangerColor(r.danger)}" stroke="rgba(255,255,255,0.75)" stroke-width="2"></circle>
        <text x="${r.x}" y="${r.y + 5}" text-anchor="middle" font-size="14" fill="#fff" style="pointer-events:none;font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,.6)">${glyph}</text>
        <text class="node-label" x="${r.x}" y="${r.y + rad + 15}" text-anchor="middle">${r.name}</text>
        ${subN ? `<text class="node-sub" x="${r.x}" y="${r.y + rad + 28}" text-anchor="middle">${subN} 处</text>` : ""}
      </g>`;
    });
    // 本周秘境节点（确定性生成，整周稳定，金色高亮，作"回访理由"）
    if (typeof WorldGen !== "undefined") {
      try {
        const wk = WorldGen.weeklySecretRealm(gen.seed);
        nodes += `<g class="map-node map-weekly" data-weekly="1" onclick="UI.showWeeklyDetail()">`
          + `<circle class="node-core" cx="${wk.x}" cy="${wk.y}" r="13" fill="#ffd24a" stroke="#7a4b00" stroke-width="2"></circle>`
          + `<text x="${wk.x}" y="${wk.y + 5}" text-anchor="middle" font-size="13" fill="#3a2400" style="pointer-events:none;font-weight:bold">秘</text>`
          + `<text class="node-label" x="${wk.x}" y="${wk.y + 29}" text-anchor="middle">${wk.name}</text>`
          + `</g>`;
      } catch (e) { /* 周秘生成失败不影响主图 */ }
    }
    // 当前位置脉冲环（半径随节点大小自适应，包裹"域核"）
    const curR = pts.find(r => r.name === cur);
    const ring = curR ? `<circle class="map-current-ring" cx="${curR.x}" cy="${curR.y}" r="${12 + Math.min(7, curR.danger) + 7}"></circle>` : "";

    canvas.innerHTML = `<div class="map-bg-layer"></div><svg class="world-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
      + `<defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop class="sky-top" offset="0"/><stop class="sky-bot" offset="1"/></linearGradient>`
      + `<linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0"><stop class="river-a" offset="0"/><stop class="river-b" offset="1"/></linearGradient></defs>`
      + `<rect class="terr-sky" x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,0)"/>`
      + `<path class="terr-sea" d="${seaBlob}" fill="rgba(0,0,0,0)"/>`
      + `<path class="terr-mtn terr-mtn-back" d="${mtnBack}" fill="rgba(0,0,0,0)"/>`
      + `<path class="terr-mtn terr-mtn-front" d="${mtnFront}" fill="rgba(0,0,0,0)"/>`
      + `<path class="terr-river" d="${river1}" fill="rgba(0,0,0,0)"/>` + (river2 ? `<path class="terr-river" d="${river2}" fill="rgba(0,0,0,0)"/>` : "")
      + `<path class="terr-river-flow" d="${river1}"/>` + (river2 ? `<path class="terr-river-flow" d="${river2}"/>` : "")
      + `<g class="terr-forest">${forest}</g>`
      + `<g class="terr-clouds">${clouds}</g>`
      + zones + linkSvg + nodes + ring
      + `</svg>`;
  },

  // 展示大地图；intro=true 时为开局预览（显示「踏入仙途」）
  showWorldMap(intro) {
    this.renderWorldMap();
    const screen = document.getElementById("screen-map");
    if (screen) screen.classList.toggle("map-intro", !!intro);
    this.show("map");
  },

  // 开局预览中「踏入仙途」→ 进入游戏并直接开始
  startGameFromMap() {
    this._skipOpeningHint = true;
    this.show("game");
    this.startGame();
    this._skipOpeningHint = false;
  },

  // 点选地域节点 → 详情面板
  showRegionDetail(i) {
    const gen = (Game.state && Game.state.world && Game.state.world.gen);
    if (!gen) return;
    const r = gen.regions[i];
    if (!r) return;
    document.querySelectorAll(".map-node").forEach(n => n.classList.remove("selected"));
    const node = document.querySelector('.map-node[data-i="' + i + '"]');
    if (node) node.classList.add("selected");
    const facs = (gen.factions || []).filter(f => f.base === r.name);
    const npcs = (gen.npcs || []).filter(n => n.where === r.name);
    const dt = ["", "平和", "微险", "凶险", "险峻", "险绝", "危厄", "凶煞", "绝命", "通天", "飞升"][Math.min(10, r.danger)] || ("凶险" + r.danger);
    let html = `<h3>${r.name}</h3>`;
    html += `<div class="md-macro">${r.macro} · <span class="md-type">${r.type}</span></div>`;
    html += `<div class="md-desc">${r.desc}</div>`;
    html += `<div class="md-row"><b>凶险程度：</b>${r.danger} / 10（${dt}）</div>`;
    if (facs.length) html += `<div class="md-row"><b>盘踞势力：</b>${facs.map(f => f.name).join("、")}</div>`;
    if (npcs.length) html += `<div class="md-row"><b>相关人物：</b>${npcs.map(n => n.name + "（" + n.title + "）").join("、")}</div>`;
    const subs = (gen.sublocations || []).filter(s => s.region === r.name);
    if (subs.length) {
      html += `<div class="md-row md-sub-title"><b>域内胜迹（${subs.length} 处 · 可前往）：</b></div>`;
      html += `<div class="md-subs">` + subs.map((s, k) => {
        const visited = (Game.state.world.visited || []).indexOf(s.id) >= 0;
        const dangerTag = s.danger >= 7 ? " · 绝险" : (s.danger >= 5 ? " · 凶" : "");
        return `<button class="md-sub-btn" onclick="UI.travelToSub(${i},${k})">${s.name}<span class="md-sub-d">${s.type}${dangerTag}</span>${visited ? '<span class="md-sub-v">✓已游</span>' : ''}</button>`;
      }).join("") + `</div>`;
    }
    const curRegion = gen.regions.some(x => x.name === Game.state.world.location)
      ? Game.state.world.location
      : ((gen.sublocations || []).find(s => s.name === Game.state.world.location) || {}).region || gen.startLocation;
    if (r.name === curRegion) html += `<div class="md-row" style="color:var(--gold-bright)">★ 你当前所在</div>`;
    const detail = document.getElementById("map-detail");
    if (detail) detail.innerHTML = html;
  },

  // 前往某地域的子地点（胜迹）：直接更新所在地点，记录游历，返回游戏
  travelToSub(regionIdx, subIdx) {
    const gen = (Game.state && Game.state.world && Game.state.world.gen);
    if (!gen) return;
    const r = gen.regions[regionIdx];
    if (!r) return;
    const subs = (gen.sublocations || []).filter(s => s.region === r.name);
    const sub = subs[subIdx];
    if (!sub) return;
    const w = Game.state.world;
    w.location = sub.name;
    w.subLocation = sub.id;
    w.locationRegion = r.name;
    w.visited = w.visited || [];
    if (w.visited.indexOf(sub.id) < 0) w.visited.push(sub.id);
    // 给一句系统提示，让玩家感知"已抵达"；renderHistory 会将其作为旁白渲染
    try { Game.log.push({ role: "system", text: "你循着地势，来到了【" + sub.name + "】——" + (sub.desc || "") }); } catch (e) {}
    this.show("game");
    // 自动触发一回合 AI，生成新地点的剧情与选项（否则玩家看到场景描述后无选项可点）
    setTimeout(() => { try { this.sendAction("环顾【" + sub.name + "】，探索此地的风物与机缘"); } catch(e){} }, 120);
  },

  // ============ 群像图鉴 ============
  // 用 ArtGen 程序化生成本世界所有具名 NPC 的立绘，证明"几百个妹子/人物立绘"可凭种子组合而成
  showCodex() {
    this.renderCodex();
    this.show("codex");
  },
  renderCodex() {
    const gen = (Game.state && Game.state.world && Game.state.world.gen);
    const wrap = document.getElementById("codex-grid");
    if (!wrap) return;
    if (!gen || !gen.npcs || !gen.npcs.length) {
      wrap.innerHTML = '<div class="codex-empty">此界尚未生成人物。</div>';
      return;
    }
    const cards = gen.npcs.map(n => {
      const spec = ArtGen.specFromSeed(n.portraitSeed || hashSeed(n.name), n.arche, n.gender);
      const portrait = ArtGen.npc(spec);
      const mem = (Game.state.npcMemory && Game.state.npcMemory[n.name]) || null;
      const notes = mem && mem.notes && mem.notes.length
        ? mem.notes.map(x => x.text).slice(-3).join("；")
        : (n.profile && n.profile.goal ? "所求：" + n.profile.goal : "尚未相交");
      return `<div class="codex-card">
        <div class="codex-portrait">${portrait}</div>
        <div class="codex-name">${UI.escapeHtml(n.name)}</div>
        <div class="codex-title">${UI.escapeHtml(n.title)}·${UI.escapeHtml(n.trait)}</div>
        <div class="codex-where">常现于 ${UI.escapeHtml(n.where)}</div>
        <div class="codex-note">${UI.escapeHtml(notes)}</div>
      </div>`;
    }).join("");
    wrap.innerHTML = cards;
    if (gen && gen.npcs) {
      wrap.querySelectorAll(".codex-portrait").forEach((cell, i) => {
        const n = gen.npcs[i];
        const spec = this._npcSpec(n);
        if (spec) ArtEngine.upgrade(cell, spec);
      });
    }
    const count = document.getElementById("codex-count");
    if (count) count.textContent = gen.npcs.length + " 位";
  },

  // ============ 主菜单 ============
  renderMenu() {
    const hasSave = Game.hasSave();
    document.getElementById("btn-continue").style.display = hasSave ? "" : "none";
  },

  startNewGame() {
    if (Game.hasSave()) {
      if (!confirm("已有存档，开始新游戏将覆盖当前存档。确定继续吗？")) return;
    }
    this.show("create");
  },

  confirmReincarnate() {
    if (!Game.state) return;
    if (!confirm("生命诚可贵，真要从头再来？")) return;
    Game.reincarnate();
  },

  // ============ 角色创建 ============
  renderCreate() {
    // 灵根选项
    const rootBox = document.getElementById("root-options");
    rootBox.innerHTML = "";
    SPIRITUAL_ROOTS.forEach((r, i) => {
      const card = document.createElement("div");
      card.className = "select-card";
      card.innerHTML = `
        <div class="card-title">${r.name}${r.rare ? ' <span class="rare-tag">异灵根</span>' : ""}</div>
        <div class="card-desc">${r.desc}</div>
        <div class="card-stat">攻×${r.affinity.攻击} 守×${r.affinity.防御} 修×${r.affinity.修炼}</div>`;
      card.onclick = () => {
        document.querySelectorAll("#root-options .select-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        document.getElementById("selected-root").value = i;
      };
      rootBox.appendChild(card);
      if (i === 0) { card.classList.add("selected"); document.getElementById("selected-root").value = 0; }
    });

    // 出身选项
    const bgBox = document.getElementById("bg-options");
    bgBox.innerHTML = "";
    BACKGROUNDS.forEach((b, i) => {
      const card = document.createElement("div");
      card.className = "select-card";
      card.innerHTML = `
        <div class="card-title">${b.name}</div>
        <div class="card-desc">${b.desc}</div>
        <div class="card-stat">起始：${b.bonus.灵石||0}灵石 · ${b.bonus.功法} · 悟性${b.bonus.悟性||6}</div>`;
      card.onclick = () => {
        document.querySelectorAll("#bg-options .select-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        document.getElementById("selected-bg").value = i;
      };
      bgBox.appendChild(card);
      if (i === 0) { card.classList.add("selected"); document.getElementById("selected-bg").value = 0; }
    });

    // 性别选项
    const genderBox = document.getElementById("gender-options");
    genderBox.innerHTML = "";
    GENDERS.forEach((g, i) => {
      const card = document.createElement("div");
      card.className = "select-card" + (g.joke ? " select-card-joke" : "");
      card.innerHTML = `
        <div class="card-title">${g.name}${g.joke ? ' <span class="rare-tag">？？</span>' : ""}</div>
        <div class="card-desc">${g.desc}</div>`;
      card.onclick = () => {
        document.querySelectorAll("#gender-options .select-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        document.getElementById("selected-gender").value = i;
      };
      genderBox.appendChild(card);
      if (i === 0) { card.classList.add("selected"); document.getElementById("selected-gender").value = 0; }
    });

    // 叙事节奏（篇幅档位）：三选一
    const modeBox = document.getElementById("narration-mode-options");
    if (modeBox) {
      modeBox.innerHTML = "";
      const curMode = document.getElementById("selected-narrative-mode").value || "standard";
      NARRATIVE_MODES.forEach((m) => {
        const card = document.createElement("div");
        card.className = "select-card";
        card.innerHTML = `
          <div class="card-title">${m.label}</div>
          <div class="card-desc">${m.desc}</div>`;
        card.onclick = () => {
          document.querySelectorAll("#narration-mode-options .select-card").forEach(c => c.classList.remove("selected"));
          card.classList.add("selected");
          document.getElementById("selected-narrative-mode").value = m.key;
        };
        modeBox.appendChild(card);
        if (m.key === curMode) { card.classList.add("selected"); document.getElementById("selected-narrative-mode").value = m.key; }
      });
    }
  },

  confirmCreate() {
    const name = document.getElementById("char-name").value.trim();
    const rootIndex = parseInt(document.getElementById("selected-root").value);
    const bgIndex = parseInt(document.getElementById("selected-bg").value);
    const genderIndex = parseInt(document.getElementById("selected-gender").value);
    if (!name) { alert("请为你的修士取一个道号"); return; }
    // 世界种子功能已下架：内部随机生成一方天地（玩家不可见、不可控）
    const seed = WorldGen.randomSeed();
    const modeInput = document.getElementById("selected-narrative-mode");
    const modeKey = modeInput ? modeInput.value : "standard";
    Game.createCharacter(name, rootIndex, bgIndex, genderIndex, seed, modeKey);
    this.showWorldMap(true); // 开局先生成并展示大地图
  },

  // ============ 诸天万界·两按钮入口 ============
  startDirectPlay() {
    if (Game.hasSave()) {
      if (!confirm("已有仙途，开启新的一道投影将另起炉灶（旧投影归入神魂册）。确定？")) return;
    }
    Game.newProjection({});
    this.showWorldMap(true);
  },

  // 游客离线试玩：无需任何 API Key，零摩擦感受玩法循环
  startGuestPlay() {
    Game.newProjection({ guest: true, name: "试剑客", rootIndex: 0, bgIndex: 0, genderIndex: 0, seed: "guest-demo", narrationMode: "standard" });
    this.show("game");
    this.renderGame();
    this.showGuestBanner();
    this.startGame(); // 复用开局发送逻辑；processAction 在游客模式下走本地脚本
  },

  // 游客模式顶部提示条：配置 Key 即可解锁完整 AI 演绎
  showGuestBanner() {
    let banner = document.getElementById("guest-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "guest-banner";
      banner.className = "guest-banner";
      const stage = document.querySelector(".vn-stage");
      if (stage) stage.insertBefore(banner, stage.firstChild);
    }
    banner.innerHTML = `🎭 游客试玩中（本地脚本剧情）· <a href="javascript:void(0)" onclick="UI.show('settings')">配置 API Key</a> 即解锁 AI 实时演绎的完整仙途`;
    banner.style.display = "";
  },
  hideGuestBanner() {
    const banner = document.getElementById("guest-banner");
    if (banner) banner.style.display = "none";
  },

  openWish() {
    const modal = document.getElementById("wish-modal");
    if (modal) modal.style.display = "flex";
    const ta = document.getElementById("wish-input");
    if (ta) { ta.value = ""; ta.focus(); }
  },

  closeWish() {
    const modal = document.getElementById("wish-modal");
    if (modal) modal.style.display = "none";
  },

  submitWish() {
    const ta = document.getElementById("wish-input");
    const wish = (ta && ta.value || "").trim();
    this.closeWish();
    if (Game.hasSave()) {
      if (!confirm("已有仙途，许愿将开启新的一道投影（旧投影归入神魂册）。确定？")) return;
    }
    // 从许愿文本粗略推断性别（任意形态/性别皆可，推断不到则随机）
    let genderIndex = null;
    if (wish) {
      if (/女|她|姐|妹|妻|姬|妃/.test(wish)) genderIndex = 1;
      else if (/男|他|哥|弟|夫|君|郎/.test(wish)) genderIndex = 0;
    }
    // 从许愿文本解析"魂穿形态"（我是一棵树 → 树精；我是一头妖狼 → 妖兽……）
    const form = Game.parseForm(wish);
    Game.newProjection({ wish: wish || null, genderIndex: genderIndex, form: form });
    const sysName = (Game.state.world && Game.state.world.cultivationSystemName) || "灵根";
    const formName = (Game.state.character && Game.state.character.formName) || "人族";
    this.flashToast(`本相·${formName}　命中之界 · 修炼体系：${sysName}`);
    this.showWorldMap(true);
  },

  // ============ 神魂册 ============
  showSoul() {
    this.renderSoul();
    this.show("soul");
  },
  renderSoul() {
    const reg = (Game._ensureSoulRegistry ? Game._ensureSoulRegistry() : []);
    const body = document.getElementById("soul-body");
    if (!body) return;
    if (!reg.length) {
      body.innerHTML = '<div class="soul-empty">神魂册尚空。开启一道投影，履历自此累加。</div>';
      return;
    }
    const cards = reg.slice().reverse().map((e) => {
      const fallen = e.status === "fallen";
      const tag = fallen
        ? `<span class="soul-tag soul-tag-fallen">已陨落 · ${e.realmReached || 1} 境</span>`
        : `<span class="soul-tag soul-tag-active">轮回中 · 第 ${e.turn || 0} 程</span>`;
      const wishLine = e.wish ? `<div class="soul-wish">许愿：${this.escapeHtml(e.wish)}</div>` : "";
      const causeLine = fallen && e.cause ? `<div class="soul-cause">${this.escapeHtml(e.cause)}</div>` : "";
      const achLine = (e.achievements && e.achievements.length)
        ? `<div class="soul-ach">${e.achievements.map(a => `<span class="soul-ach-chip">${this.escapeHtml(a)}</span>`).join("")}</div>`
        : "";
      return `<div class="soul-card ${fallen ? "soul-card-fallen" : "soul-card-active"}">
        <div class="soul-world">${this.escapeHtml(e.worldName || "未知界")}</div>
        <div class="soul-meta">灵力 ${e.spirit != null ? e.spirit : "?"} · 上限 ${e.realmCapLevel != null ? e.realmCapLevel : "?"} 境 · ${this.escapeHtml(e.form || "人")}·${this.escapeHtml(e.genderName || "")} · 因果力 ${e.causeCredit || 0}</div>
        ${wishLine}
        ${tag}
        ${causeLine}
        ${achLine}
      </div>`;
    }).join("");
    body.innerHTML = cards;
  },

  showRank() {
    this.renderRank();
    this.show("rank");
  },
  renderRank() {
    const reg = (Game.getSoulRankings ? Game.getSoulRankings() : { byCause: [], byDuration: [] });
    const body = document.getElementById("rank-body");
    if (!body) return;
    const esc = (t) => this.escapeHtml(t || "");
    const card = (e, rank, metric, metricLabel) => {
      const fallen = e.status === "fallen";
      return `<div class="rank-card ${fallen ? "rank-card-fallen" : "rank-card-active"}">
        <div class="rank-no">${rank}</div>
        <div class="rank-main">
          <div class="rank-world">${esc(e.worldName)}</div>
          <div class="rank-meta">${e.realmCapLevel != null ? e.realmCapLevel + "境" : "?"} · ${esc(e.form || "人")}·${esc(e.genderName)} · 第 ${e.turn || 0} 程${e.wish ? " · 愿：" + esc(e.wish) : ""}</div>
        </div>
        <div class="rank-metric">${metric}<span class="rank-metric-label">${metricLabel}</span></div>
      </div>`;
    };
    const causeHtml = reg.byCause.length
      ? reg.byCause.map((e, i) => card(e, i + 1, (e.causeCredit || 0), "因果力")).join("")
      : '<div class="soul-empty">尚无投影履历，开启一道投影即可登榜。</div>';
    const durHtml = reg.byDuration.length
      ? reg.byDuration.map((e, i) => card(e, i + 1, e.durLabel, "修道时长")).join("")
      : '<div class="soul-empty">尚无投影履历。</div>';
    body.innerHTML = `<div class="rank-section-title">⚖ 因果力榜（本机）</div><div class="rank-list">${causeHtml}</div>`
      + `<div class="rank-section-title">⏳ 修道时长榜（本机）</div><div class="rank-list">${durHtml}</div>`
      + `<div class="rank-note">＊本机榜按神魂册履历排名。跨玩家因果力总榜需服务端支撑，当前为本地占位。</div>`;
  },
  flashToast(msg) {
    const d = document.createElement("div");
    d.className = "game-toast";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => { d.classList.add("game-toast-show"); }, 10);
    setTimeout(() => { d.classList.remove("game-toast-show"); setTimeout(() => d.remove(), 400); }, 2600);
  },

  // ============ 世界湮灭 → 重投诸天 ============
  enterReincarnation(cause) {
    const oldName = Game._worldDestroyedOldName;
    const storyEl = document.getElementById("story-text");
    if (storyEl) {
      const inheritNote = (Game._inheritedCredit > 0) ? `<br>承前世因果力 ${Game._inheritedCredit}，化作此身底蕴——最佳投影之资，悄然累积。` : "";
      storyEl.innerHTML += `<div class="world-destroyed">${this.escapeHtml(cause)}<br>${oldName ? "「" + this.escapeHtml(oldName) + "」" : "此界"}自此湮灭，你的一道投影归于轮回……神魂再投诸天万界，新的仙途已然铺开。${inheritNote}</div>`;
      storyEl.scrollTop = storyEl.scrollHeight;
      Game._inheritedCredit = 0;
    }
    setTimeout(() => {
      this.showWorldMap(true);
      if (this.toastWorldReborn) this.toastWorldReborn();
    }, 2800);
  },

  // ============ 随机生成 ============
  randomName() {
    const surnames = ["云", "风", "墨", "苏", "叶", "楚", "凌", "白", "洛", "沈", "顾", "萧", "陆", "谢", "秦", "慕容", "上官", "司徒"];
    const names = ["无尘", "清虚", "凌霄", "听雪", "忘机", "逸尘", "长歌", "惊鸿", "若虚", "玄机", "问天", "星辰", "沧海", "清风", "问情", "逍遥", "破军", "贪狼"];
    const extras = ["子", "之", "道", "玄", "真", "羽", "尘", "渊"];
    const s = surnames[Math.floor(Math.random() * surnames.length)];
    const n = names[Math.floor(Math.random() * names.length)];
    const name = (Math.random() < 0.4)
      ? s + n + extras[Math.floor(Math.random() * extras.length)]
      : s + n;
    document.getElementById("char-name").value = name;
    return name;
  },

  randomizeCharacter() {
    // 随机灵根
    const rootIdx = Math.floor(Math.random() * SPIRITUAL_ROOTS.length);
    document.getElementById("selected-root").value = rootIdx;
    document.querySelectorAll("#root-options .select-card").forEach((c, i) => {
      c.classList.toggle("selected", i === rootIdx);
    });
    // 随机出身
    const bgIdx = Math.floor(Math.random() * BACKGROUNDS.length);
    document.getElementById("selected-bg").value = bgIdx;
    document.querySelectorAll("#bg-options .select-card").forEach((c, i) => {
      c.classList.toggle("selected", i === bgIdx);
    });
    // 随机性别（全随机不含购物袋彩蛋，保持角色合理）
    const genderIdx = Math.floor(Math.random() * (GENDERS.length - 1));
    document.getElementById("selected-gender").value = genderIdx;
    document.querySelectorAll("#gender-options .select-card").forEach((c, i) => {
      c.classList.toggle("selected", i === genderIdx);
    });
    // 随机叙事节奏档位
    const modeKeys = NARRATIVE_MODES.map(m => m.key);
    const modeIdx = Math.floor(Math.random() * modeKeys.length);
    const mKey = modeKeys[modeIdx];
    const mInput = document.getElementById("selected-narrative-mode");
    if (mInput) mInput.value = mKey;
    document.querySelectorAll("#narration-mode-options .select-card").forEach((c, i) => {
      c.classList.toggle("selected", modeKeys[i] === mKey);
    });
    // 随机道号
    this.randomName();
  },

  // ============ 游戏主界面 ============
  renderGame() {
    if (!Game.state) {
      if (!Game.load()) { this.show("menu"); return; }
    }
    this.renderStatus();
    this.renderInventory();
    this.renderMobileBar();
    this.renderMobileDrawer();
    this.initVnStage();
    if (Game.log.length === 0) {
      if (!this._skipOpeningHint) {
        // 显示开局引导
        const storyEl = document.getElementById("story-text");
        storyEl.innerHTML = `<div class="opening-hint">
          <p>道友，你的仙途即将开启。</p>
          <p>下方输入你的行动，或点击下方建议选项。AI将根据你的选择演绎独一无二的修仙故事。</p>
          <button class="btn btn-primary" onclick="UI.startGame()">踏入仙途</button>
        </div>`;
      }
      // 若经大地图预览(_skipOpeningHint)进入，则留空等待 startGame 填充
    } else {
      this.renderHistory();
    }
    // 确保滚动到底部（刚从 display:none 切换过来时需要等布局完成）
    this.scrollToBottom();
    this.initMobileKeyboardHandler();
  },

  // 移动端：若对话框是 fixed 吸底，则键盘弹起时抬升；flex 布局下无需处理
  initMobileKeyboardHandler() {
    if (this._mobileKbBound) return;
    this._mobileKbBound = true;
    const input = document.getElementById("action-input");
    if (!input) return;
    const dialogue = document.getElementById("vn-dialogue");
    const isFixed = () => dialogue && window.getComputedStyle(dialogue).position === "fixed";
    const applyKb = () => {
      if (!window.visualViewport || !dialogue || !isFixed()) return;
      const kbTop = window.visualViewport.height; // 视口高度（已排除键盘）
      const winH = window.innerHeight;
      const overlap = Math.max(0, winH - kbTop); // 键盘占用的高度
      dialogue.style.bottom = overlap > 0 ? overlap + "px" : "0px";
    };
    input.addEventListener("focus", () => {
      setTimeout(applyKb, 300);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", applyKb);
    });
    input.addEventListener("blur", () => {
      if (dialogue && isFixed()) dialogue.style.bottom = "0px";
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", applyKb);
    });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === input) applyKb();
    });
  },

  // 滚动剧情区到底部（延迟到下一帧，确保布局已完成）
  scrollToBottom() {
    const storyEl = document.getElementById("story-text");
    if (!storyEl) return;
    const scrollNow = () => { storyEl.scrollTop = storyEl.scrollHeight; };
    scrollNow();
    requestAnimationFrame(() => { scrollNow(); requestAnimationFrame(scrollNow); });
  },

  renderStatus() {
    const c = Game.state.character;
    const w = Game.state.world;
    document.getElementById("status-panel").innerHTML = `
      <div class="char-name">${c.name}</div>
      <div class="char-root">${c.formName || "人族"} · ${(c.genderName || (GENDERS.find(g => g.id === c.gender) || {}).name || "修士")} · ${(c.cultivationSystem || "灵根")}·${c.root}</div>
      <div class="stat-row"><span>境界</span><span class="stat-val">${c.realm}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${c.realmProgress}%"></div></div>
      <div class="stat-row"><span>灵力</span><span class="stat-val">${c.qi}/${c.maxQi}</span></div>
      <div class="stat-row"><span>生命</span><span class="stat-val">${c.hp}/${c.maxHp}</span></div>
      <div class="stat-row"><span>灵石</span><span class="stat-val">${c.spiritualStones}</span></div>
      <div class="stat-row"><span>寿元</span><span class="stat-val">${c.lifespan}/${c.maxLifespan}年</span></div>
      <div class="stat-row"><span>悟性</span><span class="stat-val">${c.comprehension}</span></div>
      <div class="stat-row"><span>声望</span><span class="stat-val">${c.reputation >= 0 ? "+" : ""}${c.reputation}</span></div>
      <div class="stat-row"><span>正义</span><span class="stat-val justice-val">${c.justice}</span></div>
      <div class="stat-row"><span>邪恶</span><span class="stat-val evil-val">${c.evil}</span></div>
      ${(() => {
        const j = c.justice || 0, e = c.evil || 0;
        let label = "中立";
        if (j - e >= 20) label = "侠义";
        else if (e - j >= 20) label = "魔道";
        else if (j >= 10 && e >= 10) label = "亦正亦邪";
        return `<div class="stat-row"><span>正邪</span><span class="stat-val">${label}</span></div>`;
      })()}
      <div class="stat-row"><span>因果力</span><span class="stat-val cause-credit-val">${c.causeCredit || 0}</span></div>
      <div class="stat-row"><span>因果债</span><span class="stat-val cause-debt-val">${c.causeDebt || 0}</span></div>
      <hr class="divider">
      <div class="stat-row"><span>所在</span><span class="stat-val">${w.location}</span></div>
      <div class="stat-row"><span>时辰</span><span class="stat-val">${w.timeOfDay} · 第${w.day}日</span></div>
      <div class="stat-row"><span>天候</span><span class="stat-val">${w.weather.name}</span></div>
      <hr class="divider">
      <div class="stat-row pet-row"><span>灵宠</span><span class="stat-val">${c.pet ? c.pet.name + " · " + (c.pet.type || "灵兽") : "暂无"}</span></div>
      <hr class="divider">
      <div class="npc-title">人物好感</div>
      ${(() => {
        const npcs = Game.state.npcs || {};
        const names = Object.keys(npcs).filter(n => npcs[n].met === true);
        if (names.length === 0) return '<div class="npc-empty">尚无相交之人</div>';
        const sorted = names.slice().sort((a, b) => (npcs[b].affinity || 0) - (npcs[a].affinity || 0));
        return sorted.map(name => {
          const n = npcs[name];
          const a = n.affinity || 0;
          let senti = "中立";
          if (a >= 60) senti = "生死之交";
          else if (a >= 30) senti = "亲近";
          else if (a >= 10) senti = "友善";
          else if (a > -10) senti = "中立";
          else if (a > -30) senti = "疏远";
          else if (a > -60) senti = "忌惮";
          else senti = "敌对";
          const cls = a >= 10 ? "pos" : (a <= -10 ? "neg" : "neu");
          return `<div class="npc-row"><span class="npc-name">${UI.escapeHtml(name)}</span><span class="npc-senti ${cls}">${senti} ${a > 0 ? "+" : ""}${a}</span></div>`;
        }).join("");
      })()}
      <hr class="divider">
      <div class="stat-row"><span>仙程</span><span class="stat-val">第 ${Game.state.meta.playTurn} 程</span></div>
      <div class="stat-row"><span>篇章</span><span class="stat-val">${Game.getPacing(Game.state.meta.playTurn).phaseName}</span></div>
      ${(() => {
        const _mp = Game.state.meta && Game.state.meta.mainPlot;
        if (!_mp || !_mp.title) return "";
        const _rl = (Game.state.character.realmLevel || 1);
        const _total = (_mp.beats && _mp.beats.length) || 10;
        const _bi = Math.max(0, Math.min(_total - 1, _rl - 1));
        return `<div class="stat-row"><span>主线</span><span class="stat-val mp-stat">${_mp.title} · 第${_bi + 1}拍${_mp.resolved ? " ✦" : ""}</span></div>`;
      })()}
        ${(() => {
        const pw = (window.GAME_CONFIG && window.GAME_CONFIG.paywall) || {};
        return (pw.enabled && Game.state.meta.playTurn > (pw.freeTurns || 30))
          ? `<div class="stat-row paywall-hint"><span>仙缘</span><span class="stat-val">将尽 · 续缘解锁</span></div>`
          : "";
      })()}`;
    this.updateRealmScene();
    this.updateHeroSprite();
    this.updateActorSprite();
    this.updateActBanner();
  },

  // 境界场景：依当前境界生成像素风 SVG 场景（10 套配色）
  buildRealmSceneSVG(rl, realm) {
    rl = Math.max(1, Math.min(10, rl || 1));
    const P = [
      { sky:["#243b55","#6a5230","#caa15a"], mtn:"#3c5a3f", mtn2:"#2c4630", body:"#ffe6a0", night:false },
      { sky:["#1f3a5f","#3a6ea5","#a9cfe0"], mtn:"#2e5d6b", mtn2:"#1f4750", body:"#fff3c4", night:false },
      { sky:["#4a2f5f","#b5654a","#e0a85a"], mtn:"#5a3a5f", mtn2:"#3f2947", body:"#ffd27f", night:false },
      { sky:["#10243a","#1b3a4a","#2e5a55"], mtn:"#1f5a45", mtn2:"#143f33", body:"#cfeede", night:true },
      { sky:["#161a3a","#2a2f5f","#3a4a7a"], mtn:"#232a5a", mtn2:"#171d40", body:"#dfe6ff", night:true },
      { sky:["#0e1430","#1c2a55","#2a3f70"], mtn:"#1a2a55", mtn2:"#111d40", body:"#cdd8ff", night:true },
      { sky:["#241038","#3a1f5f","#5a3a7a"], mtn:"#3a1f5f", mtn2:"#281445", body:"#f0c0ff", night:true },
      { sky:["#0a0e1f","#1a2240","#2a355f"], mtn:"#2a355f", mtn2:"#18203c", body:"#f5f7ff", night:true },
      { sky:["#1a1622","#2e2638","#4a3a55"], mtn:"#2e2638", mtn2:"#1f1a28", body:"#ffffff", night:true, storm:true },
      { sky:["#2a2440","#6a5a8a","#d8c8ff"], mtn:"#b8a8e0", mtn2:"#8a7ab8", body:"#ffffff", night:false, radiant:true }
    ];
    const p = P[rl - 1];
    const W = 160, H = 60, U = 4;
    const mulberry = (a) => { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const pixelCircle = (cx, cy, r, color) => {
      let out = "";
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) out += `<rect x="${cx + x * U}" y="${cy + y * U}" width="${U}" height="${U}" fill="${color}"/>`;
      }
      return out;
    };
    const ridge = (baseY, amp, seed, color) => {
      const r = mulberry(seed); let out = ""; let x = 0;
      while (x < W) {
        const h = amp * (0.4 + 0.6 * r());
        const y = Math.round(baseY - h);
        out += `<rect x="${x}" y="${y}" width="8" height="${H - y}" fill="${color}"/>`;
        x += 8;
      }
      return out;
    };
    let s = `<svg class="realm-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="100%" height="78" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">`;
    s += `<rect width="${W}" height="${H}" fill="${p.sky[0]}"/>`;
    s += `<rect y="${Math.round(H * 0.45)}" width="${W}" height="${Math.round(H * 0.30)}" fill="${p.sky[1]}"/>`;
    s += `<rect y="${Math.round(H * 0.75)}" width="${W}" height="${Math.round(H * 0.25)}" fill="${p.sky[2]}"/>`;
    if (p.night) {
      const r = mulberry(rl * 131 + 7);
      for (let i = 0; i < 28; i++) {
        const x = Math.floor(r() * W), y = Math.floor(r() * H * 0.5);
        s += `<rect class="rs-star" x="${x}" y="${y}" width="2" height="2" fill="#ffffff" opacity="0.85" style="animation-delay:${(Math.random()*2).toFixed(2)}s;animation-duration:${(1.4+Math.random()*2).toFixed(2)}s"/>`;
      }
    }
    s += '<g class="rs-celestial">' + pixelCircle(W - 26, 16, 3, p.body) + '</g>';
    if (p.storm) {
      s += `<polygon class="rs-bolt" points="70,0 78,18 72,18 82,40 64,18 70,18" fill="#fff7c0" opacity="0.9"/>`;
    }
    s += ridge(H * 0.60, 14, rl * 31 + 3, p.mtn2);
    s += ridge(H * 0.72, 12, rl * 17 + 9, p.mtn);
    s += `<rect y="${H - 4}" width="${W}" height="4" fill="${p.mtn}"/>`;
    s += `</svg>`;
    const label = realm ? `<div class="realm-label"><span class="realm-name">${realm}</span><span class="realm-stage">第 ${rl} 大境</span></div>` : "";
    return s + label;
  },

  // 境界场景：改为像素场景图（视觉小说式背景），无图时渐变兜底
  updateRealmScene() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("realm-scene");
    if (!el || !Game.state || !Game.state.character) return;
    const rl = Game.state.character.realmLevel || 1;
    if (!this.currentScene || !SCENE_LIB[this.currentScene]) this.currentScene = this.sceneForRealm(rl);
    this.applyScene(el, this.currentScene);
  },

  sceneForRealm(rl) {
    return REALM_SCENE[rl] || REALM_SCENE[1];
  },

  // 把场景图写入背景层；图缺失则退化到 .no-scene 渐变
  applyScene(el, slug) {
    const lib = SCENE_LIB[slug] || SCENE_LIB[this.sceneForRealm(1)];
    const rl = (Game.state && Game.state.character && Game.state.character.realmLevel) || 1;
    const realm = (Game.state && Game.state.character && Game.state.character.realm) || "";
    const url = "assets/" + lib.file;
    el.style.backgroundImage = `url("${url}")`;
    el.classList.remove("no-scene");
    if (!this._sceneOk) this._sceneOk = {};
    if (this._sceneOk[slug] === undefined) {
      const img = new Image();
      img.onload = () => { this._sceneOk[slug] = true; };
      img.onerror = () => { this._sceneOk[slug] = false; el.style.backgroundImage = ""; el.classList.add("no-scene"); };
      img.src = url;
    } else if (this._sceneOk[slug] === false) {
      el.style.backgroundImage = ""; el.classList.add("no-scene");
    }
    el.innerHTML = `<div class="realm-label"><span class="realm-name">${this.escapeHtml(lib.name)}</span>` +
      `<span class="realm-stage">${this.escapeHtml(realm)} · 第${rl}/10拍</span></div>`;
    this.updateVnToggleScene();
  },

  // 由 AI 显式切换场景（state_changes.scene）
  setScene(slug) {
    if (!SCENE_LIB[slug]) return;
    this.currentScene = slug;
    const el = document.getElementById("realm-scene");
    if (el) this.applyScene(el, slug);
  },

  // 境界场景粒子（绝对定位于场景内，按境界切换飘落/升腾/漂移/闪烁）
  buildRealmFx(el, rl) {
    if (typeof document === "undefined") return;
    const old = el.querySelector(".realm-fx");
    if (old) old.remove();
    const cfg = ({
      1:  { n: 10, cls: "drift",   color: "#caa86a" }, // 炼气·凡尘浮尘
      2:  { n: 9,  cls: "rise",    color: "#5fcf9b" }, // 筑基·灵气升腾
      3:  { n: 10, cls: "fall",    color: "#e0b64c" }, // 金丹·黄昏落叶
      4:  { n: 8,  cls: "rise",    color: "#dfe6ff" }, // 元婴·月华上浮
      5:  { n: 9,  cls: "drift",   color: "#b48acb" }, // 化神·星雾流移
      6:  { n: 9,  cls: "drift",   color: "#7ee0c8" }, // 炼虚·极光漂移
      7:  { n: 10, cls: "rise",    color: "#e9a6c4" }, // 合体·花瓣飞升
      8:  { n: 12, cls: "twinkle", color: "#ffd86b" }, // 大乘·金芒闪烁
      9:  { n: 14, cls: "fall",    color: "#9cc6ff" }, // 渡劫·落雨
      10: { n: 12, cls: "rise",    color: "#fff3d0" }  // 飞升·光焰上腾
    })[rl] || { n: 8, cls: "drift", color: "#caa86a" };
    const fx = document.createElement("div");
    fx.className = "realm-fx";
    for (let i = 0; i < cfg.n; i++) {
      const p = document.createElement("div");
      p.className = "p " + cfg.cls;
      const sz = 2 + Math.floor(Math.random() * 3);
      p.style.left = (Math.random() * 100).toFixed(2) + "%";
      p.style.top = (Math.random() * 60).toFixed(2) + "%";
      p.style.width = sz + "px";
      p.style.height = sz + "px";
      p.style.background = cfg.color;
      p.style.boxShadow = "0 0 " + (sz + 2) + "px " + cfg.color;
      p.style.opacity = "0";
      p.style.animationDuration = (1.6 + Math.random() * 2.2).toFixed(2) + "s";
      p.style.animationDelay = (Math.random() * 2.4).toFixed(2) + "s";
      fx.appendChild(p);
    }
    el.appendChild(fx);
  },

  // 全局灵气粒子层（屏幕底部缓缓上浮，仅像素风生成）
  initPixelFx() {
    if (typeof document === "undefined") return;
    let layer = document.getElementById("fx-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "fx-layer";
      document.body.appendChild(layer);
    }
    layer.innerHTML = "";
    if (!document.body.classList.contains("pixel")) return;
    const N = 16;
    for (let i = 0; i < N; i++) {
      const q = document.createElement("div");
      q.className = "qi";
      q.style.left = (Math.random() * 100).toFixed(2) + "%";
      const sz = 2 + Math.floor(Math.random() * 3);
      q.style.width = sz + "px";
      q.style.height = sz + "px";
      q.style.setProperty("--drift", (Math.random() * 40 - 20).toFixed(0) + "px");
      q.style.animationDuration = (9 + Math.random() * 10).toFixed(1) + "s";
      q.style.animationDelay = (Math.random() * 12).toFixed(1) + "s";
      const hue = Math.random() < 0.5 ? "#5fcf9b" : "#e0b64c";
      q.style.background = hue;
      q.style.boxShadow = "0 0 5px " + hue;
      layer.appendChild(q);
    }
  },

  // ============ 角色立绘 & 战斗动画 ============
  // 更新左侧主角立绘（按性别切换）
  // 修炼体系 → 立绘配色 class（让不同体系的修士一眼不同）
  _systemClass() {
    const s = (Game.state && Game.state.world && Game.state.world.cultivationSystem) || "";
    const map = { lingen: "sys-lingen", xuema: "sys-xuema", mingge: "sys-mingge", daozhong: "sys-daozhong", yuansu: "sys-yuansu", lingshu: "sys-lingshu", rudao: "sys-rudao", wudao: "sys-wudao" };
    return map[s] || "sys-default";
  },

  // ============ 玩家立绘：按需求移除角色立绘（仅保留场景背景） ============
  _heroPortrait() {
    return "";
  },


  // NPC 立绘库：古风修仙人物（平滑 SVG 路径，每种有独特造型）
  NPC_POOL: {
    old:      { label:"仙风老者", main:"#5a6050", accent:"#c8d8b8", skin:"#f0dcb8", hair:"#d8e0d0",
      aura:"rgba(180,200,160,0.2)",
      svg:(s)=>`<!-- 仙风老者：白须飘飘、道骨仙风 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.3"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="110" rx="52" ry="70" fill="url(#npcAura)"/>
        <!-- 长袍 -->
        <path d="M54,178 Q50,140 58,112 Q66,98 80,96 Q94,98 102,112 Q110,140 106,178 Q103,196 95,212 L65,212 Q57,196 54,178Z" fill="${s.main}" opacity="0.9"/>
        <path d="M58,174 Q54,142 60,116 Q68,102 80,100 Q92,100 100,116 Q106,142 102,174 Q99,192 93,208 L67,208Q61,192 58,174Z" fill="${s.accent}" opacity="0.2"/>
        <path d="M57,152 Q80,158 103,152 L102,160 Q80,167 58,160Z" fill="${s.accent}" opacity="0.4"/>
        <!-- 袖子 -->
        <path d="M56,114 Q36,120 26,144 Q22,162 30,176 Q38,168 48,156 Q54,144 56,126Z" fill="${s.main}" opacity="0.88"/>
        <path d="M104,114 Q124,120 134,144 Q138,162 130,176 Q122,168 112,156 Q106,144 104,126Z" fill="${s.main}" opacity="0.88"/>
        <!-- 手 -->
        <ellipse cx="30" cy="172" rx="5" ry="7" fill="${s.skin}"/>
        <ellipse cx="130" cy="172" rx="5" ry="7" fill="${s.skin}"/>
        <!-- 白发/长髯 -->
        <path d="M54,72 Q48,50 58,36 Q70,22 80,20 Q90,22 102,36 Q112,50 106,72 Q104,84 98,90 Q90,96 80,96 Q70,96 62,90 Q56,84 54,72Z" fill="${s.hair}"/>
        <path d="M52,76 Q42,100 34,145 Q38,115 46,90 Q50,80 52,76Z" fill="${s.hair}" opacity="0.85"/>
        <path d="M108,76 Q118,100 126,145 Q122,115 114,90 Q110,80 108,76Z" fill="${s.hair}" opacity="0.85"/>
        <!-- 长须 -->
        <path d="M68,88 Q64,108 60,138 Q66,112 72,90Z" fill="${s.hair}" opacity="0.75"/>
        <path d="M80,89 Q78,112 76,142 Q82,114 84,89Z" fill="${s.hair}" opacity="0.7"/>
        <path d="M92,88 Q96,108 100,138 Q94,112 88,90Z" fill="${s.hair}" opacity="0.75"/>
        <!-- 脸 -->
        <path d="M60,70 Q58,56 66,46 Q74,38 80,38 Q86,38 94,46 Q102,56 100,70 Q98,82 92,88 Q86,93 80,93 Q74,93 68,88 Q62,82 60,70Z" fill="${s.skin}"/>
        <ellipse cx="69" cy="65" rx="4" ry="3" fill="#fff"/><ellipse cx="91" cy="65" rx="4" ry="3" fill="#fff"/>
        <circle cx="70" cy="65.5" r="2.2" fill="#2a1810"/><circle cx="92" cy="65.5" r="2.2" fill="#2a1810"/>
        <circle cx="71" cy="64.5" r="0.8" fill="#fff"/><circle cx="93" cy="64.5" r="0.8" fill="#fff"/>
        <path d="M66,59 Q70,56 76,58" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.6" stroke-linecap="round"/>
        <path d="M84,58 Q90,56 94,59" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.6" stroke-linecap="round"/>
        <path d="M77,78 Q80,81 83,78" stroke="#a07060" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M73,91 L73,99 Q80,103 87,99 L87,91" fill="${s.skin}"/>
        ` },
    crone:    { label:"白发老妪", main:"#6a5a6a", accent:"#e0d0e8", skin:"#f0dcb8", hair:"#d8d0d0",
      aura:"rgba(200,180,210,0.18)",
      svg:(s)=>`<!-- 白发老妪：慈眉善目、银发如霜 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.25"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="112" rx="50" ry="68" fill="url(#npcAura)"/>
        <path d="M56,178 Q52,140 60,114 Q67,100 80,97 Q93,100 100,114 Q108,140 104,178 Q101,196 94,211 L66,211 Q59,196 56,178Z" fill="${s.main}" opacity="0.9"/>
        <path d="M60,174 Q56,144 62,118 Q69,104 80,101 Q91,104 98,118 Q104,144 100,174 Q97,192 91,207 L69,207Q63,192 60,174Z" fill="${s.accent}" opacity="0.18"/>
        <path d="M59,154 Q80,160 101,154 L100,161 Q80,168 60,161Z" fill="${s.accent}" opacity="0.35"/>
        <path d="M58,116 Q40,121 30,143 Q26,160 32,175 Q40,167 49,155 Q55,144 58,127Z" fill="${s.main}" opacity="0.86"/>
        <path d="M102,116 Q120,121 130,143 Q134,160 128,175 Q120,167 111,155 Q105,144 102,127Z" fill="${s.main}" opacity="0.86"/>
        <ellipse cx="32" cy="171" rx="4.5" ry="6.5" fill="${s.skin}"/>
        <ellipse cx="128" cy="171" rx="4.5" ry="6.5" fill="${s.skin}"/>
        <path d="M54,74 Q48,52 58,38 Q70,24 80,22 Q90,24 102,38 Q112,52 106,74 Q104,86 98,92 Q90,98 80,98 Q70,98 62,92 Q56,86 54,74Z" fill="${s.hair}"/>
        <path d="M52,78 Q44,102 36,143 Q40,116 47,92 Q51,82 52,78Z" fill="${s.hair}" opacity="0.8"/>
        <path d="M108,78 Q116,102 124,143 Q120,116 113,92 Q109,82 108,78Z" fill="${s.hair}" opacity="0.8"/>
        <path d="M66,90 Q63,108 60,135 Q65,112 70,91Z" fill="${s.hair}" opacity="0.65"/>
        <path d="M94,90 Q97,108 100,135 Q95,112 90,91Z" fill="${s.hair}" opacity="0.65"/>
        <path d="M60,72 Q58,58 66,48 Q74,40 80,40 Q86,40 94,48 Q102,58 100,72 Q98,84 92,90 Q86,95 80,95 Q74,95 68,90 Q62,84 60,72Z" fill="${s.skin}"/>
        <ellipse cx="69" cy="67" rx="4" ry="3" fill="#fff"/><ellipse cx="91" cy="67" rx="4" ry="3" fill="#fff"/>
        <circle cx="69.5" cy="67.5" r="2" fill="#2a1810"/><circle cx="91.5" cy="67.5" r="2" fill="#2a1810"/>
        <circle cx="70.5" cy="66.5" r="0.8" fill="#fff"/><circle cx="92.5" cy="66.5" r="0.8" fill="#fff"/>
        <path d="M66,61 Q70,58 75,60" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M85,60 Q90,58 94,61" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M76,80 Q80,83 84,80" stroke="#b08080" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <path d="M73,93 L73,101 Q80,105 87,101 L87,93" fill="${s.skin}"/>
        ` },
    maiden:   { label:"灵秀少女", main:"#a06090", accent:"#f0d0ee", skin:"#fce8dc", hair:"#3e2820",
      aura:"rgba(220,160,200,0.18)",
      svg:(s)=>`<!-- 灵秀少女：双丫髻、灵动可爱 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="44%" r="56%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.3"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="108" rx="50" ry="70" fill="url(#npcAura)"/>
        <path d="M54,176 Q50,140 58,112 Q65,98 79,95 Q93,98 102,112 Q110,140 106,176 Q103,194 95,210 L65,210 Q57,194 54,176Z" fill="${s.main}" opacity="0.88"/>
        <path d="M58,172 Q54,144 60,117 Q67,103 79,99 Q91,103 99,117 Q105,144 101,172 Q98,190 92,206 L68,206Q62,190 58,172Z" fill="${s.accent}" opacity="0.2"/>
        <path d="M58,150 Q80,157 102,150 L101,158 Q80,165 59,158Z" fill="${s.accent}" opacity="0.5"/>
        <path d="M77,153 L83,153 L82,163 L78,163Z" fill="${s.main}" opacity="0.7"/>
        <path d="M56,114 Q36,119 26,141 Q22,158 30,173 Q38,164 48,152 Q54,141 56,125Z" fill="${s.main}" opacity="0.85"/>
        <path d="M104,114 Q124,119 134,141 Q138,158 130,173 Q122,164 112,152 Q106,141 104,125Z" fill="${s.main}" opacity="0.85"/>
        <ellipse cx="31" cy="169" rx="4.5" ry="6" fill="${s.skin}"/>
        <ellipse cx="129" cy="169" rx="4.5" ry="6" fill="${s.skin}"/>
        <!-- 双丫髻发型 -->
        <path d="M52,72 Q46,50 56,35 Q68,21 80,19 Q92,21 104,35 Q114,50 108,72 Q106,84 100,90 Q92,96 80,96 Q68,96 60,90 Q54,84 52,72Z" fill="${s.hair}"/>
        <path d="M48,44 Q38,38 36,50 Q38,44 44,46 Q48,48 48,44Z" fill="${s.hair}"/> <!-- 左髻 -->
        <path d="M112,44 Q122,38 124,50 Q122,44 116,46 Q112,48 112,44Z" fill="${s.hair}"/> <!-- 右髻 -->
        <circle cx="40" cy="44" r="3" fill="${s.accent}" opacity="0.7"/><circle cx="120" cy="44" r="3" fill="${s.accent}" opacity="0.7"/>
        <path d="M56,56 Q58,42 68,33 Q77,29 86,33 Q97,42 99,56 Q93,48 85,44 Q77,42 68,44 Q61,48 56,56Z" fill="#4e3530"/>
        <path d="M50,76 Q42,100 34,140 Q38,114 46,90 Q50,80 50,76Z" fill="${s.hair}" opacity="0.85"/>
        <path d="M110,76 Q118,100 126,140 Q122,114 114,90 Q110,80 110,76Z" fill="${s.hair}" opacity="0.85"/>
        <path d="M58,70 Q56,56 64,45 Q73,37 80,37 Q87,37 96,45 Q104,56 102,70 Q100,83 94,89 Q86,94 80,94 Q74,94 66,89 Q60,83 58,70Z" fill="${s.skin}"/>
        <ellipse cx="67" cy="66" rx="5" ry="3.5" fill="#fff"/><ellipse cx="93" cy="66" rx="5" ry="3.5" fill="#fff"/>
        <ellipse cx="68" cy="66.5" rx="3" ry="3.2" fill="#2a1510"/><ellipse cx="94" cy="66.5" rx="3" ry="3.2" fill="#2a1510"/>
        <circle cx="69.5" cy="65.2" r="1.2" fill="#fff"/><circle cx="95.5" cy="65.2" r="1.2" fill="#fff"/>
        <path d="M63,60 Q67,57 73,59" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M87,59 Q93,57 97,60" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M64,64 Q66,62 68,64" stroke="${s.hair}" stroke-width="0.6" fill="none" opacity="0.3"/>
        <path d="M92,64 Q94,62 96,64" stroke="${s.hair}" stroke-width="0.6" fill="none" opacity="0.3"/>
        <ellipse cx="65" cy="74" rx="5" ry="3" fill="#ffb0a0" opacity="0.2"/>
        <ellipse cx="95" cy="74" rx="5" ry="3" fill="#ffb0a0" opacity="0.2"/>
        <path d="M75,82 Q80,85 85,82" stroke="#d07a8a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M73,90 L73,98 Q80,102 87,98 L87,90" fill="${s.skin}"/>
        ` },
    youth:    { label:"英气少男", main:"#4a7098", accent:"#b0d0f0", skin:"#f8dcc8", hair:"#1a1614",
      aura:"rgba(150,180,220,0.18)",
      svg:(s)=>`<!-- 英气少男：玉树临风、剑眉星目 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.25"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="110" rx="52" ry="70" fill="url(#npcAura)"/>
        <path d="M52,178 Q48,138 57,110 Q65,96 80,94 Q95,96 103,110 Q112,138 108,178 Q105,198 96,214 L64,214 Q55,198 52,178Z" fill="${s.main}" opacity="0.9"/>
        <path d="M56,174 Q52,142 59,114 Q67,100 80,98 Q93,100 101,114 Q108,142 104,174 Q100,194 93,209 L67,209Q60,194 56,174Z" fill="${s.accent}" opacity="0.18"/>
        <path d="M56,152 Q80,159 104,152 L103,160 Q80,168 57,160Z" fill="${s.accent}" opacity="0.4"/>
        <path d="M76,155 L84,155 L83,166 L77,166Z" fill="${s.main}" opacity="0.7"/>
        <path d="M56,112 Q34,118 24,144 Q20,162 28,177 Q38,168 48,155 Q54,143 56,124Z" fill="${s.main}" opacity="0.87"/>
        <path d="M104,112 Q126,118 136,144 Q140,162 132,177 Q122,168 112,155 Q106,143 104,124Z" fill="${s.main}" opacity="0.87"/>
        <ellipse cx="29" cy="173" rx="5.5" ry="7.5" fill="${s.skin}"/>
        <ellipse cx="131" cy="173" rx="5.5" ry="7.5" fill="${s.skin}"/>
        <path d="M54,70 Q48,48 58,34 Q70,20 80,18 Q90,20 102,34 Q112,48 106,70 Q104,83 98,89 Q90,95 80,95 Q70,95 62,89 Q56,83 54,70Z" fill="${s.hair}"/>
        <path d="M66,26 Q80,16 94,26 Q86,20 80,20 Q74,20 66,26Z" fill="#2a2220"/>
        <line x1="62" y1="32" x2="98" y2="32" stroke="${s.accent}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <rect x="76" y="27" width="8" height="5" rx="1" fill="${s.accent}" opacity="0.5"/>
        <path d="M58,54 Q60,40 70,31 Q78,27 88,31 Q99,40 101,54 Q94,46 86,42 Q78,40 69,42 Q62,46 58,54Z" fill="#2a2220"/>
        <path d="M52,66 Q46,70 44,84 Q46,78 50,74 Q52,70 52,66Z" fill="${s.hair}"/>
        <path d="M108,66 Q114,70 116,84 Q114,78 110,74 Q108,70 108,66Z" fill="${s.hair}"/>
        <path d="M58,68 Q56,54 64,43 Q73,35 80,35 Q87,35 96,43 Q104,54 102,68 Q100,82 94,88 Q86,93 80,93 Q74,93 66,88 Q60,82 58,68Z" fill="${s.skin}"/>
        <path d="M61,58 Q67,53 77,56" stroke="${s.hair}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M83,56 Q93,53 99,58" stroke="${s.hair}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <ellipse cx="68" cy="65" rx="5.5" ry="4" fill="#fff"/><ellipse cx="92" cy="65" rx="5.5" ry="4" fill="#fff"/>
        <ellipse cx="68.5" cy="65.5" rx="3.2" ry="3.5" fill="#1a120e"/><ellipse cx="92.5" cy="65.5" rx="3.2" ry="3.5" fill="#1a120e"/>
        <circle cx="70" cy="64" r="1.5" fill="#fff"/><circle cx="94" cy="64" r="1.5" fill="#fff"/>
        <circle cx="67" cy="66.5" r="0.8" fill="#fff" opacity="0.4"/><circle cx="93" cy="66.5" r="0.8" fill="#fff" opacity="0.4"/>
        <path d="M80,66 Q82,73 80,80" stroke="#e8c8b8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M74,84 Q80,87 86,84" stroke="#b06858" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M74,90 L74,99 Q80,103 86,99 L86,90" fill="${s.skin}"/>
        ` },
    merchant: { label:"商贾",     main:"#8a6a30", accent:"#f0d890", skin:"#f0d0a8", hair:"#2c2418",
      aura:"rgba(220,190,120,0.15)",
      svg:(s)=>`<!-- 商贾：富态圆脸、锦衣华服 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="46%" r="54%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.25"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="112" rx="50" ry="68" fill="url(#npcAura)"/>
        <path d="M54,178 Q50,142 58,114 Q66,100 80,97 Q94,100 102,114 Q110,142 106,178 Q103,196 95,211 L65,211 Q57,196 54,178Z" fill="${s.main}" opacity="0.9"/>
        <path d="M58,174 Q54,146 60,118 Q67,104 80,101 Q93,101 100,118 Q106,146 102,174 Q99,192 93,207 L67,207Q61,192 58,174Z" fill="${s.accent}" opacity="0.22"/>
        <path d="M56,152 Q80,159 104,152 L103,160 Q80,168 57,160Z" fill="${s.accent}" opacity="0.5"/>
        <path d="M74,154 L86,154 L85,165 L75,165Z" fill="${s.accent}" opacity="0.6"/>
        <path d="M56,114 Q36,120 26,144 Q24,160 32,174 Q40,166 49,154 Q55,143 58,126Z" fill="${s.main}" opacity="0.86"/>
        <path d="M104,114 Q124,120 134,144 Q136,160 128,174 Q120,166 111,154 Q105,143 104,126Z" fill="${s.main}" opacity="0.86"/>
        <ellipse cx="31" cy="170" rx="5" ry="7" fill="${s.skin}"/>
        <ellipse cx="129" cy="170" rx="5" ry="7" fill="${s.skin}"/>
        <path d="M54,72 Q48,52 58,38 Q70,24 80,22 Q90,24 102,38 Q112,52 106,72 Q104,84 98,90 Q90,96 80,96 Q70,96 62,90 Q56,84 54,72Z" fill="${s.hair}"/>
        <path d="M78,28 Q84,24 90,28 Q86,25 84,25 Q82,25 78,28Z" fill="#3c3020" opacity="0.6"/>
        <path d="M58,56 Q60,42 70,33 Q78,29 88,33 Q98,42 100,56 Q94,48 86,44 Q78,42 69,44 Q62,48 58,56Z" fill="#3c3020"/>
        <path d="M80,34 Q96,34 100,44 Q92,38 84,38 Q80,38 80,34Z" fill="${s.accent}" opacity="0.4"/> <!-- 商贾帽檐 -->
        <path d="M58,70 Q56,56 65,46 Q74,38 80,38 Q86,38 95,46 Q104,56 102,70 Q100,84 94,90 Q86,95 80,95 Q74,95 66,90 Q60,84 58,70Z" fill="${s.skin}"/>
        <ellipse cx="68" cy="65" rx="4.5" ry="3.5" fill="#fff"/><ellipse cx="92" cy="65" rx="4.5" ry="3.5" fill="#fff"/>
        <circle cx="68.5" cy="65.5" r="2.2" fill="#1a120e"/><circle cx="92.5" cy="65.5" r="2.2" fill="#1a120e"/>
        <circle cx="69.8" cy="64.5" r="0.9" fill="#fff"/><circle cx="93.8" cy="64.5" r="0.9" fill="#fff"/>
        <path d="M64,59 Q68,56 74,58" stroke="${s.hair}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M86,58 Q92,56 96,59" stroke="${s.hair}" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M75,82 Q80,85 85,82" stroke="#a06840" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M73,92 L73,100 Q80,104 87,100 L87,92" fill="${s.skin}"/>
        ` },
    daoist:   { label:"道士",     main:"#3a7858", accent:"#90f0c0", skin:"#f5e0c8", hair:"#1a1a1a",
      aura:"rgba(100,200,140,0.18)",
      svg:(s)=>`<!-- 道士：道袍高冠、清逸出尘 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.28"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="110" rx="52" ry="70" fill="url(#npcAura)"/>
        <path d="M52,178 Q48,138 57,110 Q65,96 80,94 Q95,96 103,110 Q112,138 108,178 Q105,198 96,214 L64,214 Q55,198 52,178Z" fill="${s.main}" opacity="0.9"/>
        <path d="M56,174 Q52,142 59,114 Q67,100 80,98 Q93,100 101,114 Q108,142 104,174 Q100,194 93,209 L67,209Q60,194 56,174Z" fill="${s.accent}" opacity="0.2"/>
        <path d="M56,152 Q80,159 104,152 L103,160 Q80,168 57,160Z" fill="${s.accent}" opacity="0.45"/>
        <path d="M76,155 L84,155 L83,165 L77,165Z" fill="${s.main}" opacity="0.7"/>
        <path d="M56,112 Q34,118 24,144 Q20,162 28,177 Q38,168 48,155 Q54,143 56,124Z" fill="${s.main}" opacity="0.87"/>
        <path d="M104,112 Q126,118 136,144 Q140,162 132,177 Q122,168 112,155 Q106,143 104,124Z" fill="${s.main}" opacity="0.87"/>
        <ellipse cx="29" cy="173" rx="5" ry="7" fill="${s.skin}"/>
        <ellipse cx="131" cy="173" rx="5" ry="7" fill="${s.skin}"/>
        <!-- 道冠 -->
        <path d="M54,70 Q48,48 58,34 Q70,20 80,18 Q90,20 102,34 Q112,48 106,70 Q104,83 98,89 Q90,95 80,95 Q70,95 62,89 Q56,83 54,70Z" fill="${s.hair}"/>
        <rect x="64" y="26" width="32" height="6" rx="2" fill="${s.accent}" opacity="0.6"/>
        <line x1="58" y1="32" x2="102" y2="32" stroke="${s.accent}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
        <circle cx="80" cy="23" r="2.5" fill="${s.accent}" opacity="0.5"/>
        <path d="M58,54 Q60,40 70,31 Q78,27 88,31 Q98,40 100,54 Q94,46 86,42 Q78,40 69,42 Q62,46 58,54Z" fill="#2a2a2a"/>
        <path d="M52,66 Q46,70 44,84 Q46,78 50,74 Q52,70 52,66Z" fill="${s.hair}"/>
        <path d="M108,66 Q114,70 116,84 Q114,78 110,74 Q108,70 108,66Z" fill="${s.hair}"/>
        <path d="M58,68 Q56,54 64,43 Q73,35 80,35 Q87,35 96,43 Q104,54 102,68 Q100,82 94,88 Q86,93 80,93 Q74,93 66,88 Q60,82 58,68Z" fill="${s.skin}"/>
        <path d="M62,58 Q68,53 76,56" stroke="${s.hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M84,56 Q92,53 98,58" stroke="${s.hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="68" cy="65" rx="5" ry="3.8" fill="#fff"/><ellipse cx="92" cy="65" rx="5" ry="3.8" fill="#fff"/>
        <ellipse cx="68.5" cy="65.5" rx="3" ry="3.3" fill="#151810"/><ellipse cx="92.5" cy="65.5" rx="3" ry="3.3" fill="#151810"/>
        <circle cx="70" cy="64.2" r="1.3" fill="#fff"/><circle cx="94" cy="64.2" r="1.3" fill="#fff"/>
        <path d="M80,66 Q82,73 80,80" stroke="#e0c8b8" stroke-width="1.1" fill="none" stroke-linecap="round"/>
        <path d="M75,82 Q80,85 85,82" stroke="#a08868" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M73,90 L73,99 Q80,103 87,99 L87,90" fill="${s.skin}"/>
        ` },
    yaoxiu:   { label:"妖修化形", main:"#7a3080", accent:"#e8a0ff", skin:"#f0d0b8", hair:"#3a2038",
      aura:"rgba(200,120,220,0.2)",
      svg:(s)=>`<!-- 妖修化形：妖异之美、异色瞳 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="44%" r="56%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.32"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="108" rx="50" ry="70" fill="url(#npcAura)"/>
        <path d="M54,176 Q50,140 58,112 Q65,98 79,95 Q93,98 102,112 Q110,140 106,176 Q103,194 95,210 L65,210 Q57,194 54,176Z" fill="${s.main}" opacity="0.88"/>
        <path d="M58,172 Q54,144 60,117 Q67,103 79,99 Q91,103 99,117 Q105,144 101,172 Q98,190 92,206 L68,206Q62,190 58,172Z" fill="${s.accent}" opacity="0.22"/>
        <path d="M58,150 Q80,157 102,150 L101,158 Q80,165 59,158Z" fill="${s.accent}" opacity="0.5"/>
        <path d="M77,153 L83,153 L82,163 L78,163Z" fill="${s.main}" opacity="0.7"/>
        <path d="M56,114 Q36,119 26,141 Q22,158 30,173 Q38,164 48,152 Q54,141 56,125Z" fill="${s.main}" opacity="0.85"/>
        <path d="M104,114 Q124,119 134,141 Q138,158 130,173 Q122,164 112,152 Q106,141 104,125Z" fill="${s.main}" opacity="0.85"/>
        <ellipse cx="31" cy="169" rx="4.5" ry="6.5" fill="${s.skin}"/>
        <ellipse cx="129" cy="169" rx="4.5" ry="6.5" fill="${s.skin}"/>
        <!-- 妖异长发 -->
        <path d="M50,74 Q44,50 56,34 Q68,20 80,18 Q92,20 104,34 Q116,50 110,74 Q108,87 100,93 Q92,99 80,99 Q68,99 60,93 Q52,87 50,74Z" fill="${s.hair}"/>
        <path d="M46,78 Q36,104 28,148 Q34,118 44,92 Q48,82 46,78Z" fill="${s.hair}" opacity="0.85"/>
        <path d="M114,78 Q124,104 132,148 Q126,118 116,92 Q112,82 114,78Z" fill="${s.hair}" opacity="0.85"/>
        <!-- 妖角 -->
        <path d="M52,42 Q44,28 48,18" stroke="${s.hair}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M108,42 Q116,28 112,18" stroke="${s.hair}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M56,56 Q58,40 68,30 Q78,25 88,30 Q100,40 102,56 Q95,48 86,43 Q78,41 68,43 Q61,48 56,56Z" fill="#4a3045"/>
        <!-- 妖纹 -->
        <path d="M100,76 Q106,74 110,78" stroke="${s.accent}" stroke-width="1" fill="none" opacity="0.3"/>
        <path d="M58,72 Q68,68 74,72" stroke="${s.accent}" stroke-width="0.8" fill="none" opacity="0.25"/>
        <path d="M58,70 Q56,55 65,44 Q74,36 80,36 Q86,36 95,44 Q104,55 102,70 Q100,84 94,90 Q86,96 80,96 Q74,96 66,90 Q60,84 58,70Z" fill="${s.skin}"/>
        <!-- 异色瞳 -->
        <ellipse cx="67" cy="65" rx="5" ry="3.8" fill="#fff"/><ellipse cx="93" cy="65" rx="5" ry="3.8" fill="#fff"/>
        <ellipse cx="67.5" cy="65.5" rx="3" ry="3.2" fill="${s.accent}" opacity="0.8"/><ellipse cx="93.5" cy="65.5" rx="3" ry="3.2" fill="#2a1510"/>
        <circle cx="69" cy="64.2" r="1.3" fill="#fff"/><circle cx="95" cy="64.2" r="1.3" fill="#fff"/>
        <path d="M62,59 Q66,56 72,58" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <path d="M88,58 Q94,56 98,59" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.5" stroke-linecap="round"/>
        <ellipse cx="64" cy="74" rx="5" ry="3" fill="${s.accent}" opacity="0.12"/>
        <ellipse cx="96" cy="74" rx="5" ry="3" fill="${s.accent}" opacity="0.12"/>
        <path d="M74,82 Q80,86 86,82" stroke="#a05878" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M73,90 L73,99 Q80,103 87,99 L87,90" fill="${s.skin}"/>
        ` },
    xiexiu:   { label:"邪修",     main:"#3a0a12", accent:"#ff4050", skin:"#e0b898", hair:"#0e0608",
      aura:"rgba(180,40,60,0.2)",
      svg:(s)=>`<!-- 邪修：阴鸷面容、邪气缭绕 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="46%" r="54%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.25"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="112" rx="50" ry="68" fill="url(#npcAura)"/>
        <path d="M54,178 Q50,140 58,112 Q66,98 80,95 Q94,98 102,112 Q110,140 106,178 Q103,196 95,211 L65,211 Q57,196 54,178Z" fill="${s.main}" opacity="0.92"/>
        <path d="M58,174 Q54,142 60,116 Q68,102 80,99 Q92,100 100,116 Q106,142 102,174 Q99,192 93,207 L67,207Q61,192 58,174Z" fill="${s.accent}" opacity="0.12"/>
        <path d="M56,152 Q80,159 104,152 L103,160 Q80,168 57,160Z" fill="${s.accent}" opacity="0.25"/>
        <path d="M56,114 Q36,120 26,144 Q22,162 30,177 Q40,168 49,155 Q55,143 58,126Z" fill="${s.main}" opacity="0.88"/>
        <path d="M104,114 Q124,120 134,144 Q138,162 132,177 Q122,168 111,155 Q106,143 104,126Z" fill="${s.main}" opacity="0.88"/>
        <ellipse cx="30" cy="173" rx="5" ry="7" fill="${s.skin}"/>
        <ellipse cx="130" cy="173" rx="5" ry="7" fill="${s.skin}"/>
        <!-- 散乱黑发 -->
        <path d="M52,74 Q44,50 56,34 Q68,20 80,18 Q92,20 104,34 Q116,50 110,74 Q108,86 100,92 Q90,98 80,98 Q70,98 60,92 Q52,86 52,74Z" fill="${s.hair}"/>
        <path d="M46,78 Q36,106 28,150 Q36,118 46,92 Q50,82 46,78Z" fill="${s.hair}" opacity="0.9"/>
        <path d="M114,78 Q124,106 132,150 Q124,118 114,92 Q110,82 114,78Z" fill="${s.hair}" opacity="0.9"/>
        <path d="M56,56 Q58,40 68,30 Q78,25 88,30 Q100,40 102,56 Q94,47 86,43 Q78,41 68,43 Q60,48 56,56Z" fill="#1a0e10"/>
        <!-- 邪气纹路 -->
        <path d="M100,78 Q108,76 114,82" stroke="${s.accent}" stroke-width="0.8" fill="none" opacity="0.25"/>
        <path d="M58,72 Q66,68 72,72" stroke="${s.accent}" stroke-width="0.8" fill="none" opacity="0.2"/>
        <path d="M58,70 Q56,55 65,44 Q74,36 80,36 Q86,36 95,44 Q104,55 102,70 Q100,84 94,90 Q86,96 80,96 Q74,96 66,90 Q60,84 58,70Z" fill="${s.skin}"/>
        <!-- 阴鸷眼神 -->
        <ellipse cx="67" cy="65" rx="5" ry="3.5" fill="#ffe0e0"/><ellipse cx="93" cy="65" rx="5" ry="3.5" fill="#ffe0e0"/>
        <ellipse cx="67.5" cy="65.5" rx="2.8" ry="3" fill="#500810"/><ellipse cx="93.5" cy="65.5" rx="2.8" ry="3" fill="#500810"/>
        <circle cx="68.8" cy="64.5" r="1" fill="#ff8080"/><circle cx="94.8" cy="64.5" r="1" fill="#ff8080"/>
        <path d="M60,58 Q66,54 74,57" stroke="${s.hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M86,57 Q94,54 100,58" stroke="${s.hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M74,83 Q80,87 86,83" stroke="#802830" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M73,91 L73,100 Q80,104 87,100 L87,91" fill="${s.skin}"/>
        ` },
    ghost:    { label:"鬼物",     main:"#4a5a78", accent:"#b0c8f0", skin:"#c8d8ec", hair:"#8098b8",
      aura:"rgba(140,160,200,0.15)",
      svg:(s)=>`<!-- 鬼物：半透明飘渺、幽冥之气 -->
        <defs><radialGradient id="npcAura" cx="50%" cy="46%" r="54%"><stop offset="0%" stop-color="${s.accent}" stop-opacity="0.2"/><stop offset="100%" stop-color="${s.accent}" stop-opacity="0"/></radialGradient></defs>
        <ellipse cx="80" cy="112" rx="50" ry="70" fill="url(#npcAura)" opacity="0.8"/>
        <g opacity="0.82">
        <path d="M56,178 Q52,140 60,114 Q67,100 80,97 Q93,100 100,114 Q108,140 104,178 Q101,196 94,211 L66,211 Q58,196 56,178Z" fill="${s.main}"/>
        <path d="M60,174 Q56,144 62,118 Q69,104 80,101 Q91,101 98,118 Q104,144 100,174 Q97,192 92,207 L68,207Q62,192 60,174Z" fill="${s.accent}" opacity="0.15"/>
        <path d="M58,152 Q80,159 102,152 L101,160 Q80,168 59,160Z" fill="${s.accent}" opacity="0.3"/>
        </g>
        <path d="M58,114 Q40,120 30,144 Q26,160 33,174 Q42,166 50,154 Q56,143 58,126Z" fill="${s.main}" opacity="0.7"/>
        <path d="M102,114 Q120,120 130,144 Q134,160 127,174 Q118,166 110,154 Q104,143 102,126Z" fill="${s.main}" opacity="0.7"/>
        <!-- 飘渺发丝 -->
        <path d="M54,74 Q46,50 58,34 Q70,20 80,18 Q90,20 102,34 Q114,50 108,74 Q106,87 98,93 Q90,99 80,99 Q70,99 60,93 Q52,87 54,74Z" fill="${s.hair}" opacity="0.7"/>
        <path d="M44,80 Q34,110 26,155 Q34,120 44,94 Q48,84 44,80Z" fill="${s.hair}" opacity="0.5"/>
        <path d="M116,80 Q126,110 134,155 Q126,120 116,94 Q112,84 116,80Z" fill="${s.hair}" opacity="0.5"/>
        <path d="M58,56 Q60,40 70,30 Q78,25 88,30 Q98,40 100,56 Q94,47 86,43 Q78,41 68,43 Q60,48 58,56Z" fill="#90a8c8" opacity="0.7"/>
        <path d="M58,70 Q56,55 65,44 Q74,36 80,36 Q86,36 95,44 Q104,55 102,70 Q100,84 94,90 Q86,96 80,96 Q74,96 66,90 Q60,84 58,70Z" fill="${s.skin}" opacity="0.85"/>
        <!-- 幽冥眼 -->
        <ellipse cx="67" cy="65" rx="5" ry="3.8" fill="#e0e8ff" opacity="0.8"/><ellipse cx="93" cy="65" rx="5" ry="3.8" fill="#e0e8ff" opacity="0.8"/>
        <circle cx="68" cy="65.5" r="2.5" fill="${s.accent}" opacity="0.6"/><circle cx="94" cy="65.5" r="2.5" fill="${s.accent}" opacity="0.6"/>
        <circle cx="69" cy="64.5" r="1" fill="#fff" opacity="0.7"/><circle cx="95" cy="64.5" r="1" fill="#fff" opacity="0.7"/>
        <path d="M62,59 Q66,56 72,58" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.4" stroke-linecap="round"/>
        <path d="M88,58 Q94,56 98,59" stroke="${s.hair}" stroke-width="1" fill="none" opacity="0.4" stroke-linecap="round"/>
        <path d="M76,82 Q80,86 84,82" stroke="#8098b8" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.6"/>
        <path d="M74,90 L74,99 Q80,103 86,99 L86,90" fill="${s.skin}" opacity="0.8"/>
        <!-- 魂火飘散 -->
        <circle cx="38" cy="100" r="1.5" fill="${s.accent}" opacity="0.3">
          <animate attributeName="cy" values="100;90;100" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite"/>
        </circle>
        <circle cx="122" cy="110" r="1.2" fill="${s.accent}" opacity="0.25">
          <animate attributeName="cy" values="110;100;110" dur="4s" repeatCount="indefinite"/>
        </circle>
        `,
  },
  },

  // ============ NPC 立绘：按需求移除角色立绘（仅保留场景背景） ============
  _npcPortrait(kind) {
    return "";
  },

  updateHeroSprite() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("hero-sprite");
    if (!el || !Game.state || !Game.state.character) return;
    el.innerHTML = this._heroPortrait();
    const spec = this._heroSpec();
    if (spec) ArtEngine.upgrade(el, spec);
  },

  _formToRace(form) {
    if (!form) return "人";
    const map = { human: "人", "人族": "人", 树: "树", 花: "花", 石: "石", 器: "器", 灵: "灵", 兽: "兽", 元素: "元素" };
    const s = String(form);
    if (map[form]) return map[form];
    if (s.includes("妖") || s.includes("兽")) return "妖";
    if (s.includes("魔") || s.includes("邪")) return "魔";
    if (s.includes("龙")) return "龙";
    return "人";
  },
  _archeToRace(arche) {
    if (!arche) return "人";
    const s = String(arche);
    if (s.includes("妖") || s.includes("兽")) return "妖";
    if (s.includes("魔") || s.includes("邪")) return "魔";
    if (s.includes("龙")) return "龙";
    if (s.includes("仙")) return "仙";
    if (s.includes("鬼") || s.includes("幽")) return "鬼";
    if (s.includes("灵")) return "灵";
    return "人";
  },
  _heroSpec() {
    // 角色立绘已移除：不再产出主角立绘规格（即便开启 ArtEngine 也不会出图）
    return null;
  },
  _npcSpec(npc) {
    // 角色立绘已移除：不再产出 NPC 立绘规格
    return null;
  },

  // 场景中立绘层：主角（依体系配色）+ 同框 NPC（依 AI 的 npc 标记）
  updateActorSprite() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("vn-actors");
    const stage = document.querySelector(".vn-stage");
    if (!el || !Game.state || !Game.state.character) return;
    // GAL 模式：中央舞台不常驻主角立绘；仅当 NPC 对话时弹出 NPC 立绘（带淡入）
    let html = "";
    if (this.currentNpc) {
      const npcHtml = this._npcPortrait(this.currentNpc);
      if (npcHtml) html += `<div class="vn-actor npc npc-popin">${npcHtml}</div>`;
    }
    el.innerHTML = html;
    if (stage) stage.classList.toggle("npc-active", !!this.currentNpc);
    if (this.currentNpc) {
      const actor = el.querySelector(".vn-actor.npc");
      const spec = this._npcSpec(this.currentNpc);
      if (actor && spec) ArtEngine.upgrade(actor, spec);
    }
  },

  npcImageFor(t) {
    // AI 输出标记 → 新立绘库 kind（向后兼容 old_m/old_f/young_m/young_f）
    const map = { old_m: "old", old_f: "crone", young_m: "youth", young_f: "maiden",
                  old: "old", crone: "crone", maiden: "maiden", youth: "youth",
                  merchant: "merchant", daoist: "daoist", yaoxiu: "yaoxiu", xiexiu: "xiexiu", ghost: "ghost" };
    const kind = map[t] || t;
    return this.NPC_POOL[kind] ? kind : "";
  },

  // ============ 敌人多样性系统（妖兽/邪修/鬼物各有多种，随机抽取且防连重复） ============
  // 每条目：slug 唯一标识；name 显示名；file 走现成 webp；否则用 cfg 生成像素 SVG 立绘
  ENEMY_POOL: {
    beast: [
      { slug: "mang",  name: "赤鳞蟒",   cfg: { body: "#3f8f4f", belly: "#cfe8c2", eye: "#ffd93d" }, feats: ["tail", "fangs"] },
      { slug: "hu",    name: "斑斓虎",   cfg: { body: "#e08a2b", belly: "#fbe6c8", eye: "#15110c" }, feats: ["stripes", "fangs"] },
      { slug: "ying",  name: "裂风鹰",   cfg: { body: "#7a5230", belly: "#e3cfa6", eye: "#ffce3a" }, feats: ["wings", "beak"] },
      { slug: "lang",  name: "啸月狼" },
      { slug: "zhu",   name: "钢鬃野猪", cfg: { body: "#5b4636", belly: "#cdbfa8", eye: "#15110c" }, feats: ["tusks"] },
      { slug: "xie",   name: "毒尾蝎",   cfg: { body: "#6a3d8a", belly: "#caa6e0", eye: "#ff5b5b" }, feats: ["tail", "stinger"] },
      { slug: "xiong", name: "撼山熊",   cfg: { body: "#6b4a2f", belly: "#caa982", eye: "#15110c" }, feats: ["big"] },
      { slug: "jiao",  name: "青鳞蛟",   cfg: { body: "#2f7a8f", belly: "#bfe8ef", eye: "#aef0ff" }, feats: ["tail", "fangs", "horns", "aura"] },
      { slug: "shi",   name: "赤炎狮",   cfg: { body: "#c85a2a", belly: "#f6d2a8", eye: "#ffe08a" }, feats: ["stripes", "fangs", "big"] },
      { slug: "ya",    name: "墨羽鸦",   cfg: { body: "#2a2a36", belly: "#7a7a8a", eye: "#ff5b5b" }, feats: ["wings", "beak", "eyes3"] },
      { slug: "lu",    name: "玉鳞鹿",   cfg: { body: "#6a8f6a", belly: "#d8efd8", eye: "#2a4a2a" }, feats: ["horns"] },
      { slug: "gui",   name: "玄龟",     cfg: { body: "#3a5a4a", belly: "#9ab0a0", eye: "#bfe8c0" }, feats: ["big", "armor"] },
      { slug: "hu2",   name: "火尾狐",   cfg: { body: "#d07030", belly: "#f6d8b8", eye: "#ffd070" }, feats: ["tail", "fangs", "aura"] },
      { slug: "zhu2",  name: "寒蛛",     cfg: { body: "#4a5a78", belly: "#aeb8d0", eye: "#dfe9ff" }, feats: ["fangs", "eyes3"] },
      { slug: "bao",   name: "雷纹豹",   cfg: { body: "#5a5a7a", belly: "#c0c0d8", eye: "#ffe080" }, feats: ["stripes", "fangs", "aura"] },
      { slug: "gu2",   name: "白骨妖",   cfg: { body: "#cfc8b8", belly: "#efe8d8", eye: "#ff5b5b" }, feats: ["fangs", "horns"] },
    ],
    xiexiu: [
      { slug: "jiexiu", name: "黑风劫修" },
      { slug: "xuexiu", name: "血刀魔修", cfg: { body: "#7a1f2b", robe: "#3a0d12", eye: "#ff5b5b" }, feats: ["cultivator", "blade"] },
      { slug: "duxiu",  name: "毒手邪修", cfg: { body: "#2f6b3a", robe: "#13301a", eye: "#a6e0b0" }, feats: ["cultivator"] },
      { slug: "xueying", name: "血影修士", cfg: { body: "#8a1f2b", robe: "#2a0a0a", eye: "#ff5b5b" }, feats: ["cultivator", "blade", "aura"] },
      { slug: "shihun", name: "噬魂老魔", cfg: { body: "#4a1f5a", robe: "#1a0a2a", eye: "#d08aff" }, feats: ["cultivator", "horns"] },
      { slug: "shigu",  name: "蚀骨妖修", cfg: { body: "#2f6b3a", robe: "#13301a", eye: "#a6e0b0" }, feats: ["cultivator", "blade"] },
      { slug: "anci",   name: "黯影刺客", cfg: { body: "#2a2e3a", robe: "#11131a", eye: "#9ab0d0" }, feats: ["cultivator", "blade", "armor"] },
      { slug: "fentian", name: "焚天狂徒", cfg: { body: "#b05020", robe: "#3a1505", eye: "#ffb060" }, feats: ["cultivator", "horns", "aura"] },
    ],
    ghost: [
      { slug: "yuanling", name: "含冤厉魄" },
      { slug: "yinhun",   name: "阴魂老者", cfg: { body: "#5a7fa8", eye: "#dfe9ff" }, feats: ["ghost", "wisp"] },
      { slug: "guhun",    name: "孤野游魂", cfg: { body: "#9aa0a8", eye: "#ffffff" }, feats: ["ghost", "wisp"] },
      { slug: "qixue",    name: "泣血女鬼", cfg: { body: "#7a2a4a", eye: "#ff9ab0" }, feats: ["ghost", "wisp", "aura"] },
      { slug: "wumian",   name: "无面游魂", cfg: { body: "#6a7080", eye: "#ffffff" }, feats: ["ghost", "wisp"] },
      { slug: "baigu",    name: "白骨怨灵", cfg: { body: "#cfc8b8", eye: "#ff5b5b" }, feats: ["ghost", "eyes3"] },
      { slug: "sheqing",  name: "摄青鬼",   cfg: { body: "#3a5a4a", eye: "#aef0c0" }, feats: ["ghost", "wisp", "aura"] },
    ],
  },

  // 程序化敌人立绘生成（委托 ArtGen，支持 horns/armor/eyes3/aura 等更多特征，变体更丰富）
  enemySvg(cfg) {
    return ArtGen.enemySvg(cfg);
  },

  enemyArtFor(entry) {
    // 敌人立绘已移除：不再引用任何立绘文件
    return "";
  },

  enemyEntryBySlug(slug, type) {
    const pool = (this.ENEMY_POOL[type] || []);
    return pool.find(e => e.slug === slug) || null;
  },

  // 从叙事文本里抓具体妖兽名（让战斗立绘与文字一致）
  creatureSlugFromText(text, type) {
    if (!text) return null;
    const map = [
      [/蟒|蛇/, "mang"], [/虎/, "hu"], [/鹰|雕|鹫/, "ying"], [/狼/, "lang"],
      [/猪|彘/, "zhu"], [/蝎/, "xie"], [/熊/, "xiong"],
    ];
    if (type === "beast") {
      for (const [re, slug] of map) if (re.test(text)) return slug;
    }
    return null; // xiexiu/ghost 由 pickEnemy 随机防重
  },

  // 按类型随机抽取，排除最近 2 次出现过的，做到不连重复
  pickEnemy(type) {
    const pool = (this.ENEMY_POOL[type] || []);
    if (!pool.length) return null;
    const recent = this._recentEnemySlugs || [];
    let cand = pool.filter(e => !recent.includes(e.slug));
    if (cand.length === 0) cand = pool;
    const pick = cand[Math.floor(Math.random() * cand.length)];
    this._recentEnemySlugs = [pick.slug].concat(recent).slice(0, 2);
    this._persistRecentEnemies();
    return pick;
  },

  recordEnemy(entry) {
    if (!entry) return;
    this._recentEnemySlugs = [entry.slug].concat(this._recentEnemySlugs || []).slice(0, 2);
    this._persistRecentEnemies();
    // 供 AI 提示词读取的“近期敌人名”
    this._recentEnemies = [entry.name].concat(this._recentEnemies || []).slice(0, 3);
    try { localStorage.setItem("xianxia_recent_enemy_names", JSON.stringify(this._recentEnemies)); } catch (e) {}
  },

  _persistRecentEnemies() {
    try { localStorage.setItem("xianxia_recent_enemies", JSON.stringify(this._recentEnemySlugs || [])); } catch (e) {}
  },

  _loadRecentEnemies() {
    try {
      this._recentEnemySlugs = JSON.parse(localStorage.getItem("xianxia_recent_enemies") || "[]") || [];
      this._recentEnemies = JSON.parse(localStorage.getItem("xianxia_recent_enemy_names") || "[]") || [];
    } catch (e) { this._recentEnemySlugs = []; this._recentEnemies = []; }
  },

  // 解析本回合敌人：优先用 AI 文本里的具体妖兽，否则按类型随机防重
  resolveEnemy(parsed) {
    const type = this.detectCombat(parsed);
    if (!type) return null;
    const text = (parsed && parsed.narrative) || "";
    const specific = this.creatureSlugFromText(text, type);
    let entry = specific ? this.enemyEntryBySlug(specific, type) : null;
    if (!entry) entry = this.pickEnemy(type);
    if (entry) this.recordEnemy(entry);
    return entry ? Object.assign({ type: type }, entry) : null;
  },

  // 根据敌人类型选择素材（保留作兜底）
  enemyImageFor(type) {
    // 敌人立绘已移除
    return "";
  },

  // 显示战斗舞台并播放一次战斗动画（enemy 为 resolveEnemy 返回的对象，含专属立绘与名字）
  showBattleStage(enemy) {
    if (typeof document === "undefined") return;
    const stage = document.getElementById("battle-stage");
    if (!stage) return;
    const heroEl = document.getElementById("battle-hero");
    const enemyEl = document.getElementById("battle-enemy");
    const gender = (Game.state && Game.state.character && Game.state.character.gender) || 0;
    // 角色立绘已移除：战斗仅保留敌人名牌与血条，主角/敌人不再出图
    heroEl.innerHTML = "";
    enemyEl.innerHTML = "";
    // 敌人名牌
    let nameEl = document.getElementById("battle-enemy-name");
    if (!nameEl) {
      nameEl = document.createElement("div");
      nameEl.id = "battle-enemy-name";
      nameEl.className = "battle-enemy-name";
      stage.appendChild(nameEl);
    }
    nameEl.textContent = (enemy && enemy.name) ? enemy.name : "敌人";
    // 战斗血条（宝可梦式）：主角按真实气血，敌人按真实胜负（胜则归零）
    const hpEl = document.getElementById("battle-hero-hp");
    if (hpEl) {
      const c = (Game.state && Game.state.character);
      const pct = c ? Math.max(0, Math.min(100, Math.round((c.hp / (c.maxHp || 1)) * 100))) : 100;
      hpEl.style.width = pct + "%";
    }
    const eHpEl = document.getElementById("battle-enemy-hp");
    if (eHpEl) {
      const lc = (Game.state && Game.state.meta && Game.state.meta.lastCombat);
      eHpEl.style.width = (lc && lc.win) ? "0%" : "100%";
    }
    const eNameEl = document.getElementById("battle-enemy-hp-name");
    if (eNameEl) eNameEl.textContent = (enemy && enemy.name) ? enemy.name : "敌";
    // 战斗舞台用当前场景图做背景（图缺失则回退渐变）
    const sceneFile = (this.currentScene && SCENE_LIB[this.currentScene]) ? SCENE_LIB[this.currentScene].file : "";
    stage.style.backgroundImage = sceneFile ? `url("assets/${sceneFile}")` : "";
    stage.style.display = "block";
    stage.classList.remove("battle-out");
    this.playBattleAnimation();
  },

  hideBattleStage() {
    if (typeof document === "undefined") return;
    const stage = document.getElementById("battle-stage");
    if (!stage) return;
    stage.classList.add("battle-out");
    setTimeout(() => { stage.style.display = "none"; }, 350);
  },

  // 播放一次战斗动画序列：待机→攻击→受击→回归
  playBattleAnimation() {
    if (typeof document === "undefined") return;
    const hero = document.getElementById("battle-hero");
    const enemy = document.getElementById("battle-enemy");
    const fx = document.getElementById("battle-fx");
    const hint = document.getElementById("battle-hint");
    if (!hero || !enemy) return;
    // 清理旧动画类
    hero.className = "battle-actor battle-hero";
    enemy.className = "battle-actor battle-enemy";
    if (fx) fx.innerHTML = "";
    void hero.offsetWidth;

    // 回合制演出：主角先攻
    hero.classList.add("hero-attack");
    setTimeout(() => {
      enemy.classList.add("enemy-hit");
      this.spawnBattleFx("hit", "enemy");
    }, 280);
    setTimeout(() => {
      hero.classList.remove("hero-attack");
      enemy.classList.remove("enemy-hit");
    }, 720);

    // 敌人反击
    setTimeout(() => {
      enemy.classList.add("enemy-attack");
      setTimeout(() => {
        hero.classList.add("hero-hit");
        this.spawnBattleFx("hit", "hero");
      }, 280);
      setTimeout(() => {
        enemy.classList.remove("enemy-attack");
        hero.classList.remove("hero-hit");
      }, 720);
    }, 900);

    // 收尾：主角释放技能/法宝一击
    setTimeout(() => {
      hero.classList.add("hero-cast");
      this.spawnBattleFx("cast", "center");
      setTimeout(() => {
        enemy.classList.add("enemy-hit");
        this.spawnBattleFx("hit", "enemy");
      }, 320);
      setTimeout(() => {
        hero.classList.remove("hero-cast");
        enemy.classList.remove("enemy-hit");
      }, 900);
    }, 1750);

    if (hint) {
      const lc = (Game.state && Game.state.meta && Game.state.meta.lastCombat);
      hint.style.opacity = "1";
      hint.textContent = (lc && lc.win) ? "克敌制胜" : (lc ? "力有不逮" : "斗法交锋");
      setTimeout(() => { hint.style.opacity = "0"; }, 2400);
    }
  },

  // 在舞台生成一次像素特效（hit/cast）
  spawnBattleFx(kind, target) {
    if (typeof document === "undefined") return;
    const fx = document.getElementById("battle-fx");
    if (!fx) return;
    const stage = document.getElementById("battle-stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "battle-fx-burst " + kind;
    if (target === "hero") el.style.left = "22%";
    else if (target === "enemy") el.style.left = "72%";
    else el.style.left = "50%";
    el.style.top = "45%";
    if (kind === "cast") {
      for (let i = 0; i < 8; i++) {
        const p = document.createElement("span");
        p.className = "cast-particle";
        p.style.transform = `rotate(${i * 45}deg) translateX(18px)`;
        p.style.background = i % 2 ? "#5fcf9b" : "#e0b64c";
        el.appendChild(p);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const p = document.createElement("span");
        p.className = "hit-particle";
        const dx = (Math.random() * 60 - 30).toFixed(0) + "px";
        const dy = (Math.random() * 60 - 40).toFixed(0) + "px";
        p.style.setProperty("--dx", dx);
        p.style.setProperty("--dy", dy);
        p.style.background = Math.random() < 0.5 ? "#ff6b6b" : "#ffd93d";
        el.appendChild(p);
      }
    }
    fx.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
  },

  // 检测本回合是否为战斗场景（优先 AI 返回的 combat_encounter，其次启发式文本匹配）
  detectCombat(parsed) {
    if (parsed && parsed.combat_encounter) return parsed.combat_encounter;
    const text = (parsed && parsed.narrative) || "";
    const hit = /(?:妖兽|凶兽|狼|虎|蟒|鹰|兽).{0,8}(?:扑|袭|咬|吼|战|斗|杀)/.test(text) ||
                /(?:战|斗|厮杀|交手|对阵|迎敌).{0,12}(?:妖兽|凶兽)/.test(text);
    const xiexiu = /(?:邪修|魔修|恶人|贼人|劫修).{0,10}(?:战|斗|袭|杀|攻|交手)/.test(text) ||
                   /(?:战|斗|厮杀|交手).{0,12}(?:邪修|魔修)/.test(text);
    const ghost = /(?:鬼物|阴魂|怨灵|幽魂|鬼修).{0,10}(?:战|斗|袭|缠|扑)/.test(text) ||
                  /(?:战|斗|交手).{0,12}(?:鬼物|阴魂|怨灵)/.test(text);
    if (hit) return "beast";
    if (xiexiu) return "xiexiu";
    if (ghost) return "ghost";
    return "";
  },

  renderInventory() {
    const c = Game.state.character;
    const inv = c.inventory;
    const gradeOf = (name) => { const it = inv.find(x => x.name === name && x.type === "功法"); return it ? it.grade : ""; };
    let html = '<div class="inv-title">储物袋</div>';
    if (inv.length === 0) {
      html += '<div class="inv-empty">空空如也</div>';
    } else {
      inv.forEach(item => {
        const showDesc = item.type === "物品" || item.type === "丹药";
        const desc = item.desc || "（暂无备注）";
        const grade = item.grade ? `<span class="grade-badge" style="${gradeBadgeStyle(item.grade)}">${item.grade}</span>` : "";
        html += `<div class="inv-item">${ItemArt.icon(item.type, item.name)}<span class="item-type ${item.type}">${item.type}</span> ${grade}<span class="item-name">${item.name}</span>${showDesc ? `<div class="item-desc">${desc}</div>` : ""}</div>`;
      });
    }
    if (c.techniques.length > 0) {
      html += '<div class="inv-title" style="margin-top:12px">所修功法</div>';
      c.techniques.forEach(t => {
        const g = gradeOf(t);
        const gb = g ? `<span class="grade-badge" style="${gradeBadgeStyle(g)}">${g}</span>` : "";
        html += `<div class="inv-item technique">📜 ${gb}${t}</div>`;
      });
    }
    // 金手指 / 系统：永久属性，与功法同级展示
    if (c.systems && c.systems.length > 0) {
      html += '<div class="inv-title" style="margin-top:12px">金手指 · 系统</div>';
      c.systems.forEach(s => {
        html += `<div class="inv-item system-item">🔮 ${s}</div>`;
      });
    }
    // 生活技能（熟练度 + 进阶之路）
    if (c.skills && Object.keys(c.skills).length > 0) {
      html += '<div class="inv-title" style="margin-top:12px">生活技能</div>';
      Object.keys(c.skills).forEach(k => {
        const s = c.skills[k];
        const pct = Math.max(0, Math.min(100, s.proficiency || 0));
        html += `<div class="inv-item life-skill">` +
          `<span class="item-type skill">生活</span> ` +
          `<span class="item-name">${k}</span>` +
          `${s.path ? `<span class="skill-path">〔${s.path}〕</span>` : '<span class="skill-path dim">（未择登顶之路）</span>'}` +
          `<div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div></div>` +
          `<span class="skill-pct">${pct}/100</span></div>`;
      });
    }
    // 仙途主线（中央冲突）+ 暗线伏笔
    const mp = Game.state.meta && Game.state.meta.mainPlot;
    if (mp && mp.title) {
      const rl = (c.realmLevel || 1);
      const total = (mp.beats && mp.beats.length) || 10;
      const beatIdx = Math.max(0, Math.min(total - 1, rl - 1));
      html += '<div class="inv-title" style="margin-top:14px">仙途主线</div>';
      html += `<div class="inv-item mainplot">🧭 ${this.escapeHtml(mp.title)}　<span class="mp-stage">第${beatIdx + 1}/${total}拍</span></div>`;
      if (mp.conflict) html += `<div class="mainplot-conflict">${this.escapeHtml(mp.conflict)}</div>`;
      if (mp.resolved) html += `<div class="mainplot-resolved">✦ 已于飞升之刻收束</div>`;
    }
    const threads = (Game.state.meta && Game.state.meta.threads) || [];
    if (threads.length) {
      const open = threads.filter(t => t.status === "planted");
      const done = threads.filter(t => t.status === "resolved");
      html += '<div class="inv-title" style="margin-top:12px">暗线 · 关键信息（' + open.length + ' 未解 / ' + done.length + ' 已收）</div>';
      threads.slice().reverse().forEach(t => {
        if (t.status === "planted") html += `<div class="inv-item thread open">🕸 ${this.escapeHtml(t.hint)} <span class="thread-turn">第${t.plantedTurn}程</span></div>`;
        else html += `<div class="inv-item thread resolved">✓ ${this.escapeHtml(t.hint)} <span class="thread-turn">第${t.resolvedTurn}程收</span></div>`;
      });
    }

    document.getElementById("inventory-panel").innerHTML = html;
  },

  // ============ 手机端：紧凑状态栏 ============
  renderMobileBar() {
    if (!Game.state) return;
    const c = Game.state.character;
    const hpPct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
    const qiPct = Math.max(0, Math.min(100, (c.qi / c.maxQi) * 100));
    const bar = document.getElementById("mobile-bar");
    if (!bar) return;
    bar.querySelector(".mb-name").textContent = c.name;
    bar.querySelector(".mb-realm").textContent = c.realm;
    bar.querySelector(".mb-hp-fill").style.width = hpPct + "%";
    bar.querySelector(".mb-qi-fill").style.width = qiPct + "%";
  },

  // ============ 手机端：底部抽屉（完整角色信息 + NPC + 背包 + 世界） ============
  renderMobileDrawer() {
    if (!Game.state) return;
    const c = Game.state.character;
    const w = Game.state.world;
    const body = document.getElementById("mobile-drawer-body");
    if (!body) return;

    const getAlign = () => {
      const j = c.justice || 0, e = c.evil || 0;
      if (j - e >= 20) return '<span class="ms-good">侠义</span>';
      if (e - j >= 20) return '<span class="ms-evil">魔道</span>';
      if (j >= 10 && e >= 10) return '亦正亦邪';
      return '中立';
    };

    // 修炼进度
    const progressHtml = `
      <div class="mdrawer-section">
        <div class="mdrawer-section-title">修炼</div>
        <div class="mdrawer-stat-grid">
          <div class="mdrawer-stat-item"><span class="ms-label">寿命</span><span class="ms-val">${c.lifespan}/${c.maxLifespan}年</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">灵石</span><span class="ms-val">${c.spiritualStones}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">悟性</span><span class="ms-val">${c.comprehension}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">声望</span><span class="ms-val">${c.reputation >= 0 ? "+" : ""}${c.reputation}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">正义</span><span class="ms-good">${c.justice}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">邪恶</span><span class="ms-evil">${c.evil}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">因果力</span><span class="ms-val">${c.causeCredit || 0}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">因果债</span><span class="ms-val">${c.causeDebt || 0}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">正邪</span><span class="ms-val">${getAlign()}</span></div>
          <div class="mdrawer-stat-item"><span class="ms-label">${c.pet ? "灵宠" : "灵宠"}</span><span class="ms-val">${c.pet ? c.pet.name + (c.pet.type ? " · " + c.pet.type : "") : "暂无"}</span></div>
        </div>
        <div class="mdrawer-progress"><div class="mdrawer-progress-fill" style="width:${c.realmProgress}%"></div></div>
        <div style="font-size:11px;color:var(--text-dim);text-align:right">境界进度 ${c.realmProgress}%</div>
      </div>`;

    // 人物好感
    const npcs = Game.state.npcs || {};
    const names = Object.keys(npcs).filter(n => npcs[n].met === true);
    let npcHtml = '<div class="mdrawer-section"><div class="mdrawer-section-title">人物好感</div><div class="mdrawer-npc-list">';
    if (names.length === 0) {
      npcHtml += '<div class="mdrawer-npc-empty">尚无相交之人</div>';
    } else {
      const sorted = names.slice().sort((a, b) => (npcs[b].affinity || 0) - (npcs[a].affinity || 0));
      npcHtml += sorted.map(name => {
        const n = npcs[name];
        const a = n.affinity || 0;
        let senti = "中立";
        if (a >= 60) senti = "生死之交";
        else if (a >= 30) senti = "亲近";
        else if (a >= 10) senti = "友善";
        else if (a > -10) senti = "中立";
        else if (a > -30) senti = "疏远";
        else if (a > -60) senti = "忌惮";
        else senti = "敌对";
        const cls = a >= 10 ? "ms-good" : (a <= -10 ? "ms-evil" : "");
        const clsAttr = cls ? ` class="${cls}"` : "";
        return `<div class="mdrawer-npc-item"><span>${this.escapeHtml(name)}</span><span${clsAttr}>${senti} ${a > 0 ? "+" : ""}${a}</span></div>`;
      }).join("");
    }
    npcHtml += '</div></div>';

    // 生活技能
    const skills = c.skills || {};
    const skillKeys = Object.keys(skills);
    let skillHtml = '<div class="mdrawer-section"><div class="mdrawer-section-title">生活技能</div>';
    if (skillKeys.length === 0) {
      skillHtml += '<div class="mdrawer-npc-empty">尚未修习</div>';
    } else {
      skillHtml += skillKeys.map(k => {
        const s = skills[k];
        const pct = Math.max(0, Math.min(100, s.proficiency || 0));
        return `<div class="mdrawer-skill-item">` +
          `<div class="mdrawer-skill-head"><span>${this.escapeHtml(k)}</span><span class="ms-val">${pct}/100${s.path ? ' · ' + this.escapeHtml(s.path) : ''}</span></div>` +
          `<div class="mdrawer-progress"><div class="mdrawer-progress-fill" style="width:${pct}%"></div></div>` +
          `</div>`;
      }).join("");
    }
    skillHtml += '</div>';

    // 背包
    const inv = c.inventory;
    let invHtml = '<div class="mdrawer-section"><div class="mdrawer-section-title">储物袋</div>';
    if (inv.length === 0 && c.techniques.length === 0) {
      invHtml += '<div class="mdrawer-inv-empty">空空如也</div>';
    } else {
      if (inv.length > 0) {
        invHtml += inv.map(item => {
          const typeTag = item.type ? `<span class="item-type" style="font-size:11px;padding:1px 5px;border-radius:3px;margin-right:6px;${item.type === '功法' ? 'background:rgba(201,168,76,0.15);color:var(--gold);' : item.type === '丹药' ? 'background:rgba(220,120,90,0.15);color:#e08a5a;' : item.type === '法宝' ? 'background:rgba(120,150,220,0.15);color:#7e96dc;' : 'background:rgba(90,155,126,0.15);color:var(--jade);'}">${item.type}</span>` : "";
          const gradeTag = item.grade ? `<span class="grade-badge" style="${gradeBadgeStyle(item.grade)}">${item.grade}</span>` : "";
          return `<div class="mdrawer-inv-item">${ItemArt.icon(item.type, item.name)}${typeTag}${gradeTag}${item.name}</div>`;
        }).join("");
      }
      if (c.techniques.length > 0) {
        invHtml += '<div style="font-size:12px;color:var(--text-dim);margin:8px 0 4px;letter-spacing:1px">所修功法</div>';
        invHtml += c.techniques.map(t => `<div class="mdrawer-inv-item">📜 ${t}</div>`).join("");
      }
    }
    invHtml += '</div>';

    // 世界信息
    const worldHtml = `
      <div class="mdrawer-section">
        <div class="mdrawer-section-title">世界</div>
        <div class="mdrawer-world-row"><span style="color:var(--text-dim);font-size:12px">仙程</span><span class="ms-val">第 ${Game.state.meta.playTurn} 程</span></div>
        <div class="mdrawer-world-row"><span style="color:var(--text-dim);font-size:12px">篇章</span><span class="ms-val">${Game.getPacing(Game.state.meta.playTurn).phaseName}</span></div>
        <button class="btn btn-block btn-map" onclick="UI.showWorldMap()">🗺 展开大地图</button>
      </div>`;

    // 抽屉顶部：主角立绘（手机端"呼出状态栏才看到人物形象"）
    const heroHtml = `<div class="mdrawer-hero">${this._heroPortrait()}</div>`;
    body.innerHTML = heroHtml + progressHtml + npcHtml + skillHtml + invHtml + worldHtml;
  },

  // 切换底部抽屉
  _mobileDrawerOpen: false,
  toggleMobileDrawer() {
    this._mobileDrawerOpen = !this._mobileDrawerOpen;
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-overlay");
    if (drawer) drawer.classList.toggle("open", this._mobileDrawerOpen);
    if (overlay) overlay.classList.toggle("show", this._mobileDrawerOpen);
    // 每次打开时刷新
    if (this._mobileDrawerOpen) this.renderMobileDrawer();
  },
  closeMobileDrawer() {
    this._mobileDrawerOpen = false;
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-overlay");
    if (drawer) drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  },

  // 手机端 VN 舞台折叠/展开（默认展开：gal game 形态，立绘+背景常驻，对话框为底部浮层）
  _vnCollapsed: false,
  toggleVnStage() {
    this._vnCollapsed = !this._vnCollapsed;
    const stage = document.querySelector(".vn-stage");
    if (stage) stage.classList.toggle("vn-collapsed", this._vnCollapsed);
    // 持久化
    try { localStorage.setItem("xianxia_vn_collapsed_v2", this._vnCollapsed ? "1" : "0"); } catch(e) {}
    // 展开后滚到底部看剧情
    if (!this._vnCollapsed) {
      setTimeout(() => this.scrollToBottom(), 350);
    }
  },
  // 初始化 VN 折叠状态（读档后调用）
  initVnStage() {
    const saved = localStorage.getItem("xianxia_vn_collapsed_v2");
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    // 桌面端默认展开（gal game 形态）；移动端默认收起，把屏幕让给剧情
    this._vnCollapsed = saved ? saved === "1" : isMobile;
    const stage = document.querySelector(".vn-stage");
    if (stage) stage.classList.toggle("vn-collapsed", this._vnCollapsed);
    // 更新场景名显示
    this.updateVnToggleScene();
  },
  // 更新折叠条上的场景名
  updateVnToggleScene() {
    const el = document.getElementById("vn-toggle-scene");
    if (!el || !Game.state || !Game.state.character) return;
    const realm = Game.state.character.realm || "";
    const rl = Game.state.character.realmLevel || 1;
    const lib = SCENE_LIB[this.currentScene] || { name: realm || "仙途" };
    el.textContent = `${lib.name} · ${realm}`;
  },

  renderHistory() {
    const storyEl = document.getElementById("story-text");
    let html = "";
    Game.log.forEach(entry => {
      if (entry.role === "user") {
        html += `<div class="user-action">▸ ${this.escapeHtml(entry.text)}</div>`;
      } else {
        html += this.flagHtmlFor(entry.flag);
        html += `<div class="story-content">${this.escapeHtml(entry.text)}</div>`;
        if (entry.deltas && entry.deltas.length) {
          html += `<div class="turn-deltas">` +
            entry.deltas.map(d => `<span class="delta-item">${this.escapeHtml(d)}</span>`).join("") +
            `</div>`;
        }
      }
    });
    storyEl.innerHTML = html;
    this.scrollToBottom();

    // 渲染最后一回合的选项
    const last = Game.log[Game.log.length - 1];
    if (last && last.role === "assistant") {
      this.renderOptionsFromList(last.options, last.flag, last.optionRisks || []);
    } else {
      this.renderOptionsFromList([], null);
    }
  },

  // 事件标记HTML
  flagHtmlFor(flag) {
    if (flag === "breakthrough_success") {
      return `<div class="event-flag flag-success">⚡ 突破成功！境界提升！</div>`;
    } else if (flag === "breakthrough_failed") {
      return `<div class="event-flag flag-danger">⚠ 突破失败，反噬重伤！</div>`;
    } else if (flag === "death") {
      return `<div class="event-flag flag-death">☠ 你已陨落。仙途断绝。</div>`;
    } else if (flag === "near_death") {
      return `<div class="event-flag flag-danger">⚠ 命悬一线！</div>`;
    } else if (flag === "fortuitous_encounter") {
      return `<div class="event-flag flag-luck">✦ 天降机缘！</div>`;
    }
    return "";
  },

  // 根据选项列表渲染按钮。optionRisks 仅作内部元数据（playtest 断言 / AI 上下文），
  // 不再向玩家展示风险角标——危机感交由文案本身营造，避免"看提示做题"消解「抉择有重量」
  renderOptionsFromList(options, eventFlag, risks) {
    const optEl = document.getElementById("action-options");
    optEl.innerHTML = "";
    if (eventFlag === "death") {
      const recap = (Game && Game.buildEndingRecap) ? Game.buildEndingRecap("death") : "";
      optEl.innerHTML =
        recap +
        `<button class="btn btn-primary" onclick="UI.showEndingBiography()">📜 仙途终章（完整列传）</button>` +
        `<button class="btn btn-danger-full" onclick="UI.endGame()">仙途已尽，重入轮回</button>`;
      return;
    }
    if (eventFlag === "ascension" || eventFlag === "craft_ascension") {
      const recap = (Game && Game.buildEndingRecap) ? Game.buildEndingRecap("ascension") : "";
      optEl.innerHTML =
        recap +
        `<button class="btn btn-primary" onclick="UI.showAscensionVictory()">📜 仙途列传</button>` +
        `<button class="btn btn-danger-full" onclick="UI.endGame()">重入轮回</button>`;
      return;
    }
    if (options && options.length > 0) {
      options.forEach((opt, i) => {
        const btn = document.createElement("button");
        // optionRisks 仅作内部元数据（playtest 断言 / AI 上下文），不再向玩家展示风险角标
        btn.className = "btn btn-option";
        btn.textContent = opt;
        if (false) { // 风险角标已停止向玩家展示，保留结构便于未来按需复用
          const tag = document.createElement("span");
          tag.className = "opt-risk " + (risk === "lethal" ? "opt-risk-lethal" : "opt-risk-danger");
          tag.textContent = risk === "lethal" ? "☠ 生死一线" : "⚠ 此行凶险";
          btn.appendChild(tag);
        }
        btn.onclick = () => UI.sendAction(opt);
        optEl.appendChild(btn);
      });
    }
    document.getElementById("action-input-area").style.display = "";
  },

  // ============ 流式输出处理 ============
  onStreamChunk(delta, full) {
    const storyEl = document.getElementById("story-text");
    // 流式文本追加在末尾的“实时块”中，不覆盖已有故事
    let live = document.getElementById("live-story");
    if (!live) {
      live = document.createElement("div");
      live.id = "live-story";
      live.className = "story-content streaming";
      storyEl.appendChild(live);
    }
    // stream() 已做 narrative 提取，full 为纯剧情文本；空时保留加载提示
    live.innerHTML = full ? this.escapeHtml(full) : "<em>天道运转中……</em>";
    storyEl.scrollTop = storyEl.scrollHeight;
    // 隐藏选项区
    document.getElementById("action-options").innerHTML = "";
    document.getElementById("action-input-area").style.display = "none";
    document.getElementById("loading-indicator").style.display = "block";
  },

  // ============ 显示AI回复结果 ============
  displayResult(parsed, eventFlag, deltas) {
    document.getElementById("loading-indicator").style.display = "none";
    const storyEl = document.getElementById("story-text");

    let deltaHtml = "";
    if (deltas && deltas.length) {
      deltaHtml = `<div class="turn-deltas">` +
        deltas.map(d => `<span class="delta-item">${this.escapeHtml(d)}</span>`).join("") +
        `</div>`;
    }

    const finalHtml = this.flagHtmlFor(eventFlag) +
      `<div class="story-content">${this.escapeHtml(parsed.narrative)}</div>` +
      deltaHtml;

    // 将流式“实时块”替换为最终文本（避免覆盖已有故事）
    const live = document.getElementById("live-story");
    if (live) {
      live.outerHTML = finalHtml;
    } else {
      storyEl.innerHTML += finalHtml;
    }
    storyEl.scrollTop = storyEl.scrollHeight;

    // 渲染选项
    this.renderOptionsFromList(parsed.options, eventFlag, parsed.optionRisks);

    // 场景与立绘切换：AI 指定的场景优先；npc 字段存在即更新同框立绘
    if (parsed && parsed.scene && SCENE_LIB[parsed.scene]) this.setScene(parsed.scene);
    if (parsed && parsed.npc !== undefined) {
      const kind = this.npcImageFor(parsed.npc);
      this.currentNpc = kind || "";
    }

    this.renderStatus();
    this.renderInventory();
    this.renderMobileBar();
    this.renderMobileDrawer();
    // 体验节奏：阶段里程碑横幅
    this.showMilestone(Game.getPacing(Game.state.meta.playTurn));

    // 突破成功 → 自动展开仙途图谱，让玩家看到"跃迁 + 下一关目标"（关卡留人）
    if (eventFlag === "breakthrough_success") {
      this.showPathMap();
    }

    // 角色陨落，自动展开仙途终章
    if (eventFlag === 'death') {
      this.showEndingBiography();
    }
    // 白日飞升（苦修或以技证道），自动展开仙途列传
    if (eventFlag === 'ascension' || eventFlag === 'craft_ascension') {
      this.showAscensionVictory(eventFlag === 'craft_ascension');
    }

    // 像素战斗动画：复用本回合结算暂存的同一敌人（保证立绘与数值一致）
    const enemy = Game._combatEnemy || this.resolveEnemy(parsed);
    if (enemy) {
      this.showBattleStage(enemy);
    } else {
      this.hideBattleStage();
    }
  },

  // ============ 开始游戏（发送开局） ============
  async startGame() {
    if (!this.checkConfig()) return;
    const opening = Game.getOpeningPrompt(Game.state);
    const storyEl = document.getElementById("story-text");
    const live = document.createElement("div");
    live.id = "live-story";
    live.className = "story-content streaming";
    live.textContent = "天道运转中...";
    storyEl.appendChild(live);
    document.getElementById("loading-indicator").style.display = "block";

    try {
      const { parsed, eventFlag, deltas } = await Game.processAction(opening, true);
      this.displayResult(parsed, eventFlag, deltas);
      this._maybeFirstGoalToast();
    } catch (e) {
      this.showError(e.message);
    }
  },

  // 首次开局后给一条轻量目标提示（新手目标感），避免开局迷茫
  _maybeFirstGoalToast() {
    if (Game._guestMode) { this.flashToast("游客试玩：看看右侧状态与下方选项，试着走几步"); return; }
    if (localStorage.getItem("fs_goal_toast_seen")) return;
    localStorage.setItem("fs_goal_toast_seen", "1");
    setTimeout(() => this.flashToast("目标：从炼气一路突破至飞升 · 点「🧭 仙途图谱」随时看进度，点「🗺 大地图」去探索"), 600);
  },

  // ============ 发送行动 ============
  async sendAction(action) {
    if (!Game._guestMode && !this.checkConfig()) return;
    if (!Game.state.meta.alive) return;
    if (!action.trim()) return;

    // 显示用户行动
    const storyEl = document.getElementById("story-text");
    storyEl.innerHTML += `<div class="user-action">▸ ${this.escapeHtml(action)}</div>`;
    storyEl.scrollTop = storyEl.scrollHeight;

    document.getElementById("loading-indicator").style.display = "block";
    document.getElementById("action-options").innerHTML = "";
    document.getElementById("action-input-area").style.display = "none";

    try {
      const { parsed, eventFlag, deltas } = await Game.processAction(action);
      this.displayResult(parsed, eventFlag, deltas);
      // 世界被神魔大战波及湮灭 → 投影重投诸天万界
      const destroyedCause = Game.consumeWorldDestroyed();
      if (destroyedCause) this.enterReincarnation(destroyedCause);
    } catch (e) {
      this.showError(e.message);
    }
  },

  // ============ 自由输入行动 ============
  sendCustomAction() {
    const input = document.getElementById("action-input");
    const action = input.value.trim();
    if (!action) return;
    // 关键词指令：回复「刷新」即重新生成上一回合内容（应对卡住/内容异常）
    if (action === "刷新" || action.indexOf("刷新") === 0) {
      input.value = "";
      this.handleRefresh();
      return;
    }
    input.value = "";
    this.sendAction(action);
  },

  // ============ 刷新上一回合（输入「刷新」触发） ============
  async handleRefresh() {
    if (!Game.lastSnapshot) {
      this.showToast("暂无可用回合可刷新");
      return;
    }

    // 强制重置（卡住时 isProcessing 就是 true，必须无条件重置）
    Game.isProcessing = false;

    // 恢复快照
    Game.state = JSON.parse(JSON.stringify(Game.lastSnapshot.state));
    Game.history = JSON.parse(JSON.stringify(Game.lastSnapshot.history));
    Game.log = JSON.parse(JSON.stringify(Game.lastSnapshot.log));
    Game.save();

    // 重新渲染到上一轮结束
    this.renderHistory();

    const action = Game.lastSnapshot.action;
    const isOpening = Game.lastSnapshot.isOpening;

    if (!isOpening) {
      const storyEl = document.getElementById("story-text");
      storyEl.innerHTML += `<div class="user-action">▸ ${this.escapeHtml(action)}</div>`;
      storyEl.scrollTop = storyEl.scrollHeight;
    }

    document.getElementById("loading-indicator").style.display = "block";
    document.getElementById("action-options").innerHTML = "";
    document.getElementById("action-input-area").style.display = "none";

    try {
      const { parsed, eventFlag, deltas } = await Game.processAction(action, isOpening);
      this.displayResult(parsed, eventFlag, deltas);
    } catch (e) {
      this.showError(e.message);
    }
  },

  // ============ 结束/重开 ============
  endGame() {
    if (confirm("确定要放弃这段仙途，重新开始吗？存档将被清除。")) {
      Game.deleteSave();
      this.show("menu");
    }
  },

  // ============ 设置页面 ============
  renderSettings() {
    const cfg = AIService.getConfig();
    document.getElementById("set-apikey").value = cfg.apiKey;
    document.getElementById("set-baseurl").value = cfg.baseURL;
    document.getElementById("set-model").value = cfg.model;
    document.getElementById("set-temp").value = cfg.temperature;
    document.getElementById("set-maxtok").value = cfg.maxTokens;
    document.getElementById("temp-val").textContent = cfg.temperature;
    const modeSel = document.getElementById("set-narrative-mode");
    if (modeSel) modeSel.value = (Game.state && Game.state.narrationMode) || "standard";
    const px = document.getElementById("set-pixel");
    if (px) px.checked = document.body.classList.contains("pixel");
    const ap = document.getElementById("set-aiportrait");
    const apk = document.getElementById("set-aiportrait-key");
    const apl = document.getElementById("set-aiportrait-lib");
    const aplb = document.getElementById("set-aiportrait-libbase");
    if (ap && apk) {
      const c = (typeof ArtEngine !== "undefined") ? ArtEngine.cfg() : { enabled: false, key: "" };
      ap.checked = !!c.enabled;
      apk.value = c.key || "";
      if (apl) apl.checked = !!c.libEnabled;
      if (aplb) aplb.value = c.libBase || "";
    }
  },

  // 像素风开关：切换 body.pixel 并持久化
  togglePixel(on) {
    if (typeof on === "undefined") on = !document.body.classList.contains("pixel");
    document.body.classList.toggle("pixel", on);
    try { localStorage.setItem("fx_pixel", on ? "1" : "0"); } catch (e) {}
    this.initPixelFx();
  },

  // AI 立绘开关：切换 localStorage 配置（Key 在保存时一并写入）
  toggleAiPortrait(on) {
    if (typeof on === "undefined") {
      const el = document.getElementById("set-aiportrait");
      on = el ? el.checked : false;
    }
    try {
      const cur = (typeof ArtEngine !== "undefined") ? ArtEngine.cfg() : {};
      localStorage.setItem("xianxia_ai_portrait", JSON.stringify({
        enabled: on, key: cur.key || "",
        libEnabled: cur.libEnabled || false, libBase: cur.libBase || "",
      }));
    } catch (e) {}
  },

  // 托管库开关：仅切 libEnabled，地址在保存时写入
  toggleAiPortraitLib(on) {
    if (typeof on === "undefined") {
      const el = document.getElementById("set-aiportrait-lib");
      on = el ? el.checked : false;
    }
    try {
      const cur = (typeof ArtEngine !== "undefined") ? ArtEngine.cfg() : {};
      localStorage.setItem("xianxia_ai_portrait", JSON.stringify({
        enabled: cur.enabled || false, key: cur.key || "",
        libEnabled: on, libBase: cur.libBase || "",
      }));
    } catch (e) {}
  },

  saveSettings() {
    const cfg = {
      apiKey: document.getElementById("set-apikey").value.trim(),
      baseURL: document.getElementById("set-baseurl").value.trim(),
      model: document.getElementById("set-model").value.trim(),
      temperature: parseFloat(document.getElementById("set-temp").value),
      maxTokens: parseInt(document.getElementById("set-maxtok").value),
    };
    AIService.saveConfig(cfg);
    const modeSel = document.getElementById("set-narrative-mode");
    if (modeSel && Game.state) {
      Game.state.narrationMode = modeSel.value || "standard";
      Game.save();
    }

    // AI 立绘配置（与 DeepSeek Key 同理：本地存储，不联网上传游戏数据）
    try {
      const apEl = document.getElementById("set-aiportrait");
      const apkEl = document.getElementById("set-aiportrait-key");
      const aplEl = document.getElementById("set-aiportrait-lib");
      const aplbEl = document.getElementById("set-aiportrait-libbase");
      localStorage.setItem("xianxia_ai_portrait", JSON.stringify({
        enabled: !!(apEl && apEl.checked),
        key: (apkEl && apkEl.value.trim()) || "",
        libEnabled: !!(aplEl && aplEl.checked),
        libBase: (aplbEl && aplbEl.value.trim()) || "",
      }));
    } catch (e) {}

    alert("设置已保存");
    this.show("menu");
  },

  // 快速预设
  applyPreset(provider) {
    const presets = {
      deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
      qwen:     { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
      openai:   { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
      ollama:   { baseURL: "http://localhost:11434/v1", model: "qwen2.5:7b" },
      siliconflow: { baseURL: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
    };
    const p = presets[provider];
    if (!p) return;
    document.getElementById("set-baseurl").value = p.baseURL;
    document.getElementById("set-model").value = p.model;
  },

  // ============ 内测管理 ============
  generateBetaCodes() {
    const cfg = AIService.getConfig();
    if (!cfg.apiKey) {
      alert('请先在上方填写 API Key 并保存');
      return;
    }
    const codes = BetaCode.generate(cfg.apiKey, cfg.baseURL, cfg.model);
    this._lastBetaCodes = codes.map(c => c.code);
    const resultEl = document.getElementById('beta-codes-result');
    let html = '<div class="beta-codes-list">';
    codes.forEach((c, i) => {
      html += '<div class="beta-code-item">' +
        '<span class="beta-code-label">内测号 ' + c.index + '</span>' +
        '<input type="text" class="beta-code-input" id="beta-code-' + i + '" value="' + c.code + '" readonly>' +
        '<button class="btn btn-sm btn-ghost" onclick="UI.copyBetaCode(' + i + ')">复制</button>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="beta-share-tip">';
    html += '<p>分享方式：将内测号发给试玩者 → 打开网站 → 点「内测通道」→ 粘贴内测号 → 直接开玩</p>';
    html += '<button class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="UI.copyAllBetaCodes()">复制全部内测号</button>';
    html += '</div>';
    resultEl.innerHTML = html;
  },

  copyBetaCode(index) {
    const code = this._lastBetaCodes[index];
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.showToast('内测号已复制');
    }).catch(() => {
      const el = document.getElementById('beta-code-' + index);
      if (el) { el.select(); document.execCommand('copy'); this.showToast('已复制'); }
    });
  },

  copyAllBetaCodes() {
    if (!this._lastBetaCodes) return;
    const text = this._lastBetaCodes.map((c, i) => '内测号' + (i + 1) + '：\n' + c).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('全部内测号已复制');
    }).catch(() => {
      this.showToast('复制失败，请手动选择');
    });
  },

  showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  },

  activateBeta() {
    const input = document.getElementById('beta-code-input').value.trim();
    const statusEl = document.getElementById('beta-status');
    if (!input) {
      statusEl.innerHTML = '<div class="error-msg">请输入内测号</div>';
      return;
    }
    const config = BetaCode.validate(input);
    if (!config) {
      statusEl.innerHTML = '<div class="error-msg">内测号无效，请检查后重试</div>';
      return;
    }

    const usage = BetaCode.getUsage(config.index);
    const max = BetaCode.getMaxUses();
    if (usage >= max) {
      statusEl.innerHTML = '<div class="error-msg">该内测号已达使用上限（' + max + '轮）</div>';
      return;
    }

    AIService.saveConfig({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      temperature: 0.85,
      maxTokens: 1200,
    });

    localStorage.setItem('beta_user_index', config.index);

    const remaining = max - usage;
    statusEl.innerHTML = '<div class="event-flag flag-success">内测号验证成功！剩余 ' + remaining + ' 轮交互</div>';

    setTimeout(() => {
      UI.show('menu');
      UI.showToast('已激活，可开始游戏');
    }, 1500);
  },

  // ============ 工具 ============
  checkConfig() {
    if (!AIService.hasConfig()) {
      alert("请先在设置中配置 API Key");
      this.show("settings");
      return false;
    }
    return true;
  },

  // 把底层报错翻译成玩家能懂的中文，并给出可操作指引
  _translateApiError(msg) {
    if (!msg) return { text: "发生未知错误，请重试。", tip: "" };
    if (/401/.test(msg)) return { text: "API Key 无效或未授权（401）。", tip: "请到「设置 / API配置」检查 Key 是否填写正确、是否已过期。" };
    if (/403/.test(msg)) return { text: "该账号无权访问此模型（403）。", tip: "请更换模型（如 deepseek-v4-flash）或确认账号额度。" };
    if (/429/.test(msg)) return { text: "请求过于频繁，已被限流（429）。", tip: "已自动重试；若仍失败，请稍候片刻再试。" };
    if (/400/.test(msg)) return { text: "请求参数有误（400）。", tip: "请到设置页确认 Base URL 与模型名称是否匹配你的服务商。" };
    if (/(网络|超时|超时（|fetch|NetworkError|load failed|timeout)/i.test(msg)) return { text: msg, tip: "请检查网络连接，或确认所使用的 API 服务当前可用。" };
    if (/5\d\d/.test(msg)) return { text: "AI 服务暂时不稳定（服务器错误）。", tip: "已自动重试；若仍失败，请稍后再试。" };
    return { text: msg, tip: "请检查设置中的 API 配置后重试。" };
  },

  showError(msg) {
    document.getElementById("loading-indicator").style.display = "none";
    document.getElementById("action-input-area").style.display = "";
    // 移除残留的流式块
    const live = document.getElementById("live-story");
    if (live) live.remove();
    const t = this._translateApiError(msg);
    const canRetry = !UI._guestMode && !!Game.lastSnapshot && !!Game.lastSnapshot.action;
    const retryBtn = canRetry ? `<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="UI.retryLastAction()">↻ 重试此回合</button>` : "";
    const storyEl = document.getElementById("story-text");
    storyEl.innerHTML += `<div class="error-msg">⚠ ${this.escapeHtml(t.text)}<br><span style="color:var(--text-dim);font-size:13px">${this.escapeHtml(t.tip)}</span><br>${retryBtn}</div>`;
    storyEl.scrollTop = storyEl.scrollHeight;
  },

  // 重试上一回合（内容卡住/报错时：恢复快照后重新发送）
  async retryLastAction() {
    if (!Game.lastSnapshot) { this.showToast("暂无可用回合可重试"); return; }
    Game.isProcessing = false;
    Game.state = JSON.parse(JSON.stringify(Game.lastSnapshot.state));
    Game.history = JSON.parse(JSON.stringify(Game.lastSnapshot.history));
    Game.log = JSON.parse(JSON.stringify(Game.lastSnapshot.log));
    Game.save();
    this.renderHistory();
    const action = Game.lastSnapshot.action;
    const isOpening = Game.lastSnapshot.isOpening;
    if (!isOpening) {
      const storyEl = document.getElementById("story-text");
      storyEl.innerHTML += `<div class="user-action">▸ ${this.escapeHtml(action)}</div>`;
      storyEl.scrollTop = storyEl.scrollHeight;
    }
    document.getElementById("loading-indicator").style.display = "block";
    document.getElementById("action-options").innerHTML = "";
    document.getElementById("action-input-area").style.display = "none";
    try {
      const { parsed, eventFlag, deltas } = await Game.processAction(action, isOpening);
      this.displayResult(parsed, eventFlag, deltas);
    } catch (e) {
      this.showError(e.message);
    }
  },

  // ============ 上香祈愿 / 虚拟香火（不收钱） ============
  showSupport() {
    const cfg = (window.GAME_CONFIG && window.GAME_CONFIG.incense) || {};
    const title = cfg.title || "上香祈愿";
    const note = cfg.note || "若《浮生仙途》为你带来片刻仙缘，不妨燃一炷清香。此香不收银钱，只纳心意。";
    document.getElementById("support-title").textContent = title;
    document.getElementById("support-note").textContent = note;
    this.renderIncense();
    document.getElementById("support-modal").classList.add("active");
  },

  // 渲染当前香火值，并清空动画/题词
  renderIncense() {
    const countEl = document.getElementById("incense-count");
    if (countEl) countEl.textContent = this.getIncenseCount();
    const anim = document.getElementById("incense-anim");
    if (anim) anim.innerHTML = "";
    const blessing = document.getElementById("incense-blessing");
    if (blessing) blessing.textContent = "";
  },

  getIncenseCount() {
    return parseInt(localStorage.getItem("fs_incense") || "0", 10) || 0;
  },

  // 燃香：纯本机数据，不联网、不收费、不绑身份
  offerIncense(amt) {
    const next = this.getIncenseCount() + amt;
    localStorage.setItem("fs_incense", String(next));
    const countEl = document.getElementById("incense-count");
    if (countEl) countEl.textContent = next;

    // 升烟粒子动画
    const anim = document.getElementById("incense-anim");
    if (anim) {
      anim.innerHTML = "";
      const n = Math.min(amt, 9);
      for (let i = 0; i < n; i++) {
        const p = document.createElement("span");
        p.className = "incense-particle";
        p.style.animationDelay = (i * 0.12) + "s";
        anim.appendChild(p);
      }
    }

    // 随机题词
    const blessings = [
      "青烟一缕，天道已闻。",
      "香火入袖，此身再续推演。",
      "善缘既结，来日方长。",
      "心香一瓣，胜过千金。",
      "你燃的香，已化作这方天地的星火。",
      "因果不昧，心中有道便好。",
    ];
    const blessingEl = document.getElementById("incense-blessing");
    if (blessingEl) blessingEl.textContent = blessings[Math.floor(Math.random() * blessings.length)];
  },

  closeSupport() {
    document.getElementById("support-modal").classList.remove("active");
  },

  // ============ 体验节奏 · 里程碑横幅 ============
  showMilestone(pacing) {
    const el = document.getElementById("milestone-banner");
    if (!el) return;
    if (pacing.milestone || pacing.finale) {
      const isFinale = !!pacing.finale;
      const extra = isFinale
        ? `<div class="milestone-note">仙途功成，白日飞升——此乃真正大结局之"合"。天地更辽阔，此后可自由续写仙界新篇。</div>`
        : `<div class="milestone-note">仙途至此，别开生面。</div>`;
      el.className = "milestone-banner" + (isFinale ? " climax" : "");
      el.innerHTML = `<div class="milestone-inner">
        <div class="milestone-kicker">${isFinale ? "终卷·飞升" : "新篇章"}</div>
        <div class="milestone-name">【${pacing.phaseName}】</div>
        ${extra}
      </div>`;
      // 重新触发入场动画
      el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    } else {
      el.className = "milestone-banner";
      el.innerHTML = "";
    }
  },

  // ============ 仙途图谱（关卡脉络弹窗） ============
  showPathMap() {
    const info = Game.getPathInfo();
    const el = document.getElementById("pathmap-body");
    if (!el || !info) return;

    const ladderHtml = info.ladder.map((s) => {
      const cls = s.current ? "pl-node pl-current" : (s.done ? "pl-node pl-done" : "pl-node pl-locked");
      const mark = s.current ? "◉ " : (s.done ? "✔ " : "○ ");
      return `<div class="${cls}">${mark}${this.escapeHtml(s.name)}</div>`;
    }).join('<div class="pl-arrow">→</div>');

    const branchTag = { secret: "秘境", trial: "试炼", sidequest: "支线", weekly: "周秘" };
    const branchesHtml = info.branches.length
      ? info.branches.map((b) => {
          const tag = branchTag[b.branch] || b.type;
          const timed = b.timed ? `<span class="pl-timed">限时 ${b.timed} 程</span>` : "";
          return `<div class="pl-branch ${b.branch === "weekly" ? "pl-branch-weekly" : ""}">
            <b>${this.escapeHtml(b.name)}</b> · ${tag} ${timed}
            <div class="pl-branch-desc">${this.escapeHtml(b.desc || "")}</div>
          </div>`;
        }).join("")
      : '<div class="pl-empty">此界暂无支线历练节点。</div>';

    el.innerHTML = `
      <div class="pl-act">本幕 · ${this.escapeHtml(info.actName)}${info.finale ? "（终卷·飞升）" : ""}</div>
      <div class="pl-goal">当前 ${this.escapeHtml(info.realmName)} → 目标 ${info.nextRealmName ? this.escapeHtml(info.nextRealmName) : "飞升功成"}（还需突破 ${info.stepsToNext} 次）</div>
      <div class="pl-section-title">境界阶梯 · 主线（关键路径）</div>
      <div class="pl-ladder">${ladderHtml}</div>
      <div class="pl-section-title">可选历练 · 秘境 / 试炼 / 支线</div>
      <div class="pl-branches">${branchesHtml}</div>`;
    this.show("pathmap");
  },

  // 本周秘境详情（大地图点选金色节点）
  showWeeklyDetail() {
    const gen = (Game.state && Game.state.world && Game.state.world.gen);
    if (!gen || typeof WorldGen === "undefined") return;
    let wk = null;
    try { wk = WorldGen.weeklySecretRealm(gen.seed); } catch (e) { return; }
    if (!wk) return;
    const dt = ["", "平和", "微险", "凶险", "险峻", "险绝", "危厄", "凶煞", "绝命", "通天", "飞升"][Math.min(10, wk.danger)] || "凶险";
    let html = `<h3>${this.escapeHtml(wk.name)} <span class="md-week">本周秘境</span></h3>`;
    html += `<div class="md-macro">${wk.macro} · <span class="md-type">${wk.type}</span></div>`;
    html += `<div class="md-desc">${this.escapeHtml(wk.desc)}</div>`;
    html += `<div class="md-row"><b>凶险程度：</b>${wk.danger} / 10（${dt}）</div>`;
    html += `<div class="md-row"><b>开启窗口：</b>限时 ${wk.timed} 程 · ${wk.weekLabel}（本周有效，过期需候七日轮回）</div>`;
    html += `<div class="md-row" style="color:var(--gold-bright)">★ 整周稳定开启，错过本周再候轮回——宜早访。</div>`;
    const detail = document.getElementById("map-detail");
    if (detail) detail.innerHTML = html;
  },

  // 持久化的"本幕/目标"指示条（游戏主屏顶部，让玩家随时知道身在何关）
  updateActBanner() {
    const el = document.getElementById("act-banner");
    if (!el || !Game.state) return;
    const info = Game.getPathInfo();
    if (!info) return;
    const goal = info.nextRealmName
      ? `→ 目标 ${info.nextRealmName}（再突破 ${info.stepsToNext} 次）`
      : "→ 飞升功成";
    el.innerHTML = `<span class="act-name">${this.escapeHtml(info.actName)}</span><span class="act-goal">${this.escapeHtml(info.realmName)} ${goal}</span>`;
    el.style.display = "";
  },

  // ============ 仙途列传 / 终章 ============
  _bioIsEnding: false,

  async viewBiography() {
    if (!Game.state) return;
    this._bioIsEnding = false;
    this.openBiographyModal();
    await this._generateAndShowBiography();
  },

  async showEndingBiography() {
    if (!Game.state) return;
    this._bioIsEnding = true;
    this.openBiographyModal();
    await this._generateAndShowBiography();
  },

  // 白日飞升（苦修或以技证道）：以"仙途功成"终章呈现修士列传
  showAscensionVictory(craftDao) {
    if (!Game.state) return;
    Game.state.meta.ascended = true;
    Game.state.meta.alive = true;
    Game.save();
    this._bioIsEnding = true;
    this.openBiographyModal();
    const title = modal => modal.querySelector('.bio-title');
    const modal = document.getElementById('biography-modal');
    if (modal) {
      modal.querySelector('.bio-title').textContent = craftDao ? '以技证道 · 白日飞升' : '仙途功成 · 白日飞升';
    }
    this._generateAndShowBiography();
  },

  openBiographyModal() {
    const modal = document.getElementById('biography-modal');
    modal.classList.add('active');
    modal.querySelector('.bio-title').textContent = this._bioIsEnding ? '仙途终章 · 修士列传' : '仙途列传 · 当前修士小传';
    modal.querySelector('.bio-content').innerHTML = '<div class="bio-loading">史官执笔，为君立传……</div>';
    const restartBtn = modal.querySelector('.bio-restart');
    restartBtn.textContent = this._bioIsEnding ? '重入轮回（清除存档）' : '返回仙途';
    modal.querySelector('.bio-actions').style.display = 'none';
  },

  async _generateAndShowBiography() {
    const modal = document.getElementById('biography-modal');
    const content = modal.querySelector('.bio-content');
    const actions = modal.querySelector('.bio-actions');
    const done = (text) => {
      actions.style.display = '';
      modal.querySelector('.bio-copy').onclick = () => this.copyBiography(text);
      const restartBtn = modal.querySelector('.bio-restart');
      if (this._bioIsEnding) {
        restartBtn.onclick = () => { this.closeBiography(); UI.endGame(); };
      } else {
        restartBtn.onclick = () => this.closeBiography();
      }
    };
    try {
      let full = '';
      await AIService.generateBiography(Game.state, (delta, fullText) => {
        full = fullText;
        content.innerHTML = this.escapeHtml(fullText).replace(/\n/g, '<br>');
      });
      Game.saveBiography(full);
      done(full);
    } catch (e) {
      const fallback = Game.buildFallbackBiography();
      Game.saveBiography(fallback);
      content.innerHTML = this.escapeHtml(fallback).replace(/\n/g, '<br>');
      done(fallback);
    }
  },

  copyBiography(text) {
    const t = text || (Game.state && Game.state.biography) || '';
    navigator.clipboard.writeText(t).then(() => {
      this.showToast('传记已复制，可分享给道友');
    }).catch(() => {
      this.showToast('复制失败，请手动选择');
    });
  },

  closeBiography() {
    document.getElementById('biography-modal').classList.remove('active');
  },

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },
};

// ============================================================
//  启动
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  // 模型名自动迁移：DeepSeek 旧名（deepseek-chat / deepseek-reasoner）已于 2026-07-24 停用
  const _migCfg = AIService.getConfig();
  if (_migCfg.model === "deepseek-chat" || _migCfg.model === "deepseek-reasoner") {
    _migCfg.model = "deepseek-v4-flash";
    AIService.saveConfig(_migCfg);
  }
  // 检查URL hash中的内测号（分享链接直接激活）
  if (location.hash.startsWith('#beta=')) {
    const code = location.hash.slice(6);
    const config = BetaCode.validate(code);
    if (config) {
      AIService.saveConfig({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
        temperature: 0.85,
        maxTokens: 1200,
      });
      localStorage.setItem('beta_user_index', config.index);
    }
  }

  // 像素风偏好（默认开启，设置页可关）
  try {
    if (localStorage.getItem("fx_pixel") === "0") document.body.classList.remove("pixel");
  } catch (e) {}

  UI.initPixelFx();
  UI._loadRecentEnemies();
  UI.show("menu");

  // 温度滑块实时显示
  const tempSlider = document.getElementById("set-temp");
  if (tempSlider) {
    tempSlider.addEventListener("input", e => {
      document.getElementById("temp-val").textContent = e.target.value;
    });
  }

  // 回车发送
  const input = document.getElementById("action-input");
  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        UI.sendCustomAction();
      }
    });
  }
});
