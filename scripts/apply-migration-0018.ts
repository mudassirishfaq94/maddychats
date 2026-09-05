import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env BEFORE importing db module
config({ path: resolve(__dirname, '../.env') });

// Dynamically import db after env is loaded
async function main() {
  const { db } = await import('../src/db/index.js');
  
  const sql = readFileSync('./drizzle/0018_background_position.sql', 'utf8');
  
  // Remove comments
  const cleaned = sql.replace(/--.*$/gm, '');
  
  // Split by semicolons, handling multi-line statements
  const statements = cleaned
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  console.log(`Executing ${statements.length} statements...`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Remove trailing semicolons
    const cleanStmt = stmt.replace(/;+$/, '').trim();
    if (!cleanStmt) continue;
    
    try {
      await db.execute(cleanStmt);
      console.log(`[${i + 1}/${statements.length}] OK: ${cleanStmt.substring(0, 80)}...`);
    } catch (e: any) {
      console.error(`[${i + 1}/${statements.length}] Failed: ${cleanStmt.substring(0, 80)}...`);
      console.error('Error:', e.message);
    }
  }
  
  console.log('Migration complete');
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
