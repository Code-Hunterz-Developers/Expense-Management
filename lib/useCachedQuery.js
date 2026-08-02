'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';

const cache = new Map();
const STORAGE_PREFIX = 'em-cache:';

function readStored(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(key, entry) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache write failed', e);
  }
}

function removeStored(key) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_PREFIX + key);
}

function getCached(key) {
  if (cache.has(key)) return cache.get(key);
  const stored = readStored(key);
  if (stored) {
    cache.set(key, stored);
    return stored;
  }
  return undefined;
}

function setCached(key, entry) {
  cache.set(key, entry);
  writeStored(key, entry);
}

function clearStoredByPrefix(prefix = '') {
  if (typeof window === 'undefined') return;
  const match = prefix ? STORAGE_PREFIX + prefix : STORAGE_PREFIX;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(match)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

/** Clear cached queries. Pass prefix like "dashboard" or leave empty to clear all. */
export function invalidateCache(prefix = '') {
  if (!prefix) {
    cache.clear();
    clearStoredByPrefix();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removeStored(key);
    }
  }
  clearStoredByPrefix(prefix);
}

/**
 * Stale-while-revalidate: first visit shows loader, return visits (and reloads) show cache instantly
 * and refresh in background without loader.
 */
export function useCachedQuery(key, fetcher) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const hit = getCached(key);
    if (hit) {
      setData(hit.data);
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    const hit = getCached(key);

    if (!hit) {
      setLoading(true);
    }

    (async () => {
      try {
        const result = await fetcherRef.current();
        if (cancelled) return;
        setCached(key, { data: result, fetchedAt: Date.now() });
        setData(result);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refresh = useCallback(async () => {
    const result = await fetcherRef.current();
    setCached(key, { data: result, fetchedAt: Date.now() });
    setData(result);
    return result;
  }, [key]);

  return { data, loading, refresh };
}
