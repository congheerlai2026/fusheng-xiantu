// ============================================================
//  《浮生仙途》像素风物品图标
//  纯 SVG 程序化生成 —— 零二进制文件、矢量缩放、内存占用极小
//  按物品 kind + 名称关键词自动匹配最贴合的像素图标
// ============================================================
const ItemArt = {
  // 由物品名识别更具体的形状
  _rules: [
    { type: "weapon",   re: /剑|刀|戈|戟|枪|矛|斧|匕|锤|鞭|钩|弓/ },
    { type: "pill",     re: /丹|药|丸|膏|散/ },
    { type: "talisman", re: /符|箓|咒|令|幡/ },
    { type: "treasure", re: /鼎|炉|宝|珠|镜|印|环|戒|匣|塔|旗|铃|灯|冠|甲|铠|盾|针|梭/ },
    { type: "herb",     re: /草|花|灵植|木|叶|根|果|藤|芝|参|莲|蕊/ },
    { type: "ore",      re: /矿|石|晶|铁|金|玉|钻|铜|银|砂|骨|鳞|牙|角|羽|精|髓/ },
    { type: "book",     re: /书|卷|简|帖|籍|谱|图|策|诀|录/ },
    { type: "liquid",   re: /水|露|泉|液|浆|酒|血|蜜|乳|雨|灵气/ },
  ],
  // 由 AI 返回的 kind 直接定类型
  _kindType: { "丹药": "pill", "法宝": "treasure", "符箓": "talisman", "材料": "ore", "物品": "misc" },

  detect(name) {
    for (const r of this._rules) if (r.re.test(name || "")) return r.type;
    return null;
  },

  // 返回完整 <svg> 字符串，可直接内联到物品行
  icon(kind, name) {
    let t = this._kindType[kind];
    if (!t) t = this.detect(name) || "misc";
    const fn = this["_" + t] || this._misc;
    return `<svg class="item-ico" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${fn()}</svg>`;
  },

  // ---- 各类像素图标（16x16） ----
  _misc() {
    // 包袱
    return `<rect x="3" y="6" width="10" height="8" fill="#8a6d4a"/>` +
           `<rect x="3" y="6" width="10" height="2" fill="#a3825c"/>` +
           `<rect x="7" y="8" width="2" height="4" fill="#c94f3a"/>` +
           `<rect x="5" y="9" width="6" height="1" fill="#6b5436"/>`;
  },
  _pill() {
    // 丹丸
    return `<rect x="5" y="4" width="6" height="6" rx="3" fill="#e0604a"/>` +
           `<rect x="6" y="5" width="3" height="2" fill="#f6a890"/>` +
           `<rect x="5" y="3" width="6" height="1" fill="#ffd9c0" opacity="0.5"/>` +
           `<rect x="7" y="10" width="2" height="1" fill="#c44a36"/>`;
  },
  _talisman() {
    // 符箓
    return `<rect x="6" y="1" width="4" height="14" fill="#e8c64a"/>` +
           `<rect x="5" y="1" width="1" height="14" fill="#c9a838"/>` +
           `<rect x="10" y="1" width="1" height="14" fill="#c9a838"/>` +
           `<rect x="7" y="3" width="2" height="9" fill="#b03020"/>` +
           `<rect x="7" y="12" width="2" height="2" fill="#b03020"/>`;
  },
  _weapon() {
    // 剑
    return `<rect x="7" y="0" width="2" height="1" fill="#ffffff"/>` +
           `<rect x="7" y="1" width="2" height="11" fill="#c8d0da"/>` +
           `<rect x="8" y="1" width="1" height="11" fill="#eef2f7"/>` +
           `<rect x="5" y="12" width="6" height="1" fill="#e0b64c"/>` +
           `<rect x="7" y="13" width="2" height="3" fill="#6b4a2a"/>`;
  },
  _treasure() {
    // 法宝宝珠
    return `<rect x="7" y="2" width="2" height="2" fill="#9fe0ff"/>` +
           `<rect x="5" y="4" width="6" height="2" fill="#6fb8e0"/>` +
           `<rect x="4" y="6" width="8" height="4" fill="#4a90c0"/>` +
           `<rect x="5" y="10" width="6" height="2" fill="#6fb8e0"/>` +
           `<rect x="7" y="12" width="2" height="2" fill="#9fe0ff"/>` +
           `<rect x="6" y="7" width="2" height="2" fill="#bfeaff" opacity="0.85"/>`;
  },
  _herb() {
    // 灵草
    return `<rect x="7" y="6" width="1" height="9" fill="#5a8a3a"/>` +
           `<rect x="3" y="3" width="4" height="3" fill="#6fae4a"/>` +
           `<rect x="9" y="4" width="4" height="3" fill="#6fae4a"/>` +
           `<rect x="4" y="4" width="2" height="1" fill="#8fd060"/>` +
           `<rect x="10" y="5" width="2" height="1" fill="#8fd060"/>`;
  },
  _ore() {
    // 灵矿晶石
    return `<rect x="6" y="3" width="4" height="3" fill="#7ec8d0"/>` +
           `<rect x="4" y="6" width="8" height="4" fill="#4a9aa8"/>` +
           `<rect x="5" y="10" width="6" height="3" fill="#356f7a"/>` +
           `<rect x="7" y="4" width="2" height="2" fill="#bfeeff" opacity="0.85"/>`;
  },
  _book() {
    // 书卷
    return `<rect x="2" y="4" width="12" height="9" fill="#9a6b3f"/>` +
           `<rect x="2" y="4" width="12" height="2" fill="#b5824f"/>` +
           `<rect x="7" y="4" width="2" height="9" fill="#6b4a2a"/>` +
           `<rect x="4" y="7" width="2" height="1" fill="#e8d8b8"/>` +
           `<rect x="10" y="7" width="2" height="1" fill="#e8d8b8"/>` +
           `<rect x="4" y="9" width="2" height="1" fill="#e8d8b8"/>` +
           `<rect x="10" y="9" width="2" height="1" fill="#e8d8b8"/>`;
  },
  _liquid() {
    // 灵液瓶
    return `<rect x="6" y="1" width="4" height="2" fill="#6b4a2a"/>` +
           `<rect x="5" y="3" width="6" height="3" fill="#7ec8d0"/>` +
           `<rect x="4" y="6" width="8" height="8" fill="#5fb0c0"/>` +
           `<rect x="5" y="8" width="3" height="4" fill="#9fe0e8" opacity="0.7"/>`;
  },
};
