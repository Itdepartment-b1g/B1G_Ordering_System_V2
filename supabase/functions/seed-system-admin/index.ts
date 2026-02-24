import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-seed-token",
};

const SYSTEM_ADMIN_EMAIL = "itdepartment.b1g@gmail.com";
const SYSTEM_ADMIN_PASSWORD = "tempPassword123!";
const SYSTEM_ADMIN_FULL_NAME = "IT Department";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requiredToken = Deno.env.get("SEED_TOKEN") ?? "";
    const providedToken = req.headers.get("x-seed-token") ?? "";

    if (!requiredToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "SEED_TOKEN is not configured on the Edge Function. Set it in Supabase secrets.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (providedToken !== requiredToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    // 1) Ensure auth user exists (idempotent)
    const { data: usersData, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;

    const existing = usersData?.users?.find((u) =>
      (u.email ?? "").toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase()
    );

    let userId = existing?.id ?? null;

    if (!userId) {
      const { data: createData, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: SYSTEM_ADMIN_EMAIL,
          password: SYSTEM_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: SYSTEM_ADMIN_FULL_NAME,
            role: "system_administrator",
          },
        });
      if (createErr) throw createErr;
      userId = createData.user?.id ?? null;
    }

    if (!userId) throw new Error("Failed to create/find auth user id");

    // 2) Ensure profile row exists / is correct (idempotent)
    // Note: system_administrator should have company_id NULL.
    const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: SYSTEM_ADMIN_EMAIL,
        full_name: SYSTEM_ADMIN_FULL_NAME,
        role: "system_administrator",
        status: "active",
        company_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (upsertErr) throw upsertErr;

    return new Response(
      JSON.stringify({
        success: true,
        message: "System administrator seeded",
        email: SYSTEM_ADMIN_EMAIL,
        password: SYSTEM_ADMIN_PASSWORD,
        user_id: userId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

