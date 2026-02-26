import { useState, useRef, useCallback } from "react";
import "./App.css";

const DUTCH_VOICE_PREFS = ["nl-BE", "nl-NL", "nl"];

function speakWord(word, rate = 0.85) {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = "nl-BE";
    utter.rate = rate;
    utter.pitch = 1.0;

    // Wait for voices to load if needed
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const dutch = voices.find((v) =>
        DUTCH_VOICE_PREFS.some((p) => v.lang.startsWith(p))
      );
      if (dutch) utter.voice = dutch;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
      // Fallback if event never fires
      setTimeout(trySpeak, 500);
    }
  });
}

async function extractWordsFromImage(base64, mediaType) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("VITE_ANTHROPIC_API_KEY is not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-key": "true",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `This is a school word list photo. Extract ALL the words from this image that a student needs to learn/spell. Return ONLY a JSON array of strings, nothing else. Example: ["woord1","woord2","woord3"]. Include only the target words, not numbers, titles, or instructions.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "[]";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

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

export default function App() {
  const [phase, setPhase] = useState("upload");
  const [words, setWords] = useState([]);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [results, setResults] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setPhase("loading");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const [header, base64] = dataUrl.split(",");
      const mediaType = header.match(/:(.*?);/)[1];
      try {
        const extracted = await extractWordsFromImage(base64, mediaType);
        if (!extracted.length) throw new Error("Geen woorden gevonden in de foto");
        setWords(extracted);
        setPhase("ready");
      } catch (err) {
        setError(err.message || "Kon woorden niet uitlezen. Probeer een duidelijkere foto.");
        setPhase("upload");
      }
    };
    reader.readAsDataURL(file);
  }, []);

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

        {/* UPLOAD PHASE */}
        {phase === "upload" && (
          <div className="section">
            <p className="subtitle">Maak een foto van je woordenlijst en upload ze hier</p>
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
          </div>
        )}

        {/* LOADING PHASE */}
        {phase === "loading" && (
          <div className="section">
            <div className="load-anim">📖</div>
            <p className="load-text">Woorden uitlezen...</p>
            <div className="dots">
              <span className="dot" style={{ animationDelay: "0s" }} />
              <span className="dot" style={{ animationDelay: "0.2s" }} />
              <span className="dot" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        {/* READY PHASE */}
        {phase === "ready" && (
          <div className="section">
            <div className="badge">🎉 {words.length} woorden gevonden!</div>
            <div className="word-cloud">
              {words.map((w, i) => (
                <span key={i} className="word-pill" style={pillColors[i % pillColors.length]}>{w}</span>
              ))}
            </div>
            <button className="big-btn" onClick={startDictation}>🎤 Start Dictee!</button>
            <button className="ghost-btn" onClick={() => setPhase("upload")}>Andere foto</button>
          </div>
        )}

        {/* DICTATING PHASE */}
        {phase === "dictating" && current && (
          <div className="section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">{done}/{total}</div>

            <div className="speak-box">
              <span className={`speak-icon${speaking ? " speak-pulse" : ""}`}>🔊</span>
              <p className="speak-prompt">
                {speaking ? "Luister goed..." : "Schrijf het woord op!"}
              </p>
            </div>

            <button className="repeat-btn" onClick={() => doSpeak(current)} disabled={speaking}>
              🔁 Nog eens
            </button>

            {!revealed ? (
              <button className="reveal-btn" onClick={() => setRevealed(true)}>
                👀 Toon het woord
              </button>
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

        {/* RESULT PHASE */}
        {phase === "result" && (
          <div className="section">
            <div className="result-emoji">
              {score.wrong === 0 ? "🏆" : score.correct >= score.wrong ? "🌟" : "💪"}
            </div>
            <h2 className="result-title">
              {score.wrong === 0
                ? "Perfecte score!"
                : `${score.correct} van de ${total} goed!`}
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
            <button className="ghost-btn" onClick={() => setPhase("upload")}>Nieuwe foto</button>
          </div>
        )}
      </div>
    </div>
  );
}
