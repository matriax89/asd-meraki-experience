import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJh...' // Wait, I shouldn't need anon key for local if I use service role key, but let's just use the `.env.local`
);

async function main() {
  const { data, error } = await supabase.from('courses').select('nome, instructor_id, team_members(nome, cognome), schedule_slots(istruttore_id, giorno, ora_inizio, ora_fine)');
  console.log(JSON.stringify(data, null, 2));
  console.log('Error:', error);
}
main();
