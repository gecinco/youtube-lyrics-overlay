# YouTube Lyrics Overlay

Escuta algo no YouTube, e a letra aparece numa janelinha discreta por cima de tudo — tipo um PiP, mas pra lyrics.

## O que faz (v1)

- Detecta o vídeo que está tocando no **YouTube normal** (Chrome)
- Busca a letra automaticamente
- Mostra num overlay sempre por cima, no canto da tela
- Modos: letra original, tradução, ou romaji (quando fizer sentido)

## Como rodar

### 1. App desktop (o overlay)

```bash
cd desktop
npm install
npm start
```

### 2. Extensão Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → pasta `extension/`
4. Deixe o app desktop rodando e abra um vídeo no YouTube

## Estrutura

```
extension/   → detecta o que está tocando no YouTube
desktop/     → janela flutuante + busca de letras
```

## Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+L` | Mostrar / esconder overlay |
| `Ctrl+Shift+.` | Alternar modo da letra |

## Requisitos

- Node.js 18+
- Google Chrome
- App desktop precisa estar aberto pra extensão conversar com ele
