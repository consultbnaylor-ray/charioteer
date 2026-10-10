const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** Town or area only. Reject postcodes and street numbers. */
export function validateTown(value: string): string | null {
  const town = value.trim();
  if (!town) return null;
  if (town.length > 80) return 'Keep it to a short town or area.';
  if (UK_POSTCODE.test(town)) return 'Use a town or area, not a postcode.';
  if (/\d/.test(town)) return 'Leave out street numbers.';
  return null;
}

export function slugifyInterest(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
