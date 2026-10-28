import { lowRestingFitText } from '@/domain/restingFitness';
import { T } from '@/ui/ui';

/** One place for the approved low-resting lines. Hidden at 60 bpm and above. */
export function LowRestingFitNote({
  reading,
  detail = false,
}: {
  reading: string | null | undefined;
  /** Longer line, used behind More info. */
  detail?: boolean;
}) {
  const text = lowRestingFitText(reading, detail);
  if (!text) return null;
  return <T>{text}</T>;
}
