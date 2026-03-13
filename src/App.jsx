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
  const [selectedLevel, setSelectedLevel] = useState('easy'); // easy, medium, hard

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
  const [correctCiphers, setCorrectCiphers] = useState([]); // מעקב אחרי אותיות שקיבלו כבר נקודה

  // --- פונקציות ניקוד וסנכרון ---

  const syncScoreToDB = async (newScore) => {
    if (player) {
      const { error } = await supabase
        .from('players')
        .update({ score: newScore })
        .eq('id', player.id);
      if (error) console.error("שגיאה בעדכון ניקוד:", error);
    }
  };

  const updateScore = (amount) => {
    setScore(prev => {
      const newScore = Math.max(0, prev + amount);
      syncScoreToDB(newScore);
      return newScore;
    });
  };

  // --- לוגיקת משחק ---
  
  const generateCipherAndStart = (text) => {
    const numbers = Array.from({ length: 27 }, (_, i) => i + 1);
    const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);
    const newCipher = {};
    
    HEBREW_ALPHABET.forEach((letter, index) => {
      newCipher[letter] = shuffledNumbers[index];
    });
    newCipher[' '] = ' ';
    
    setCipherMap(newCipher);

    // --- חשיפה ראשונית (קצה חוט) ---
    // מוציאים את כל האותיות הייחודיות במשפט (ללא רווחים)
    const uniqueChars = [...new Set(text.replace(/\s/g, '').split(''))];
    
    // כמות אותיות לחשיפה לפי רמה
    let numToReveal = 3; // easy
    if (selectedLevel === 'medium') numToReveal = 2;
    if (selectedLevel === 'hard') numToReveal = 1;

    const initialGuesses = {};
    const initialCorrect = [];

    // חושפים אותיות אקראיות מתוך המשפט
    const shuffledChars = uniqueChars.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(numToReveal, shuffledChars.length); i++) {
      const char = shuffledChars[i];
      const cipherNum = newCipher[char];
      initialGuesses[cipherNum] = char;
      initialCorrect.push(cipherNum);
    }

    setUserGuesses(initialGuesses);
    setCorrectCiphers(initialCorrect);
    setSelectedNumber(null);
    setShowWinModal(false);
  };

  const fetchRandomPhrase = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('phrases')
      .select('*')
      .eq('category', selectedCategory)
      .eq('level', selectedLevel);

    if (!error && data && data.length > 0) {
      const randomItem = data[Math.floor(Math.random() * data.length)];
      setCurrentPhrase(randomItem);
      generateCipherAndStart(randomItem.text);
      setNoMorePhrases(false);
    } else {
      setNoMorePhrases(true);
    }
    setLoading(false);
  };

  // בדיקת ניצחון (משפט שלם)
  useEffect(() => {
    if (currentPhrase && Object.keys(userGuesses).length > 0) {
      const isWin = currentPhrase.text.split('').every(char => {
        if (char === ' ') return true;
        return userGuesses[cipherMap[char]] === char;
      });

      if (isWin && !showWinModal) {
        setShowWinModal(true);
        updateScore(5); // בונוס ניצחון
      }
    }
  }, [userGuesses]);

  // רמז - עולה 5 נקודות
  const getHint = () => {
    if (score < 5) {
      alert("צריך לפחות 5 נקודות בשביל רמז!");
      return;
    }

    const unGuessedChars = currentPhrase.text.split('').filter(char => {
      if (char === ' ') return false;
      return userGuesses[cipherMap[char]] !== char;
    });

    if (unGuessedChars.length > 0) {
      const randomChar = unGuessedChars[Math.floor(Math.random() * unGuessedChars.length)];
      const num = cipherMap[randomChar];
      handleVirtualKeyPress(randomChar, num);
      updateScore(-5);
    }
  };

  const handleVirtualKeyPress = (letter, forcedNumber = null) => {
    const targetNumber = forcedNumber || selectedNumber;
    if (targetNumber !== null) {
      // בדיקה אם הניחוש נכון בפעם הראשונה כדי לתת נקודה
      const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNumber);
      
      if (letter === correctLetter && !correctCiphers.includes(targetNumber)) {
        updateScore(1);
        setCorrectCiphers(prev => [...prev, targetNumber]);
      }

      // מעדכן את האות בכל המקומות שבהם מופיע המספר
      setUserGuesses(prev => ({ ...prev, [targetNumber]: letter }));
    }
  };

  // --- התחברות ללא סיסמה ---
  const handleLoginOrRegister = async () => {
    if (!loginContact.trim()) {
      setLoginError('חובה להזין טלפון או אימייל');
      return;
    }
    setLoading(true);
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('contact_info', loginContact.trim())
      .single();

    if (existingPlayer) {
      setPlayer(existingPlayer);
      setScore(existingPlayer.score || 0);
      setAppState('menu');
    } else {
      if (!loginName.trim()) {
        setLoginError('שחקן חדש? בבקשה רשום שם פרטי');
        setLoading(false);
        return;
      }
      const { data: newP, error } = await supabase
        .from('players')
        .insert([{ first_name: loginName.trim(), contact_info: loginContact.trim(), score: 0 }])
        .select()
        .single();

      if (!error) {
        setPlayer(newP);
        setScore(0);
        setAppState('menu');
      }
    }
    setLoading(false);
  };

  // --- תצוגות (Screens) ---

  if (appState === 'menu') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>🌟 מפענחי הצפנים 🌟</h1>
          
          {/* בחירת קטגוריה ורמה */}
          <div style={styles.selectionBox}>
             <p style={{fontWeight: 'bold', marginBottom: '5px'}}>בחר גיל:</p>
             <div style={styles.tabGroup}>
                <button onClick={() => setSelectedCategory('ילדים')} style={{...styles.tabBtn, backgroundColor: selectedCategory === 'ילדים' ? '#48dbfb' : '#f1f2f6'}}>ילדים</button>
                <button onClick={() => setSelectedCategory('נוער')} style={{...styles.tabBtn, backgroundColor: selectedCategory === 'נוער' ? '#48dbfb' : '#f1f2f6'}}>נוער</button>
                <button onClick={() => setSelectedCategory('מבוגרים')} style={{...styles.tabBtn, backgroundColor: selectedCategory === 'מבוגרים' ? '#48dbfb' : '#f1f2f6'}}>מבוגרים</button>
             </div>

             <p style={{fontWeight: 'bold', marginBottom: '5px', marginTop: '15px'}}>בחר רמה:</p>
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
          ) : (
            <p style={styles.subtitle}>מוכנים לפצח את הקוד?</p>
          )}
          
          <div style={styles.menuButtons}>
            {!player && (
              <button style={styles.secondaryBtn} onClick={() => setAppState('login')}>התחברות / הרשמה</button>
            )}
            <button 
              style={styles.primaryBtn} 
              onClick={player ? () => { setAppState('playing'); fetchRandomPhrase(); } : () => setShowGuestWarning(true)}
            >
              שחק עכשיו 🎮
            </button>
          </div>
        </div>

        {showGuestWarning && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h2 style={{color:'#ff6b6b'}}>רגע אחד!</h2>
              <p>בתור אורח, הניקוד שלך לא יישמר בשרת.</p>
              <button style={styles.primaryBtn} onClick={() => { setAppState('playing'); fetchRandomPhrase(); setShowGuestWarning(false); }}>שחק בכל זאת</button>
              <button style={styles.secondaryBtn} onClick={() => setShowGuestWarning(false)}>חזור להרשמה</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appState === 'login') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>כניסה למשחק</h2>
          <input 
            type="text" placeholder="טלפון או אימייל" 
            value={loginContact} onChange={(e) => setLoginContact(e.target.value)} 
            style={styles.input} 
          />
          <input 
            type="text" placeholder="שם פרטי (לשחקנים חדשים)" 
            value={loginName} onChange={(e) => setLoginName(e.target.value)} 
            style={styles.input} 
          />
          {loginError && <p style={{color:'red', fontSize:'0.9rem'}}>{loginError}</p>}
          <button style={styles.primaryBtn} onClick={handleLoginOrRegister} disabled={loading}>
            {loading ? 'מתחבר...' : 'היכנס למשחק'}
          </button>
          <button style={styles.secondaryBtn} onClick={() => setAppState('menu')}>ביטול</button>
        </div>
      </div>
    );
  }

  if (appState === 'playing') {
    if (noMorePhrases) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h2 style={styles.title}>🏆 סיימת הכל! 🏆</h2>
            <p>אין יותר משפטים ב{selectedCategory} רמת {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}.</p>
            <p>חזור בקרוב לעדכונים!</p>
            <button style={styles.primaryBtn} onClick={() => setAppState('menu')}>חזור לתפריט</button>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.containerGame}>
        <div style={styles.topBar}>
          <div style={{fontWeight:'bold'}}>{selectedCategory} | {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}</div>
          <div style={styles.scoreDisplay}>✨ {score} נקודות</div>
          <button style={styles.smallBtn} onClick={() => setAppState('menu')}>תפריט</button>
        </div>

        <div style={styles.boardArea}>
          <div style={styles.board}>
            {currentPhrase?.text.split('').map((char, index) => {
              if (char === ' ') return <div key={index} style={{ width: '20px' }}></div>;
              const num = cipherMap[char];
              const guessed = userGuesses[num] || '';
              const isSelected = selectedNumber === num;
              
              return (
                <div 
                  key={index} 
                  style={{
                    ...styles.letterBox, 
                    borderColor: isSelected ? '#ff9f43' : '#c8d6e5',
                    backgroundColor: isSelected ? '#fffdf3' : '#fff'
                  }} 
                  onClick={() => setSelectedNumber(num)}
                >
                  <div style={styles.guessedLetter}>{guessed}</div>
                  <div style={styles.secretNumber}>{num}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.keyboardArea}>
          <div style={{textAlign:'center', marginBottom: '15px'}}>
             <button style={styles.hintBtn} onClick={getHint}>💡 בקש רמז (-5 נקודות)</button>
          </div>
          
          <div style={styles.keyboardRow}>
            {HEBREW_ALPHABET.slice(0, 10).map(l => (
              <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>
            ))}
          </div>
          <div style={styles.keyboardRow}>
            {HEBREW_ALPHABET.slice(10, 20).map(l => (
              <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>
            ))}
          </div>
          <div style={styles.keyboardRow}>
            <button style={{...styles.keyBtn, backgroundColor:'#ff6b6b', color:'#fff', flex: 1.5}} onClick={() => handleVirtualKeyPress('')}>מחק</button>
            {HEBREW_ALPHABET.slice(20).map(l => (
              <button key={l} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(l)}>{l}</button>
            ))}
          </div>
        </div>

        {showWinModal && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h1 style={{fontSize: '3rem'}}>🎉</h1>
              <h2 style={{color: '#1dd1a1'}}>כל הכבוד!</h2>
              <p>פיצחת את הצופן וזכית ב-5 נקודות בונוס!</p>
              <button style={styles.primaryBtn} onClick={fetchRandomPhrase}>לצופן הבא ➡️</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// --- אובייקט עיצוב מלא ---
const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f7f1e3', direction: 'rtl', padding: '20px', fontFamily: '"Segoe UI", sans-serif' },
  containerGame: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f7f1e3', direction: 'rtl', fontFamily: '"Segoe UI", sans-serif' },
  card: { backgroundColor: '#fff', padding: '40px', borderRadius: '25px', boxShadow: '0 15px 30px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '400px' },
  title: { color: '#ff6b6b', fontSize: '2.2rem', marginBottom: '10px', textShadow: '2px 2px 0 #feca57' },
  subtitle: { color: '#576574', fontSize: '1.2rem', marginBottom: '20px' },
  selectionBox: { textAlign: 'right', marginTop: '10px' },
  tabGroup: { display: 'flex', gap: '5px', marginTop: '5px' },
  tabBtn: { flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', transition: '0.2s' },
  welcomeBox: { marginBottom: '20px' },
  scoreBadge: { backgroundColor: '#feca57', color: '#fff', padding: '8px 20px', borderRadius: '25px', display: 'inline-block', fontWeight: 'bold', fontSize: '1.1rem' },
  menuButtons: { display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' },
  primaryBtn: { backgroundColor: '#1dd1a1', color: '#fff', border: 'none', padding: '15px', borderRadius: '15px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 5px 0 #10ac84' },
  secondaryBtn: { backgroundColor: '#48dbfb', color: '#fff', border: 'none', padding: '15px', borderRadius: '15px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 5px 0 #2e86de', marginTop: '10px' },
  hintBtn: { backgroundColor: '#ff9f43', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 0 #e67e22' },
  input: { width: '100%', padding: '15px', margin: '10px 0', borderRadius: '12px', border: '2px solid #c8d6e5', fontSize: '1.1rem', boxSizing: 'border-box', outline: 'none' },
  topBar: { backgroundColor: '#2f3542', color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  scoreDisplay: { color: '#feca57', fontWeight: 'bold', fontSize: '1.2rem' },
  smallBtn: { background: 'none', border: '1px solid #fff', color: '#fff', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' },
  boardArea: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', overflowY: 'auto' },
  board: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', maxWidth: '800px' },
  letterBox: { width: '45px', height: '65px', backgroundColor: '#fff', borderBottom: '4px solid #54a0ff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '8px', transition: '0.2s' },
  guessedLetter: { fontSize: '1.8rem', fontWeight: 'bold', color: '#2f3542', height: '35px' },
  secretNumber: { fontSize: '1rem', color: '#ff9f43', fontWeight: 'bold' },
  keyboardArea: { backgroundColor: '#dfe6e9', padding: '15px', borderTop: '2px solid #b2bec3' },
  keyboardRow: { display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '8px' },
  keyBtn: { flex: 1, maxWidth: '42px', height: '48px', backgroundColor: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 3px 0 #b2bec3', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', padding: '40px', borderRadius: '30px', textAlign: 'center', maxWidth: '350px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }
};

export default App;