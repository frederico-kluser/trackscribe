<div align="center">

# 🎙️ trackscribe

**Transforme gravações MKV multi-trilha em um único JSON de transcrição, ordenado no tempo e atribuído por locutor.**

Cada trilha de áudio vira um locutor — OpenAI Whisper por trilha, com diarização opcional via pyannoteAI (nuvem) para a única trilha que mistura várias pessoas.

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

Qualquer trilha pode misturar vários participantes remotos. Então o trackscribe transcreve cada trilha com o Whisper, marca cada segmento com sua trilha e — *opcionalmente, para **todas** as trilhas* (`--diarize`) — roda a diarização **pyannoteAI** (nuvem, `precision-2`) para encontrar múltiplos falantes em qualquer trilha, rotulando `t{N}/SPEAKER_00`, `t{N}/SPEAKER_01`, … Tudo é unido em uma linha do tempo única.

Segmentos de trilhas diferentes **legitimamente se sobrepõem** no tempo (foram gravados separadamente). O trackscribe **preserva** essas sobreposições — nunca as deduplica.

## Recursos

- 🔎 **Inspeciona** as trilhas de áudio de qualquer MKV com `ffprobe` (codec, canais, tags de idioma/título, flag de padrão).
- ✂️ **Extrai** cada trilha para 16 kHz mono (WAV ou MP3) numa única passada do `ffmpeg`.
- 📝 **Transcreve** cada trilha com o OpenAI `whisper-1` (`verbose_json`, timestamps de segmento).
- 🗣️ **Diariza** **todas** as trilhas de áudio na nuvem com **pyannoteAI** (`precision-2`, via `--diarize`) — cada trilha é checada por múltiplos falantes e rotulada `t{N}/SPEAKER_xx`; a transcrição segue no `whisper-1`.
- 🧩 **Une** tudo em um array ordenado por `start`, preservando a sobreposição entre trilhas, com uma visão agrupada de "turnos" opcional.
- 🛟 **Robustez**: trilhas grandes são fatiadas automaticamente em fronteiras de silêncio (com reabsolutização de timestamps), trilhas quase silenciosas são puladas, as chamadas de API do Whisper rodam em paralelo limitado enquanto os jobs de diarização na nuvem são limitados por taxa, e uma diarização falha ou degenerada é detectada e degrada com elegância para um único locutor.
- 🔒 **Spawn de processos seguro**: todo binário externo roda por um wrapper `execFile` sem shell, com erros tipados (binário ausente vs. saída diferente de zero).

## Como funciona

```
input.mkv
  └─ probeAudioTracks()          → AudioTrack[]            (ffprobe -show_streams)
       └─ extractAllTracks()     → track_0.wav … track_N  (ffmpeg -map 0:a:N, 16 kHz mono)
            ├─ transcribeTrack()   (OpenAI whisper-1)                       → segmentos de texto por trilha
            └─ diarizeTrackCloud() (whisper-1 + pyannoteAI, com --diarize)  → "t{N}/SPEAKER_xx" por trilha
                  └─ mergeTranscripts() + ordena por start                 → Segment[] unificado
                        └─ grava unified.json (+ turns.json opcional)
```

## Pré-requisitos

| Ferramenta | Obrigatória? | Observações |
|---|---|---|
| **Node.js ≥ 20** | ✅ | Projeto ESM. |
| **ffmpeg / ffprobe** | ✅ | No `PATH`. Usado para probe, extração, detecção de silêncio e chunking. |
| **Chave da OpenAI** | ✅ | `OPENAI_API_KEY` — para a transcrição `whisper-1`. |
| **Chave da pyannoteAI** | ⛳ opcional | `PYANNOTEAI_API_KEY` — só para `--diarize` (diarização na nuvem, `precision-2`). Veja [Diarização](#diarização-opcional). |

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
# edite o .env e defina OPENAI_API_KEY (e PYANNOTEAI_API_KEY se for diarizar)
```

> O trackscribe carrega o `.env` com semântica de **override**, então a chave do projeto sempre vence uma `OPENAI_API_KEY` obsoleta deixada no perfil do shell.

### Chaves de API (`.env`)

Duas chaves ficam no `.env`. **O `.env` é gitignored — nunca comite ele; comite só o `.env.example`.**

| Chave | Obrigatória? | Onde conseguir |
|---|---|---|
| `OPENAI_API_KEY` | ✅ sempre | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — precisa de conta com billing; começa com `sk-`. Usada na transcrição `whisper-1`. |
| `PYANNOTEAI_API_KEY` | ⛳ só para `--diarize` | [dashboard.pyannote.ai](https://dashboard.pyannote.ai) — **créditos de teste grátis inclusos**. Usada na diarização na nuvem (`precision-2`). |
| `PYANNOTEAI_BASE_URL` | opcional | Sobrescreve a URL base da API (padrão `https://api.pyannote.ai/v1`). |

```bash
cp .env.example .env        # depois edite o .env:
#   OPENAI_API_KEY=sk-...
#   PYANNOTEAI_API_KEY=...
```

Antes de um teste ao vivo, valide as chaves e as APIs (endpoints grátis, sem gastar crédito):

```bash
npm run doctor caminho/do/video.mkv
```

## Uso

```bash
# Básico: transcreve cada trilha, marca por trilha, une → unified.json
trackscribe call.mkv

# Saída customizada + visão agrupada de "turnos"
trackscribe call.mkv -o transcript.json --turns

# Diariza TODAS as trilhas (detecta múltiplos falantes por trilha), com log de debug
trackscribe call.mkv --diarize --verbose

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
| `--diarize` | off | Diariza **todas** as trilhas de áudio via pyannoteAI na nuvem (precisa de `PYANNOTEAI_API_KEY`). |
| `--system-track <N>` | `1` | Id da trilha usado só para o rótulo amigável de fallback. |
| `--min-speakers <N>` | — | Limite inferior do agrupamento (dica, aplicada a todas as trilhas). |
| `--max-speakers <N>` | — | Limite superior (dica, aplicada a todas as trilhas). |
| `--verbose` | off | Log de debug verboso na stderr (probe, chunks, jobs, polling, alinhamento). |
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

Com `--diarize`, as entradas de cada trilha diarizada são namespaced por trilha, ex. `{ "speaker": "t1/SPEAKER_00", "track": 1, … }` (e `t0/SPEAKER_00` para a trilha 0). Uma trilha com um locutor só mostra `t{N}/SPEAKER_00`.

## Diarização (opcional)

A separação física de trilhas já te dá microfone-vs-sistema de graça. Além disso, o `--diarize` checa **todas** as trilhas de áudio por múltiplos falantes, na nuvem via [pyannoteAI](https://www.pyannote.ai) (modelo `precision-2`). **Sem GPU local, sem CUDA e sem modelo protegido do Hugging Face**: o trackscribe mantém o `whisper-1` como motor de transcrição e pede à pyannoteAI apenas os **turnos de fala** ("quem falou quando"), sobrepostos aos segmentos do whisper-1 por **máxima sobreposição temporal** (`src/align.ts`). Os locutores de cada trilha são namespaced `t{N}/SPEAKER_xx`; uma trilha com um locutor só é um resultado válido, não uma falha.

1. **Crie uma chave da pyannoteAI** em [dashboard.pyannote.ai](https://dashboard.pyannote.ai) (créditos de teste grátis inclusos) e coloque no `.env` como `PYANNOTEAI_API_KEY`.
2. *(opcional)* Sobrescreva a URL base da API com `PYANNOTEAI_BASE_URL` (padrão `https://api.pyannote.ai/v1`).

Então:

```bash
trackscribe call.mkv --diarize --verbose
```

Por baixo dos panos, para cada trilha o trackscribe sobe o WAV 16 kHz mono extraído para um storage temporário criptografado (removido em ~48 h), cria um job `precision-2` no modo `exclusive` (um locutor por instante), faz polling até terminar e alinha os turnos retornados à transcrição daquela trilha. Se faltar `PYANNOTEAI_API_KEY` — ou se um job na nuvem falhar, expirar ou não retornar turnos úteis — o trackscribe avisa e mantém a transcrição pura do whisper-1 daquela trilha sob seu rótulo amigável. **O pipeline nunca quebra e o `unified.json` sempre é gravado.**

> **Privacidade:** com `--diarize`, o áudio de **todas** as trilhas é enviado para a nuvem da pyannoteAI (GDPR; residência de dados na UE disponível; mídia removida em ~48 h, resultados de job em ~24 h). Se nada pode sair da sua infraestrutura, pondere isso antes de habilitar.

## Como ele lida com as partes difíceis

- **Arquivos acima do limite de 25 MB** por requisição do Whisper são fatiados em chunks. Os cortes preferem **fronteiras de silêncio** (para não cortar palavras), e os timestamps de cada chunk são deslocados de volta para a linha do tempo absoluta antes do merge.
- **Trilhas quase silenciosas** são detectadas com `silencedetect` e puladas, para o Whisper não alucinar texto sobre o silêncio.
- **Concorrência**: chamadas à API do Whisper rodam em paralelo limitado (padrão 4); os jobs de diarização na nuvem são limitados por um semáforo separado (padrão 2) para respeitar os limites de ~80–100 req/min da pyannoteAI.
- **Sobreposição / crosstalk**: `detectCrosstalk()` pode sinalizar segmentos sobrepostos de trilhas diferentes, caso um consumidor queira marcar fala simultânea.

## Custos (verifique os preços atuais)

O `whisper-1` da OpenAI custava **US$ 0,006/min** com um limite de **25 MB** por requisição (valores de 2025–2026 — confirme as taxas e limites atuais antes de depender deles). O custo por trilha é simplesmente a soma dos minutos de áudio de cada trilha. A diarização na nuvem da pyannoteAI é cobrada à parte, **por hora de áudio** (ordem de grandeza ≈ €0,10/h para diarização-only em 2026 — confirme no seu painel), e só quando você passa `--diarize`.

## Desenvolvimento

```bash
npm run typecheck            # tsc --noEmit (src + testes + scripts, strict)
npm run build                # gera dist/
npm test                     # node:test via tsx — sem rede, sem chaves de API
npm run doctor [video.mkv]   # preflight: chaves, ffmpeg, auth OpenAI+pyannote, probe do vídeo + custo
npm run clip -- in.mkv 60    # corta um clipe de 60s (todas as trilhas copiadas) p/ iterar barato
```

Os testes nunca acessam a rede: os mapeadores de segmento/alinhamento são puros e testados contra fixtures, o cliente da pyannoteAI é coberto por um teste com **`fetch` mockado** (sem chamada real de diarização), e o teste de integração **sintetiza** um MKV de 2 trilhas com o ffmpeg para exercitar probe + extração.

**Debugando um teste ao vivo.** Antes de gastar crédito, `npm run doctor caminho/do/video.mkv` valida as chaves e as duas APIs pelos endpoints **grátis** (OpenAI `models.list`, pyannoteAI `GET /v1/test` — sem criar job), e imprime o layout das trilhas + uma estimativa de custo. Adicione `--verbose` a qualquer execução para logs etapa-a-etapa (probe, chunking, job ids, polling, alinhamento) na stderr.

### Estrutura do projeto

```
src/
  probe.ts        extract.ts      transcribe.ts   diarizeTrack.ts
  pyannote.ts     align.ts        merge.ts        chunk.ts
  silence.ts      pipeline.ts     exec.ts         semaphore.ts
  env.ts          types.ts        index.ts
test/             # specs do node:test + fixtures
```

## Solução de problemas

| Sintoma | Causa provável / correção |
|---|---|
| `Required binary "ffmpeg" was not found on PATH` | Instale o ffmpeg (`apt install ffmpeg` / `brew install ffmpeg`). |
| Transcrição falha de imediato | `OPENAI_API_KEY` não definida, ou sombreada por um valor obsoleto do shell (o trackscribe sobrescreve via `.env`). |
| Diarização dá `system/UNKNOWN` em todo segmento | A pyannoteAI não retornou nenhum turno sobrepondo esses segmentos (áudio ruidoso/atípico). O trackscribe avisa e mantém a transcrição do whisper-1. |
| `--diarize` produz um único locutor `Call` | `PYANNOTEAI_API_KEY` ausente, ou o job na nuvem falhou / expirou / pareceu degenerado — fallback gracioso para o whisper-1, esperado. |

## Licença

[Apache-2.0](./LICENSE) © Frederico Guilherme Kluser de Oliveira. Veja o [`NOTICE`](./NOTICE).
