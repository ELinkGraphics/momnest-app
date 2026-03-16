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

    const { txRef } = await req.json();
    if (!txRef) {
      throw new Error("txRef is required");
    }

    // Idempotency check: has this tx_ref already been credited?
    const { data: existing } = await supabase
      .from("coin_transactions")
      .select("id")
      .eq("reference_id", txRef)
      .eq("type", "topup")
      .maybeSingle();

    if (existing) {
      // Already credited — return success without double-crediting
      return new Response(
        JSON.stringify({
          success: true,
          status: "already_credited",
          message: "This payment has already been processed",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the transaction with Chapa
    const chapaRes = await fetch(
      `https://api.chapa.co/v1/transaction/verify/${txRef}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${chapaSecretKey}`,
        },
      }
    );

    const chapaData = await chapaRes.json();

    if (!chapaRes.ok) {
      console.error("Chapa verify error:", chapaData);
      throw new Error(chapaData.message || "Chapa verification failed");
    }

    const txData = chapaData.data;
    const status: string = txData?.status;
    const amount: number = parseFloat(txData?.amount ?? "0");

    if (status !== "success") {
      return new Response(
        JSON.stringify({ success: false, status, message: "Payment not completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit the wallet using existing Supabase RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("topup_coins", {
      _user_id: user.id,
      _amount: Math.floor(amount), // coins = ETB amount
      _payment_method: "chapa",
    });

    if (rpcError) {
      console.error("topup_coins RPC error:", rpcError);
      throw new Error(rpcError.message);
    }

    if (!rpcData) {
      throw new Error("Wallet credit failed");
    }

    // Update the transaction record with the tx_ref for idempotency
    await supabase
      .from("coin_transactions")
      .update({ reference_id: txRef })
      .eq("user_id", user.id)
      .eq("type", "topup")
      .is("reference_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(
      JSON.stringify({
        success: true,
        status: "success",
        amount,
        message: `${Math.floor(amount)} coins added to your wallet`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("chapa-verify error:", error);
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
