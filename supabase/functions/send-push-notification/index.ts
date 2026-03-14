import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// VAPID keys from environment
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:support@momnest.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  }
} catch (err) {
  console.error("VAPID initialization error:", err);
}

interface ProfileWithToken {
  id: string;
  fcm_token: string | null;
}

async function getFCMAccessToken(): Promise<string | null> {
  // ... (existing FCM token logic remains unchanged)
  try {
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) return null;
    const serviceAccount = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const jwtPayload = btoa(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      new TextEncoder().encode(serviceAccount.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${jwtPayload}`));
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const payload = await req.json();

    let targetUserIds: string[] = [];
    let title = "New Notification";
    let body = "You have a new update!";
    let notificationType = "system";
    let data: Record<string, any> = {};

    // 1. Determine targets and content (Webhook vs Direct)
    if (payload.type === "INSERT" && payload.table && payload.record) {
      if (payload.table === "follows") {
        targetUserIds = [payload.record.following_id];
        notificationType = "follow";
        const { data: prof } = await supabase.from("profiles").select("name").eq("id", payload.record.follower_id).single();
        title = "New Follower";
        body = `${prof?.name || "Someone"} started following you!`;
      } else if (payload.table === "messages") {
        const senderId = payload.record.sender_id;
        const convId = payload.record.conversation_id;
        notificationType = "message";
        data = { conversationId: convId };
        const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", convId).neq("user_id", senderId);
        if (members?.length) targetUserIds = [members[0].user_id];
        const { data: prof } = await supabase.from("profiles").select("name").eq("id", senderId).single();
        title = `New message from ${prof?.name || "Someone"}`;
        body = payload.record.content;
      } else {
        return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
      }
    } else {
      title = payload.title || title;
      body = payload.body || body;
      notificationType = payload.notificationType || notificationType;
      data = payload.data || {};
      if (payload.userId) targetUserIds = [payload.userId];
      else if (payload.userIds) targetUserIds = payload.userIds;
    }

    if (targetUserIds.length === 0) return new Response(JSON.stringify({ success: true, message: "No targets" }), { headers: corsHeaders });

    // 2. Store in DB notifications table
    await supabase.from("push_notifications").insert(
      targetUserIds.map((userId) => ({ user_id: userId, notification_type: notificationType, title, body, data }))
    );

    // 3. Dispatch Web Push
    const { data: webSubs } = await supabase.from("push_subscriptions").select("*").in("user_id", targetUserIds);
    if (webSubs?.length && VAPID_PUBLIC_KEY) {
      const webPushPromises = webSubs.map(sub => 
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, JSON.stringify({ title, body, data, icon: "/icon-192.png", badge: "/badge-72.png" }))
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            return supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
          console.error("Web Push Error:", err);
        })
      );
      await Promise.allSettled(webPushPromises);
    }

    // 4. Dispatch FCM (legacy)
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const accessToken = await getFCMAccessToken();
    const { data: profilesWithTokens } = await supabase.from("profiles").select("id, fcm_token").in("id", targetUserIds).not("fcm_token", "is", null);

    if (accessToken && firebaseProjectId && profilesWithTokens?.length) {
      const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`;
      await Promise.allSettled(
        (profilesWithTokens as ProfileWithToken[])
          .filter(p => p.fcm_token && !p.fcm_token.startsWith("web_"))
          .map(profile => fetch(fcmUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: profile.fcm_token,
                notification: { title, body },
                data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
              }
            })
          }))
      );
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
