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

Uma janelinha aparece no canto superior direito. Ela fica por cima das outras janelas.

### 2. Extensão Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → pasta `extension/`
4. Deixe o app desktop rodando e abra um vídeo no YouTube
5. Se a aba do YouTube já estava aberta, **recarregue a página** (F5) depois de carregar a extensão
6. O ícone da extensão fica `on` / `♪` quando conectada (se ficar `off`, o app desktop não está rodando)

## Estrutura

```
extension/   → detecta o que está tocando no YouTube
desktop/     → janela flutuante + busca de letras
```

## Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+L` | Mostrar / esconder overlay |
| `Ctrl+Shift+.` | Alternar modo da letra (`original` → `translation` → `romaji`) |

No overlay: **Aa** original · **PT** tradução · **羅** romaji (kana; kanji fica como está na v1).

O app também fica na bandeja do sistema (tray). Fechar a janela só esconde — pra sair de verdade, use Quit no tray.

## Requisitos

- Node.js 18+
- Google Chrome
- App desktop precisa estar aberto pra extensão conversar com ele
