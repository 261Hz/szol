// concepts.js — curated concept lists for the daily cross-language learning feature.
// 7 categories rotate by day of week; each category has ~15 concepts that cycle weekly.
//
// getConceptOfDay() returns { concept, category, categoryIndex } for today.

export const CATEGORY_NAMES = [
  'High-frequency verb',
  'Everyday phrase',
  'Grammar connector',
  'Idiom',
  'Emotion & feeling',
  'Easily confused words',
  'Cultural expression',
]

export const CATEGORY_EMOJI = ['🔤', '💬', '🔗', '🎭', '💭', '⚡', '🌍']

const CONCEPTS = [
  // 0 — High-frequency verbs
  [
    'to want something',
    'to think about something',
    'to miss someone',
    'to need something',
    'to try to do something',
    'to forget something',
    'to remember something',
    'to feel something',
    'to ask for something',
    'to explain something',
    'to decide something',
    'to happen',
    'to change',
    'to seem / to appear',
    'to let someone do something',
    'to help someone',
    'to learn something',
  ],

  // 1 — Everyday phrases
  [
    "excuse me, sorry to bother you",
    "could you say that again, please?",
    "I don't understand",
    "what does this word mean?",
    "how long does it take?",
    "it doesn't matter",
    "as soon as possible",
    "never mind",
    "that's a good idea",
    "I agree / I disagree",
    "congratulations",
    "good luck",
    "take care",
    "how are you really doing?",
    "just in case",
    "on the other hand",
  ],

  // 2 — Grammar connectors
  [
    'although / even though',
    'however / on the other hand',
    'therefore / as a result',
    'in order to do something',
    'as long as',
    'unless',
    'neither … nor …',
    'both … and …',
    'the more … the more …',
    'not only … but also …',
    'provided that',
    'instead of doing something',
    'by the time',
    'as soon as',
    'in spite of',
  ],

  // 3 — Idioms
  [
    'to bite off more than you can chew',
    'to beat around the bush',
    'to hit the nail on the head',
    'time flies',
    'once in a blue moon',
    'to spill the beans',
    'to cost an arm and a leg',
    'to be on the fence about something',
    'to sleep on a decision',
    'to pull someone\'s leg',
    'to be in hot water',
    'to bite the bullet',
    'the ball is in your court',
    'to add fuel to the fire',
    'every cloud has a silver lining',
  ],

  // 4 — Emotions & feelings
  [
    'to feel overwhelmed',
    'to be nervous about something',
    'to feel proud of yourself',
    'to be disappointed',
    'to feel nostalgic',
    'to be jealous',
    'to feel relieved',
    'to be frustrated',
    'to feel grateful',
    'to be embarrassed',
    'to feel lonely',
    'to be excited about something',
    'to feel anxious',
    'to be homesick',
    'to feel content',
  ],

  // 5 — Easily confused words / false friends
  [
    'to make vs. to do',
    'to know a person vs. to know a fact',
    'to see vs. to look at vs. to watch',
    'to say vs. to tell',
    'to borrow vs. to lend',
    'to bring vs. to take',
    'to hear vs. to listen',
    'to come vs. to go',
    'to think vs. to believe',
    'to hope vs. to expect',
    'to win vs. to beat someone',
    'to wish vs. to want',
    'to spend time vs. to spend money',
    'fast vs. quick vs. soon',
    'big vs. large vs. great',
  ],

  // 6 — Cultural expressions
  [
    'inshallah — God willing, whatever happens',
    'bon appétit — wishing someone a good meal',
    'schadenfreude — pleasure from others\' misfortune',
    'carpe diem — seize the day, live in the moment',
    'the evil eye — belief that envy causes bad luck',
    'raising a toast — honoring someone with a drink',
    'hygge — cosy, contented togetherness (Danish)',
    'saudade — deep longing for something absent (Portuguese)',
    'sisu — inner strength, resilience (Finnish)',
    'ubuntu — I am because we are (African philosophy)',
    'lagom — not too much, not too little (Swedish)',
    'wabi-sabi — finding beauty in imperfection (Japanese)',
    'ikigai — reason for being, life purpose (Japanese)',
    'meraki — putting your soul into what you do (Greek)',
    'gemütlichkeit — warm, comfortable sociability (German)',
  ],
]

function dayOfYear() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now - start) / 86_400_000)
}

export function getConceptOfDay() {
  const day           = dayOfYear()
  const categoryIndex = day % 7
  const list          = CONCEPTS[categoryIndex]
  const concept       = list[Math.floor(day / 7) % list.length]
  return {
    concept,
    category:      CATEGORY_NAMES[categoryIndex],
    categoryEmoji: CATEGORY_EMOJI[categoryIndex],
    categoryIndex,
  }
}
