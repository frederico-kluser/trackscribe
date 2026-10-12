# trackscribe skill catalog

The `project-router` consults this index to assemble the skill chain for a task.
Source of truth: `.agents/skills/`; `.claude/skills` symlinks here. Keep this
index in sync when adding/removing a skill (the linter validates the skills, not
this index).

## Routing table

| skill | type | load when the task… | verification signal |
|---|---|---|---|
| [project-router](./project-router/SKILL.md) | router | …is anything — entry point for every task | skill-lint + routing evals |
| [understanding-trackscribe-architecture](./understanding-trackscribe-architecture/SKILL.md) | knowledge | …is non-trivial / cross-module, or asks where code lives or how stages connect | `npm run build` |
| [following-typescript-conventions](./following-typescript-conventions/SKILL.md) | knowledge | …edits any `.ts`, adds an import, spawns a process, reads env, or touches the OpenAI client | `npm run typecheck` |
| [working-with-ffmpeg-media](./working-with-ffmpeg-media/SKILL.md) | task | …touches `probe/extract/silence/chunk`, audio extraction, codecs, 16 kHz mono, or chunking | `npm test` |
| [transcribing-and-diarizing](./transcribing-and-diarizing/SKILL.md) | knowledge | …touches Whisper/WhisperX, the OpenAI audio API, speaker labels, or diarization | `npm test` |
| [testing-trackscribe](./testing-trackscribe/SKILL.md) | task | …adds/modifies/runs tests, or hits a CI test failure | `npm test` |

## Typical chains
- **bug fix / feature in a domain:** `understanding-architecture` → `following-typescript-conventions` → the domain skill (`working-with-ffmpeg-media` and/or `transcribing-and-diarizing`) → `testing-trackscribe` → on completion, the task skills' registo de aprendizado (memória CoALA local).
- **test-only change:** `testing-trackscribe` (+ `following-typescript-conventions` if editing `.ts`).
- **"where/how does X work":** `understanding-trackscribe-architecture` alone.

## Composition rules
- Almost every code task loads `following-typescript-conventions`.
- `working-with-ffmpeg-media` feeds `transcribing-and-diarizing` (extraction → transcription); order them that way; independent reads can run as parallel isolated-context subagents.
- Any code change ends by running `npm test` (and `npm run typecheck`).
- New area with no skill → a memória CoALA local (`coala.py add`) proposes a draft skill (human-reviewed), never auto-publishes.
