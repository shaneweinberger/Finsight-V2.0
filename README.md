# FinSight V2.0

AI-powered personal finance dashboard built with React, Supabase, and Google Gemini.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **AI**: Google Gemini (via Edge Functions)
- **Styling**: Tailwind CSS

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Set the following secrets in your Supabase Dashboard (Edge Function Secrets):
- `GEMINI_API_KEY` — Your Google AI Studio API key

## Edge Function Deployment

> **⚠️ IMPORTANT**: Always deploy with `--no-verify-jwt` to avoid 401 Unauthorized errors. The function uses the service role key internally for database access.

```bash
# Deploy the AI processing function
supabase functions deploy process-transactions --no-verify-jwt
```

If you forget `--no-verify-jwt`, the Supabase gateway will reject requests with a 401 before the function code even runs.

## Database Migrations

Migrations are in `supabase/migrations/`. Since we use Supabase Cloud (no local Docker), apply migrations manually via the **SQL Editor** in the Supabase Dashboard.

To reset test data:
```sql
TRUNCATE TABLE bronze.transactions CASCADE;
TRUNCATE TABLE public.silver_transactions CASCADE;
NOTIFY pgrst, 'reload schema';
```

## Project Structure

```
src/
├── components/dashboard/
│   ├── Overview.jsx          # Financial dashboard with charts & editable transactions
│   ├── TransactionUploads.jsx # CSV upload, AI processing, file history
│   └── Rules.jsx             # User-defined categorization rules
├── lib/
│   └── supabaseClient.js     # Supabase client initialization
supabase/
├── functions/
│   └── process-transactions/  # Gemini-powered categorization Edge Function
├── migrations/                # Database schema migrations
└── config.toml                # Supabase local config
```
