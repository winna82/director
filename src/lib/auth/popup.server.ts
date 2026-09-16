export async function handleAuthPopupRequest(request: Request): Promise<Response> {
  return new Response("popup unavailable", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
