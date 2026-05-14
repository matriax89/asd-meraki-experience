import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: cData } = await supabase.from('site_settings').select('*').eq('key', 'homepage_content').single();
  const beholdUrl = cData.value.branding?.behold_url;
  console.log("Current Behold URL:", beholdUrl);
  
  if (beholdUrl) {
    console.log("Fetching Behold URL...");
    const res = await fetch(beholdUrl);
    const json = await res.json();
    let rawPosts = Array.isArray(json) ? json : (json.posts || []);
    console.log(`Fetched ${rawPosts.length} posts.`);
    if (rawPosts.length > 0) {
      console.log(rawPosts.slice(0, 5).map(p => ({
        id: p.id,
        timestamp: p.timestamp,
        mediaType: p.mediaType || p.media_type,
        caption: (p.caption || '').substring(0, 30)
      })));
    }
  }
}
main();
