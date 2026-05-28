export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const cats = req.query.cats ? req.query.cats.split(",") : ["binnenland", "economie", "buitenland"];

  const catToKeywords = {
    binnenland: "nederland politiek",
    economie: "economie nederland bedrijven",
    buitenland: "buitenland internationaal",
    entertainment: "entertainment showbizz celebrities",
    koningshuis: "koningshuis royals nederland",
    sport: "sport nederland",
    opmerkelijk: "opmerkelijk nieuws nederland",
  };

  const keywords = cats.map(c => catToKeywords[c] || "nederland").join(" OR ");
  const key = process.env.VITE_NEWSAPI_KEY;
  const url = `https://api.mediastack.com/v1/news?access_key=${key}&countries=nl&languages=nl&keywords=${encodeURIComponent(keywords)}&limit=25&sort=published_desc`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!data.data || data.data.length === 0) throw new Error(JSON.stringify(data));
    const items = data.data
      .filter(a => a.title)
      .map(a => `- ${a.title} (${a.source || "onbekend"}, ${a.published_at?.slice(0, 10) || ""})`);
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
