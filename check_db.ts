import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('settings').select('*').limit(1);
  if (error) {
    console.log("No settings table:", error.message);
  } else {
    console.log("Settings table exists!");
  }
  
  const { data: d2, error: e2 } = await supabase.from('platform_settings').select('*').limit(1);
  if (e2) {
    console.log("No platform_settings table:", e2.message);
  } else {
    console.log("platform_settings table exists!");
  }
}

check();
