<div align="center">

# 🎙️ trackscribe

**Transforme gravações MKV multi-trilha em um único JSON de transcrição, ordenado no tempo e atribuído por locutor.**

Cada trilha de áudio vira um locutor — OpenAI Whisper por trilha, com diarização opcional via WhisperX para a única trilha que mistura várias pessoas.

[![CI](https://github.com/frederico-kluser/trackscribe/actions/workflows/ci.yml/badge.svg)](https://github.com/frederico-kluser/trackscribe/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)
![OpenAI Whisper](https://img.shields.io/badge/OpenAI-whisper--1-412991.svg?logo=openai&logoColor=white)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/frederico-kluser/trackscribe/pulls)

[English](./README.md) · **Português 🇧🇷**

</div>

---

## Por que isso existe

Quando um gravador como o **OBS** escreve o **microfone** e o **áudio do sistema** em *trilhas MKV separadas*, você já tem separação de locutores de graça: **separar trilhas fisicamente _é_ diarização** para a divisão "microfone vs. sistema". Nenhum aprendizado de máquina é necessário para saber quem está em qual trilha.

Só a **trilha do sistema** pode misturar vários participantes remotos. Então o trackscribe transcreve cada trilha com o Whisper, marca cada segmento com sua trilha e — *opcionalmente e só para essa trilha* — roda o **WhisperX** local para dividi-la em `SPEAKER_00`, `SPEAKER_01`, … Tudo é unido em uma linha do tempo única.

Segmentos de trilhas diferentes **legitimamente se sobrepõem** no tempo (foram gravados separadamente). O trackscribe **preserva** essas sobreposições — nunca as deduplica.

## Recursos

- 🔎 **Inspeciona** as trilhas de áudio de qualquer MKV com `ffprobe` (codec, canais, tags de idioma/título, flag de padrão).
- ✂️ **Extrai** cada trilha para 16 kHz mono (WAV ou MP3) numa única passada do `ffmpeg`.
- 📝 **Transcreve** cada trilha com o OpenAI `whisper-1` (`verbose_json`, timestamps de segmento).
- 🗣️ **Diariza** a trilha de sistema multi-locutor localmente com **WhisperX** (opcional, via `--diarize`).
- 🧩 **Une** tudo em um array ordenado por `start`, preservando a sobreposição entre trilhas, com uma visão agrupada de "turnos" opcional.
- 🛟 **Robustez**: trilhas grandes são fatiadas automaticamente em fronteiras de silêncio (com reabsolutização de timestamps), trilhas quase silenciosas são puladas, jobs de GPU são serializados enquanto as chamadas de API rodam em paralelo limitado, e a famosa *falha silenciosa de diarização* do WhisperX é detectada e degrada com elegância.
- 🔒 **Spawn de processos seguro**: todo binário externo roda por um wrapper `execFile` sem shell, com erros tipados (binário ausente vs. saída diferente de zero).

## Como funciona

```
input.mkv
  └─ probeAudioTracks()          → AudioTrack[]            (ffprobe -show_streams)
       └─ extractAllTracks()     → track_0.wav … track_N  (ffmpeg -map 0:a:N, 16 kHz mono)
            ├─ trilha do mic  → transcribeTrack()  (OpenAI whisper-1)     → segmentos "Host"
            └─ trilha sistema → diarizeWithWhisperX() (GPU local, opt-in) → segmentos "system/SPEAKER_xx"
                  └─ mergeTranscripts() + ordena por start                 → Segment[] unificado
                        └─ grava unified.json (+ turns.json opcional)
```

## Pré-requisitos

| Ferramenta | Obrigatória? | Observações |
|---|---|---|
| **Node.js ≥ 20** | ✅ | Projeto ESM. |
| **ffmpeg / ffprobe** | ✅ | No `PATH`. Usado para probe, extração, detecção de silêncio e chunking. |
| **Chave da OpenAI** | ✅ | `OPENAI_API_KEY` — para a transcrição `whisper-1`. |
| **WhisperX** + **token HF** + GPU CUDA | ⛳ opcional | Só para `--diarize`. Veja [Diarização](#diarização-opcional). |

## Instalação

```bash
git clone https://github.com/frederico-kluser/trackscribe.git
cd trackscribe
npm install
npm run build            # compila para dist/
npm link                 # opcional: expõe o comando `trackscribe` globalmente
```

Depois crie seu `.env`:

```bash
cp .env.example .env
# edite o .env e defina OPENAI_API_KEY (e HF_TOKEN se for diarizar)
```

> O trackscribe carrega o `.env` com semântica de **override**, então a chave do projeto sempre vence uma `OPENAI_API_KEY` obsoleta deixada no perfil do shell.

## Uso

```bash
# Básico: transcreve cada trilha, marca por trilha, une → unified.json
trackscribe call.mkv

# Saída customizada + visão agrupada de "turnos"
trackscribe call.mkv -o transcript.json --turns

# Diariza a trilha de sistema (trilha 1) em múltiplos locutores
trackscribe call.mkv --diarize --system-track 1 --min-speakers 2 --max-speakers 4

# Arquivos intermediários menores (útil para gravações muito longas)
trackscribe call.mkv --format mp3

# Imprime o JSON na stdout em vez de um arquivo
trackscribe call.mkv -o -
```

Em desenvolvimento, dá para rodar direto do TypeScript sem compilar:

```bash
npm run dev -- call.mkv --turns
```

### Opções

| Flag | Padrão | Descrição |
|---|---|---|
| `<input.mkv>` | — | Caminho do MKV (posicional, obrigatório). |
| `-o, --out <arquivo>` | `unified.json` | Caminho de saída. `-` escreve o JSON na stdout. |
| `--turns` | off | Também grava a visão agrupada de "turnos" por locutor. |
| `--format <wav\|mp3>` | `wav` | Formato de extração. MP3 (64 kbps) reduz os intermediários. |
| `--diarize` | off | Diariza a trilha de sistema com WhisperX (precisa de `HF_TOKEN`). |
| `--system-track <N>` | `1` | Id da trilha tratada como o mix de sistema multi-locutor. |
| `--min-speakers <N>` | — | Limite inferior para o agrupamento da diarização. |
| `--max-speakers <N>` | — | Limite superior (limites rígidos melhoram a acurácia). |
| `-h, --help` | — | Mostra a ajuda. |

## Formato de saída

Um único array ordenado de forma ascendente por `start`. Cada elemento:

```jsonc
[
  { "speaker": "Host (microphone)", "track": 0, "start": 0.0, "end": 3.2,  "text": "Hey, thanks for hopping on the call." },
  { "speaker": "Call (system)",     "track": 1, "start": 3.0, "end": 5.8,  "text": "Of course, happy to be here." },
  { "speaker": "Host (microphone)", "track": 0, "start": 5.6, "end": 9.1,  "text": "So I wanted to walk through the roadmap." }
]
```

Repare que a trilha 0 terminando em **3.2** se sobrepõe à trilha 1 começando em **3.0** — os dois falaram quase ao mesmo tempo, capturados em trilhas independentes. Isso é correto e preservado. (Veja [`examples/unified.sample.json`](./examples/unified.sample.json).)

Com `--diarize`, as entradas da trilha de sistema ficam como `{ "speaker": "system/SPEAKER_00", "track": 1, … }`.

## Diarização (opcional)

A trilha do microfone é uma pessoa só — permanece rotulada como o host. Só a **trilha de sistema** pode conter vários participantes remotos, então a diarização roda **apenas nela**. Com uma GPU local, o [WhisperX](https://github.com/m-bain/whisperX) é a opção mais econômica e privada.

1. **Aceite os termos dos modelos protegidos no Hugging Face.** O WhisperX usa modelos `pyannote` protegidos para diarização.
   > ⚠️ **Pegadinha da falha silenciosa:** se você aceitar a *versão errada* do modelo (ex.: só `speaker-diarization-3.1` enquanto seu WhisperX espera `speaker-diarization-community-1`), o WhisperX **roda até o fim com rótulos de locutor vazios — sem erro**. O trackscribe detecta isso (segmentos todos `UNKNOWN` ou um erro de acesso protegido na saída do WhisperX), emite um aviso e cai de volta para o texto puro do Whisper, para você ainda ter a transcrição.
2. **Crie um token de leitura no Hugging Face** e coloque no `.env` como `HF_TOKEN`.
3. **Instale o WhisperX** (em um venv Python / via `pipx install whisperx`) para que o comando `whisperx` fique no `PATH`.

Então:

```bash
trackscribe call.mkv --diarize --system-track 1 --min-speakers 2 --max-speakers 2
```

Se o WhisperX não estiver instalado ou faltar `HF_TOKEN`, a trilha de sistema é simplesmente transcrita como um único locutor `Call (system)` — o pipeline nunca quebra.

## Como ele lida com as partes difíceis

- **Arquivos acima do limite de 25 MB** por requisição do Whisper são fatiados em chunks. Os cortes preferem **fronteiras de silêncio** (para não cortar palavras), e os timestamps de cada chunk são deslocados de volta para a linha do tempo absoluta antes do merge.
- **Trilhas quase silenciosas** são detectadas com `silencedetect` e puladas, para o Whisper não alucinar texto sobre o silêncio.
- **Concorrência**: chamadas à API do Whisper rodam em paralelo limitado (padrão 4); jobs de WhisperX/GPU são serializados, um por vez. Os dois nunca causam deadlock.
- **Sobreposição / crosstalk**: `detectCrosstalk()` pode sinalizar segmentos sobrepostos de trilhas diferentes, caso um consumidor queira marcar fala simultânea.

## Custos (verifique os preços atuais)

O `whisper-1` da OpenAI custava **US$ 0,006/min** com um limite de **25 MB** por requisição (valores de 2025–2026 — confirme as taxas e limites atuais antes de depender deles). O custo por trilha é simplesmente a soma dos minutos de áudio de cada trilha. O WhisperX roda localmente, então a diarização é grátis além da sua própria GPU/energia.

## Desenvolvimento

```bash
npm run typecheck     # tsc --noEmit (src + testes, strict)
npm run build         # gera dist/
npm test              # node:test via tsx — sem rede, sem GPU
```

Os testes nunca acessam a rede: os mapeadores de segmento são puros e testados contra fixtures, e o teste de integração **sintetiza** um MKV de 2 trilhas com o ffmpeg para exercitar probe + extração. A diarização ponta a ponta é pulada automaticamente quando `whisperx` não está no `PATH`.

### Estrutura do projeto

```
src/
  probe.ts        extract.ts      transcribe.ts   diarizeTrack.ts
  merge.ts        chunk.ts        silence.ts      pipeline.ts
  exec.ts         semaphore.ts    env.ts          types.ts   index.ts
test/             # specs do node:test + fixtures
```

## Solução de problemas

| Sintoma | Causa provável / correção |
|---|---|
| `Required binary "ffmpeg" was not found on PATH` | Instale o ffmpeg (`apt install ffmpeg` / `brew install ffmpeg`). |
| Transcrição falha de imediato | `OPENAI_API_KEY` não definida, ou sombreada por um valor obsoleto do shell (o trackscribe sobrescreve via `.env`). |
| Diarização dá `system/UNKNOWN` em todo segmento | Termos `pyannote` errados/não aceitos, ou `HF_TOKEN` inválido. Aceite a versão do modelo que seu WhisperX usa. |
| `--diarize` produz um único locutor `Call` | `whisperx` não instalado ou `HF_TOKEN` ausente — fallback gracioso esperado. |

## Licença

[Apache-2.0](./LICENSE) © Frederico Guilherme Kluser de Oliveira. Veja o [`NOTICE`](./NOTICE).
