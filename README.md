# YouTube Lyrics Overlay

Escuta algo no YouTube no Chrome, e a letra aparece numa janelinha por cima de tudo.

O `.exe` descobre a música pelo Windows. Para a letra **ir scrollando no tempo certo**,
carregue também a extensão Chrome (ela só manda o tempo do player).

## Jeito mais fácil (exe)

```bash
cd desktop
npm install
npm run dist
```

O arquivo sai em:

`desktop/dist/YouTubeLyricsOverlay.exe`

Abre o exe, dá play num vídeo no Chrome, e a letra deve aparecer.

### Extensão (sync / scroll automático)

1. Chrome → `chrome://extensions`
2. Modo do desenvolvedor → **Carregar sem compactação** → pasta `extension/`
3. Atualize a extensão e dê **F5** na aba do YouTube
4. Badge `♪` = sync ligado

Sem a extensão a letra ainda aparece, mas quase sempre fica parada no começo
(o Windows não manda bem o tempo do YouTube).

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

## Papel de cada parte

| Parte | Faz o quê |
|-------|-----------|
| `YouTubeLyricsOverlay.exe` | Detecta a música + busca letra + overlay |
| Extensão Chrome | Envia `currentTime` pra letra acompanhar o vídeo |
