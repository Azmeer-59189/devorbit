export function GET() {
  return Response.json({
    application: 'IHHN DevDesk',
    status: 'ok',
    mode: 'connected-workspace',
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  });
}
