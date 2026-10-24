import { useEffect, useRef, useState } from 'react';

import { useRepository } from '@/data';
import { ownerPhotoErrorDelay, ownerPhotoIdentity, shouldRefreshSignedUrl } from '@/domain/ownerPhotos';

/**
 * A failed picture retries on its own. The first failure asks for a new link
 * for that picture only. Later tries reuse it. A loaded picture is not remounted.
 */
export function useSignedPhotoRetry(
  uri: string | null | undefined,
  options?: { signWhenMissing?: boolean },
) {
  const repo = useRepository();
  const attempt = useRef(0);
  const waiting = useRef(false);
  const live = useRef(true);
  const generation = useRef(0);
  const loaded = useRef(false);
  const identity = useRef(ownerPhotoIdentity(uri));
  const uriRef = useRef(uri);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [seen, setSeen] = useState(false);
  const [reload, setReload] = useState(0);
  const [displayUri, setDisplayUri] = useState<string | null>(uri ?? null);
  uriRef.current = uri;

  useEffect(() => {
    const next = ownerPhotoIdentity(uri);
    if (next !== identity.current) {
      identity.current = next;
      generation.current += 1;
      attempt.current = 0;
      waiting.current = false;
      loaded.current = false;
      setSeen(false);
      setDisplayUri(uri ?? null);
      setReload(0);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    } else if (uri) {
      setDisplayUri(uri);
    }
    setGaveUp(false);
  }, [uri]);

  useEffect(() => () => {
    live.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (uri || !options?.signWhenMissing) return;
    const gen = generation.current;
    let current = true;
    void repo.resignOwnerPhotos({ force: true }).finally(() => {
      if (!current || generation.current !== gen || uriRef.current) return;
    });
    const first = ownerPhotoErrorDelay(0) ?? 0;
    const second = ownerPhotoErrorDelay(1) ?? 0;
    const giveUp = setTimeout(() => {
      if (current && generation.current === gen && !uriRef.current) setGaveUp(true);
    }, first + second);
    return () => {
      current = false;
      clearTimeout(giveUp);
    };
  }, [uri, options?.signWhenMissing, repo]);

  function onLoad() {
    loaded.current = true;
    setSeen(true);
    setGaveUp(false);
  }

  function onError() {
    if (loaded.current || waiting.current) return;
    const current = uriRef.current ?? displayUri;
    const gen = generation.current;
    if (current && shouldRefreshSignedUrl(attempt.current)) {
      void repo.refreshSignedPhoto(current).then((next) => {
        if (!live.current || generation.current !== gen || !next) return;
        setDisplayUri(next);
      });
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
      if (!live.current || generation.current !== gen) return;
      waiting.current = false;
      setReload((value) => value + 1);
    }, delay);
  }

  function retry() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    attempt.current = 0;
    waiting.current = false;
    loaded.current = false;
    setSeen(false);
    setGaveUp(false);
    setReload((value) => value + 1);
    void repo.resignOwnerPhotos({ force: true });
    const current = uriRef.current;
    if (current) {
      void repo.refreshSignedPhoto(current).then((next) => {
        if (next) setDisplayUri(next);
      });
    }
  }

  return { gaveUp, loaded: seen, reload, displayUri, onError, onLoad, retry };
}
