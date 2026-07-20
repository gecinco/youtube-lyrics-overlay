# YouTube Lyrics Overlay

Escuta algo no YouTube no Chrome, e a letra aparece numa janelinha por cima de tudo.

**Não precisa de extensão.** O `.exe` lê o que está tocando direto pelo Windows.

## Jeito mais fácil (exe)

```bash
cd desktop
npm install
npm run dist
```

O arquivo sai em:

`desktop/dist/YouTubeLyricsOverlay.exe`

Abre o exe, dá play num vídeo no Chrome, e a letra deve aparecer.

## Durante o desenvolvimento

```bash
cd desktop
npm install
npm start
```

## Modos

| Botão | Modo |
|-------|------|
| Aa | Letra original |
| PT | Tradução (sob demanda) |
| 羅 | Romaji (kana; kanji fica como está na v1) |

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+L` | Mostrar / esconder |
| `Ctrl+Shift+.` | Alternar modo |

## Como detecta a música

1. Título da janela do Chrome com `YouTube`
2. Controles de mídia do Windows (SMTC), quando existirem

A aba do YouTube precisa estar a aba **ativa** daquela janela do Chrome (o título da janela muda com a aba).

## Extensão (opcional)

A pasta `extension/` ainda existe, mas **não é necessária** no Windows. O caminho principal é o exe.
