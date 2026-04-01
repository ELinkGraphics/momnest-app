import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const chapaSecretKey = Deno.env.get("CHAPA_SECRET_KEY");
    if (!chapaSecretKey) {
      throw new Error("CHAPA_SECRET_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      throw new Error("Unauthorized: Missing token");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      throw new Error("Unauthorized: Invalid token");
    }

    const { amount, firstName, lastName, email, phoneNumber } = await req.json();

    if (!amount || amount < 10) {
      throw new Error("Minimum top-up amount is 10 ETB");
    }

    // Generate a unique transaction reference
    const txRef = `topup-${user.id.slice(0, 8)}-${Date.now()}`;

    const trimmedEmail = (email || user.email || "user@momnest.app").trim();

    const payload = {
      amount: amount.toString(),
      currency: "ETB",
      email: trimmedEmail,
      first_name: firstName || user.user_metadata?.name?.split(' ')[0] || "MomNest",
      last_name: lastName || user.user_metadata?.name?.split(' ').slice(1).join(' ') || "User",
      phone_number: phoneNumber || undefined,
      tx_ref: txRef,
      // After payment, Chapa will redirect user to this URL (/verify path)
      return_url: `https://momnest-app.vercel.app/verify`,
      customization: {
        title: "Wallet Top-Up",
        description: `Add ${amount} ETB to your MomNest wallet`,
      },
      meta: {
        userId: user.id,
        type: "wallet_topup",
      },
    };

    console.log("Initializing Chapa payment for user:", user.id);
    console.log("Email being sent to Chapa:", payload.email);

    const chapaRes = await fetch(
      "https://api.chapa.co/v1/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chapaSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const chapaData = await chapaRes.json();

    if (!chapaRes.ok || chapaData.status !== "success") {
      console.error("Chapa init error response:", JSON.stringify(chapaData, null, 2));
      
      // If message is an object (validation errors), flatten it
      let errorMessage = "Chapa initialization failed";
      if (typeof chapaData.message === "string") {
        errorMessage = chapaData.message;
      } else if (typeof chapaData.message === "object" && chapaData.message !== null) {
        errorMessage = Object.entries(chapaData.message)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
          .join(" | ");
      }
      
      throw new Error(errorMessage);
    }

    const checkoutUrl: string = chapaData.data.checkout_url;

    return new Response(
      JSON.stringify({ success: true, checkoutUrl, txRef }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("chapa-initialize error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: message === "Unauthorized" ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
