import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  requestId: string;
  helperId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { requestId, helperId } = await req.json() as NotificationPayload;

    console.log('Processing helper request notification:', { requestId, helperId });

    // Fetch request details
    const { data: request, error: requestError } = await supabase
      .from('helper_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError) {
      console.error('Error fetching request:', requestError);
      throw requestError;
    }

    // Fetch alert details
    const { data: alert, error: alertError } = await supabase
      .from('sos_alerts')
      .select('*')
      .eq('id', request.alert_id)
      .single();

    if (alertError) {
      console.error('Error fetching alert:', alertError);
      throw alertError;
    }

    // Fetch requester profile
    const { data: requesterProfile, error: profileError } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', request.requester_id)
      .single();

    if (profileError) {
      console.error('Error fetching requester profile:', profileError);
    }

    // Fetch helper's FCM token
    const { data: helperProfile, error: helperError } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('id', helperId)
      .single();

    if (helperError) {
      console.error('Error fetching helper profile:', helperError);
    }

    const requesterName = requesterProfile?.name || 'Someone';

    // Create in-app notification
    const { error: notifError } = await supabase
      .from('push_notifications')
      .insert({
        user_id: helperId,
        notification_type: 'helper_request',
        title: '🚨 Help Request!',
        body: `${requesterName} needs your help with a ${alert.urgency} ${alert.sos_type} emergency`,
        data: {
          request_id: requestId,
          alert_id: alert.id,
          urgency: alert.urgency,
          type: alert.sos_type,
          location_lat: alert.location_lat,
          location_lng: alert.location_lng,
        },
      });

    if (notifError) {
      console.error('Error creating in-app notification:', notifError);
    }

    // Send push notification if FCM token exists
    if (helperProfile?.fcm_token) {
      try {
        const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
          body: {
            token: helperProfile.fcm_token,
            title: '🚨 Help Request!',
            body: `${requesterName} needs your help urgently`,
            data: {
              request_id: requestId,
              alert_id: alert.id,
              type: 'helper_request',
              urgency: alert.urgency,
            },
          },
        });

        if (pushError) {
          console.error('Error sending push notification:', pushError);
        }
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    }

    console.log('Helper request notification sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notification sent successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in notify-helper-request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
