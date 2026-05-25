import { useState, useEffect } from "react";

const VANDAAG = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6.
De toon is direct, opiniërend en informeel — voor de gewone man.
Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal.
Scherp, eerlijk, herkenbaar. De kijker denkt: "eindelijk zegt iemand het."
Huidig kabinet: kabinet-Jetten (D66, VVD, CDA), premier Rob Jetten, sinds 23 februari 2026.`;

async function fetchNieuws() {
  const rss = "https://www.nu.nl/rss/algemeen";
  const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;
  const res = await fetch(proxy);
  const data = await res.json();
  if (!data.items || data.items.length === 0) throw new Error("Geen nieuws");
  return data.items
    .slice(0, 20)
    .map(item => `- ${item.title} (Nu.nl, ${item.pubDate?.slice(0, 10) || ""})`)
    .join("\n");
}

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const TOPICS_PROMPT = (name, background, nieuws, ronde, eigenInput) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

Actueel nieuws van vandaag (automatisch opgehaald van Nu.nl):
${nieuws}

${eigenInput ? `Eigen sturing van de redactie (prioriteit — houd hier rekening mee bij de onderwerpen):
${eigenInput}` : ""}

Gast: ${name}
Achtergrond/expertise: ${background}

${ronde > 1 ? `Dit is ronde ${ronde} — geef 4 ANDERE onderwerpen dan eerder, vanuit een andere invalshoek.` : ""}

Kies 4 onderwerpen die passen bij deze gast en bij het profiel van het programma. Koppel elk onderwerp aan een concreet nieuwsfeit. Geen vage thema's.

Geef ALLEEN een JSON-array terug, niets anders. Geen uitleg, geen markdown, geen backticks.

[{"titel":"...","omschrijving":"...","profiel":"...","bron":"Bron zoals vermeld in het nieuws"}]`;

const PREP_PROMPT = (name, background, topic, topicDesc) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

Gast: ${name} — ${background}
Onderwerp: ${topic}
Context: ${topicDesc}

Geef ALLEEN een JSON-object terug, niets anders. Geen uitleg, geen markdown, geen backticks.

{"pr_intro":"Introtekst presentator: 2-3 zinnen, direct en prikkelend voor de gewone man, eindig met haakje naar de gast.","intro_beeld":"Beeldinstructie regisseur: wat zien we op beeld, sfeer of studio-opstelling.","grafisch":["Suggestie 1","Suggestie 2","Suggestie 3"],"gesprekslijnen":[{"vraag":"Eerste vraag","toelichting":"Wat moet eruit komen?"},{"vraag":"Tweede vraag","toelichting":"Waarom belangrijk voor ons profiel?"},{"vraag":"Derde vraag","toelichting":"Wat andere media niet vragen"},{"vraag":"Vierde vraag","toelichting":"Verdieping of stelling voorleggen"},{"vraag":"Afsluiter","toelichting":"Laat de gast iets zeggen dat blijft hangen."}]}`;

function extractJSON(text) {
  const start1 = text.indexOf('[');
  const end1 = text.lastIndexOf(']');
  if (start1 !== -1 && end1 !== -1 && end1 > start1) {
    try { return JSON.parse(text.slice(start1, end1 + 1)); } catch {}
  }
  const start2 = text.indexOf('{');
  const end2 = text.lastIndexOf('}');
  if (start2 !== -1 && end2 !== -1 && end2 > start2) {
    try { return JSON.parse(text.slice(start2, end2 + 1)); } catch {}
  }
  throw new Error(`Kon JSON niet verwerken: ${text.slice(0, 150)}`);
}

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API fout ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return extractJSON(text);
}

const C = {
  bg: "#0f0f0f", surface: "#181818", border: "#2a2a2a",
  red: "#e8251a", redDark: "#6b100a", white: "#f0ede8",
  muted: "#888", dim: "#444",
};

const inp = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  color: C.white, padding: "11px 13px", fontSize: 14,
  fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box",
};

export default function App() {
  const [name, setName] = useState("");
  const [bg, setBg] = useState("");
  const [nieuws, setNieuws] = useState("");
  const [eigenInput, setEigenInput] = useState("");
  const [nieuwsStatus, setNieuwsStatus] = useState("laden");
  const [topics, setTopics] = useState(null);
  const [sel, setSel] = useState(null);
  const [prep, setPrep] = useState(null);
  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);

  useEffect(() => {
    fetchNieuws()
      .then(n => { setNieuws(n); setNieuwsStatus("ok"); })
      .catch(() => setNieuwsStatus("fout"));
  }, []);

  const canGo = name.trim().length > 1 && bg.trim().length > 4 && nieuwsStatus === "ok";

  const doTopics = async (r) => {
    if (!canGo || loadT) return;
    setLoadT(true); setTopics(null); setSel(null); setPrep(null); setErr("");
    try { setTopics(await callClaude(TOPICS_PROMPT(name, bg, nieuws, r, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  const doNieuweRonde = () => {
    const r = ronde + 1;
    setRonde(r);
    doTopics(r);
  };

  const doPrep = async (t) => {
    if (loadP) return;
    setSel(t); setPrep(null); setLoadP(true); setErr("");
    try { setPrep(await callClaude(PREP_PROMPT(name, bg, t.titel, t.omschrijving))); }
    catch (e) { setErr(e.message); }
    setLoadP(false);
  };

  const reset = () => { setName(""); setBg(""); setEigenInput(""); setTopics(null); setSel(null); setPrep(null); setErr(""); setRonde(1); };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: 2, color: C.red, textTransform: "uppercase" }}>Nieuws van de Dag</span>
            <span style={{ fontSize: 10, letterSpacing: 4, color: C.muted, fontFamily: "monospace", textTransform: "uppercase" }}>SBS6</span>
          </div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 3, marginTop: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Redactietool · {VANDAAG}</div>
        </div>
        {(name || topics) && (
          <button onClick={reset} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Nieuw</button>
        )}
      </div>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "36px 22px" }}>

        <Lbl>01 — Nieuws van vandaag</Lbl>
        <div style={{ fontSize: 12, color: nieuwsStatus === "ok" ? C.muted : nieuwsStatus === "fout" ? C.red : C.muted, marginBottom: 16, fontFamily: "monospace" }}>
          {nieuwsStatus === "laden" && "⏳ Nieuws ophalen van Nu.nl..."}
          {nieuwsStatus === "ok" && "✓ Actueel nieuws geladen van Nu.nl"}
          {nieuwsStatus === "fout" && "⚠ Kon nieuws niet ophalen — probeer de pagina te verversen"}
        </div>

        <Fld label="Eigen input / sturing (optioneel)">
          <textarea
            value={eigenInput}
            onChange={e => { setEigenInput(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
            placeholder={"Bijv: we willen het hebben over de stijgende huurprijzen, of: gast heeft net een boek uit over immigratie"}
            style={{ ...inp, minHeight: 70, resize: "vertical", lineHeight: 1.6 }}
          />
        </Fld>

        <div style={{ height: 24 }} />

        <Lbl>02 — Gast invoeren</Lbl>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
          <Fld label="Naam gast">
            <input value={name} onChange={e => { setName(e.target.value); setTopics(null); setSel(null); setPrep(null); }} placeholder="bijv. Wierd Duk" style={inp} />
          </Fld>
          <Fld label="Achtergrond / expertise">
            <input value={bg} onChange={e => { setBg(e.target.value); setTopics(null); setSel(null); setPrep(null); }} placeholder="bijv. Journalist De Telegraaf, schrijft over migratie en veiligheid" style={inp} />
          </Fld>
        </div>
        <button onClick={() => doTopics(1)} disabled={!canGo || loadT}
          style={{ background: canGo && !loadT ? C.red : C.redDark, border: "none", color: C.white, padding: "11px 26px", fontSize: 10, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: canGo && !loadT ? "pointer" : "not-allowed" }}>
          {loadT ? "Bezig..." : "Genereer actuele onderwerpen →"}
        </button>

        {err && (
          <div style={{ marginTop: 16, color: C.red, fontSize: 11, fontFamily: "monospace", padding: "10px 14px", border: `1px solid ${C.redDark}`, background: "#1a0808", wordBreak: "break-all" }}>
            ⚠ {err}
          </div>
        )}

        {topics && (
          <div style={{ marginTop: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Lbl>03 — Kies een onderwerp</Lbl>
              <button onClick={doNieuweRonde} disabled={loadT}
                style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: loadT ? "not-allowed" : "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                {loadT ? "Bezig..." : "↺ Andere onderwerpen"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {topics.map((t, i) => {
                const active = sel?.titel === t.titel;
                return (
                  <div key={i} onClick={() => doPrep(t)}
                    style={{ background: active ? "#1e0a08" : C.surface, border: `1px solid ${active ? C.red : C.border}`, padding: 18, cursor: "pointer" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? C.red : C.white, marginBottom: 8, lineHeight: 1.4 }}>{t.titel}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>{t.omschrijving}</div>
                    {t.bron && <div style={{ fontSize: 10, color: C.dim, fontFamily: "monospace", marginBottom: 10 }}>📰 {t.bron}</div>}
                    <div style={{ fontSize: 10, color: C.red, fontFamily: "monospace", lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>↗ {t.profiel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loadP && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "monospace", fontSize: 10, letterSpacing: 3, textTransform: "uppercase" }}>Gespreksopzet wordt opgebouwd...</div>}

        {prep && sel && (
          <div style={{ marginTop: 36 }}>
            <Lbl>04 — Gespreksopzet</Lbl>
            <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{sel.titel}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{name} · {bg}</div>
            </div>

            <Blk label="PR — Introtekst presentator">
              <div style={{ fontSize: 15, lineHeight: 1.8, fontStyle: "italic" }}>"{prep.pr_intro}"</div>
            </Blk>

            <Blk label="Beeld — Instructie regisseur">
              <div style={{ fontSize: 13, lineHeight: 1.7, color: C.muted }}>{prep.intro_beeld}</div>
            </Blk>

            <Blk label="Grafisch / foto's">
              {prep.grafisch?.map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <span style={{ color: C.red, fontFamily: "monospace", fontSize: 10, minWidth: 20, paddingTop: 2 }}>#{i + 1}</span>
                  <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{g}</span>
                </div>
              ))}
            </Blk>

            <Blk label="Gesprekslijnen">
              {prep.gesprekslijnen?.map((g, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${i === prep.gesprekslijnen.length - 1 ? C.red : C.border}`, paddingLeft: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{g.vraag}</div>
                  <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, fontFamily: "monospace" }}>{g.toelichting}</div>
                </div>
              ))}
            </Blk>
          </div>
        )}
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 4, color: "#e8251a", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
}
function Fld({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "#888", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Blk({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#e8251a", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ background: "#181818", border: "1px solid #2a2a2a", padding: "15px 18px" }}>{children}</div>
    </div>
  );
}
