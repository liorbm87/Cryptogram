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

  // --- תוספות: חשיפה, זיכרון, נעילות ורמאויות ---
  const [initialIndices, setInitialIndices] = useState([]); 
  const [strikes, setStrikes] = useState({}); 
  const [hintLimits, setHintLimits] = useState({}); 
  const [forcedHintFor, setForcedHintFor] = useState(null); 

  // --- תוספות למערכת הרמזים הכלכלית ---
  const [localStats, setLocalStats] = useState({});
  const currentKey = `${selectedCategory}_${selectedLevel}`;
  const currentStats = player?.category_stats?.[currentKey] || localStats[currentKey] || { score: 5, hint_cost: 1, cycle: 0 };
  const currentScore = currentStats.score;
  const globalHintCost = currentStats.hint_cost;
  const wordsInCycle = currentStats.cycle;

  // --- חיבור למקלדת טלפון מובנית ---
  const inputRef = useRef(null);
  const [hiddenInputValue, setHiddenInputValue] = useState(' '); 
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // --- חוקיות, עוגיות ומסמכים ---
  const [showCookieConsent, setShowCookieConsent] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null); 

  // --- זיכרון הלקוח וקוקיז (Persistence) ---
  useEffect(() => {
    const savedPlayer = localStorage.getItem('crypto_player_session');
    if (savedPlayer) {
      const p = JSON.parse(savedPlayer);
      p.completed_phrases = p.completed_phrases || [];
      p.saved_progress = p.saved_progress || {};
      p.category_stats = p.category_stats || {};
      setPlayer(p);
    }

    const hasConsented = localStorage.getItem('crypto_cookie_consent');
    if (!hasConsented) {
      setShowCookieConsent(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('crypto_cookie_consent', 'true');
    setShowCookieConsent(false);
  };

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

  const updateCategoryStats = (updates) => {
    const newStats = { ...currentStats, ...updates };
    if (player) {
        const newAllStats = { ...(player.category_stats || {}), [currentKey]: newStats };
        const updatedPlayer = { ...player, category_stats: newAllStats };
        setPlayer(updatedPlayer);
        syncPlayerToDB({ category_stats: newAllStats });
    } else {
        setLocalStats(prev => ({ ...prev, [currentKey]: newStats }));
    }
  };

  const updateScore = (amount) => {
    updateCategoryStats({ score: Math.max(0, currentScore + amount) });
  };

  // --- מציאת התיבה הפנויה הבאה לקפיצה אוטומטית ---
  const getNextAvailableNumber = (phraseText, cMap, correctList, initIndices, currentNum = null) => {
    if (!phraseText) return null;
    const chars = phraseText.split('');
    let startIndex = 0;
    
    if (currentNum !== null) {
        const currIdx = chars.findIndex((c, i) => c !== ' ' && cMap[c] === currentNum && !initIndices.includes(i));
        if (currIdx !== -1) startIndex = currIdx + 1;
    }

    for (let i = startIndex; i < chars.length; i++) {
        if (chars[i] === ' ') continue;
        const num = cMap[chars[i]];
        if (!initIndices.includes(i) && !correctList.includes(num)) return num;
    }

    for (let i = 0; i < startIndex; i++) {
        if (chars[i] === ' ') continue;
        const num = cMap[chars[i]];
        if (!initIndices.includes(i) && !correctList.includes(num)) return num;
    }

    return null;
  };

  // --- לוגיקת יצירת משחק ---
  const generateCipherAndStart = (text, loadedProgress = null) => {
    if (loadedProgress) {
      setCipherMap(loadedProgress.cipherMap);
      setUserGuesses(loadedProgress.userGuesses);
      setCorrectCiphers(loadedProgress.correctCiphers);
      setInitialIndices(loadedProgress.initialIndices || []); 
      setStrikes(loadedProgress.strikes);
      setHintLimits(loadedProgress.hintLimits);
      setForcedHintFor(loadedProgress.forcedHintFor);
      setHintsUsedInRound(loadedProgress.hintsUsedInRound);
      
      const nextAvail = getNextAvailableNumber(text, loadedProgress.cipherMap, loadedProgress.correctCiphers, loadedProgress.initialIndices || [], null);
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
    
    const sortedCharsByFreq = uniqueChars.sort((a, b) => charFrequency[b] - charFrequency[a]);

    let numToReveal = 1; 
    if (selectedLevel === 'easy') numToReveal = wordsCount >= 2 ? 1 : 2;
    else if (selectedLevel === 'medium') numToReveal = 1;
    else if (selectedLevel === 'hard') numToReveal = 1;

    if (numToReveal >= uniqueChars.length) numToReveal = Math.max(0, uniqueChars.length - 1);

    const charsToReveal = sortedCharsByFreq.slice(0, numToReveal);
    const newInitialIndices = [];

    charsToReveal.forEach(char => {
        const allIndices = text.split('').map((c, i) => c === char ? i : -1).filter(i => i !== -1);
        const randomIdx = allIndices[Math.floor(Math.random() * allIndices.length)];
        newInitialIndices.push(randomIdx);
    });

    setInitialIndices(newInitialIndices);
    setUserGuesses({});
    setCorrectCiphers([]); 
    setStrikes({});
    setHintLimits({});
    setForcedHintFor(null);
    setHintsUsedInRound(0); 
    
    const firstAvailable = getNextAvailableNumber(text, newCipher, [], newInitialIndices, null);
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
    const currentProg = { cipherMap, userGuesses, correctCiphers, initialIndices, strikes, hintLimits, forcedHintFor, hintsUsedInRound };
    const updatedProgress = { ...(player.saved_progress || {}), [currentPhrase.id]: currentProg };
    syncPlayerToDB({ saved_progress: updatedProgress });
  };

  const handleSkip = () => {
    saveCurrentProgress(); 
    fetchRandomPhrase();   
  };

  // --- בדיקת ניצחון ולוגיקת ספירת רמזים ---
  useEffect(() => {
    if (currentPhrase && Object.keys(userGuesses).length > 0) {
      const isWin = currentPhrase.text.split('').every((char, index) => {
        if (char === ' ') return true;
        if (initialIndices.includes(index)) return true;
        return userGuesses[cipherMap[char]] === char;
      });
      
      if (isWin && !showWinModal) {
        if (inputRef.current) inputRef.current.blur(); 
        setIsKeyboardOpen(false);

        setShowWinModal(true);
        const winReward = Math.max(0, 5 - hintsUsedInRound); 
        
        let currentCycle = wordsInCycle;
        let nextCost = globalHintCost;
        let triggerAlert = false;

        if (globalHintCost >= 10) {
            currentCycle += 1;
            if (currentCycle >= 3) {
                currentCycle = 0;
                nextCost = 1;
                triggerAlert = true;
            }
        } else {
            currentCycle = 0;
        }

        const newScore = Math.max(0, currentScore + winReward);
        const newStats = { score: newScore, hint_cost: nextCost, cycle: currentCycle };

        if (player) {
          const newCompleted = [...(player.completed_phrases || []), currentPhrase.id];
          const updatedSaved = { ...(player.saved_progress || {}) };
          delete updatedSaved[currentPhrase.id];
          
          const newAllStats = { ...(player.category_stats || {}), [currentKey]: newStats };
          
          const updatedPlayer = { 
              ...player, 
              completed_phrases: newCompleted, 
              saved_progress: updatedSaved,
              category_stats: newAllStats
          };
          setPlayer(updatedPlayer);
          syncPlayerToDB({ 
              completed_phrases: newCompleted, 
              saved_progress: updatedSaved, 
              category_stats: newAllStats 
          });
        } else {
          setLocalStats(prev => ({ ...prev, [currentKey]: newStats }));
        }

        if (triggerAlert) {
            setTimeout(() => alert('🎉 פתרת 3 צפנים במחיר המקסימלי! מחירי הרמזים התאפסו חזרה ל-1!'), 400);
        }
      }
    }
  }, [userGuesses]);

  // --- הפעלת רמזים ---
  const applyHint = () => {
    let cost = hintsUsedInRound === 0 ? 0 : globalHintCost;
    if (currentScore < cost) return alert(`חסר לך ניקוד! רמז זה עולה ${cost} נקודות. (בעתיד יתווסף כאן כפתור לצפייה בסרטון לנקודות חינם!)`);

    if (forcedHintFor !== null) {
      const currentLimit = hintLimits[forcedHintFor] || 5;
      const newLimit = currentLimit === 5 ? 3 : 1;
      
      setHintLimits(prev => ({...prev, [forcedHintFor]: newLimit}));
      setStrikes(prev => ({...prev, [forcedHintFor]: 0}));
      setForcedHintFor(null);
      
      const nextCost = hintsUsedInRound > 0 ? Math.min(10, globalHintCost + 1) : globalHintCost;
      updateCategoryStats({ score: currentScore - cost, hint_cost: nextCost });
      
      setHintsUsedInRound(prev => prev + 1);
      alert(`התיבה שוחררה! קיבלת עוד ${newLimit} ניסיונות לאות זו.`);
      return;
    }

    const unGuessedIndices = currentPhrase.text.split('').map((char, index) => {
      if (char === ' ') return -1;
      if (initialIndices.includes(index)) return -1;
      if (userGuesses[cipherMap[char]] === char) return -1;
      return index;
    }).filter(i => i !== -1);

    if (unGuessedIndices.length > 0) {
      const randomIdx = unGuessedIndices[Math.floor(Math.random() * unGuessedIndices.length)];
      const randomChar = currentPhrase.text[randomIdx];
      handleVirtualKeyPress(randomChar, cipherMap[randomChar], true); 
      
      const nextCost = hintsUsedInRound > 0 ? Math.min(10, globalHintCost + 1) : globalHintCost;
      updateCategoryStats({ score: currentScore - cost, hint_cost: nextCost });
      
      setHintsUsedInRound(prev => prev + 1);
    }
  };

  // --- הקלדת אותיות ---
  const handleVirtualKeyPress = (letter, forcedNum = null, isHint = false) => {
    const targetNum = forcedNum || selectedNumber;
    if (targetNum === null) return;
    
    const isFullyInitial = currentPhrase.text.split('').every((c, i) => c === ' ' || cipherMap[c] !== targetNum || initialIndices.includes(i));
    if (isFullyInitial) return; 

    if (forcedHintFor !== null && forcedHintFor !== targetNum) return alert("קודם שחרר את התיבה האדומה הנעולה בעזרת רמז!");

    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNum);
    
    if (letter === correctLetter) {
      let currentCorrectCiphers = [...correctCiphers];
      if (!correctCiphers.includes(targetNum)) {
        if (!isHint) updateScore(1); 
        currentCorrectCiphers.push(targetNum);
        setCorrectCiphers(currentCorrectCiphers);
        setStrikes(prev => ({...prev, [targetNum]: 0})); 
      }
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
      
      const nextNum = getNextAvailableNumber(currentPhrase.text, cipherMap, currentCorrectCiphers, initialIndices, targetNum);
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
        if (inputRef.current) inputRef.current.blur(); 
        setIsKeyboardOpen(false);
        alert("חרגת ממספר הניסיונות לאות הזו! לחץ על כפתור הרמז כדי לשחרר.");
      }
      
      setStrikes(prev => ({...prev, [targetNum]: currentStrikes}));
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
    }
  };

  const handleNativeInput = (e) => {
    const val = e.target.value;
    if (val === '') { 
        handleVirtualKeyPress('');
        setHiddenInputValue(' '); 
    } else if (val.length > 1) { 
        const char = val[val.length - 1];
        if (/^[\u0590-\u05FF]$/.test(char)) { 
            handleVirtualKeyPress(char);
        }
        setHiddenInputValue(' '); 
    }
  };

  const handleBoxClick = (index, num, isInitial) => {
    if (!isInitial) {
        setSelectedNumber(num);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }
  };

  // --- ניקוי טעויות בלבד ---
  const hasMistakes = currentPhrase && Object.entries(userGuesses).some(([numStr, guessedLetter]) => {
    if (!guessedLetter) return false;
    const num = parseInt(numStr, 10);
    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === num);
    return guessedLetter !== correctLetter;
  });

  const handleClearMistakes = () => {
    setUserGuesses(prev => {
      const newGuesses = { ...prev };
      Object.keys(newGuesses).forEach(numStr => {
        const num = parseInt(numStr, 10);
        const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === num);
        if (newGuesses[numStr] && newGuesses[numStr] !== correctLetter) {
          newGuesses[numStr] = ''; 
        }
      });
      return newGuesses;
    });
  };

  // --- אימות מחמיר ---
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
      existingPlayer.category_stats = existingPlayer.category_stats || {};
      
      setPlayer(existingPlayer); 
      localStorage.setItem('crypto_player_session', JSON.stringify(existingPlayer));
      setAppState('menu');
    } else {
      const newPlayerData = { 
        first_name: name, 
        contact_info: contact, 
        score: 0, 
        completed_phrases: [], 
        saved_progress: {}, 
        category_stats: {} 
      };
      const { data: newP, error } = await supabase.from('players').insert([newPlayerData]).select().single();
      if (!error) {
        setPlayer(newP); 
        localStorage.setItem('crypto_player_session', JSON.stringify(newP));
        setAppState('menu');
      } else setLoginError('שגיאה בהרשמה.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('crypto_player_session');
    setPlayer(null); 
    setLocalStats({});
    setAppState('menu');
  };

  // הפונקציה המשודרגת: מונעת חיתוך של מילים ארוכות
  const getBoxSize = () => {
    if (!currentPhrase) return 40;
    const len = currentPhrase.text.length;
    
    let baseSize = 40;
    if (len > 25) baseSize = 22;
    else if (len > 18) baseSize = 28;
    else if (len > 12) baseSize = 32;

    const words = currentPhrase.text.split(' ');
    const maxWordLength = Math.max(...words.map(w => w.length));
    const maxAllowedSize = Math.floor((320 - (4 * (maxWordLength - 1))) / maxWordLength);
    
    return Math.max(16, Math.min(baseSize, maxAllowedSize));
  };

  // --- תצוגות מודאלים משפטיים ---
  const renderLegalModal = () => {
    if (!legalDoc) return null;
    
    let title = '';
    let content = '';

    if (legalDoc === 'terms') {
      title = 'תקנון ותנאי שימוש';
      content = `ברוכים הבאים למשחק "מפענחי הצפנים".
השימוש באתר ובמשחק כפוף לתנאים הבאים:
1. המשחק מוגש "כפי שהוא" (AS IS), ללא כל התחייבות או אחריות מכל סוג שהוא.
2. ייתכן כי באתר יוצגו פרסומות מצדדים שלישיים (כגון גוגל). אין אנו אחראים לתוכן הפרסומות.
3. כל זכויות היוצרים והקניין הרוחני במשחק, בעיצוב ובלוגיקה שייכות ליוצר המשחק.
4. אנו שומרים את הזכות לשנות את כללי המשחק, הניקוד, או לאפס נתונים בכל עת.`;
    } else if (legalDoc === 'privacy') {
      title = 'מדיניות פרטיות';
      content = `אנו מכבדים את פרטיותך.
1. המערכת שומרת נתונים בסיסיים שסיפקת (שם, וכתובת דוא"ל או טלפון) אך ורק לצורך זיהוי, שמירת ההתקדמות שלך במשחק ומניעת רמאויות.
2. אנו לא מעבירים את פרטי הקשר שלך לשום צד שלישי לצרכי שיווק.
3. האתר עושה שימוש בקבצי עוגיות (Cookies) ואחסון מקומי (Local Storage) כדי לזכור את מצב המשחק שלך.
4. האתר משתמש בשירותי פרסום של צד שלישי (כמו Google AdSense). חברות אלו עשויות להשתמש במידע לא מזהה אישית אודות הביקורים שלך על מנת להציג פרסומות המותאמות אישית עבורך.`;
    } else if (legalDoc === 'accessibility') {
      title = 'הצהרת נגישות';
      content = `אנו רואים חשיבות עליונה בהנגשת האתר לאנשים עם מוגבלויות.
1. האתר מותאם לגלישה בדפדפנים מודרניים ולשימוש במכשירים ניידים.
2. אנו משתדלים לשמור על קונטרסט גבוה בין טקסט לרקע וניווט ברור.
3. במידה ונתקלתם בבעיית נגישות כלשהי במהלך המשחק, נשמח אם תפנו אלינו כדי שנוכל לתקן ולשפר את החוויה עבור כולם.`;
    }

    return (
      <div style={styles.overlay}>
        <div style={styles.legalModal}>
          <h2 style={{color: '#2f3542', marginTop: 0}}>{title}</h2>
          <div style={{textAlign: 'right', whiteSpace: 'pre-line', lineHeight: '1.6', color: '#576574', marginBottom: '20px', fontSize: '0.95rem'}}>
            {content}
          </div>
          <button style={styles.primaryBtn} onClick={() => setLegalDoc(null)}>סגור והבנתי</button>
        </div>
      </div>
    );
  };

  // --- מסכים ---

  if (appState === 'menu') {
    return (
      <div style={styles.containerFixed}>
        <div style={styles.card}>
          
          <img 
            src="https://i.postimg.cc/MKHZBh1K/1000182904-removebg-preview.png" 
            alt="מפענחי הצפנים" 
            style={{ width: '130px', height: 'auto', margin: '0 auto 10px auto', display: 'block' }} 
          />
          <h1 style={styles.title}>מפענחי הצפנים</h1>

          <div style={styles.selectionBox}>
             <p style={styles.sectionLabel}>בחר גיל:</p>
             <div style={styles.tabGroup}>
                {['ילדים', 'נוער', 'מבוגרים'].map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setSelectedCategory(cat)} 
                    style={{...styles.tabBtn, backgroundColor: selectedCategory === cat ? '#48dbfb' : '#f1f2f6', color: '#000'}}
                  >
                    {cat}
                  </button>
                ))}
             </div>
             <p style={styles.sectionLabel}>בחר רמה:</p>
             <div style={styles.tabGroup}>
                <button onClick={() => setSelectedLevel('easy')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'easy' ? '#1dd1a1' : '#f1f2f6', color: '#000'}}>קל</button>
                <button onClick={() => setSelectedLevel('medium')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'medium' ? '#feca57' : '#f1f2f6', color: '#000'}}>בינוני</button>
                <button onClick={() => setSelectedLevel('hard')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'hard' ? '#ff6b6b' : '#f1f2f6', color: selectedLevel === 'hard' ? '#fff' : '#000'}}>קשה</button>
             </div>
          </div>
          <hr style={{margin: '15px 0', opacity: 0.2}} />
          {player ? (
            <div style={styles.welcomeBox}>
              <h3 style={{margin: '0 0 5px 0', color: '#2f3542'}}>היי {player.first_name}! 👋</h3>
              <div style={styles.scoreBadge}>נקודות ברמה זו: {currentScore}</div>
              <div style={{marginTop: '10px'}}><button style={styles.logoutBtn} onClick={handleLogout}>התנתק משתמש</button></div>
            </div>
          ) : ( 
            <div style={styles.welcomeBox}>
               <p style={styles.subtitle}>מוכנים לפצח את הקוד?</p>
               <div style={styles.scoreBadge}>נקודות ברמה זו: {currentScore}</div>
            </div>
          )}
          <div style={styles.menuButtons}>
            {!player && <button style={styles.secondaryBtn} onClick={() => setAppState('login')}>התחברות / הרשמה</button>}
            <button style={styles.primaryBtn} onClick={() => { setAppState('playing'); fetchRandomPhrase(); }}>שחק עכשיו 🎮</button>
          </div>
        </div>

        <div style={styles.footer}>
          <span style={styles.footerLink} onClick={() => setLegalDoc('terms')}>תנאי שימוש</span> | 
          <span style={styles.footerLink} onClick={() => setLegalDoc('privacy')}>מדיניות פרטיות</span> | 
          <span style={styles.footerLink} onClick={() => setLegalDoc('accessibility')}>הצהרת נגישות</span>
        </div>

        {showCookieConsent && (
          <div style={styles.cookieBanner}>
            <div style={{fontSize: '1.5rem', marginBottom: '5px'}}>🍪</div>
            <h4 style={{margin: '0 0 5px 0', color: '#2f3542'}}>אנחנו משתמשים בעוגיות</h4>
            <p style={{fontSize: '0.85rem', color: '#576574', margin: '0 0 15px 0'}}>
              האתר עושה שימוש בקבצי "קוקיז" כדי לשמור את ההתקדמות שלך ולספק חווית משחק מותאמת אישית, וכן להצגת מודעות רלוונטיות (כמו Google AdSense).
            </p>
            <div style={{display: 'flex', gap: '10px'}}>
              <button style={{...styles.primaryBtn, padding: '10px 20px', fontSize: '1rem'}} onClick={acceptCookies}>הבנתי והסכמתי</button>
              <button style={{...styles.secondaryBtn, padding: '10px 20px', fontSize: '1rem', backgroundColor: '#f1f2f6', color: '#2f3542', boxShadow: 'none'}} onClick={() => setLegalDoc('privacy')}>קרא עוד</button>
            </div>
          </div>
        )}

        {renderLegalModal()}

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
        
        {/* הוספנו lang="he" ו-dir="rtl" כדי שהמקלדת תמיד תיפתח בעברית! */}
        <input 
           ref={inputRef}
           type="text"
           lang="he"
           dir="rtl"
           value={hiddenInputValue}
           onChange={handleNativeInput}
           onFocus={() => setIsKeyboardOpen(true)}
           onBlur={() => setIsKeyboardOpen(false)}
           style={{position: 'absolute', top: '50px', left: 0, opacity: 0, width: '1px', height: '1px', border: 'none', padding: 0}}
           autoComplete="off" autoCorrect="off" spellCheck="false"
        />

        <div style={styles.topSectionFixed}>
            <div style={styles.topBar}>
              <div>
                <div style={{fontSize: '0.8rem', opacity: 0.9}}>{selectedCategory} | {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}</div>
                <div style={{fontWeight:'bold', marginTop: '2px', fontSize: '1rem'}}>נושא: {currentPhrase?.topic}</div>
              </div>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <div style={styles.scoreDisplay}>✨ {currentScore} </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                  <button style={{...styles.smallBtn, backgroundColor: '#feca57', color: '#2f3542', border: 'none', fontWeight:'bold'}} onClick={handleSkip}>דלג ⏭️</button>
                  <button style={styles.smallBtn} onClick={() => {saveCurrentProgress(); setAppState('menu');}}>תפריט</button>
                </div>
              </div>
            </div>
            
            <div style={styles.hintContainer}>
               <div style={{display: 'flex', justifyContent: 'center', gap: '10px'}}>
                 
                 {/* כפתור רמז מעודכן שלא מוריד מקלדת */}
                 <button 
                   style={{...styles.hintBtn, animation: forcedHintFor ? 'pulse 1.5s infinite' : 'none'}} 
                   onPointerDown={(e) => {
                     e.preventDefault();
                     applyHint();
                   }}
                 >
                   💡 {forcedHintFor ? 'שחרר נעילה!' : `רמז (${hintsUsedInRound === 0 ? 'חינם' : '-' + globalHintCost})`}
                 </button>
                 
                 {/* כפתור נקה טעויות מעודכן שלא מוריד מקלדת */}
                 {hasMistakes && (
                   <button 
                     style={styles.clearBtn} 
                     onPointerDown={(e) => {
                       e.preventDefault();
                       handleClearMistakes();
                     }}
                   >
                     🧹 נקה טעויות
                   </button>
                 )}

               </div>
            </div>
        </div>

        <div style={{
          ...styles.boardArea, 
          justifyContent: isKeyboardOpen ? 'flex-start' : 'center',
          paddingTop: isKeyboardOpen ? '10px' : '20px'
        }}>
          <div style={{
            ...styles.board,
            marginTop: isKeyboardOpen ? '0' : 'auto',
            marginBottom: isKeyboardOpen ? 'auto' : 'auto'
          }}>
            {(() => {
              let charCounter = 0;
              return currentPhrase?.text.split(' ').map((word, wordIndex) => {
                
                const wordNodes = word.split('').map((char) => {
                  const index = charCounter++;
                  const num = cipherMap[char];
                  const isInitial = initialIndices.includes(index); 
                  const guessed = isInitial ? char : (userGuesses[num] || '');
                  const isSelected = selectedNumber === num && !isInitial;
                  const isCorrect = correctCiphers.includes(num);
                  const isForcedHint = forcedHintFor === num && !isInitial;
                  
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
                      onPointerDown={(e) => {
                        e.preventDefault(); 
                        handleBoxClick(index, num, isInitial);
                      }}
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
                });
                
                charCounter++;

                return (
                  <div key={wordIndex} style={styles.wordWrapper}>
                    {wordNodes}
                  </div>
                );
              });
            })()}
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
  containerFixed: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', padding: '15px', boxSizing: 'border-box', position: 'relative' },
  containerFull: { display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: '#f7f1e3', direction: 'rtl', overflow: 'hidden' }, 
  card: { backgroundColor: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '380px' },
  title: { color: '#ff6b6b', fontSize: '1.8rem', marginBottom: '10px', textShadow: '1px 1px 0 #feca57' },
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
  
  footer: { position: 'absolute', bottom: '15px', display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#7f8fa6' },
  footerLink: { cursor: 'pointer', textDecoration: 'underline' },

  cookieBanner: { position: 'fixed', bottom: '20px', left: '20px', right: '20px', backgroundColor: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  legalModal: { backgroundColor: '#fff', padding: '25px', borderRadius: '20px', width: '90%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' },

  topSectionFixed: { backgroundColor: '#2f3542', flexShrink: 0, borderBottom: '4px solid #feca57', display: 'flex', flexDirection: 'column' },
  topBar: { color: '#fff', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hintContainer: { backgroundColor: '#dfe6e9', padding: '10px', textAlign: 'center' },
  hintBtn: { backgroundColor: '#ff9f43', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 3px 0 #e67e22', fontSize: '0.9rem' },
  
  clearBtn: { backgroundColor: '#ff6b6b', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 3px 0 #e55039', fontSize: '0.9rem' },

  scoreDisplay: { color: '#feca57', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '2px' },
  smallBtn: { background: 'none', border: '1px solid #fff', color: '#fff', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' },
  
  boardArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', width: '100%', transition: 'all 0.3s ease' },
  board: { margin: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px', maxWidth: '800px', width: '100%' },
  
  wordWrapper: { display: 'flex', gap: '4px', direction: 'rtl', flexWrap: 'nowrap' },
  
  letterBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '3px solid', borderRadius: '4px', cursor: 'pointer', transition: '0.2s', position: 'relative', flexShrink: 0 },
  guessedLetter: { fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' },
  checkmark: { position: 'absolute', top: '-3px', right: '-3px', color: '#1dd1a1', fontSize: '0.4em', backgroundColor: '#fff', borderRadius: '50%', padding: '1px' },
  secretNumber: { fontWeight: 'bold' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', padding: '30px', borderRadius: '25px', textAlign: 'center', maxWidth: '300px', boxShadow: '0 15px 30px rgba(0,0,0,0.3)' }
};

export default App;
