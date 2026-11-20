# Ludra Desktop Agent (Electron)

Agente leve que roda em segundo plano na bandeja do sistema para detectar jogos abertos automaticamente e enviar a atividade para o Ludra.

## Como rodar localmente

```bash
cd desktop
npm install
npm start
```

Para testar apenas o detector no terminal (sem abrir Electron):

```bash
node -e "const { GameDetector } = require('./detector'); const d = new GameDetector(); d.scanOnce();"
```

## Variáveis de ambiente
- `LUDRA_API_URL`: URL base da API do Ludra (ex.: `http://127.0.0.1:8080`). Se vazia, registra no console o payload que seria enviado.
- `LUDRA_TOKEN`: Token de autenticação do usuário logado.

## TODOs de empacotamento
- Configurar `electron-builder` para gerar instaladores Windows (`.exe`/NSIS), macOS (`.dmg`) e Linux (`.AppImage`).
- Integrar fluxo de login OAuth / deep-link com o app web do Ludra.
- Adicionar verificação de título de janela para executáveis genéricos (`javaw.exe` para Minecraft e emuladores de Free Fire).
