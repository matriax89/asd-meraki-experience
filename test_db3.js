import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await supabase.from('site_settings').select('*').eq('key', 'branding').single();
  console.log("Branding row:", data);
  const { data: cData } = await supabase.from('site_settings').select('*').eq('key', 'homepage_content').single();
  console.log("Content branding:", cData.value.branding);
}
main();
