/**
 * Minimal pyannoteAI REST client (no SDK; uses the global `fetch` on Node >= 20).
 *
 * Flow: POST /media/input → presigned PUT → POST /diarize → poll GET /jobs/{id}.
 * Cloud-only diarization with the `precision-2` model; no local GPU/WhisperX and
 * no gated Hugging Face models. The client only carries the speaker turns
 * ("who spoke when"); transcription stays on whisper-1 (see `align.ts`).
 *
 * ---
 *
 * Cliente REST mínimo da pyannoteAI (sem SDK; usa o `fetch` global do Node >= 20).
 * Faz upload via `media://`, cria o job de diarização e faz polling até o status
 * terminal. Diarização 100% na nuvem (`precision-2`); sem GPU/WhisperX local e sem
 * modelos protegidos do Hugging Face. O cliente só traz os turnos de locutor
 * ("quem falou quando"); a transcrição segue no whisper-1 (ver `align.ts`).
 */
import fs from "node:fs/promises";
import { debug } from "./debug.js";

const DEFAULT_BASE = "https://api.pyannote.ai/v1";

/** One diarization turn as returned by pyannoteAI. */
export interface PyannoteTurn {
  speaker: string; // e.g. "SPEAKER_00"
  start: number; // seconds
  end: number; // seconds
  confidence?: number; // optional per-turn confidence (0..100)
}

/**
 * Confidence track (present when `confidence: true`): a regularly-sampled score
 * curve, NOT a per-speaker map. `score[i]` (0..100) is the confidence at time
 * `i * resolution` seconds.
 */
export interface PyannoteConfidence {
  score: number[];
  resolution: number;
}

export interface PyannoteOutput {
  diarization?: PyannoteTurn[];
  exclusiveDiarization?: PyannoteTurn[];
  confidence?: PyannoteConfidence;
  warning?: string;
  error?: string;
}

export interface PyannoteJob {
  jobId: string;
  status:
    | "created"
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "canceled";
  output?: PyannoteOutput;
}

export interface DiarizeParams {
  minSpeakers?: number;
  maxSpeakers?: number;
  /** Set only when the exact count is known (== min == max). */
  numSpeakers?: number;
  model?: string; // default "precision-2"
  exclusive?: boolean; // default true
  confidence?: boolean; // default true
}

export class PyannoteError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PyannoteError";
  }
}

export class PyannoteClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE) {
    if (!apiKey) {
      throw new PyannoteError(
        "PYANNOTEAI_API_KEY is required for cloud diarization.",
      );
    }
    this.base = baseUrl.replace(/\/$/, "");
    this.headers = { Authorization: `Bearer ${apiKey}` };
  }

  /** Create temp storage + upload a local file. Returns the `media://` URL. */
  async uploadFile(localPath: string, objectKey: string): Promise<string> {
    const mediaUrl = `media://${objectKey}`;

    const create = await fetch(`${this.base}/media/input`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ url: mediaUrl }),
    });
    if (!create.ok) {
      throw new PyannoteError(
        `media/input failed: ${create.status} ${await safeText(create)}`,
        create.status,
      );
    }
    const { url: presignedUrl } = (await create.json()) as { url: string };

    // The presigned PUT is pre-authenticated — do NOT send the bearer header.
    const bytes = await fs.readFile(localPath);
    const put = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    if (!put.ok) {
      throw new PyannoteError(
        `upload PUT failed: ${put.status} ${await safeText(put)}`,
        put.status,
      );
    }
    debug(`pyannote: uploaded ${bytes.length} bytes → ${mediaUrl}`);
    return mediaUrl;
  }

  /** Create a diarization job. Returns the jobId. */
  async createDiarization(
    url: string,
    params: DiarizeParams = {},
  ): Promise<string> {
    const body: Record<string, unknown> = {
      url,
      model: params.model ?? "precision-2",
      exclusive: params.exclusive ?? true,
      confidence: params.confidence ?? true,
    };
    if (params.numSpeakers !== undefined) body.numSpeakers = params.numSpeakers;
    if (params.minSpeakers !== undefined) body.minSpeakers = params.minSpeakers;
    if (params.maxSpeakers !== undefined) body.maxSpeakers = params.maxSpeakers;

    const res = await fetch(`${this.base}/diarize`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new PyannoteError(
        `diarize failed: ${res.status} ${await safeText(res)}`,
        res.status,
      );
    }
    const { jobId } = (await res.json()) as { jobId: string };
    debug(`pyannote: created diarization job ${jobId} (model ${body.model})`);
    return jobId;
  }

  /** Poll a job until it reaches a terminal status. */
  async waitForJob(
    jobId: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<PyannoteJob> {
    const intervalMs = opts.intervalMs ?? 5_000;
    const timeoutMs = opts.timeoutMs ?? 30 * 60_000; // 30 min hard cap
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const res = await fetch(`${this.base}/jobs/${jobId}`, {
        headers: this.headers,
      });
      if (!res.ok) {
        throw new PyannoteError(
          `get job failed: ${res.status} ${await safeText(res)}`,
          res.status,
        );
      }
      const job = (await res.json()) as PyannoteJob;
      debug(`pyannote: job ${jobId} status=${job.status}`);
      if (
        job.status === "succeeded" ||
        job.status === "failed" ||
        job.status === "canceled"
      ) {
        return job;
      }
      if (Date.now() > deadline) {
        throw new PyannoteError(
          `diarization job ${jobId} timed out after ${timeoutMs} ms.`,
        );
      }
      await sleep(intervalMs);
    }
  }

  /** Convenience: upload → diarize → wait, returning the terminal job. */
  async diarizeLocalFile(
    localPath: string,
    objectKey: string,
    params: DiarizeParams = {},
  ): Promise<PyannoteJob> {
    const mediaUrl = await this.uploadFile(localPath, objectKey);
    const jobId = await this.createDiarization(mediaUrl, params);
    return this.waitForJob(jobId);
  }

  /**
   * Validate the API key against `GET /v1/test` — free, creates no job. Returns
   * the small status payload (`{ status, message }`) or throws PyannoteError.
   */
  async testAuth(): Promise<{ status?: string; message?: string }> {
    const res = await fetch(`${this.base}/test`, { headers: this.headers });
    if (!res.ok) {
      throw new PyannoteError(
        `auth test failed: ${res.status} ${await safeText(res)}`,
        res.status,
      );
    }
    return (await res.json()) as { status?: string; message?: string };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
