/**
 * Frontend liveness endpoint.
 *
 * Returns exactly HTTP 200 with a tiny body when the Next.js server can serve
 * requests. It performs no work and never contacts the backend or the database,
 * so the frontend container stays healthy independently of the rest of the stack.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
