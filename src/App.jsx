import { useState, useEffect } from "react";

const VANDAAG = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const POLITIEKE_CONTEXT = `
ACTUELE POLITIEKE CONTEXT NEDERLAND (mei 2026):
- Kabinet: kabinet-Jetten (D66, VVD, CDA), aangetreden 23 februari 2026
- Premier: Rob Jetten (D66)
- Grootste partij in de Tweede Kamer: D66
- Coalitie: D66, VVD, CDA
- Oppositie: PVV (Wilders), GroenLinks-PvdA, NSC, BBB, SP, PvdD, Volt, SGP, CU, JA21
- Staatssecretaris asiel: Nora Achahbar (D66)
- Minister Financiën: Sigrid Kaag (D66)
- Minister Economie: Micky Adriaansens (VVD)
- Formatie: kabinet gevormd na verkiezingen november 2025
`.trim();

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6.
De toon is direct, opiniërend en informeel — voor de gewone man.
Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal.
Scherp, eerlijk, herkenbaar. De kijker denkt: "eindelijk zegt iemand het."`;

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const CATEGORIEEN = [
  { id: "binnenland", label: "Binnenland / Asiel" },
  { id: "economie", label: "Economie / Ondernemerschap" },
  { id: "buitenland", label: "Buitenland / VS" },
  { id: "entertainment", label: "Entertainment / Show" },
  { id: "koningshuis", label: "Koningshuis" },
  { id: "sport", label: "Sport" },
  { id: "opmerkelijk", label: "Opmerkelijk" },
];

async function fetchNieuws(cats) {
  const res = await fetch(`/api/nieuws?cats=${cats.join(",")}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (!data.items || data.items.length === 0) throw new Error("Geen nieuws opgehaald");
  return data.items.join("\n");
}

const TOPICS_PROMPT = (name, background, nieuws, ronde, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Actueel nieuws van vandaag (ingevoerd door de redactie):
${nieuws}

${eigenInput ? `Eigen sturing van de redactie (prioriteit):\n${eigenInput}` : ""}

Gast: ${name}
Achtergrond/expertise: ${background}

${ronde > 1 ? `Dit is ronde ${ronde} — bedenk 4 compleet ANDERE invalshoeken dan eerder.` : ""}

Gebruik het nieuws als springplank. Bedenk 4 ORIGINELE gespreksonderwerpen die:
- NIET de kop letterlijk herhalen maar er een scherpe invalshoek op vinden
- Meerdere nieuwsfeiten mogen combineren tot één onderwerp
- Passen bij de expertise van deze specifieke gast
- Zeggen wat andere media niet zeggen of niet durven
- De gewone kijker raken — herkenbaar, direct, opiniërend

Denk in stellingen en spanningsvelden. Niet "wat vindt u van X" maar "waarom doet niemand Y terwijl iedereen X ziet."

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

STRIKTE REGELS:
- Schrijf ANTWOORDEN, geen vragen. Thomas weet wat de gast zegt — de vragen komen vanzelf.
- Alles wat NIET in de autocue hoeft staat tussen (( ))
- Beeldvullertekst (BV:) staat WEL in de autocue — geen haakjes
- @ markeert een overgang of nieuwe richting in het gesprek
- Segmentnummers beginnen bij 91
- INSTART = filmfragment, INSTEEK = gesprek in studio
- Verwerk voorgesprek letterlijk als bulletpoints in de antwoorden
- Geef 4 concrete beeldsuggesties

Geef ALLEEN een JSON-object terug, niets anders. Geen markdown, geen backticks.

{"pres":"PRES-aankondigingstekst: direct en prikkelend, eindigend met haakje naar het gesprek","segmenten":[{"nummer":91,"type":"INSTART","label":"NAAM FRAGMENT IN HOOFDLETTERS","inhoud":"(( beschrijving van het filmfragment ))"},{"nummer":92,"type":"INSTEEK","label":"NAAM INSTEEK IN HOOFDLETTERS","inhoud":"(( GASTNAAM: \\"wat de gast zegt\\"\\n\\nGAST: \\"volgend punt\\"\\n\\n@ Overgang\\nGAST: \\"antwoord\\"\\n\\nBV: BEELDVULLER IN HOOFDLETTERS ))"}],"beeldvullers":["BV NAAM — aparte beeldvuller"],"overstart":"(( 94 OVERSTART LOCATIE ))","beeld":["Beeldsuggestie 1 — concreet en monteerbaar","Suggestie 2","Suggestie 3","Suggestie 4"]}`;

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

// Export to Word via server-side generation
function exportToWord(prep, sel, name, bg, andereGasten) {
  const content = `NIEUWS VAN DE DAG — SBS6
${VANDAAG}

ONDERWERP: ${sel.titel}
GAST: ${name}${andereGasten ? ` / ${andereGasten}` : ""}

---

PRES

${prep.pres}

---

${(prep.segmenten || []).map(s => `${s.nummer} ${s.type} ${s.label}\n\n${s.inhoud}`).join("\n\n---\n\n")}

---

${(prep.beeldvullers || []).join("\n")}

${prep.overstart || ""}

---

BEELD — SUGGESTIES VOOR OPNAMES

${(prep.beeld || []).map((b, i) => `${i + 1}. ${b}`).join("\n")}
`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opzet-${name.toLowerCase().replace(/\s/g, "-")}-${VANDAAG.replace(/\s/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const C = {
  bg: "#faf8f5", surface: "#ffffff", border: "#e0dbd4",
  red: "#c82016", redDark: "#8c1510", white: "#1a1a1a",
  muted: "#666", dim: "#999",
};

const inp = {
  width: "100%", background: "#fff", border: `1px solid ${C.border}`,
  color: "#1a1a1a", padding: "12px 14px", fontSize: 15,
  fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box",
};

const LEGE_GAST = { naam: "", achtergrond: "" };

export default function App() {
  const [tab, setTab] = useState("nieuw"); // nieuw | gasten | geschiedenis
  const [name, setName] = useState("");
  const [bg, setBg] = useState("");
  const [nieuws, setNieuws] = useState("");
  const [eigenInput, setEigenInput] = useState("");
  const [actieveCats, setActieveCats] = useState(["binnenland", "economie", "buitenland"]);
  const [nieuwsStatus, setNieuwsStatus] = useState("idle");
  const [voorgesprek, setVoorgesprek] = useState("");
  const [andereGasten, setAndereGasten] = useState("");
  const [topics, setTopics] = useState(null);
  const [sel, setSel] = useState(null);
  const [prep, setPrep] = useState(null);
  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);

  // Gasten database
  const [gasten, setGasten] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nvdd_gasten") || "[]"); } catch { return []; }
  });
  const [nieuweGast, setNieuweGast] = useState(LEGE_GAST);

  // Geschiedenis
  const [geschiedenis, setGeschiedenis] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nvdd_geschiedenis") || "[]"); } catch { return []; }
  });

  const slaGastOp = () => {
    if (!nieuweGast.naam.trim()) return;
    const updated = [...gasten, { ...nieuweGast, id: Date.now() }];
    setGasten(updated);
    localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
    setNieuweGast(LEGE_GAST);
  };

  const verwijderGast = (id) => {
    const updated = gasten.filter(g => g.id !== id);
    setGasten(updated);
    localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
  };

  const laadGast = (g) => { setName(g.naam); setBg(g.achtergrond); setTab("nieuw"); };

  const slaOpzetOp = (p, s) => {
    const item = { id: Date.now(), datum: VANDAAG, gast: name, onderwerp: s.titel, prep: p, sel: s };
    const updated = [item, ...geschiedenis].slice(0, 20);
    setGeschiedenis(updated);
    localStorage.setItem("nvdd_geschiedenis", JSON.stringify(updated));
  };

  const laadNieuws = (cats) => {
    const te_laden = cats || actieveCats;
    if (te_laden.length === 0) return;
    setNieuwsStatus("laden");
    fetchNieuws(te_laden)
      .then(n => { setNieuws(n); setNieuwsStatus("ok"); })
      .catch(() => setNieuwsStatus("fout"));
  };

  useEffect(() => { laadNieuws(["binnenland", "economie", "buitenland"]); }, []);

  const canGo = name.trim().length > 1 && bg.trim().length > 4 && nieuws.trim().length > 20;

  const doTopics = async (r) => {
    if (!canGo || loadT) return;
    setLoadT(true); setTopics(null); setSel(null); setPrep(null); setErr("");
    try { setTopics(await callClaude(TOPICS_PROMPT(name, bg, nieuws, r, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  const doPrep = async () => {
    if (!sel || loadP) return;
    setPrep(null); setLoadP(true); setErr("");
    try {
      const p = await callClaude(PREP_PROMPT(name, bg, sel.titel, sel.omschrijving, voorgesprek, andereGasten));
      setPrep(p);
      slaOpzetOp(p, sel);
    } catch (e) { setErr(e.message); }
    setLoadP(false);
  };

  const reset = () => {
    setName(""); setBg(""); setNieuws(""); setEigenInput("");
    setTopics(null); setSel(null); setPrep(null); setErr("");
    setVoorgesprek(""); setAndereGasten(""); setRonde(1); setActieveCat(null);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: C.red, textTransform: "uppercase" }}>Nieuws van de Dag</span>
            <span style={{ fontSize: 10, letterSpacing: 4, color: C.dim, fontFamily: "monospace", textTransform: "uppercase" }}>SBS6</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Redactietool · {VANDAAG}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["nieuw", "gasten", "geschiedenis"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab === t ? C.red : "none", border: `1px solid ${tab === t ? C.red : C.border}`, color: tab === t ? "#fff" : C.muted, padding: "6px 16px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
              {t === "nieuw" ? "Nieuw item" : t === "gasten" ? "Gasten" : "Geschiedenis"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px" }}>

        {/* TAB: GASTEN */}
        {tab === "gasten" && (
          <div>
            <Lbl>Gastendatabase</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <Fld label="Naam gast">
                <input value={nieuweGast.naam} onChange={e => setNieuweGast(g => ({ ...g, naam: e.target.value }))} placeholder="bijv. Wierd Duk" style={inp} />
              </Fld>
              <Fld label="Achtergrond / expertise">
                <input value={nieuweGast.achtergrond} onChange={e => setNieuweGast(g => ({ ...g, achtergrond: e.target.value }))} placeholder="bijv. Journalist De Telegraaf, schrijft over migratie" style={inp} />
              </Fld>
            </div>
            <button onClick={slaGastOp} style={{ background: C.red, border: "none", color: "#fff", padding: "10px 24px", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase", cursor: "pointer", marginBottom: 28 }}>
              + Gast opslaan
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {gasten.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen gasten opgeslagen.</div>}
              {gasten.map(g => (
                <div key={g.id} style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{g.naam}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{g.achtergrond}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => laadGast(g)} style={{ background: C.red, border: "none", color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }}>Gebruik</button>
                    <button onClick={() => verwijderGast(g.id)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>✕</button>
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
              <div key={item.id} style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 12, cursor: "pointer" }}
                onClick={() => { setPrep(item.prep); setSel(item.sel); setName(item.gast); setTab("nieuw"); }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.red }}>{item.onderwerp}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{item.gast} · {item.datum}</div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: NIEUW ITEM */}
        {tab === "nieuw" && (
          <div>
            {/* NIEUWS */}
            <Lbl>01 — Nieuws van vandaag</Lbl>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
              Selecteer categorieën — nieuws wordt automatisch opgehaald. Pas aan of voeg toe wat mist.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {CATEGORIEEN.map(c => {
                const aan = actieveCats.includes(c.id);
                return (
                  <div key={c.id} onClick={() => {
                    const nieuw = aan ? actieveCats.filter(x => x !== c.id) : [...actieveCats, c.id];
                    setActieveCats(nieuw);
                    laadNieuws(nieuw);
                  }}
                    style={{ padding: "6px 14px", border: `1px solid ${aan ? C.red : C.border}`, background: aan ? "#fff0ee" : "#fff", color: aan ? C.red : C.muted, fontSize: 13, cursor: "pointer", borderRadius: 2 }}>
                    {c.label}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>
              {nieuwsStatus === "laden" && "⏳ Nieuws ophalen..."}
              {nieuwsStatus === "ok" && "✓ Nieuws geladen — verwijder wat niet relevant is, voeg toe wat mist"}
              {nieuwsStatus === "fout" && "⚠ Kon nieuws niet ophalen — typ zelf koppen in"}
            </div>
            <textarea value={nieuws} onChange={e => { setNieuws(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
              style={{ ...inp, minHeight: 140, resize: "vertical", lineHeight: 1.7 }}
              placeholder={"Plak hier nieuwskoppen van vandaag, één per regel.\n\nbijv:\n- Kabinet-Jetten kondigt bezuinigingen aan\n- 120 asielzoekers per nacht van Ter Apel naar Groningen\n- Wapenbezit jongeren gestegen met 22 procent"} />

            <div style={{ height: 20 }} />
            <Lbl>Eigen sturing / idee (optioneel)</Lbl>
            <textarea value={eigenInput} onChange={e => { setEigenInput(e.target.value); setTopics(null); setSel(null); setPrep(null); }}
              placeholder="Geef richting mee — een onderwerp, invalshoek of iets wat de gast net heeft gedaan"
              style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6 }} />

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
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => doTopics(1)} disabled={!canGo || loadT}
                style={{ background: canGo && !loadT ? C.red : "#ccc", border: "none", color: "#fff", padding: "12px 28px", fontSize: 11, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: canGo && !loadT ? "pointer" : "not-allowed" }}>
                {loadT ? "Bezig..." : "Genereer onderwerpen →"}
              </button>
              {(name || topics) && (
                <button onClick={reset} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "12px 20px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Nieuw</button>
              )}
            </div>

            {err && <div style={{ marginTop: 16, color: C.red, fontSize: 12, fontFamily: "monospace", padding: "10px 14px", border: `1px solid ${C.redDark}`, background: "#fff0ee" }}>⚠ {err}</div>}

            {/* ONDERWERPEN */}
            {topics && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <Lbl>03 — Kies een onderwerp</Lbl>
                  <button onClick={() => { const r = ronde + 1; setRonde(r); doTopics(r); }} disabled={loadT}
                    style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                    ↺ Andere onderwerpen
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {topics.map((t, i) => {
                    const active = sel?.titel === t.titel;
                    return (
                      <div key={i} onClick={() => { setSel(t); setPrep(null); }}
                        style={{ background: active ? "#fff0ee" : "#fff", border: `1px solid ${active ? C.red : C.border}`, padding: 18, cursor: "pointer" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.red : C.white, marginBottom: 8, lineHeight: 1.4 }}>{t.titel}</div>
                        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>{t.omschrijving}</div>
                        {t.bron && <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", marginBottom: 10 }}>📰 {t.bron}</div>}
                        <div style={{ fontSize: 11, color: C.red, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>↗ {t.profiel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VOORGESPREK */}
            {sel && (
              <div style={{ marginTop: 36 }}>
                <Lbl>04 — Voorgesprek & andere gasten (optioneel)</Lbl>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Vul dit in vóór je de opzet genereert — wordt letterlijk verwerkt in de antwoorden</div>
                <Fld label="Voorgesprek redacteur met gast">
                  <textarea value={voorgesprek} onChange={e => setVoorgesprek(e.target.value)}
                    placeholder={"R: Wat vind je van X?\nG: Ik denk dat...\nR: Waarom?\nG: Omdat..."}
                    style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }} />
                </Fld>
                <div style={{ height: 12 }} />
                <Fld label="Andere gasten in het item (optioneel)">
                  <input value={andereGasten} onChange={e => setAndereGasten(e.target.value)}
                    placeholder="bijv. Verslaggever Suzette Nesselaar vanuit Den Haag" style={inp} />
                </Fld>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Geselecteerd: <span style={{ color: C.red, fontWeight: 700 }}>{sel.titel}</span></div>
                  <button onClick={doPrep} disabled={loadP}
                    style={{ background: !loadP ? C.red : "#ccc", border: "none", color: "#fff", padding: "12px 28px", fontSize: 11, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase", cursor: !loadP ? "pointer" : "not-allowed" }}>
                    {loadP ? "Bezig..." : "Genereer gespreksopzet →"}
                  </button>
                </div>
              </div>
            )}

            {loadP && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "monospace", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Opzet wordt opgebouwd...</div>}

            {/* GESPREKSOPZET */}
            {prep && sel && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <Lbl>05 — Gespreksopzet</Lbl>
                  <button onClick={() => exportToWord(prep, sel, name, bg, andereGasten)}
                    style={{ background: "#1a1a1a", border: "none", color: "#fff", padding: "8px 18px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
                    ↓ Download opzet
                  </button>
                </div>

                <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{sel.titel}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{name}{andereGasten ? ` · ${andereGasten}` : ""} · {VANDAAG}</div>
                </div>

                <Blk label="PRES">
                  <div style={{ fontSize: 16, lineHeight: 1.9, fontWeight: 500 }}>{prep.pres}</div>
                </Blk>

                {prep.segmenten?.map((s, i) => (
                  <Blk key={i} label={`${s.nummer} ${s.type} ${s.label}`}>
                    <div style={{ fontSize: 15, lineHeight: 2.0, whiteSpace: "pre-wrap", color: "#333" }}>{s.inhoud}</div>
                  </Blk>
                ))}

                {prep.beeldvullers?.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    {prep.beeldvullers.map((b, i) => (
                      <div key={i} style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{b}</div>
                    ))}
                  </div>
                )}

                {prep.overstart && (
                  <div style={{ fontSize: 14, color: C.muted, fontFamily: "monospace", marginBottom: 22 }}>{prep.overstart}</div>
                )}

                {prep.beeld?.length > 0 && (
                  <Blk label="Beeld — Suggesties voor opnames">
                    {prep.beeld.map((b, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <span style={{ color: C.red, fontFamily: "monospace", fontSize: 11, minWidth: 22 }}>#{i + 1}</span>
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

function Lbl({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: 3, color: "#c82016", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>;
}
function Fld({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 2, color: "#999", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Blk({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: "#c82016", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ background: "#ffffff", border: "1px solid #e0dbd4", padding: "18px 22px" }}>{children}</div>
    </div>
  );
}
