import { useEffect, useState } from 'react';
import { messaging, getToken, onMessage } from '@/lib/firebase';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useFirebaseMessaging = (userId: string | undefined) => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    if (!userId || !messaging) {
      setIsSupported(false);
      return;
    }

    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // IMPORTANT: Replace with your actual VAPID key from Firebase Console -> Project Settings -> Cloud Messaging
          const currentToken = await getToken(messaging, { 
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || 'YOUR_VAPID_KEY_HERE' 
          });

          if (currentToken) {
            setFcmToken(currentToken);
            // Save the token to Supabase profiles table
            const { error } = await supabase
              .from('profiles')
              .update({ fcm_token: currentToken })
              .eq('id', userId);

            if (error) {
              console.error('Error saving FCM token to profile:', error);
            }
          } else {
            console.log('No registration token available. Request permission to generate one.');
          }
        } else {
          console.log('Unable to get permission to notify.');
        }
      } catch (error) {
        console.error('An error occurred while retrieving token. ', error);
        // Note: this may fail if not served over HTTPS or localhost, or if browser doesn't support FCM
        setIsSupported(false);
      }
    };

    requestPermission();

    // Listen for foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received in foreground: ', payload);
      const title = payload.notification?.title || 'New Message';
      const body = payload.notification?.body;
      
      // We only show a toast if we are NOT currently in the conversation that received the message
      // (This logic would be handled by the component listening to this hook, but here is a simple global toast)
      toast(title, {
        description: body,
      });
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  return { fcmToken, isSupported };
};
