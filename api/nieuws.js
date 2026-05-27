export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const feeds = {
    binnenland: "https://www.nu.nl/rss/binnenland",
    economie: "https://www.nu.nl/rss/economie",
    buitenland: "https://www.nu.nl/rss/buitenland",
    entertainment: "https://www.nu.nl/rss/entertainment",
    koningshuis: "https://www.nu.nl/rss/royals",
    sport: "https://www.nu.nl/rss/sport",
    opmerkelijk: "https://www.nu.nl/rss/opmerkelijk",
  };

  const cats = req.query.cats ? req.query.cats.split(",") : ["binnenland", "economie", "buitenland"];
  const selectedFeeds = cats.map(c => feeds[c]).filter(Boolean);

  try {
    const results = await Promise.all(
      selectedFeeds.map(async (url) => {
        const r = await fetch(url);
        const text = await r.text();
        const items = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
          .slice(1, 9)
          .map(m => m[1].trim());
        const dates = [...text.matchAll(/<pubDate>(.*?)<\/pubDate>/g)]
          .slice(1, 9)
          .map(m => m[1].trim().slice(0, 16));
        return items.map((title, i) => `- ${title} (Nu.nl, ${dates[i] || ""})`);
      })
    );

    const items = results.flat();
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
