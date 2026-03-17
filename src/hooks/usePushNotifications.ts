import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// This must match the VAPID_PUBLIC_KEY secret stored in the backend. 
// Ideally provided via .env as VITE_VAPID_PUBLIC_KEY
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BECK7w0rW4BHnDYU_30w4pB1KUajgkHkp3RW7zvCDEnWYEv2IUhePBPva-wbzQBnn-VaqXiapfpFyJadnTZPg_Y';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    // Check if browser supports notifications
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if (supported) {
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  };

  const unregisterServiceWorker = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      setSubscription(null);
      toast.success('Service worker unregistered. Please reload.');
    } catch (error) {
      console.error('Error unregistering service worker:', error);
      toast.error('Failed to unregister service worker');
    }
  };

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('Push notifications not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        const subscribed = await subscribeToPush();
        if (subscribed) {
          toast.success('Notifications enabled!');
          return true;
        } else {
          toast.error('Failed to subscribe to push notifications');
          return false;
        }
      } else {
        toast.error('Notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast.error('Error enabling notifications');
      return false;
    }
  };

  const subscribeToPush = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const registration = await navigator.serviceWorker.ready;
      console.log('Service worker ready for push subscription');

      // Uniquely solving AbortError by ensuring active state and adding a tiny initialization delay
      if (!registration.active) {
        console.log('Service worker is not active yet. Waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // Even if active, Chromium push service sometimes races. 500ms delay helps immensely.
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Check existing subscription
      let sub = await registration.pushManager.getSubscription();

      if (sub) {
        console.log('Existing push subscription found, reusing it');
      } else {
        console.log('Creating new push subscription with VAPID key');
        let applicationServerKey;
        try {
          applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        } catch (e) {
          console.error('Failed to parse VAPID key:', e);
          toast.error('Push configuration error (VAPID key invalid).');
          return false;
        }

        console.log('VAPID key byte length:', applicationServerKey.length);
        try {
          sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey,
          });
          console.log('Push subscription created successfully');
        } catch (subErr: any) {
          console.error('Push Service Subscription Failed:', subErr.name, subErr.message, subErr);
          if (subErr.name === 'NotAllowedError') {
             toast.error('Notifications blocked by browser settings.');
          } else if (subErr.name === 'AbortError') {
             toast.error('Push service error. Check browser (Brave?), adblockers, or GCM ID.');
          } else {
             toast.error(`Subscription failed: ${subErr.message}`);
          }
          return false;
        }
      }

      setSubscription(sub);
      // Save to backend
      await saveSubscription(sub);
      return true;
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      return false;
    }
  };

  const saveSubscription = async (sub: PushSubscription) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found, cannot save push subscription');
        return;
      }

      const subJson = sub.toJSON();
      
      // Get project ID from standard Supabase URL if not in env
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const projectId = supabaseUrl.split('.')[0].split('//')[1] || import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/save-push-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys?.p256dh,
                auth: subJson.keys?.auth,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error('Failed to save push subscription:', err);
      } else {
        console.log('Push subscription saved to backend');
      }
    } catch (error) {
      console.error('Error saving push subscription:', error);
    }
  };

  return {
    permission,
    isSupported,
    subscription,
    requestPermission,
    unregisterServiceWorker,
  };
};
