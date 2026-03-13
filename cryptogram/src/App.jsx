import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const HEBREW_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתםןץףך'.split('');

function App() {
  const [appState, setAppState] = useState('menu'); 
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  
  // נתוני שחקן
  const [player, setPlayer] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginContact, setLoginContact] = useState('');
  const [loginError, setLoginError] = useState('');

  // נתוני משחק
  const [currentPhrase, setCurrentPhrase] = useState(null);
  const [cipherMap, setCipherMap] = useState({});
  const [userGuesses, setUserGuesses] = useState({}); 
  const [selectedNumber, setSelectedNumber] = useState(null); // איזה מספר מסומן עכשיו להקלדה

  // --- לוגיקת משחק ---
  
  const generateCipherMap = (text) => {
    const numbers = Array.from({ length: 27 }, (_, i) => i + 1);
    const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);
    const newCipher = {};
    
    HEBREW_ALPHABET.forEach((letter, index) => {
      newCipher[letter] = shuffledNumbers[index];
    });
    newCipher[' '] = ' ';
    setCipherMap(newCipher);
    setUserGuesses({});
    setSelectedNumber(null);
  };

  const fetchRandomPhrase = async () => {
    const { data, error } = await supabase.from('phrases').select('*').eq('category', 'ילדים');
    if (!error && data && data.length > 0) {
      const randomItem = data[Math.floor(Math.random() * data.length)];
      setCurrentPhrase(randomItem);
      generateCipherMap(randomItem.text);
    }
  };

  const startGame = () => {
    setShowGuestWarning(false);
    setAppState('playing');
    fetchRandomPhrase();
  };

  // --- לוגיקת התחברות (ללא סיסמה) ---
  const handleLoginOrRegister = async () => {
    if (!loginContact.trim()) {
      setLoginError('חובה להזין מספר טלפון או אימייל');
      return;
    }

    // נבדוק אם השחקן קיים לפי אימייל/טלפון
    const { data: existingPlayer, error: fetchError } = await supabase
      .from('players')
      .select('*')
      .eq('contact_info', loginContact.trim())
      .single();

    if (existingPlayer) {
      // השחקן קיים - נחבר אותו
      setPlayer(existingPlayer);
      setAppState('menu');
      setLoginError('');
    } else {
      // שחקן חדש - נוודא שיש שם ונרשום אותו
      if (!loginName.trim()) {
        setLoginError('לשחקן חדש חובה להזין שם פרטי');
        return;
      }
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert([{ first_name: loginName.trim(), contact_info: loginContact.trim(), score: 0 }])
        .select()
        .single();

      if (!insertError) {
        setPlayer(newPlayer);
        setAppState('menu');
        setLoginError('');
      } else {
        setLoginError('שגיאה בהרשמה, נסה שוב');
      }
    }
  };

  // --- מקלדת וירטואלית ---
  const handleVirtualKeyPress = (letter) => {
    if (selectedNumber !== null) {
      // מעדכן את האות בכל מקום שבו המספר הזה מופיע!
      setUserGuesses(prev => ({ ...prev, [selectedNumber]: letter }));
    }
  };

  const handleBackspace = () => {
    if (selectedNumber !== null) {
      setUserGuesses(prev => {
        const newGuesses = { ...prev };
        delete newGuesses[selectedNumber];
        return newGuesses;
      });
    }
  };

  // תמיכה במקלדת פיזית (למחשב)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (appState !== 'playing' || selectedNumber === null) return;
      if (e.key === 'Backspace') handleBackspace();
      if (/^[א-ת]$/.test(e.key)) handleVirtualKeyPress(e.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, selectedNumber]);

  // --- תצוגות ---

  if (appState === 'menu') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>🌟 מפענחי הצפנים 🌟</h1>
          {player ? (
            <h3 style={{ color: '#2ecc71' }}>שלום, {player.first_name}! (ניקוד: {player.score})</h3>
          ) : (
            <p style={styles.subtitle}>התחברו כדי לשמור את הניקוד שלכם!</p>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
            {!player && (
              <button style={styles.primaryBtn} onClick={() => setAppState('login')}>
                התחברות / הרשמה מהירה
              </button>
            )}
            <button style={player ? styles.primaryBtn : styles.secondaryBtn} onClick={player ? startGame : () => setShowGuestWarning(true)}>
              {player ? 'שחק עכשיו 🎮' : 'שחק כאורח 🎮'}
            </button>
          </div>
        </div>

        {showGuestWarning && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h2 style={{ color: '#ff6b6b' }}>רגע אחד! ✋</h2>
              <p>בתור אורח, הניקוד שלך לא יישמר.</p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button style={styles.primaryBtn} onClick={startGame}>שחק בכל זאת</button>
                <button style={styles.secondaryBtn} onClick={() => setShowGuestWarning(false)}>חזור</button>
              </div>
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
          <h2 style={styles.title}>כניסה לשחקנים</h2>
          <p style={{fontSize: '0.9rem', color: '#666'}}>מזינים טלפון/מייל. אם אתה חדש, הוסף גם שם!</p>
          
          <input 
            type="text" placeholder="אימייל או מספר טלפון (חובה)" 
            value={loginContact} onChange={(e) => setLoginContact(e.target.value)}
            style={styles.input} 
          />
          <input 
            type="text" placeholder="שם פרטי (חובה רק לשחקן חדש)" 
            value={loginName} onChange={(e) => setLoginName(e.target.value)}
            style={styles.input} 
          />
          
          {loginError && <p style={{ color: 'red', margin: '5px 0' }}>{loginError}</p>}
          
          <button style={{...styles.primaryBtn, marginTop: '15px'}} onClick={handleLoginOrRegister}>
            הכנס אותי למשחק!
          </button>
          <button style={{...styles.secondaryBtn, marginTop: '10px'}} onClick={() => setAppState('menu')}>
            ביטול
          </button>
        </div>
      </div>
    );
  }

  if (appState === 'playing' && currentPhrase) {
    return (
      <div style={styles.containerGame}>
        <div style={styles.topBar}>
          <h3 style={{ margin: 0, color: '#fff' }}>נושא: {currentPhrase.topic}</h3>
          <button style={styles.smallBtn} onClick={() => setAppState('menu')}>חזור לתפריט</button>
        </div>
        
        {/* הלוח המרכזי */}
        <div style={styles.boardArea}>
          <div style={styles.board}>
            {currentPhrase.text.split('').map((char, index) => {
              if (char === ' ') return <div key={`space-${index}`} style={{ width: '15px' }}></div>;
              
              const numberForChar = cipherMap[char];
              const isSelected = selectedNumber === numberForChar;
              const guessedLetter = userGuesses[numberForChar] || '';

              return (
                <div 
                  key={`char-${index}`} 
                  style={{...styles.letterBox, borderColor: isSelected ? '#ff9f43' : '#c8d6e5', backgroundColor: isSelected ? '#fffdf3' : '#fff'}}
                  onClick={() => setSelectedNumber(numberForChar)}
                >
                  <div style={{...styles.guessedLetter, color: guessedLetter ? '#2f3542' : 'transparent'}}>
                    {guessedLetter || char} {/* מציג את האות אם נוחשה */}
                  </div>
                  <div style={styles.secretNumber}>{numberForChar}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* המקלדת הוירטואלית בתחתית */}
        <div style={styles.keyboardArea}>
          <div style={styles.keyboardRow}>
            {HEBREW_ALPHABET.slice(0, 10).map(letter => (
              <button key={letter} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(letter)}>{letter}</button>
            ))}
          </div>
          <div style={styles.keyboardRow}>
            {HEBREW_ALPHABET.slice(10, 20).map(letter => (
              <button key={letter} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(letter)}>{letter}</button>
            ))}
          </div>
          <div style={styles.keyboardRow}>
            <button style={{...styles.keyBtn, backgroundColor: '#ff6b6b', flex: 1.5}} onClick={handleBackspace}>מחק</button>
            {HEBREW_ALPHABET.slice(20).map(letter => (
              <button key={letter} style={styles.keyBtn} onClick={() => handleVirtualKeyPress(letter)}>{letter}</button>
            ))}
          </div>
          <button style={{...styles.primaryBtn, marginTop: '15px', borderRadius: '8px', padding: '10px'}} onClick={fetchRandomPhrase}>
             דלג למילה חדשה 🎲
          </button>
        </div>
      </div>
    );
  }

  return <div style={styles.container}><h2>טוען...</h2></div>;
}

const styles = {
  container: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh',
    backgroundColor: '#f7f1e3', direction: 'rtl', fontFamily: '"Segoe UI", Tahoma, sans-serif', padding: '20px'
  },
  containerGame: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    backgroundColor: '#f7f1e3', direction: 'rtl', fontFamily: '"Segoe UI", Tahoma, sans-serif',
  },
  card: {
    backgroundColor: '#ffffff', padding: '40px', borderRadius: '24px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', maxWidth: '400px',
  },
  title: { color: '#ff6b6b', fontSize: '2.5rem', margin: '0 0 10px 0', textShadow: '2px 2px 0px #feca57' },
  subtitle: { color: '#576574', fontSize: '1.2rem' },
  primaryBtn: {
    backgroundColor: '#1dd1a1', color: 'white', border: 'none', padding: '15px',
    fontSize: '1.2rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', width: '100%',
  },
  secondaryBtn: {
    backgroundColor: '#feca57', color: '#fff', border: 'none', padding: '15px',
    fontSize: '1.2rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', width: '100%',
  },
  smallBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', 
    padding: '5px 10px', borderRadius: '8px', cursor: 'pointer'
  },
  input: {
    width: '100%', padding: '12px', margin: '10px 0', borderRadius: '8px',
    border: '2px solid #c8d6e5', fontSize: '1.1rem', boxSizing: 'border-box', direction: 'rtl',
  },
  topBar: {
    backgroundColor: '#48dbfb', padding: '15px 20px', display: 'flex', 
    justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
  },
  boardArea: {
    flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', overflowY: 'auto'
  },
  board: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', maxWidth: '600px'
  },
  letterBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: '45px', height: '60px', backgroundColor: '#fff', borderBottom: '4px solid',
    borderRadius: '8px 8px 0 0', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s'
  },
  guessedLetter: {
    fontSize: '1.6rem', fontWeight: 'bold', height: '30px'
  },
  secretNumber: {
    fontSize: '1rem', fontWeight: 'bold', color: '#ff9f43', marginTop: '2px'
  },
  keyboardArea: {
    backgroundColor: '#dfe6e9', padding: '15px', borderTop: '2px solid #b2bec3',
    paddingBottom: 'max(15px, env(safe-area-inset-bottom))' // התאמה לאייפונים
  },
  keyboardRow: {
    display: 'flex', justifyContent: 'center', gap: '5px', marginBottom: '8px'
  },
  keyBtn: {
    flex: 1, maxWidth: '40px', height: '45px', backgroundColor: '#fff',
    border: 'none', borderRadius: '6px', fontSize: '1.2rem', fontWeight: 'bold',
    color: '#2d3436', cursor: 'pointer', boxShadow: '0 2px 0px #b2bec3',
    display: 'flex', justifyContent: 'center', alignItems: 'center'
  },
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white', padding: '30px', borderRadius: '20px', maxWidth: '350px', textAlign: 'center',
  }
};

export default App;