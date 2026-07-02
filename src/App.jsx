import React, { useMemo, useState } from 'react';
import { sources } from './data.js';

const STORAGE_KEY = 'tangoQuest.v2';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveHistory(h) { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

const MODES = ['ja_to_en', 'en_to_ja', 'cloze', 'stress'];
const MODE_LABEL = {
  ja_to_en: '日本語 → 英語',
  en_to_ja: '英語 → 日本語',
  stress: 'アクセント',
  cloze: '穴埋め',
};
const MODE_BADGE = {
  ja_to_en: 'badge badge-ja',
  en_to_ja: 'badge badge-en',
  stress: 'badge badge-stress',
  cloze: 'badge badge-cloze',
};

/* Items available for each mode */
function getItems(source, mode) {
  if (mode === 'ja_to_en' || mode === 'en_to_ja') return source.words;
  if (mode === 'stress') return source.words.filter(w => w.syl && w.acc);
  if (mode === 'cloze') return source.cloze;
  return [];
}

/* Build a single quiz question from an item */
function makeQuestion(item, mode, allWords) {
  switch (mode) {
    case 'ja_to_en': {
      const wrongs = shuffle(allWords.filter(w => w.en !== item.en)).slice(0, 3).map(w => w.en);
      return { wordEn: item.en, prompt: item.ja, answer: item.en, choices: shuffle([item.en, ...wrongs]) };
    }
    case 'en_to_ja': {
      const wrongs = shuffle(allWords.filter(w => w.en !== item.en)).slice(0, 3).map(w => w.ja);
      return { wordEn: item.en, prompt: item.en, answer: item.ja, choices: shuffle([item.ja, ...wrongs]) };
    }
    case 'stress': {
      const syls = item.syl.split('·');
      return {
        wordEn: item.en,
        prompt: item.syl,
        answer: `第${item.acc}音節`,
        choices: syls.map((_, i) => `第${i + 1}音節`),
      };
    }
    case 'cloze': {
      return {
        wordEn: item.en,
        prompt: item.sentence,
        translation: item.translation,
        answer: item.answer,
        choices: shuffle([item.answer, ...item.wrong]),
      };
    }
    default:
      return null;
  }
}

/* ───────── App ───────── */
export default function App() {
  const [screen, setScreen] = useState('home');
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [batchSize, setBatchSize] = useState(20);
  const [history, setHistory] = useState(loadHistory);
  const [sessionTested, setSessionTested] = useState(new Set());
  const [quizKey, setQuizKey] = useState(0);

  const selectedSource = sources.find(s => s.id === selectedSourceId);

  function recordResult(sourceId, mode, wordEn, correct) {
    setHistory(prev => {
      const key = `${sourceId}_${mode}_${wordEn}`;
      const entry = prev[key] || { correct: 0, wrong: 0 };
      const next = {
        ...prev,
        [key]: {
          correct: entry.correct + (correct ? 1 : 0),
          wrong: entry.wrong + (correct ? 0 : 1),
        },
      };
      saveHistory(next);
      return next;
    });
  }

  function getModeStats(sourceId, mode) {
    const source = sources.find(s => s.id === sourceId);
    if (!source) return { total: 0, attempted: 0, mastered: 0, weak: 0 };
    const items = getItems(source, mode);
    let attempted = 0, mastered = 0, weak = 0;
    for (const item of items) {
      const entry = history[`${sourceId}_${mode}_${item.en}`];
      if (entry) {
        attempted++;
        if (entry.correct >= 2 && entry.correct > entry.wrong) mastered++;
        if (entry.wrong > 0) weak++;
      }
    }
    return { total: items.length, attempted, mastered, weak };
  }

  function getOverallStats() {
    const vals = Object.values(history);
    return {
      attempted: vals.length,
      mastered: vals.filter(e => e.correct >= 2 && e.correct > e.wrong).length,
      weak: vals.filter(e => e.wrong > 0).length,
    };
  }

  function enterMode(mode) {
    setSelectedMode(mode);
    setSessionTested(new Set());
    setQuizKey(k => k + 1);
    setScreen('quiz');
  }

  function handleContinue(newTested) {
    setSessionTested(newTested);
    setQuizKey(k => k + 1);
  }

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {screen === 'home' && (
          <HomeScreen
            stats={getOverallStats()}
            onSelect={id => { setSelectedSourceId(id); setScreen('detail'); }}
            onClear={() => { setHistory({}); saveHistory({}); }}
          />
        )}
        {screen === 'detail' && selectedSource && (
          <DetailScreen
            source={selectedSource}
            history={history}
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            getModeStats={mode => getModeStats(selectedSource.id, mode)}
            onBack={() => setScreen('home')}
            onStartMode={enterMode}
          />
        )}
        {screen === 'quiz' && selectedSource && selectedMode && (
          <QuizScreen
            key={quizKey}
            source={selectedSource}
            mode={selectedMode}
            batchSize={batchSize}
            sessionTested={sessionTested}
            onResult={(wordEn, correct) => recordResult(selectedSource.id, selectedMode, wordEn, correct)}
            onContinue={handleContinue}
            onBack={() => setScreen('detail')}
          />
        )}
      </div>
    </main>
  );
}

/* ───────── Header ───────── */
function Header({ title, onBack }) {
  return (
    <header className="header">
      {onBack ? <button className="ghost" onClick={onBack}>&#8249;</button> : <span />}
      <h1>{title}</h1>
      <span />
    </header>
  );
}

/* ───────── Home ───────── */
function HomeScreen({ stats, onSelect, onClear }) {
  return (
    <section className="screen home-screen">
      <div className="hero-card">
        <p className="eyebrow">単語テスト繰り返し v2.0</p>
        <h1>Tango Quest</h1>
        <p>4つのモードで全単語を繰り返し練習。バッチサイズを設定して効率的に学習しよう。</p>
      </div>

      <div className="stats-grid">
        <div className="stat"><strong>{stats.attempted}</strong><span>挑戦済</span></div>
        <div className="stat"><strong>{stats.mastered}</strong><span>習得</span></div>
        <div className="stat"><strong>{stats.weak}</strong><span>苦手</span></div>
      </div>

      <h2>テストソース</h2>
      <div className="set-list">
        {sources.map(source => (
          <button className="set-row" key={source.id} onClick={() => onSelect(source.id)}>
            <div>
              <strong>{source.title}</strong>
              <span>{source.subtitle}</span>
              <span>{source.words.length}単語</span>
            </div>
            <b>&rsaquo;</b>
          </button>
        ))}
      </div>

      {stats.attempted > 0 && (
        <button className="danger full" style={{ marginTop: 24 }} onClick={() => {
          if (confirm('すべての学習履歴をリセットしますか？')) onClear();
        }}>
          履歴をリセット
        </button>
      )}
    </section>
  );
}

/* ───────── Source Detail ───────── */
function DetailScreen({ source, history, batchSize, setBatchSize, getModeStats, onBack, onStartMode }) {
  return (
    <section className="screen">
      <Header title={source.title} onBack={onBack} />

      <div className="hero-card compact">
        <p className="eyebrow">{source.words.length}単語</p>
        <h1>{source.title}</h1>
        <p>{source.subtitle}</p>
      </div>

      <h2>バッチサイズ</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {[10, 20, 30, 40, 50].map(size => (
          <button
            key={size}
            className={size === batchSize ? 'primary' : 'secondary'}
            style={{ flex: 1, minHeight: 44, padding: '10px 4px', borderRadius: 14 }}
            onClick={() => setBatchSize(size)}
          >
            {size}
          </button>
        ))}
      </div>

      <h2>テストモード</h2>
      <div className="set-list">
        {MODES.map(mode => {
          const st = getModeStats(mode);
          return (
            <button className="set-row" key={mode} onClick={() => onStartMode(mode)}>
              <div>
                <span className={MODE_BADGE[mode]}>{MODE_LABEL[mode]}</span>
                <strong>{st.total}問</strong>
                <span>{st.mastered}/{st.total} 習得 ・ {st.weak} 苦手</span>
              </div>
              <b>&rsaquo;</b>
            </button>
          );
        })}
      </div>

      <h2>単語一覧</h2>
      <div className="word-list">
        {source.words.map(word => {
          const checkModes = ['ja_to_en', 'en_to_ja'];
          if (word.syl && word.acc) checkModes.push('stress');
          if (source.cloze.some(c => c.en === word.en)) checkModes.push('cloze');

          let totalC = 0, totalW = 0;
          for (const m of checkModes) {
            const e = history[`${source.id}_${m}_${word.en}`];
            if (e) { totalC += e.correct; totalW += e.wrong; }
          }
          const status = (totalC === 0 && totalW === 0) ? '' : (totalC > totalW ? ' mastered' : ' weak');

          return (
            <div className={`word-row${status}`} key={word.en}>
              <div>
                <strong>{word.en}</strong>
                <span>{word.ja}</span>
              </div>
              {(totalC > 0 || totalW > 0) && <small>{totalC}&#x2713; {totalW}&#x2717;</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────── Quiz ───────── */
function QuizScreen({ source, mode, batchSize, sessionTested, onResult, onContinue, onBack }) {
  const allItems = getItems(source, mode);
  const totalForMode = allItems.length;

  /* Pick this batch's items from whatever hasn't been tested yet */
  const batchItems = useMemo(() => {
    const remaining = allItems.filter(it => !sessionTested.has(it.en));
    return shuffle(remaining).slice(0, batchSize);
  }, []);                                 // run once on mount

  /* Generate questions for the batch */
  const questions = useMemo(() => {
    return batchItems.map(it => makeQuestion(it, mode, source.words));
  }, []);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const testedAfterBatch = sessionTested.size + batchItems.length;
  const remainingAfterBatch = totalForMode - testedAfterBatch;

  /* ── No questions left ── */
  if (questions.length === 0) {
    return (
      <section className="screen">
        <Header title={MODE_LABEL[mode]} onBack={onBack} />
        <div className="hero-card compact" style={{ textAlign: 'center' }}>
          <p className="eyebrow">完了</p>
          <h1>&#x1f389; 全問完了！</h1>
          <p>{totalForMode}問すべてテスト済みです。</p>
        </div>
        <button className="primary full" onClick={onBack}>戻る</button>
      </section>
    );
  }

  /* ── Batch finished → show results ── */
  if (finished) {
    const correctCount = results.filter(r => r.correct).length;
    const wrongResults = results.filter(r => !r.correct);
    const newTested = new Set(sessionTested);
    batchItems.forEach(it => newTested.add(it.en));

    return (
      <section className="screen">
        <Header title="結果" onBack={onBack} />

        <div className="hero-card compact" style={{ textAlign: 'center' }}>
          <p className="eyebrow">バッチスコア</p>
          <h1>{correctCount} / {results.length}</h1>
          <p>{Math.round((correctCount / results.length) * 100)}% 正解</p>
        </div>

        <div className="stats-grid">
          <div className="stat"><strong>{correctCount}</strong><span>正解</span></div>
          <div className="stat"><strong>{wrongResults.length}</strong><span>不正解</span></div>
          <div className="stat"><strong>{testedAfterBatch}/{totalForMode}</strong><span>進捗</span></div>
        </div>

        {wrongResults.length > 0 && (
          <>
            <h2>間違えた問題</h2>
            <div className="word-list">
              {wrongResults.map((r, i) => (
                <div className="word-row weak" key={i}>
                  <div>
                    <span className={MODE_BADGE[mode]}>{MODE_LABEL[mode]}</span>
                    <strong>{r.question.prompt}</strong>
                    <span className="correct-label">正解: {r.question.answer}</span>
                    <span className="wrong-label">あなたの回答: {r.chosen}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {remainingAfterBatch > 0 ? (
          <button className="primary full" onClick={() => onContinue(newTested)}>
            続きますか？（残り{remainingAfterBatch}問）
          </button>
        ) : (
          <div className="hero-card compact" style={{ textAlign: 'center', marginTop: 16 }}>
            <h2 style={{ margin: 0 }}>&#x1f389; 全問完了！</h2>
          </div>
        )}
        <button className="secondary full" onClick={onBack}>戻る</button>
      </section>
    );
  }

  /* ── Active quiz ── */
  const progressInSession = sessionTested.size + index + 1;
  const isEnPrompt = mode === 'en_to_ja' || mode === 'cloze' || mode === 'stress';

  function choose(choice) {
    if (selected !== null) return;
    const correct = choice === question.answer;
    setSelected(choice);
    onResult(question.wordEn, correct);
    setResults(prev => [...prev, { question, chosen: choice, correct }]);

    setTimeout(() => {
      setSelected(null);
      if (index + 1 >= questions.length) {
        setFinished(true);
      } else {
        setIndex(index + 1);
      }
    }, 1200);
  }

  return (
    <section className="screen quiz-screen">
      <Header title={`${index + 1}/${questions.length}`} onBack={onBack} />

      <div className="quiz-badge-row">
        <span className={MODE_BADGE[mode]}>{MODE_LABEL[mode]}</span>
      </div>

      <div className="quiz-title">
        {mode === 'stress' ? (
          <>
            <p className="stress-label">アクセントの位置を選んでください</p>
            <h1>
              {question.prompt}
              <button className="sound" onClick={() => speak(question.wordEn)}>&#x1f50a;</button>
            </h1>
          </>
        ) : (
          <>
            <h1>
              {question.prompt}
              {isEnPrompt && (
                <button className="sound" onClick={() => {
                  if (mode === 'cloze') {
                    speak(question.prompt.replace(/\(\s*\)/, question.answer));
                  } else {
                    speak(question.prompt);
                  }
                }}>&#x1f50a;</button>
              )}
            </h1>
            {mode === 'cloze' && question.translation && (
              <p className="cloze-translation">{question.translation}</p>
            )}
          </>
        )}
      </div>

      <div className="choices">
        {question.choices.map((choice, i) => {
          let cls = '';
          if (selected !== null) {
            if (choice === question.answer) cls = ' correct';
            else if (choice === selected) cls = ' wrong';
          }
          return (
            <button key={`${choice}-${i}`} className={cls} onClick={() => choose(choice)}>
              <span>{i + 1}.</span>{choice}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className={`toast ${selected === question.answer ? '' : 'toast-wrong'}`}>
          {selected === question.answer
            ? '正解！'
            : `不正解。正解は「${question.answer}」`}
        </div>
      )}

      <div className="progress-bar-bottom">
        <div className="progress-fill" style={{ width: `${(progressInSession / totalForMode) * 100}%` }} />
      </div>
    </section>
  );
}
