/**
 * Shared response utilities to ensure consistency across all routes.
 */

/**
 * Creates a JSON response with proper headers including CORS.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
