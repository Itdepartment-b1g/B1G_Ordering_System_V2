import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Creates a new sub-warehouse (location) under an existing warehouse company:
 * - creates a `warehouse_locations` row (with unique `code` for RN-{CODE}-{####})
 * - creates an auth user (role=warehouse) + profiles row (same company_id)
 * - links user to location in `warehouse_location_users`
 *
 * Caller can be:
 * - system_administrator (can create for any warehouse company by passing `company_id`)
 * - main warehouse user (can create for their own company only)
 */

function deriveLocationCodeFallback(locationName: string): string {
  const words = String(locationName || "")
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "LOC";

  let code = "";
  for (const word of words) {
    if (code.length >= 3) break;
    code += word[0];
  }

  if (code.length === 2 && words.length >= 2 && words[0].length > 1) {
    const consonants: string[] = [];
    for (let i = 1; i < words[0].length; i++) {
      const ch = words[0][i];
      if ("BCDFGHJKLMNPQRSTVWXYZ".includes(ch)) consonants.push(ch);
    }
    if (consonants.length > 0) {
      code = code[0] + consonants[consonants.length - 1] + code[1];
    }
  }

  if (code.length < 3) {
    const letters = String(locationName || "").toUpperCase().replace(/[^A-Z]/g, "");
    for (const ch of letters) {
      if (code.length >= 3) break;
      if (!code.includes(ch)) code += ch;
    }
  }

  while (code.length < 3) code += "X";
  return code.slice(0, 3);
}

async function allocateUniqueLocationCode(
  supabaseClient: ReturnType<typeof createClient>,
  companyId: string,
  locationName: string,
  preferred?: string | null,
): Promise<string> {
  const { data: allocated, error: allocErr } = await supabaseClient.rpc(
    "allocate_warehouse_location_code",
    {
      p_company_id: companyId,
      p_name: locationName,
      p_preferred: preferred?.trim() || null,
    },
  );

  if (!allocErr && allocated) {
    return String(allocated).toUpperCase().slice(0, 3);
  }

  // Fallback when RPC/migration not applied yet: derive + uniquify in JS.
  const { data: existingRows } = await supabaseClient
    .from("warehouse_locations")
    .select("code")
    .eq("company_id", companyId);

  const used = new Set(
    (existingRows || [])
      .map((r: { code?: string | null }) => String(r.code || "").toUpperCase())
      .filter(Boolean),
  );

  let base = preferred?.trim()
    ? preferred.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)
    : deriveLocationCodeFallback(locationName);
  if (!base) base = "LOC";

  let tryCode = base;
  let suffix = 0;
  while (used.has(tryCode)) {
    suffix += 1;
    if (suffix <= 26) {
      tryCode = base.slice(0, 2) + String.fromCharCode(64 + suffix);
    } else {
      tryCode = base.slice(0, 1) + String(suffix - 26).padStart(2, "0");
    }
  }
  return tryCode;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    const caller = userData?.user;
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, role, company_id, status")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(JSON.stringify({ error: "Unauthorized: Could not verify user role" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    if (callerProfile.status !== "active") {
      return new Response(JSON.stringify({ error: "Account inactive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json();
    const {
      company_id,
      location_name,
      location_code,
      full_name,
      email,
      password,
      phone,
    } = body ?? {};

    if (!location_name || !full_name || !email || !password) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: location_name, full_name, email, password",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email))) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const isSysAdmin = callerProfile.role === "system_administrator";
    const isWarehouse = callerProfile.role === "warehouse";

    if (!isSysAdmin && !isWarehouse) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const targetCompanyId = isSysAdmin ? String(company_id || "").trim() : String(callerProfile.company_id || "").trim();
    if (!targetCompanyId) {
      return new Response(JSON.stringify({ error: "Missing company_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // For warehouse callers: ensure they are a MAIN warehouse user (not a sub-warehouse).
    if (isWarehouse) {
      const { data: linkRow, error: linkErr } = await supabaseClient
        .from("warehouse_location_users")
        .select("location_id, warehouse_locations!inner ( id, company_id, is_main )")
        .eq("user_id", caller.id)
        .maybeSingle();

      if (linkErr) {
        return new Response(JSON.stringify({ error: `Failed to verify warehouse location: ${linkErr.message}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const isMain =
        !!linkRow &&
        (linkRow as any).warehouse_locations?.company_id === targetCompanyId &&
        !!(linkRow as any).warehouse_locations?.is_main;

      if (!isMain) {
        return new Response(JSON.stringify({ error: "Only main warehouse users can create sub-warehouses" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
    }

    // 1) Create location (must include unique `code` — used for RN-{CODE}-{####})
    const locationName = String(location_name).trim();
    const locationCode = await allocateUniqueLocationCode(
      supabaseClient,
      targetCompanyId,
      locationName,
      location_code ? String(location_code) : null,
    );

    const { data: locationRow, error: locationError } = await supabaseClient
      .from("warehouse_locations")
      .insert({
        company_id: targetCompanyId,
        name: locationName,
        code: locationCode,
        is_main: false,
        created_by: caller.id,
      })
      .select("id, company_id, name, code")
      .single();

    if (locationError || !locationRow) {
      return new Response(JSON.stringify({ error: `Failed to create sub-warehouse: ${locationError?.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 2) Create auth user + profile (same company_id)
    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: "warehouse",
      },
    });

    if (authError || !authData.user) {
      await supabaseClient.from("warehouse_locations").delete().eq("id", locationRow.id);
      return new Response(JSON.stringify({ error: `Failed to create user: ${authError?.message || "No user returned"}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const subUserId = authData.user.id;

    const { error: profileInsertError } = await supabaseClient.from("profiles").insert({
      id: subUserId,
      company_id: targetCompanyId,
      email,
      full_name,
      role: "warehouse",
      phone: phone || null,
      status: "active",
    });

    if (profileInsertError) {
      await supabaseClient.auth.admin.deleteUser(subUserId);
      await supabaseClient.from("warehouse_locations").delete().eq("id", locationRow.id);
      return new Response(JSON.stringify({ error: `Failed to create profile: ${profileInsertError.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 3) Link user to location
    const { error: linkError } = await supabaseClient.from("warehouse_location_users").insert({
      location_id: locationRow.id,
      user_id: subUserId,
    });

    if (linkError) {
      await supabaseClient.from("profiles").delete().eq("id", subUserId);
      await supabaseClient.auth.admin.deleteUser(subUserId);
      await supabaseClient.from("warehouse_locations").delete().eq("id", locationRow.id);
      return new Response(JSON.stringify({ error: `Failed to link user to location: ${linkError.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          location_id: locationRow.id,
          company_id: locationRow.company_id,
          location_name: locationRow.name,
          location_code: locationRow.code,
          user_id: subUserId,
          email,
          full_name,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Error in create-sub-warehouse function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "An unexpected error occurred",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});

