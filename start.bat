@echo off
chcp 65001 > nul
title AntiDrugSystem — Сервер автопоиска и сбора данных

cd /d "%~dp0"

echo ===================================================================
echo   AntiDrugSystem — Интеллектуальный поисковый экстрактор контактов
echo ===================================================================
echo.
echo [1/2] Запуск локального сервера AntiDrugSystem...
echo [2/2] Открытие веб-интерфейса: http://localhost:3000
echo.

start http://localhost:3000



pause
