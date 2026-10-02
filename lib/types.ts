export type Segment = {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
};

export type CitedItem = {
  id: string;
  text: string;
  segmentIds: string[];
  quote: string;
  /** Share of the quote's words found in the cited segments, 0..1. */
  support: number;
  grounded: boolean;
  at: number | null;
};

export type ActionItem = CitedItem & {
  owner: string | null;
  /** Diarization label when the owner is a speaker, so renames follow through. */
  ownerSpeaker: string | null;
  due: string | null;
  duePhrase: string | null;
};

export type Extraction = {
  summary: CitedItem[];
  decisions: CitedItem[];
  actions: ActionItem[];
  questions: CitedItem[];
  risks: CitedItem[];
  email: { subject: string; body: string };
  dropped: number;
  model: string;
  createdAt: number;
};

export type MeetingStatus = 'transcribing' | 'naming' | 'extracting' | 'ready' | 'error';
export type MeetingSource = 'recorded' | 'uploaded' | 'sample';

export type Meeting = {
  id: string;
  title: string;
  date: string;
  createdAt: number;
  source: MeetingSource;
  sampleId?: string;
  audioUrl?: string;
  duration: number;
  status: MeetingStatus;
  error?: string;
  /** Step to retry from when status is "error". */
  failedStep?: 'transcribe' | 'extract';
  speakers: Record<string, string>;
  segments: Segment[];
  extraction?: Extraction;
  done: string[];
};

export type SectionKey = 'summary' | 'decisions' | 'actions' | 'questions' | 'risks';
