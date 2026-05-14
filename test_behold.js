import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'homepage_content').single();
  const url = data.value.branding.behold_url;
  console.log("Behold URL:", url);
  
  const res = await fetch(url);
  const json = await res.json();
  
  const posts = Array.isArray(json) ? json : json.posts;
  posts.slice(0, 10).forEach(p => {
    console.log(p.timestamp, p.permalink);
  });
}
main();
