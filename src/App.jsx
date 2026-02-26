import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";

const DUTCH_VOICE_PREFS = ["nl-BE", "nl-NL", "nl"];

// ── Speech ────────────────────────────────────────────────
function speakWord(word, rate = 0.85) {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = "nl-BE";
    utter.rate = rate;
    utter.pitch = 1.0;
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const dutch = voices.find((v) => DUTCH_VOICE_PREFS.some((p) => v.lang.startsWith(p)));
      if (dutch) utter.voice = dutch;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; trySpeak(); };
      setTimeout(trySpeak, 500);
    }
  });
}

// ── Anthropic API ─────────────────────────────────────────
async function extractFromImage(base64, mediaType) {
  const response = await fetch("/api/extract-words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: `This is a school word list photo.
1) Find the series/title name (e.g. "T6 L6") - usually at the top. If none, use "Woordenlijst".
2) Extract ALL words the student needs to learn/spell.
Return ONLY JSON: {"title": "T6 L6", "words": ["woord1","woord2"]}
Only target words in the array, not numbers, titles, or instructions.`
          }
        ]
      }]
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }
  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Cloud library API ─────────────────────────────────────
async function fetchLibrary() {
  const res = await fetch("/api/wordlists");
  if (!res.ok) throw new Error("Kon bibliotheek niet laden");
  return res.json();
}

async function saveWordlist(title, words) {
  const res = await fetch("/api/wordlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, words }),
  });
  if (!res.ok) throw new Error("Kon niet opslaan");
  return res.json();
}

async function deleteWordlist(id) {
  const res = await fetch("/api/wordlists", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("Kon niet verwijderen");
}

// ── Helpers ───────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pillColors = [
  { background: "#fff3cd", color: "#856404" },
  { background: "#d4edda", color: "#1a6b2f" },
  { background: "#cce5ff", color: "#004085" },
  { background: "#f8d7da", color: "#721c24" },
  { background: "#e2d9f3", color: "#4a235a" },
  { background: "#d1ecf1", color: "#0c5460" },
];

const starPositions = [
  { top: "5%", left: "3%", fontSize: "14px", opacity: 0.4, animationDelay: "0s", animationDuration: "3s" },
  { top: "10%", right: "5%", fontSize: "20px", opacity: 0.3, animationDelay: "0.3s", animationDuration: "4s" },
  { top: "20%", left: "8%", fontSize: "10px", opacity: 0.5, animationDelay: "0.6s", animationDuration: "3.5s" },
  { top: "35%", right: "3%", fontSize: "16px", opacity: 0.35, animationDelay: "0.9s", animationDuration: "4s" },
  { top: "50%", left: "2%", fontSize: "12px", opacity: 0.4, animationDelay: "1.2s", animationDuration: "3s" },
  { top: "65%", right: "6%", fontSize: "18px", opacity: 0.25, animationDelay: "1.5s", animationDuration: "4.5s" },
  { top: "75%", left: "5%", fontSize: "14px", opacity: 0.45, animationDelay: "1.8s", animationDuration: "3s" },
  { top: "85%", right: "4%", fontSize: "10px", opacity: 0.3, animationDelay: "2.1s", animationDuration: "3.5s" },
  { top: "90%", left: "10%", fontSize: "22px", opacity: 0.2, animationDelay: "2.4s", animationDuration: "4s" },
  { top: "15%", left: "50%", fontSize: "8px", opacity: 0.3, animationDelay: "2.7s", animationDuration: "3s" },
  { bottom: "5%", right: "15%", fontSize: "16px", opacity: 0.35, animationDelay: "3s", animationDuration: "4s" },
  { top: "45%", right: "12%", fontSize: "11px", opacity: 0.4, animationDelay: "3.3s", animationDuration: "3.5s" },
];

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("upload");
  const [words, setWords] = useState([]);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [results, setResults] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetchLibrary()
      .then(setLibrary)
      .catch(() => setLibrary([]))
      .finally(() => setLibraryLoading(false));
  }, []);

  const reloadLibrary = async () => {
    try {
      const data = await fetchLibrary();
      setLibrary(data);
    } catch {}
  };

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setPhase("loading");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const [header, base64] = dataUrl.split(",");
      let mediaType = header.match(/:(.*?);/)[1];
      if (mediaType === "image/jfif" || mediaType === "image/jpg") mediaType = "image/jpeg";
      try {
        const result = await extractFromImage(base64, mediaType);
        const extracted = result.words || result;
        const title = result.title || "Woordenlijst";
        if (!extracted.length) throw new Error("Geen woorden gevonden in de foto");
        // Auto-save to cloud
        setSaving(true);
        const saved = await saveWordlist(title, extracted);
        setSaving(false);
        setWords(extracted);
        setSeriesTitle(title);
        setCurrentId(saved.id);
        await reloadLibrary();
        setPhase("ready");
      } catch (err) {
        setSaving(false);
        setError(err.message || "Kon woorden niet uitlezen. Probeer een duidelijkere foto.");
        setPhase("upload");
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const loadFromLibrary = (entry) => {
    setWords(entry.words);
    setSeriesTitle(entry.title);
    setCurrentId(entry.id);
    setError(null);
    setPhase("ready");
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteWordlist(id);
      await reloadLibrary();
    } catch {}
  };

  const handleSaveTitle = async () => {
    if (!tempTitle.trim()) return;
    try {
      const saved = await saveWordlist(tempTitle.trim(), words);
      setSeriesTitle(tempTitle.trim());
      setCurrentId(saved.id);
      await reloadLibrary();
    } catch {}
    setEditingTitle(false);
  };

  const startDictation = () => {
    const shuffled = shuffle(words);
    setQueue(shuffled.slice(1));
    setCurrent(shuffled[0]);
    setRevealed(false);
    setScore({ correct: 0, wrong: 0 });
    setResults([]);
    setPhase("dictating");
    setTimeout(() => doSpeak(shuffled[0]), 300);
  };

  const doSpeak = async (word) => {
    setSpeaking(true);
    await speakWord(word);
    setSpeaking(false);
  };

  const markResult = (isCorrect) => {
    const newResults = [...results, { word: current, correct: isCorrect }];
    const newScore = {
      correct: score.correct + (isCorrect ? 1 : 0),
      wrong: score.wrong + (isCorrect ? 0 : 1),
    };
    if (queue.length === 0) {
      setResults(newResults);
      setScore(newScore);
      setPhase("result");
    } else {
      const next = queue[0];
      setQueue(queue.slice(1));
      setCurrent(next);
      setRevealed(false);
      setResults(newResults);
      setScore(newScore);
      setTimeout(() => doSpeak(next), 400);
    }
  };

  const total = words.length;
  const done = results.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="root">
      <div className="stars">
        {starPositions.map((s, i) => (
          <span key={i} className="star" style={s}>★</span>
        ))}
      </div>

      <div className="card">
        <div className="header">
          <span className="pencil-icon">✏️</span>
          <h1 className="title">Dictee!</h1>
          <span className="pencil-icon">✏️</span>
        </div>

        {/* UPLOAD */}
        {phase === "upload" && (
          <div className="section">
            <p className="subtitle">Upload een foto of kies een opgeslagen reeks</p>
            {error && <div className="error-box">⚠️ {error}</div>}
            <div
              className={`dropzone${dragOver ? " dropzone-active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current.click()}
            >
              <div className="drop-icon">📸</div>
              <div className="drop-text">Klik of sleep je foto hier</div>
              <div className="drop-sub">JPG, PNG of HEIC</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => processFile(e.target.files[0])} />
            </div>

            <div className="library">
              <p className="library-title">☁️ Gedeelde bibliotheek</p>
              {libraryLoading ? (
                <div className="lib-loading">
                  <span className="dot" style={{ animationDelay: "0s" }} />
                  <span className="dot" style={{ animationDelay: "0.2s" }} />
                  <span className="dot" style={{ animationDelay: "0.4s" }} />
                </div>
              ) : library.length === 0 ? (
                <p className="lib-empty">Nog geen reeksen opgeslagen. Upload een foto!</p>
              ) : (
                library.map((entry) => (
                  <div key={entry.id} className="library-item" onClick={() => loadFromLibrary(entry)}>
                    <div className="library-item-info">
                      <span className="library-item-name">{entry.title}</span>
                      <span className="library-item-meta">
                        {entry.words.length} woorden · {new Date(entry.created_at).toLocaleDateString("nl-BE")}
                      </span>
                    </div>
                    <button className="library-delete" onClick={(e) => handleDelete(entry.id, e)}>✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div className="section">
            <div className="load-anim">📖</div>
            <p className="load-text">{saving ? "Opslaan in bibliotheek..." : "Woorden uitlezen..."}</p>
            <div className="dots">
              <span className="dot" style={{ animationDelay: "0s" }} />
              <span className="dot" style={{ animationDelay: "0.2s" }} />
              <span className="dot" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        {/* READY */}
        {phase === "ready" && (
          <div className="section">
            {editingTitle ? (
              <div className="title-edit-row">
                <input
                  className="title-input"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  autoFocus
                />
                <button className="title-save-btn" onClick={handleSaveTitle}>✓</button>
                <button className="title-cancel-btn" onClick={() => setEditingTitle(false)}>✕</button>
              </div>
            ) : (
              <div className="series-badge" onClick={() => { setTempTitle(seriesTitle); setEditingTitle(true); }}>
                <span>📋 {seriesTitle}</span>
                <span className="edit-icon">✏️</span>
              </div>
            )}
            <div className="badge">🎉 {words.length} woorden</div>
            <div className="word-cloud">
              {words.map((w, i) => (
                <span key={i} className="word-pill" style={pillColors[i % pillColors.length]}>{w}</span>
              ))}
            </div>
            <button className="big-btn" onClick={startDictation}>🎤 Start Dictee!</button>
            <button className="ghost-btn" onClick={() => setPhase("upload")}>← Terug naar bibliotheek</button>
          </div>
        )}

        {/* DICTATING */}
        {phase === "dictating" && current && (
          <div className="section">
            <div className="series-label">{seriesTitle}</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">{done}/{total}</div>
            <div className="speak-box">
              <span className={`speak-icon${speaking ? " speak-pulse" : ""}`}>🔊</span>
              <p className="speak-prompt">{speaking ? "Luister goed..." : "Schrijf het woord op!"}</p>
            </div>
            <button className="repeat-btn" onClick={() => doSpeak(current)} disabled={speaking}>
              🔁 Nog eens
            </button>
            {!revealed ? (
              <div className="action-row">
                <button className="reveal-btn" onClick={() => setRevealed(true)}>👀 Toon het woord</button>
                <button className="skip-btn" onClick={() => markResult(false)}>⏭ Volgende</button>
              </div>
            ) : (
              <>
                <div className="revealed-word">{current}</div>
                <div className="mark-row">
                  <button className="correct-btn" onClick={() => markResult(true)}>✓ Juist</button>
                  <button className="wrong-btn" onClick={() => markResult(false)}>✗ Fout</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* RESULT */}
        {phase === "result" && (
          <div className="section">
            <div className="series-label">{seriesTitle}</div>
            <div className="result-emoji">
              {score.wrong === 0 ? "🏆" : score.correct >= score.wrong ? "🌟" : "💪"}
            </div>
            <h2 className="result-title">
              {score.wrong === 0 ? "Perfecte score!" : `${score.correct} van de ${total} goed!`}
            </h2>
            <div className="score-row">
              <div className="score-box score-correct">
                <span className="score-num">{score.correct}</span>
                <span className="score-label">Juist ✓</span>
              </div>
              <div className="score-box score-wrong">
                <span className="score-num">{score.wrong}</span>
                <span className="score-label">Fout ✗</span>
              </div>
            </div>
            {score.wrong > 0 && (
              <div className="wrong-list">
                <p className="wrong-title">Nog oefenen:</p>
                <div className="wrong-words">
                  {results.filter((r) => !r.correct).map((r, i) => (
                    <span key={i} className="wrong-word">{r.word}</span>
                  ))}
                </div>
              </div>
            )}
            <button className="big-btn" onClick={startDictation}>🔄 Opnieuw</button>
            <button className="ghost-btn" onClick={() => setPhase("ready")}>Woordenlijst bekijken</button>
            <button className="ghost-btn" onClick={() => setPhase("upload")}>← Terug naar bibliotheek</button>
          </div>
        )}
      </div>
    </div>
  );
}
