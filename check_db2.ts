import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
  const { data, error } = await supabase.rpc('get_tables');
  console.log("RPC Error:", error?.message);
  
  // Fallback if RPC doesn't exist
  if (error) {
    const { data: d2, error: e2 } = await supabase.from('site_settings').select('*').limit(1);
    console.log("site_settings:", e2 ? e2.message : "Exists");
  }
}

listTables();
