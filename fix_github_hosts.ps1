# fix_github_hosts.ps1
# 用途：把 GitHub 可用 IP 写进系统 hosts，绕过慢 DNS / 解析超时，稳定访问 GitHub。
# 必须以管理员身份运行（见下方说明）。运行后会自动刷新 DNS 缓存。
# 重要：脚本先用国内 DNS 解析，但只有「443 端口实测可达」的解析结果才会采用；
#        否则回退到下方已验证可达的兜底 IP，避免把被墙/慢 IP 写进 hosts 反而更连不上。

$ErrorActionPreference = "SilentlyContinue"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

# 已验证可达的兜底 IP（443 实测可连）；DNS 解析失败时回退使用
$entries = [ordered]@{
    "github.com"               = "140.82.113.3"
    "api.github.com"           = "140.82.114.3"
    "gist.github.com"          = "140.82.114.4"
    "raw.githubusercontent.com"= "185.199.111.133"
    "objects.githubusercontent.com" = "185.199.108.133"
    "codeload.github.com"      = "140.82.114.10"
    "avatars.githubusercontent.com" = "185.199.111.133"
    "github.io"                = "185.199.110.153"
}

# 用国内友好 DNS 解析；仅当解析到的 IP 443 可达时才覆盖兜底，避免写入坏 IP
$resolvers = @("223.5.5.5", "119.29.29.29", "8.8.8.8")
foreach ($domain in $entries.Keys) {
    $chosen = $entries[$domain]   # 默认回退到已验证可达的兜底 IP
    foreach ($server in $resolvers) {
        try {
            $ans = Resolve-DnsName -Name $domain -Server $server -Type A -ErrorAction Stop |
                   Where-Object { $_.Type -eq "A" } | Select-Object -First 1
            if ($ans -and $ans.IPAddress) {
                $candidate = $ans.IPAddress
                # 只有 443 连通才采用，否则丢弃该候选，继续尝试或回退兜底
                $ok = Test-NetConnection -ComputerName $candidate -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
                if ($ok) { $chosen = $candidate; break }
            }
        } catch { }
    }
    $entries[$domain] = $chosen
}

# 备份原 hosts
Copy-Item -Path $hostsPath -Destination "$hostsPath.bak" -Force

# 读出现有内容，去掉旧的 github 相关行
$existing = Get-Content -Path $hostsPath | Where-Object { $_ -notmatch "github\.com|github\.io" }

# 追加新条目
$newLines = @($existing)
foreach ($domain in $entries.Keys) {
    $newLines += "$($entries[$domain])`t$domain"
}

Set-Content -Path $hostsPath -Value ($newLines -join "`r`n") -Encoding ASCII

# 刷新 DNS
ipconfig /flushdns | Out-Null

Write-Host ""
Write-Host "GitHub hosts 已更新。请重新打开浏览器访问 GitHub。" -ForegroundColor Green
Write-Host "更新内容：" -ForegroundColor Cyan
foreach ($domain in $entries.Keys) {
    Write-Host ("  {0}`t{1}" -f $entries[$domain], $domain)
}
Write-Host ""
Write-Host "若仍打不开，说明是线路被墙（hosts 无法解决），需要代理/VPN。" -ForegroundColor Yellow
