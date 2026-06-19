/**
 * ============================================================
 *  auth.js — Moteur d'authentification & suivi de progression
 *  Stockage : localStorage uniquement (pas de serveur)
 *  Clés :
 *    quran_users        → { [username]: { prenom, nom, password, createdAt } }
 *    quran_progress     → { [username]: { [surahId]: { activities, completedAt, score } } }
 *    quran_session      → { username, prenom, nom, role? }
 *    quran_profs        → { [username]: { prenom, classe, password, students, createdAt } }
 * ============================================================
 */

const Auth = (() => {
  // ── Clés localStorage ─────────────────────────────────────
  const USERS_KEY    = 'quran_users';
  const PROGRESS_KEY = 'quran_progress';
  const SESSION_KEY  = 'quran_session';
  const SCHEDULE_KEY = 'quran_schedule';
  const MESSAGES_KEY = 'quran_messages';
  const PROFILE_KEY  = 'quran_profiles';
  const PROFS_KEY    = 'quran_profs';

  // ── Lecture / écriture sécurisée ──────────────────────────
  function load(key) { 
    try { 
      return JSON.parse(localStorage.getItem(key)) || {}; 
    } catch { 
      return {}; 
    } 
  }
  function save(key, data) { 
    localStorage.setItem(key, JSON.stringify(data)); 
  }

  // ─────────────────────────────────────────────────────────
  //  COMPTES ÉLÈVES
  // ─────────────────────────────────────────────────────────

  /** Crée un compte élève. Retourne { ok, error } */
 // --- استبدل دالة register ---
  function register(prenom, nom, password, skipSession = false) {
    prenom   = prenom.trim();
    nom      = nom.trim();
    password = password.trim();

    if (!prenom || !nom || !password)
      return { ok: false, error: 'يرجى ملء جميع الحقول' };
    if (password.length < 4)
      return { ok: false, error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' };

    const username = (prenom + '.' + nom).toLowerCase()
                       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                       .replace(/\s+/g, '_');

    const users = load(USERS_KEY);
    if (users[username])
      return { ok: false, error: 'هذا الاسم مستخدم بالفعل، جرب اسمًا مختلفًا' };

    users[username] = {
      prenom,
      nom,
      password: password, // تم إزالة btoa() لمنع انهيار النظام مع الحروف العربية
      createdAt: new Date().toISOString()
    };
    save(USERS_KEY, users);

    // منع تسجيل الدخول التلقائي إذا كان المشرف هو من ينشئ الحساب
    if (!skipSession) {
        _setSession(username, prenom, nom);
    }
    return { ok: true, username };
  }

  // --- استبدل دالة login ---
  function login(prenom, nom, password) {
    prenom   = prenom.trim();
    nom      = nom.trim();
    password = password.trim();

    if (!prenom || !nom || !password)
      return { ok: false, error: 'يرجى ملء جميع الحقول' };

    const username = (prenom + '.' + nom).toLowerCase()
                       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                       .replace(/\s+/g, '_');

    const users = load(USERS_KEY);
    const user  = users[username];

    if (!user)
      return { ok: false, error: 'لم يتم العثور على هذا الحساب' };
    
    // التوافقية مع كلمات المرور القديمة والجديدة
    let isPassValid = false;
    try { if (atob(user.password) === password) isPassValid = true; } catch(e) {}
    if (user.password === password) isPassValid = true;

    if (!isPassValid)
      return { ok: false, error: 'كلمة المرور غير صحيحة' };
      
    if (user.isSuspended) {
      return { ok: false, error: "حساب مغلق بسبب عدم أداء الواجب الشهري أو كثرة الغيابات, المرجو الاتصال بالادارة." };
    }
    _setSession(username, user.prenom, user.nom);
    return { ok: true, username };
  }

  // --- استبدل دالتي registerProf و loginProf ---
  function registerProf(prenom, classe, password) {
    // إضافة trim() لمنع مشاكل الفراغات الخفية
    prenom = prenom.trim();
    classe = classe.trim();
    password = password.trim();
    
    const profs = load(PROFS_KEY);
    const username = (prenom + '_' + classe).toLowerCase().replace(/\s+/g, '');
    if (profs[username]) return { ok: false, error: "هذا الأستاذ مسجل مسبقاً (Ce professeur existe déjà)." };
    
    profs[username] = { 
      prenom, 
      classe, 
      password, 
      students: [], 
      messages: [], 
      createdAt: new Date().toISOString() 
    };
    save(PROFS_KEY, profs);
    return { ok: true, username };
  }

  function loginProf(prenom, classe, password) {
    prenom = prenom.trim();
    classe = classe.trim();
    password = password.trim();
    
    const profs = load(PROFS_KEY);
    const username = (prenom + '_' + classe).toLowerCase().replace(/\s+/g, '');
    const prof = profs[username];
    
    if (!prof || prof.password !== password) {
        return { ok: false, error: "معلومات الأستاذ غير صحيحة ." };
    }
    
    save(SESSION_KEY, { username, prenom, classe, role: 'prof' });
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getSession() {
    const data = load(SESSION_KEY);
    return data.username ? data : null;
  }

  function _setSession(username, prenom, nom) {
    save(SESSION_KEY, { username, prenom, nom });
  }

  // ─────────────────────────────────────────────────────────
  //  PROGRESSION & ACTIVITÉS
  // ─────────────────────────────────────────────────────────

  function recordActivity(surahId, activityKey, score) {
    const session = getSession();
    if (!session) return;

    const all = load(PROGRESS_KEY);
    if (!all[session.username]) all[session.username] = {};
    if (!all[session.username][surahId]) all[session.username][surahId] = { activities: {}, completedAt: null };

    const entry = all[session.username][surahId];
    const prev = entry.activities[activityKey];
    if (!prev || score > prev.score) {
      entry.activities[activityKey] = { score, date: new Date().toISOString() };
    }

    save(PROGRESS_KEY, all);
  }

  function completeSurah(surahId) {
    const session = getSession();
    if (!session) return;

    const all = load(PROGRESS_KEY);
    if (!all[session.username]) all[session.username] = {};
    if (!all[session.username][surahId]) all[session.username][surahId] = { activities: {}, completedAt: null };

    const entry = all[session.username][surahId];
    entry.completedAt = new Date().toISOString();

    const scores = Object.values(entry.activities).map(a => a.score);
    entry.globalScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 100;

    save(PROGRESS_KEY, all);
  }

  function getProgress(username) {
    const u = username || (getSession() || {}).username;
    if (!u) return {};
    return (load(PROGRESS_KEY)[u]) || {};
  }

  function getAllProgress() {
    return load(PROGRESS_KEY);
  }

  // ─────────────────────────────────────────────────────────
  //  GESTION DES ÉLÈVES (POUR ADMIN)
  // ─────────────────────────────────────────────────────────

  function getAllStudents() {
    const users    = load(USERS_KEY);
    const progress = load(PROGRESS_KEY);
    return Object.entries(users).map(([username, info]) => ({
      username,
      prenom:      info.prenom,
      nom:         info.nom,
      createdAt:   info.createdAt,
      isSuspended: info.isSuspended || false,
      progress:    progress[username] || {}
    }));
  }

  function getAllUsers() {
    return load(USERS_KEY);
  }

  function deleteStudent(username) {
    const users = load(USERS_KEY);
    delete users[username];
    save(USERS_KEY, users);

    const progress = load(PROGRESS_KEY);
    delete progress[username];
    save(PROGRESS_KEY, progress);
  }

  function toggleSuspension(username) {
    const users = load(USERS_KEY);
    if (users[username]) {
      users[username].isSuspended = !users[username].isSuspended;
      save(USERS_KEY, users);
    }
  }

  // ─────────────────────────────────────────────────────────
  //  MESSAGES & NOTIFICATIONS
  // ─────────────────────────────────────────────────────────

  function sendMessage(username, messageText) {
    const messages = load(MESSAGES_KEY);
    if (!messages[username]) {
      messages[username] = [];
    }
    messages[username].push({
      text: messageText,
      date: new Date().toLocaleDateString('ar-EG')
    });
    save(MESSAGES_KEY, messages);
  }

  function getMessages(username) {
    const messages = load(MESSAGES_KEY);
    return messages[username] || [];
  }

  function clearMessages(username) {
    const messages = load(MESSAGES_KEY);
    messages[username] = [];
    save(MESSAGES_KEY, messages);
  }

  function deleteMessageByIndex(username, index) {
    const messages = load(MESSAGES_KEY);
    if (messages[username] && messages[username][index] !== undefined) {
      messages[username].splice(index, 1);
      save(MESSAGES_KEY, messages);
    }
  }

  // ─────────────────────────────────────────────────────────
  //  HORAIRES
  // ─────────────────────────────────────────────────────────

  function setSchedule(username, scheduleText) {
    const schedules = load(SCHEDULE_KEY);
    schedules[username] = scheduleText;
    save(SCHEDULE_KEY, schedules);
  }

  function getSchedule(username) {
    const schedules = load(SCHEDULE_KEY);
    return schedules[username] || "لم يتم تحديد أوقات الحصص بعد.";
  }

  // ─────────────────────────────────────────────────────────
  //  PROFILS ADMINISTRATIFS
  // ─────────────────────────────────────────────────────────

  function getProfile(username) {
    const profiles = load(PROFILE_KEY);
    return profiles[username] || {
      cinProvided: false,
      birthCertProvided: false,
      payments: []
    };
  }

  function updateProfile(username, profileData) {
    const profiles = load(PROFILE_KEY);
    profiles[username] = profileData;
    save(PROFILE_KEY, profiles);
  }

  // ─────────────────────────────────────────────────────────
  //  GESTION DES PROFESSEURS
  // ─────────────────────────────────────────────────────────

  function registerProf(prenom, classe, password) {
    const profs = load(PROFS_KEY);
    const username = (prenom + '_' + classe).toLowerCase().replace(/\s+/g, '');
    if (profs[username]) return { ok: false, error: "هذا الأستاذ مسجل مسبقاً (Ce professeur existe déjà)." };
    
    profs[username] = { 
      prenom, 
      classe, 
      password, 
      students: [], 
      messages: [], 
      createdAt: new Date().toISOString() 
    };
    save(PROFS_KEY, profs);
    return { ok: true, username };
  }

  function getProfs() {
    return load(PROFS_KEY);
  }

  function saveProfs(profsData) {
    save(PROFS_KEY, profsData);
  }

  // ─────────────────────────────────────────────────────────
  //  GESTION DES DEVOIRS
  // ─────────────────────────────────────────────────────────

  function ajouterDevoir(studentId, profName, surate, ayaDebut, ayaFin, dateLimite) {
    const session = load(SESSION_KEY); // استخدام الدالة الآمنة الموجودة في auth.js
    const devoirs = JSON.parse(localStorage.getItem('devoirs') || '[]');
    
    const nouveauDevoir = {
      id: Date.now().toString(),
      studentId: studentId,
      profName: profName,
      surate: surate,
      ayaDebut: ayaDebut,
      ayaFin: ayaFin,
      dateLimite: dateLimite,
      statut: 'en_attente',
      profId: session.username || "admin", 
      createdAt: new Date().toISOString()
    };
    
    // 1. الإضافة للسجل العام الخاص بالأستاذ
    devoirs.push(nouveauDevoir);
    localStorage.setItem('devoirs', JSON.stringify(devoirs));

    // 2. الإضافة مباشرة لملف الطالب ليظهر في لوحته
    const users = load(USERS_KEY);
    if (users[studentId]) {
        if (!users[studentId].devoirs) users[studentId].devoirs = [];
        users[studentId].devoirs.push(nouveauDevoir);
        save(USERS_KEY, users);
    }

    return { ok: true };
  }

  function marquerDevoirTermine(studentId, devoirId) {
    const users = load(USERS_KEY);
    if (!users[studentId] || !users[studentId].devoirs) return { ok: false };
    
    const devoir = users[studentId].devoirs.find(d => d.id === devoirId);
    if (devoir) {
        devoir.statut = 'termine';
        save(USERS_KEY, users);
        return { ok: true };
    }
    return { ok: false };
  }

  // ─────────────────────────────────────────────────────────
  //  UTILITAIRES
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // GESTION DES DEVOIRS (Ajout)
  // ─────────────────────────────────────────────────────────

  // Récupérer les devoirs avec expiration automatique (1h après la date limite)
  function getDevoirs() {
    let devoirs = JSON.parse(localStorage.getItem('devoirs') || '[]');
    const now = Date.now();
    const uneHeureEnMs = 60 * 60 * 1000; // 1 heure en millisecondes

    // On garde uniquement les devoirs dont (date limite + 1h) n'est pas encore dépassée
    const devoirsActifs = devoirs.filter(d => {
      const deadline = new Date(d.dateLimite).getTime();
      return now <= (deadline + uneHeureEnMs);
    });

    // Si la liste a rétréci (des devoirs ont expiré), on nettoie la base de données
    if (devoirs.length !== devoirsActifs.length) {
      localStorage.setItem('devoirs', JSON.stringify(devoirsActifs));
    }

    return devoirsActifs;
  }

  // Annuler / Supprimer un devoir manuellement
function annulerDevoir(devoirId) {
    // الحذف من السجل العام للأستاذ
    let devoirs = JSON.parse(localStorage.getItem('devoirs') || '[]');
    devoirs = devoirs.filter(d => d.id !== devoirId);
    localStorage.setItem('devoirs', JSON.stringify(devoirs));

    // الحذف من ملف الطالب حتى لا يبقى الواجب معلقاً لديه
    const users = load(USERS_KEY);
    for (let username in users) {
        if (users[username].devoirs) {
            users[username].devoirs = users[username].devoirs.filter(d => d.id !== devoirId);
        }
    }
    save(USERS_KEY, users);
  }

  function requireAuth(redirectTo = 'login.html') {
    if (!getSession()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────
  //  API PUBLIQUE (return)
  // ─────────────────────────────────────────────────────────

return {
    // Comptes élèves
    register, 
    login, 
    logout, 
    getSession,
    requireAuth,
    
    // Élèves (admin)
    getAllStudents, 
    getAllUsers,
    deleteStudent,
    toggleSuspension,

    // Progression
    recordActivity,
    completeSurah,
    getProgress,
    getAllProgress,
    markSurahCompleted: completeSurah, // ✅ تم إصلاح الخطأ الحرج هنا بربطها بالدالة الصحيحة

    // Messages
    sendMessage,
    getMessages,
    clearMessages,
    deleteMessageByIndex,

    // Horaires
    setSchedule,
    getSchedule,

    // Profils
    getProfile,
    updateProfile,

    // Professeurs
    registerProf,
    loginProf,
    getProfs,
    saveProfs,

    // Devoirs
    ajouterDevoir,
    marquerDevoirTermine,
    getDevoirs,       // <-- AJOUTER CECI
    annulerDevoir
  };
})();

// =========================================================================
// SÉCURITÉ & EXPULSION EN TEMPS RÉEL (COMPTES SUSPENDUS)
// =========================================================================
(() => {
    function verifierSuspensionImmediate() {
        const pageActuelle = window.location.pathname;
        if (pageActuelle.includes('login.html') || pageActuelle.includes('admin.html')) {
            return;
        }

        const sessionRaw = localStorage.getItem('quran_session');
        if (!sessionRaw) return;

        try {
            const session = JSON.parse(sessionRaw);
            if (session && session.username) {
                const usersRaw = localStorage.getItem('quran_users');
                if (usersRaw) {
                    const users = JSON.parse(usersRaw);
                    if (users[session.username] && users[session.username].isSuspended) {
                        localStorage.removeItem('quran_session');
                        alert("⚠️ حساب مغلق ");
                        window.location.href = 'login.html';
                    }
                }
            }
        } catch (erreur) {
            console.error("Erreur lors du contrôle de sécurité :", erreur);
        }
    }

    verifierSuspensionImmediate();

    window.addEventListener('storage', (event) => {
        if (event.key === 'quran_users') {
            verifierSuspensionImmediate();
        }
    });
})();
