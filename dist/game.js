// ============================================================
//  《浮生仙途》游戏引擎
//  Game Engine & State Manager
// ============================================================

// 叙事节奏（篇幅档位）：由玩家在选人页/设置页选择，决定每回合文本长度与 max_tokens 上限
// 注：原「短剧形式」与「电视剧形式」已融合为单一的「电视剧形式」（可长可短、快节奏到情景交融），
// 仅保留「电视剧形式」与「沉浸世界」两档，降低玩家选择负担。
const NARRATIVE_MODES = [
  { key: "standard",  label: "电视剧形式", desc: "快节奏到情景交融·可长可短·一屏至数屏",     maxTokens: 1500,
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
        form: opts.form || "human",   // 魂穿形态：人/妖/器/灵……任意
        wish: opts.wish || null,        // 玩家许愿
        cultivationSystem: cultivationSystemName, // 本界修行体系之名（灵根/血脉/命格…）
        root: root.name,
        element: root.element || "",
        affinity: root.affinity,
        background: bg.name,
        // 修为
        realm: realm0.name,
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

    // 调试：把 AI 返回的状态变更打印到控制台，便于排查“剧情写了但状态没动”
    console.log("[applyChanges]", JSON.stringify(ch));

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
    if (ch.realm_progress !== undefined) {
      const inc = Math.max(-5, Math.min(12, Number(ch.realm_progress) || 0)); // 单次增量钳制，防一回合摸顶
      const before = c.realmProgress;
      c.realmProgress = clamp(c.realmProgress + inc, 0, 100);
      const v = c.realmProgress - before;
      if (c.realmProgress >= 100) {
        const bf = this.handleBreakthrough();
        deltas.push(bf === "breakthrough_success" ? "突破成功！境界提升" : "突破失败，反噬重伤");
        return { flag: bf, deltas };
      }
      if (v !== 0) deltas.push(`突破进度 ${v > 0 ? "+" : ""}${v}`);
    }
    if (ch.realm_level_change !== undefined && typeof ch.realm_level_change === "number" && ch.realm_level_change !== 0) {
      const oldLevel = c.realmLevel;
      c.realmLevel = clamp(c.realmLevel + ch.realm_level_change, 1, REALMS.length);
      if (c.realmLevel !== oldLevel) {
        c.realm = REALMS[Math.max(0, c.realmLevel - 1)].name;
        c.realmProgress = 0;
        deltas.push(`境界变为 ${c.realm}`);
      }
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
    if (ch.pet_gained) {
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
    if (ch.pet_updated && c.pet) {
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
      if (planted.length) deltas.push("埋下伏笔：" + planted.join("；"));
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
      if (resolvedList.length) deltas.push("伏笔回收：" + resolvedList.join("；"));
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
    if (c.realmLevel >= REALMS.length) return "max_realm";
    const nextRealm = REALMS[c.realmLevel];
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
      c.realmLevel++;
      c.realm = nextRealm.name;
      c.realmProgress = 0;
      c.maxQi = nextRealm.maxQi;
      c.qi = c.maxQi;
      c.maxLifespan = Math.floor(c.maxLifespan * 1.5);
      c.lifespan = c.maxLifespan;
      c.maxHp = Math.floor(c.maxHp * 1.3);
      c.hp = c.maxHp;
      this.state.meta.breakthroughTurn = this.state.meta.playTurn || 1;
      this.state.meta.realmMilestoneTurn = this.state.meta.playTurn || 1;
      this.save();
      return "breakthrough_success";
    } else {
      c.realmProgress = 60; // 回退一些进度
      c.hp = Math.floor(c.hp * 0.5); // 突破失败重伤
      this.state.meta.breakthroughTurn = this.state.meta.playTurn || 1;
      this.save();
      return "breakthrough_failed";
    }
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
      // 内测用户使用计数
      const betaIdx = localStorage.getItem('beta_user_index');
      if (betaIdx) BetaCode.incrementUsage(parseInt(betaIdx));
      const { flag: eventFlag, deltas } = this.applyChanges(parsed.state_changes);
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
    let intro = `我是「${c.name}」，${c.root}修士，出身「${c.background}」，目前境界${c.realm}。`;
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
    intro += `此刻我在${w.location}，时值${w.timeOfDay}，天气${w.weather.name}。\n请为我开启修仙之路：描写契合当下情境的开场场景，自然引出第一个事件或遭遇，不要预设我的性格或际遇。给我3-4个具体行动选项。`;
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
    narrative: "你自一阵清梦中转醒。窗外是青峦叠嶂，山门「玄霄宗」三字被晨雾洇得半湿。你记得自己应是来此求道的散修，随身唯有半卷残破功诀。廊下扫地的老者瞥你一眼，未言，只把扫帚往偏殿一指——那里飘出淡淡药香。",
    options: ["前往偏殿，看看那药香从何而来 [平安]", "向扫地老者拱手行礼，打听宗门规矩 [平安]", "先在山门广场打坐，稳固初入此界的气息 [平安]", "翻看怀中残卷，试着记诵其中口诀 [平安]"],
    state_changes: {},
  },
  {
    narrative: "偏殿内，一名青衣弟子正守着丹炉。炉中赤焰温吞，一缕青烟笔直升起，竟在半空凝成个小小丹丸虚影。他见你进来，挑眉道：「师弟也是来蹭丹火的？这炉『培元丹』还需半刻，你若愿替我看火，便分你一粒。」",
    options: ["爽快答应替他看火，结识这位青衣弟子 [平安]", "好奇问他这丹丸有何用处 [平安]", "婉拒，转而问宗门后山可有灵脉可采 [平安]", "不动声色，记下丹炉火候的诀窍 [平安]"],
    state_changes: { items_gained: [{ name: "培元丹", kind: "丹药", desc: "温养灵气的下品丹丸", grade: "下品" }], npc_affinity_change: { "青衣弟子·陆昭": 8 } },
  },
  {
    narrative: "半个时辰后丹成。陆昭抛来一粒温润丹丸，你自己也趁热打坐运转功诀，竟觉丹田一暖，灵力隐隐增长。殿外忽传来钟鸣——竟是宗门开放「试炼林」猎妖，胜者可入藏经阁择一门真传。陆昭眨眼：「想去？我替你报名。」",
    options: ["随陆昭去试炼林，猎妖夺真传 [凶险]", "先服下培元丹，巩固修为再前往 [平安]", "打听试炼林里都有些什么妖兽 [平安]", "向陆昭讨教一门入门身法再上路 [平安]"],
    state_changes: { realm_progress: 12, qi: 20, items_lost: ["培元丹"] },
  },
  {
    narrative: "试炼林外雾气森森。你刚踏进林口，草丛便一阵窸窣——一头赤鳞小蟒昂首吐信，独目泛着幽光。它并不急着扑来，只是缓缓游近，似在掂量你的斤两。林间风过，吹落几片红叶，正落在你剑前。",
    options: ["拔剑示警，先发制人 [凶险]", "以灵力探查这蟒的修为深浅 [平安]", "且退半步，观察它的行动规律 [平安]", "抛出一枚培元丹为饵，引它分神 [平安]"],
    state_changes: { combat_encounter: true },
  },
  {
    narrative: "一番缠斗，你借红叶蔽眼、剑走偏锋，终将赤鳞小蟒逼退入草。虽未取其性命，却摸清了荒野妖兽的凶悍与机变。陆昭在不远处抚掌而笑：「有点意思。藏经阁的真传，你够格去挑了。」远处山巅，云海翻涌，隐约有仙宫轮廓。",
    options: ["随陆昭直奔藏经阁，择取真传功法 [平安]", "先就地调息，恢复方才激斗的消耗 [平安]", "回望试炼林，记下这头蟒的出没之地 [平安]", "向陆昭打听山巅那座仙宫的来历 [平安]"],
    state_changes: { realm_progress: 18, cause_credit_change: 6, npc_affinity_change: { "青衣弟子·陆昭": 10 } },
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
    const cur = (Game.state.world && Game.state.world.location) || gen.startLocation;

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
    let zones = "";
    (gen.macroRegions || []).forEach(m => {
      const b = box[m.name]; if (!b) return;
      const x0 = b.x0 - 55, y0 = b.y0 - 45, x1 = b.x1 + 55, y1 = b.y1 + 45;
      const cx = (x0 + x1) / 2;
      zones += `<rect class="map-zone" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"></rect>`;
      zones += `<text class="map-zone-label" x="${cx}" y="${y0 + 22}" text-anchor="middle">${m.name}</text>`;
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

    // 3) 地域节点
    let nodes = "";
    pts.forEach((r, i) => {
      const isCur = r.name === cur;
      const rad = 10 + Math.min(6, r.danger);
      // 关卡设计：可选分支节点（秘境/试炼/支线）加高亮类，让玩家一眼看到"可玩支线"
      const isBranch = (r.branch === "secret" || r.branch === "trial" || r.branch === "sidequest");
      const branchCls = isBranch ? ("map-branch map-branch-" + r.branch) : "";
      nodes += `<g class="map-node ${isCur ? "map-current" : ""} ${branchCls}" data-i="${i}" data-branch="${r.branch || ""}" onclick="UI.showRegionDetail(${i})">`
        + `<circle class="node-core" cx="${r.x}" cy="${r.y}" r="${rad}" fill="${dangerColor(r.danger)}" stroke="#000" stroke-width="1.5"></circle>`
        + `<text x="${r.x}" y="${r.y + 5}" text-anchor="middle" font-size="13" fill="#0b0d14" style="pointer-events:none;font-weight:bold">${r.name[0]}</text>`
        + `<text class="node-label" x="${r.x}" y="${r.y + rad + 16}" text-anchor="middle">${r.name}</text>`
        + `</g>`;
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
    // 当前位置脉冲环
    const curR = pts.find(r => r.name === cur);
    const ring = curR ? `<circle class="map-current-ring" cx="${curR.x}" cy="${curR.y}" r="18"></circle>` : "";

    canvas.innerHTML = `<svg class="world-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
      + `<defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop class="sky-top" offset="0"/><stop class="sky-bot" offset="1"/></linearGradient>`
      + `<linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0"><stop class="river-a" offset="0"/><stop class="river-b" offset="1"/></linearGradient></defs>`
      + `<rect class="terr-sky" x="0" y="0" width="${W}" height="${H}"/>`
      + `<path class="terr-sea" d="${seaBlob}"/>`
      + `<path class="terr-mtn terr-mtn-back" d="${mtnBack}"/>`
      + `<path class="terr-mtn terr-mtn-front" d="${mtnFront}"/>`
      + `<path class="terr-river" d="${river1}"/>` + (river2 ? `<path class="terr-river" d="${river2}"/>` : "")
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
    if (r.name === (Game.state.world.location)) html += `<div class="md-row" style="color:var(--gold-bright)">★ 你当前所在</div>`;
    const detail = document.getElementById("map-detail");
    if (detail) detail.innerHTML = html;
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
    Game.newProjection({ wish: wish || null, genderIndex: genderIndex });
    const sysName = (Game.state.world && Game.state.world.cultivationSystemName) || "灵根";
    this.flashToast(`命中之界 · 修炼体系：${sysName}`);
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

  // 移动端：输入法键盘弹起时，把吸底对话框抬到键盘上方，避免输入框被顶飞/遮挡
  initMobileKeyboardHandler() {
    if (this._mobileKbBound) return;
    this._mobileKbBound = true;
    const input = document.getElementById("action-input");
    if (!input) return;
    const dialogue = document.getElementById("vn-dialogue");
    const applyKb = () => {
      if (!window.visualViewport || !dialogue) return;
      const kbTop = window.visualViewport.height; // 视口高度（已排除键盘）
      const winH = window.innerHeight;
      const overlap = Math.max(0, winH - kbTop); // 键盘占用的高度
      dialogue.style.bottom = overlap > 0 ? overlap + "px" : "0px";
    };
    input.addEventListener("focus", () => {
      // 延迟到键盘动画完成后再抬升
      setTimeout(applyKb, 300);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", applyKb);
    });
    input.addEventListener("blur", () => {
      if (dialogue) dialogue.style.bottom = "0px";
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
      <div class="char-root">${(c.genderName || (GENDERS.find(g => g.id === c.gender) || {}).name || "修士")} · ${(c.cultivationSystem || "灵根")}·${c.root} · ${c.background}</div>
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

  // ============ 程序化 SVG 立绘（零 AI 积分，分层仙侠风，性别/体系参数化） ============
  // 主角立绘：头身比 + 道袍分层 + 体系配色 + 法器 + 灵气光晕；性别分支（男束发冠 / 女云鬓）
  _heroPortrait() {
    const c = Game.state && Game.state.character;
    if (!c) return "";
    const sys = (Game.state.world && Game.state.world.cultivationSystem) || "lingen";
    const sysCls = this._systemClass();
    const gender = c.gender === 1 ? "f" : "m";
    const name = this.escapeHtml(c.name || "修士");
    const skin = "#f1d6bd";
    let head;
    if (gender === "f") {
      head = `<ellipse class="hp-head" cx="110" cy="126" rx="23" ry="26" fill="${skin}"/>
        <path class="hp-hair" d="M85 122 Q82 92 110 92 Q138 92 135 122 Q131 103 110 103 Q89 103 85 122 Z" fill="#2b2420"/>
        <path class="hp-hair2" d="M85 122 Q80 152 93 170 L97 150 Q90 132 93 122 Z" fill="#2b2420"/>
        <path class="hp-hair2" d="M135 122 Q140 152 127 170 L123 150 Q130 132 127 122 Z" fill="#2b2420"/>
        <circle class="hp-pin" cx="110" cy="95" r="6" fill="var(--pt-accent)"/>
        <circle class="hp-pin" cx="95" cy="103" r="2.6" fill="var(--pt-accent)"/>
        <circle class="hp-pin" cx="125" cy="103" r="2.6" fill="var(--pt-accent)"/>`;
    } else {
      head = `<ellipse class="hp-head" cx="110" cy="124" rx="22" ry="25" fill="${skin}"/>
        <path class="hp-hair" d="M87 118 Q84 90 110 90 Q136 90 133 118 Q129 100 110 100 Q91 100 87 118 Z" fill="#241f1b"/>
        <rect class="hp-crown" x="100" y="83" width="20" height="12" rx="3" fill="var(--pt-accent)"/>
        <path class="hp-hair2" d="M87 118 Q83 146 95 162 L99 144 Q93 128 95 118 Z" fill="#241f1b"/>
        <path class="hp-hair2" d="M133 118 Q137 146 125 162 L121 144 Q127 128 125 118 Z" fill="#241f1b"/>`;
    }
    const artifacts = {
      lingen:   `<path class="hp-art" d="M166 150 L176 322" stroke="var(--pt-accent)" stroke-width="4" stroke-linecap="round"/><path d="M160 150 L182 150 L176 136 Z" fill="var(--pt-light)"/>`,
      xuema:    `<circle class="hp-art" cx="172" cy="205" r="12" fill="var(--pt-accent)"/><circle cx="172" cy="205" r="5" fill="#fff" opacity="0.55"/>`,
      mingge:   `<g class="hp-art" transform="translate(170,205)"><circle r="14" fill="none" stroke="var(--pt-accent)" stroke-width="2"/><path d="M0 -14 L4 0 L0 14 L-4 0 Z" fill="var(--pt-accent)"/></g>`,
      daozhong: `<path class="hp-art" d="M156 212 Q176 190 190 212 Q176 234 156 212 Z" fill="var(--pt-accent)" opacity="0.85"/>`,
      yuansu:   `<circle class="hp-art" cx="174" cy="208" r="11" fill="var(--pt-accent)" opacity="0.8"/><path d="M174 197 L178 208 L174 219 L170 208 Z" fill="#fff" opacity="0.7"/>`,
      lingshu:  `<rect class="hp-art" x="163" y="192" width="22" height="22" rx="3" fill="none" stroke="var(--pt-accent)" stroke-width="2"/><path d="M163 203 H185 M174 192 V214" stroke="var(--pt-accent)" stroke-width="1.4"/>`,
      rudao:    `<path class="hp-art" d="M166 150 Q148 232 172 322" stroke="var(--pt-accent)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      wudao:    `<rect class="hp-art" x="165" y="202" width="17" height="15" rx="3" fill="var(--pt-accent)"/>`,
    };
    const artifact = artifacts[sys] || artifacts.lingen;
    const spark = (x, y, d) => `<circle class="hp-spark" cx="${x}" cy="${y}" r="2.3" fill="var(--pt-accent)" style="animation-delay:${d}s"/>`;
    return `<div class="hero-portrait ${sysCls} gender-${gender}" title="${name}">
      <svg class="hp-svg" viewBox="0 0 220 400" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="${name}">
        <defs><radialGradient id="hpAura" cx="50%" cy="36%" r="58%">
          <stop offset="0%" stop-color="var(--pt-accent)" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="var(--pt-accent)" stop-opacity="0"/>
        </radialGradient></defs>
        <ellipse class="hp-aura" cx="110" cy="150" rx="100" ry="132" fill="url(#hpAura)"/>
        <path class="hp-cloak" d="M68 200 Q110 252 152 200 L168 362 Q110 384 52 362 Z" fill="var(--pt-dark)"/>
        <path class="hp-robe" d="M76 178 Q110 162 144 178 L152 332 Q110 352 68 332 Z" fill="var(--pt-main)"/>
        <path class="hp-inner" d="M98 184 L110 196 L122 184 L118 322 L102 322 Z" fill="var(--pt-light)"/>
        <rect class="hp-sash" x="72" y="246" width="76" height="15" rx="7" fill="var(--pt-accent)"/>
        <path class="hp-sleeve-l" d="M76 184 Q52 232 58 304 L80 304 Q78 240 92 200 Z" fill="var(--pt-main)"/>
        <path class="hp-sleeve-r" d="M144 184 Q168 232 162 304 L140 304 Q142 240 128 200 Z" fill="var(--pt-main)"/>
        <rect class="hp-neck" x="101" y="148" width="18" height="24" fill="${skin}"/>
        ${head}
        <path class="hp-brow" d="M98 121 q6 -3 11 0 M111 121 q6 -3 11 0" stroke="#5b4636" stroke-width="1.5" fill="none"/>
        <circle class="hp-eye" cx="103" cy="127" r="2.1" fill="#2a2018"/>
        <circle class="hp-eye" cx="117" cy="127" r="2.1" fill="#2a2018"/>
        <path class="hp-lip" d="M105 139 q5 3 10 0" stroke="#b5564f" stroke-width="1.5" fill="none"/>
        ${artifact}
        ${spark(58,120,0)}${spark(172,92,0.6)}${spark(38,200,1.2)}${spark(182,240,1.8)}${spark(95,58,2.4)}
      </svg>
    </div>`;
  },

  // NPC 立绘库：每种类型参数化 SVG（零积分、可组合变体，比旧 webp 更统一丰富）
  NPC_POOL: {
    old:      { label:"仙风老者", robe:"#6b6256", accent:"#d9c79a", skin:"#ead2b5", head:`<ellipse cx="100" cy="92" rx="26" ry="28" fill="#ead2b5"/><path d="M72 92 Q70 58 100 58 Q130 58 128 92 Q124 70 100 70 Q76 70 72 92 Z" fill="#e9e9e9"/><rect x="88" y="48" width="24" height="12" rx="3" fill="#cfcfcf"/><path d="M74 116 Q70 150 80 168 M126 116 Q130 150 120 168" stroke="#e9e9e9" stroke-width="4" fill="none"/><path d="M88 104 q12 6 24 0" stroke="#9a9a9a" stroke-width="2" fill="none"/>` },
    crone:    { label:"白发老妪", robe:"#7a6f7e", accent:"#e6d2e8", skin:"#e9d2bd", head:`<ellipse cx="100" cy="92" rx="25" ry="27" fill="#e9d2bd"/><path d="M74 92 Q72 58 100 58 Q128 58 126 92 Q122 68 100 68 Q78 68 74 92 Z" fill="#e6e6e6"/><path d="M76 96 Q72 130 84 150 M124 96 Q128 130 116 150" stroke="#e6e6e6" stroke-width="5" fill="none"/><path d="M88 104 q12 6 24 0" stroke="#9a9a9a" stroke-width="2" fill="none"/>` },
    maiden:   { label:"灵秀少女", robe:"#c98bb0", accent:"#ffd6ec", skin:"#f6ddc6", head:`<ellipse cx="100" cy="90" rx="24" ry="27" fill="#f6ddc6"/><path d="M76 90 Q73 56 100 56 Q127 56 124 90 Q120 66 100 66 Q80 66 76 90 Z" fill="#3a2c28"/><circle cx="100" cy="58" r="9" fill="#3a2c28"/><circle cx="100" cy="62" r="3" fill="#ffd6ec"/><path d="M88 96 q12 5 24 0" stroke="#d77fa6" stroke-width="2" fill="none"/>` },
    youth:    { label:"英气少男", robe:"#5b7aa6", accent:"#bcd6ff", skin:"#f1d6bd", head:`<ellipse cx="100" cy="90" rx="23" ry="26" fill="#f1d6bd"/><path d="M77 88 Q74 56 100 56 Q126 56 123 88 Q119 64 100 64 Q81 64 77 88 Z" fill="#2b2320"/><rect x="90" y="50" width="20" height="10" rx="2" fill="#bcd6ff"/>` },
    merchant: { label:"商贾",     robe:"#8a6d3b", accent:"#e8c97a", skin:"#eccba6", head:`<ellipse cx="100" cy="92" rx="25" ry="27" fill="#eccba6"/><path d="M75 92 Q73 62 100 62 Q127 62 125 92 Q120 70 100 70 Q80 70 75 92 Z" fill="#2c2620"/><rect x="84" y="54" width="32" height="10" rx="3" fill="#2c2620"/><circle cx="118" cy="86" r="4" fill="#e8c97a"/>` },
    daoist:   { label:"道士",     robe:"#3f6b5a", accent:"#9fe3c4", skin:"#f1d6bd", head:`<ellipse cx="100" cy="90" rx="23" ry="26" fill="#f1d6bd"/><path d="M77 88 Q74 58 100 58 Q126 58 123 88 Q119 64 100 64 Q81 64 77 88 Z" fill="#222"/><rect x="86" y="52" width="28" height="12" rx="4" fill="#9fe3c4"/>` },
    yaoxiu:   { label:"妖修化形", robe:"#7a4b86", accent:"#e0a6f0", skin:"#eccba6", head:`<ellipse cx="100" cy="90" rx="23" ry="26" fill="#eccba6"/><path d="M77 88 Q74 56 100 56 Q126 56 123 88 Q119 64 100 64 Q81 64 77 88 Z" fill="#3a2533"/><path d="M82 58 L74 44 L90 56 Z" fill="#3a2533"/><path d="M118 58 L126 44 L110 56 Z" fill="#3a2533"/><circle cx="92" cy="90" r="3" fill="#e0a6f0"/><circle cx="108" cy="90" r="3" fill="#e0a6f0"/>` },
    xiexiu:   { label:"邪修",     robe:"#3a0d12", accent:"#ff5b5b", skin:"#d8b9a0", head:`<ellipse cx="100" cy="92" rx="24" ry="27" fill="#d8b9a0"/><path d="M74 92 Q72 58 100 58 Q128 58 126 92 Q122 68 100 68 Q78 68 74 92 Z" fill="#160a0c"/><path d="M80 100 q20 8 40 0" stroke="#7a1f2b" stroke-width="2" fill="none"/>` },
    ghost:    { label:"鬼物",     robe:"#4a5a72", accent:"#cfe0ff", skin:"#cdd6e6", head:`<ellipse cx="100" cy="92" rx="24" ry="27" fill="#cdd6e6" opacity="0.85"/><path d="M76 92 Q74 60 100 60 Q126 60 124 92 Q120 70 100 70 Q80 70 76 92 Z" fill="#9fb0c8" opacity="0.7"/><circle cx="92" cy="90" r="3" fill="#fff"/><circle cx="108" cy="90" r="3" fill="#fff"/>` },
  },

  _npcPortrait(kind) {
    const def = this.NPC_POOL[kind] || this.NPC_POOL.youth;
    const robe = def.robe, accent = def.accent, skin = def.skin, head = def.head;
    return `<div class="npc-portrait npc-${kind}">
      <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="${def.label}">
        <defs><radialGradient id="npcAura-${kind}" cx="50%" cy="34%" r="60%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient></defs>
        <ellipse cx="100" cy="120" rx="88" ry="110" fill="url(#npcAura-${kind})"/>
        <path d="M58 150 Q100 196 142 150 L156 290 Q100 308 44 290 Z" fill="${robe}"/>
        <path d="M82 156 L100 168 L118 156 L114 286 L86 286 Z" fill="${accent}" opacity="0.28"/>
        <rect x="54" y="208" width="92" height="13" rx="6" fill="${accent}" opacity="0.8"/>
        <path d="M58 156 Q36 200 42 270 L62 270 Q60 210 74 172 Z" fill="${robe}"/>
        <path d="M142 156 Q164 200 158 270 L138 270 Q140 210 126 172 Z" fill="${robe}"/>
        <rect x="91" y="116" width="18" height="22" fill="${skin}"/>
        ${head}
      </svg>
    </div>`;
  },

  updateHeroSprite() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("hero-sprite");
    if (!el || !Game.state || !Game.state.character) return;
    el.innerHTML = this._heroPortrait();
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
      { slug: "lang",  name: "啸月狼",   file: "assets/enemy_wolf.webp" },
      { slug: "zhu",   name: "钢鬃野猪", cfg: { body: "#5b4636", belly: "#cdbfa8", eye: "#15110c" }, feats: ["tusks"] },
      { slug: "xie",   name: "毒尾蝎",   cfg: { body: "#6a3d8a", belly: "#caa6e0", eye: "#ff5b5b" }, feats: ["tail", "stinger"] },
      { slug: "xiong", name: "撼山熊",   cfg: { body: "#6b4a2f", belly: "#caa982", eye: "#15110c" }, feats: ["big"] },
    ],
    xiexiu: [
      { slug: "jiexiu", name: "黑风劫修", file: "assets/enemy_xiexiu.webp" },
      { slug: "xuexiu", name: "血刀魔修", cfg: { body: "#7a1f2b", robe: "#3a0d12", eye: "#ff5b5b" }, feats: ["cultivator", "blade"] },
      { slug: "duxiu",  name: "毒手邪修", cfg: { body: "#2f6b3a", robe: "#13301a", eye: "#a6e0b0" }, feats: ["cultivator"] },
    ],
    ghost: [
      { slug: "yuanling", name: "含冤厉魄", file: "assets/enemy_ghost.webp" },
      { slug: "yinhun",   name: "阴魂老者", cfg: { body: "#5a7fa8", eye: "#dfe9ff" }, feats: ["ghost", "wisp"] },
      { slug: "guhun",    name: "孤野游魂", cfg: { body: "#9aa0a8", eye: "#ffffff" }, feats: ["ghost", "wisp"] },
    ],
  },

  // 程序化像素立绘生成（零二进制，省内存，风格与 young NPC 一致）
  enemySvg(cfg) {
    const c = cfg.c || {};
    const P = c.body || "#888";
    const B = c.belly || "#ddd";
    const E = c.eye || "#fff";
    const f = cfg.feats || [];
    let s = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>";
    s += "<ellipse cx='32' cy='57' rx='20' ry='4' fill='rgba(0,0,0,0.25)'/>";
    if (f.includes("ghost")) {
      s += "<path d='M16 24 q16 -16 32 0 v22 q-4 6 -8 0 q-4 6 -8 0 q-4 6 -8 0 q-4 6 -8 0 z' fill='" + P + "' opacity='0.82'/>";
      if (f.includes("wisp")) s += "<circle cx='20' cy='13' r='3' fill='" + P + "' opacity='0.5'/><circle cx='45' cy='11' r='2' fill='" + P + "' opacity='0.4'/>";
    } else if (f.includes("cultivator")) {
      s += "<rect x='22' y='22' width='20' height='30' rx='6' fill='" + (c.robe || "#333") + "'/>";
      s += "<circle cx='32' cy='14' r='8' fill='" + P + "'/>";
      if (f.includes("blade")) s += "<rect x='47' y='22' width='4' height='26' rx='2' fill='#cfd6e0' transform='rotate(20 49 35)'/>";
    } else {
      const big = f.includes("big") ? 6 : 0;
      s += "<ellipse cx='32' cy='" + (34 - big / 2) + "' rx='" + (20 + big) + "' ry='" + (16 + big) + "' fill='" + P + "'/>";
      s += "<ellipse cx='32' cy='" + (40 - big / 2) + "' rx='" + (12 + big) + "' ry='" + (9 + big) + "' fill='" + B + "' opacity='0.6'/>";
      if (f.includes("tail")) s += "<path d='M50 40 q14 4 8 -10' stroke='" + P + "' stroke-width='6' fill='none' stroke-linecap='round'/>" + (f.includes("stinger") ? "<path d='M58 30 l5 -9 l-3 9 z' fill='" + E + "'/>" : "");
      if (f.includes("wings")) s += "<path d='M18 28 l-14 -10 l10 16 z' fill='" + P + "'/><path d='M46 28 l14 -10 l-10 16 z' fill='" + P + "'/>";
      if (f.includes("stripes")) s += "<rect x='26' y='22' width='3' height='20' fill='rgba(0,0,0,0.25)'/><rect x='35' y='22' width='3' height='20' fill='rgba(0,0,0,0.25)'/>";
      if (f.includes("tusks")) s += "<path d='M28 46 l-2 8 l3 -6 z' fill='#fff'/><path d='M36 46 l2 8 l-3 -6 z' fill='#fff'/>";
      if (f.includes("fangs")) s += "<path d='M28 44 l-1 5 l2 -4 z' fill='#fff'/><path d='M36 44 l1 5 l-2 -4 z' fill='#fff'/>";
      if (f.includes("beak")) s += "<path d='M32 30 l-4 8 l8 0 z' fill='#e0a020'/>";
    }
    const ey = f.includes("cultivator") ? 13 : 30;
    s += "<circle cx='26' cy='" + ey + "' r='3' fill='#fff'/><circle cx='38' cy='" + ey + "' r='3' fill='#fff'/>";
    s += "<circle cx='26' cy='" + ey + "' r='1.4' fill='" + E + "'/><circle cx='38' cy='" + ey + "' r='1.4' fill='" + E + "'/>";
    s += "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(s);
  },

  enemyArtFor(entry) {
    if (!entry) return "assets/enemy_wolf.webp";
    return entry.file ? entry.file : this.enemySvg({ c: entry.cfg, feats: entry.feats });
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
    const map = { beast: "assets/enemy_wolf.webp", xiexiu: "assets/enemy_xiexiu.webp", ghost: "assets/enemy_ghost.webp" };
    return map[type] || map.beast;
  },

  // 显示战斗舞台并播放一次战斗动画（enemy 为 resolveEnemy 返回的对象，含专属立绘与名字）
  showBattleStage(enemy) {
    if (typeof document === "undefined") return;
    const stage = document.getElementById("battle-stage");
    if (!stage) return;
    const heroEl = document.getElementById("battle-hero");
    const enemyEl = document.getElementById("battle-enemy");
    const gender = (Game.state && Game.state.character && Game.state.character.gender) || 0;
    const heroImg = gender === 1 ? "assets/hero_f.webp" : "assets/hero_m.webp";
    heroEl.innerHTML = `<img src="${heroImg}" alt="hero">`;
    const art = enemy && enemy.file ? enemy.file : (enemy ? this.enemyArtFor(enemy) : this.enemyImageFor(enemy && enemy.type));
    enemyEl.innerHTML = `<img src="${art}" alt="enemy">`;
    // 敌人名牌
    let nameEl = document.getElementById("battle-enemy-name");
    if (!nameEl) {
      nameEl = document.createElement("div");
      nameEl.id = "battle-enemy-name";
      nameEl.className = "battle-enemy-name";
      stage.appendChild(nameEl);
    }
    nameEl.textContent = (enemy && enemy.name) ? enemy.name : "敌人";
    // 战斗血条（宝可梦式）
    const hpEl = document.getElementById("battle-hero-hp");
    if (hpEl) {
      const c = (Game.state && Game.state.character);
      const pct = c ? Math.max(0, Math.min(100, Math.round((c.hp / (c.maxHp || 1)) * 100))) : 100;
      hpEl.style.width = pct + "%";
    }
    const eHpEl = document.getElementById("battle-enemy-hp");
    if (eHpEl) eHpEl.style.width = "100%";
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
      hint.style.opacity = "1";
      hint.textContent = "斗法交锋";
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
      html += '<div class="inv-title" style="margin-top:12px">暗线 · 伏笔（' + open.length + ' 未解 / ' + done.length + ' 已收）</div>';
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

  // 根据选项列表渲染按钮（支持 risk 提示：[平安]/[凶险]/[致命] 剥离后由 AI 返回 optionRisks）
  renderOptionsFromList(options, eventFlag, risks) {
    const optEl = document.getElementById("action-options");
    optEl.innerHTML = "";
    if (eventFlag === "death") {
      optEl.innerHTML =
        `<button class="btn btn-primary" onclick="UI.showEndingBiography()">📜 仙途终章</button>` +
        `<button class="btn btn-danger-full" onclick="UI.endGame()">仙途已尽，重入轮回</button>`;
      return;
    }
    if (eventFlag === "ascension" || eventFlag === "craft_ascension") {
      optEl.innerHTML =
        `<button class="btn btn-primary" onclick="UI.showAscensionVictory()">📜 仙途列传</button>` +
        `<button class="btn btn-danger-full" onclick="UI.endGame()">重入轮回</button>`;
      return;
    }
    if (options && options.length > 0) {
      options.forEach((opt, i) => {
        const btn = document.createElement("button");
        const risk = (risks && risks[i]) || "safe";
        btn.className = "btn btn-option" + (risk === "lethal" ? " has-lethal" : "");
        btn.textContent = opt;
        if (risk === "danger" || risk === "lethal") {
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

    // 像素战斗动画：检测到 combat_encounter 或文本中交战时触发（敌人随机抽取且防连重复）
    const enemy = this.resolveEnemy(parsed);
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
  },

  // 像素风开关：切换 body.pixel 并持久化
  togglePixel(on) {
    if (typeof on === "undefined") on = !document.body.classList.contains("pixel");
    document.body.classList.toggle("pixel", on);
    try { localStorage.setItem("fx_pixel", on ? "1" : "0"); } catch (e) {}
    this.initPixelFx();
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
