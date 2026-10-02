import kickoff from '../samples/kickoff.json';
import standup from '../samples/standup.json';

export type Sample = {
  id: string;
  title: string;
  date: string;
  blurb: string;
  people: string[];
  audioUrl: string;
  scriptUrl: string;
  seconds: number;
  refs: { name: string; url: string }[];
};

function refsFor(id: string, names: string[]) {
  return names.map((name) => ({ name, url: `/samples/refs/${id}-${name.toLowerCase()}.mp3` }));
}

export const SAMPLES: Sample[] = [
  {
    id: standup.id,
    title: standup.title,
    date: standup.date,
    blurb: 'Billing launch prep: a proration bug, a pricing call and a support handoff.',
    people: Object.keys(standup.speakers),
    audioUrl: '/samples/standup.mp3',
    scriptUrl: '/samples/standup.txt',
    seconds: 104,
    refs: refsFor(standup.id, Object.keys(standup.speakers)),
  },
  {
    id: kickoff.id,
    title: kickoff.title,
    date: kickoff.date,
    blurb: 'Agency and client agree scope, phases, owners and a hard March deadline.',
    people: Object.keys(kickoff.speakers),
    audioUrl: '/samples/kickoff.mp3',
    scriptUrl: '/samples/kickoff.txt',
    seconds: 106,
    refs: refsFor(kickoff.id, Object.keys(kickoff.speakers)),
  },
];
