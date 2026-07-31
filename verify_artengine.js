const fs = require("fs");
const { JSDOM } = require("C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules/jsdom");

let html = fs.readFileSync("index.html", "utf8");
const files = ["config.js", "worldgen.js", "data.js", "ai.js", "art.js", "artengine.js", "game.js"];
for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  html = html.replace(new RegExp('<script src="' + f + '"></script>'), "<script>" + code + "</script>");
}
html = html.replace(/<link rel="stylesheet"[^>]*>/g, "");

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://local.test/" });
const { window } = dom;

setTimeout(() => {
  let r;
  try {
    r = window.eval(`(function(){
      const out = {};
      out.ae = typeof ArtEngine;
      out.ui = typeof UI;
      out.heroSpec = typeof UI._heroSpec;
      out.npcSpec = typeof UI._npcSpec;
      out.toggleAi = typeof UI.toggleAiPortrait;
      out.aiToggleEl = !!document.getElementById('set-aiportrait');
      out.aiKeyEl = !!document.getElementById('set-aiportrait-key');
      out.isEn = ArtEngine.isEnabled();
      const p = ArtEngine.promptFor({kind:'hero',race:'妖',gender:'f',system:'xuema',form:'human',arche:'剑修',seed:1});
      out.promptLen = p.length;
      out.promptHead = p.slice(0,40).replace(/\\n/g,' ');
      const k1 = ArtEngine.cacheKey({kind:'hero',race:'人',gender:'m',system:'lingen',form:'human',seed:1});
      const k2 = ArtEngine.cacheKey({kind:'hero',race:'人',gender:'m',system:'lingen',form:'human',seed:1});
      out.keyStable = (k1===k2); out.key = k1;
      // 降级：无 key 时 upgrade 不抛错、保留占位
      const div = document.createElement('div'); div.innerHTML = "<svg class='x'></svg>";
      ArtEngine.upgrade(div, {kind:'hero',race:'人',gender:'m',system:'lingen',seed:1});
      out.degradeKept = (div.querySelector('svg')!==null);
      return out;
    })()`);
  } catch (e) {
    console.error("EVAL ERROR:", e.message);
    process.exit(1);
  }
  const lines = [
    "ArtEngine defined: " + r.ae,
    "UI defined: " + r.ui,
    "UI._heroSpec: " + r.heroSpec,
    "UI._npcSpec: " + r.npcSpec,
    "UI.toggleAiPortrait: " + r.toggleAi,
    "settings ai-toggle el: " + r.aiToggleEl,
    "settings ai-key el: " + r.aiKeyEl,
    "isEnabled(no key): " + r.isEn,
    "promptFor len: " + r.promptLen + " | " + r.promptHead,
    "cacheKey stable: " + r.keyStable + " (" + r.key + ")",
    "degrade(no key) keeps placeholder: " + r.degradeKept,
  ];
  console.log(lines.join("\n"));
  if (r.ae !== "object" || r.ui !== "object" || r.degradeKept !== true || r.keyStable !== true) {
    console.error("\nVERIFY FAIL");
    process.exit(1);
  }
  console.log("\nVERIFY PASS");
}, 1100);
