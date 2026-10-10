// Cloudflare Worker: /api/* requests ko Render backend par forward karta hai.
// Baaki sab (frontend files) Cloudflare ke static assets se serve hote hain.
const BACKEND = "https://buydo.onrender.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, BACKEND);
    const headers = new Headers(request.headers);
    headers.delete("host");
    const upstream = await fetch(
      new Request(target.toString(), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      }),
    );
    return new Response(upstream.body, upstream);
  },
};
