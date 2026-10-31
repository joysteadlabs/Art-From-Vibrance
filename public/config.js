/* Art From Vibrance: connection settings. Edit THIS file on GitHub (docs/config.js) — no rebuild needed.
   All three values are public (safe in git). Never put the service_role / secret key here.
   While supabaseUrl or supabaseKey is empty, the site runs as a PREVIEW: sample paintings, nothing is saved.
   api (the payments Worker) is optional: leave it empty until payments are set up. */
window.GALLERY_CONFIG = {
  api: '',          // optional, payments: the Worker address, e.g. 'https://art-from-vibrance.YOURNAME.workers.dev'
  supabaseUrl: '',  // Supabase → Project Settings → API → Project URL, e.g. 'https://abcd.supabase.co'
  supabaseKey: '',  // Supabase → Project Settings → API → publishable (anon) key
};
