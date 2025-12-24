
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    // We don't throw error on build time to allow static generation if needed, 
    // but warn in console.
    console.warn('Missing Supabase Environment Variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
