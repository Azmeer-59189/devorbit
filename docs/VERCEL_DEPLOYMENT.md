# Vercel deployment

Production: https://devorbit-eight.vercel.app

Vercel project: `azmeer/devorbit`, linked to `Azmeer-59189/devorbit` on GitHub.

The first deployment uploads the current local workspace, including changes that have not yet been committed. Commit and push those changes before relying on GitHub deployments to reproduce this version.

Production environment variables are configured privately in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `DEVORBIT_APP_URL=https://devorbit-eight.vercel.app`

In Supabase → Authentication → URL Configuration, set the Site URL to `https://devorbit-eight.vercel.app` and add `https://devorbit-eight.vercel.app/join**` to Redirect URLs for invitation callbacks. Retain localhost redirect entries if needed for local development. This dashboard setting is separate from the deployed environment variables.

Apply database migrations through 016 to the existing Supabase project; Vercel does not apply SQL migrations. Deployment keeps using the same Supabase database.

To deploy the local workspace again, run `npx vercel --prod` from the repository. Environment-variable changes require a new deployment. Local `.env` files and `.local` are excluded from upload by `.vercelignore`.
