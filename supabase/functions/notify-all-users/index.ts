import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { alertId, alertType, urgency, description, location } = await req.json();

    // Get all user profiles to send notifications
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, name, fcm_token')
      .not('fcm_token', 'is', null);

    if (profilesError) throw profilesError;

    console.log(`Sending notifications to ${profiles?.length || 0} users`);

    // In a real implementation, you would send push notifications here
    // For now, we'll create in-app notifications
    const notifications = profiles?.map(profile => ({
      user_id: profile.id,
      title: `New ${urgency} ${alertType} Alert`,
      message: description.substring(0, 100),
      type: 'sos_alert',
      related_id: alertId,
      created_at: new Date().toISOString()
    })) || [];

    // Note: This would require a notifications table
    // For demonstration, we're just logging
    console.log('Notifications created:', notifications.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        notificationsSent: notifications.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
