import { useState, useEffect, useRef } from 'react';
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
  
  // --- הגדרות משחק ---
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

  // --- תוספות: זיכרון, נעילות ורמאויות ---
  const [initialCiphers, setInitialCiphers] = useState([]); 
  const [strikes, setStrikes] = useState({}); 
  const [hintLimits, setHintLimits] = useState({}); 
  const [forcedHintFor, setForcedHintFor] = useState(null); 

  // --- תוספות למערכת הרמזים הכלכלית ---
  const [globalHintCost, setGlobalHintCost] = useState(1); 
  const [wordsInCycle, setWordsInCycle] = useState(0); 

  // --- חיבור למקלדת טלפון מובנית ---
  const inputRef = useRef(null);
  const [hiddenInputValue, setHiddenInputValue] = useState(' '); // רווח כדי לזהות מחיקה באנדרואיד/iOS

  // --- זיכרון הלקוח (Persistence) ---
  useEffect(() => {
    const savedPlayer = localStorage.getItem('crypto_player_session');
    if (savedPlayer) {
      const p = JSON.parse(savedPlayer);
      p.completed_phrases = p.completed_phrases || [];
      p.saved_progress = p.saved_progress || {};
      
      setPlayer(p);
      setScore(p.score || 0);
      setGlobalHintCost(p.global_hint_cost || 1);
      setWordsInCycle(p.words_in_cycle || 0);
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

  // --- פונקציה למציאת התיבה הפנויה הבאה (לקפיצה אוטומטית) ---
  const getNextAvailableNumber = (phraseText, cMap, correctList, initialList, currentNum = null) => {
    if (!phraseText) return null;
    const chars = phraseText.split('');
    let startIndex = 0;
    
    if (currentNum !== null) {
        const currIdx = chars.findIndex(c => c !== ' ' && cMap[c] === currentNum);
        if (currIdx !== -1) startIndex = currIdx + 1;
    }

    for (let i = startIndex; i < chars.length; i++) {
        const char = chars[i];
        if (char === ' ') continue;
        const num = cMap[char];
        if (!correctList.includes(num) && !initialList.includes(num)) return num;
    }

    for (let i = 0; i < startIndex; i++) {
        const char = chars[i];
        if (char === ' ') continue;
        const num = cMap[char];
        if (!correctList.includes(num) && !initialList.includes(num)) return num;
    }

    return null;
  };

  // --- לוגיקת יצירת משחק ---
  const generateCipherAndStart = (text, loadedProgress = null) => {
    if (loadedProgress) {
      setCipherMap(loadedProgress.cipherMap);
      setUserGuesses(loadedProgress.userGuesses);
      setCorrectCiphers(loadedProgress.correctCiphers);
      setInitialCiphers(loadedProgress.initialCiphers);
      setStrikes(loadedProgress.strikes);
      setHintLimits(loadedProgress.hintLimits);
      setForcedHintFor(loadedProgress.forcedHintFor);
      setHintsUsedInRound(loadedProgress.hintsUsedInRound);
      
      const nextAvail = getNextAvailableNumber(text, loadedProgress.cipherMap, loadedProgress.correctCiphers, loadedProgress.initialCiphers, null);
      setSelectedNumber(nextAvail);
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
    
    const multiOccurChars = uniqueChars.filter(c => charFrequency[c] > 1).sort(() => Math.random() - 0.5);
    const singleOccurChars = uniqueChars.filter(c => charFrequency[c] === 1).sort(() => Math.random() - 0.5);
    const mixedCharsForReveal = [...multiOccurChars, ...singleOccurChars];

    let numToReveal = 1; 
    if (selectedLevel === 'easy') numToReveal = wordsCount >= 2 ? 1 : 2;
    else if (selectedLevel === 'medium') numToReveal = 1;
    else if (selectedLevel === 'hard') numToReveal = 1;

    if (numToReveal >= uniqueChars.length) numToReveal = Math.max(0, uniqueChars.length - 1);

    const initialGuesses = {};
    const initialCorrect = [];
    
    for (let i = 0; i < numToReveal; i++) {
      const char = mixedCharsForReveal[i]; 
      const cipherNum = newCipher[char];
      initialGuesses[cipherNum] = char;
      initialCorrect.push(cipherNum);
    }

    setUserGuesses(initialGuesses);
    setCorrectCiphers(initialCorrect);
    setInitialCiphers(initialCorrect); 
    setStrikes({});
    setHintLimits({});
    setForcedHintFor(null);
    setHintsUsedInRound(0); 
    
    const firstAvailable = getNextAvailableNumber(text, newCipher, initialCorrect, initialCorrect, null);
    setSelectedNumber(firstAvailable);
    setShowWinModal(false);
  };

  const fetchRandomPhrase = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('phrases').select('*').eq('category', selectedCategory).eq('level', selectedLevel);

    if (!error && data && data.length > 0) {
      const completed = player?.completed_phrases || [];
      const available = data.filter(item => !completed.includes(item.id));

      if (available.length > 0) {
        const randomItem = available[Math.floor(Math.random() * available.length)];
        setCurrentPhrase(randomItem);
        const savedProg = player?.saved_progress?.[randomItem.id];
        generateCipherAndStart(randomItem.text, savedProg);
        setNoMorePhrases(false);
      } else {
        setNoMorePhrases(true); 
      }
    } else {
      setNoMorePhrases(true);
    }
    setLoading(false);
  };

  const saveCurrentProgress = () => {
    if (!player || !currentPhrase) return;
    const currentProg = { cipherMap, userGuesses, correctCiphers, initialCiphers, strikes, hintLimits, forcedHintFor, hintsUsedInRound };
    const updatedProgress = { ...(player.saved_progress || {}), [currentPhrase.id]: currentProg };
    syncPlayerToDB({ saved_progress: updatedProgress });
  };

  const handleSkip = () => {
    saveCurrentProgress(); 
    fetchRandomPhrase();   
  };

  // --- בדיקת ניצחון וסגירת המקלדת המובנית ---
  useEffect(() => {
    if (currentPhrase && Object.keys(userGuesses).length > 0) {
      const isWin = currentPhrase.text.split('').every(char => char === ' ' || userGuesses[cipherMap[char]] === char);
      
      if (isWin && !showWinModal) {
        // מוריד את המקלדת כשיש ניצחון!
        if (inputRef.current) inputRef.current.blur();

        setShowWinModal(true);
        const winReward = Math.max(0, 5 - hintsUsedInRound); // קנס על רמזים
        updateScore(winReward);

        let currentCycle = wordsInCycle + 1;
        let nextCost = globalHintCost;
        let triggerAlert = false;

        if (currentCycle >= 3) {
            currentCycle = 0;
            nextCost = 1;
            triggerAlert = true;
        }

        setWordsInCycle(currentCycle);
        setGlobalHintCost(nextCost);

        if (player) {
          const newCompleted = [...(player.completed_phrases || []), currentPhrase.id];
          const updatedSaved = { ...(player.saved_progress || {}) };
          delete updatedSaved[currentPhrase.id];
          syncPlayerToDB({ completed_phrases: newCompleted, saved_progress: updatedSaved, words_in_cycle: currentCycle, global_hint_cost: nextCost });
        }

        if (triggerAlert) {
            setTimeout(() => alert('🎉 סיימת 3 צפנים! מחירי הרמזים התאפסו חזרה ל-1!'), 400);
        }
      }
    }
  }, [userGuesses]);

  // --- הפעלת רמזים ---
  const applyHint = () => {
    let cost = hintsUsedInRound === 0 ? 0 : globalHintCost;
    if (score < cost) return alert(`חסר לך ניקוד! רמז זה עולה ${cost} נקודות.`);

    if (forcedHintFor !== null) {
      const currentLimit = hintLimits[forcedHintFor] || 5;
      const newLimit = currentLimit === 5 ? 3 : 1;
      
      setHintLimits(prev => ({...prev, [forcedHintFor]: newLimit}));
      setStrikes(prev => ({...prev, [forcedHintFor]: 0}));
      setForcedHintFor(null);
      updateScore(-cost);
      
      if (hintsUsedInRound > 0) {
          const nextCost = Math.min(10, globalHintCost + 1);
          setGlobalHintCost(nextCost);
          if (player) syncPlayerToDB({ global_hint_cost: nextCost });
      }
      setHintsUsedInRound(prev => prev + 1);
      alert(`התיבה שוחררה! קיבלת עוד ${newLimit} ניסיונות לאות זו.`);
      return;
    }

    const unGuessedChars = currentPhrase.text.split('').filter(char => char !== ' ' && userGuesses[cipherMap[char]] !== char);
    if (unGuessedChars.length > 0) {
      const randomChar = unGuessedChars[Math.floor(Math.random() * unGuessedChars.length)];
      handleVirtualKeyPress(randomChar, cipherMap[randomChar], true); // true אומר שזה רמז!
      updateScore(-cost); 
      
      if (hintsUsedInRound > 0) {
          const nextCost = Math.min(10, globalHintCost + 1);
          setGlobalHintCost(nextCost);
          if (player) syncPlayerToDB({ global_hint_cost: nextCost });
      }
      setHintsUsedInRound(prev => prev + 1);
    }
  };

  // --- ניהול לוגיקת הקלדה (שגיאות, פסילות, קפיצה) ---
  const handleVirtualKeyPress = (letter, forcedNum = null, isHint = false) => {
    const targetNum = forcedNum || selectedNumber;
    if (targetNum === null) return;
    
    if (initialCiphers.includes(targetNum)) return; 
    if (forcedHintFor !== null && forcedHintFor !== targetNum) return alert("קודם שחרר את התיבה האדומה הנעולה בעזרת רמז!");

    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNum);
    
    if (letter === correctLetter) {
      let currentCorrectCiphers = [...correctCiphers];
      if (!correctCiphers.includes(targetNum)) {
        if (!isHint) updateScore(1); // לא נותן נקודה אם זה רמז
        currentCorrectCiphers.push(targetNum);
        setCorrectCiphers(currentCorrectCiphers);
        setStrikes(prev => ({...prev, [targetNum]: 0})); 
      }
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
      
      // קפיצה אוטומטית (משאיר את המקלדת פתוחה!)
      const nextNum = getNextAvailableNumber(currentPhrase.text, cipherMap, currentCorrectCiphers, initialCiphers, targetNum);
      if (nextNum !== null) setSelectedNumber(nextNum);
      
    } else {
      if (letter === '') {
        setUserGuesses(prev => ({ ...prev, [targetNum]: '' }));
        return;
      }
      
      const limit = hintLimits[targetNum] || 5;
      const currentStrikes = (strikes[targetNum] || 0) + 1;

      if (currentStrikes === limit - 1) alert("לא לרמות, ניסיון אחרון לאות הזאת לפני בקשת רמז!");
      else if (currentStrikes >= limit) {
        setForcedHintFor(targetNum);
        if (inputRef.current) inputRef.current.blur(); // סוגר מקלדת אם ננעל!
        alert("חרגת ממספר הניסיונות לאות הזו! לחץ על כפתור הרמז כדי לשחרר.");
      }
      
      setStrikes(prev => ({...prev, [targetNum]: currentStrikes}));
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
    }
  };

  // --- קליטת הקלדה ממקלדת המכשיר ---
  const handleNativeInput = (e) => {
    const val = e.target.value;
    if (val === '') { // מחיקה
        handleVirtualKeyPress('');
        setHiddenInputValue(' '); 
    } else if (val.length > 1) { // הקלדה
        const char = val[val.length - 1];
        if (/^[\u0590-\u05FF]$/.test(char)) { // מוודא שזה עברית
            handleVirtualKeyPress(char);
        }
        setHiddenInputValue(' '); 
    }
  };

  // פתיחת מקלדת המכשיר בלחיצה על תיבה
  const handleBoxClick = (num) => {
    setSelectedNumber(num);
    if (inputRef.current) {
        inputRef.current.focus();
    }
  };

  // --- אימות מחמיר בהרשמה ---
  const handleLoginOrRegister = async () => {
    const contact = loginContact.trim();
    const name = loginName.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\d{9,10}$/.test(contact.replace(/-/g, ''));

    if (!isEmail && !isPhone) return setLoginError('נא להזין אימייל תקין או מספר טלפון (9-10 ספרות).');
    if (!name) return setLoginError('חובה להזין שם פרטי!');

    setLoading(true); setLoginError('');
    const { data: existingPlayer } = await supabase.from('players').select('*').eq('contact_info', contact).single();

    if (existingPlayer) {
      if (existingPlayer.first_name !== name) {
        setLoginError('השם אינו תואם לפרטי ההתקשרות הקיימים במערכת.');
        setLoading(false); return;
      }
      existingPlayer.completed_phrases = existingPlayer.completed_phrases || [];
      existingPlayer.saved_progress = existingPlayer.saved_progress || {};
      setPlayer(existingPlayer); setScore(existingPlayer.score || 0); setGlobalHintCost(existingPlayer.global_hint_cost || 1); setWordsInCycle(existingPlayer.words_in_cycle || 0);
      localStorage.setItem('crypto_player_session', JSON.stringify(existingPlayer));
      setAppState('menu');
    } else {
      const newPlayerData = { first_name: name, contact_info: contact, score: 0, completed_phrases: [], saved_progress: {}, global_hint_cost: 1, words_in_cycle: 0 };
      const { data: newP, error } = await supabase.from('players').insert([newPlayerData]).select().single();
      if (!error) {
        setPlayer(newP); setScore(0); setGlobalHintCost(1); setWordsInCycle(0);
        localStorage.setItem('crypto_player_session', JSON.stringify(newP));
        setAppState('menu');
      } else setLoginError('שגיאה בהרשמה.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('crypto_player_session');
    setPlayer(null); setScore(0); setGlobalHintCost(1); setWordsInCycle(0);
    setAppState('menu');
  };

  const getBoxSize = () => {
    if (!currentPhrase) return 40;
    const len = currentPhrase.text.length;
    if (len > 25) return 22;
    if (len > 18) return 28;
    if (len > 12) return 32;
    return 40;
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
          <hr style={{margin: '15px 0', opacity: 0.2}} />
          {player ? (
            <div style={styles.welcomeBox}>
              <h3 style={{margin: '0 0 5px 0', color: '#2f3542'}}>היי {player.first_name}! 👋</h3>
              <div style={styles.scoreBadge}>ניקוד: {score}</div>
              <div style={{marginTop: '10px'}}><button style={styles.logoutBtn} onClick={handleLogout}>התנתק משתמש</button></div>
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
          <input type="text" placeholder="שם פרטי (חובה תמיד!)" value={loginName} onChange={(e) => setLoginName(e.target.value)} style={styles.input} />
          <input type="text" placeholder="טלפון או אימייל (חובה)" value={loginContact} onChange={(e) => setLoginContact(e.target.value)} style={styles.input} />
          {loginError && <p style={{color:'red', fontSize:'0.9rem', margin: '5px 0'}}>{loginError}</p>}
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
        
        {/* השדה הנסתר שמפעיל את המקלדת המובנית של המכשיר */}
        <input 
           ref={inputRef}
           type="text"
           value={hiddenInputValue}
           onChange={handleNativeInput}
           style={{position: 'absolute', top: '-1000px', left: '-1000px', opacity: 0}}
           autoComplete="off" autoCorrect="off" spellCheck="false"
        />

        {/* חלק עליון קבוע: ציון, נושא ורמז - לא זז אף פעם! */}
        <div style={styles.topSectionFixed}>
            <div style={styles.topBar}>
              <div>
                <div style={{fontSize: '0.8rem', opacity: 0.9}}>{selectedCategory} | {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}</div>
                <div style={{fontWeight:'bold', marginTop: '2px', fontSize: '1rem'}}>נושא: {currentPhrase?.topic}</div>
              </div>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <div style={styles.scoreDisplay}>✨ {score} </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                  <button style={{...styles.smallBtn, backgroundColor: '#feca57', color: '#2f3542', border: 'none', fontWeight:'bold'}} onClick={handleSkip}>דלג ⏭️</button>
                  <button style={styles.smallBtn} onClick={() => {saveCurrentProgress(); setAppState('menu');}}>תפריט</button>
                </div>
              </div>
            </div>
            
            <div style={styles.hintContainer}>
               <button style={{...styles.hintBtn, animation: forcedHintFor ? 'pulse 1.5s infinite' : 'none'}} onClick={applyHint}>
                 💡 {forcedHintFor ? 'שחרר נעילה!' : `רמז (${hintsUsedInRound === 0 ? 'חינם' : '-' + globalHintCost})`}
               </button>
            </div>
        </div>

        {/* לוח המשחק שנגלל מאחורי המקלדת */}
        <div style={styles.boardArea}>
          <div style={styles.board}>
            {currentPhrase?.text.split('').map((char, index) => {
              if (char === ' ') return <div key={index} style={{ width: '12px' }}></div>;
              
              const num = cipherMap[char];
              const guessed = userGuesses[num] || '';
              const isSelected = selectedNumber === num;
              const isInitial = initialCiphers.includes(num);
              const isCorrect = correctCiphers.includes(num);
              const isForcedHint = forcedHintFor === num;
              
              let bgColor = '#fff';
              let borderColor = '#c8d6e5';
              
              if (isInitial) { bgColor = '#f1f2f6'; borderColor = '#a4b0be'; }
              else if (isForcedHint) { bgColor = '#ffeaa7'; borderColor = '#e17055'; } 
              else if (isSelected) { bgColor = '#fffdf3'; borderColor = '#ff9f43'; }

              return (
                <div 
                  key={index} 
                  style={{
                    ...styles.letterBox, 
                    width: `${boxSize}px`, 
                    height: `${boxSize * 1.35}px`, 
                    borderColor, 
                    backgroundColor: bgColor 
                  }} 
                  onClick={() => handleBoxClick(num)} 
                >
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

        {showWinModal && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h1 style={{fontSize: '3rem', margin: 0}}>🎉</h1>
              <h2 style={{color: '#1dd1a1'}}>כל הכבוד!</h2>
              <p>פיצחת וזכית ב-{Math.max(0, 5 - hintsUsedInRound)} נקודות!</p>
              <button style={styles.primaryBtn} onClick={fetchRandomPhrase}>לצופן הבא ➡️</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// --- עיצוב ---
const styles = {
  containerFixed: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', padding: '15px', boxSizing: 'border-box' },
  containerFull: { display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', overflow: 'hidden' },
  card: { backgroundColor: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '380px' },
  title: { color: '#ff6b6b', fontSize: '2rem', marginBottom: '10px', textShadow: '1px 1px 0 #feca57' },
  subtitle: { color: '#576574', fontSize: '1rem', marginBottom: '15px' },
  sectionLabel: { fontWeight: 'bold', margin: '8px 0 4px', fontSize: '0.85rem', textAlign: 'right' },
  tabGroup: { display: 'flex', gap: '5px' },
  tabBtn: { flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: '0.2s' },
  welcomeBox: { marginBottom: '15px' },
  scoreBadge: { backgroundColor: '#feca57', color: '#fff', padding: '5px 15px', borderRadius: '20px', display: 'inline-block', fontWeight: 'bold', fontSize: '1rem' },
  logoutBtn: { background: 'none', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', marginTop: '5px' },
  menuButtons: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' },
  primaryBtn: { backgroundColor: '#1dd1a1', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 4px 0 #10ac84' },
  secondaryBtn: { backgroundColor: '#48dbfb', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 4px 0 #2e86de' },
  input: { width: '100%', padding: '12px', margin: '8px 0', borderRadius: '10px', border: '2px solid #eee', fontSize: '1rem', boxSizing: 'border-box', outline: 'none' },
  
  // הקיבוע של החלק העליון עם הרמז
  topSectionFixed: { backgroundColor: '#2f3542', flexShrink: 0, borderBottom: '4px solid #feca57', display: 'flex', flexDirection: 'column' },
  topBar: { color: '#fff', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hintContainer: { backgroundColor: '#dfe6e9', padding: '10px', textAlign: 'center' },
  hintBtn: { backgroundColor: '#ff9f43', color: '#fff', border: 'none', padding: '8px 25px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 3px 0 #e67e22', fontSize: '0.9rem' },
  
  scoreDisplay: { color: '#feca57', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '2px' },
  smallBtn: { background: 'none', border: '1px solid #fff', color: '#fff', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' },
  boardArea: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px 10px', overflowY: 'auto' },
  board: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', maxWidth: '800px', width: '100%' },
  letterBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '3px solid', borderRadius: '4px', cursor: 'pointer', transition: '0.2s', position: 'relative' },
  guessedLetter: { fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' },
  checkmark: { position: 'absolute', top: '-3px', right: '-3px', color: '#1dd1a1', fontSize: '0.4em', backgroundColor: '#fff', borderRadius: '50%', padding: '1px' },
  secretNumber: { fontWeight: 'bold' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', padding: '30px', borderRadius: '25px', textAlign: 'center', maxWidth: '300px', boxShadow: '0 15px 30px rgba(0,0,0,0.3)' }
};

export default App;
