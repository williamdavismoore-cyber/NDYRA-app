const SIGNALS = {
  title: 'Signals',
  subtitle: 'Alerts and real-time prompts',
  description: 'Signals are the awareness layer for things that need your attention or quick action.',
  examples: [
    'Friend finished a workout',
    'New gym class published',
    'Challenge starting soon',
    'Milestone reached',
    'Workout liked or commented',
  ],
};

const STORIES = {
  title: 'Stories',
  subtitle: 'Social content',
  description: 'Stories are shareable content cards, photos, videos, and aftermath summaries designed for quick browsing.',
  examples: [
    'Workout story after a session',
    'Gym story',
    'Challenge milestone story',
    'Biometric highlight story when the member explicitly shares it',
  ],
};

export function getSignalsStoriesPolicy(){
  return {
    signals: { ...SIGNALS, examples:[...SIGNALS.examples] },
    stories: { ...STORIES, examples:[...STORIES.examples] },
    rule: 'Signals are alerts. Stories are content.',
    ux_note: 'Use plain language. In some shells, Alerts may be clearer than Signals.',
  };
}

export function getSignalsDefinition(){
  return getSignalsStoriesPolicy().signals;
}

export function getStoriesDefinition(){
  return getSignalsStoriesPolicy().stories;
}

export function getSignalsStoriesRule(){
  return getSignalsStoriesPolicy().rule;
}
