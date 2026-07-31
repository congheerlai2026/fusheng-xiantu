#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《浮生仙途》· AI 立绘托管库生成器
============================================================
一条命令，把你游戏里所有种族 × 性别的「中国仙侠 Galgame 风格」精美立绘
批量生成到 portraits/ 目录，之后托管到 GitHub Pages / CloudStudio，
玩家打开游戏即可直接加载，**无需任何 API Key**。

用法（在你自己的电脑上运行，需要你自己的 Gemini Key）：
------------------------------------------------------------
  1) 安装依赖：  pip install requests
  2) 试运行（只看会生成哪些图，不烧额度）：
        python generate_portrait_pack.py --dry-run
  3) 真正生成（默认 13 种族 × 2 性别 × 3 变体 = 78 张，约 8~15 分钟）：
        python generate_portrait_pack.py --go --api-key "你的GeminiKey"
  4) 只先出常用 3 族（人/妖/魔，约 18 张）快速验证效果：
        python generate_portrait_pack.py --go --quick --api-key "你的GeminiKey"

生成完把 portraits/ 整个目录推到游戏仓库（GitHub Pages 自动部署），
或告诉我，我帮你一键部署到 CloudStudio。

Key 获取： https://aistudio.google.com/apikey  （Google 账号，有免费额度）
"""
import os, sys, json, time, base64, hashlib, argparse

# ---------- 可调参数 ----------
MODEL = "gemini-3-pro-image-preview"   # 与 artengine.js 保持一致
IMG_SIZE = "2K"                         # 1K / 2K / 4K，库图用 2K 更清晰
VARIANTS = 3                           # 每个 种族×性别 生成几张（与 artengine 一致）

# 种族中文 → 文件名用的 ASCII 码（避免中文路径/URL 编码问题）
RACE_CODE = {
    "人": "ren", "妖": "yao", "魔": "mo", "仙": "xian", "龙": "long", "鬼": "gui",
    "灵": "ling", "树": "shu", "花": "hua", "石": "shi", "器": "qi", "兽": "shou",
    "元素": "yuansu",
}
ALL_RACES = list(RACE_CODE.keys())
QUICK_RACES = ["人", "妖", "魔"]
GENDERS = ["m", "f"]   # m=男 f=女

# 修炼体系（用于变体的服饰色彩差异；文件名不含体系，但图里体现）
SYSTEMS = ["lingen", "xuema", "mingge", "daozhong", "yuansu", "lingshu", "rudao", "wudao"]
# 变体的姿态差异（让同一族不同变体看起来不一样）
POSES = ["静立垂眸，衣袂轻扬", "负手而立，神色从容", "仗剑斜倚，英气逼人",
         "拂袖回眸，风姿绰约", "临风独立，仙气缭绕"]

SYSTEM_DESC = {
    "lingen":   "青碧色云纹道袍，清逸出尘，灵气如风",
    "xuema":    "赤红描金战袍，血脉贲张，煞气凛然",
    "mingge":   "金黄锦缎长衫，命格华贵，气度雍容",
    "daozhong": "紫霄道袍，道韵天成，超然物外",
    "yuansu":   "翠蓝元素法袍，五行流转，灵光跃动",
    "lingshu":  "青碧机括长袍，灵枢精密，机理暗藏",
    "rudao":    "褐黄儒衫，书卷气度，温润端方",
    "wudao":    "玄铁劲装，刚健质朴，筋骨如铁",
}
RACE_DESC = {
    "人":   "人类修士{0}",
    "妖":   "妖族{0}，头顶一对兽耳，身侧妖纹流转，野性而妖冶",
    "魔":   "魔修{0}，眉心隐现魔纹，暗色描金战甲，煞气内敛",
    "仙":   "上仙{0}，身绕祥云光环，圣洁出尘",
    "龙":   "龙族{0}，额生玉龙角，颈侧龙鳞隐现，尊贵威严",
    "鬼":   "幽魂鬼修{0}，半透明身躯，幽蓝鬼火环绕，缥缈空明",
    "灵":   "自然灵体{0}，通体光华流转，非人却具仙姿",
    "树":   "化身人形的树精{0}，发间缀枝叶，肤如木纹",
    "花":   "化身人形的花灵{0}，鬓边栖花瓣，衣袂若花瓣层叠",
    "石":   "化身人形的石灵{0}，肌理隐现石纹，沉稳如山",
    "器":   "化身人形的器灵{0}，身周浮现金器虚影，古拙神秘",
    "兽":   "灵兽化形{0}，保留兽耳与尾，灵动可爱",
    "元素": "元素精灵{0}，周身萦绕本源元素光屑，澄澈空明",
}
GENDER_DESC = {
    "f": "清丽女子修士，身姿婀娜，高挽仙髻，鬓发垂落，眉目含情",
    "m": "俊朗青年修士，身形挺拔，束发戴玉冠，长发垂肩，英气内敛",
}
GENDER_WORD = {"f": "女子", "m": "男子"}

def build_prompt(race, gender, system, pose):
    g = GENDER_WORD[gender]
    lines = [
        "中国仙侠题材视觉小说（Galgame）风格角色立绘，单人全身像，竖构图，完整身高入镜。",
        "精美二次元厚涂与工笔重彩融合质感，线条流畅，色彩温润典雅，柔和体积光，电影级构图。",
        "角色设定：{0}，身为{1}。".format(GENDER_DESC[gender], RACE_DESC[race].format(g)),
        "服饰：{0}。".format(SYSTEM_DESC[system]),
        "姿态：{0}。".format(pose),
        "纯白背景，角色居中，高清细节，角色边缘自然融入背景。",
        "禁止低质量、禁止畸形、禁止多余手指、禁止现代服饰、禁止文字水印、禁止脸部模糊、禁止过度暴露。",
    ]
    return "\n".join(lines)

def gen_filename(race, gender, variant):
    return "{0}_{1}_{2}.png".format(RACE_CODE[race], gender, variant)

def call_gemini(key, prompt, model=MODEL, size=IMG_SIZE):
    import requests
    url = "https://generativelanguage.googleapis.com/v1beta/models/{0}:generateContent?key={1}".format(model, key)
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"imageSize": size}},
    }
    r = requests.post(url, json=body, timeout=120)
    if r.status_code != 200:
        raise RuntimeError("HTTP {0}: {1}".format(r.status_code, r.text[:200]))
    data = r.json()
    parts = (data.get("candidates", [{}])[0].get("content", {}).get("parts", []))
    part = next((p for p in parts if p.get("inline_data")), None)
    if not part:
        raise RuntimeError("no image in response: " + json.dumps(data)[:200])
    return base64.b64decode(part["inline_data"]["data"])

def main():
    ap = argparse.ArgumentParser(description="生成《浮生仙途》AI 立绘托管库")
    ap.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY", ""), help="Gemini API Key")
    ap.add_argument("--out", default="portraits", help="输出目录（默认 portraits/）")
    ap.add_argument("--go", action="store_true", help="真正生成（不加此参数只打印计划）")
    ap.add_argument("--dry-run", action="store_true", help="同 --go 相反，只预览")
    ap.add_argument("--quick", action="store_true", help="只生成常用 3 族（人/妖/魔）")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--size", default=IMG_SIZE)
    ap.add_argument("--variants", type=int, default=VARIANTS)
    args = ap.parse_args()

    races = QUICK_RACES if args.quick else ALL_RACES
    variants = args.variants

    # 构造任务清单
    tasks = []
    for race in races:
        for gender in GENDERS:
            for v in range(variants):
                system = SYSTEMS[v % len(SYSTEMS)]
                pose = POSES[v % len(POSES)]
                tasks.append((race, gender, v, system, pose))

    print("=" * 60)
    print("《浮生仙途》立绘托管库生成计划")
    print("  种族: {0} 种 | 性别: 2 | 变体: {1}".format(len(races), variants))
    print("  预计生成: {0} 张 | 模型: {1} | 尺寸: {2}".format(len(tasks), args.model, args.size))
    print("  输出目录: {0}/".format(args.out))
    print("=" * 60)
    for t in tasks[:6]:
        print("  ·", gen_filename(t[0], t[1], t[2]), "<-", t[3], "|", t[4])
    if len(tasks) > 6:
        print("  · ... 共 {0} 张".format(len(tasks)))
    print("-" * 60)

    if not args.go or args.dry_run:
        print("【试运行】未真正调用 API。确认无误后加 --go 与 --api-key 执行。")
        return

    if not args.api_key:
        print("✗ 缺少 API Key：用 --api-key 传入，或设置环境变量 GEMINI_API_KEY")
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)
    done = 0; fail = 0
    t0 = time.time()
    for i, (race, gender, v, system, pose) in enumerate(tasks, 1):
        fname = gen_filename(race, gender, v)
        fpath = os.path.join(args.out, fname)
        if os.path.exists(fpath):
            print("[{0}/{1}] 跳过已存在 {2}".format(i, len(tasks), fname))
            done += 1
            continue
        prompt = build_prompt(race, gender, system, pose)
        try:
            png = call_gemini(args.api_key, prompt, args.model, args.size)
            with open(fpath, "wb") as f:
                f.write(png)
            done += 1
            print("[{0}/{1}] ✓ {2}  ({3:.1f}s)".format(i, len(tasks), fname, time.time() - t0))
            time.sleep(0.5)  # 轻量限速，避免触发限流
        except Exception as e:
            fail += 1
            print("[{0}/{1}] ✗ {2}  失败: {3}".format(i, len(tasks), fname, e))
            time.sleep(2)

    # 写清单，方便前端/部署核对
    manifest = {
        "model": args.model, "size": args.size, "variants": variants,
        "races": races, "genders": GENDERS,
        "count": done, "failed": fail, "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("-" * 60)
    print("完成：成功 {0} 张，失败 {1} 张，用时 {2:.1f} 分".format(done, fail, (time.time() - t0) / 60))
    print("把整个 {0}/ 目录推到游戏仓库（GitHub Pages 会自动部署），".format(args.out))
    print("或运行 CloudStudio 部署。然后在游戏「设置 → AI 立绘」填入托管库地址即可。")

if __name__ == "__main__":
    main()
