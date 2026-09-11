/** Age in the unit a lab prints: days under a month, months under two years, then years. */
export function ageFromDob(dob: Date, now = new Date()): { age: number; unit: 'YEARS' | 'MONTHS' | 'DAYS' } {
  const days = Math.max(0, Math.floor((now.getTime() - dob.getTime()) / 86_400_000));
  if (days < 31) return { age: days, unit: 'DAYS' };
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 24) return { age: Math.max(1, months), unit: 'MONTHS' };
  return { age: Math.floor(months / 12), unit: 'YEARS' };
}
