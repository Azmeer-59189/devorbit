// Time management has been removed from DevOrbit. Historical database records are retained.
function removed() {
  return Response.json(
    {error: 'Time management is no longer available in DevOrbit.'},
    {status: 410, headers: {'Cache-Control': 'no-store'}},
  );
}
export const GET = removed;
export const POST = removed;
export const PATCH = removed;
