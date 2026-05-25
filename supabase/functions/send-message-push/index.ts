import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
    
    // Create Supabase client with admin privileges
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the payload (Triggered by Database Webhook on `messages` insert)
    const payload = await req.json();
    const message = payload.record; // The newly inserted message
    
    if (!message || !message.receiver_id) {
      return new Response(
        JSON.stringify({ error: 'Missing receiver_id in message payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1. Get the receiver's profile to find their FCM token
    const { data: receiverProfile, error: profileError } = await supabase
      .from('profiles')
      .select('fcm_token, id')
      .eq('id', message.receiver_id)
      .single();

    if (profileError || !receiverProfile?.fcm_token) {
      console.log(`No FCM token found for user ${message.receiver_id}`);
      return new Response(
        JSON.stringify({ message: 'Receiver has no FCM token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Get the sender's profile for the notification title
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', message.sender_id)
      .single();
      
    const senderName = senderProfile?.display_name || senderProfile?.username || 'Someone';

    // 3. Send the push notification via Firebase Cloud Messaging HTTP v1 API
    // Note: You must configure FIREBASE_SERVER_KEY in your Supabase project secrets
    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    
    if (!firebaseServerKey) {
      console.error('FIREBASE_SERVER_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'FCM not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const fcmPayload = {
      message: {
        token: receiverProfile.fcm_token,
        notification: {
          title: `New message from ${senderName}`,
          body: message.content_type === 'text' ? message.content : `Sent you a ${message.content_type}`,
        },
        data: {
          conversationId: message.conversation_id,
          messageId: message.id,
          type: 'chat_message'
        }
      }
    };

    const response = await fetch('https://fcm.googleapis.com/v1/projects/YOUR_PROJECT_ID/messages:send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In a real production environment, you should use OAuth2 tokens instead of legacy server keys or hardcoded values
        'Authorization': `Bearer ${firebaseServerKey}`,
      },
      body: JSON.stringify(fcmPayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('FCM Error:', responseData);
      throw new Error(`FCM request failed: ${JSON.stringify(responseData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: responseData.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
    
  } catch (error: any) {
    console.error('Error in send-message-push function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
