'use strict';
// 验证：DeepSeek V4 在「流式 + stream_options.include_usage」下是否回传 usage（即游戏计量能否生效）
// 用法: node probe_usage.js <内测码FS-...>
const CODE = process.argv[2];
if (!CODE) { console.error('用法: node probe_usage.js <内测码>'); process.exit(1); }

function decodeBeta(code) {
  let text = code.trim();
  if (!text.startsWith('FS-')) return null;
  let encoded = text.slice(3).replace(/-/g, '+').replace(/_/g, '/');
  while (encoded.length % 4) encoded += '=';
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    const parts = decoded.split('|');
    let apiKey, baseURL, model, index;
    if (parts.length === 5) { apiKey = parts[1]; baseURL = parts[2]; model = parts[3]; index = parseInt(parts[4]); }
    else if (parts.length === 4) { apiKey = parts[0]; baseURL = parts[1]; model = parts[2]; index = parseInt(parts[3]); }
    else return null;
    if (model === 'deepseek-chat' || model === 'deepseek-reasoner') model = 'deepseek-v4-flash';
    return { apiKey, baseURL, model, index };
  } catch (e) { return null; }
}

const cfg = decodeBeta(CODE);
if (!cfg) { console.error('✗ 内测码无法解码'); process.exit(1); }

const sys = '你是仙侠文字RPG《浮生仙途》的主持人(GM)。返回一个JSON对象，含 narrative(≤200字)、state_changes(可空对象)、options(3个)、memory(一句)。';
const body = {
  model: cfg.model,
  messages: [{ role: 'system', content: sys }, { role: 'user', content: '我是青崖，金灵根散修，初入仙途。给我开场与3个行动选项。' }],
  temperature: 0.85,
  max_tokens: 800,
  response_format: { type: 'json_object' },
  stream: true,
};
if ((cfg.baseURL || '').includes('deepseek.com')) body.stream_options = { include_usage: true };

(async () => {
  console.log(`模型=${cfg.model}  地址=${cfg.baseURL}`);
  const resp = await fetch(cfg.baseURL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) { console.error('✗ HTTP', resp.status, await resp.text()); process.exit(1); }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '', lastUsage = null, chunks = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim();
      if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); if (j.usage) { lastUsage = j.usage; chunks++; } } catch (e) {}
    }
  }
  console.log('──────────────────────────────');
  if (lastUsage) {
    const pt = lastUsage.prompt_tokens || 0, ct = lastUsage.completion_tokens || 0, tt = lastUsage.total_tokens || (pt + ct);
    // deepseek-v4-flash 默认单价：输入 ¥1 / 输出 ¥2 每百万 token
    const cost = (pt / 1e6) * 1 + (ct / 1e6) * 2;
    console.log('✓ 流式末块回传 usage：');
    console.log(`  输入 ${pt} / 输出 ${ct} / 总计 ${tt} token`);
    console.log(`  本轮花费 ≈ ¥${cost.toFixed(5)}（flash 单价估算）`);
    console.log(`  若 5 名试玩者各跑满 500 轮：≈ ¥${(cost * 500 * 5).toFixed(2)}（远低于 ¥30 预算）`);
  } else {
    console.log('✗ 未捕获到 usage —— 游戏端计量将无法累计（需排查 stream_options 支持）');
  }
})().catch(e => { console.error('异常:', e); process.exit(1); });
