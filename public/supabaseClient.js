import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const SUPABASE_URL = 'https://dsixyagewoaleyyhygsh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzaXh5YWdld29hbGV5eWh5Z3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMjA1NzksImV4cCI6MjA3MzU5NjU3OX0.cxPkJHgYvGNEYjMsTB9K0jf6mCFxC37E0oP3XMk8cwk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);