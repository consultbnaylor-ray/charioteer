import { useEffect, useRef, useState } from 'react';

import { useRepository } from '@/data';
import { ownerPhotoErrorDelay, ownerPhotoIdentity } from '@/domain/ownerPhotos';

/**
 * After an image error, ask for a fresh signed URL. The 15s gap does not apply.
 * The waits are 1s, then 3s, then 8s. A later error stops and can be started again.
 */
export function useSignedPhotoRetry(uri: string | null | undefined) {
  const repo = useRepository();
  const attempt = useRef(0);
  const waiting = useRef(false);
  const live = useRef(true);
  const generation = useRef(0);
  const identity = useRef(ownerPhotoIdentity(uri));
  const uriRef = useRef(uri);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [mount, setMount] = useState(0);
  uriRef.current = uri;

  useEffect(() => {
    const next = ownerPhotoIdentity(uri);
    if (next !== identity.current) {
      identity.current = next;
      generation.current += 1;
      attempt.current = 0;
      waiting.current = false;
      setMount(0);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
    setGaveUp(false);
  }, [uri]);

  useEffect(() => () => {
    live.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function requestFresh(immediate: boolean) {
    const run = () => {
      const seen = uriRef.current;
      const gen = generation.current;
      void repo.resignOwnerPhotos({ force: true }).finally(() => {
        if (!live.current || generation.current !== gen) return;
        waiting.current = false;
        if (uriRef.current === seen) setMount((value) => value + 1);
      });
    };
    if (immediate) {
      waiting.current = true;
      run();
      return;
    }
    const delay = ownerPhotoErrorDelay(attempt.current);
    if (delay == null) {
      waiting.current = false;
      setGaveUp(true);
      return;
    }
    waiting.current = true;
    attempt.current += 1;
    timer.current = setTimeout(() => {
      timer.current = null;
      run();
    }, delay);
  }

  function onError() {
    if (waiting.current) return;
    requestFresh(false);
  }

  function retry() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    attempt.current = 0;
    waiting.current = false;
    setGaveUp(false);
    setMount((value) => value + 1);
    requestFresh(true);
  }

  return { gaveUp, mount, onError, retry };
}
