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
- Minister Economie: Micky Adriaansens (VVD)
`.trim();

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6.
De toon is direct, opiniërend en informeel — voor de gewone man.
Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal.
Scherp, eerlijk, herkenbaar. De kijker denkt: "eindelijk zegt iemand het."`;

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const CATEGORIEEN = [
  { id: "binnenland", label: "Binnenland" },
  { id: "asiel", label: "Asiel & Migratie" },
  { id: "economie", label: "Economie" },
  { id: "buitenland", label: "Buitenland" },
  { id: "entertainment", label: "Show & Entertainment" },
  { id: "koningshuis", label: "Koningshuis" },
  { id: "sport", label: "Sport" },
];

const TOPICS_PROMPT = (name, background, nieuws, ronde, eigenInput, cats) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Actueel nieuws van vandaag:
${nieuws}

${eigenInput ? `Eigen sturing van de redactie (prioriteit):\n${eigenInput}` : ""}

Gast: ${name}
Achtergrond/expertise: ${background}

Geselecteerde categorieën — gebruik ALLEEN nieuws uit deze categorieën: ${cats.join(", ")}
Negeer nieuws dat niet in deze categorieën valt. Als er geen relevant nieuws is in de geselecteerde categorieën, zeg dat dan eerlijk.

${ronde > 1 ? `Dit is ronde ${ronde} — bedenk 4 compleet ANDERE invalshoeken dan eerder.` : ""}

Gebruik het nieuws als springplank. Bedenk 4 ORIGINELE gespreksonderwerpen die:
- ALLEEN gebaseerd zijn op nieuws uit de geselecteerde categorieën
- NIET de kop letterlijk herhalen maar er een scherpe invalshoek op vinden
- Passen bij de expertise van deze specifieke gast
- Zeggen wat andere media niet zeggen of niet durven
- De gewone kijker raken — herkenbaar, direct, opiniërend

Geef ALLEEN een JSON-array terug, niets anders. Geen uitleg, geen markdown, geen backticks.

[{"titel":"Pakkende stelling of vraag (max 8 woorden)","omschrijving":"Het nieuwsfeit plus de scherpe invalshoek.","profiel":"Wat zegt Nieuws van de Dag wat andere media weglaten?","bron":"Welk nieuwsfeit ligt hieraan ten grondslag?"}]`;

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

function exportOpzet(prep, sel, name, andereGasten) {
  const lines = [
    `NIEUWS VAN DE DAG — SBS6`, `${VANDAAG}`, ``,
    `ONDERWERP: ${sel.titel}`,
    `GAST: ${name}${andereGasten ? ` / ${andereGasten}` : ""}`, ``, `---`, ``, `PRES`, ``,
    prep.pres, ``, `---`, ``,
    ...(prep.segmenten || []).flatMap(s => [`${s.nummer} ${s.type} ${s.label}`, ``, s.inhoud, ``, `---`, ``]),
    ...(prep.beeldvullers || []), ``,
    prep.overstart || "", ``, `---`, ``, `BEELD`, ``,
    ...(prep.beeld || []).map((b, i) => `${i + 1}. ${b}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opzet-${name.toLowerCase().replace(/\s/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Kleuren gebaseerd op Nieuws van de Dag huisstijl
const C = {
  bg: "#10152e",
  surface: "#1a2040",
  surfaceLight: "#222a4a",
  border: "#2a3560",
  cyan: "#7dd4d4",
  cyanDark: "#4aacac",
  white: "#ffffff",
  muted: "#8899bb",
  dim: "#445577",
};

const inp = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.white,
  padding: "12px 14px",
  fontSize: 15,
  fontFamily: "Georgia, serif",
  outline: "none",
  boxSizing: "border-box",
};

export default function App() {
  const [tab, setTab] = useState("nieuw");
  const [name, setName] = useState("");
  const [bg, setBg] = useState("");
  const [nieuws, setNieuws] = useState("");
  const [nieuwsStatus, setNieuwsStatus] = useState("laden");
  const [eigenInput, setEigenInput] = useState("");
  const [geselecteerdeCats, setGeselecteerdeCats] = useState(["binnenland", "economie", "buitenland"]);
  const [voorgesprek, setVoorgesprek] = useState("");
  const [andereGasten, setAndereGasten] = useState("");
  const [topics, setTopics] = useState(null);
  const [sel, setSel] = useState(null);
  const [prep, setPrep] = useState(null);
  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);

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

  const toggleCat = (id) => {
    setGeselecteerdeCats(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const slaGastOp = () => {
    if (!nieuweGast.naam.trim()) return;
    const updated = [...gasten, { ...nieuweGast, id: Date.now() }];
    setGasten(updated);
    localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
    setNieuweGast({ naam: "", achtergrond: "" });
  };

  const canGo = name.trim().length > 1 && bg.trim().length > 4 && nieuws.trim().length > 20;

  const doTopics = async (r) => {
    if (!canGo || loadT) return;
    setLoadT(true); setTopics(null); setSel(null); setPrep(null); setErr("");
    const catLabels = CATEGORIEEN.filter(c => geselecteerdeCats.includes(c.id)).map(c => c.label);
    try { setTopics(await callClaude(TOPICS_PROMPT(name, bg, nieuws, r, eigenInput, catLabels))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  const doPrep = async () => {
    if (!sel || loadP) return;
    setPrep(null); setLoadP(true); setErr("");
    try {
      const p = await callClaude(PREP_PROMPT(name, bg, sel.titel, sel.omschrijving, voorgesprek, andereGasten));
      setPrep(p);
      const item = { id: Date.now(), datum: VANDAAG, gast: name, onderwerp: sel.titel, prep: p, sel };
      const updated = [item, ...geschiedenis].slice(0, 20);
      setGeschiedenis(updated);
      localStorage.setItem("nvdd_geschiedenis", JSON.stringify(updated));
    } catch (e) { setErr(e.message); }
    setLoadP(false);
  };

  const reset = () => { setName(""); setBg(""); setTopics(null); setSel(null); setPrep(null); setErr(""); setVoorgesprek(""); setAndereGasten(""); setRonde(1); setEigenInput(""); };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #0d1228 0%, #1a2040 50%, #0d1a35 100%)", borderBottom: `1px solid ${C.border}`, padding: "0 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Logo tekst */}
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: C.cyan, letterSpacing: 1, lineHeight: 1, fontFamily: "Georgia, serif" }}>
                Nieuws van de Dag
              </div>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 4, marginTop: 3, fontFamily: "monospace", textTransform: "uppercase" }}>
                Redactietool · SBS6 · {VANDAAG}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["nieuw", "gasten", "geschiedenis"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ background: tab === t ? C.cyan : "transparent", border: `1px solid ${tab === t ? C.cyan : C.border}`, color: tab === t ? C.bg : C.muted, padding: "6px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase", transition: "all 0.15s" }}>
                {t === "nieuw" ? "Nieuw item" : t === "gasten" ? "Gasten" : "Geschiedenis"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 28px" }}>

        {/* TAB: GASTEN */}
        {tab === "gasten" && (
          <div>
            <Lbl color={C.cyan}>Gastendatabase</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <Fld label="Naam"><input value={nieuweGast.naam} onChange={e => setNieuweGast(g => ({ ...g, naam: e.target.value }))} placeholder="bijv. Wierd Duk" style={inp} /></Fld>
              <Fld label="Achtergrond"><input value={nieuweGast.achtergrond} onChange={e => setNieuweGast(g => ({ ...g, achtergrond: e.target.value }))} placeholder="bijv. Journalist De Telegraaf, migratie" style={inp} /></Fld>
            </div>
            <Btn onClick={slaGastOp}>+ Gast opslaan</Btn>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              {gasten.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen gasten opgeslagen.</div>}
              {gasten.map(g => (
                <div key={g.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div><div style={{ fontWeight: 700, fontSize: 15, color: C.white }}>{g.naam}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{g.achtergrond}</div></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setName(g.naam); setBg(g.achtergrond); setTab("nieuw"); }} style={{ background: C.cyan, border: "none", color: C.bg, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>Gebruik</button>
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
            <Lbl color={C.cyan}>Opgeslagen opzetten</Lbl>
            {geschiedenis.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen opzetten gegenereerd.</div>}
            {geschiedenis.map(item => (
              <div key={item.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 10, cursor: "pointer" }}
                onClick={() => { setPrep(item.prep); setSel(item.sel); setName(item.gast); setTab("nieuw"); }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.cyan }}>{item.onderwerp}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{item.gast} · {item.datum}</div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: NIEUW ITEM */}
        {tab === "nieuw" && (
          <div>

            {/* NIEUWS */}
            <Lbl color={C.cyan}>01 — Nieuws van vandaag</Lbl>

            {/* CATEGORIE FILTERS */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {CATEGORIEEN.map(c => {
                const aan = geselecteerdeCats.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCat(c.id)}
                    style={{ padding: "5px 14px", border: `1px solid ${aan ? C.cyan : C.border}`, background: aan ? C.cyan : "transparent", color: aan ? C.bg : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "monospace", fontWeight: aan ? 700 : 400, transition: "all 0.15s" }}>
                    {c.label}
                  </button>
                );
              })}
              <button onClick={laadNieuws} style={{ padding: "5px 14px", border: `1px solid ${C.cyanDark}`, background: "transparent", color: C.cyanDark, fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
                ↺ Herladen
              </button>
            </div>

            <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>
              {nieuwsStatus === "laden" && "⏳ Nieuws ophalen..."}
              {nieuwsStatus === "ok" && "✓ Geladen — pas aan wat nodig is"}
              {nieuwsStatus === "fout" && "⚠ Kon nieuws niet ophalen — typ zelf koppen in"}
            </div>

            <textarea value={nieuws} onChange={e => { setNieuws(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
              style={{ ...inp, minHeight: 140, resize: "vertical", lineHeight: 1.7 }}
              placeholder={"Nieuws wordt automatisch geladen...\n\nOf plak zelf koppen:\n- Kabinet kondigt bezuinigingen aan\n- 120 asielzoekers per nacht van Ter Apel naar Groningen"} />

            <div style={{ height: 20 }} />
            <Lbl color={C.cyan}>Eigen sturing / idee (optioneel)</Lbl>
            <textarea value={eigenInput} onChange={e => { setEigenInput(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
              placeholder="Geef richting mee — een onderwerp, invalshoek of iets wat de gast net heeft gedaan"
              style={{ ...inp, minHeight: 56, resize: "vertical", lineHeight: 1.6 }} />

            <div style={{ height: 28 }} />
            <Lbl color={C.cyan}>02 — Gast invoeren</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
              <Fld label="Naam gast"><input value={name} onChange={e => { setName(e.target.value); setTopics(null); setSel(null); setPrep(null); }} placeholder="bijv. Wierd Duk" style={inp} /></Fld>
              <Fld label="Achtergrond / expertise"><input value={bg} onChange={e => { setBg(e.target.value); setTopics(null); setSel(null); setPrep(null); }} placeholder="bijv. Journalist De Telegraaf, schrijft over migratie" style={inp} /></Fld>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => doTopics(1)} disabled={!canGo || loadT}>
                {loadT ? "Bezig..." : "Genereer onderwerpen →"}
              </Btn>
              {(name || topics) && <BtnSecondary onClick={reset}>Nieuw</BtnSecondary>}
            </div>

            {err && <div style={{ marginTop: 16, color: "#ff6b6b", fontSize: 12, fontFamily: "monospace", padding: "10px 14px", border: "1px solid #ff4444", background: "#1a0808" }}>⚠ {err}</div>}

            {/* ONDERWERPEN */}
            {topics && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <Lbl color={C.cyan}>03 — Kies een onderwerp</Lbl>
                  <button onClick={() => { const r = ronde + 1; setRonde(r); doTopics(r); }} disabled={loadT}
                    style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                    ↺ Andere onderwerpen
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {topics.map((t, i) => {
                    const active = sel?.titel === t.titel;
                    return (
                      <div key={i} onClick={() => { setSel(t); setPrep(null); }}
                        style={{ background: active ? "#0d2a2a" : C.surface, border: `1px solid ${active ? C.cyan : C.border}`, padding: 18, cursor: "pointer", transition: "all 0.15s" }}>
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

            {/* VOORGESPREK */}
            {sel && (
              <div style={{ marginTop: 36 }}>
                <Lbl color={C.cyan}>04 — Voorgesprek & andere gasten (optioneel)</Lbl>
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
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Geselecteerd: <span style={{ color: C.cyan, fontWeight: 700 }}>{sel.titel}</span></div>
                  <Btn onClick={doPrep} disabled={loadP}>{loadP ? "Bezig..." : "Genereer gespreksopzet →"}</Btn>
                </div>
              </div>
            )}

            {loadP && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "monospace", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Opzet wordt opgebouwd...</div>}

            {/* GESPREKSOPZET */}
            {prep && sel && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <Lbl color={C.cyan}>05 — Gespreksopzet</Lbl>
                  <button onClick={() => exportOpzet(prep, sel, name, andereGasten)}
                    style={{ background: C.cyan, border: "none", color: C.bg, padding: "8px 18px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase", fontWeight: 700 }}>
                    ↓ Download
                  </button>
                </div>

                <div style={{ borderLeft: `3px solid ${C.cyan}`, paddingLeft: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>{sel.titel}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{name}{andereGasten ? ` · ${andereGasten}` : ""} · {VANDAAG}</div>
                </div>

                <Blk label="PRES" cyan={C.cyan} border={C.border} surface={C.surfaceLight}>
                  <div style={{ fontSize: 16, lineHeight: 1.9, fontWeight: 500, color: C.white }}>{prep.pres}</div>
                </Blk>

                {prep.segmenten?.map((s, i) => (
                  <Blk key={i} label={`${s.nummer} ${s.type} ${s.label}`} cyan={C.cyan} border={C.border} surface={C.surfaceLight}>
                    <div style={{ fontSize: 15, lineHeight: 2.0, whiteSpace: "pre-wrap", color: "#ccdaee" }}>{s.inhoud}</div>
                  </Blk>
                ))}

                {prep.beeldvullers?.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    {prep.beeldvullers.map((b, i) => (
                      <div key={i} style={{ fontSize: 15, fontWeight: 700, color: C.white, marginBottom: 6 }}>{b}</div>
                    ))}
                  </div>
                )}

                {prep.overstart && <div style={{ fontSize: 14, color: C.muted, fontFamily: "monospace", marginBottom: 22 }}>{prep.overstart}</div>}

                {prep.beeld?.length > 0 && (
                  <Blk label="Beeld — Suggesties" cyan={C.cyan} border={C.border} surface={C.surfaceLight}>
                    {prep.beeld.map((b, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <span style={{ color: C.cyan, fontFamily: "monospace", fontSize: 11, minWidth: 22 }}>#{i + 1}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.55, color: C.muted }}>{b}</span>
                      </div>
                    ))}
                  </Blk>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lbl({ children, color }) {
  return <div style={{ fontSize: 10, letterSpacing: 4, color: color || "#7dd4d4", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
}
function Fld({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: "#445577", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Blk({ label, children, cyan, border, surface }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: cyan, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ background: surface, border: `1px solid ${border}`, padding: "18px 22px" }}>{children}</div>
    </div>
  );
}
function Btn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: disabled ? "#2a3560" : "#7dd4d4", border: "none", color: disabled ? "#445577" : "#10152e", padding: "12px 28px", fontSize: 11, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, transition: "all 0.15s" }}>
      {children}
    </button>
  );
}
function BtnSecondary({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: "none", border: "1px solid #2a3560", color: "#445577", padding: "12px 20px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase" }}>
      {children}
    </button>
  );
}
