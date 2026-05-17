require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.time('fetch');
  const { data, error } = await supabase.from('site_settings').select('*').limit(1);
  console.timeEnd('fetch');
  console.log('Error:', error);
  console.log('Data:', data ? 'Got data' : 'No data');
}

test();
