# YouTube Lyrics Overlay

Overlay discreto de letras enquanto você ouve YouTube no Chrome.

A janelinha fica sempre por cima das outras apps, destaca a frase atual e mantém ela no centro da tela.

---

## Como funciona

| Parte | Função |
|-------|--------|
| **App desktop** (`.exe`) | Detecta a música, busca a letra e mostra o overlay |
| **Extensão Chrome** | Envia o tempo do player para a letra sincronizar e scrollar |

Sem a extensão a letra ainda aparece, mas quase sempre fica parada no começo.

Fonte das letras: [LRCLIB](https://lrclib.net/).

---

## Requisitos

- Windows 10/11
- Node.js 18+
- Google Chrome

---

## Instalação rápida

### 1. Gerar o app

```bash
cd desktop
npm install
npm run dist
```

O executável fica em:

```text
desktop/dist/YouTubeLyricsOverlay.exe
```

Abra o `.exe`. Ele também aparece na bandeja do sistema (tray).

### 2. Carregar a extensão Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `extension/`
5. Dê **F5** na aba do YouTube

O badge da extensão deve mostrar `♪` quando estiver sincronizando.

### 3. Usar

1. Deixe o app aberto
2. Toque um vídeo no YouTube (aba ativa no Chrome)
3. A letra aparece no overlay e acompanha a música

---

## Atalhos e modos

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+L` | Mostrar / esconder o overlay |
| `Ctrl+Shift+.` | Alternar modo da letra |

| Botão | Modo |
|-------|------|
| **Aa** | Letra original |
| **PT** | Tradução (sob demanda) |
| **羅** | Romaji (kana; kanji ainda limitado na v1) |

Dica: arraste pela barra superior para reposicionar a janela.

---

## Desenvolvimento

```bash
cd desktop
npm install
npm start
```

Estrutura do projeto:

```text
youtube-lyrics-overlay/
├── desktop/          # App Electron (overlay + busca de letras)
│   ├── src/
│   └── dist/         # Saída do build (.exe)
├── extension/        # Extensão Chrome (sync do playhead)
└── README.md
```

Scripts úteis:

| Comando | O que faz |
|---------|-----------|
| `npm start` | Roda o app em modo desenvolvimento |
| `npm run dist` | Gera o `.exe` portable |

---

## Detecção da música

O app tenta descobrir o que está tocando assim:

1. Título da janela do Chrome que contém `YouTube`
2. Controles de mídia do Windows (SMTC), quando existirem

A aba do YouTube precisa ser a **aba ativa** daquela janela do Chrome (é o título da janela que muda).

---

## Solução de problemas

| Problema | O que tentar |
|----------|----------------|
| Overlay em “Waiting for YouTube…” | Confirme que a aba do YouTube está ativa e o app está aberto |
| Letra não aparece | Troque de vídeo / aguarde alguns segundos; alguns uploads não têm letra no LRCLIB |
| Letra não scrolla / fica no começo | Atualize a extensão, dê F5 no YouTube e veja se o badge está `♪` |
| Tempo no rodapé fica em `0:00` | A extensão não está syncando — recarregue ela e a aba |
| Fechou a janela sem querer | Use o ícone na bandeja → **Show overlay** (fechar só esconde) |

