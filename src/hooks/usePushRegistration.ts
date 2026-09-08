import { useCallback, useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentOrg } from './useCurrentOrg';

export type PushStatus =
  | 'idle'
  | 'registered'
  | 'not-configured'
  | 'unsupported'
  | 'open-in-new-tab'
  | 'denied'
  | 'error';

const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined;
const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY as string | undefined;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY as string | undefined,
  projectId: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID as string | undefined,
  appId,
  messagingSenderId: appId?.split(':')[1] ?? '',
};

export function isPushConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      appId &&
      vapidKey &&
      firebaseConfig.messagingSenderId,
  );
}

export function usePushRegistration() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const [status, setStatus] = useState<PushStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [hasDevice, setHasDevice] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setHasDevice(false);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from('push_devices')
        .select('id')
        .is('revoked_at', null)
        .limit(1);
      if (active) setHasDevice(Boolean(data?.length));
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const enable = useCallback(async (): Promise<PushStatus> => {
    if (!user?.id || !orgId) return 'error';
    if (!isPushConfigured()) {
      setStatus('not-configured');
      return 'not-configured';
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported())) {
      setStatus('unsupported');
      return 'unsupported';
    }
    if (window.top !== window.self) {
      setStatus('open-in-new-tab');
      return 'open-in-new-tab';
    }

    setBusy(true);
    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return 'denied';
      }

      const query = new URLSearchParams(
        firebaseConfig as unknown as Record<string, string>,
      ).toString();
      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${query}`,
      );
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig as any);
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        setStatus('denied');
        return 'denied';
      }

      const { error } = await (supabase as any).from('push_devices').upsert(
        {
          user_id: user.id,
          org_id: orgId,
          fcm_token: token,
          platform: 'web',
          user_agent: navigator.userAgent.slice(0, 300),
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: 'fcm_token' },
      );
      if (error) throw error;

      setHasDevice(true);
      setStatus('registered');
      return 'registered';
    } catch (err) {
      console.error('push_registration_failed', err);
      setStatus('error');
      return 'error';
    } finally {
      setBusy(false);
    }
  }, [orgId, user?.id]);

  const disable = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await (supabase as any)
        .from('push_devices')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('revoked_at', null);
      setHasDevice(false);
      setStatus('idle');
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  return { status, busy, hasDevice, enable, disable, configured: isPushConfigured() };
}
