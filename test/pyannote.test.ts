import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { PyannoteClient, PyannoteError } from "../src/pyannote.js";

const BASE = "https://api.pyannote.ai/v1";

interface Call {
  url: string;
  method: string;
  body: string | null;
}

type Route = (url: string, init: RequestInit | undefined) => Response;

/** Swap the global `fetch` for a routed mock; no network is ever touched. */
function installMockFetch(route: Route): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return Promise.resolve(route(url, init));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

test("the constructor rejects an empty API key", () => {
  assert.throws(() => new PyannoteClient(""), PyannoteError);
});

test("uploadFile creates storage, PUTs the bytes, and returns the media:// url", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-pt-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const file = path.join(tmp, "track.wav");
  await fs.writeFile(file, Buffer.from("ABCDE"));

  let putBytes = -1;
  const mock = installMockFetch((url, init) => {
    if (url === `${BASE}/media/input` && init?.method === "POST") {
      return new Response(
        JSON.stringify({ url: "https://presigned.example/put?sig=1" }),
        { status: 200 },
      );
    }
    if (url === "https://presigned.example/put?sig=1" && init?.method === "PUT") {
      const b = init?.body;
      if (b instanceof Uint8Array) putBytes = b.byteLength;
      return new Response(null, { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  });
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  const media = await client.uploadFile(file, "obj-123");

  assert.equal(media, "media://obj-123");
  assert.equal(putBytes, 5);

  const create = mock.calls.find((c) => c.url.endsWith("/media/input"));
  assert.ok(create?.body);
  assert.equal(JSON.parse(create!.body!).url, "media://obj-123");
});

test("createDiarization posts precision-2/exclusive/confidence and returns the jobId", async (t) => {
  const mock = installMockFetch((url, init) => {
    if (url === `${BASE}/diarize` && init?.method === "POST") {
      return new Response(JSON.stringify({ jobId: "job-abc" }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  });
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  const jobId = await client.createDiarization("media://obj-123", {
    minSpeakers: 2,
    maxSpeakers: 4,
  });
  assert.equal(jobId, "job-abc");

  const call = mock.calls.find((c) => c.url.endsWith("/diarize"));
  assert.ok(call?.body);
  const sent = JSON.parse(call!.body!) as Record<string, unknown>;
  assert.equal(sent.url, "media://obj-123");
  assert.equal(sent.model, "precision-2");
  assert.equal(sent.exclusive, true);
  assert.equal(sent.confidence, true);
  assert.equal(sent.minSpeakers, 2);
  assert.equal(sent.maxSpeakers, 4);
  // numSpeakers is omitted unless explicitly provided.
  assert.equal("numSpeakers" in sent, false);
});

test("waitForJob polls until the job reaches a terminal status", async (t) => {
  const statuses = ["running", "running", "succeeded"];
  let i = 0;
  const mock = installMockFetch((url) => {
    if (url === `${BASE}/jobs/job-abc`) {
      const status = statuses[Math.min(i, statuses.length - 1)];
      i++;
      const extra =
        status === "succeeded" ? { output: { diarization: [] } } : {};
      return new Response(
        JSON.stringify({ jobId: "job-abc", status, ...extra }),
        { status: 200 },
      );
    }
    return new Response("unexpected", { status: 500 });
  });
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  const job = await client.waitForJob("job-abc", { intervalMs: 1 });
  assert.equal(job.status, "succeeded");
  assert.ok(i >= 3, "should have polled at least three times");
});

test("a non-2xx response throws PyannoteError carrying the status", async (t) => {
  const mock = installMockFetch(() => new Response("nope", { status: 503 }));
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  await assert.rejects(
    () => client.createDiarization("media://x"),
    (err: unknown) => err instanceof PyannoteError && err.status === 503,
  );
});

test("diarizeLocalFile runs upload → diarize → poll and returns the terminal job", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-pt-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const file = path.join(tmp, "track.wav");
  await fs.writeFile(file, Buffer.from("ABCDE"));

  const mock = installMockFetch((url, init) => {
    if (url.endsWith("/media/input")) {
      return new Response(
        JSON.stringify({ url: "https://presigned.example/put" }),
        { status: 200 },
      );
    }
    if (url === "https://presigned.example/put" && init?.method === "PUT") {
      return new Response(null, { status: 200 });
    }
    if (url.endsWith("/diarize")) {
      return new Response(JSON.stringify({ jobId: "job-xyz" }), { status: 200 });
    }
    if (url.endsWith("/jobs/job-xyz")) {
      return new Response(
        JSON.stringify({
          jobId: "job-xyz",
          status: "succeeded",
          output: {
            exclusiveDiarization: [
              { speaker: "SPEAKER_00", start: 0, end: 1 },
            ],
          },
        }),
        { status: 200 },
      );
    }
    return new Response("unexpected", { status: 500 });
  });
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  const job = await client.diarizeLocalFile(file, "obj-xyz", { minSpeakers: 2 });

  assert.equal(job.status, "succeeded");
  assert.equal(job.output?.exclusiveDiarization?.length, 1);

  const urls = mock.calls.map((c) => c.url);
  assert.ok(urls.some((u) => u.endsWith("/media/input")));
  assert.ok(urls.some((u) => u.endsWith("/diarize")));
  assert.ok(urls.some((u) => u.endsWith("/jobs/job-xyz")));
});

test("testAuth hits GET /v1/test and returns the status payload", async (t) => {
  const mock = installMockFetch((url) => {
    if (url === `${BASE}/test`) {
      return new Response(
        JSON.stringify({ status: "OK", message: "Test connection successful" }),
        { status: 200 },
      );
    }
    return new Response("unexpected", { status: 500 });
  });
  t.after(mock.restore);

  const client = new PyannoteClient("test-key");
  const out = await client.testAuth();
  assert.equal(out.status, "OK");

  const call = mock.calls.find((c) => c.url.endsWith("/test"));
  assert.ok(call);
  assert.equal(call!.method, "GET");
});

test("testAuth throws PyannoteError carrying the status on an invalid key", async (t) => {
  const mock = installMockFetch(() => new Response("Unauthorized", { status: 401 }));
  t.after(mock.restore);

  const client = new PyannoteClient("bad-key");
  await assert.rejects(
    () => client.testAuth(),
    (err: unknown) => err instanceof PyannoteError && err.status === 401,
  );
});
