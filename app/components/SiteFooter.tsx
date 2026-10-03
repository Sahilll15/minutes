import Link from 'next/link';

const TOOLS = [
  { name: 'Interview Coach', url: 'https://interview-coach-seven-rose.vercel.app', what: 'AI mock interview practice' },
  { name: 'SplitSnap', url: 'https://splitsnap-sandy.vercel.app', what: 'split a bill from a receipt photo' },
  { name: 'AskCSV', url: 'https://askcsv-seven.vercel.app', what: 'ask questions about a CSV' },
  { name: 'ShipNotes', url: 'https://shipnotes-mu.vercel.app', what: 'release notes from GitHub commits' },
  { name: 'ToneRadar', url: 'https://toneradar.vercel.app', what: 'check the tone of a message' },
  { name: 'Headline Arena', url: 'https://headline-arena-gamma.vercel.app', what: 'test and rank headlines' },
  { name: 'FinePrint', url: 'https://fineprint-beta.vercel.app', what: 'find risky clauses in contracts' },
  { name: 'fallacy finder', url: 'https://fallacy-finder-nine.vercel.app', what: 'spot logical fallacies' },
  { name: 'PitchPanel', url: 'https://pitchpanel.vercel.app', what: 'startup pitch feedback' },
  { name: 'Ask India', url: 'https://askindia.online', what: 'answers from official government sites' },
];

const link = 'font-semibold text-ink underline-offset-4 hover:underline';

export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-line bg-white ${className}`}>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 text-[13px] text-ink-soft sm:px-6">
        <p>
          Audio and transcripts are sent to OpenAI through this app&apos;s server to make the minutes. The server keeps no copy, and your
          meetings stay in this browser.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Link href="/how-it-works" className={link}>
            How it works
          </Link>
          <a href="https://github.com/Sahilll15/minutes" className={link}>
            Source code
          </a>
          <span>
            Built by{' '}
            <a href="https://sahilchalke.com" className={link}>
              Sahil Chalke
            </a>
          </span>
        </p>
        <div>
          <p className="font-semibold text-ink">More tools</p>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <li key={t.url}>
                <a href={t.url} className="font-medium text-ink underline-offset-4 hover:underline">
                  {t.name}
                </a>
                , {t.what}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
