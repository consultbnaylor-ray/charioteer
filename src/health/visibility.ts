import type { HealthVisibilityReport } from '@/domain/healthVisibility';

/** Web and Android cannot see HealthKit. The iPhone build uses visibility.ios.ts. */
export async function readHealthVisibility(): Promise<HealthVisibilityReport> {
  return { kind: 'web' };
}
