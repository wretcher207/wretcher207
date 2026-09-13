# Renders README.md inside a GitHub-like page and screenshots it to preview.png.
param([int]$Width = 1280, [int]$Height = 1480)

$root = Split-Path $PSScriptRoot -Parent
$chrome = Get-ChildItem "$env:USERPROFILE\.cache\puppeteer\chrome\*\chrome-win64\chrome.exe" | Sort-Object FullName | Select-Object -Last 1
$readme = (Get-Content "$root\README.md" -Raw) -replace '(?m)^<!--.*-->\r?$', '' -replace '(?m)^\s*$', '<div style="height:16px"></div>'
@"
<html><body style="margin:0;background:#0d1117;font-family:Segoe UI,sans-serif;color:#e6edf3">
<div style="display:flex;flex-wrap:wrap;gap:32px;max-width:1280px;margin:32px auto;padding:0 24px">
<div style="width:296px;flex:none"><img src="https://github.com/wretcher207.png" style="width:296px;height:296px;border-radius:50%;border:1px solid #30363d">
<h2 style="margin:16px 0 0">Dead Pixel Design</h2><div style="color:#9198a1;font-size:20px">wretcher207</div></div>
<div style="flex:1;min-width:0;border:1px solid #30363d;border-radius:6px;padding:24px;font-size:16px;line-height:0">$readme</div></div></body></html>
"@ | Set-Content "$root\preview.html"
Start-Process -Wait -FilePath $chrome.FullName -ArgumentList '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion', "--window-size=$Width,$Height", '--virtual-time-budget=8000', "--screenshot=$root\preview.png", "file:///$($root -replace '\\','/')/preview.html"
