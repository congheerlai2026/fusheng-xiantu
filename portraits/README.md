# 立绘托管库（portraits/）

本目录由 `generate_portrait_pack.py` 生成，包含《浮生仙途》全部
「种族 × 性别 × 变体」的精美立绘（中国仙侠 Galgame 风格）。

## 文件名规则
`{种族码}_{性别}_{变体}.png`，例如：
- `ren_m_0.png` → 人类·男·变体0
- `yao_f_2.png` → 妖族·女·变体2

种族码：ren 人 / yao 妖 / mo 魔 / xian 仙 / long 龙 / gui 鬼 /
ling 灵 / shu 树 / hua 花 / shi 石 / qi 器 / shou 兽 / yuansu 元素

## 生成方式（需你自己的 Gemini Key）
```bash
pip install requests
python generate_portrait_pack.py --dry-run          # 先看计划
python generate_portrait_pack.py --go --api-key "你的Key"   # 全量 78 张
python generate_portrait_pack.py --go --quick --api-key "你的Key"  # 先出人/妖/魔 18 张
```
可断点续跑（已存在的图会跳过）。`manifest.json` 记录生成情况。

## 托管方式（二选一）
### A. GitHub Pages（你的仓库已自动部署）
把整个 `portraits/` 目录提交推送即可：
```bash
git add portraits && git commit -m "add portrait library" && git push
```
然后游戏内「设置 → AI 立绘」填入：
`https://你的账号.github.io/你的仓库名/portraits`

### B. CloudStudio（让 AI 助手帮你部署）
告诉我"把 portraits 部署到 CloudStudio"，助手会直接上传并返回地址，
填入同上位置即可。

## 游戏内优先级
托管库 → 玩家自用 Key 即时生成 → 程序化 SVG 占位（绝不白屏）
