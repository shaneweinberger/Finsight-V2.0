
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
        // (In a real high-scale system, we might process one user per invocation or use queues)
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
                supabase.from("llm_prompts").select("prompt_text").eq("is_active", true).single(), // Get active system prompt
                supabase.from("user_rules").select("*").eq("user_id", userId).eq("is_active", true),
                supabase.from("user_categories").select("name").eq("user_id", userId),
            ]);

            const basePrompt = promptsRes.data?.prompt_text || "Categorize these transactions.";
            const rules = rulesRes.data || [];
            const categories = categoriesRes.data?.map((c: { name: any; }) => c.name) || [];

            // B. Prepare Data Deterministically (Code-side)
            const transactionsToClassify = userTxs.map((tx: { raw_data: any; id: any; transaction_type: any; }) => {
                const raw = tx.raw_data;

                // Deterministic Parsing (Standard: Negative = Expenditure, Positive = Income)
                let amount = 0;

                // Handle TD Bank format (MoneyOut/MoneyIn)
                if (raw.MoneyOut && parseFloat(raw.MoneyOut.replace(/[^0-9.-]/g, '')) !== 0) {
                    // Expenditure: stored as Negative
                    amount = -1 * Math.abs(parseFloat(raw.MoneyOut.replace(/[^0-9.-]/g, '')));
                } else if (raw.MoneyIn && parseFloat(raw.MoneyIn.replace(/[^0-9.-]/g, '')) !== 0) {
                    // Income: stored as Positive
                    amount = Math.abs(parseFloat(raw.MoneyIn.replace(/[^0-9.-]/g, '')));
                }

                // Date Parsing (Assuming MM/DD/YYYY or similar, standardized to YYYY-MM-DD)
                const dateObj = new Date(raw.Date);
                const date = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                return {
                    id: tx.id,
                    description: raw.Description,
                    amount,
                    date,
                    transaction_type: amount < 0 ? 'Expenditure' : 'Income', // Money direction
                    transaction_method: tx.transaction_type // Source file type ('credit' or 'debit') from bronze
                };
            });

            console.log(`[3] Prepared ${transactionsToClassify.length} transactions for user ${userId}`);

            // C. Construct Prompt for Gemini (Categorization ONLY)
            const fullPrompt = `
        ${basePrompt}

        User Categories: ${JSON.stringify(categories)}
        
        User Rules: ${JSON.stringify(rules)}

        Transactions to Categorize:
        ${JSON.stringify(transactionsToClassify.map((t: { id: any; description: any; amount: any; }) => ({ id: t.id, description: t.description, amount: t.amount })))}

        Output a JSON array where each object has:
        - uuid: (the transaction id provided)
        - final_category: (selected category based on description and rules)
        - final_description: (cleaned up merchant name, e.g. "UBER *TRIP" -> "Uber")
      `;

            // C. Call Gemini
            console.log(`[4] Calling Gemini for user ${userId}...`);
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
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

            // D. Upsert to Silver
            console.log(`[6] Upserting ${Array.isArray(processedData) ? processedData.length : 0} items to silver...`);
            if (Array.isArray(processedData)) {
                for (const item of processedData) {
                    // Find the deterministic data
                    const codeData = transactionsToClassify.find((t: { id: any; }) => t.id === item.uuid);
                    if (!codeData) continue;

                    const { error: upsertError } = await supabase
                        .from("silver_transactions")
                        .upsert({
                            bronze_id: item.uuid,
                            user_id: userId,
                            description: item.final_description || codeData.description,
                            category: item.final_category,
                            amount: codeData.amount,
                            date: codeData.date,
                            transaction_type: codeData.transaction_type,     // 'Expenditure' or 'Income'
                            transaction_method: codeData.transaction_method, // 'credit' or 'debit'
                            processed_at: new Date().toISOString(),
                            is_edited: false
                        }, { onConflict: "bronze_id" });

                    if (upsertError) {
                        console.error("Upsert failed", upsertError);
                        await supabase.schema("bronze").from("transactions").update({ status: 'error', error_message: upsertError.message }).eq('id', item.uuid);
                    } else {
                        await supabase.schema("bronze").from("transactions").update({ status: 'processed' }).eq('id', item.uuid);
                    }
                }
            }
            results.push({ userId, processedCount: processedData ? processedData.length : 0 });
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
