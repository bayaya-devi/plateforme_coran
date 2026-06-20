// On importe l'outil Supabase (Ici via un lien CDN, parfait pour du JavaScript classique)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 1. Collez votre URL ici (gardez bien les guillemets ' ' )
const supabaseUrl = 'https://mdgofogpghlwesaduxrq.supabase.co';

// 2. Collez votre Anon Key ici (gardez bien les guillemets ' ' )
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZ29mb2dwZ2hsd2VzYWR1eHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIwNjksImV4cCI6MjA5NzQzODA2OX0.DpBoUIZbxzKjOOWw4r-7Vhtupva_fIg5cEhcKgb19ic';

// 3. On crée et on exporte la connexion
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
