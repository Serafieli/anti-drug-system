# AntiDrugSystem — Скрипт быстрого запуска для PowerShell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  AntiDrugSystem — Интеллектуальный поисковый экстрактор контактов" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Открытие веб-интерфейса в браузере: http://localhost:3000" -ForegroundColor Yellow

Start-Process "http://localhost:3000"

& "C:\Users\GG\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
