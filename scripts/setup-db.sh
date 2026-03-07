#!/usr/bin/env bash
# Run after you've set DATABASE_URL and DIRECT_URL in .env with your Supabase password.
# Get connection strings: https://supabase.com/dashboard/project/valzrbhtbwhrqwecgrpg/settings/database

set -e
cd "$(dirname "$0")/.."

if grep -q '\[YOUR-PASSWORD\]' .env 2>/dev/null; then
  echo "❌ Replace [YOUR-PASSWORD] (and [REGION] if needed) in .env with your Supabase database password."
  echo ""
  echo "1. Open: https://supabase.com/dashboard/project/valzrbhtbwhrqwecgrpg/settings/database"
  echo "2. Under 'Connection string', copy the 'URI' for Session mode → DATABASE_URL"
  echo "3. Copy 'Direct connection' URI → DIRECT_URL"
  echo "4. Paste both into .env (replace the existing DATABASE_URL and DIRECT_URL lines)"
  echo "5. Run: npm run db:setup"
  exit 1
fi

echo "Pushing schema to Supabase..."
npx prisma db push

echo "Seeding database..."
npm run db:seed

echo "✅ Done. Run: npm run dev"
