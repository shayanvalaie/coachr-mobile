import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const parseAssistantJson = (content: string) => {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
};

const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  const candidateKeys = ["rows", "lineup", "lineUp", "innings", "assignments"];

  for (const key of candidateKeys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }

  return [];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const body = await req.json();
    const teamId = body?.teamId as string | undefined;
    const sport = (body?.sport as string | undefined)?.trim();
    const roster = body?.roster ?? body?.lineUp ?? body?.lineup;

    if (!teamId) {
      return json({ error: "teamId is required" }, 400);
    }
    if (!Array.isArray(roster) || roster.length === 0) {
      return json({ error: "roster (array) is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!anonKey) {
      return json({ error: "Missing SUPABASE_ANON_KEY" }, 500);
    }
    if (!serviceRoleKey) {
      return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!openAiKey) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: team, error: teamErr } = await userClient
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (teamErr) {
      return json({ error: "Failed to verify team", details: teamErr.message }, 500);
    }
    if (!team) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: rulesRow, error: rulesErr } = await userClient
      .from("team_rules")
      .select("rule_text")
      .eq("team_id", teamId)
      .maybeSingle();

    if (rulesErr && rulesErr.code !== "PGRST116") {
      return json({ error: "Failed to load rules", details: rulesErr.message }, 500);
    }

    const rules = rulesRow?.rule_text ?? "";

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an expert coach. Return valid JSON only with this exact top-level shape: {\"rows\":[...]} and no markdown.",
          },
          {
            role: "user",
            content: [
              `Sport: ${sport}`,
              `Rules: ${rules || "(none provided)"}`,
              `Roster JSON: ${JSON.stringify(roster)}`,
              "Generate lineup rows by inning. Include bench when relevant.",
              "Each row must include: inning (number), positions (object of position->player), bench (array of player names).",
              "Return exactly one JSON object with a rows array.",
            ].join("\n"),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return json({ error: "OpenAI request failed", details: errText }, 502);
    }

    const ai = await openaiRes.json();
    const content = ai?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return json({ error: "OpenAI returned empty content" }, 502);
    }

    const parsed = parseAssistantJson(content);
    const rows = extractRows(parsed);
    if (rows.length === 0) {
      return json(
        {
          error: "OpenAI response missing rows",
          details: typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed),
        },
        502,
      );
    }

    const output = { rows };

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: insertErr } = await adminClient.from("generated_lineups").insert({
      team_id: teamId,
      sport,
      rules_snapshot: rules,
      input_payload: { sport, roster },
      output_payload: output,
    });

    if (insertErr) {
      console.error("[generated_lineups insert error]", insertErr);
      return json({ ...output, saved: false, saveError: insertErr.message });
    }

    return json({ ...output, saved: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "Unhandled error", details: message }, 500);
  }
});
