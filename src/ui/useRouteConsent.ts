import { useEffect, useState } from 'react';

import { readRouteConsent, subscribeRouteConsent } from '@/data/routeConsentStore';
import { routeFindingAllowed, type RouteConsentRecord } from '@/domain/routeConsent';

/** Undefined until the phone has been read. Null means the choice was never stored. */
export function useRouteConsent(): {
  ready: boolean;
  record: RouteConsentRecord | null;
  allowed: boolean;
} {
  const [record, setRecord] = useState<RouteConsentRecord | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const stop = subscribeRouteConsent((value) => {
      if (live) setRecord(value);
    });
    void readRouteConsent().then((value) => {
      if (!live) return;
      setRecord((current) => (current === undefined ? value : current));
    });
    return () => {
      live = false;
      stop();
    };
  }, []);

  const stored = record ?? null;
  return {
    ready: record !== undefined,
    record: stored,
    allowed: routeFindingAllowed(stored),
  };
}
