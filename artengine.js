// ============================================================
//  《浮生仙途》· AI 立绘引擎 (ArtEngine)
//  设计目标：随机种族/性别/体系 → 即时生成符合中国审美的仙侠 Galgame 立绘
//
//  工作流：
//    1. 调用方先渲染【程序化 SVG 立绘】作零延迟占位（绝不白屏）
//    2. ArtEngine.upgrade(container, spec) 异步尝试生成 AI 立绘：
//         - 未启用 / 无 key / 网络失败 → 静默保留占位（降级不崩）
//         - 缓存命中 → 直接淡入替换
//         - 否则 fetch Gemini 图像 API → Canvas 压缩 → localStorage 缓存 → 淡入替换
//
//  配置（localStorage: xianxia_ai_portrait）：
//    { enabled: true, key: "你的 Gemini API Key" }
//  与 DeepSeek Key 同理：用户自填，风险自担，不联网上传任何游戏数据。
// ============================================================
const ArtEngine = {
  LS_CFG: "xianxia_ai_portrait",
  LS_PREFIX: "pt_",
  LS_INDEX: "pt_idx",
  MAX_CACHE: 120,          // 单角色立绘缓存上限（LRU）
  MODEL: "gemini-3-pro-image-preview",
  IMG_SIZE: "1K",

  // 托管立绘库参数（与 generate_portrait_pack.py 保持一致）
  VARIANTS: 3,             // 每个 种族×性别 预生成的变体数
  // 种族中文 → 文件名 ASCII 码（与生成器一致，避免中文 URL 编码问题）
  RACE_CODE: {
    "人": "ren", "妖": "yao", "魔": "mo", "仙": "xian", "龙": "long", "鬼": "gui",
    "灵": "ling", "树": "shu", "花": "hua", "石": "shi", "器": "qi", "兽": "shou",
    "元素": "yuansu",
  },

  // ---------- 配置读写 ----------
  cfg() {
    try {
      const c = JSON.parse(localStorage.getItem(this.LS_CFG)) || {};
      return { enabled: false, key: "", libEnabled: false, libBase: "", ...c };
    }
    catch (e) { return { enabled: false, key: "", libEnabled: false, libBase: "" }; }
  },
  isEnabled() { const c = this.cfg(); return !!(c.enabled && c.key); },
  _libAvailable() {
    const c = this.cfg();
    return !!(c.libEnabled && c.libBase && c.libBase.trim());
  },

  // ---------- 种族 / 体系 → 中文提示词片段 ----------
  _raceDesc(race, gender) {
    const g = gender === "f" ? "女子" : "男子";
    const R = {
      "人":   `人类修士${g}`,
      "妖":   `妖族${g}，头顶一对兽耳，身侧妖纹流转，野性而妖冶`,
      "魔":   `魔修${g}，眉心隐现魔纹，暗色描金战甲，煞气内敛`,
      "仙":   `上仙${g}，身绕祥云光环，圣洁出尘`,
      "龙":   `龙族${g}，额生玉龙角，颈侧龙鳞隐现，尊贵威严`,
      "鬼":   `幽魂鬼修${g}，半透明身躯，幽蓝鬼火环绕，缥缈空灵`,
      "灵":   `自然灵体${g}，通体光华流转，非人却具仙姿`,
      "树":   `化身人形的树精${g}，发间缀枝叶，肤如木纹`,
      "花":   `化身人形的花灵${g}，鬓边栖花瓣，衣袂若花瓣层叠`,
      "石":   `化身人形的石灵${g}，肌理隐现石纹，沉稳如山`,
      "器":   `化身人形的器灵${g}，身周浮现金器虚影，古拙神秘`,
      "兽":   `灵兽化形${g}，保留兽耳与尾，灵动可爱`,
      "元素": `元素精灵${g}，周身萦绕本源元素光屑，澄澈空明`,
    };
    return R[race] || R["人"];
  },
  _systemDesc(sys) {
    const S = {
      lingen:   `青碧色云纹道袍，清逸出尘，灵气如风`,
      xuema:    `赤红描金战袍，血脉贲张，煞气凛然`,
      mingge:   `金黄锦缎长衫，命格华贵，气度雍容`,
      daozhong: `紫霄道袍，道韵天成，超然物外`,
      yuansu:   `翠蓝元素法袍，五行流转，灵光跃动`,
      lingshu:  `青碧机括长袍，灵枢精密，机理暗藏`,
      rudao:    `褐黄儒衫，书卷气度，温润端方`,
      wudao:    `玄铁劲装，刚健质朴，筋骨如铁`,
    };
    return S[sys] || `古风仙侠长袍，飘逸出尘`;
  },
  _genderDesc(gender) {
    return gender === "f"
      ? `清丽女子修士，身姿婀娜，高挽仙髻，鬓发垂落，眉目含情`
      : `俊朗青年修士，身形挺拔，束发戴玉冠，长发垂肩，英气内敛`;
  },

  promptFor(spec) {
    const race = spec.race || "人";
    const gender = spec.gender === "f" ? "f" : "m";
    const sys = spec.system || "";
    const arche = spec.arche || "";
    return [
      `中国仙侠题材视觉小说（Galgame）风格角色立绘，单人全身像，竖构图，完整身高入镜。`,
      `精美二次元厚涂与工笔重彩融合质感，线条流畅，色彩温润典雅，柔和体积光，电影级构图。`,
      `角色设定：${this._genderDesc(gender)}，身为${this._raceDesc(race, gender)}。`,
      `服饰：${this._systemDesc(sys)}。`,
      arche ? `气质参考：${arche}。` : ``,
      `姿态自然站立，衣袂微扬，仙气缭绕，神情生动。`,
      `纯白背景，角色居中，高清细节，角色边缘自然融入背景。`,
      `禁止低质量、禁止畸形、禁止多余手指、禁止现代服饰、禁止文字水印、禁止脸部模糊、禁止过度暴露。`,
    ].filter(Boolean).join("\n");
  },

  // ---------- 缓存键 ----------
  cacheKey(spec) {
    const k = [spec.kind || "npc", spec.race || "人", spec.gender || "m",
               spec.system || "", spec.form || "human", spec.seed || 0].join("|");
    // 简短 hash，避免 key 过长
    let h = 0;
    for (let i = 0; i < k.length; i++) { h = (h * 31 + k.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  },

  // ---------- 缓存读写（带 LRU 索引） ----------
  _idx() {
    try { return JSON.parse(localStorage.getItem(this.LS_INDEX)) || {}; }
    catch (e) { return {}; }
  },
  _touch(key) {
    const idx = this._idx();
    idx[key] = Date.now();
    // LRU 清理
    const keys = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
    while (keys.length > this.MAX_CACHE) {
      const old = keys.shift();
      localStorage.removeItem(this.LS_PREFIX + old);
      delete idx[old];
    }
    try { localStorage.setItem(this.LS_INDEX, JSON.stringify(idx)); } catch (e) {}
  },
  fromCache(key) {
    const v = localStorage.getItem(this.LS_PREFIX + key);
    if (v) { this._touch(key); return v; }
    return null;
  },
  toCache(key, dataUrl) {
    try { localStorage.setItem(this.LS_PREFIX + key, dataUrl); this._touch(key); }
    catch (e) { /* 配额溢出则忽略，下次重新生成 */ }
  },

  // ---------- 远程生成（Gemini 图像 API） ----------
  async generate(spec) {
    const c = this.cfg();
    if (!c.key) throw new Error("no key");
    const prompt = this.promptFor(spec);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent?key=${encodeURIComponent(c.key)}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: this.IMG_SIZE } },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + " " + t.slice(0, 160));
    }
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const part = parts.find(p => p.inline_data);
    if (!part) throw new Error("no image in response");
    const b64 = part.inline_data.data;
    return await this.compress(`data:image/png;base64,${b64}`);
  },

  // Canvas 缩放压缩，控制 localStorage 占用（目标高度 768，JPEG 0.82）
  compress(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxH = 768;
        const scale = Math.min(1, maxH / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(cv.toDataURL("image/jpeg", 0.82)); }
        catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("img decode fail"));
      img.src = dataUrl;
    });
  },

  // ---------- 托管库：种族+性别+变体 → 确定性文件名 ----------
  _variantOf(spec) {
    const s = (spec.seed != null) ? String(spec.seed) : ((spec.race || "人") + (spec.gender || "m"));
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h) % this.VARIANTS;
  },
  libUrl(spec) {
    const c = this.cfg();
    const raceCode = this.RACE_CODE[spec.race] || this.RACE_CODE["人"];
    const gender = (spec.gender === "f") ? "f" : "m";
    const variant = this._variantOf(spec);
    const base = c.libBase.replace(/\/+$/, "");
    return base + "/" + raceCode + "_" + gender + "_" + variant + ".png";
  },
  // 尝试加载托管库图片；成功则缓存(存URL)并淡入；失败回退到 per-player API 或 SVG
  _tryLib(container, spec, key) {
    const url = this.libUrl(spec);
    const img = new Image();
    img.onload = () => {
      this.toCache(key, url);                       // 缓存 URL，下次秒开
      if (document.body.contains(container)) this._swap(container, url, spec);
    };
    img.onerror = () => {
      if (this.isEnabled()) {
        this.generate(spec).then(u => {
          this.toCache(key, u);
          if (document.body.contains(container)) this._swap(container, u, spec);
        }).catch(() => { /* 保持占位 */ });
      }
      // 未启用 API → 保留程序化 SVG 占位
    };
    img.src = url;
  },

  // ---------- 对外主入口 ----------
  // container: 已含程序化 SVG 占位的 DOM 元素
  // spec: { kind, race, gender, system, form, arche, seed }
  upgrade(container, spec) {
    if (!container || !spec) return;
    const key = this.cacheKey(spec);
    const cached = this.fromCache(key);
    if (cached) { this._swap(container, cached, spec); return; }

    // 1) 优先托管库（玩家零 Key 即可看精美立绘）
    if (this._libAvailable()) { this._tryLib(container, spec, key); return; }

    // 2) 其次 per-player API 生成（需玩家自备 Key）
    if (this.isEnabled()) {
      this.generate(spec).then(url => {
        this.toCache(key, url);
        if (document.body.contains(container)) this._swap(container, url, spec);
      }).catch(() => { /* 保持占位 */ });
      return;
    }
    // 3) 都未配置 → 保留程序化 SVG 占位（绝不白屏）
  },

  _swap(container, dataUrl, spec) {
    const cls = spec.kind === "hero" ? "hero-portrait" : "npc-portrait";
    const img = document.createElement("img");
    img.className = `ai-portrait-img ${cls}`;
    img.alt = "";
    img.src = dataUrl;
    img.addEventListener("load", () => img.classList.add("ai-portrait-fade"));
    container.innerHTML = "";
    container.appendChild(img);
  },
};
