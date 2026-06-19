import { useState, useEffect, useRef } from "react";

const VANDAAG = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const POLITIEKE_CONTEXT = `ACTUELE POLITIEKE CONTEXT NEDERLAND (juni 2026):
- Kabinet: kabinet-Jetten (D66, VVD, CDA), aangetreden 23 februari 2026
- Premier: Rob Jetten (D66)
- Grootste partij in de Tweede Kamer: D66
- Coalitie: D66, VVD, CDA
- Oppositie: PVV (Wilders), GroenLinks-PvdA, NSC, BBB, SP
- Staatssecretaris asiel: Nora Achahbar (D66)
- Minister Financiën: Sigrid Kaag (D66)
- Minister Economie: Micky Adriaansens (VVD)`.trim();

const SHOW_PROFILE = `Nieuws van de Dag is een opinie- en actualiteitenprogramma op SBS6. De toon is direct, opiniërend en informeel — voor de gewone man. Wij zeggen wat andere media niet zeggen. Geen politieke correctheid, geen omhaal. Scherp, eerlijk, herkenbaar.`;

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const GAST_TOPICS_PROMPT = (name, background, historie, nieuws, ronde, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Gast: ${name}
Achtergrond/expertise: ${background}
${historie ? `Eerdere optredens bij Nieuws van de Dag:\n${historie}\n` : ""}

Actueel nieuws van vandaag:
${nieuws}

${eigenInput ? `!!EIGEN STURING — DIT IS HET VERTREKPUNT. Alle vier onderwerpen MOETEN hierop aansluiten:\n${eigenInput}\n` : ""}
${ronde > 1 ? `Dit is ronde ${ronde} — bedenk 4 compleet ANDERE onderwerpen dan eerder.` : ""}

KRITIEKE REGEL — VERZIN GEEN FEITEN:
- Verzin GEEN data of gebeurtenissen die niet letterlijk in het nieuws of de eigen sturing staan.
- Twijfel je over een feit? Formuleer het als vraag of algemeen thema.
- De invalshoek mag origineel zijn, de feiten moeten kloppen.

Bedenk 4 ORIGINELE gespreksonderwerpen die perfect passen bij deze gast.

Geef ALLEEN een JSON-array terug, niets anders.
[{"titel":"Pakkende stelling (max 8 woorden)","omschrijving":"Kern en waarom past dit bij deze gast?","profiel":"Wat zegt NvdD hierover wat andere media weglaten?","bron":"Welk nieuws of thema ligt hieraan ten grondslag?"}]`;

const ONDERWERP_GASTEN_PROMPT = (onderwerp, nieuws, eigenInput) => `Je bent een ervaren redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Onderwerp: ${onderwerp}

Actueel nieuws van vandaag:
${nieuws}

${eigenInput ? `!!EIGEN STURING — houd hier rekening mee:\n${eigenInput}\n` : ""}

Bedenk 4 gasten die perfect passen bij dit onderwerp. Denk aan bekende Nederlanders: journalisten, columnisten, experts, opiniemakers.

Geef ALLEEN een JSON-array terug, niets anders.
[{"naam":"Volledige naam","omschrijving":"Wie is dit en wat is hun expertise?","waarom":"Waarom is dit DE beste gast voor dit onderwerp?","insteek":"De scherpe invalshoek van dit gesprek"}]`;

const PREP_PROMPT = (name, background, historie, topic, topicDesc, voorgesprek, andereGasten) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Programmaprofiel: ${SHOW_PROFILE}

${POLITIEKE_CONTEXT}

Gast: ${name} — ${background}
${historie ? `Eerdere optredens:\n${historie}\n` : ""}
${andereGasten ? `Andere gasten: ${andereGasten}` : ""}
Onderwerp: ${topic}
Context: ${topicDesc}
${voorgesprek ? `Voorgesprek — verwerk letterlijk:\n${voorgesprek}` : ""}

BEGRIPPEN: INSTART = filmfragment, INSTEEK = gesprek in studio

REGELS:
- Schrijf ANTWOORDEN, geen vragen
- Wat niet in autocue hoeft staat tussen (( ))
- BV: staat WEL in autocue
- @ markeert overgang
- Segmentnummers beginnen bij 91
- Verwerk voorgesprek letterlijk als bulletpoints

Geef ALLEEN een JSON-object terug, niets anders.
{"pres":"PRES-tekst","segmenten":[{"nummer":91,"type":"INSTART","label":"NAAM","inhoud":"(( filmfragment ))"},{"nummer":92,"type":"INSTEEK","label":"NAAM","inhoud":"(( GAST: \\"antwoord\\"\\n\\n@ overgang\\nGAST: \\"antwoord\\"\\n\\nBV: BEELDVULLER ))"}],"beeldvullers":["BV NAAM"],"overstart":"(( 94 OVERSTART ))","beeld":["Suggestie 1","Suggestie 2","Suggestie 3","Suggestie 4"]}`;

const ONLINE_PROMPT = (onderwerp, omschrijving, pres, segmenten) => `Je bent redacteur van Nieuws van de Dag op SBS6 (${VANDAAG}).

Schrijf een online samenvatting voor de digitale redactie:
Onderwerp: ${onderwerp}
PRES: ${pres}
Gesprek: ${(segmenten || []).map(s => s.inhoud).join(" ").slice(0, 500)}

Schrijf een prikkelende kop (max 12 woorden) en samenvatting van 3-4 zinnen, direct en helder.

VOORBEELD KOP: Onthullende documentaire over FvD: 'Waarom kijkt Nederland hier nu pas van op?'

Geef ALLEEN een JSON-object terug.
{"kop":"kop hier","samenvatting":"samenvatting hier"}`;

const PDF_ANALYSE_PROMPT = (tekst, gastNaam) => `Je bent een redacteur van Nieuws van de Dag op SBS6.

Analyseer deze tekst van een oude uitzending en extraheer informatie over de gast ${gastNaam}.

Tekst:
${tekst.slice(0, 3000)}

Extraheer:
1. Wat waren de standpunten van ${gastNaam}?
2. Welke onderwerpen kwamen aan bod?
3. Wat waren opvallende uitspraken?
4. Hoe reageerde de gast op kritische vragen?

Schrijf een korte samenvatting (max 200 woorden) die bruikbaar is als context voor een volgend gesprek.

Geef ALLEEN een JSON-object terug.
{"samenvatting":"samenvatting hier","onderwerpen":["onderwerp1","onderwerp2"],"kernpunten":["punt1","punt2","punt3"]}`;

function extractJSON(text) {
  const s1 = text.indexOf('['), e1 = text.lastIndexOf(']');
  if (s1 !== -1 && e1 > s1) { try { return JSON.parse(text.slice(s1, e1 + 1)); } catch {} }
  const s2 = text.indexOf('{'), e2 = text.lastIndexOf('}');
  if (s2 !== -1 && e2 > s2) { try { return JSON.parse(text.slice(s2, e2 + 1)); } catch {} }
  throw new Error(`Kon JSON niet verwerken: ${text.slice(0, 150)}`);
}

async function callClaude(prompt, maxTokens = 2000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`API fout ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return extractJSON((d.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
}

async function readPdfText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 1000,
            messages: [{ role: "user", content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "Geef de volledige tekst van dit document terug. Geen samenvatting, gewoon de tekst." }
            ]}]
          }),
        });
        const data = await response.json();
        const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
        resolve(text);
      } catch(e) { reject(e); }
    };
    reader.readAsDataURL(file);
  });
}

function exportOpzet(opzetTekst, naam, onderwerp) {
  const blob = new Blob([opzetTekst], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opzet-${naam.toLowerCase().replace(/\s/g, "-")}-${VANDAAG.replace(/\s/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function prepToTekst(prep, sel, naam, andereGasten, online) {
  if (!prep) return "";
  const lines = [
    `NIEUWS VAN DE DAG — SBS6`, VANDAAG, "",
    `ONDERWERP: ${sel?.titel || sel?.naam || ""}`,
    `GAST: ${naam}${andereGasten ? ` / ${andereGasten}` : ""}`, "", "---", "", "PRES", "",
    prep.pres, "", "---", "",
    ...(prep.segmenten || []).flatMap(s => [`${s.nummer} ${s.type} ${s.label}`, "", s.inhoud, "", "---", ""]),
    ...(prep.beeldvullers || []), "", prep.overstart || "", "", "---", "", "BEELD", "",
    ...(prep.beeld || []).map((b, i) => `${i + 1}. ${b}`),
    "", "---", "", "ONLINE", "",
    online ? `${online.kop}\n\n${online.samenvatting}` : "(nog niet gegenereerd)",
  ];
  return lines.join("\n");
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
  const [flow, setFlow] = useState("gast");
  const [nieuws, setNieuws] = useState("");
  const [nieuwsStatus, setNieuwsStatus] = useState("laden");
  const [gastNaam, setGastNaam] = useState("");
  const [gastBg, setGastBg] = useState("");
  const [gastTopics, setGastTopics] = useState(null);
  const [onderwerp, setOnderwerp] = useState("");
  const [gastSuggesties, setGastSuggesties] = useState(null);
  const [gekozenGast, setGekozenGast] = useState(null);
  const [eigenInput, setEigenInput] = useState("");
  const [sel, setSel] = useState(null);
  const [voorgesprek, setVoorgesprek] = useState("");
  const [andereGasten, setAndereGasten] = useState("");
  const [prep, setPrep] = useState(null);
  const [opzetTekst, setOpzetTekst] = useState("");
  const [online, setOnline] = useState(null);
  const [loadT, setLoadT] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [loadO, setLoadO] = useState(false);
  const [err, setErr] = useState("");
  const [ronde, setRonde] = useState(1);

  const [gasten, setGasten] = useState(() => { try { return JSON.parse(localStorage.getItem("nvdd_gasten") || "[]"); } catch { return []; } });
  const [nieuweGast, setNieuweGast] = useState({ naam: "", achtergrond: "" });
  const [geschiedenis, setGeschiedenis] = useState(() => { try { return JSON.parse(localStorage.getItem("nvdd_geschiedenis") || "[]"); } catch { return []; } });
  const [pdfStatus, setPdfStatus] = useState({});
  const fileInputRef = useRef({});

  const laadNieuws = () => {
    setNieuwsStatus("laden");
    fetch("/api/nieuws").then(r => r.json())
      .then(d => { if (d.items) { setNieuws(d.items.slice(0, 10).join("\n")); setNieuwsStatus("ok"); } else setNieuwsStatus("fout"); })
      .catch(() => setNieuwsStatus("fout"));
  };

  useEffect(() => { laadNieuws(); }, []);

  const resetOpzet = () => { setSel(null); setPrep(null); setOpzetTekst(""); setOnline(null); setErr(""); setVoorgesprek(""); setAndereGasten(""); };
  const resetAll = () => { setGastNaam(""); setGastBg(""); setGastTopics(null); setOnderwerp(""); setGastSuggesties(null); setGekozenGast(null); setRonde(1); setEigenInput(""); resetOpzet(); };

  const getGastHistorie = (naam) => {
    const g = gasten.find(g => g.naam.toLowerCase() === naam.toLowerCase());
    if (!g || !g.historie) return "";
    return g.historie.map(h => `- ${h.datum}: ${h.samenvatting}`).join("\n");
  };

  const doGastTopics = async (r) => {
    if (!gastNaam.trim() || !gastBg.trim() || loadT) return;
    setLoadT(true); setGastTopics(null); resetOpzet(); setErr("");
    const historie = getGastHistorie(gastNaam);
    try { setGastTopics(await callClaude(GAST_TOPICS_PROMPT(gastNaam, gastBg, historie, nieuws, r || 1, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  const doOnderwerpGasten = async () => {
    if (!onderwerp.trim() || loadT) return;
    setLoadT(true); setGastSuggesties(null); setGekozenGast(null); resetOpzet(); setErr("");
    try { setGastSuggesties(await callClaude(ONDERWERP_GASTEN_PROMPT(onderwerp, nieuws, eigenInput))); }
    catch (e) { setErr(e.message); }
    setLoadT(false);
  };

  const doPrep = async () => {
    const naam = flow === "gast" ? gastNaam : gekozenGast?.naam || "";
    const bg = flow === "gast" ? gastBg : gekozenGast?.omschrijving || "";
    if (!sel || !naam || loadP) return;
    setPrep(null); setOpzetTekst(""); setOnline(null); setLoadP(true); setErr("");
    const historie = getGastHistorie(naam);
    try {
      const p = await callClaude(PREP_PROMPT(naam, bg, historie, sel.titel || sel.naam, sel.omschrijving || sel.insteek, voorgesprek, andereGasten));
      setPrep(p);
      const tekst = prepToTekst(p, sel, naam, andereGasten, null);
      setOpzetTekst(tekst);
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
    try {
      const result = await callClaude(ONLINE_PROMPT(sel?.titel || sel?.naam || "", sel?.omschrijving || sel?.insteek || "", prep.pres, prep.segmenten));
      setOnline(result);
      const naam = flow === "gast" ? gastNaam : gekozenGast?.naam || "";
      setOpzetTekst(prepToTekst(prep, sel, naam, andereGasten, result));
    } catch (e) { setErr(e.message); }
    setLoadO(false);
  };

  const verwerkPdf = async (file, gastId) => {
    setPdfStatus(s => ({ ...s, [gastId]: "laden" }));
    try {
      const tekst = await readPdfText(file);
      const gast = gasten.find(g => g.id === gastId);
      if (!gast) throw new Error("Gast niet gevonden");
      const analyse = await callClaude(PDF_ANALYSE_PROMPT(tekst, gast.naam));
      const nieuweHistorie = [...(gast.historie || []), {
        datum: VANDAAG,
        bestand: file.name,
        samenvatting: analyse.samenvatting,
        onderwerpen: analyse.onderwerpen,
        kernpunten: analyse.kernpunten,
      }];
      const updated = gasten.map(g => g.id === gastId ? { ...g, historie: nieuweHistorie } : g);
      setGasten(updated);
      localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
      setPdfStatus(s => ({ ...s, [gastId]: "ok" }));
    } catch (e) {
      setPdfStatus(s => ({ ...s, [gastId]: "fout: " + e.message }));
    }
  };

  const slaGastOp = () => {
    if (!nieuweGast.naam.trim()) return;
    const updated = [...gasten, { ...nieuweGast, id: Date.now(), historie: [] }];
    setGasten(updated);
    localStorage.setItem("nvdd_gasten", JSON.stringify(updated));
    setNieuweGast({ naam: "", achtergrond: "" });
  };

  const huidigNaam = flow === "gast" ? gastNaam : gekozenGast?.naam || "";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Georgia, serif", color: C.white }}>
      <div style={{ background: "linear-gradient(135deg, #0d1228 0%, #1a2040 50%, #0d1a35 100%)", borderBottom: `1px solid ${C.border}`, padding: "0 28px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.cyan, letterSpacing: 1 }}>Nieuws van de Dag</div>
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

            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {gasten.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Nog geen gasten opgeslagen.</div>}
              {gasten.map(g => (
                <div key={g.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: C.white }}>{g.naam}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{g.achtergrond}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => { setGastNaam(g.naam); setGastBg(g.achtergrond); setFlow("gast"); setTab("nieuw"); }} style={{ background: C.cyan, border: "none", color: C.bg, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>Gebruik</button>
                      <button onClick={() => { const u = gasten.filter(x => x.id !== g.id); setGasten(u); localStorage.setItem("nvdd_gasten", JSON.stringify(u)); }} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", cursor: "pointer", fontSize: 11 }}>✕</button>
                    </div>
                  </div>

                  {/* HISTORIE */}
                  {g.historie && g.historie.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: C.cyan, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 8 }}>Eerdere optredens ({g.historie.length})</div>
                      {g.historie.map((h, i) => (
                        <div key={i} style={{ marginBottom: 8, padding: "8px 12px", background: C.surfaceLight, borderLeft: `2px solid ${C.cyanDark}` }}>
                          <div style={{ fontSize: 11, color: C.cyan, fontFamily: "monospace", marginBottom: 4 }}>{h.datum} — {h.bestand}</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{h.samenvatting}</div>
                          {h.kernpunten && <div style={{ marginTop: 6 }}>{h.kernpunten.map((k, j) => <div key={j} style={{ fontSize: 12, color: C.dim, fontFamily: "monospace" }}>• {k}</div>)}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PDF UPLOAD */}
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>Upload een PDF van een eerdere uitzending om het profiel van {g.naam} te verrijken</div>
                    <input type="file" accept=".pdf" ref={el => fileInputRef.current[g.id] = el}
                      onChange={e => { if (e.target.files[0]) verwerkPdf(e.target.files[0], g.id); }}
                      style={{ display: "none" }} />
                    <button onClick={() => fileInputRef.current[g.id]?.click()}
                      style={{ background: "none", border: `1px solid ${C.cyanDark}`, color: C.cyanDark, padding: "6px 16px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1 }}>
                      + Upload PDF opzet
                    </button>
                    {pdfStatus[g.id] && (
                      <span style={{ marginLeft: 12, fontSize: 11, fontFamily: "monospace", color: pdfStatus[g.id] === "ok" ? C.cyan : pdfStatus[g.id] === "laden" ? C.muted : "#ff6b6b" }}>
                        {pdfStatus[g.id] === "laden" ? "⏳ PDF verwerken..." : pdfStatus[g.id] === "ok" ? "✓ Opgeslagen" : pdfStatus[g.id]}
                      </span>
                    )}
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
                onClick={() => { setPrep(item.prep); setSel(item.sel); setGastNaam(item.gast); setOpzetTekst(prepToTekst(item.prep, item.sel, item.gast, "", null)); setTab("nieuw"); }}>
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
            <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: `1px solid ${C.border}` }}>
              {[
                { id: "gast", label: "Vertrekpunt: gast", sub: "Ik heb een gast — bedenk onderwerpen" },
                { id: "onderwerp", label: "Vertrekpunt: onderwerp", sub: "Ik heb een onderwerp — wie is de beste gast?" }
              ].map(f => (
                <button key={f.id} onClick={() => { setFlow(f.id); resetAll(); }}
                  style={{ flex: 1, background: "none", border: "none", borderBottom: flow === f.id ? `3px solid ${C.cyan}` : "3px solid transparent", padding: "14px 20px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: flow === f.id ? C.cyan : C.muted }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3, fontFamily: "monospace" }}>{f.sub}</div>
                </button>
              ))}
            </div>

            {/* NIEUWS */}
            <div style={{ background: C.surfaceLight, border: `1px solid ${C.cyan}`, padding: "20px 22px", marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: 3, color: C.cyan, fontFamily: "monospace", textTransform: "uppercase", fontWeight: 700 }}>Stap 1 — Nieuws van vandaag</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Plak hier de koppen van vandaag — dit bepaalt de kwaliteit van de onderwerpen</div>
                </div>
                <button onClick={laadNieuws} style={{ background: "none", border: `1px solid ${C.cyanDark}`, color: C.cyanDark, padding: "6px 14px", cursor: "pointer", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {nieuwsStatus === "laden" ? "⏳ laden..." : "↺ Automatisch laden"}
                </button>
              </div>
              <textarea value={nieuws} onChange={e => setNieuws(e.target.value)}
                style={{ ...inp, minHeight: 140, resize: "vertical", lineHeight: 1.8, fontSize: 13, background: C.surface }}
                placeholder="Plak hier nieuwskoppen van vandaag, één per regel. Hoe actueler het nieuws, hoe scherper de onderwerpen." />
              {nieuwsStatus === "fout" && <div style={{ fontSize: 11, color: "#ff6b6b", fontFamily: "monospace", marginTop: 6 }}>⚠ Automatisch laden mislukt — plak zelf koppen in</div>}
            </div>

            {/* FLOW 1: GAST */}
            {flow === "gast" && (
              <div>
                <Lbl>02 — Gast invoeren</Lbl>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
                  <Fld label="Naam gast"><input value={gastNaam} onChange={e => { setGastNaam(e.target.value); setGastTopics(null); resetOpzet(); }} placeholder="bijv. Wierd Duk" style={inp} /></Fld>
                  <Fld label="Achtergrond / expertise"><input value={gastBg} onChange={e => { setGastBg(e.target.value); setGastTopics(null); resetOpzet(); }} placeholder="bijv. Journalist De Telegraaf, schrijft over migratie" style={inp} /></Fld>
                </div>
                {gastNaam && gasten.find(g => g.naam.toLowerCase() === gastNaam.toLowerCase())?.historie?.length > 0 && (
                  <div style={{ fontSize: 11, color: C.cyan, fontFamily: "monospace", marginBottom: 12 }}>
                    ✓ {gasten.find(g => g.naam.toLowerCase() === gastNaam.toLowerCase()).historie.length} eerdere optredens gevonden — worden meegenomen
                  </div>
                )}
                <Fld label="Eigen sturing / insteek (optioneel)">
                  <textarea value={eigenInput} onChange={e => setEigenInput(e.target.value)}
                    placeholder="Geef een richting of insteek mee — de tool houdt hier rekening mee"
                    style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6, fontSize: 13, marginBottom: 14 }} />
                </Fld>
                <div style={{ display: "flex", gap: 10 }}>
                  <Btn onClick={() => doGastTopics(1)} disabled={!gastNaam.trim() || !gastBg.trim() || loadT}>{loadT ? "Bezig..." : "Bedenk onderwerpen →"}</Btn>
                  {gastTopics && <BtnSec onClick={resetAll}>Nieuw</BtnSec>}
                </div>

                {gastTopics && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <Lbl>03 — Kies een onderwerp</Lbl>
                      <button onClick={() => { const r = ronde + 1; setRonde(r); doGastTopics(r); }}
                        style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "5px 14px", cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>↺ Andere onderwerpen</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {gastTopics.map((t, i) => {
                        const active = sel?.titel === t.titel;
                        return (
                          <div key={i} onClick={() => { setSel(t); setPrep(null); setOpzetTekst(""); setOnline(null); }}
                            style={{ background: active ? "#0d2a2a" : C.surface, border: `1px solid ${active ? C.cyan : C.border}`, padding: 18, cursor: "pointer" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.cyan : C.white, marginBottom: 8, lineHeight: 1.4 }}>{t.titel}</div>
                            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>{t.omschrijving}</div>
                            {t.bron && <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace", marginBottom: 8 }}>📰 {t.bron}</div>}
                            <div style={{ fontSize: 11, color: C.cyan, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>↗ {t.profiel}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FLOW 2: ONDERWERP */}
            {flow === "onderwerp" && (
              <div>
                <Lbl>02 — Onderwerp invoeren</Lbl>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>Plak een ANP-bericht, een nieuwskop of beschrijf het onderwerp</div>
                <textarea value={onderwerp} onChange={e => { setOnderwerp(e.target.value); setGastSuggesties(null); setGekozenGast(null); resetOpzet(); }}
                  placeholder="Bijv: statushouders worden niet gehuisvest door gemeenten..."
                  style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }} />
                <Fld label="Eigen sturing / insteek (optioneel)">
                  <textarea value={eigenInput} onChange={e => setEigenInput(e.target.value)}
                    placeholder="Geef een richting of insteek mee"
                    style={{ ...inp, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 13, marginTop: 12 }} />
                </Fld>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <Btn onClick={doOnderwerpGasten} disabled={!onderwerp.trim() || loadT}>{loadT ? "Bezig..." : "Wie is de beste gast? →"}</Btn>
                  {gastSuggesties && <BtnSec onClick={resetAll}>Nieuw</BtnSec>}
                </div>

                {gastSuggesties && (
                  <div style={{ marginTop: 28 }}>
                    <Lbl>03 — Kies een gast</Lbl>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {gastSuggesties.map((g, i) => {
                        const active = gekozenGast?.naam === g.naam;
                        return (
                          <div key={i} onClick={() => { setGekozenGast(g); setSel({ titel: onderwerp.slice(0, 60), omschrijving: g.insteek }); setPrep(null); setOpzetTekst(""); setOnline(null); }}
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

            {/* VOORGESPREK */}
            {sel && (flow === "gast" || gekozenGast) && (
              <div style={{ marginTop: 32 }}>
                <Lbl>0{flow === "gast" ? "4" : "4"} — Voorgesprek & andere gasten (optioneel)</Lbl>
                <Fld label="Voorgesprek redacteur met gast">
                  <textarea value={voorgesprek} onChange={e => setVoorgesprek(e.target.value)}
                    placeholder={"R: Wat vind je van X?\nG: Ik denk dat...\nR: Waarom?\nG: Omdat..."}
                    style={{ ...inp, minHeight: 90, resize: "vertical", lineHeight: 1.6 }} />
                </Fld>
                <div style={{ height: 12 }} />
                <Fld label="Andere gasten (optioneel)">
                  <input value={andereGasten} onChange={e => setAndereGasten(e.target.value)} placeholder="bijv. Verslaggever Suzette Nesselaar vanuit Den Haag" style={inp} />
                </Fld>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                    Gast: <span style={{ color: C.cyan, fontWeight: 700 }}>{huidigNaam}</span>
                    {sel.titel && <> — Onderwerp: <span style={{ color: C.cyan, fontWeight: 700 }}>{sel.titel}</span></>}
                  </div>
                  <Btn onClick={doPrep} disabled={loadP}>{loadP ? "Bezig..." : "Genereer gespreksopzet →"}</Btn>
                </div>
              </div>
            )}

            {loadP && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "monospace", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Opzet wordt opgebouwd...</div>}
            {err && <div style={{ marginTop: 16, color: "#ff6b6b", fontSize: 12, fontFamily: "monospace", padding: "10px 14px", border: "1px solid #ff4444", background: "#1a0808" }}>⚠ {err}</div>}

            {/* BEWERKBARE OPZET */}
            {opzetTekst && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <Lbl>05 — Gespreksopzet</Lbl>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={doOnline} disabled={loadO}>{loadO ? "Bezig..." : "Online tekst →"}</Btn>
                    <button onClick={() => exportOpzet(opzetTekst, huidigNaam, sel?.titel || "")}
                      style={{ background: C.cyan, border: "none", color: C.bg, padding: "10px 18px", cursor: "pointer", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase", fontWeight: 700 }}>
                      ↓ Download
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace", marginBottom: 8 }}>Je kunt de opzet hieronder direct bewerken</div>
                <textarea
                  value={opzetTekst}
                  onChange={e => setOpzetTekst(e.target.value)}
                  style={{ ...inp, minHeight: 500, resize: "vertical", lineHeight: 2.0, fontSize: 14, fontFamily: "monospace" }}
                />

                {online && (
                  <div style={{ marginTop: 24, background: C.surfaceLight, border: `1px solid ${C.cyan}`, padding: "20px 22px" }}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: C.cyan, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 12 }}>Online samenvatting</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.white, marginBottom: 10, lineHeight: 1.4 }}>{online.kop}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: "#ccdaee" }}>{online.samenvatting}</div>
                  </div>
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
