const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT data_type FROM information_schema.columns WHERE table_name = 'schedule_slots' AND column_name = 'sede';" });
  console.log('RPC Result:', data, error);
}
main();
