import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_LANGUAGES = ['en', 'de', 'es', 'fr', 'ja', 'zh'];

async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || text.trim() === '') return text;
  
  // Google Translate Free Web API
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  
  try {
    const response = await fetch(url);
    const json = await response.json();
    return json[0].map((item: any) => item[0]).join('');
  } catch (error) {
    console.error(`Error translating to ${targetLang}:`, error);
    return text; // fallback to original
  }
}

async function translateJsonbField(fieldValue: any): Promise<any> {
  if (!fieldValue || typeof fieldValue !== 'object') return fieldValue;
  
  const itText = fieldValue.it;
  if (!itText) return fieldValue;

  const result = { ...fieldValue };

  for (const lang of TARGET_LANGUAGES) {
    // Only translate if empty or doesn't exist
    if (!result[lang] || result[lang].trim() === '') {
      console.log(`    Translating to ${lang}...`);
      if (Array.isArray(itText)) {
         result[lang] = await Promise.all(itText.map(t => translateText(t, lang)));
      } else {
         result[lang] = await translateText(itText, lang);
      }
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return result;
}

async function processTable(tableName: string, jsonbColumns: string[]) {
  console.log(`\nProcessing table: ${tableName}`);
  
  const { data: rows, error } = await supabase.from(tableName).select('*');
  
  if (error) {
    console.error(`Error fetching ${tableName}:`, error);
    return;
  }

  console.log(`Found ${rows.length} records in ${tableName}`);

  for (const row of rows) {
    console.log(`\n  Record: ${row.id}`);
    
    let needsUpdate = false;
    const updates: any = {};

    for (const col of jsonbColumns) {
      if (row[col]) {
        console.log(`  Field: ${col}`);
        const translated = await translateJsonbField(row[col]);
        
        // Very basic deep equality check
        if (JSON.stringify(translated) !== JSON.stringify(row[col])) {
          updates[col] = translated;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', row.id);
        
      if (updateError) {
        console.error(`    Failed to update record ${row.id}:`, updateError);
      } else {
        console.log(`    Successfully updated record ${row.id}`);
      }
    } else {
      console.log(`    No translation updates needed.`);
    }
  }
}

async function main() {
  console.log("Starting database translation script...");
  
  await processTable('courses', ['nome', 'descrizione_breve', 'descrizione_lunga', 'benefici', 'attrezzatura_richiesta']);
  await processTable('events', ['titolo', 'sottotitolo', 'descrizione']);
  await processTable('products', ['nome', 'descrizione_breve', 'descrizione_lunga', 'specifiche']);
  
  console.log("\nTranslation completed!");
}

main().catch(console.error);
