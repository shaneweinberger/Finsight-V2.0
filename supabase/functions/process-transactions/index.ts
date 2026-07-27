
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

console.log("Hello from process-transactions!");

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Structured Output Schema ──────────────────────────────────────────────────
// Forces Gemini to respond with valid JSON matching this shape every time.
// Eliminates the need for regex parsing / markdown stripping workarounds,
// and saves ~50-100 tokens that would otherwise go to plain-text format instructions.
// Note: We use string literals ("ARRAY", "OBJECT", "STRING") instead of SchemaType enums
// because the enum export doesn't resolve reliably through esm.sh in the Deno runtime.
const responseSchema = {
    type: "ARRAY",
    items: {
        type: "OBJECT",
        properties: {
            uuid: {
                type: "STRING",
                description: "The transaction id provided in the input",
            },
            final_category: {
                type: "STRING",
                description: "The selected category from the user's category list, or 'delete' if a rule says to remove it",
            },
            final_description: {
                type: "STRING",
                description: "Cleaned up merchant name, removing noise like store numbers or transaction IDs",
            },
        },
        required: ["uuid", "final_category", "final_description"],
    },
};

// ── Helper: normalize a raw_data date to a YYYY-MM-DD calendar string ────────
// Mirrors `normalizeDate` in src/utils/csvParser.js. Kept timezone-free on
// purpose: `new Date(x).toISOString()` shifts the calendar day depending on the
// server's UTC offset and on whether the input is ISO or MM/DD/YYYY.
// Returns null when unparseable so callers can skip the row.
function normalizeRawDate(value: any): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (str === '') return null;

    const pad = (n: number) => String(n).padStart(2, '0');
    const build = (y: number, m: number, d: number): string | null => {
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        if (y < 1900 || y > 2200) return null;
        return `${y}-${pad(m)}-${pad(d)}`;
    };

    const iso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return build(+iso[1], +iso[2], +iso[3]);

    const na = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (na) return build(+na[3], +na[1], +na[2]);

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return null;
}

// ── Helper: compute the start of the current period window ───────────────────
function getPeriodStart(period: string): string {
    const now = new Date();
    if (period === 'daily') {
        // Start of today (midnight UTC)
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    } else if (period === 'weekly') {
        // Start of the current week (Sunday, UTC)
        const dayOfWeek = now.getUTCDay(); // 0 = Sunday
        const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek));
        return startOfWeek.toISOString();
    } else {
        // 'monthly' — start of current month
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    }
}

// ── Helper: compute a human-readable reset date string ───────────────────────
function getResetAt(period: string): string {
    const now = new Date();
    let reset: Date;
    if (period === 'daily') {
        reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    } else if (period === 'weekly') {
        const dayOfWeek = now.getUTCDay();
        reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - dayOfWeek)));
    } else {
        reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    }
    return reset.toISOString();
}

serve(async (req: { method: string; }) => {
    // Handle CORS preflight requests via OPTIONS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // 1. Setup Clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    if (!supabaseUrl || !supabaseServiceRoleKey || !geminiApiKey) {
        return new Response(
            JSON.stringify({ error: "Missing environment variables" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // Structured output config — guarantees valid JSON, saves format-instruction tokens
    const generationConfig = {
        responseMimeType: "application/json",
        responseSchema,
    };

    // Primary model + fallbacks for when the primary is overloaded.
    // gemini-2.0-flash was retired by Google (404 as of May 2026).
    // Cascade: best quality → lighter/faster → lightest (highest availability).
    const MODELS = [
        { name: "gemini-2.5-flash", instance: genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig }) },
        { name: "gemini-2.5-flash-lite", instance: genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig }) },
        { name: "gemini-2.0-flash-lite", instance: genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite", generationConfig }) },
    ];
    const MAX_RETRIES = 3;

    console.log("[1] Clients initialized");

    try {
        // 2. Fetch Pending Transactions
        // Batch size increased to 150: the fixed prompt cost (base prompt + categories + rules)
        // is amortised over more transactions, making each item cheaper per-token on average.
        const { data: transactions, error: txError } = await supabase
            .schema("bronze")
            .from("transactions")
            .select("*")
            .eq("status", "pending")
            .limit(150);

        if (txError) throw txError;
        console.log(`[2] Found ${transactions.length} pending transactions`);
        if (transactions.length === 0) {
            return new Response(
                JSON.stringify({ message: "No pending transactions found." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── Claim rows immediately ────────────────────────────────────────────
        // Mark all fetched rows as 'processing' before doing any async work.
        // This prevents a concurrent invocation from picking up the same rows
        // and causing a race condition (FK violation on silver upsert).
        const claimedIds = transactions.map((t: any) => t.id);
        const { error: claimError } = await supabase
            .schema("bronze")
            .from("transactions")
            .update({ status: "processing" })
            .in("id", claimedIds);
        if (claimError) {
            console.error("[2.1] Failed to claim rows — aborting to avoid race condition", claimError);
            throw claimError;
        }
        console.log(`[2.1] Claimed ${claimedIds.length} rows as 'processing'`);

        // 3. Group by User ID to process user-specific rules
        const txByUser: Record<string, typeof transactions> = {};
        for (const tx of transactions) {
            if (!txByUser[tx.user_id]) {
                txByUser[tx.user_id] = [];
            }
            txByUser[tx.user_id].push(tx);
        }

        const results = [];

        // 4. Process per User
        for (const userId of Object.keys(txByUser)) {
            const userTxs = txByUser[userId];

            // ── A. Token Limit Pre-flight Check ──────────────────────────────
            // Fetch profile to check if this user has a token limit configured.
            const { data: profile } = await supabase
                .from("profiles")
                .select("token_limit, limit_period")
                .eq("id", userId)
                .single();

            if (profile?.token_limit != null && profile?.limit_period) {
                const periodStart = getPeriodStart(profile.limit_period);

                // Sum all tokens used by this user within the current period window.
                // No counter to reset — the window shifts automatically as time passes.
                const { data: usageData } = await supabase
                    .from("api_usage_logs")
                    .select("total_tokens")
                    .eq("user_id", userId)
                    .gte("created_at", periodStart);

                const tokensUsedThisPeriod = (usageData || []).reduce(
                    (sum: number, row: { total_tokens: number }) => sum + (row.total_tokens || 0),
                    0
                );

                console.log(`[2.1] User ${userId} has used ${tokensUsedThisPeriod} / ${profile.token_limit} tokens this ${profile.limit_period}`);

                if (tokensUsedThisPeriod >= profile.token_limit) {
                    const resetAt = getResetAt(profile.limit_period);
                    console.log(`[2.2] User ${userId} token limit exceeded. Reset at ${resetAt}`);
                    return new Response(
                        JSON.stringify({
                            error: "TOKEN_LIMIT_EXCEEDED",
                            period: profile.limit_period,
                            tokensUsed: tokensUsedThisPeriod,
                            tokenLimit: profile.token_limit,
                            resetAt,
                        }),
                        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }
            }

            // ── B. Fetch Context (categories, rules, base prompt) ─────────────
            const [promptsRes, rulesRes, categoriesRes] = await Promise.all([
                supabase.from("llm_prompts").select("prompt_text").eq("is_active", true).single(),
                supabase.from("user_rules").select("*").eq("user_id", userId).eq("is_active", true),
                supabase.from("user_categories").select("name").eq("user_id", userId),
            ]);

            const basePrompt = promptsRes.data?.prompt_text || "Categorize these transactions.";
            const rules = rulesRes.data || [];
            const categories = categoriesRes.data?.map((c: { name: any; }) => c.name) || [];

            // Separate structured rules and natural language (AI instructions) rules
            const structuredRules = rules.filter((r: any) => r.conditions && r.actions);
            const nlpRules = rules.filter((r: any) => r.rule_text).map((r: any) => r.rule_text);

            // raw_data is now pre-normalized by the frontend CSV parser to:
            // { Date: "YYYY-MM-DD", Description: "...", Amount: <number> }
            // No MoneyOut/MoneyIn splitting needed — Amount is already a signed float.
            const preparedTxs = userTxs.map((tx: { raw_data: any; id: any; transaction_account: any; }) => {
                const raw = tx.raw_data;

                // Amount: already a signed number from the frontend parser.
                // Defensive fallback for legacy rows that may still have MoneyOut/MoneyIn.
                let amount: number;
                if (raw.Amount !== undefined && raw.Amount !== null) {
                    const parsed = parseFloat(String(raw.Amount).replace(/[^0-9.\-]/g, ''));
                    amount = isFinite(parsed) ? parsed : 0;
                } else {
                    // Legacy fallback: compute from MoneyOut / MoneyIn
                    const parseVal = (val: any): number => {
                        if (val === undefined || val === null || val === '') return 0;
                        const clean = String(val).replace(/[^0-9.\-]/g, '');
                        const p = parseFloat(clean);
                        return isFinite(p) ? p : 0;
                    };
                    const moneyOut = parseVal(raw.MoneyOut);
                    const moneyIn  = parseVal(raw.MoneyIn);
                    amount = moneyOut !== 0 ? -1 * Math.abs(moneyOut) : Math.abs(moneyIn);
                }

                // Dates arrive pre-normalized as "YYYY-MM-DD" from the frontend
                // parser. Legacy bronze rows may still hold "MM/DD/YYYY". Read the
                // calendar components directly instead of round-tripping through
                // `new Date()` + `toISOString()`, which shifts the day by one
                // depending on the local UTC offset and the input format.
                const date = normalizeRawDate(raw.Date);

                return {
                    id: tx.id,
                    description: String(raw.Description ?? '').trim(),
                    amount,
                    date,
                    transaction_type: amount < 0 ? 'Expenditure' : 'Income',
                    transaction_account: tx.transaction_account
                };
            });

            // Backstop for unusable rows. The frontend parser now filters these
            // out before insertion, but legacy bronze rows (uploaded before that
            // fix) still carry blank descriptions, $0 amounts and fabricated
            // dates from spreadsheet padding. Classifying them wastes tokens, and
            // a null date would fail the NOT NULL constraint on the silver insert
            // and take the whole batch down with it.
            const isUnusable = (t: { date: string | null; description: string; amount: number }) =>
                t.date === null || !isFinite(t.amount) || (t.description === '' && t.amount === 0);

            const transactionsToClassify = preparedTxs.filter((t: any) => !isUnusable(t));
            const unusableBronzeIds = preparedTxs.filter(isUnusable).map((t: any) => t.id);

            if (unusableBronzeIds.length > 0) {
                console.log(`[3.1] Skipping ${unusableBronzeIds.length} unusable bronze rows (blank/undated) for user ${userId}`);
            }

            console.log(`[3] Prepared ${transactionsToClassify.length} transactions for user ${userId}`);

            // Nothing worth classifying in this user's slice — retire the rows
            // instead of paying for an empty Gemini call.
            if (transactionsToClassify.length === 0) {
                if (unusableBronzeIds.length > 0) {
                    await supabase
                        .schema("bronze")
                        .from("transactions")
                        .update({ status: 'processed' })
                        .in("id", unusableBronzeIds);
                }
                console.log(`[3.2] No classifiable transactions for user ${userId}; skipping AI call.`);
                continue;
            }

            // ── C. Construct Prompt ──────────────────────────────────────────
            // Note: We no longer include verbose output-format instructions at the end —
            // the responseSchema passed to the model handles that more efficiently.
            const transactionList = transactionsToClassify.map((t: { id: any; description: any; amount: any; date: any; }) => ({
                id: t.id,
                description: t.description,
                amount: t.amount,
                date: t.date
            }));
            console.log(`[3.1] Sending ${transactionList.length} transactions to AI (approx payload size: ${JSON.stringify(transactionList).length} chars)`);

            const fullPrompt = `
        ${basePrompt}

        User Categories: ${JSON.stringify(categories)}
        
        Structured Rules: ${JSON.stringify(structuredRules)}

        Natural Language Rules (High Priority):
        ${nlpRules.map((rule: string, i: number) => `${i + 1}. ${rule}`).join('\n')}

        Instructions:
        1. Categorize the transactions based on the provided categories and rules.
        2. If a rule (structured or natural language) indicates a transaction should be deleted (e.g., if it says to categorize as "delete" or "deleted"), assign the category exactly as "delete".
        3. Do not create new categories. Use the provided list.

        Transactions to Categorize:
        ${JSON.stringify(transactionList)}
      `;

            // ── D. Call Gemini with retry + fallback ────────────────────────
            // Strategy: try each model up to 3 times with exponential backoff
            // on 503/429 errors. If all attempts fail, cascade to the next model.
            // Chain: gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash-lite
            console.log(`[4] Calling Gemini for user ${userId}...`);
            let response;
            let modelUsed = MODELS[0].name;

            const isRetryable = (err: any): boolean => {
                const msg = err?.message || '';
                return msg.includes('503') || msg.includes('429') || msg.includes('Service Unavailable') || msg.includes('Quota');
            };

            let succeeded = false;
            for (const { name: currentModelName, instance: currentModel } of MODELS) {
                if (succeeded) break;

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        const startTime = Date.now();
                        console.log(`[4.${currentModelName}] Attempt ${attempt}/${MAX_RETRIES}...`);
                        const result = await currentModel.generateContent(fullPrompt);
                        response = await result.response;
                        modelUsed = currentModelName;
                        succeeded = true;
                        console.log(`[4.1] ${currentModelName} responded in ${Date.now() - startTime}ms (attempt ${attempt})`);
                        break;
                    } catch (geminiErr: any) {
                        console.error(`[4.ERR] ${currentModelName} attempt ${attempt} failed: ${geminiErr.message}`);

                        if (!isRetryable(geminiErr) || attempt === MAX_RETRIES) {
                            // Non-retryable error or exhausted retries for this model
                            console.error(`[4.ERR] ${currentModelName} exhausted — ${attempt === MAX_RETRIES ? 'max retries reached' : 'non-retryable error'}`);
                            break;
                        }

                        // Exponential backoff: 1s, 2s, 4s
                        const waitMs = Math.pow(2, attempt - 1) * 1000;
                        console.log(`[4.RETRY] Waiting ${waitMs}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitMs));
                    }
                }
            }

            if (!succeeded || !response) {
                throw new Error(`All Gemini models failed after retries. The API may be temporarily unavailable. Please try again in a minute.`);
            }

            // ── E. Log Token Usage ───────────────────────────────────────────
            // Extract usage metadata and persist to api_usage_logs.
            // This is the source of truth for the per-period limit calculation above.
            try {
                const usage = response.usageMetadata;
                if (usage) {
                    const { error: logError } = await supabase.from("api_usage_logs").insert({
                        user_id: userId,
                        prompt_tokens: usage.promptTokenCount ?? 0,
                        completion_tokens: usage.candidatesTokenCount ?? 0,
                        total_tokens: usage.totalTokenCount ?? 0,
                        model_name: modelUsed,
                    });
                    if (logError) {
                        // Non-fatal: log the error but don't halt processing
                        console.error(`[5.ERR] Failed to log token usage: ${logError.message}`);
                    } else {
                        console.log(`[5] Logged usage: prompt=${usage.promptTokenCount}, completion=${usage.candidatesTokenCount}, total=${usage.totalTokenCount}`);
                    }
                } else {
                    console.warn(`[5.WARN] No usageMetadata in Gemini response for user ${userId}`);
                }
            } catch (logErr: any) {
                // Non-fatal: don't block transaction processing if logging fails
                console.error(`[5.ERR] Exception while logging usage: ${logErr.message}`);
            }

            // ── F. Parse Response ────────────────────────────────────────────
            // With structured outputs, response.text() is guaranteed to be valid JSON —
            // no markdown stripping or try/catch JSON.parse needed in the happy path.
            const text = response.text();
            console.log(`[6] Gemini responded, parsing...`);

            let processedData;
            try {
                processedData = JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse Gemini response for user " + userId, text);
                await supabase.schema("bronze").from("transactions")
                    .update({ status: "error", error_message: "LLM Parsing Failed" })
                    .in("id", userTxs.map((t: { id: any; }) => t.id));
                continue;
            }

            // ── G. Prepare Batched Operations ────────────────────────────────
            const silverUpserts: any[] = [];
            const bronzeProcessedIds: string[] = [];
            const bronzeDeleteIds: string[] = [];
            const bronzeErrorIds: string[] = [];
            let errorMsg = '';

            if (Array.isArray(processedData)) {
                for (const item of processedData) {
                    const codeData = transactionsToClassify.find((t: any) => t.id === item.uuid);
                    if (!codeData) continue;

                    // Support for hard-coded deletion via rules
                    if (item.final_category?.toLowerCase() === 'delete') {
                        bronzeDeleteIds.push(item.uuid);
                        continue;
                    }

                    silverUpserts.push({
                        bronze_id: item.uuid,
                        user_id: userId,
                        description: item.final_description || codeData.description,
                        category: item.final_category,
                        amount: codeData.amount,
                        transaction_date: codeData.date,
                        transaction_type: codeData.transaction_type,
                        transaction_account: codeData.transaction_account,
                        processed_at: new Date().toISOString(),
                        is_edited: false
                    });
                    bronzeProcessedIds.push(item.uuid);
                }
            }

            // Mark any transactions Gemini skipped as 'processed' (ignored)
            // to prevent them clogging the pipeline on future loops.
            const respondedIds = new Set(processedData.map((d: any) => d.uuid));
            const omittedIds = userTxs.filter((tx: any) => !respondedIds.has(tx.id)).map((tx: any) => tx.id);
            if (omittedIds.length > 0) {
                console.log(`[7] AI omitted ${omittedIds.length} transactions. Marking as processed (ignored).`);
                bronzeProcessedIds.push(...omittedIds);
            }

            // ── H. Execute Batched DB Operations ────────────────────────────
            console.log(`[8] Batch upserting ${silverUpserts.length} items to silver...`);
            if (silverUpserts.length > 0) {
                const { error: silverError } = await supabase
                    .from("silver_transactions")
                    .upsert(silverUpserts, { onConflict: "bronze_id" });

                if (silverError) {
                    console.error("Batch Silver upsert failed", silverError);
                    errorMsg = silverError.message;
                    const silverIds = silverUpserts.map(u => u.bronze_id);
                    bronzeErrorIds.push(...silverIds);
                    const errorSet = new Set(silverIds);
                    const filteredProcessed = bronzeProcessedIds.filter(id => !errorSet.has(id));
                    bronzeProcessedIds.length = 0;
                    bronzeProcessedIds.push(...filteredProcessed);
                }
            }

            console.log(`[9] Database updates: del=${bronzeDeleteIds.length}, err=${bronzeErrorIds.length}, ok=${bronzeProcessedIds.length}`);

            if (bronzeDeleteIds.length > 0) {
                console.log(`[9.1] Physically deleting ${bronzeDeleteIds.length} items from bronze`);
                const { error: bronzeDeleteError } = await supabase.schema("bronze").from("transactions")
                    .delete()
                    .in('id', bronzeDeleteIds);
                if (bronzeDeleteError) console.error("Batch Bronze deletion failed", bronzeDeleteError);
            }

            if (bronzeErrorIds.length > 0) {
                console.log(`[9.2] Marking ${bronzeErrorIds.length} as ERROR`);
                await supabase.schema("bronze").from("transactions")
                    .update({ status: 'error', error_message: errorMsg || 'Batch update failed' })
                    .in('id', bronzeErrorIds);
            }

            if (bronzeProcessedIds.length > 0) {
                console.log(`[9.3] Marking ${bronzeProcessedIds.length} as PROCESSED`);
                const { error: bronzeUpdateError } = await supabase.schema("bronze").from("transactions")
                    .update({ status: 'processed' })
                    .in('id', bronzeProcessedIds);

                if (bronzeUpdateError) {
                    console.error("Batch Bronze update failed", bronzeUpdateError);
                }
            }

            results.push({
                userId,
                processedCount: bronzeProcessedIds.length,
                deletedCount: bronzeDeleteIds.length,
                errorCount: bronzeErrorIds.length
            });
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: any) {
        let status = 500;
        let message = err.message;

        if (err.message.includes('429') || err.message.includes('Quota')) {
            status = 429;
            message = "AI Quota Exceeded. You are on a free tier with strict limits. Please wait a minute and try again.";
        } else if (err.message.includes('404')) {
            status = 404;
            message = "AI Model Not Found. Check your API Key and Google AI Studio project settings.";
        }

        return new Response(JSON.stringify({ error: message, details: err.message }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
