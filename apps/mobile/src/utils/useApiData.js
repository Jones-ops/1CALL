import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api, errorMessage } from '../api/client';

/** Loads `path` whenever the screen gains focus; supports pull-to-refresh. */
export function useApiData(path, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled || !path) return;
      if (isRefresh) setRefreshing(true);
      try {
        const d = await api(path);
        if (alive.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive.current) setError(errorMessage(e));
      } finally {
        if (alive.current) setRefreshing(false);
      }
    },
    [path, enabled],
  );

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  return { data, error, refreshing, reload: load, refresh: () => load(true), setData };
}
