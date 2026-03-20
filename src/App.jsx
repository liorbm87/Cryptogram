import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// אלף-בית עברי מלא כולל סופיות
const HEBREW_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתםןץףך'.split('');

function App() {
  // --- מצבי אפליקציה ---
  const [appState, setAppState] = useState('menu'); 
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showCycleResetMsg, setShowCycleResetMsg] = useState(false);
  const [noMorePhrases, setNoMorePhrases] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // --- חסימת מסך אופקי בנייד ---
  const [isLandscape, setIsLandscape] = useState(false);

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
  const [selectedIndex, setSelectedIndex] = useState(null); 
  const [correctCiphers, setCorrectCiphers] = useState([]); 
  const [hintsUsedInRound, setHintsUsedInRound] = useState(0); 

  // --- תוספות: חשיפה, זיכרון, נעילות ורמאויות ---
  const [initialIndices, setInitialIndices] = useState([]); 
  const [strikes, setStrikes] = useState({}); 
  const [hintLimits, setHintLimits] = useState({}); 
  const [forcedHintFor, setForcedHintFor] = useState(null); 
  const [activeBubbleHint, setActiveBubbleHint] = useState(null);

  // --- הודעות קופצות (מניעת ירידת מקלדת) ---
  const [toastMsg, setToastMsg] = useState('');
  const [toastTimeout, setToastTimeout] = useState(null);

  // --- תוספות למערכת הרמזים הכלכלית ---
  const [localStats, setLocalStats] = useState({});
  const currentKey = `${selectedCategory}_${selectedLevel}`;
  const currentStats = player?.category_stats?.[currentKey] || localStats[currentKey] || { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false };
  const currentScore = currentStats.score;
  const globalHintCost = currentStats.hint_cost || 1;
  const wordsInCycle = currentStats.cycle || 0;

  // --- חיבור למקלדת טלפון מובנית ---
  const inputRef = useRef(null);
  const [hiddenInputValue, setHiddenInputValue] = useState(' '); 
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // --- חוקיות, עוגיות ומסמכים ---
  const [showCookieConsent, setShowCookieConsent] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null); 

  // --- התקנת אפליקציה (PWA) ---
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);

  // --- פאנל ניהול נסתר ועדכונים ---
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminPlayers, setAdminPlayers] = useState([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedAdminPlayer, setSelectedAdminPlayer] = useState(null);
  const [adminEditingStats, setAdminEditingStats] = useState({});
  const [showLoginHistory, setShowLoginHistory] = useState(false);
  const [isModalKeyboardOpen, setIsModalKeyboardOpen] = useState(false);
  
  // מה חדש וסטטיסטיקות כניסה
  const [whatsNewText, setWhatsNewText] = useState('');
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [adminWhatsNewInput, setAdminWhatsNewInput] = useState('');
  const [showVisitsModal, setShowVisitsModal] = useState(false);
  const [visitStats, setVisitStats] = useState({ today: 0, week: 0, month: 0 });

  const syncTimeoutRef = useRef(null);

  const showToast = (msg) => {
    if (toastTimeout) clearTimeout(toastTimeout);
    setToastMsg(msg);
    const t = setTimeout(() => setToastMsg(''), 3500);
    setToastTimeout(t);
  };

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile && window.innerWidth > window.innerHeight) {
        setIsLandscape(true);
      } else {
        setIsLandscape(false);
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    });

    const initApp = async () => {
      const savedPlayer = localStorage.getItem('crypto_player_session');
      if (savedPlayer) {
        const p = JSON.parse(savedPlayer);
        p.completed_phrases = p.completed_phrases || [];
        p.saved_progress = p.saved_progress || {};
        p.category_stats = p.category_stats || {};
        p.used_child_hints = p.used_child_hints || {};
        setPlayer(p);
        updateLoginHistoryInDB(p);
      }

      const hasConsented = localStorage.getItem('crypto_cookie_consent');
      if (!hasConsented) {
        setShowCookieConsent(true);
      }

      const { data: settingsData } = await supabase.from('admin_settings').select('whats_new').eq('id', 1).single();
      if (settingsData && settingsData.whats_new) {
        setWhatsNewText(settingsData.whats_new);
        setAdminWhatsNewInput(settingsData.whats_new);
      }

      const lastGlobalVisit = localStorage.getItem('crypto_global_visit');
      const now = new Date();
      if (!lastGlobalVisit || (now - new Date(lastGlobalVisit)) > 1000 * 60 * 60) {
        await supabase.from('site_visits').insert([{ visited_at: now.toISOString() }]);
        localStorage.setItem('crypto_global_visit', now.toISOString());
      }
    };

    initApp();

    return () => {
        window.removeEventListener('resize', checkOrientation);
        window.removeEventListener('orientationchange', checkOrientation);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      if (isIos) {
        setShowIosInstall(true);
      } else {
        alert("כדי להתקין, פתח את תפריט הדפדפן ולחץ על 'הוסף למסך הבית' או 'Install App'.");
      }
    }
  };

  const updateLoginHistoryInDB = async (p) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const { data: dbPlayer } = await supabase.from('players').select('last_login, login_history, category_stats').eq('id', p.id).single();
    
    if (dbPlayer) {
      let currentHistory = Array.isArray(dbPlayer.login_history) ? dbPlayer.login_history : [];
      let shouldAddToHistory = true;

      if (currentHistory.length > 0) {
        const lastEntryTime = new Date(currentHistory[0]);
        const diffInMinutes = (now - lastEntryTime) / (1000 * 60);
        if (diffInMinutes < 15) {
          shouldAddToHistory = false;
        }
      }

      const updatedHistory = shouldAddToHistory ? [nowIso, ...currentHistory] : currentHistory;
      await supabase.from('players').update({ last_login: nowIso, login_history: updatedHistory }).eq('id', p.id);
      
      const updatedPlayer = { ...p, last_login: nowIso, login_history: updatedHistory, category_stats: dbPlayer.category_stats || {} };
      setPlayer(updatedPlayer);
      localStorage.setItem('crypto_player_session', JSON.stringify(updatedPlayer));
    }
  };

  const acceptCookies = () => {
    localStorage.setItem('crypto_cookie_consent', 'true');
    setShowCookieConsent(false);
  };

  const syncPlayerToDB = (updatedFields) => {
    if (player?.id) {
        const updatedPlayer = { ...player, ...updatedFields };
        localStorage.setItem('crypto_player_session', JSON.stringify(updatedPlayer));
        setPlayer(updatedPlayer);
        
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        
        syncTimeoutRef.current = setTimeout(async () => {
            await supabase.from('players').update(updatedFields).eq('id', player.id);
        }, 800);
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

  const findNextEmptyBox = (text, cMap, correctList, initIndices, startIdx = -1) => {
    if (!text) return null;
    const chars = text.split('');
    
    for (let i = startIdx + 1; i < chars.length; i++) {
        if (chars[i] !== ' ' && !initIndices.includes(i) && !correctList.includes(cMap[chars[i]])) {
            return { index: i, num: cMap[chars[i]] };
        }
    }
    for (let i = 0; i <= startIdx; i++) {
        if (chars[i] !== ' ' && !initIndices.includes(i) && !correctList.includes(cMap[chars[i]])) {
            return { index: i, num: cMap[chars[i]] };
        }
    }
    return null;
  };

  const generateCipherAndStart = (text, loadedProgress = null) => {
    setShowCycleResetMsg(false); 
    
    if (loadedProgress) {
      setCipherMap(loadedProgress.cipherMap);
      setUserGuesses(loadedProgress.userGuesses);
      setCorrectCiphers(loadedProgress.correctCiphers);
      setInitialIndices(loadedProgress.initialIndices || []); 
      setStrikes(loadedProgress.strikes);
      setHintLimits(loadedProgress.hintLimits);
      setForcedHintFor(loadedProgress.forcedHintFor);
      setHintsUsedInRound(loadedProgress.hintsUsedInRound);
      
      const nextEmpty = findNextEmptyBox(text, loadedProgress.cipherMap, loadedProgress.correctCiphers, loadedProgress.initialIndices || [], -1);
      if (nextEmpty) {
          setSelectedNumber(nextEmpty.num);
          setSelectedIndex(nextEmpty.index);
      } else {
          setSelectedNumber(null);
          setSelectedIndex(null);
      }
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
    const totalLetters = textNoSpaces.length;
    const uniqueChars = [...new Set(textNoSpaces.split(''))];
    
    const charFrequency = {};
    textNoSpaces.split('').forEach(char => { charFrequency[char] = (charFrequency[char] || 0) + 1; });
    
    const charFreqArr = uniqueChars.map(char => ({ char, freq: charFrequency[char], rand: Math.random() }));
    charFreqArr.sort((a, b) => {
        if (b.freq !== a.freq) return b.freq - a.freq;
        return a.rand - b.rand;
    });
    const sortedCharsByFreq = charFreqArr.map(item => item.char);

    let numToReveal = 1;
    if (totalLetters <= 3) {
      numToReveal = 1;
    } else if (totalLetters <= 7) {
      numToReveal = 2;
    } else if (totalLetters <= 10) {
      numToReveal = 3;
    } else if (totalLetters <= 12) {
      numToReveal = 4;
    } else if (totalLetters <= 15) {
      numToReveal = 5;
    } else if (totalLetters <= 19) {
      numToReveal = 6;
    } else {
      numToReveal = 7;
    }

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
    setActiveBubbleHint(null);
    
    const firstEmpty = findNextEmptyBox(text, newCipher, [], newInitialIndices, -1);
    if (firstEmpty) {
        setSelectedNumber(firstEmpty.num);
        setSelectedIndex(firstEmpty.index);
    } else {
        setSelectedNumber(null);
        setSelectedIndex(null);
    }
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
        
        let currentCycle = wordsInCycle + 1;
        let nextCost = globalHintCost;
        let triggerAlert = false;

        if (currentCycle >= 3) {
            currentCycle = 0;
            if (globalHintCost > 1) {
              triggerAlert = true;
            }
            nextCost = 1;
        }

        setShowCycleResetMsg(triggerAlert);

        const newScore = Math.max(0, currentScore + winReward);
        const newStats = { ...currentStats, score: newScore, hint_cost: nextCost, cycle: currentCycle };

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
      }
    }
  }, [userGuesses]);

  const applyHint = async () => {
    const isFirstTimeClue = !currentStats.first_clue_given;
    let cost = (hintsUsedInRound === 0 && isFirstTimeClue) ? 0 : globalHintCost;
    
    if (currentScore < cost) {
      showToast(`חסרים לכם מעט זרעים... רמז דורש ${cost} זרעים.`);
      return;
    }

    let nextCost = cost === 0 ? globalHintCost : Math.min(10, globalHintCost + 1);

    // מציאת המספר והאינדקס המדויק שצריך לתת לו רמז
    let targetNum = null;
    let targetIdx = -1;

    if (forcedHintFor !== null) {
      targetNum = forcedHintFor;
      // מוצאים את המקום הראשון שבו מופיע המספר הנעול
      targetIdx = currentPhrase.text.split('').findIndex((char, i) => 
        cipherMap[char] === targetNum && !initialIndices.includes(i) && userGuesses[targetNum] !== char
      );
    } else {
      const unGuessedIndices = currentPhrase.text.split('').map((char, index) => {
        if (char === ' ') return -1;
        if (initialIndices.includes(index)) return -1;
        if (userGuesses[cipherMap[char]] === char) return -1;
        return index;
      }).filter(i => i !== -1);
      
      if (unGuessedIndices.length > 0) {
        targetIdx = unGuessedIndices[Math.floor(Math.random() * unGuessedIndices.length)];
        targetNum = cipherMap[currentPhrase.text[targetIdx]];
      }
    }

    if (targetNum === null || targetIdx === -1) return;

    // --- עדכון התיבה המסומנת כדי שהמקלדת תקליד אליה ---
    setSelectedNumber(targetNum);
    setSelectedIndex(targetIdx);
    if (inputRef.current) inputRef.current.focus();

    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNum);

    // אם אנחנו בקטגוריית ילדים - נשלוף רמז חזותי
    if (selectedCategory === 'ילדים') {
        const { data: hints } = await supabase.from('children_letter_hints')
            .select('*')
            .eq('letter', correctLetter)
            .eq('level', selectedLevel);
            
        if (hints && hints.length > 0) {
            let currentUsed = (player ? player.used_child_hints : localStats.used_child_hints) || {};
            let usedForLetter = currentUsed[`${correctLetter}_${selectedLevel}`] || [];
            
            let unusedHints = hints.filter(h => !usedForLetter.includes(h.id));
            if (unusedHints.length === 0) {
                usedForLetter = [];
                unusedHints = hints;
            }
            
            const randomHint = unusedHints[Math.floor(Math.random() * unusedHints.length)];
            const finalHintText = randomHint.hint_text.replace('{num}', targetNum);
            
            setActiveBubbleHint({ num: targetNum, text: finalHintText });
            
            usedForLetter.push(randomHint.id);
            const newUsed = { ...currentUsed, [`${correctLetter}_${selectedLevel}`]: usedForLetter };
            
            if (player) {
                const updatedPlayer = { ...player, used_child_hints: newUsed };
                setPlayer(updatedPlayer);
                syncPlayerToDB({ used_child_hints: newUsed });
            } else {
                setLocalStats(prev => ({ ...prev, used_child_hints: newUsed }));
            }

            if (forcedHintFor !== null) setForcedHintFor(null);
            updateCategoryStats({ score: currentScore - cost, hint_cost: nextCost, first_clue_given: true });
            setHintsUsedInRound(prev => prev + 1);
            return; 
        }
    }

    // התנהגות רגילה (נוער, מבוגרים או אם אין רמז ב-DB)
    if (forcedHintFor !== null) {
      setForcedHintFor(null); 
    }
    handleVirtualKeyPress(correctLetter, targetNum, true);
    updateCategoryStats({ score: currentScore - cost, hint_cost: nextCost, first_clue_given: true });
    setHintsUsedInRound(prev => prev + 1);
    showToast(`האות נחשפה בעדינות 🍃`);
  };

  const handleVirtualKeyPress = (letter, forcedNum = null, isHint = false) => {
    const targetNum = forcedNum || selectedNumber;
    if (targetNum === null) return;
    
    const isFullyInitial = currentPhrase.text.split('').every((c, i) => c === ' ' || cipherMap[c] !== targetNum || initialIndices.includes(i));
    if (isFullyInitial) return; 

    if (forcedHintFor !== null && !isHint) {
        showToast("התיבה ננעלה 🌸 עלינו להשתמש ברמז כדי להמשיך.");
        return;
    }

    const correctLetter = Object.keys(cipherMap).find(key => cipherMap[key] === targetNum);
    
    if (letter === correctLetter) {
      if (activeBubbleHint && targetNum === activeBubbleHint.num) {
          setActiveBubbleHint(null);
      }
      let currentCorrectCiphers = [...correctCiphers];
      if (!correctCiphers.includes(targetNum)) {
        if (!isHint) updateScore(1); 
        currentCorrectCiphers.push(targetNum);
        setCorrectCiphers(currentCorrectCiphers);
        setStrikes(prev => ({...prev, [targetNum]: 0})); 
      }
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
      
      const nextEmpty = findNextEmptyBox(currentPhrase.text, cipherMap, currentCorrectCiphers, initialIndices, selectedIndex !== null ? selectedIndex : -1);
      if (nextEmpty) {
          setSelectedNumber(nextEmpty.num);
          setSelectedIndex(nextEmpty.index);
      }
      
    } else {
      if (letter === '') {
        setUserGuesses(prev => ({ ...prev, [targetNum]: '' }));
        return;
      }
      
      const limit = hintLimits[targetNum] || 5;
      const currentStrikes = (strikes[targetNum] || 0) + 1;

      if (currentStrikes === limit - 1) {
          showToast("זהו ניסיון אחרון... אולי כדאי לחשוב שוב?");
      } else if (currentStrikes >= limit) {
          setForcedHintFor(targetNum);
          showToast("נראה שהאות הזו קצת מקשה עלינו... בואו נבקש רמז.");
      }
      
      setStrikes(prev => ({...prev, [targetNum]: currentStrikes}));
      setUserGuesses(prev => ({ ...prev, [targetNum]: letter }));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' || e.keyCode === 8) {
      e.preventDefault();
      if (selectedNumber === null || selectedIndex === null) return;
      
      const currentGuess = userGuesses[selectedNumber];
      if (currentGuess) {
          handleVirtualKeyPress('');
      } else {
          const chars = currentPhrase.text.split('');
          for (let i = selectedIndex - 1; i >= 0; i--) {
              if (chars[i] !== ' ' && !initialIndices.includes(i)) {
                  setSelectedNumber(cipherMap[chars[i]]);
                  setSelectedIndex(i);
                  break;
              }
          }
      }
    } else if (e.key && e.key.length === 1) {
        const engToHebMap = {
            't':'א', 'c':'ב', 'd':'ג', 's':'ד', 'v':'ה', 'u':'ו', 'z':'ז', 'j':'ח', 
            'y':'ט', 'h':'י', 'f':'כ', 'k':'ל', 'n':'מ', 'b':'נ', 'x':'ס', 'g':'ע', 
            'p':'פ', 'm':'צ', 'e':'ק', 'r':'ר', 'a':'ש', ',':'ת', 'l':'ך', 'o':'ם', 
            'i':'ן', ';':'ף', '.':'ץ'
        };
        const char = e.key.toLowerCase();
        
        if (engToHebMap[char] && /^[a-z,.;]$/.test(char)) {
            e.preventDefault();
            handleVirtualKeyPress(engToHebMap[char]);
        }
    }
  };

  const handleNativeInput = (e) => {
    const val = e.target.value;
    if (val === '') { 
        if (selectedNumber !== null && selectedIndex !== null) {
            const currentGuess = userGuesses[selectedNumber];
            if (currentGuess) {
                handleVirtualKeyPress('');
            } else {
                const chars = currentPhrase.text.split('');
                for (let i = selectedIndex - 1; i >= 0; i--) {
                    if (chars[i] !== ' ' && !initialIndices.includes(i)) {
                        setSelectedNumber(cipherMap[chars[i]]);
                        setSelectedIndex(i);
                        break;
                    }
                }
            }
        }
        setHiddenInputValue(' '); 
        return;
    } 
    const lastChar = val.slice(-1);
    if (/^[\u0590-\u05FF]$/.test(lastChar)) { 
        handleVirtualKeyPress(lastChar);
    }
    setHiddenInputValue(' '); 
  };

  const handleBoxClick = (index, num, isInitial) => {
    if (!isInitial) {
        setSelectedNumber(num);
        setSelectedIndex(index); 
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }
  };

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

  const handleLoginOrRegister = async () => {
    const contact = loginContact.trim();
    const name = loginName.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\d{9,10}$/.test(contact.replace(/-/g, ''));

    if (!isEmail && !isPhone) return setLoginError('אנא הזינו אימייל תקין או מספר טלפון (9-10 ספרות).');
    if (!name) return setLoginError('חובה להזין שם פרטי.');

    setLoading(true); setLoginError('');
    const now = new Date(); 
    const nowIso = now.toISOString();

    const { data: existingPlayer } = await supabase.from('players').select('*').eq('contact_info', contact).single();

    if (existingPlayer) {
      if (existingPlayer.first_name !== name) {
        setLoginError('השם אינו תואם לפרטי ההתקשרות הקיימים במערכת.');
        setLoading(false); return;
      }
      
      const currentHistory = Array.isArray(existingPlayer.login_history) ? existingPlayer.login_history : (existingPlayer.last_login ? [existingPlayer.last_login] : []);
      let shouldAddToHistory = true;

      if (currentHistory.length > 0) {
        const lastEntryTime = new Date(currentHistory[0]);
        const diffInMinutes = (now - lastEntryTime) / (1000 * 60);
        if (diffInMinutes < 15) {
          shouldAddToHistory = false;
        }
      }

      const updatedHistory = shouldAddToHistory ? [nowIso, ...currentHistory] : currentHistory;
      
      await supabase.from('players').update({ last_login: nowIso, login_history: updatedHistory }).eq('id', existingPlayer.id);
      
      existingPlayer.completed_phrases = existingPlayer.completed_phrases || [];
      existingPlayer.saved_progress = existingPlayer.saved_progress || {};
      existingPlayer.category_stats = existingPlayer.category_stats || {};
      existingPlayer.last_login = nowIso;
      existingPlayer.login_history = updatedHistory;
      
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
        category_stats: {},
        last_login: nowIso,
        login_history: [nowIso]
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

  const fetchGlobalVisits = async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [dDay, dWeek, dMonth] = await Promise.all([
      supabase.from('site_visits').select('*', { count: 'exact', head: true }).gte('visited_at', todayStart),
      supabase.from('site_visits').select('*', { count: 'exact', head: true }).gte('visited_at', weekStart),
      supabase.from('site_visits').select('*', { count: 'exact', head: true }).gte('visited_at', monthStart)
    ]);
    
    setVisitStats({ today: dDay.count || 0, week: dWeek.count || 0, month: dMonth.count || 0 });
  };

  const handleAdminAuth = async () => {
    setLoading(true);
    const { data: adminData } = await supabase.from('admin_settings').select('passcode').eq('id', 1).single();
    
    if (adminData && adminData.passcode === adminPasscode) {
      const { data, error } = await supabase.from('players').select('*').order('last_login', { ascending: false, nullsFirst: false });
      
      if (error) {
        alert("שגיאה במשיכת הנתונים. האם הוספת את עמודות ה-last_login ב-Supabase?");
      } else if (data) {
        setAdminPlayers(data); 
      }
      
      await fetchGlobalVisits();

      setShowAdminAuth(false);
      setAdminPasscode('');
      setAppState('admin');
    } else {
      alert('קוד שגוי או תקלה בחיבור לשרת!');
      setAdminPasscode('');
    }
    setLoading(false);
  };

  const saveAdminWhatsNew = async () => {
    await supabase.from('admin_settings').update({ whats_new: adminWhatsNewInput }).eq('id', 1);
    setWhatsNewText(adminWhatsNewInput);
    alert('העדכון נשמר ויוצג ללקוחות!');
  };

  const openAdminEdit = (p) => {
    const allCategories = ['ילדים', 'נוער', 'מבוגרים'];
    const allLevels = ['easy', 'medium', 'hard'];
    const fullStats = {};
    
    allCategories.forEach(c => {
      allLevels.forEach(l => {
        const key = `${c}_${l}`;
        fullStats[key] = p.category_stats?.[key] || { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false };
      });
    });

    setSelectedAdminPlayer(p);
    setAdminEditingStats(fullStats);
    setShowLoginHistory(false); 
  };

  const handleAdminScoreChange = (key, newScore) => {
    setAdminEditingStats(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {hint_cost: 1, cycle: 0, first_clue_given: false}), score: Number(newScore) }
    }));
  };

  const saveAdminEdits = async () => {
    await supabase.from('players').update({ category_stats: adminEditingStats }).eq('id', selectedAdminPlayer.id);
    setAdminPlayers(prev => prev.map(p => p.id === selectedAdminPlayer.id ? { ...p, category_stats: adminEditingStats } : p));
    setSelectedAdminPlayer(null);
    alert('הניקוד עודכן בהצלחה!');
  };

  const handleAdminResetUser = async () => {
    if (!window.confirm(`האם אתה בטוח שברצונך לאפס לחלוטין את ${selectedAdminPlayer.first_name}? פעולה זו תמחק ניקוד והתקדמות.`)) return;
    
    const resetStats = {
        'ילדים_easy': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'ילדים_medium': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'ילדים_hard': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'נוער_easy': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'נוער_medium': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'נוער_hard': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'מבוגרים_easy': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'מבוגרים_medium': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false },
        'מבוגרים_hard': { score: 5, hint_cost: 1, cycle: 0, first_clue_given: false }
    };

    const resetData = {
        score: 0,
        completed_phrases: [],
        saved_progress: {},
        category_stats: resetStats
    };

    await supabase.from('players').update(resetData).eq('id', selectedAdminPlayer.id);
    
    setAdminPlayers(prev => prev.map(p => p.id === selectedAdminPlayer.id ? { ...p, ...resetData } : p));
    setAdminEditingStats(resetStats);
    alert('המשתמש אופס בהצלחה וחזר לנקודת ההתחלה!');
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'לא נרשמה כניסה';
    const date = new Date(isoString);
    return date.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };


  const renderLegalModal = () => {
    if (!legalDoc) return null;
    let title = '';
    let content = '';

    if (legalDoc === 'terms') {
      title = 'תקנון ותנאי שימוש';
      content = `ברוכים הבאים למשחק "צופן החכמה".
השימוש באתר ובמשחק כפוף לתנאים הבאים:
1. המשחק מוגש "כפי שהוא" (AS IS), ללא כל התחייבות או אחריות מכל סוג שהוא.
2. ייתכן כי באתר יוצגו פרסומות מצדדים שלישיים (כגון גוגל). אין אנו אחראים לתוכן הפרסומות.
3. כל זכויות היוצרים והקניין הרוחני במשחק, בעיצוב ובלוגיקה שייכות ליוצר המשחק.
4. אנו שומרים את הזכות לשנות את כללי המשחק, הניקוד, או לאפס נתונים בכל עת.

לכל שאלה, פנייה, בקשה או דיווח על תקלה, נשמח לעמוד לרשותכם וניתן ליצור איתנו קשר בכתובת הדוא"ל: liorbm87@gmail.com`;
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
          <h2 style={{color: '#5C6B5E', marginTop: 0}}>{title}</h2>
          <div style={{textAlign: 'right', whiteSpace: 'pre-line', lineHeight: '1.6', color: '#7E8B80', marginBottom: '20px', fontSize: '0.95rem'}}>
            {content}
          </div>
          <button style={styles.primaryBtn} onClick={() => setLegalDoc(null)}>הבנתי, תודה</button>
        </div>
      </div>
    );
  };

  const landscapeOverlay = isLandscape ? (
    <div style={styles.landscapeOverlay}>
      <div style={{fontSize: '4rem', marginBottom: '10px'}}>📱</div>
      <h2 style={{color: '#8CA595', margin: '0 0 10px 0'}}>אופס! מסך מסובב</h2>
      <p style={{color: '#5C6B5E', fontSize: '1.1rem', margin: '0 0 5px 0', maxWidth: '300px'}}>המשחק מותאם למצב טלפון רגיל (אנכי).</p>
      <p style={{color: '#7E8B80', fontSize: '0.95rem', margin: 0, maxWidth: '300px'}}>אנא סובבו את המכשיר חזרה כדי להמשיך לשחק.</p>
    </div>
  ) : null;

  // --- מסכים ---

  if (appState === 'admin') {
    const filteredPlayers = adminPlayers.filter(p => 
      (p.first_name || '').includes(adminSearch) || (p.contact_info || '').includes(adminSearch)
    );

    return (
      <div style={styles.containerFixed}>
        {landscapeOverlay}
        <div style={{...styles.card, width: '95%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '20px'}}>
          <h2 style={{color: '#5C6B5E', margin: '0 0 15px 0'}}>ניהול מערכת 🕵️‍♂️</h2>
          <button style={{...styles.secondaryBtn, marginBottom: '15px'}} onClick={() => setAppState('menu')}>חזרה למשחק</button>
          
          <div style={{display: 'flex', gap: '10px', marginBottom: '15px'}}>
            <button style={{...styles.primaryBtn, flex: 1, backgroundColor: '#D4A373', boxShadow: '0 4px 0 #B58A5D'}} onClick={() => setShowVisitsModal(true)}>
              📊 כניסות לאתר היום: {visitStats.today}
            </button>
          </div>

          <div style={{backgroundColor: '#F3F0E9', padding: '10px', borderRadius: '10px', marginBottom: '15px'}}>
            <p style={{margin: '0 0 5px 0', fontWeight: 'bold', textAlign: 'right', fontSize: '0.85rem', color: '#5C6B5E'}}>עדכון "מה חדש" ללקוחות:</p>
            <textarea 
              value={adminWhatsNewInput} 
              onChange={(e) => setAdminWhatsNewInput(e.target.value)}
              onFocus={() => setIsModalKeyboardOpen(true)}
              onBlur={() => setIsModalKeyboardOpen(false)}
              placeholder="כתבו כאן על התחדשויות... השאירו ריק כדי להסתיר."
              style={{...styles.input, minHeight: '80px', resize: 'none', marginBottom: '5px'}}
            />
            <button style={{...styles.primaryBtn, padding: '8px', fontSize: '0.9rem'}} onClick={saveAdminWhatsNew}>שמירת הודעה</button>
          </div>
          
          <input 
            type="text" 
            placeholder="חיפוש לפי שם או טלפון..." 
            value={adminSearch} 
            onChange={(e) => setAdminSearch(e.target.value)} 
            onFocus={() => setIsModalKeyboardOpen(true)}
            onBlur={() => setIsModalKeyboardOpen(false)}
            style={styles.input} 
          />

          <div style={{marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: isModalKeyboardOpen ? '200px' : '0'}}>
            {filteredPlayers.map(p => (
              <div key={p.id} style={styles.adminPlayerCard} onClick={() => openAdminEdit(p)}>
                <div style={{fontWeight: 'bold', color: '#5C6B5E'}}>{p.first_name}</div>
                <div style={{fontSize: '0.85rem', color: '#7E8B80'}}>{p.contact_info}</div>
                <div style={{fontSize: '0.75rem', color: '#A3B1A6', marginTop: '5px'}}>
                  כניסה אחרונה: {formatDateTime(p.last_login)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {showVisitsModal && (
          <div style={styles.overlay}>
             <div style={styles.legalModal}>
                <h3 style={{marginTop: 0, color: '#5C6B5E'}}>📊 סטטיסטיקות כניסה לאתר</h3>
                <p style={{fontSize: '0.85rem', color: '#7E8B80'}}>המונה כולל את כלל הנכנסים לאתר (כולל אורחים).</p>
                <div style={{display: 'flex', flexDirection: 'column', gap: '15px', margin: '20px 0'}}>
                   <div style={{backgroundColor: '#F3F0E9', padding: '15px', borderRadius: '10px', fontSize: '1.2rem', color: '#5C6B5E'}}><strong>היום:</strong> {visitStats.today}</div>
                   <div style={{backgroundColor: '#F3F0E9', padding: '15px', borderRadius: '10px', fontSize: '1.2rem', color: '#5C6B5E'}}><strong>שבוע אחרון:</strong> {visitStats.week}</div>
                   <div style={{backgroundColor: '#F3F0E9', padding: '15px', borderRadius: '10px', fontSize: '1.2rem', color: '#5C6B5E'}}><strong>חודש אחרון:</strong> {visitStats.month}</div>
                </div>
                <button style={{...styles.secondaryBtn, backgroundColor: '#D4A373', boxShadow: 'none'}} onClick={() => setShowVisitsModal(false)}>סגירה</button>
             </div>
          </div>
        )}

        {selectedAdminPlayer && (
          <div style={{
            ...styles.overlay, 
            alignItems: isModalKeyboardOpen ? 'flex-start' : 'center',
            paddingTop: isModalKeyboardOpen ? '10%' : '0'
          }}>
            <div style={styles.legalModal}>
              <h3 style={{marginTop: 0, color: '#5C6B5E'}}>{selectedAdminPlayer.first_name} - עריכה</h3>
              
              <button style={{...styles.secondaryBtn, marginBottom: '15px', backgroundColor: '#F3F0E9', color: '#5C6B5E', boxShadow: 'none'}} onClick={() => setShowLoginHistory(!showLoginHistory)}>
                {showLoginHistory ? '🔙 חזרה לטבלת הזרעים' : '🕒 צפייה בכניסות קודמות'}
              </button>

              {showLoginHistory ? (
                <div style={{maxHeight: '40vh', overflowY: 'auto', marginBottom: '20px'}}>
                  <h4 style={{margin: '0 0 10px 0', color: '#5C6B5E'}}>היסטוריית התחברויות מלאה:</h4>
                  {selectedAdminPlayer.login_history && selectedAdminPlayer.login_history.length > 0 ? (
                    selectedAdminPlayer.login_history.map((time, idx) => (
                      <div key={idx} style={{padding: '8px', borderBottom: '1px solid #E2E8E4', fontSize: '0.9rem', color: '#5C6B5E'}}>
                        {formatDateTime(time)}
                      </div>
                    ))
                  ) : (
                    <p style={{color: '#D4A373'}}>אין היסטוריה קודמת למשתמש זה.</p>
                  )}
                </div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '40vh', overflowY: 'auto', paddingRight: '5px'}}>
                  {Object.entries(adminEditingStats).map(([key, data]) => {
                    const displayKey = key.replace('easy', 'קל').replace('medium', 'בינוני').replace('hard', 'קשה').replace('_', ' | ');
                    return (
                    <div key={key} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F3F0E9', padding: '10px', borderRadius: '8px'}}>
                      <span style={{fontSize: '0.85rem', fontWeight: 'bold', color: '#5C6B5E'}}>{displayKey}</span>
                      <input 
                        type="number" 
                        inputMode="numeric"
                        value={data.score} 
                        onChange={(e) => handleAdminScoreChange(key, e.target.value)}
                        onFocus={() => setIsModalKeyboardOpen(true)}
                        onBlur={() => setIsModalKeyboardOpen(false)}
                        style={{width: '60px', padding: '5px', borderRadius: '5px', border: '1px solid #C1CCC3', textAlign: 'center', color: '#5C6B5E'}}
                      />
                    </div>
                  )})}
                </div>
              )}
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                <div style={{display: 'flex', gap: '10px'}}>
                   {!showLoginHistory && <button style={{...styles.primaryBtn, flex: 1}} onClick={saveAdminEdits}>שמירת זרעים</button>}
                   <button style={{...styles.secondaryBtn, backgroundColor: '#D4A373', boxShadow: 'none', flex: 1}} onClick={() => setSelectedAdminPlayer(null)}>סגירה</button>
                </div>
                {!showLoginHistory && <button style={{...styles.primaryBtn, backgroundColor: '#ff6b6b', boxShadow: '0 4px 0 #ee5253', marginTop: '5px'}} onClick={handleAdminResetUser}>איפוס משתמש למצב התחלתי</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appState === 'menu') {
    return (
      <div style={styles.containerFixed}>
        {landscapeOverlay}
        <div style={styles.card}>
          
          {!isAppInstalled && (
             <button style={styles.installBtn} onClick={handleInstallClick}>⬇️ הורדת האפליקציה</button>
          )}

          <img 
            src="https://i.postimg.cc/MKHZBh1K/1000182904-removebg-preview.png" 
            alt="Cryptosophia" 
            style={{ width: '130px', height: 'auto', margin: '0 auto 10px auto', display: 'block', cursor: 'pointer' }} 
            onDoubleClick={() => setShowAdminAuth(true)}
          />
          <h1 style={styles.title}>Cryptosophia</h1>
          <p style={{...styles.subtitle, color: '#8CA595', fontWeight: 'bold', marginBottom: '5px'}}>צופן החכמה 💎</p>
          <p style={{fontSize: '0.85rem', color: '#7E8B80', marginBottom: '15px'}}>פיענוח צפנים ברוח האנתרופוסופית</p>

          <div style={styles.selectionBox}>
             <p style={styles.sectionLabel}>במי נתמקד היום?</p>
             <div style={styles.tabGroup}>
                {['ילדים', 'נוער', 'מבוגרים'].map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setSelectedCategory(cat)} 
                    style={{...styles.tabBtn, backgroundColor: selectedCategory === cat ? '#E2C2A4' : '#F3F0E9', color: '#5C6B5E'}}
                  >
                    {cat}
                  </button>
                ))}
             </div>
             <p style={styles.sectionLabel}>איזו רמה נבחר?</p>
             <div style={styles.tabGroup}>
                <button onClick={() => setSelectedLevel('easy')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'easy' ? '#A3C4BC' : '#F3F0E9', color: '#5C6B5E'}}>קל</button>
                <button onClick={() => setSelectedLevel('medium')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'medium' ? '#F3D28A' : '#F3F0E9', color: '#5C6B5E'}}>בינוני</button>
                <button onClick={() => setSelectedLevel('hard')} style={{...styles.tabBtn, backgroundColor: selectedLevel === 'hard' ? '#D4A373' : '#F3F0E9', color: selectedLevel === 'hard' ? '#fff' : '#5C6B5E'}}>קשה</button>
             </div>
          </div>
          <hr style={{margin: '15px 0', borderColor: '#E2E8E4', opacity: 0.5}} />
          
          <div style={styles.miniGrid}>
             <button style={styles.miniBtn} onClick={() => setShowWhatsNewModal(true)}>מה חדש</button>
             <button style={styles.payboxLightBlue} onClick={() => window.open('https://links.payboxapp.com/Sp7UM53Yu1b', '_blank')}>💸 תחזוק</button>
             {player && <button style={styles.miniBtn} onClick={handleLogout}>להתנתק?</button>}
          </div>

          <div style={styles.welcomeBox}>
            {player ? (
              <>
                <h3 style={{margin: '10px 0 5px 0', color: '#5C6B5E'}}>שלום {player.first_name} 🌿</h3>
                <div style={styles.scoreBadge}>זרעים שנאספו ברמה זו: {currentScore}</div>
              </>
            ) : (
              <>
                 <p style={styles.subtitle}>מוכנים לגלות מה מסתתר?</p>
                 <div style={styles.scoreBadge}>זרעים שנאספו ברמה זו: {currentScore}</div>
              </>
            )}
          </div>

          <div style={styles.menuButtons}>
            <button style={styles.primaryBtn} onClick={() => { 
                if (!player) {
                  setShowGuestWarning(true);
                } else {
                  setAppState('playing'); 
                  fetchRandomPhrase(); 
                }
            }}>בואו נשחק 🍃</button>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '5px' }}>
              {!player && <button style={{...styles.halfBtn1, flex: 1}} onClick={() => setAppState('login')}>הצטרף/חזור למסע</button>}
              <button style={{...styles.halfBtn2, flex: 1, maxWidth: player ? '50%' : 'none'}} onClick={() => setShowInstructionsModal(true)}>הוראות המשחק 📖</button>
            </div>
          </div>
        </div>

        {renderLegalModal()}

        {showIosInstall && (
          <div style={styles.overlay}>
             <div style={styles.legalModal}>
                <h2 style={{marginTop: 0, color: '#5C6B5E'}}>📱 התקנה באייפון</h2>
                <div style={{textAlign: 'right', color: '#7E8B80', marginBottom: '20px', fontSize: '1rem', lineHeight: '1.6'}}>
                  כדי להתקין את המשחק כאפליקציה על האייפון שלכם:<br/><br/>
                  1. לחצו על כפתור ה<b>שיתוף</b> בתחתית המסך (ריבוע עם חץ עולה).<br/>
                  2. גללו למטה ובחרו באפשרות <b>"הוסף למסך הבית"</b> (Add to Home Screen).<br/>
                  3. לחצו על <b>הוסף</b> בפינה העליונה.
                </div>
                <button style={styles.primaryBtn} onClick={() => setShowIosInstall(false)}>הבנתי, תודה!</button>
             </div>
          </div>
        )}

        {showWhatsNewModal && (
          <div style={styles.overlay}>
             <div style={styles.legalModal}>
                <h2 style={{marginTop: 0, color: '#5C6B5E'}}>🕊️ התחדשות טבעית</h2>
                <div style={{textAlign: 'right', whiteSpace: 'pre-line', lineHeight: '1.6', color: '#7E8B80', marginBottom: '20px', fontSize: '1rem'}}>
                  {whatsNewText}
                </div>
                <button style={{...styles.primaryBtn, backgroundColor: '#8CA595', boxShadow: '0 4px 0 #708477'}} onClick={() => setShowWhatsNewModal(false)}>איזה יופי</button>
             </div>
          </div>
        )}

        {showInstructionsModal && (
          <div style={styles.overlay}>
             <div style={styles.legalModal}>
                <h2 style={{marginTop: 0, color: '#5C6B5E'}}>📖 איך משחקים?</h2>
                <div style={{textAlign: 'right', whiteSpace: 'pre-line', lineHeight: '1.6', color: '#7E8B80', marginBottom: '20px', fontSize: '1rem', maxHeight: '50vh', overflowY: 'auto'}}>
                  {`ברוכים הבאים ל-"צופן החכמה"!

מטרת המשחק היא לפענח משפטים נסתרים. כל מספר מייצג אות קבועה בצופן.

✨ זרעים וניקוד:
הזרעים הם הניקוד שלכם. בכל פעם שאתם פותרים צופן, אתם אוספים זרעים חדשים. זרעים אלו משמשים אתכם לקבלת רמזים ושחרור אותיות "מתקשות".

🌿 נבטים (אותיות):
האותיות הן כמו נבטים הגדלים מתוך האדמה. חלקן כבר גלויות וחלקן מחכות שתגלו אותן. (במחשב ניתן להקליד גם אם המקלדת נשארה על אנגלית!)

💡 רמזים:
צריכים עזרה? תוכלו להשתמש בזרעים שלכם כדי לקבל רמז. 
שימו לב: הרמז הראשון בכל קטגוריה ורמה ניתן לכם כמתנה בחינם! לאחר מכן, פירות החכמה דורשים השקעה של זרעים. כל 3 צפנים שתפתרו, מחירי הרמזים יחזרו חזרה לזרע אחד!

🔒 נעילת אותיות:
אם תטעו יותר מדי פעמים באות מסוימת, התיבה תינעל (🌸). כדי להמשיך, תצטרכו להשתמש ברמז כדי לשחרר את הנעילה בעדינות.

מאחלים לכם מסע פיצוח מהנה ומלא בתובנות!`}
                </div>
                <button style={{...styles.primaryBtn, backgroundColor: '#8CA595', boxShadow: '0 4px 0 #708477'}} onClick={() => setShowInstructionsModal(false)}>הבנתי, בואו נשחק!</button>
             </div>
          </div>
        )}

        {showCookieConsent && (
          <div style={styles.cookieBanner}>
            <div style={{fontSize: '1.5rem', marginBottom: '5px'}}>🌾</div>
            <h4 style={{margin: '0 0 5px 0', color: '#5C6B5E'}}>אנו נעזרים בעוגיות</h4>
            <p style={{fontSize: '0.85rem', color: '#7E8B80', margin: '0 0 15px 0'}}>
              כדי להנעים את שהותכם ולשמור על ההתקדמות שלכם במשחק, אנו נעזרים בקבצי "קוקיז".
            </p>
            <div style={{display: 'flex', gap: '10px'}}>
              <button style={{...styles.primaryBtn, padding: '10px 20px', fontSize: '1rem'}} onClick={acceptCookies}>הסכמתי</button>
              <button style={{...styles.secondaryBtn, padding: '10px 20px', fontSize: '1rem', backgroundColor: '#F3F0E9', color: '#5C6B5E', boxShadow: 'none'}} onClick={() => setLegalDoc('privacy')}>קריאה</button>
            </div>
          </div>
        )}

        {showAdminAuth && (
          <div style={{
            ...styles.overlay,
            alignItems: isModalKeyboardOpen ? 'flex-start' : 'center',
            paddingTop: isModalKeyboardOpen ? '20%' : '0'
          }}>
            <div style={styles.modal}>
              <h3 style={{marginTop: 0, color: '#5C6B5E'}}>כניסת צוות</h3>
              <input 
                type="password" 
                placeholder="הקלידו את הקוד" 
                value={adminPasscode} 
                onChange={(e) => setAdminPasscode(e.target.value)} 
                onFocus={() => setIsModalKeyboardOpen(true)}
                onBlur={() => setIsModalKeyboardOpen(false)}
                style={{...styles.input, textAlign: 'center', letterSpacing: '5px'}} 
              />
              <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                <button 
                  style={styles.primaryBtn} 
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!loading) handleAdminAuth();
                  }}
                  disabled={loading}
                >
                  {loading ? 'מתחבר...' : 'כניסה'}
                </button>
                <button style={{...styles.secondaryBtn, backgroundColor: '#D4A373', boxShadow: 'none'}} onClick={() => {setShowAdminAuth(false); setAdminPasscode('');}}>חזרה</button>
              </div>
            </div>
          </div>
        )}

        {showGuestWarning && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h2 style={{color:'#D4A373', marginTop: 0}}>רגע אחד!</h2>
              <p style={{color: '#5C6B5E', fontSize: '1.1rem', marginBottom: '20px'}}>האתר לא יזכור את הניקוד שלך, עדיף להירשם.</p>
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                <button style={styles.primaryBtn} onClick={() => { setShowGuestWarning(false); setAppState('login'); }}>הרשמה או התחברות</button>
                <button style={{...styles.secondaryBtn, backgroundColor: '#F3F0E9', color: '#5C6B5E', boxShadow: 'none'}} onClick={() => { setAppState('playing'); fetchRandomPhrase(); setShowGuestWarning(false); }}>המשך ללא הרשמה</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appState === 'login') {
    return (
      <div style={styles.containerFixed}>
        {landscapeOverlay}
        <div style={{
            ...styles.card,
            marginTop: isKeyboardOpen ? '-50px' : '0',
            transition: 'all 0.3s ease'
        }}>
          <h2 style={styles.title}>נשמח להכירכם</h2>
          <input 
            type="text" 
            placeholder="איך קוראים לכם?" 
            value={loginName} 
            onChange={(e) => setLoginName(e.target.value)} 
            onFocus={() => setIsKeyboardOpen(true)}
            onBlur={() => setIsKeyboardOpen(false)}
            style={styles.input} 
          />
          <input 
            type="text" 
            placeholder="טלפון או אימייל" 
            value={loginContact} 
            onChange={(e) => setLoginContact(e.target.value)} 
            onFocus={() => setIsKeyboardOpen(true)}
            onBlur={() => setIsKeyboardOpen(false)}
            style={styles.input} 
          />
          {loginError && <p style={{color:'#D4A373', fontSize:'0.9rem', margin: '5px 0'}}>{loginError}</p>}
          <button style={styles.primaryBtn} onClick={handleLoginOrRegister} disabled={loading}>{loading ? 'נכנסים...' : 'הצטרפות'}</button>
          <button style={{...styles.secondaryBtn, marginTop: '10px', backgroundColor: '#F3F0E9', color: '#5C6B5E', boxShadow: 'none'}} onClick={() => setAppState('menu')}>ביטול</button>
        </div>
      </div>
    );
  }

  if (appState === 'playing') {
    if (noMorePhrases) {
      return (
        <div style={styles.containerFixed}>
          {landscapeOverlay}
          <div style={styles.card}>
            <h2 style={styles.title}>🌿 סיימתם הכל! 🌿</h2>
            <p style={{color: '#5C6B5E'}}>אין יותר חידות בקטגוריית {selectedCategory} רמת {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}.</p>
            <button style={styles.primaryBtn} onClick={() => setAppState('menu')}>חזרה לבחירה</button>
          </div>
        </div>
      );
    }

    const boxSize = getBoxSize();

    return (
      <div style={styles.containerFull}>
        {landscapeOverlay}
        
        {/* הגדרת אנימציית פעימה לפוקוס בדסקטופ */}
        <style>{`
          @keyframes focusPulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(163, 196, 188, 0.5); }
            50% { transform: scale(1.05); box-shadow: 0 0 0 6px rgba(163, 196, 188, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(163, 196, 188, 0); }
          }
        `}</style>
        
        {toastMsg && (
          <div style={styles.toast}>
            {toastMsg}
          </div>
        )}

        <input 
           id="hebrew-input"
           name="hebrew-input"
           ref={inputRef}
           type="text"
           inputMode="text"
           lang="he-IL"
           dir="rtl"
           aria-label="הקלד אותיות בעברית"
           value={hiddenInputValue}
           onChange={handleNativeInput}
           onKeyDown={handleKeyDown}
           onFocus={() => setIsKeyboardOpen(true)}
           onBlur={() => setIsKeyboardOpen(false)}
           style={{position: 'absolute', top: '50px', left: 0, opacity: 0, width: '1px', height: '1px', border: 'none', padding: 0}}
           autoComplete="off" 
           autoCorrect="off" 
           autoCapitalize="off"
           spellCheck="false"
        />

        <div style={styles.topSectionFixed} lang="he-IL">
            <div style={styles.topBar}>
              <div style={{flex: 1}}>
                <div style={{fontSize: '0.8rem', opacity: 0.9, color: '#F3F0E9'}}>{selectedCategory} | {selectedLevel === 'easy' ? 'קל' : selectedLevel === 'medium' ? 'בינוני' : 'קשה'}</div>
                <div style={{fontWeight:'bold', marginTop: '2px', fontSize: '1rem', color: '#FFF'}}>נושא: {currentPhrase?.topic}</div>
              </div>
              
              <button 
                style={{...styles.payboxLightBlue, fontSize: '0.75rem', margin: '0 10px', padding: '5px 8px'}} 
                onClick={() => window.open('https://links.payboxapp.com/Sp7UM53Yu1b', '_blank')}
              >
                💸 תחזוק המשחק
              </button>

              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <div style={styles.scoreDisplay}>🌾 {currentScore} </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                  <button style={{...styles.smallBtn, backgroundColor: '#F3D28A', color: '#5C6B5E', border: 'none', fontWeight:'bold'}} onClick={handleSkip}>לדלג 🍃</button>
                  <button style={styles.smallBtn} onClick={() => {saveCurrentProgress(); setAppState('menu');}}>תפריט</button>
                </div>
              </div>
            </div>
            
            <div style={styles.hintContainer}>
               <div style={{display: 'flex', justifyContent: 'center', gap: '10px'}}>
                 
                 <button 
                   style={{...styles.hintBtn, animation: forcedHintFor ? 'pulse 1.5s infinite' : 'none'}} 
                   onPointerDown={(e) => {
                     e.preventDefault();
                     applyHint();
                   }}
                 >
                   💡 {forcedHintFor ? 'בקשת עזרה' : 'רמז עדין'} ({(!currentStats.first_clue_given && hintsUsedInRound === 0) ? 'ללא זרעים' : '-' + globalHintCost})
                 </button>
                 
                 {hasMistakes && (
                   <button 
                     style={styles.clearBtn} 
                     onPointerDown={(e) => {
                       e.preventDefault();
                       handleClearMistakes();
                     }}
                   >
                     🧹 ניקוי בלבולים
                   </button>
                 )}

               </div>
            </div>
            
            {activeBubbleHint && (
                <div style={styles.bubbleHint}>
                    <span style={{fontSize: '1.4rem'}}>🧚‍♀️</span> 
                    <span>{activeBubbleHint.text}</span>
                </div>
            )}
        </div>

        <div style={{
          ...styles.boardArea, 
          justifyContent: isKeyboardOpen ? 'flex-start' : 'center',
          paddingTop: isKeyboardOpen ? '10px' : '20px'
        }} lang="he-IL" onClick={() => { if (inputRef.current) inputRef.current.focus(); }}>
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
                  
                  let bgColor = '#FFF8F0';
                  let borderColor = '#D5D0C5';
                  
                  const isHintActiveBox = activeBubbleHint && activeBubbleHint.num === num && isSelected;

                  if (isInitial) { bgColor = '#EAE6DB'; borderColor = '#BDB8B0'; }
                  else if (isForcedHint) { bgColor = '#F3D28A'; borderColor = '#D4A373'; } 
                  else if (isHintActiveBox) { bgColor = '#FFF8F0'; borderColor = '#D4A373'; }
                  else if (isSelected) { bgColor = '#FFFFFF'; borderColor = '#A3C4BC'; }

                  return (
                    <div 
                      key={index} 
                      style={{
                        ...styles.letterBox, 
                        width: `${boxSize}px`, 
                        height: `${boxSize * 1.35}px`, 
                        borderColor, 
                        backgroundColor: bgColor,
                        animation: isSelected ? (isHintActiveBox ? 'focusPulse 1s infinite' : 'focusPulse 2s infinite') : 'none',
                        boxShadow: isHintActiveBox ? '0 0 15px rgba(212, 163, 115, 0.4)' : 'none'
                      }} 
                      onPointerDown={(e) => {
                        e.preventDefault(); 
                        handleBoxClick(index, num, isInitial);
                      }}
                    >
                      <div style={{...styles.guessedLetter, fontSize: `${boxSize * 0.6}px`, color: isInitial ? '#7E8B80' : '#5C6B5E'}}>
                        {guessed}
                        {isCorrect && !isInitial && <span style={styles.checkmark}>✔</span>}
                      </div>
                      <div style={{...styles.secretNumber, fontSize: `${boxSize * 0.3}px`, color: '#7E8B80'}}>
                        {isForcedHint ? '🌸' : num}
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
              <h1 style={{fontSize: '3rem', margin: 0}}>🌾</h1>
              <h2 style={{color: '#8CA595'}}>נפלא מאוד!</h2>
              <p style={{marginBottom: '5px', color: '#5C6B5E'}}>גיליתם את הצופן ואספתם {Math.max(0, 5 - hintsUsedInRound)} זרעים!</p>
              
              {showCycleResetMsg && (
                 <div style={{color: '#D4A373', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px'}}>
                    ✨ פתרתם 3 צפנים! מחירי הרמזים התאפסו ל-1.
                 </div>
              )}
              
              <div style={{backgroundColor: '#F3F0E9', padding: '15px', borderRadius: '12px', margin: '15px 0', border: '2px dashed #A3C4BC'}}>
                <span style={{fontSize: '0.85rem', color: '#7E8B80'}}>הנה מה שהסתתר שם:</span>
                <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#5C6B5E', marginTop: '5px'}}>
                  {currentPhrase?.text}
                </div>
              </div>

              <button style={styles.primaryBtn} onClick={() => {
                  setShowWinModal(false);
                  fetchRandomPhrase();
              }}>נמשיך במסע 🌿</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// --- עיצוב טבעי אנתרופוסופי ---
const styles = {
  containerFixed: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', backgroundColor: '#F8F5EE', direction: 'rtl', padding: '15px', boxSizing: 'border-box', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif' },
  containerFull: { display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: '#F8F5EE', direction: 'rtl', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }, 
  card: { backgroundColor: '#FFFFFF', padding: '25px', borderRadius: '16px', boxShadow: '0 8px 20px rgba(92, 107, 94, 0.08)', textAlign: 'center', width: '100%', maxWidth: '380px' },
  title: { color: '#8CA595', fontSize: '1.8rem', marginBottom: '5px' },
  subtitle: { color: '#7E8B80', fontSize: '1rem', marginBottom: '15px' },
  sectionLabel: { fontWeight: 'normal', margin: '8px 0 4px', fontSize: '0.85rem', textAlign: 'right', color: '#5C6B5E' },
  tabGroup: { display: 'flex', gap: '8px' },
  tabBtn: { flex: 1, padding: '8px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: '0.2s' },
  welcomeBox: { marginBottom: '15px' },
  scoreBadge: { backgroundColor: '#F3D28A', color: '#5C6B5E', padding: '6px 16px', borderRadius: '12px', display: 'inline-block', fontWeight: 'bold', fontSize: '0.9rem' },
  logoutBtn: { background: 'none', border: '1px solid #D4A373', color: '#D4A373', padding: '4px 12px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', marginTop: '5px' },
  menuButtons: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
  primaryBtn: { backgroundColor: '#A3C4BC', color: '#FFFFFF', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 4px 0 #82A29A' },
  secondaryBtn: { backgroundColor: '#E2C2A4', color: '#5C6B5E', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', width: '100%', boxShadow: '0 4px 0 #C4A587' },
  
  halfBtn1: { backgroundColor: '#EAD196', color: '#5C6B5E', border: 'none', padding: '10px', borderRadius: '12px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold', flex: 1, boxShadow: '0 4px 0 #D1B87D' },
  halfBtn2: { backgroundColor: '#E2C2A4', color: '#5C6B5E', border: 'none', padding: '10px', borderRadius: '12px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold', flex: 1, boxShadow: '0 4px 0 #C4A587' },
  
  input: { width: '100%', padding: '12px', margin: '8px 0', borderRadius: '12px', border: '1px solid #D5D0C5', fontSize: '1rem', boxSizing: 'border-box', outline: 'none', backgroundColor: '#FCFAEB', color: '#5C6B5E' },
  
  miniGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '15px' },
  miniBtn: { backgroundColor: '#F3F0E9', color: '#5C6B5E', border: '1px solid #D5D0C5', padding: '6px 4px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' },
  payboxLightBlue: { backgroundColor: '#54a0ff', color: '#fff', border: 'none', padding: '6px 4px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 3px 0 #2e86de' },
  installBtn: { backgroundColor: '#F3F0E9', color: '#5C6B5E', border: '1px solid #D5D0C5', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', margin: '0 auto 10px auto', display: 'block', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },

  footer: { position: 'absolute', bottom: '15px', display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#A3B1A6' },
  footerLink: { cursor: 'pointer', textDecoration: 'underline' },

  cookieBanner: { position: 'fixed', bottom: '20px', left: '20px', right: '20px', backgroundColor: '#FFFFFF', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(92, 107, 94, 0.15)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  legalModal: { backgroundColor: '#FFFFFF', padding: '25px', borderRadius: '16px', width: '90%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(92, 107, 94, 0.2)' },
  landscapeOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F8F5EE', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px' },

  topSectionFixed: { backgroundColor: '#5C6B5E', flexShrink: 0, borderBottom: '4px solid #8CA595', display: 'flex', flexDirection: 'column' },
  topBar: { color: '#F3F0E9', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hintContainer: { backgroundColor: '#EAE6DB', padding: '10px', textAlign: 'center' },
  bubbleHint: { backgroundColor: '#FFF8F0', color: '#5C6B5E', padding: '12px 20px', margin: '0', borderBottom: '2px dashed #D4A373', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', fontWeight: 'bold', textAlign: 'right', animation: 'focusPulse 2s infinite' },
  
  clearBtn: { backgroundColor: '#E2C2A4', color: '#5C6B5E', border: 'none', padding: '8px 15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 3px 0 #C4A587', fontSize: '0.9rem' },

  scoreDisplay: { color: '#F3D28A', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '2px' },
  smallBtn: { background: 'none', border: '1px solid #F3F0E9', color: '#F3F0E9', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' },
  
  boardArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', width: '100%', transition: 'all 0.3s ease' },
  board: { margin: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px', maxWidth: '800px', width: '100%' },
  
  wordWrapper: { display: 'flex', gap: '4px', direction: 'rtl', flexWrap: 'nowrap' },
  
  letterBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '3px solid', borderRadius: '8px', cursor: 'pointer', transition: '0.2s', position: 'relative', flexShrink: 0 },
  guessedLetter: { fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' },
  checkmark: { position: 'absolute', top: '-3px', right: '-3px', color: '#8CA595', fontSize: '0.4em', backgroundColor: '#fff', borderRadius: '50%', padding: '1px' },
  secretNumber: { fontWeight: 'normal' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(92, 107, 94, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, transition: 'all 0.3s ease' },
  modal: { backgroundColor: '#FFFFFF', padding: '30px', borderRadius: '16px', textAlign: 'center', maxWidth: '300px', boxShadow: '0 15px 30px rgba(92, 107, 94, 0.2)', transition: 'all 0.3s ease' },

  adminPlayerCard: { backgroundColor: '#F3F0E9', border: 'none', borderRadius: '12px', padding: '12px', textAlign: 'right', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(92, 107, 94, 0.05)' },

  toast: { position: 'fixed', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(92, 107, 94, 0.95)', color: '#F3F0E9', padding: '15px 25px', borderRadius: '12px', zIndex: 9999, fontWeight: 'normal', boxShadow: '0 10px 25px rgba(92, 107, 94, 0.2)', textAlign: 'center', width: 'max-content', maxWidth: '85%', fontSize: '1rem', lineHeight: '1.4' }
};

export default App;
