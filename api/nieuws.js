export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.VITE_NEWSAPI_KEY;
  if (!key) return res.status(500).json({ error: "Geen API key gevonden" });

  const catMap = {
    binnenland: "general",
    asiel: "general",
    economie: "business",
    buitenland: "general",
    entertainment: "entertainment",
    koningshuis: "entertainment",
    sport: "sports",
  };

  const cats = req.query.cats ? req.query.cats.split(",") : ["binnenland", "economie", "buitenland"];
  const mediaCategories = [...new Set(cats.map(c => catMap[c] || "general"))].join(",");

  const url = `https://api.mediastack.com/v1/news?access_key=${key}&countries=nl&languages=nl&categories=${mediaCategories}&limit=10&sort=published_desc`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).json({ error: "Parse fout", raw: text.slice(0, 200) }); }
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
