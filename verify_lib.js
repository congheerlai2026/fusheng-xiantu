// 验证 artengine 托管库模式：libUrl 正确 / 优先级链 / 降级安全
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules/jsdom");

const root = "C:/Users/Lenovo/WorkBuddy/2026-07-27-08-23-35";
const ae = fs.readFileSync(path.join(root, "artengine.js"), "utf8");

function makeDom() {
  const html = `<!DOCTYPE html><html><body><div id="c"></div></body></html>`;
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://local.test/", pretendToBeVisual: true });
  const w = dom.window;
  // stub Image：成功加载（模拟托管图可达）
  w.Image = class {
    set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
    get src() { return this._src; }
  };
  // 注入 artengine 并暴露到 window
  w.eval(ae + "\n;window.ArtEngine = ArtEngine;");
  return w;
}

function setCfg(w, cfg) {
  w.localStorage.setItem("xianxia_ai_portrait", JSON.stringify(cfg));
}

(async () => {
  const results = [];
  const assert = (name, cond) => { results.push([name, !!cond]); };

  // 1) libUrl 格式正确
  let w = makeDom();
  setCfg(w, { enabled: false, key: "", libEnabled: true, libBase: "https://x.github.io/game/portraits/" });
  const url = w.ArtEngine.libUrl({ kind: "npc", race: "妖", gender: "f", system: "xuema", seed: 42 });
  assert("libUrl 格式=base/race_gender_variant.png", url === "https://x.github.io/game/portraits/yao_f_0.png");

  // 2) _variantOf 确定性
  const v1 = w.ArtEngine._variantOf({ race: "妖", gender: "f", seed: 42 });
  const v2 = w.ArtEngine._variantOf({ race: "妖", gender: "f", seed: 42 });
  assert("_variantOf 同输入同输出", v1 === v2 && v1 >= 0 && v1 < 3);

  // 3) 托管库可用时 upgrade → 替换为托管图 <img>
  w = makeDom();
  setCfg(w, { libEnabled: true, libBase: "https://x.github.io/game/portraits/" });
  const c = w.document.getElementById("c");
  w.ArtEngine.upgrade(c, { kind: "npc", race: "妖", gender: "f", system: "xuema", seed: 42 });
  await new Promise(r => setTimeout(r, 30));
  const img = c.querySelector("img");
  assert("托管库模式：渲染出 <img>", !!img);
  assert("托管库模式：src 指向托管地址", img && img.src === "https://x.github.io/game/portraits/yao_f_0.png");

  // 4) 未启用任何立绘 → 保留占位（不抛错、不白屏）
  w = makeDom();
  setCfg(w, { enabled: false, key: "", libEnabled: false, libBase: "" });
  const c2 = w.document.getElementById("c");
  c2.innerHTML = "<svg class='placeholder'></svg>";
  w.ArtEngine.upgrade(c2, { kind: "npc", race: "人", gender: "m", seed: 1 });
  await new Promise(r => setTimeout(r, 10));
  assert("全关闭：保留程序化 SVG 占位", !!c2.querySelector("svg.placeholder"));

  const pass = results.filter(r => r[1]).length;
  console.log("=== artengine 托管库验证 ===");
  results.forEach(r => console.log((r[1] ? "✓" : "✗") + " " + r[0]));
  console.log(`通过 ${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
})();
