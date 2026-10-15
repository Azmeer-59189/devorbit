import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let browserClient:SupabaseClient|undefined;
// Connection factory for the upcoming authenticated slice. The local preview
// deliberately does not send demo fixtures to a configured Supabase project.
export function createBrowserSupabase(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Supabase project URL and publishable key are not configured.');
  browserClient??=createClient(url,key);
  return browserClient;
}
