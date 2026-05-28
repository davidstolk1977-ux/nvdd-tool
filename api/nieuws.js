export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.VITE_NEWSAPI_KEY;
  if (!key) return res.status(500).json({ error: "Geen API key gevonden" });

  const cats = req.query.cats ? req.query.cats.split(",") : ["binnenland", "economie", "buitenland"];

  const catToKeywords = {
    binnenland: "nederland politiek",
    economie: "economie bedrijven",
    buitenland: "internationaal buitenland",
    entertainment: "entertainment celebrity",
    koningshuis: "koningshuis royals",
    sport: "sport voetbal",
    opmerkelijk: "opmerkelijk",
  };

  const keywords = cats.map(c => catToKeywords[c] || "nederland").join(",");
  const url = `https://api.mediastack.com/v1/news?access_key=${key}&countries=nl&languages=nl&keywords=${encodeURIComponent(keywords)}&limit=20&sort=published_desc`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).json({ error: "Parse fout", raw: text.slice(0, 300) }); }
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
