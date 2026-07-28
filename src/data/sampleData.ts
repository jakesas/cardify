import { Deck, Card, ReviewHistory } from '../types';
import { getLocalDateString } from '../utils/sm2';

const today = getLocalDateString();
const yesterday = getLocalDateString(-1);
const twoDaysAgo = getLocalDateString(-2);
const tomorrow = getLocalDateString(1);
const nextWeek = getLocalDateString(7);

export const INITIAL_DECKS: Deck[] = [
  {
    id: 'deck-sample-1',
    name: 'Getting Started',
    description: 'Learn how to use this flashcard app effectively with these introductory cards.',
    createdAt: '2026-07-10T10:00:00Z',
  },
  {
    id: 'deck-sample-2',
    name: 'SRS Fundamentals',
    description: 'Key concepts about spaced repetition and how the SM-2 algorithm works.',
    createdAt: '2026-07-11T12:00:00Z',
  },
  {
    id: 'deck-sample-3',
    name: 'Study Tips',
    description: 'Practical tips and techniques to get the most out of your study sessions.',
    createdAt: '2026-07-12T14:00:00Z',
  },
  {
    id: 'deck-empty',
    name: 'Custom Deck',
    description: 'An empty deck for your own custom cards. Add your own study material here.',
    createdAt: '2026-07-15T09:00:00Z',
  }
];

export const INITIAL_CARDS: Card[] = [
  // Deck 1: Getting Started
  {
    id: 'card-101',
    deckId: 'deck-sample-1',
    cardType: 'basic',
    front: 'How do I create a new card?',
    back: 'Go to the **Editor** tab, select a deck, then fill in the front and back fields and click **Add Card**. You can also use the AI Generator to create cards automatically.',
    tag: 'Basics',
    reps: 2,
    interval: 4,
    easeFactor: 2.6,
    dueDate: today,
    lastReviewedAt: yesterday,
  },
  {
    id: 'card-102',
    deckId: 'deck-sample-1',
    cardType: 'basic',
    front: 'What is the difference between "Basic" and "Cloze" card types?',
    back: '**Basic** cards have a front (question) and back (answer).\n\n**Cloze** cards hide a portion of text inside the front — you must recall the missing part. Use `{...}` to mark the hidden text (e.g. "The capital of France is {Paris}").',
    tag: 'Card Types',
    reps: 0,
    interval: 1,
    easeFactor: 2.3,
    dueDate: today,
  },
  {
    id: 'card-103',
    deckId: 'deck-sample-1',
    cardType: 'basic',
    front: 'How does the review workflow work?',
    back: 'The workflow is:\n\n1. **Study** — Read through the material in a deck\n2. **Review** — Quiz yourself on due cards\n3. **Rate your recall** — After answering, rate how well you remembered (Again/Hard/Good/Easy)\n4. **Repeat daily** — The SRS algorithm schedules the next review based on your rating',
    tag: 'Workflow',
    reps: 4,
    interval: 9,
    easeFactor: 2.5,
    dueDate: tomorrow,
    lastReviewedAt: yesterday,
  },
  {
    id: 'card-104',
    deckId: 'deck-sample-1',
    cardType: 'basic',
    front: 'What do the four review ratings mean?',
    back: '- **Again** — Completely forgot. Card resets to square one.\n- **Hard** — Recalled with difficulty. Interval increases slightly.\n- **Good** — Recalled correctly with some effort. Normal interval increase.\n- **Easy** — Instant recall. Interval jumps ahead significantly.',
    tag: 'Review',
    reps: 3,
    interval: 6,
    easeFactor: 2.55,
    dueDate: today,
    lastReviewedAt: twoDaysAgo,
  },

  // Deck 2: SRS Fundamentals
  {
    id: 'card-201',
    deckId: 'deck-sample-2',
    cardType: 'basic',
    front: 'What is Spaced Repetition?',
    back: '**Spaced Repetition** is a learning technique that schedules review sessions at increasing intervals over time. Instead of cramming, you review material just before you\'re about to forget it — reinforcing long-term memory with minimal effort.',
    tag: 'Core Concepts',
    reps: 1,
    interval: 2,
    easeFactor: 2.4,
    dueDate: today,
    lastReviewedAt: yesterday,
  },
  {
    id: 'card-202',
    deckId: 'deck-sample-2',
    cardType: 'basic',
    front: 'What is the Forgetting Curve?',
    back: 'The **Forgetting Curve**, discovered by Hermann Ebbinghaus, shows that we forget information exponentially over time if we don\'t review it.\n\nWithin **24 hours**, we forget about **50-80%** of what we learned. Spaced repetition combats this by scheduling reviews at optimal moments before the information is forgotten.',
    tag: 'Core Concepts',
    reps: 5,
    interval: 14,
    easeFactor: 2.7,
    dueDate: nextWeek,
    lastReviewedAt: yesterday,
  },
  {
    id: 'card-203',
    deckId: 'deck-sample-2',
    cardType: 'basic',
    front: 'How does the SM-2 algorithm calculate the next review date?',
    back: 'The SM-2 algorithm calculates the next interval based on your rating:\n\n- **Each card has**: an interval (days until next review) and an ease factor (starting at 2.5)\n- **Good/Easy** → interval × ease factor (grows exponentially)\n- **Hard** → interval × 1.2 (small bump)\n- **Again** → interval resets to 1 day, ease factor decreases\n- **Ease factor** adjusts up/down based on performance over time',
    tag: 'SM-2 Algorithm',
    reps: 0,
    interval: 1,
    easeFactor: 2.5,
    dueDate: today,
  },

  // Deck 3: Study Tips
  {
    id: 'card-301',
    deckId: 'deck-sample-3',
    cardType: 'basic',
    front: 'What is the best way to use this app daily?',
    back: '1. **Review due cards first** — Check the "Due Today" count and clear it\n2. **Study new material** — Browse decks and learn new content\n3. **Create custom cards** — Add your own notes and questions\n4. **Track your stats** — Check retention rate and streak in the Stats tab\n5. **Stay consistent** — Even 10 minutes daily beats 2 hours once a week',
    tag: 'Study Habits',
    reps: 3,
    interval: 7,
    easeFactor: 2.6,
    dueDate: today,
    lastReviewedAt: yesterday,
  },
  {
    id: 'card-302',
    deckId: 'deck-sample-3',
    cardType: 'basic',
    front: 'What makes a good flashcard?',
    back: '**Good flashcards are:**\n- **Atomic** — One concept per card\n- **Specific** — Clear, unambiguous question on the front\n- **Concise** — Short answer on the back (not a textbook page)\n- **Active recall** — Makes you think, not just recognize\n\n**Avoid:**\n- Walls of text\n- Lists with more than 5-7 items (split them)\n- Vague questions like "Tell me about X"',
    tag: 'Card Creation',
    reps: 2,
    interval: 5,
    easeFactor: 2.5,
    dueDate: today,
    lastReviewedAt: yesterday,
  }
];

export const INITIAL_HISTORY: ReviewHistory[] = [
  {
    id: 'hist-1',
    cardId: 'card-101',
    rating: 3,
    timestamp: '2026-07-17T14:30:00Z',
    previousInterval: 1,
    nextInterval: 4,
    previousEaseFactor: 2.5,
    nextEaseFactor: 2.6,
  },
  {
    id: 'hist-2',
    cardId: 'card-201',
    rating: 3,
    timestamp: '2026-07-17T14:35:00Z',
    previousInterval: 1,
    nextInterval: 2,
    previousEaseFactor: 2.5,
    nextEaseFactor: 2.4,
  },
  {
    id: 'hist-3',
    cardId: 'card-301',
    rating: 4,
    timestamp: '2026-07-17T14:40:00Z',
    previousInterval: 3,
    nextInterval: 7,
    previousEaseFactor: 2.45,
    nextEaseFactor: 2.6,
  }
];
