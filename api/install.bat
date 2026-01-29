@echo off
echo ========================================
echo    ExactSign v2.0 - Instalacao
echo ========================================
echo.

echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado!
    echo Baixe em: https://nodejs.org
    pause
    exit /b 1
)

echo [2/4] Instalando dependencias...
call npm install --production
if errorlevel 1 (
    echo ERRO: Falha na instalacao das dependencias
    pause
    exit /b 1
)

echo [3/4] Verificando LibreOffice...
where soffice >nul 2>&1
if errorlevel 1 (
    echo AVISO: LibreOffice nao encontrado no PATH
    echo Para conversao PDF, instale: https://www.libreoffice.org
)

echo [4/4] Testando sistema...
call npm run start --silent &
timeout /t 3 >nul
taskkill /f /im node.exe >nul 2>&1

echo.
echo ========================================
echo    Instalacao Concluida!
echo ========================================
echo.
echo Para iniciar: npm start
echo API: http://localhost:3001
echo.
pause