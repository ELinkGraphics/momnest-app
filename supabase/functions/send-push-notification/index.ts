import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProfileWithToken {
  id: string;
  fcm_token: string | null;
}

async function getFCMAccessToken(): Promise<string | null> {
  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY not set — skipping FCM dispatch");
      return null;
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const jwtPayload = btoa(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      new TextEncoder().encode(serviceAccount.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(`${header}.${jwtPayload}`),
    );
    const jwt = `${header}.${jwtPayload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResponse.json();
    return tokenData.access_token ?? null;
  } catch (err) {
    console.error("Failed to get FCM access token:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const payload = await req.json();
    console.log("Received push payload:", payload);

    let targetUserIds: string[] = [];
    let title = "New Notification";
    let body = "You have a new update!";
    let notificationType = "system";
    let data: Record<string, any> = {};

    // Path 1: Database Webhook (automatic trigger from DB insert)
    if (payload.type === "INSERT" && payload.table && payload.record) {
      console.log(`Processing webhook from table: ${payload.table}`);

      if (payload.table === "follows") {
        targetUserIds = [payload.record.following_id];
        notificationType = "follow";
        const { data: prof } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", payload.record.follower_id)
          .single();
        const name = prof?.name || "Someone";
        title = "New Follower";
        body = `${name} started following you!`;
      } else if (payload.table === "messages") {
        const senderId = payload.record.sender_id;
        const convId = payload.record.conversation_id;
        notificationType = "message";
        data = { conversationId: convId };
        const { data: members } = await supabase
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", convId)
          .neq("user_id", senderId);
        if (members && members.length > 0) targetUserIds = [members[0].user_id];
        const { data: prof } = await supabase.from("profiles").select("name").eq("id", senderId).single();
        const senderName = prof?.name || "Someone";
        title = `New message from ${senderName}`;
        body = payload.record.content;
      } else if (payload.table === "push_notifications") {
        console.log("Skipping to prevent infinite loop.");
        return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
      } else {
        console.log(`Unhandled webhook table: ${payload.table}`);
        return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
      }
    }
    // Path 2: Direct client call (e.g. from Firebase Console test)
    else {
      title = payload.title || title;
      body = payload.body || body;
      notificationType = payload.notificationType || notificationType;
      data = payload.data || {};
      if (payload.userId) targetUserIds = [payload.userId];
      else if (payload.userIds) targetUserIds = payload.userIds;
      else {
        const { data: profiles } = await supabase.from("profiles").select("id").not("fcm_token", "is", null);
        targetUserIds = profiles?.map((p: { id: string }) => p.id) || [];
      }
    }

    if (targetUserIds.length === 0) {
      console.log("No eligible target users found.");
      return new Response(JSON.stringify({ success: true, message: "No targets" }), { headers: corsHeaders });
    }

    console.log(`Sending "${title}" to ${targetUserIds.length} users.`);

    // Get FCM tokens
    const { data: profilesWithTokens } = await supabase
      .from("profiles")
      .select("id, fcm_token")
      .in("id", targetUserIds)
      .not("fcm_token", "is", null);

    // Store in DB
    await supabase
      .from("push_notifications")
      .insert(
        targetUserIds.map((userId) => ({ user_id: userId, notification_type: notificationType, title, body, data })),
      );

    // Send via FCM
    const accessToken = await getFCMAccessToken();
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");

    if (accessToken && firebaseProjectId && profilesWithTokens?.length) {
      const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`;
      const fcmResults = await Promise.allSettled(
        (profilesWithTokens as ProfileWithToken[])
          .filter((p) => p.fcm_token && !p.fcm_token.startsWith("web_"))
          .map((profile) =>
            fetch(fcmUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: {
                  token: profile.fcm_token,
                  notification: { title, body },
                  data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
                  android: { priority: "high", notification: { sound: "default" } },
                },
              }),
            }),
          ),
      );
      const sent = fcmResults.filter((r) => r.status === "fulfilled").length;
      const failed = fcmResults.filter((r) => r.status === "rejected").length;
      console.log(`FCM: ${sent} sent, ${failed} failed`);
      fcmResults.forEach((r, i) => {
        if (r.status === "rejected") console.error(`FCM failed [${i}]:`, r.reason);
      });
    } else {
      console.log("FCM SKIPPED. Debug:");
      console.log("- has accessToken?", !!accessToken);
      console.log("- has firebaseProjectId?", !!firebaseProjectId);
      console.log("- profilesWithTokens count:", profilesWithTokens?.length || 0);
    }

    return new Response(JSON.stringify({ success: true, message: `Sent to ${targetUserIds.length} users` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
