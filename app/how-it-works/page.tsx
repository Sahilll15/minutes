import Link from 'next/link';
import { JsonLd } from '@/app/components/JsonLd';
import { SiteFooter } from '@/app/components/SiteFooter';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_SEGMENTS, MAX_TRANSCRIPT_CHARS } from '@/lib/limits';
import { SUPPORT_THRESHOLD } from '@/lib/citations';
import { breadcrumbs, pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'How it works: from meeting audio to cited minutes',
  description:
    'How Minutes transcribes meeting audio with speaker labels, writes a summary, decisions and action items, and links every item to the transcript lines it came from. Limits and privacy included.',
  path: '/how-it-works',
});

const MB = MAX_AUDIO_BYTES / 1024 / 1024;
const MINUTES = MAX_AUDIO_SECONDS / 60;

const STEPS = [
  {
    title: 'Record or upload',
    body: `Record in the browser or drop in an mp3, m4a, mp4, wav, webm, ogg or flac file up to ${MB} MB. The recorder saves speech-quality Opus at 32 kbps and stops itself near the ${MB} MB cap, which is about 15 minutes.`,
  },
  {
    title: 'Transcribe with speaker labels',
    body: `The server reads the audio length from the file before anything else and refuses audio over ${MINUTES} minutes. It then sends the audio to OpenAI's gpt-4o-transcribe-diarize model, which returns short phrases tagged by speaker. Back-to-back phrases from one speaker are merged into turns of at most 15 seconds or 320 characters, and each turn gets a fixed id (s1, s2, s3).`,
  },
  {
    title: 'Name the speakers',
    body: 'Your own meetings come back with speakers called A, B and C, and you type their names. Owners of action items are stored as the speaker label, so renaming someone updates every item they own. The two sample meetings also send a short voice clip for each person, so they come back with real names.',
  },
  {
    title: 'Write the minutes',
    body: 'One call to the OpenAI Responses API (gpt-5.4-mini by default) with a fixed output schema turns the transcript into a 3 sentence summary, decisions, action items with owner and due date, open questions, risks and a follow-up email draft. Every item has to list the segment ids it came from and a short quote copied from them.',
  },
  {
    title: 'Check the citations',
    body: `The server does not trust the model's citations. Ids that do not exist are dropped, and an item left with no valid citation is removed (the page tells you how many). If fewer than ${Math.round(SUPPORT_THRESHOLD * 100)}% of the quote's words appear in the cited lines, the item gets a "check source" badge. Due dates must be real dates; "Friday" is resolved against the meeting date, and vague timing like "this week" gets no date.`,
  },
];

const SPLIT = [
  ['Recording, upload checks, playback', 'Browser'],
  ['Your list of meetings and their minutes', 'Browser (localStorage)'],
  ['Audio for playback after a reload', 'Browser (IndexedDB)'],
  ['Audio length check, rate limits, daily audio budget', 'Server'],
  ['Transcription with speaker labels', 'Server, calling OpenAI'],
  ['Minutes, citations and the email draft', 'Server, calling OpenAI'],
  ['Markdown, calendar (.ics) and email exports', 'Browser'],
];

const LIMITS = [
  `Audio files up to ${MB} MB and ${MINUTES} minutes long.`,
  'In-browser recording stops near the size cap, about 15 minutes at speech quality.',
  'By default, 3 transcriptions and 5 extractions per hour from one IP address.',
  'By default, 120 minutes of audio per day across the whole site. After that, transcription is paused until the next UTC day.',
  `A transcript can have up to ${MAX_SEGMENTS} turns and ${MAX_TRANSCRIPT_CHARS.toLocaleString('en-US')} characters to be turned into minutes in one pass.`,
];

const card = 'rounded-[28px] bg-white p-5 ring-1 ring-line sm:p-6';
const h2 = 'text-[19px] font-extrabold tracking-tight';

export default function HowItWorksPage() {
  return (
    <div className="min-h-dvh">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          ...breadcrumbs([
            { name: 'Home', path: '/' },
            { name: 'How it works', path: '/how-it-works' },
          ]),
        }}
      />
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-full">
            <span className="flex size-9 items-center justify-center rounded-[12px] bg-ink" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 15V9m4.5 9V6m4.5 10V8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="18.5" cy="8" r="2.3" fill="#f5c518" />
              </svg>
            </span>
            <span className="text-[17px] font-extrabold tracking-tight">Minutes</span>
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Open the app
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <ol className="flex flex-wrap gap-1.5">
            <li>
              <Link href="/" className="font-semibold hover:text-ink hover:underline">
                Home
              </Link>{' '}
              /
            </li>
            <li aria-current="page">How it works</li>
          </ol>
        </nav>

        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]">How Minutes turns a meeting into minutes</h1>
          <div className="mt-3 max-w-2xl space-y-2 text-[15px] leading-relaxed text-ink-soft">
            <p>
              Minutes is a free web app that turns meeting audio into minutes you can check. You record in the browser or upload a file up to {MB}{' '}
              MB and {MINUTES} minutes long.
            </p>
            <p>
              It returns a transcript with speaker labels, a 3 sentence summary, decisions, action items with owners and due dates, open questions and
              risks. Every item links to the transcript lines it came from, so you can confirm it was really said. There is no account and nothing to
              pay.
            </p>
          </div>
        </div>

        <section aria-labelledby="steps-h" className={card}>
          <h2 id="steps-h" className={h2}>
            The steps
          </h2>
          <ol className="mt-4 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3.5">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold">{s.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="cite-h" className={card}>
          <h2 id="cite-h" className={h2}>
            What a citation points to
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
            Each item cites one or more transcript turns by id. Click an item and the transcript scrolls to the first cited turn, the quoted phrase is
            highlighted, and the audio player moves to the second that turn starts. The item&apos;s timestamp comes from that turn, never from the model.
            Summary sentences are paraphrases by design, so they only need valid citations, not a matching quote.
          </p>
        </section>

        <section aria-labelledby="split-h" className={card}>
          <h2 id="split-h" className={h2}>
            What runs where
          </h2>
          <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-line">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-soft text-ink">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-bold">
                    Task
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-bold">
                    Where
                  </th>
                </tr>
              </thead>
              <tbody>
                {SPLIT.map(([task, where]) => (
                  <tr key={task} className="border-t border-line">
                    <td className="px-4 py-2.5 text-ink">{task}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] text-ink-soft">The OpenAI API key stays on the server and is never sent to the browser.</p>
        </section>

        <section aria-labelledby="limits-h" className={card}>
          <h2 id="limits-h" className={h2}>
            Limits
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft marker:text-ink-faint">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-soft">
            The limits exist because the demo runs on the author&apos;s own API credits and transcription is billed by audio length.
          </p>
        </section>

        <section aria-labelledby="privacy-h" className={card}>
          <h2 id="privacy-h" className={h2}>
            Privacy
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft marker:text-ink-faint">
            <li>Your audio is sent through this app&apos;s server to OpenAI for transcription.</li>
            <li>The transcript, speaker names, meeting title and date are sent the same way to write the minutes.</li>
            <li>The server does not save audio, transcripts or minutes. It keeps only short-lived request counts per IP address for rate limits.</li>
            <li>
              Your meetings and minutes are saved in this browser&apos;s localStorage, and the audio in IndexedDB. Deleting a meeting in the app removes
              both. Another browser or device will not see them.
            </li>
          </ul>
        </section>

        <section aria-labelledby="sample-h" className={card}>
          <h2 id="sample-h" className={h2}>
            Try it with a sample
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
            Two short scripted meetings ship with the app: a product standup and a client kickoff, each under two minutes. Their audio was generated
            with text to speech from these scripts. This is the start of the standup script:
          </p>
          <blockquote className="mt-3 space-y-2 rounded-2xl bg-soft p-4 text-[14px] leading-relaxed text-ink">
            <p>
              <span className="font-bold">Priya:</span> Morning everyone. Quick standup, we have the billing launch on the fourteenth so let&apos;s keep
              it tight. Marcus, you want to start?
            </p>
            <p>
              <span className="font-bold">Marcus:</span> Sure. The new invoice service is merged. I&apos;m still fixing the proration bug when someone
              downgrades mid cycle. I should have that done by Wednesday.
            </p>
          </blockquote>
          <p className="mt-3 text-[14px] text-ink-soft">
            Read the full{' '}
            <a href="/samples/standup.txt" className="font-semibold text-ink underline underline-offset-4">
              standup script
            </a>{' '}
            or the{' '}
            <a href="/samples/kickoff.txt" className="font-semibold text-ink underline underline-offset-4">
              kickoff script
            </a>
            , then{' '}
            <Link href="/" className="font-semibold text-ink underline underline-offset-4">
              run either one in the app
            </Link>{' '}
            to see the minutes it produces.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
