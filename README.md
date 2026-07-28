# 浮生仙途 · AI 仙侠文字 RPG

一款 AI 驱动的纯文字仙侠沙盒 RPG，灵感来自《刀锋 Blade RPG》，但**成本完全可控**——你自己接 API，用国产模型，玩一局只需几分钱。

## 快速开始

### 1. 配置 API Key（必须）

推荐使用 **DeepSeek**（最便宜）：

1. 访问 https://platform.deepseek.com 注册
2. 创建 API Key（注册即送额度）
3. 打开游戏 → 设置 → 填入 Key

**成本估算（DeepSeek-chat）：**
- 每轮对话约 1000-2000 token
- 约 ¥0.001-0.003 / 轮
- 玩一局（50轮）约 ¥0.1-0.15

### 2. 其他可选 API

| 服务 | Base URL | 模型 | 特点 |
|------|----------|------|------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 最便宜，中文好 |
| 通义千问 | `https://dashscope.aliyun.com/compatible-mode/v1` | `qwen-plus` | 有免费额度 |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | 免费送额度 |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 贵，不推荐 |
| 本地Ollama | `http://localhost:11434/v1` | `qwen2.5:7b` | 完全免费，需显卡 |

### 3. 玩法

- 创建角色（选灵根 + 出身）
- AI 演绎开场剧情，给出行动选项
- 选择选项，或在输入框**自由输入任何行动**
- AI 实时判定结果，更新你的状态

## 游戏特色

- **境界修炼**：炼气 → 筑基 → 金丹 → 元婴 → 化神 → ... → 飞升
- **五行灵根**：金木水火土 + 雷冰混沌等稀有异灵根
- **功法神通**：可在冒险中习得，影响各项能力
- **真实生死**：会受伤、会死亡、寿元有限，死亡即终局
- **因果声望**：行为影响声望，NPC 据此做出不同反应
- **自由度极高**：任何自然语言输入都能被 AI 响应

## 文件结构

```
index.html   - 主页面
style.css    - 水墨古风样式
data.js      - 仙侠世界数据（境界/灵根/功法/丹药/地点）
ai.js        - AI 接口层（OpenAI 兼容）
game.js      - 游戏引擎 + UI 渲染
```

## 本地运行

直接用浏览器打开 `index.html` 即可。

或启动本地服务器：
```bash
python -m http.server 8000
# 访问 http://localhost:8000
```

## 数据隐私

- 所有数据存于浏览器 localStorage，不会上传
- API Key 仅保存在本地
- 存档可随时在游戏中清除
