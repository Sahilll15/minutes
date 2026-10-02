# Minutes

Record a meeting in the browser or upload the audio, and get minutes you can check. You get a 3 sentence summary, decisions, action items with owners and due dates, open questions and risks. Every item links back to the transcript lines it came from. Click an item and the transcript scrolls to those lines, highlights the quoted phrase and moves the audio there.

It's for anyone who writes up meetings and needs to show where each point came from: PMs, team leads, agency account managers.

Two sample meetings ship in `public/samples/` (a product standup and a client kickoff), so you can run the whole pipeline in one click.

## How it works

1. **Transcription with speaker labels.** `/api/transcribe` sends the audio to `gpt-4o-transcribe-diarize` with `response_format: "diarized_json"` and `chunking_strategy: "auto"`. The API needs chunking for anything over 30 seconds. The model returns many short phrases, so `normalizeSegments` merges back-to-back phrases from the same speaker into turns (at most 15 s or 320 characters, so citations stay precise) and gives each turn a stable id (`s1`, `s2`, ...).
2. **Known speakers.** The samples also send 8 second reference clips with `known_speaker_names` / `known_speaker_references`, so diarization returns real names. Your own meetings come back as `A`, `B`, `C` and you rename them. A rename updates action item owners right away, because owners are stored as the speaker label, not as a copy of the name.
3. **Structured extraction.** `/api/extract` makes one Responses API call (`gpt-5.4-mini`, low reasoning effort) with Structured Outputs through `zodTextFormat`. The prompt shows the transcript as `[s12 01:23] Name: text`. Every item has to return `segment_ids` and a short verbatim `quote`. The same call writes the follow-up email draft.
4. **Grounding checks on the model's output.** The server does not take the model's citations at face value:
   - ids are normalized (`S3`, `[s03]`, `seg 3` all become `s3`), ids that don't exist get dropped, and items left with no valid citation get removed (the UI shows how many)
   - an item's timestamp comes from the first segment it cites, never from the model
   - word overlap between the quote and the cited text gives a support score. Items under 60% get a "check source" badge. Summary sentences paraphrase on purpose, so they only need valid citations
   - due dates must be real `YYYY-MM-DD` dates. Relative days are resolved against the meeting date, and vague timing like "this week" gets no date
5. **Exports.** Copy as markdown, download `.md`, download an `.ics` file (one all-day event per dated action item, RFC 5545 escaping and 75 octet line folding), and copy the email draft.

Meetings live in `localStorage` as a list. Uploaded and recorded audio goes into IndexedDB so playback still works after a reload. Nothing is stored on a server.

## Cost and abuse controls

- Per-IP sliding window rate limits, tight by default: 3 transcriptions and 5 extractions per hour. The client IP comes from `x-real-ip`, then the last `x-forwarded-for` entry, because the leftmost entry can be spoofed.
- Input gets validated before it counts against the limit. The server checks `content-length` before parsing form data, caps uploads at 4 MB (Vercel bodies max out near 4.5 MB), caps speaker references at 4 clips of 256 KB each, and checks file type. Extraction input has a zod schema and caps on segment count, text length and body size.
- The browser recorder uses 32 kbps Opus and stops itself near the 4 MB cap.
- The OpenAI client retries twice with a timeout. Upstream errors become short user-facing messages, and a meeting that fails mid-step can be retried from that step.
- The transcript goes into the prompt as untrusted data, and the prompt tells the model to ignore instructions inside it.

Rough cost per 2 minute meeting from the token usage I measured: about 1.9k audio input tokens and 3k output tokens for transcription, plus about 1.4k input and 1.1k output tokens for extraction. That's a few cents per meeting, and transcription is most of it.

## Run it

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY
npm run dev                  # http://localhost:3202
npm test                     # citation mapping, transcript merging, ics
npm run lint && npm run build
```

The sample audio was generated once with `gpt-4o-mini-tts`, using a different voice and style instructions for each speaker. Regenerate it with `node --env-file=.env.local scripts/generate-samples.mjs` (needs ffmpeg). The scripts live in `samples/*.json`.

## Config

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server-side key, never sent to the browser |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Model for extraction |
| `RATE_LIMIT_TRANSCRIBE` | `3` | Transcriptions per IP per window |
| `RATE_LIMIT_EXTRACT` | `5` | Extractions per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window |

The rate limiter is in memory, so each serverless instance keeps its own counts. That's fine for a demo. A shared store would be needed for strict limits.
