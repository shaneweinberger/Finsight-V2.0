
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

console.log("Hello from process-transactions!");

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    console.log("[1] Clients initialized");

    try {
        // 2. Fetch Pending Transactions
        const { data: transactions, error: txError } = await supabase
            .schema("bronze")
            .from("transactions")
            .select("*")
            .eq("status", "pending")
            .limit(50); // Process in batches

        if (txError) throw txError;
        console.log(`[2] Found ${transactions.length} pending transactions`);
        if (transactions.length === 0) {
            return new Response(
                JSON.stringify({ message: "No pending transactions found." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

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

            // A. Fetch Context
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

            const transactionsToClassify = userTxs.map((tx: { raw_data: any; id: any; transaction_account: any; }) => {
                const raw = tx.raw_data;
                let amount = 0;

                const parseAmount = (val: any): number => {
                    if (val === undefined || val === null || val === '') return 0;
                    const clean = String(val).replace(/[^0-9.-]/g, '');
                    const parsed = parseFloat(clean);
                    return isNaN(parsed) ? 0 : parsed;
                };

                const moneyOut = parseAmount(raw.MoneyOut);
                const moneyIn = parseAmount(raw.MoneyIn);

                if (moneyOut !== 0) {
                    amount = -1 * Math.abs(moneyOut);
                } else if (moneyIn !== 0) {
                    amount = Math.abs(moneyIn);
                }

                const dateObj = new Date(raw.Date);
                const date = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                return {
                    id: tx.id,
                    description: raw.Description,
                    amount,
                    date,
                    transaction_type: amount < 0 ? 'Expenditure' : 'Income',
                    transaction_account: tx.transaction_account
                };
            });

            console.log(`[3] Prepared ${transactionsToClassify.length} transactions for user ${userId}`);

            // C. Construct Prompt
            const transactionList = transactionsToClassify.map((t: { id: any; description: any; amount: any; }) => ({ id: t.id, description: t.description, amount: t.amount }));
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
        ${JSON.stringify(transactionsToClassify.map((t: { id: any; description: any; amount: any; }) => ({ id: t.id, description: t.description, amount: t.amount })))}

        Output a JSON array where each object has:
        - uuid: (the transaction id provided)
        - final_category: (selected category or "delete")
        - final_description: (cleaned up merchant name)
      `;

            // C. Call Gemini
            console.log(`[4] Calling Gemini for user ${userId}...`);
            let response;
            try {
                const startTime = Date.now();
                const result = await model.generateContent(fullPrompt);
                response = await result.response;
                console.log(`[4.1] Gemini AI responded in ${Date.now() - startTime}ms`);
            } catch (geminiErr: any) {
                console.error(`[4.ERR] Gemini API call failed: ${geminiErr.message}`);
                console.error(`[4.ERR] Full error details: ${JSON.stringify(geminiErr)}`);
                throw new Error(`Gemini API connection failed: ${geminiErr.message}`);
            }

            let text = response.text();
            console.log(`[5] Gemini responded, parsing...`);

            // Attempt to extract JSON if wrapped in markdown blocks
            if (text.startsWith("```json")) {
                text = text.replace(/```json\n?/, "").replace(/```$/, "");
            } else if (text.startsWith("```")) {
                text = text.replace(/```\n?/, "").replace(/```$/, "");
            }

            let processedData;
            try {
                processedData = JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse Gemini response for user " + userId, text);
                // Mark these as error? Or keep pending? Let's mark error for now to avoid loop.
                await supabase.schema("bronze").from("transactions")
                    .update({ status: "error", error_message: "LLM Parsing Failed" })
                    .in("id", userTxs.map((t: { id: any; }) => t.id));
                continue;
            }

            // D. Prepare Batched Operations
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
                        date: codeData.date,
                        transaction_type: codeData.transaction_type,
                        transaction_account: codeData.transaction_account,
                        processed_at: new Date().toISOString(),
                        is_edited: false
                    });
                    bronzeProcessedIds.push(item.uuid);
                }
            }

            // Also mark any transactions that Gemini completely skipped as 'processed' (ignored)
            // to prevent them from clogging the pipeline in future loops.
            const respondedIds = new Set(processedData.map((d: any) => d.uuid));
            const omittedIds = userTxs.filter((tx: any) => !respondedIds.has(tx.id)).map((tx: any) => tx.id);
            if (omittedIds.length > 0) {
                console.log(`[6] AI omitted ${omittedIds.length} transactions. Marking as processed (ignored).`);
                bronzeProcessedIds.push(...omittedIds);
            }

            // E. Execute Batched Operations
            console.log(`[7] Batch upserting ${silverUpserts.length} items to silver...`);
            if (silverUpserts.length > 0) {
                const { error: silverError } = await supabase
                    .from("silver_transactions")
                    .upsert(silverUpserts, { onConflict: "bronze_id" });

                if (silverError) {
                    console.error("Batch Silver upsert failed", silverError);
                    errorMsg = silverError.message;
                    // Add all IDs associated with silver updates to the error pool
                    const silverIds = silverUpserts.map(u => u.bronze_id);
                    bronzeErrorIds.push(...silverIds);
                    // Remove them from processed pool so we don't try to mark them as successful
                    const errorSet = new Set(silverIds);
                    const filteredProcessed = bronzeProcessedIds.filter(id => !errorSet.has(id));
                    bronzeProcessedIds.length = 0;
                    bronzeProcessedIds.push(...filteredProcessed);
                }
            }

            console.log(`[8] Database updates: del=${bronzeDeleteIds.length}, err=${bronzeErrorIds.length}, ok=${bronzeProcessedIds.length}`);

            // Perform updates independently
            if (bronzeDeleteIds.length > 0) {
                console.log(`[8.1] Physically deleting ${bronzeDeleteIds.length} items from bronze`);
                const { error: bronzeDeleteError } = await supabase.schema("bronze").from("transactions")
                    .delete()
                    .in('id', bronzeDeleteIds);
                if (bronzeDeleteError) console.error("Batch Bronze deletion failed", bronzeDeleteError);
            }

            if (bronzeErrorIds.length > 0) {
                console.log(`[8.2] Marking ${bronzeErrorIds.length} as ERROR`);
                await supabase.schema("bronze").from("transactions")
                    .update({ status: 'error', error_message: errorMsg || 'Batch update failed' })
                    .in('id', bronzeErrorIds);
            }

            if (bronzeProcessedIds.length > 0) {
                console.log(`[8.3] Marking ${bronzeProcessedIds.length} as PROCESSED`);
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
