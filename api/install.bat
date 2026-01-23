@echo off
echo 📦 Instalando dependências do Sistema de Assinatura Digital Aprimorado...
echo.

cd /d "%~dp0"

echo ⏳ Instalando dependências do Node.js...
npm install

echo.
echo ✅ Dependências instaladas com sucesso!
echo.
echo 🔧 Próximos passos:
echo.
echo 1. Instalar LibreOffice:
echo    - Baixe em: https://www.libreoffice.org/download/
echo    - Instale normalmente
echo    - Adicione ao PATH do sistema: C:\Program Files\LibreOffice\program
echo.
echo 2. Iniciar o servidor:
echo    npm start
echo.
echo 3. Abrir o front-end:
echo    Abra web/index.html no navegador
echo.
pause