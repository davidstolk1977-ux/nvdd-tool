export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.VITE_NEWSAPI_KEY;
  if (!key) return res.status(500).json({ error: "Geen API key gevonden" });

  const url = `https://api.mediastack.com/v1/news?access_key=${key}&countries=nl&languages=nl&limit=25&sort=published_desc`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    if (!data.data || data.data.length === 0) return res.status(500).json({ error: "Geen artikelen" });
    const items = data.data
      .filter(a => a.title)
      .map(a => `- ${a.title} (${a.source || "onbekend"}, ${a.published_at?.slice(0, 10) || ""})`);
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
