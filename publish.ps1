<#
.SYNOPSIS
    一键发布《浮生仙途》到 GitHub Pages
.DESCRIPTION
    在游戏主源码目录（即本脚本所在目录，它本身就是 git 仓库，origin 已指向 GitHub）
    拉取最新、提交本地改动并推送到 main 分支，GitHub Pages 会自动重新构建并生效。
    注意：不要再用旧的 deploy-public 目录发布，以免用旧代码覆盖线上新功能。
.PARAMETER Token
    可选。GitHub Personal Access Token（repo 权限）。传入则用临时 remote 推送；
    不传则尝试用本机已缓存的 git 凭证（如 Git Credential Manager）推送。
.EXAMPLE
    .\publish.ps1                   # 用本机缓存凭证推送
    .\publish.ps1 -Token "ghp_xxx"  # 用指定 token 推送
#>
param(
    [string]$Token = ""
)

$ErrorActionPreference = "Continue"

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $RepoDir

if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
    Write-Host "当前目录不是 git 仓库，请在游戏主源码目录下运行本脚本。" -ForegroundColor Red
    exit 1
}

$Repo  = "congheerlai2026/fusheng-xiantu"
$remote = git remote get-url origin
if ($Token -ne "") {
    git remote set-url origin "https://oauth2:$Token@github.com/$Repo.git"
}

# 1) 先拉取远程最新，把本地未提交改动 rebase 到远程之上，避免冲突
Write-Host "== 拉取远程最新(main) ==" -ForegroundColor Cyan
$pull = cmd /c "git -c http.curloptResolve=github.com:443:140.82.113.3 pull --rebase origin main 2>&1"
$pull | ForEach-Object { Write-Host $_ }

# 2) 提交本地改动
git add -A
if (git diff --cached --quiet) {
    Write-Host "== 没有需要提交的本地改动 ==" -ForegroundColor Yellow
} else {
    $msg = "更新游戏内容 $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git commit -q -m $msg 2>&1 | ForEach-Object { Write-Host $_ }
    Write-Host "== 已提交: $msg ==" -ForegroundColor Green
}

# 3) 推送（绕过 github.com 默认坏 IP，强制走已验证可达的 140.82.113.3）
Write-Host "== 推送到 GitHub（强制走可用 IP）==" -ForegroundColor Cyan
$push = cmd /c "git -c http.curloptResolve=github.com:443:140.82.113.3 push origin main 2>&1"
$rc = $LASTEXITCODE
$push | ForEach-Object { Write-Host $_ }
if ($Token -ne "") { git remote set-url origin $remote }

if ($rc -ne 0) {
    Write-Host "推送失败：可能需要认证。请用: .\publish.ps1 -Token ghp_你的token" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "发布完成！公网链接：https://congheerlai2026.github.io/fusheng-xiantu/" -ForegroundColor Green
