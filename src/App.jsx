import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// אלף-בית עברי מלא כולל סופיות
const HEBREW_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתםןץףך'.split('');

function App() {
  // --- מצבי אפליקציה ---
  const [appState, setAppState] = useState('menu'); 
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [noMorePhrases, setNoMorePhrases] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // --- הגדרות משחק (רמה וגיל) ---
  const [selectedCategory, setSelectedCategory] = useState('ילדים');
  const [selectedLevel, setSelectedLevel] = useState('easy'); 

  // --- נתוני שחקן ---
  const [player, setPlayer] = useState(null);
  const [score, setScore] = useState(0);
  const [loginName, setLoginName] = useState('');
  const [loginContact, setLoginContact] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- נתוני משחק ---
  const [currentPhrase, setCurrentPhrase] = useState(null);
  const [cipherMap, setCipherMap] = useState({});
  const [userGuesses, setUserGuesses] = useState({}); 
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [correctCiphers, setCorrectCiphers] = useState([]); 
  const [hintsUsedInRound, setHintsUsedInRound] = useState(0); 

  // --- תוספות חדשות: זיכרון, נעילות ורמאויות ---
  const [initialCiphers, setInitialCiphers] = useState([]); // מעקב אחרי אותיות התחלתיות (קבועות)
  const [strikes, setStrikes] = useState({}); // מעקב אחרי שגיאות { cipherNum: count }
  const [hintLimits, setHintLimits] = useState({}); // גבולות שגיאה { cipherNum: limit }
  const [forcedHintFor, setForcedHintFor] = useState(null); // תיבה שחייבת רמז כדי להשתחרר

  // --- זיכרון הלקוח (Persistence) ---
  useEffect(() => {
    const savedPlayer = localStorage.getItem('crypto_player_session');
    if (savedPlayer) {
      const p = JSON.parse(savedPlayer);
      // ודא שיש מערכים וירטואליים אם חסר ב-DB
      p.completed_phrases = p.completed_phrases || [];
      p.saved_progress = p.saved_progress || {};
      setPlayer(p);
      setScore(p.score || 0);
    }
  }, []);

  const syncPlayerToDB = async (updatedFields) => {
    if (player?.id) {
      const { error } = await supabase.from('players').update(updatedFields).eq('id', player.id);
      if (!error) {
        const updatedPlayer = { ...player, ...updatedFields };
        localStorage.setItem('crypto_player_session', JSON.stringify(updatedPlayer));
        setPlayer(updatedPlayer);
      }
    }
  };

  const updateScore = (amount) => {
    setScore(prev => {
      const newScore = Math.max(0, prev + amount);
      if (player) syncPlayerToDB({ score: newScore });
      return newScore;
    });
  };

  // --- לוגיקת משחק (חשיפה חכמה ושחזור) ---
  
  const generateCipherAndStart = (text, loadedProgress = null) => {
    if (loadedProgress) {
      // אם יש שמירה קודמת למשפט הזה - נשחזר אותה!
      setCipherMap(loadedProgress.cipherMap);
      setUserGuesses(loadedProgress.userGuesses);
      setCorrectCiphers(loadedProgress.correctCiphers);
      setInitialCiphers(loadedProgress.initialCiphers);
      setStrikes(loadedProgress.strikes);
      setHintLimits(loadedProgress.hintLimits);
      setForcedHintFor(loadedProgress.forcedHintFor);
      setHintsUsedInRound(loadedProgress.hintsUsedInRound);
      setSelectedNumber(null);
      setShowWinModal(false);
      return;
    }

    const numbers = Array.from({ length: 27 }, (_, i) => i + 1);
    const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);
    const newCipher = {};
    
    HEBREW_ALPHABET.forEach((letter, index) => { newCipher[letter] = shuffledNumbers[index]; });
    newCipher[' '] = ' ';
    setCipherMap(newCipher);

    const textNoSpaces = text.replace(/\s/g, '');
    const uniqueChars = [...new Set(textNoSpaces.split(''))];
    const wordsCount = text.trim().split(/\s+/).length;
    
    const charFrequency = {};
    textNoSpaces.split('').forEach(char => { charFrequency[char] = (charFrequency[char] || 0) + 1; });
    const sortedCharsByFreq = uniqueChars.sort((a, b) => charFrequency[b] - charFrequency[a]);

    let numToReveal = 1; 
    if (selectedLevel === 'easy') numToReveal = wordsCount >= 2 ? 1 : 2;
    else if (selectedLevel === 'medium') numToReveal = 1;
    else if (selectedLevel === 'hard') numToReveal = 1;

    if (numToReveal >= uniqueChars.length) numToReveal = Math.max(0, uniqueChars.length - 1);

    const initialGuesses = {};
    const initialCorrect = [];
    for (let i = 0; i < numToReveal; i++) {
      const char = sortedCharsByFreq[i];
      const cipherNum = newCipher[char];
      initialGuesses[cipherNum] = char;
      initialCorrect.push(cipherNum);
    }

    setUserGuesses(initialGuesses);
    setCorrectCiphers(initialCorrect);
    setInitialCiphers(initialCorrect); // שומר מי הן הקבועות
    setStrikes({});
    setHintLimits({});
    setForcedHintFor(null);
    setHintsUsedInRound(0);
    setSelectedNumber(null);
    setShowWinModal(false);
  };

  const fetchRandomPhrase = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('phrases').select('*')
      .eq('category', selectedCategory).eq('level', selectedLevel);

    if (!error && data && data.length > 0) {
      // סינון משפטים שכבר פתרנו
      const completed = player?.completed_phrases || [];
      const available = data.filter(item => !completed.includes(item.id));

      if (available.length > 0) {
        const randomItem = available[Math.floor(Math.random() * available.length)];
        setCurrentPhrase(randomItem);
        
        // בדיקה אם יש שמירה קודמת (דילגנו עליו בעבר)
        const savedProg = player?.saved_progress?.[randomItem.id];
        generateCipherAndStart(randomItem.text, savedProg);
        
        setNoMorePhrases(false);
      } else {
        setNoMorePhrases(true); // כולם נפתרו!
      }
    } else {
      setNoMorePhrases(true);
    }
    setLoading(false);
  };

  // --- שמירת מצב ודילוג ---
  const saveCurrentProgress = () => {
    if (!player || !currentPhrase) return;
    const currentProg = {
      cipherMap, userGuesses, correctCiphers, initialCiphers, 
      strikes, hintLimits, forcedHintFor, hintsUsedInRound
    };
    const updatedProgress = { ...(player.saved_progress || {}), [currentPhrase.id]: currentProg };
    syncPlayerToDB({ saved_progress: updatedProgress });
  };

  const handleSkip = () => {
    saveCurrentProgress(); // שומר את המצב הנוכחי לדילוג
    fetchRandomPhrase();   // מביא משפט חדש
  };

  // בדיקת ניצחון
  useEffect(() => {
    if (currentPhrase && Object.keys(userGuesses).length > 0) {
      const isWin = currentPhrase.text.split('').every(char => {
        if (char === ' ') return true;
        return userGuesses[cipherMap[char]] === char;
      });

      if (isWin && !showWinModal) {
        setShowWinModal(true);
        updateScore(5);
        // נוסיף לרשימת הפתורים ונמחוק מהשמירות החלקיות
        if (player) {
          const newCompleted = [...(player.completed_phrases || []), currentPhrase.id];
          const updatedSaved = { ...(player.saved_progress || {}) };
          delete updatedSaved[currentPhrase.id];
          syncPlayerToDB({ completed_phrases: newCompleted, saved_progress: updatedSaved });
        }
      }
    }
  }, [userGuesses]);

  // --- לוגיקת רמזים ומניעת רמאות ---
  const applyHint = () => {
    let cost = hintsUsedInRound === 0 ? 0 : (hintsUsedInRound === 1 ? 3 : 5);
    if (score < cost) return alert(`חסר לך ניקוד! רמז זה עולה ${cost} נקודות.`);

    // אם יש תיבה חסומה - הרמז מיועד אך ורק לשחרר אותה!
    if (forcedHintFor !== null) {
      const currentLimit = hintLimits[forcedHintFor] || 5;
      const newLimit = currentLimit === 5 ? 3 : 1;
      
      setHintLimits(prev => ({...prev, [forcedHintFor]: newLimit}));
      setStrikes(prev => ({...prev, [forcedHintFor]: 0}));
      setForcedHintFor(null);
      updateScore(-cost);
      setHintsUsedInRound(prev => prev + 1);
      alert(`התיבה שוחררה! קיבלת עוד ${newLimit} ניסיונות לאות זו.`);
      return;
    }

    // רמז רגיל
    const unGuessedChars = currentPhrase.text.split('').filter(char => char !== ' ' && userGuesses[cipherMap[char]] !== char);
    if (unGuessedChars.length > 0) {
      const randomChar = unGuessedChars[Math.floor(Math.random() * unGuessedChars.length)];
      handleVirtualKeyPress(randomChar, cipherMap[randomChar]);
      updateScore(-cost);
      setHintsUsedInRound(prev => prev + 1);
    }
  };

  const handleVirtualKeyPress = (letter, forcedNum = null) => {
    const targetNum = forcedNum || selectedNumber;
    if (targetNum === null) return;

    // חסימה: אי אפשר לשנות את אותיות הבונוס מהתחלה
    if (initialCiphers.includes(targetNum)) return; 

    // חסימה: אם יש אות נעולה, אי אפשר לשחק עד שמשחררים אותה
    if (forcedHintFor !== null && forcedHintFor !== targetNum) {
      return alert("קודם שחרר את התיבה האדומה הנעולה בעזרת רמז!");
    }

    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNum);
    
    if (letter === correctLetter) {
      // ניחוש נכון
      if (!correctCiphers.includes(targetNum)) {
        updateScore(1);
        setCorrectCiphers(prev => [...prev, targetNum]);
        setStrikes(prev => ({...prev, [targetNum]: 0})); // איפוס פסילות
      }
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
    } else {
      // ניחוש שגוי או מחיקה
      if (letter === '') {
        setUserGuesses(prev => ({ ...prev, [targetNum]: '' }));
        return;
      }

      // מנגנון פסילות
      const limit = hintLimits[targetNum] || 5;
      const currentStrikes = (strikes[targetNum] || 0) + 1;

      if (currentStrikes === limit - 1) {
        alert("לא לרמות, ניסיון אחרון לאות הזאת לפני בקשת רמז!");
      } else if (currentStrikes >= limit) {
        setForcedHintFor(targetNum);
        alert("חרגת ממספר הניסיונות לאות הזו! לחץ על כפתור הרמז כדי לשחרר.");
      }

      setStrikes(prev => ({...prev, [targetNum]: currentStrikes}));
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
    }
  };

  // --- התחברות קפדנית ---
  const handleLoginOrRegister = async () => {
    if (!loginContact.trim() || !loginName.trim()) {
      setLoginError('חובה להזין שם פרטי וטלפון/אימייל במדויק!');
      return;
    }
    setLoading(true);
    const { data: existingPlayer } = await supabase.from('players').select('*').eq('contact_info', loginContact.trim()).single();

    if (existingPlayer) {
      if (existingPlayer.first_name !== loginName.trim()) {
        setLoginError('השם אינו תואם למספר הטלפון הקיים במערכת.');
        setLoading(false);
        return;
      }
      existingPlayer.completed_phrases = existingPlayer.completed_phrases || [];
      existingPlayer.saved_progress = existingPlayer.saved_progress || {};
      setPlayer(existingPlayer);
      setScore(existingPlayer.score || 0);
      localStorage.setItem('crypto_player_session', JSON.stringify(existingPlayer));
      setAppState('menu');
    } else {
      const newPlayerData = { first_name: loginName.trim(), contact_info: loginContact.trim(), score: 0, completed_phrases: [], saved_progress: {} };
      const { data: newP, error } = await supabase.from('players').insert([newPlayerData]).select().single();
      if (!error) {
        setPlayer(newP);
        setScore(0);
        localStorage.setItem('crypto_player_session', JSON.stringify(newP));
        setAppState('menu');
      } else setLoginError('שגיאה בהרשמה.');
    }
    setLoading(false);
  };

  const getBoxSize = () => {
    if (!currentPhrase) return 45;
    const len = currentPhrase.text.length;
    if (len > 15) return 28;
    if (len > 10) return 36;
    return 45;
  };

  // --- תצוגות (Screens) ---

  if (appState === 'menu') {
    return (
      <div style={styles.containerFixed}>
        <div style={styles.card}>
          <h1 style={styles.title}>🌟 מפענחי הצפנים 🌟</h1>
          <div style={styles.selectionBox}>
             <p style={styles.sectionLabel}>בחר גיל:</p>
             <div style={styles.tabGroup}>
                {['ילדים', 'נוער', 'מבוגרים'].map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} style={{...styles.tabBtn, backgroundColor: selectedCategory === cat ? '#48dbfb' : '#f1f2f6'}}>{cat}</button>
                ))}
             </div>
             <p style={styles.sectionLabel}>בחר רמה:</p>
             <div style={styles.tabGroup}>
                <button onClick={() => setSelectedLevel('easy')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'easy' ? '#1dd1a1' : '#f1f2f6'}}>קל</button>
                <button onClick={() => setSelectedLevel('medium')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'medium' ? '#feca57' : '#f1f2f6'}}>בינוני</button>
                <button onClick={() => setSelectedLevel('hard')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'hard' ? '#ff6b6b' : '#f1f2f6', color: selectedLevel === 'hard' ? '#fff' : '#2f3542'}}>קשה</button>
             </div>
          </div>
          <hr style={{margin: '20px 0', opacity: 0.2}} />
          {player ? (
            <div style={styles.welcomeBox}>
              <h3>היי {player.first_name}! 👋</h3>
              <div style={styles.scoreBadge}>ניקוד מצטבר: {score}</div>
            </div>
          ) : ( <p style={styles.subtitle}>מוכנים לפצח את הקוד?</p> )}
          <div style={styles.menuButtons}>
            {!player && <button style={styles.secondaryBtn} onClick={() => setAppState('login')}>התחברות / הרשמה</button>}
            <button style={styles.primaryBtn} onClick={() => { setAppState('playing'); fetchRandomPhrase(); }}>שחק עכשיו 🎮</button>
          </div>
        </div>
        {showGuestWarning && (
          <div style={styles.overlay}><div style={styles.modal}>
            <h2 style={{color:'#ff6b6b'}}>רגע אחד!</h2><p>בתור אורח, הניקוד לא יישמר בשרת.</p>
            <button style={styles.primaryBtn} onClick={() => { setAppState('playing'); fetchRandomPhrase(); setShowGuestWarning(false); }}>שחק בכל זאת</button>
            <button style={styles.secondaryBtn} onClick={() => setShowGuestWarning(false)}>ביטול</button>
          </div></div>
        )}
      </div>
    );
  }

  if (appState === 'login') {
    return (
      <div style={styles.containerFixed}>
        <div style={styles.card}>
          <h2 style={styles.title}>כניסה למשחק</h2>
          <input type="text" placeholder="טלפון או אימייל (חובה)" value={loginContact} onChange={(e) => setLoginContact(e.target.value)} style={styles.input} />
          <input type="text" placeholder="שם פרטי (חובה תמיד!)" value={loginName} onChange={(e) => setLoginName(e.target.value)} style={styles.input} />
          {loginError && <p style={{color:'red', fontSize:'0.9rem'}}>{loginError}</p>}
          <button style={styles.primaryBtn} onClick={handleLoginOrRegister} disabled={loading}>{loading ? 'מתחבר...' : 'היכנס למשחק'}</button>
          <button style={styles.secondaryBtn} onClick={() => setAppState('menu')}>ביטול</button>
        </div>
      </div>
    );
  }

  if (appState === 'playing') {
    if (noMorePhrases) {
      return (
        <div style={styles.containerFixed}>
          <div style={styles.card}>
            <h2 style={styles.title}>🏆 סיימת הכל! 🏆</h2>
            <p>אין יותר משפטים ב{selectedCategory} רמת {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}.</p>
            <button style={styles.primaryBtn} onClick={() => setAppState('menu')}>חזור לתפריט</button>
          </div>
        </div>
      );
    }

    const boxSize = getBoxSize();

    return (
      <div style={styles.containerFull}>
        <div style={styles.topBar}>
          <div>
            <div style={{fontSize: '0.85rem', opacity: 0.9}}>{selectedCategory} | {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}</div>
            <div style={{fontWeight:'bold', marginTop: '2px', fontSize: '1.1rem'}}>נושא: {currentPhrase?.topic}</div>
          </div>
          <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
            <div style={styles.scoreDisplay}>✨ {score} </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
              <button style={{...styles.smallBtn, backgroundColor: '#feca57', color: '#2f3542', border: 'none', fontWeight:'bold'}} onClick={handleSkip}>דלג ⏭️</button>
              <button style={styles.smallBtn} onClick={() => {saveCurrentProgress(); setAppState('menu');}}>תפריט</button>
            </div>
          </div>
        </div>

        <div style={styles.boardArea}>
          <div style={styles.board}>
            {currentPhrase?.text.split('').map((char, index) => {
              if (char === ' ') return <div key={index} style={{ width: '15px' }}></div>;
              const num = cipherMap[char];
              const guessed = userGuesses[num] || '';
              const isSelected = selectedNumber === num;
              const isInitial = initialCiphers.includes(num);
              const isCorrect = correctCiphers.includes(num);
              const isForcedHint = forcedHintFor === num;
              
              let bgColor = '#fff';
              let borderColor = '#c8d6e5';
              
              if (isInitial) { bgColor = '#f1f2f6'; borderColor = '#a4b0be'; }
              else if (isForcedHint) { bgColor = '#ffeaa7'; borderColor = '#e17055'; } // תיבה נעולה!
              else if (isSelected) { bgColor = '#fffdf3'; borderColor = '#ff9f43'; }

              return (
                <div key={index} style={{...styles.letterBox, width: `${boxSize}px`, height: `${boxSize * 1.4}px`, borderColor, backgroundColor: bgColor }} onClick={() => setSelectedNumber(num)}>
                  <div style={{...styles.guessedLetter, fontSize: `${boxSize * 0.6}px`, color: isInitial ? '#576574' : '#2f3542'}}>
                    {guessed}
                    {isCorrect && !isInitial && <span style={styles.checkmark}>✔</span>}
                  </div>
                  <div style={{...styles.secretNumber, fontSize: `${boxSize * 0.3}px`}}>
                    {isForcedHint ? '🔒' : num}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.keyboardAreaFixed}>
          <div style={{textAlign:'center', marginBottom: '10px'}}>
             <button style={{...styles.hintBtn, animation: forcedHintFor ? 'pulse 1.5s infinite' : 'none'}} onClick={applyHint}>
               💡 {forcedHintFor ? 'שחרר נעילה!' : `בקש רמז (${hintsUsedInRound === 0 ? 'חינם' : hintsUsedInRound === 1 ? '-3' : '-5'})`}
             </button>
          </div>
          
          <div style={styles.keyboardRow}>{HEBREW_ALPHABET.slice(0, 10).map(l => <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>)}</div>
          <div style={styles.keyboardRow}>{HEBREW_ALPHABET.slice(10, 20).map(l => <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>)}</div>
          <div style={styles.keyboardRow}>
            <button style={{...styles.keyBtn, backgroundColor:'#ff6b6b', color:'#fff', flex: 1.5}} onClick={() => handleVirtualKeyPress('')}>מחק</button>
            {HEBREW_ALPHABET.slice(20).map(l => <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>)}
          </div>
        </div>

        {showWinModal && (
          <div style={styles.overlay}><div style={styles.modal}>
            <h1 style={{fontSize: '3rem', margin: 0}}>🎉</h1><h2 style={{color: '#1dd1a1'}}>כל הכבוד!</h2><p>פיצחת את הצופן וזכית ב-5 נקודות בונוס!</p>
            <button style={styles.primaryBtn} onClick={fetchRandomPhrase}>לצופן הבא ➡️</button>
          </div></div>
        )}
      </div>
    );
  }
  return null;
}

const styles = {
  containerFixed: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', padding: '15px', boxSizing: 'border-box' },
  containerFull: { display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden' },
  card: { backgroundColor: '#fff', padding: '30px', borderRadius: '25px', boxShadow: '0 15px 30px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '400px' },
  title: { color: '#ff6b6b', fontSize: '2.2rem', marginBottom: '10px', textShadow: '2px 2px 0 #feca57' },
  subtitle: { color: '#576574', fontSize: '1.2rem', marginBottom: '20px' },
  sectionLabel: { fontWeight: 'bold', margin: '10px 0 5px', fontSize: '0.9rem', textAlign: 'right' },
  tabGroup: { display: 'flex', gap: '5px' },
  tabBtn: { flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: '0.2s' },
  welcomeBox: { marginBottom: '20px' },
  scoreBadge: { backgroundColor: '#feca57', color: '#fff', padding: '8px 20px', borderRadius: '25px', display: 'inline-block', fontWeight: 'bold', fontSize: '1.1rem' },
  menuButtons: { display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' },
  primaryBtn: { backgroundColor: '#1dd1a1', color: '#fff', border: 'none', padding: '15px', borderRadius: '15px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 5px 0 #10ac84' },
  secondaryBtn: { backgroundColor: '#48dbfb', color: '#fff', border: 'none', padding: '15px', borderRadius: '15px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 5px 0 #2e86de', marginTop: '10px' },
  input: { width: '100%', padding: '15px', margin: '10px 0', borderRadius: '12px', border: '2px solid #c8d6e5', fontSize: '1.1rem', boxSizing: 'border-box', outline: 'none' },
  topBar: { backgroundColor: '#2f3542', color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  scoreDisplay: { color: '#feca57', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '5px' },
  contextInfo: { fontSize: '0.75rem', opacity: 0.8 },
  smallBtn: { background: 'none', border: '1px solid #fff', color: '#fff', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' },
  boardArea: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', overflowY: 'auto' },
  board: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', maxWidth: '800px' },
  letterBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '4px solid', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', position: 'relative' },
  guessedLetter: { fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' },
  checkmark: { position: 'absolute', top: '-2px', right: '-2px', color: '#1dd1a1', fontSize: '0.4em', backgroundColor: '#fff', borderRadius: '50%', padding: '1px' },
  secretNumber: { fontWeight: 'bold' },
  keyboardAreaFixed: { backgroundColor: '#dfe6e9', padding: '10px 15px', borderTop: '2px solid #b2bec3', flexShrink: 0, paddingBottom: 'max(15px, env(safe-area-inset-bottom))' },
  keyboardRow: { display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '6px' },
  keyBtn: { flex: 1, maxWidth: '42px', height: '45px', backgroundColor: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 3px 0 #b2bec3', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  hintBtn: { backgroundColor: '#ff9f43', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 0 #e67e22', fontSize: '0.9rem' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', padding: '40px', borderRadius: '30px', textAlign: 'center', maxWidth: '320px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }
};

export default App;