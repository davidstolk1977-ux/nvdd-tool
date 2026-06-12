import { useState, useEffect } from "react";

const VANDAAG = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const POLITIEKE_CONTEXT = `
ACTUELE POLITIEKE CONTEXT NEDERLAND (juni 2026):
- Kabinet: kabinet-Jetten (D66, VVD, CDA), aangetreden 23 februari 2026
- Premier: Rob Jetten (D66)
- Grootste partij in de Tweede Kamer: D66
- Coalitie: D66, VVD, CDA
- Oppositie: PVV (Wilders), GroenLinks-PvdA, NSC, BBB, SP
- Staatssecretaris asiel: Nora Achahbar (D66)
- Minister Financiën: Sigrid Kaag (D66)
- Minister Economie: Micky Adriaansens (VVD)`.trim();

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6.
De toon is direct, opiniërend en informeel — voor de gewone man.
Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal.
Scherp, eerlijk, herkenbaar. De kijker denkt: "eindelijk zegt iemand het."`;

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

// FLOW 1: Gast centraal — bedenk onderwerpen bij deze gast
const GAST_TOPICS_PROMPT = (name, background, nieuws, ronde, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Gast: ${name}
Achtergrond/expertise: ${background}

Actueel nieuws van vandaag (ter referentie):
${nieuws}

${eigenInput ? `!!EIGEN STURING — DIT IS HET VERTREKPUNT. Alle vier onderwerpen MOETEN hierop aansluiten:\n${eigenInput}\n` : ""}

${ronde > 1 ? `Dit is ronde ${ronde} — bedenk 4 compleet ANDERE onderwerpen dan eerder.` : ""}

Bedenk 4 ORIGINELE gespreksonderwerpen die perfect passen bij deze gast. Denk vanuit de gast: wat is zijn of haar sterkste punt, wat kan hij of zij zeggen wat anderen niet kunnen? Koppel dat aan actueel nieuws of een actueel thema.

De onderwerpen moeten:
- Passen bij de expertise en het profiel van deze specifieke gast
- Actueel zijn — gebaseerd op het nieuws van vandaag of een actueel maatschappelijk thema
- Scherp en opiniërend zijn — niet "wat vindt u van X" maar een stelling of spanningsveld
- Zeggen wat andere media niet zeggen

Geef ALLEEN een JSON-array terug, niets anders. Geen uitleg, geen markdown, geen backticks.

[{"titel":"Pakkende stelling of vraag (max 8 woorden)","omschrijving":"Wat is de kern en waarom past dit bij deze gast?","profiel":"Wat zegt Nieuws van de Dag hierover wat andere media weglaten?","bron":"Welk actueel nieuws of thema ligt hieraan ten grondslag?"}]`;

// FLOW 2: Onderwerp centraal — bedenk de beste gast
const ONDERWERP_GASTEN_PROMPT = (onderwerp, nieuws, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Onderwerp of nieuwsfeit: ${onderwerp}

Actueel nieuws van vandaag (ter referentie):
${nieuws}

${eigenInput ? `!!EIGEN STURING — DIT IS HET VERTREKPUNT. Houd hier rekening mee bij het kiezen van gasten:\n${eigenInput}\n` : ""}

Bedenk 4 gasten die perfect passen bij dit onderwerp. Denk aan bekende Nederlanders: journalisten, columnisten, experts, opiniemakers, ervaringsdeskundigen. Mensen die iets scherps kunnen zeggen wat anderen niet zeggen.

Per gast: wie zijn ze, waarom zijn zij DE beste keuze voor dit onderwerp, en wat is de insteek van het gesprek met hen.

Geef ALLEEN een JSON-array terug, niets anders. Geen uitleg, geen markdown, geen backticks.

[{"naam":"Volledige naam","omschrijving":"Wie is dit en wat is hun expertise?","waarom":"Waarom is dit DE beste gast voor dit onderwerp bij Nieuws van de Dag?","insteek":"Wat gaat dit gesprek opleveren — de scherpe invalshoek"}]`;

const PREP_PROMPT = (name, background, topic, topicDesc, voorgesprek, andereGasten) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Gast: ${name} — ${background}
${andereGasten ? `Andere gasten in dit item: ${andereGasten}` : ""}
Onderwerp: ${topic}
Context: ${topicDesc}
${voorgesprek ? `\nVoorgesprek redacteur met gast — verwerk de antwoorden letterlijk:\n${voorgesprek}` : ""}

Maak een gespreksopzet in het format van Thomas van Groningen (presentator SBS6).

BEGRIPPEN:
- INSTART = een filmfragment dat wordt ingezet
- INSTEEK = het gesprek met de gast in de studio

REGELS:
- Schrijf ANTWOORDEN, geen vragen
- Alles wat NIET in de autocue hoeft staat tussen (( ))
- Beeldvullertekst (BV:) staat WEL in de autocue — geen haakjes
- @ markeert een overgang in het gesprek
- Segmentnummers beginnen bij 91
- Verwerk voorgesprek letterlijk als bulletpoints

Geef ALLEEN een JSON-object terug, niets anders. Geen markdown, geen backticks.

{"pres":"PRES-aankondigingstekst: direct en prikkelend, eindigend met haakje naar het gesprek","segmenten":[{"nummer":91,"type":"INSTART","label":"NAAM FRAGMENT","inhoud":"(( beschrijving filmfragment ))"},{"nummer":92,"type":"INSTEEK","label":"NAAM INSTEEK","inhoud":"(( GASTNAAM: \\"wat de gast zegt\\"\\n\\nGAST: \\"volgend punt\\"\\n\\n@ Overgang\\nGAST: \\"antwoord\\"\\n\\nBV: BEELDVULLER ))"}],"beeldvullers":["BV NAAM"],"overstart":"(( 94 OVERSTART LOCATIE ))","beeld":["Beeldsuggestie 1","Suggestie 2","Suggestie 3","Suggestie 4"]}`;

const ONLINE_PROMPT = (onderwerp, omschrijving, pres, segmenten) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Schrijf een online samenvatting voor de digitale redactie op basis van dit item:

Onderwerp: ${onderwerp}
Omschrijving: ${omschrijving}
PRES-tekst: ${pres}
Gesprek: ${(segmenten || []).map(s => s.inhoud).join(" ")}

Schrijf:
1. Een prikkelende kop (max 12 woorden, met een quote of stelling erin als het kan)
2. Een samenvatting van 3-4 zinnen — direct, helder, geen tv-jargon, in de stijl van Nieuws van de Dag

VOORBEELDEN:
Kop: Onthullende documentaire over FvD: 'Waarom kijkt Nederland hier nu pas van op?'
Samenvatting: Het land is in de ban van de documentaire over Forum voor Democratie. Antisemitisme, minachting naar vrouwen, machtsmisbruik. Bram Moszkowicz schrok van de antisemitische uitspraken. Volgens FvD-watcher Chris Aalberts is de vraag niet wat er in de documentaire zit, maar waarom Nederland hier nu pas van opkijkt.

Geef ALLEEN een JSON-object terug, geen markdown, geen backticks.
{"kop":"De kop hier","samenvatting":"De samenvatting hier"}`;

function extractJSON(text) {
  const s1 = text.indexOf('['), e1 = text.lastIndexOf(']');
  if (s1 !== -1 && e1 > s1) { try { return JSON.parse(text.slice(s1, e1 + 1)); } catch {} }
  const s2 = text.indexOf('{'), e2 = text.lastIndexOf('}');
  if (s2 !== -1 && e2 > s2) { try { return JSON.parse(text.slice(s2, e2 + 1)); } catch {} }
  throw new Error(`Kon JSON niet verwerken: ${text.slice(0, 150)}`);
}

async function callClaude(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`API fout ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return extractJSON((d.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
}

function exportOpzet(prep, sel, name, andereGasten, online) {
  const lines = [
    `NIEUWS VAN DE DAG — SBS6`, `${VANDAAG}`, ``,
    `ONDERWERP: ${sel?.titel || ""}`,
    `GAST: ${name}${andereGasten ? ` / ${andereGasten}` : ""}`, ``, `---`, ``, `PRES`, ``,
    prep.pres, ``, `---`, ``,
    ...(prep.segmenten || []).flatMap(s => [`${s.nummer} ${s.type} ${s.label}`, ``, s.inhoud, ``, `---`, ``]),
    ...(prep.beeldvullers || []), ``, prep.overstart || "", ``, `---`, ``, `BEELD`, ``,
    ...(prep.beeld || []).map((b, i) => `${i + 1}. ${b}`),
    ``, `---`, ``, `ONLINE`, ``,
    online ? `${online.kop}\n\n${online.samenvatting}` : "(nog niet gegenereerd)",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opzet-${name.toLowerCase().replace(/\s/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const C = {
  bg: "#10152e", surface: "#1a2040", surfaceLight: "#222a4a",
  border: "#2a3560", cyan: "#7dd4d4", cyanDark: "#4aacac",
  white: "#ffffff", muted: "#8899bb", dim: "#445577",
};

const inp = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  color: C.white, padding: "12px 14px", fontSize: 15,
  fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box",
};

export default function App() {
  const [tab, setTab] = useState("nieuw");
  const [flow, setFlow] = useState("gast"); // "gast" of "onderwerp"

  // Gedeeld
  const [nieuws, setNieuws] = useState("");
  const [nieuwsStatus, setNieuwsStatus] = useState("laden");

  // Flow 1: gast centraal
  const [gastNaam, setGastNaam] = useState("");
  const [gastBg, setGastBg] = useState("");
  const [gastTopics, setGastTopics] = useState(null);

  // Flow 2: onderwerp centraal
  const [onderwerp, setOnderwerp] = useState("");
  const [gastSuggesties, setGastSuggesties] = useState(null);
  const [gekozenGast, setGekozenGast] = useState(null);

  // Gespreksopzet (gedeeld)
  const [sel, setSel] = useState(null);
  const [voorgesprek, setVoorgesprek] = useState("");
  const [andereGasten, setAndereGasten] = useState("");
  const [prep, setPrep] = useState(null);
  const [online, setOnline] = useState(null);

  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [loadO, setLoadO] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);
  const [eigenInput, setEigenInput] = useState("");

  const [gasten, setGasten] = useState(() => { try { return JSON.parse(localStorage.getItem("nvdd_gasten") || "[]"); } catch { return []; } });
  const [nieuweGast, setNieuweGast] = useState({ naam: "", achtergrond: "" });
  const [geschiedenis, setGeschiedenis] = useState(() => { try { return JSON.parse(localStorage.getItem("nvdd_geschiedenis") || "[]"); } catch { return []; } });

  const laadNieuws = () => {
    setNieuwsStatus("laden");
    fetch("/api/nieuws")
      .then(r => r.json())
      .then(d => { if (d.items) { setNieuws(d.items.slice(0, 10).join("\n")); setNieuwsStatus("ok"); } else { setNieuwsStatus("fout"); } })
      .catch(() => setNieuwsStatus("fout"));
  };

  useEffect(() => { laadNieuws(); }, []);

  const resetOpzet = () => { setSel(null); setPrep(null); setOnline(null); setErr(""); setVoorgesprek(""); setAndereGasten(""); };

  const resetAll = () => {
    setGastNaam(""); setGastBg(""); setGastTopics(null);
    setOnderwerp(""); setGastSuggesties(null); setGekozenGast(null);
    setRonde(1); setEigenInput(""); resetOpzet();
  };

  // Flow 1: genereer onderwerpen bij gast
  const doGastTopics = async (r) => {
    if (!gastNaam.trim() || !gastBg.trim() || loadT) return;
    setLoadT(true); setGastTopics(null); resetOpzet(); setErr("");
    try { setGastTopics(await callClaude(GAST_TOPICS_PROMPT(gastNaam, gastBg, nieuws, r || 1, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  // Flow 2: genereer gastensuggesties bij onderwerp
  const doOnderwerpGasten = async () => {
    if (!onderwerp.trim() || loadT) return;
    setLoadT(true); setGastSuggesties(null); setGekozenGast(null); resetOpzet(); setErr("");
    try { setGastSuggesties(await callClaude(ONDERWERP_GASTEN_PROMPT(onderwerp, nieuws, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  // Gespreksopzet genereren
  const doPrep = async () => {
    const naam = flow === "gast" ? gastNaam : gekozenGast?.naam || "";
    const bg = flow === "gast" ? gastBg : gekozenGast?.omschrijving || "";
    if (!sel || !naam || loadP) return;
    setPrep(null); setOnline(null); setLoadP(true); setErr("");
    try {
      const p = await callClaude(PREP_PROMPT(naam, bg, sel.titel || sel.naam, sel.omschrijving || sel.insteek, voorgesprek, andereGasten));
      setPrep(p);
      const item = { id: Date.now(), datum: VANDAAG, gast: naam, onderwerp: sel.titel || sel.naam, prep: p, sel };
      const updated = [item, ...geschiedenis].slice(0, 20);
      setGeschiedenis(updated);
      localStorage.setItem("nvdd_geschiedenis", JSON.stringify(updated));
    } catch (e) { setErr(e.message); }
    setLoadP(false);
  };

  const doOnline = async () => {
    if (!prep || loadO) return;
    setLoadO(true); setErr("");
    try { setOnline(await callClaude(ONLINE_PROMPT(sel?.titel || sel?.naam || "", sel?.omschrijving || sel?.insteek || "", prep.pres, prep.segmenten))); }
    catch (e) { setErr(e.message); }
    setLoadO(false);
  };

  const slaGastOp = () => {
    if (!nieuweGast.naam.trim()) return;
    const updated = [...gasten, { ...nieuweGast, id: Date.now() }];
    setGasten(updated);
    localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
    setNieuweGast({ naam: "", achtergrond: "" });
  };

  const huidigNaam = flow === "gast" ? gastNaam : gekozenGast?.naam || "";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #0d1228 0%, #1a2040 50%, #0d1a35 100%)", borderBottom: `1px solid ${C.border}`, padding: "0 28px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.cyan, letterSpacing: 1, lineHeight: 1 }}>Nieuws van de Dag</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 4, marginTop: 3, fontFamily: "monospace", textTransform: "uppercase" }}>Redactietool · SBS6 · {VANDAAG}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["nieuw", "gasten", "geschiedenis"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ background: tab === t ? C.cyan : "transparent", border: `1px solid ${tab === t ? C.cyan : C.border}`, color: tab === t ? C.bg : C.muted, padding: "6px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                {t === "nieuw" ? "Nieuw item" : t === "gasten" ? "Gasten" : "Geschiedenis"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "36px 28px" }}>

        {/* TAB: GASTEN */}
        {tab === "gasten" && (
          <div>
            <Lbl>Gastendatabase</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <Fld label="Naam"><input value={nieuweGast.naam} onChange={e => setNieuweGast(g => ({ ...g, naam: e.target.value }))} placeholder="bijv. Wierd Duk" style={inp} /></Fld>
              <Fld label="Achtergrond"><input value={nieuweGast.achtergrond} onChange={e => setNieuweGast(g => ({ ...g, achtergrond: e.target.value }))} placeholder="bijv. Journalist De Telegraaf, migratie" style={inp} /></Fld>
            </div>
            <Btn onClick={slaGastOp}>+ Gast opslaan</Btn>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              {gasten.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen gasten opgeslagen.</div>}
              {gasten.map(g => (
                <div key={g.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div><div style={{ fontWeight: 700, fontSize: 15 }}>{g.naam}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{g.achtergrond}</div></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setGastNaam(g.naam); setGastBg(g.achtergrond); setFlow("gast"); setTab("nieuw"); }} style={{ background: C.cyan, border: "none", color: C.bg, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>Gebruik</button>
                    <button onClick={() => { const u = gasten.filter(x => x.id !== g.id); setGasten(u); localStorage.setItem("nvdd_gasten", JSON.stringify(u)); }} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: GESCHIEDENIS */}
        {tab === "geschiedenis" && (
          <div>
            <Lbl>Opgeslagen opzetten</Lbl>
            {geschiedenis.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen opzetten gegenereerd.</div>}
            {geschiedenis.map(item => (
              <div key={item.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 10, cursor: "pointer" }}
                onClick={() => { setPrep(item.prep); setSel(item.sel); setGastNaam(item.gast); setTab("nieuw"); }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.cyan }}>{item.onderwerp}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{item.gast} · {item.datum}</div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: NIEUW ITEM */}
        {tab === "nieuw" && (
          <div>

            {/* FLOW SWITCHER */}
            <div style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: `1px solid ${C.border}` }}>
              {[
                { id: "gast", label: "Vertrekpunt: gast", sub: "Ik heb een gast — bedenk onderwerpen" },
                { id: "onderwerp", label: "Vertrekpunt: onderwerp", sub: "Ik heb een onderwerp — wie is de beste gast?" }
              ].map(f => (
                <button key={f.id} onClick={() => { setFlow(f.id); resetAll(); }}
                  style={{ flex: 1, background: "none", border: "none", borderBottom: flow === f.id ? `3px solid ${C.cyan}` : "3px solid transparent", padding: "14px 20px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: flow === f.id ? C.cyan : C.muted, fontFamily: "Georgia, serif" }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3, fontFamily: "monospace" }}>{f.sub}</div>
                </button>
              ))}
            </div>

            {/* NIEUWS — altijd zichtbaar als achtergrond */}
            <details style={{ marginBottom: 28 }}>
              <summary style={{ fontSize: 10, letterSpacing: 3, color: C.dim, fontFamily: "monospace", textTransform: "uppercase", cursor: "pointer", marginBottom: 8 }}>
                Nieuws van vandaag (achtergrond) — {nieuwsStatus === "ok" ? "✓ geladen" : nieuwsStatus === "laden" ? "laden..." : "⚠ fout"}
                <button onClick={e => { e.preventDefault(); laadNieuws(); }} style={{ marginLeft: 12, background: "none", border: `1px solid ${C.dim}`, color: C.dim, padding: "2px 8px", cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>↺</button>
              </summary>
              <textarea value={nieuws} onChange={e => setNieuws(e.target.value)}
                style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6, fontSize: 13, marginTop: 8 }}
                placeholder="Nieuws wordt automatisch geladen..." />
            </details>

            {/* FLOW 1: GAST CENTRAAL */}
            {flow === "gast" && (
              <div>
                <Lbl>01 — Gast invoeren</Lbl>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
                  <Fld label="Naam gast"><input value={gastNaam} onChange={e => { setGastNaam(e.target.value); setGastTopics(null); resetOpzet(); }} placeholder="bijv. Wierd Duk" style={inp} /></Fld>
                  <Fld label="Achtergrond / expertise"><input value={gastBg} onChange={e => { setGastBg(e.target.value); setGastTopics(null); resetOpzet(); }} placeholder="bijv. Journalist De Telegraaf, schrijft over migratie" style={inp} /></Fld>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#445577", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>Eigen sturing / insteek (optioneel)</div>
                  <textarea value={eigenInput} onChange={e => setEigenInput(e.target.value)}
                    placeholder="Geef een richting of insteek mee — de tool houdt hier rekening mee"
                    style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6, fontSize: 13 }} />
                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                  <Btn onClick={() => doGastTopics(1)} disabled={!gastNaam.trim() || !gastBg.trim() || loadT}>{loadT ? "Bezig..." : "Bedenk onderwerpen voor deze gast →"}</Btn>
                  {gastTopics && <BtnSec onClick={resetAll}>Nieuw</BtnSec>}
                </div>

                {gastTopics && (
                  <div style={{ marginTop: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <Lbl>02 — Kies een onderwerp</Lbl>
                      <button onClick={() => { const r = ronde + 1; setRonde(r); doGastTopics(r); }} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>↺ Andere onderwerpen</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {gastTopics.map((t, i) => {
                        const active = sel?.titel === t.titel;
                        return (
                          <div key={i} onClick={() => { setSel(t); setPrep(null); setOnline(null); }}
                            style={{ background: active ? "#0d2a2a" : C.surface, border: `1px solid ${active ? C.cyan : C.border}`, padding: 18, cursor: "pointer" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.cyan : C.white, marginBottom: 8, lineHeight: 1.4 }}>{t.titel}</div>
                            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>{t.omschrijving}</div>
                            {t.bron && <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", marginBottom: 10 }}>📰 {t.bron}</div>}
                            <div style={{ fontSize: 11, color: C.cyan, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>↗ {t.profiel}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FLOW 2: ONDERWERP CENTRAAL */}
            {flow === "onderwerp" && (
              <div>
                <Lbl>01 — Onderwerp invoeren</Lbl>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>Plak een ANP-bericht, een nieuwskop of beschrijf het onderwerp</div>
                <textarea value={onderwerp} onChange={e => { setOnderwerp(e.target.value); setGastSuggesties(null); setGekozenGast(null); resetOpzet(); }}
                  placeholder={"Bijv: statushouders worden niet gehuisvest door gemeenten, 12.000 mensen zitten vast in azc's\n\nOf plak hier een ANP-bericht..."}
                  style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }} />
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#445577", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>Eigen sturing / insteek (optioneel)</div>
                  <textarea value={eigenInput} onChange={e => setEigenInput(e.target.value)}
                    placeholder="Geef een richting of insteek mee — de tool houdt hier rekening mee"
                    style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6, fontSize: 13 }} />
                </div>
                                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <Btn onClick={doOnderwerpGasten} disabled={!onderwerp.trim() || loadT}>{loadT ? "Bezig..." : "Wie is de beste gast? →"}</Btn>
                  {gastSuggesties && <BtnSec onClick={resetAll}>Nieuw</BtnSec>}
                </div>

                {gastSuggesties && (
                  <div style={{ marginTop: 32 }}>
                    <Lbl>02 — Kies een gast</Lbl>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {gastSuggesties.map((g, i) => {
                        const active = gekozenGast?.naam === g.naam;
                        return (
                          <div key={i} onClick={() => { setGekozenGast(g); setSel({ titel: onderwerp.slice(0, 60), omschrijving: g.insteek }); setPrep(null); setOnline(null); }}
                            style={{ background: active ? "#0d2a2a" : C.surface, border: `1px solid ${active ? C.cyan : C.border}`, padding: 18, cursor: "pointer" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.cyan : C.white, marginBottom: 6 }}>{g.naam}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>{g.omschrijving}</div>
                            <div style={{ fontSize: 12, color: active ? C.cyan : C.muted, marginBottom: 10, lineHeight: 1.5, fontStyle: "italic" }}>{g.insteek}</div>
                            <div style={{ fontSize: 11, color: C.cyan, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>↗ {g.waarom}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VOORGESPREK + OPZET — beide flows */}
            {sel && (flow === "gast" || gekozenGast) && (
              <div style={{ marginTop: 36 }}>
                <Lbl>0{flow === "gast" ? "3" : "3"} — Voorgesprek & andere gasten (optioneel)</Lbl>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Vul dit in vóór je de opzet genereert</div>
                <Fld label="Voorgesprek redacteur met gast">
                  <textarea value={voorgesprek} onChange={e => setVoorgesprek(e.target.value)}
                    placeholder={"R: Wat vind je van X?\nG: Ik denk dat...\nR: Waarom?\nG: Omdat..."}
                    style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }} />
                </Fld>
                <div style={{ height: 12 }} />
                <Fld label="Andere gasten (optioneel)">
                  <input value={andereGasten} onChange={e => setAndereGasten(e.target.value)} placeholder="bijv. Verslaggever Suzette Nesselaar vanuit Den Haag" style={inp} />
                </Fld>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                    Gast: <span style={{ color: C.cyan, fontWeight: 700 }}>{huidigNaam}</span>
                    {sel.titel && <span> — Onderwerp: <span style={{ color: C.cyan, fontWeight: 700 }}>{sel.titel}</span></span>}
                  </div>
                  <Btn onClick={doPrep} disabled={loadP}>{loadP ? "Bezig..." : "Genereer gespreksopzet →"}</Btn>
                </div>
              </div>
            )}

            {loadP && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "monospace", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Opzet wordt opgebouwd...</div>}

            {err && <div style={{ marginTop: 16, color: "#ff6b6b", fontSize: 12, fontFamily: "monospace", padding: "10px 14px", border: "1px solid #ff4444", background: "#1a0808" }}>⚠ {err}</div>}

            {/* GESPREKSOPZET */}
            {prep && sel && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <Lbl>04 — Gespreksopzet</Lbl>
                  <button onClick={() => exportOpzet(prep, sel, huidigNaam, andereGasten, online)}
                    style={{ background: C.cyan, border: "none", color: C.bg, padding: "8px 18px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase", fontWeight: 700 }}>
                    ↓ Download
                  </button>
                </div>
                <div style={{ borderLeft: `3px solid ${C.cyan}`, paddingLeft: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{sel.titel}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{huidigNaam}{andereGasten ? ` · ${andereGasten}` : ""} · {VANDAAG}</div>
                </div>

                <Blk label="PRES"><div style={{ fontSize: 16, lineHeight: 1.9, fontWeight: 500, color: C.white }}>{prep.pres}</div></Blk>

                {prep.segmenten?.map((s, i) => (
                  <Blk key={i} label={`${s.nummer} ${s.type} ${s.label}`}>
                    <div style={{ fontSize: 15, lineHeight: 2.0, whiteSpace: "pre-wrap", color: "#ccdaee" }}>{s.inhoud}</div>
                  </Blk>
                ))}

                {prep.beeldvullers?.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    {prep.beeldvullers.map((b, i) => <div key={i} style={{ fontSize: 15, fontWeight: 700, color: C.white, marginBottom: 6 }}>{b}</div>)}
                  </div>
                )}

                {prep.overstart && <div style={{ fontSize: 14, color: C.muted, fontFamily: "monospace", marginBottom: 22 }}>{prep.overstart}</div>}

                {prep.beeld?.length > 0 && (
                  <Blk label="Beeld — Suggesties">
                    {prep.beeld.map((b, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <span style={{ color: C.cyan, fontFamily: "monospace", fontSize: 11, minWidth: 22 }}>#{i + 1}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.55, color: C.muted }}>{b}</span>
                      </div>
                    ))}
                  </Blk>
                )}

                <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <Lbl>05 — Online samenvatting</Lbl>
                    <Btn onClick={doOnline} disabled={loadO}>{loadO ? "Bezig..." : "Genereer online tekst →"}</Btn>
                  </div>
                  {online ? (
                    <div style={{ background: C.surfaceLight, border: `1px solid ${C.cyan}`, padding: "20px 22px" }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.white, marginBottom: 12, lineHeight: 1.4 }}>{online.kop}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.8, color: "#ccdaee" }}>{online.samenvatting}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.dim, fontFamily: "monospace" }}>Klik op de knop om een kop en samenvatting voor de online redactie te genereren.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 4, color: "#7dd4d4", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
}
function Fld({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "#445577", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Blk({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#7dd4d4", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ background: "#222a4a", border: "1px solid #2a3560", padding: "18px 22px" }}>{children}</div>
    </div>
  );
}
function Btn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: disabled ? "#2a3560" : "#7dd4d4", border: "none", color: disabled ? "#445577" : "#10152e", padding: "12px 28px", fontSize: 11, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700 }}>
      {children}
    </button>
  );
}
function BtnSec({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: "none", border: "1px solid #2a3560", color: "#445577", padding: "12px 20px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase" }}>
      {children}
    </button>
  );
}
