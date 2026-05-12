import { Client } from 'pg';
import * as fs from 'fs';

async function applyMigration() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });

  try {
    await client.connect();
    console.log("Connected to local Supabase Postgres!");
    
    const query = `
      CREATE TABLE IF NOT EXISTS public.site_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      -- Default insert
      INSERT INTO public.site_settings (key, value)
      VALUES (
        'homepage_cards', 
        '{"masterclass_image": "/images/v2/aerial_glow.png"}'::jsonb
      )
      ON CONFLICT (key) DO NOTHING;
    `;
    
    await client.query(query);
    console.log("Table site_settings created and seeded successfully.");
    
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.end();
  }
}

applyMigration();
