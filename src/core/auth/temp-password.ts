import { randomInt } from 'crypto';

const ADJECTIVES = ['brisk', 'calm', 'clear', 'brave', 'swift', 'bright', 'steady', 'quiet'];
const NOUNS = ['falcon', 'cedar', 'harbor', 'meadow', 'lantern', 'compass', 'river', 'summit'];

/** Readable over the counter and still hard to guess: two words + 3 digits. */
export function temporaryPassword(): string {
  const a = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const n = NOUNS[randomInt(NOUNS.length)];
  return `${a}-${n}-${randomInt(100, 1000)}`;
}
