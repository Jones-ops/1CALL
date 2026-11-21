// Live campaign updates over Socket.IO, falling back to polling every 3 s
// whenever the socket is not connected.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import { api, errorMessage, getAccessToken } from '../api/client';

const FINAL = ['completed', 'cancelled', 'rejected'];

export function useLiveCampaign(id) {
  const [campaign, setCampaign] = useState(null);
  const [retry, setRetry] = useState(null); // { waiting, nextAt }
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const socketRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await api(`/campaigns/${id}`);
      setCampaign(r.campaign);
      setRetry(r.retry ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    fetchOnce();
    const s = io(API_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = s;
    s.on('connect', () => {
      setLive(true);
      fetchOnce();
    });
    s.on('disconnect', () => setLive(false));
    s.on('connect_error', () => setLive(false));
    s.on('campaign:update', (c) => {
      if (c?.id === id) setCampaign((prev) => ({ ...prev, ...c }));
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [id, fetchOnce]);

  const finished = campaign && FINAL.includes(campaign.status);
  useEffect(() => {
    if (live || finished) return undefined;
    const t = setInterval(fetchOnce, 3000);
    return () => clearInterval(t);
  }, [live, finished, fetchOnce]);

  return { campaign, setCampaign, retry, error, live, reload: fetchOnce };
}
