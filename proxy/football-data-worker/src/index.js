const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
    },
  });

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env, context) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (!env.FOOTBALL_DATA_ORG_KEY) return json({ error: "Proxy is not configured" }, 503);
    const incoming = new URL(request.url);
    if (incoming.pathname !== "/matches") return json({ error: "Not found" }, 404);
    const dateFrom = incoming.searchParams.get("dateFrom");
    const dateTo = incoming.searchParams.get("dateTo");
    if (!dateFrom || !dateTo || !isoDate.test(dateFrom) || !isoDate.test(dateTo)) {
      return json({ error: "dateFrom and dateTo must be ISO dates" }, 400);
    }
    const from = Date.parse(`${dateFrom}T00:00:00Z`);
    const to = Date.parse(`${dateTo}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 86400000) {
      return json({ error: "Date range is invalid or too wide" }, 400);
    }
    const upstream = new URL("https://api.football-data.org/v4/matches");
    upstream.searchParams.set("dateFrom", dateFrom);
    upstream.searchParams.set("dateTo", dateTo);
    const cacheKey = new Request(incoming.toString(), { method: "GET" });
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const response = await fetch(upstream, {
      headers: { "X-Auth-Token": env.FOOTBALL_DATA_ORG_KEY },
    });
    const result = new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": response.ok ? "public, max-age=21600" : "no-store",
      },
    });
    if (response.ok) context.waitUntil(caches.default.put(cacheKey, result.clone()));
    return result;
  },
};
