export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.VITE_NEWSAPI_KEY;

  // Debug: log what we have
  if (!key) {
    return res.status(500).json({ error: "Geen API key gevonden in environment", env_keys: Object.keys(process.env).filter(k => k.includes('NEWS') || k.includes('API')) });
  }

  const cats = req.query.cats ? req.query.cats.split(",") : ["binnenland", "economie", "buitenland"];

  const catToKeywords = {
    binnenland: "nederland",
    economie: "economie",
    buitenland: "internationaal",
    entertainment: "entertainment",
    koningshuis: "koningshuis",
    sport: "sport",
    opmerkelijk: "opmerkelijk",
  };

  const keywords = cats.map(c => catToKeywords[c] || "nederland").join(" OR ");
  const url = `https://api.mediastack.com/v1/news?access_key=${key}&countries=nl&languages=nl&limit=20&sort=published_desc`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).json({ error: "Kon response niet parsen", raw: text.slice(0, 300) }); }

    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error), raw: text.slice(0, 300) });
    if (!data.data || data.data.length === 0) return res.status(500).json({ error: "Geen artikelen", raw: text.slice(0, 300) });

    const items = data.data
      .filter(a => a.title)
      .map(a => `- ${a.title} (${a.source || "onbekend"}, ${a.published_at?.slice(0, 10) || ""})`);

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
