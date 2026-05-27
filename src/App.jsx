import { useState, useEffect } from "react";

const VANDAAG = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6.
De toon is direct, opiniërend en informeel — voor de gewone man.
Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal.
Scherp, eerlijk, herkenbaar. De kijker denkt: "eindelijk zegt iemand het."
Huidig kabinet: kabinet-Jetten (D66, VVD, CDA), premier Rob Jetten, sinds 23 februari 2026.`;

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const CATEGORIEEN = [
  { id: "binnenland", label: "Binnenland / Asiel", feed: "https://www.nu.nl/rss/binnenland" },
  { id: "economie", label: "Economie / Ondernemerschap", feed: "https://www.nu.nl/rss/economie" },
  { id: "buitenland", label: "Buitenland / VS", feed: "https://www.nu.nl/rss/buitenland" },
  { id: "entertainment", label: "Entertainment / Show", feed: "https://www.nu.nl/rss/entertainment" },
  { id: "koningshuis", label: "Koningshuis", feed: "https://www.nu.nl/rss/royals" },
  { id: "sport", label: "Sport", feed: "https://www.nu.nl/rss/sport" },
  { id: "opmerkelijk", label: "Opmerkelijk", feed: "https://www.nu.nl/rss/opmerkelijk" },
];

async function fetchNieuwsCategorie(feed) {
  const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&count=10`;
  const res = await fetch(proxy);
  const data = await res.json();
  if (!data.items) return [];
  return data.items
    .filter(a => a.title && a.title !== "[Removed]")
    .slice(0, 8)
    .map(item => `- ${item.title} (Nu.nl, ${item.pubDate?.slice(0, 10) || ""})`);
}

async function fetchNieuws(geselecteerd) {
  const feeds = CATEGORIEEN.filter(c => geselecteerd.includes(c.id)).map(c => c.feed);
  if (feeds.length === 0) throw new Error("Selecteer minimaal één categorie");
  const results = await Promise.all(feeds.map(fetchNieuwsCategorie));
  const items = results.flat();
  if (items.length === 0) throw new Error("Geen nieuws opgehaald");
  return items.join("\n");
}

const TOPICS_PROMPT = (name, background, nieuws, ronde, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

Actueel nieuws van vandaag:
${nieuws}

${eigenInput ? `Eigen sturing van de redactie (geef hier prioriteit aan):
${eigenInput}` : ""}

Gast: ${name}
Achtergrond/expertise: ${background}

${ronde > 1 ? `Dit is ronde ${ronde} — bedenk 4 compleet ANDERE invalshoeken dan eerder.` : ""}

Jouw taak: gebruik het nieuws als springplank. Bedenk 4 ORIGINELE gespreksonderwerpen die:
- NIET de kop letterlijk herhalen, maar er een scherpe invalshoek op vinden
- Meerdere nieuwsfeiten mogen combineren tot één onderwerp
- Passen bij de expertise van deze specifieke gast
- Zeggen wat andere media niet zeggen of niet durven
- De gewone kijker raken — herkenbaar, direct, opiniërend

Denk in stellingen, spanningsvelden, tegenstrijdigheden. Niet "wat vindt u van X" maar "waarom doet niemand Y terwijl iedereen X ziet."

Geef ALLEEN een JSON-array terug, niets anders. Geen uitleg, geen markdown, geen backticks.

[{"titel":"Pakkende stelling of vraag (max 8 woorden)","omschrijving":"Wat is de werkelijke kern — het nieuwsfeit plus de scherpe invalshoek die wij kiezen.","profiel":"Wat zegt Nieuws van de Dag hierover wat andere media weglaten of niet durven?","bron":"Welk nieuwsfeit of welke feiten liggen hieraan ten grondslag?"}]`;

const PREP_PROMPT = (name, background, topic, topicDesc, voorgesprek, andereGasten) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

Gast: ${name} — ${background}
${andereGasten ? `Andere gasten in dit item: ${andereGasten}` : ""}
Onderwerp: ${topic}
Context: ${topicDesc}
${voorgesprek ? `\nVoorgesprek redacteur met gast — verwerk de antwoorden letterlijk:\n${voorgesprek}` : ""}

Maak een gespreksopzet EXACT in dit format van Thomas van Groningen (presentator SBS6):

PRES
[aankondigingstekst — direct en prikkelend voor de gewone man, eindigend met haakje naar het gesprek]

[segmentnummer] INSTART [NAAM SEGMENT IN HOOFDLETTERS]
(( [naam gast in hoofdletters]: "bulletpoint — wat de gast zegt, niet wat je vraagt"
[naam gast]: "volgend punt"

@ [korte overgang of nieuwe richting in het gesprek]
[naam gast]: "antwoord op die richting"

BV: [BEELDVULLER IN HOOFDLETTERS EN VET — dit staat WEL in de autocue]

[naam andere gast indien aanwezig]: "wat die gast zegt" ))

[segmentnummer] INSTART [NAAM VOLGEND SEGMENT]
(( ... ))

BV [BEELDVULLER] — apart op nieuwe regel, vetgedrukt, GEEN haakjes

(( [segmentnummer] OVERSTART [LOCATIE OF AFSLUITING] ))

REGELS:
- Alles wat NIET in de autocue hoeft staat tussen (( ))
- Beeldvullertekst (BV:) staat WEL in de autocue — geen haakjes eromheen
- Schrijf ANTWOORDEN, geen vragen — Thomas weet wat de gast zegt, vragen komen vanzelf
- @ markeert een overgang of nieuwe richting in het gesprek
- Segmentnummers beginnen bij 91
- Als er een voorgesprek is: verwerk de antwoorden letterlijk als bulletpoints
- Geef ook 4 concrete beeldsuggesties apart onderaan

Geef ALLEEN een JSON-object terug, niets anders. Geen markdown, geen backticks.

{"pres":"De PRES-aankondigingstekst","segmenten":[{"nummer":91,"label":"INSTART NAAM SEGMENT","inhoud":"(( GAST: \"bulletpoint wat gast zegt\"\n\nGAST: \"volgend punt\"\n\n@ Overgang\nGAST: \"antwoord\"\n\nBV: BEELDVULLER IN HOOFDLETTERS ))"}],"beeldvullers":["BV NAAM — aparte beeldvuller","BV NAAM 2"],"overstart":"(( 94 OVERSTART LOCATIE OF AFSLUITING ))","beeld":["Beeldsuggestie 1 — concreet en monteerbaar","Suggestie 2","Suggestie 3","Suggestie 4"]}`;

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
  bg: "#faf8f5", surface: "#ffffff", border: "#e0dbd4",
  red: "#c82016", redDark: "#8c1510", white: "#1a1a1a",
  muted: "#555", dim: "#999",
};

const inp = {
  width: "100%", background: "#fff", border: `1px solid ${C.border}`,
  color: "#1a1a1a", padding: "11px 13px", fontSize: 13,
  fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", fontSize: 15,
};

export default function App() {
  const [name, setName] = useState("");
  const [bg, setBg] = useState("");
  const [voorgesprek, setVoorgesprek] = useState("");
  const [andereGasten, setAndereGasten] = useState("");
  const [nieuws, setNieuws] = useState("");
  const [eigenInput, setEigenInput] = useState("");
  const [nieuwsStatus, setNieuwsStatus] = useState("idle");
  const [geselecteerd, setGeselecteerd] = useState(["binnenland", "economie", "buitenland"]);
  const [topics, setTopics] = useState(null);
  const [sel, setSel] = useState(null);
  const [prep, setPrep] = useState(null);
  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);

  const laadNieuws = (cats) => {
    const te_laden = cats || geselecteerd;
    setNieuwsStatus("laden");
    fetchNieuws(te_laden)
      .then(n => { setNieuws(n); setNieuwsStatus("ok"); })
      .catch(() => setNieuwsStatus("fout"));
  };

  useEffect(() => { laadNieuws(["binnenland", "economie", "buitenland"]); }, []);

  const canGo = name.trim().length > 1 && bg.trim().length > 4 && nieuws.trim().length > 10;

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

  const doSelectTopic = (t) => {
    setSel(t); setPrep(null); setErr("");
  };

  const doPrep = async () => {
    if (!sel || loadP) return;
    setPrep(null); setLoadP(true); setErr("");
    try { setPrep(await callClaude(PREP_PROMPT(name, bg, sel.titel, sel.omschrijving, voorgesprek, andereGasten))); }
    catch (e) { setErr(e.message); }
    setLoadP(false);
  };

  const reset = () => { setName(""); setBg(""); setEigenInput(""); setVoorgesprek(""); setAndereGasten(""); setTopics(null); setSel(null); setPrep(null); setErr(""); setRonde(1); };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: C.red, textTransform: "uppercase" }}>Nieuws van de Dag</span>
            <span style={{ fontSize: 10, letterSpacing: 4, color: C.muted, fontFamily: "monospace", textTransform: "uppercase" }}>SBS6</span>
          </div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 3, marginTop: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Redactietool · {VANDAAG}</div>
        </div>
        {(name || topics) && (
          <button onClick={reset} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Nieuw</button>
        )}
      </div>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "36px 22px" }}>

        {/* NIEUWS */}
        <Lbl>01 — Nieuws van vandaag</Lbl>

        {/* CATEGORIE CHECKBOXES */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {CATEGORIEEN.map(c => {
            const aan = geselecteerd.includes(c.id);
            return (
              <div key={c.id} onClick={() => {
                const nieuw = aan ? geselecteerd.filter(x => x !== c.id) : [...geselecteerd, c.id];
                setGeselecteerd(nieuw);
              }} style={{ padding: "6px 14px", border: `1px solid ${aan ? C.red : C.border}`, background: aan ? "#fff0ee" : "#fff", color: aan ? C.red : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "Georgia, serif", borderRadius: 2 }}>
                {c.label}
              </div>
            );
          })}
          <button onClick={laadNieuws} disabled={nieuwsStatus === "laden"}
            style={{ padding: "6px 14px", background: C.red, border: "none", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}>
            {nieuwsStatus === "laden" ? "Laden..." : "↺ Ophalen"}
          </button>
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontFamily: "monospace" }}>
          {nieuwsStatus === "idle" && "Selecteer categorieën en klik ophalen"}
          {nieuwsStatus === "laden" && "⏳ Nieuws ophalen van Nu.nl..."}
          {nieuwsStatus === "ok" && "✓ Geladen — verwijder wat niet relevant is, voeg toe wat mist"}
          {nieuwsStatus === "fout" && "⚠ Kon nieuws niet ophalen — typ zelf koppen in"}
        </div>
        <textarea
          value={nieuws}
          onChange={e => { setNieuws(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
          style={{ ...inp, minHeight: 160, resize: "vertical", lineHeight: 1.7 }}
          placeholder="Nieuws wordt automatisch geladen na selectie van categorieën..."
        />

        <div style={{ height: 16 }} />

        {/* EIGEN STURING */}
        <Lbl>Eigen sturing / idee (optioneel)</Lbl>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontFamily: "monospace" }}>
          Geef richting mee — een onderwerp, invalshoek of iets wat de gast net heeft gedaan
        </div>
        <textarea
          value={eigenInput}
          onChange={e => { setEigenInput(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
          placeholder="Bijv: we willen het hebben over stijgende huurprijzen, of: gast heeft net een boek uit over immigratie"
          style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6 }}
        />

        <div style={{ height: 28 }} />

        {/* GAST */}
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

        <div style={{ height: 28 }} />

        {/* VOORGESPREK */}
        <Lbl>03 — Voorgesprek & andere gasten (optioneel)</Lbl>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, fontFamily: "monospace" }}>
          Vul dit in nadat je een onderwerp gekozen hebt — wordt verwerkt in de opzet
        </div>
        <Fld label="Voorgesprek redacteur met gast">
          <textarea
            value={voorgesprek}
            onChange={e => setVoorgesprek(e.target.value)}
            placeholder={"Bijv:\nR: Wat vind je van de nieuwe huurwet?\nG: Ik denk dat het averechts werkt, huurders zijn er slechter af\nR: Waarom?\nG: Omdat verhuurders massaal stoppen..."}
            style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }}
          />
        </Fld>
        <div style={{ height: 12 }} />
        <Fld label="Andere gasten in het item (optioneel)">
          <input
            value={andereGasten}
            onChange={e => setAndereGasten(e.target.value)}
            placeholder="bijv. Verslaggever Suzette Nesselaar vanuit Den Haag"
            style={inp}
          />
        </Fld>

        {sel && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 10 }}>
              Geselecteerd: <span style={{ color: C.red }}>{sel.titel}</span>
            </div>
            <button onClick={doPrep} disabled={loadP}
              style={{ background: !loadP ? C.red : C.redDark, border: "none", color: C.white, padding: "11px 26px", fontSize: 10, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: !loadP ? "pointer" : "not-allowed" }}>
              {loadP ? "Bezig..." : "Genereer gespreksopzet →"}
            </button>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 16, color: C.red, fontSize: 11, fontFamily: "monospace", padding: "10px 14px", border: `1px solid ${C.redDark}`, background: "#fff0f0", wordBreak: "break-all" }}>
            ⚠ {err}
          </div>
        )}

        {/* ONDERWERPEN */}
        {topics && (
          <div style={{ marginTop: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Lbl>04 — Kies een onderwerp</Lbl>
              <button onClick={doNieuweRonde} disabled={loadT}
                style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: loadT ? "not-allowed" : "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                {loadT ? "Bezig..." : "↺ Andere onderwerpen"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {topics.map((t, i) => {
                const active = sel?.titel === t.titel;
                return (
                  <div key={i} onClick={() => doSelectTopic(t)}
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

        {/* GESPREKSOPZET */}
        {prep && sel && (
          <div style={{ marginTop: 36 }}>
            <Lbl>05 — Gespreksopzet</Lbl>
            <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{sel.titel}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{name}{andereGasten ? ` · ${andereGasten}` : ""}</div>
            </div>

            <Blk label="PRES">
              <div style={{ fontSize: 16, lineHeight: 1.9, color: "#1a1a1a", fontWeight: 500 }}>{prep.pres}</div>
            </Blk>

            {prep.segmenten?.map((s, i) => (
              <Blk key={i} label={`${s.nummer} ${s.label}`}>
                <div style={{ fontSize: 15, lineHeight: 2.0, whiteSpace: "pre-wrap", color: "#333" }}>{s.inhoud}</div>
              </Blk>
            ))}

            {prep.beeldvullers?.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                {prep.beeldvullers.map((b, i) => (
                  <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 6 }}>{b}</div>
                ))}
              </div>
            )}

            {prep.overstart && (
              <div style={{ fontSize: 13, color: C.muted, fontFamily: "monospace", marginBottom: 22 }}>{prep.overstart}</div>
            )}

            {prep.beeld?.length > 0 && (
              <Blk label="Beeld — Suggesties voor opnames">
                {prep.beeld.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <span style={{ color: C.red, fontFamily: "monospace", fontSize: 10, minWidth: 20, paddingTop: 2 }}>#{i + 1}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: C.muted }}>{b}</span>
                  </div>
                ))}
              </Blk>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: 3, color: "#c82016", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
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
      <div style={{ background: "#ffffff", border: "1px solid #e0dbd4", padding: "18px 22px", fontSize: 15, lineHeight: 1.9 }}>{children}</div>
    </div>
  );
}
