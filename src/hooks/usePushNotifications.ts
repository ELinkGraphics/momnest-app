import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = 'BFqWP-OcHrvUNbvh86neKJkpCW9VdJyGrtsQqfyvThN8NuQfLlSO32p2uWvxRkMoW0LOe9xag_qMek_vv5jC0kU';

function urlBase64ToUint8Array(base64String: string) {
  try {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    console.log('VAPID key byte length:', outputArray.length);
    if (outputArray.length !== 65) {
      console.warn('VAPID public key should be exactly 65 bytes long. Current length:', outputArray.length);
    }
    return outputArray;
  } catch (error) {
    console.error('Error converting VAPID key:', error);
    throw error;
  }
}

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
        
        // Check for existing subscription
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);
      }
    };

    checkSupport();
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('Notifications not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        const sub = await subscribeUser();
        if (sub) {
          toast.success('Notifications enabled!');
          return true;
        }
      } else {
        toast.error('Notification permission denied');
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to request notification permission');
      return false;
    }
  };

  const subscribeUser = async () => {
    try {
      console.log('Checking service worker readiness...');
      const registration = await navigator.serviceWorker.ready;
      console.log('Service worker ready. Current registration scope:', registration.scope);
      
      // Subscribe with VAPID
      console.log('Attempting push subscription with key:', VAPID_PUBLIC_KEY);
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      
      console.log('Push subscription successful:', sub);
      setSubscription(sub);
      
      // Send to backend
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log('Sending subscription to backend for user:', user.id);
        const { error } = await supabase.functions.invoke('save-push-subscription', {
          body: {
            subscription: sub,
            userId: user.id
          }
        });
        
        if (error) {
          console.error('Error saving subscription to backend:', error);
          throw error;
        }
        console.log('Subscription saved to backend successfully');
      }
      
      return sub;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error name:', error.name);
        
        if (error.name === 'AbortError') {
          console.error('AbortError usually means the push service is unreachable or the VAPID key is invalid.');
        } else if (error.name === 'NotAllowedError') {
          console.error('NotAllowedError means the user denied the notification permission.');
        }
      }
      throw error;
    }
  };

  const unregisterServiceWorker = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('Service worker unregistered:', registration.scope);
      }
      toast.success('Service workers unregistered. Please reload the page.');
    } catch (error) {
      console.error('Error unregistering service workers:', error);
      toast.error('Failed to unregister service workers');
    }
  };

  const showNotification = (title: string, options?: NotificationOptions) => {
    if (permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, {
            ...options,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
          });
        });
      } else {
        new Notification(title, {
          ...options,
          icon: '/icon-192.png',
        });
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  return {
    isSupported,
    permission,
    subscription,
    requestPermission,
    subscribeUser,
    showNotification,
    unregisterServiceWorker,
  };
};
