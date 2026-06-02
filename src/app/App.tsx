import { useState, useEffect } from 'react';
import { Moon, ArrowUpRight, CheckCircle2, Star, Activity, User, Sun, Calendar, BellRing, X, ArrowRight, Cloud } from 'lucide-react';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

interface PrayerRecord {
  date: string;
  morning: boolean;
  night: boolean;
}

interface PrayerData {
  history: PrayerRecord[];
}

const slokas = [
  "\"Karmanye vadhikaraste ma phaleshu kadachana\" - Lakukanlah kewajibanmu tanpa terikat pada hasilnya. (Bhagavad Gita 2.47)",
  "\"Uddhared atmanatmanam\" - Seseorang harus mengangkat dirinya sendiri melalui pikirannya. (Bhagavad Gita 6.5)",
  "\"Pikiran yang terkendali adalah teman terbaik, namun pikiran yang liar adalah musuh terburuk.\" (Bhagavad Gita 6.6)",
  "\"Kedamaian abadi adalah milik mereka yang tidak lagi mendambakan objek duniawi.\" (Bhagavad Gita 2.71)",
  "\"Daivi sampad vimokshaya\" - Sifat-sifat suci (sradha & bhakti) menuntun menuju pembebasan. (Bhagavad Gita 16.5)"
];

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
};

// --- Interactive Features ---
const playBell = () => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 2.5);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2.5);
};

const Typewriter = ({ text }: { text: string }) => {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i));
      i++;
      if (i > text.length) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [text]);
  return <span>{displayed}</span>;
};

const Particles = () => {
  const [windowSize, setWindowSize] = useState({ w: 1000, h: 800 });
  useEffect(() => {
    setWindowSize({ w: window.innerWidth, h: window.innerHeight });
  }, []);
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 bg-gray-400 rounded-full blur-[1px]"
          initial={{ x: Math.random() * windowSize.w, y: Math.random() * windowSize.h }}
          animate={{ x: Math.random() * windowSize.w, y: Math.random() * windowSize.h }}
          transition={{ duration: Math.random() * 30 + 30, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
        />
      ))}
    </div>
  );
};

const SwipeToPray = ({ type, completed, onComplete }: { type: 'morning' | 'night', completed: boolean, onComplete: () => void }) => {
  const Icon = type === 'morning' ? Sun : Moon;
  const label = type === 'morning' ? 'Sembahyang Pagi' : 'Sembahyang Malam';
  
  if (completed) {
    return (
      <div className="relative w-64 h-16 bg-black rounded-full flex items-center justify-center text-white shadow-md border border-gray-800">
         <CheckCircle2 className="w-5 h-5 mr-2 text-green-400" /> <span className="font-semibold">{label} Selesai</span>
      </div>
    );
  }

  return (
    <div className="relative w-64 h-16 bg-white/50 backdrop-blur-md rounded-full overflow-hidden flex items-center border border-gray-200 shadow-inner group">
      <span className="absolute w-full text-center text-gray-500 font-semibold text-sm pointer-events-none pr-4">Geser {label}</span>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 256 - 60 - 8 }} 
        dragElastic={0.1}
        onDragEnd={(e, info) => {
          if (info.offset.x > 120) onComplete();
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="absolute left-1 top-1 w-14 h-14 bg-black rounded-full z-10 flex items-center justify-center text-white shadow-xl cursor-grab active:cursor-grabbing"
      >
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </motion.div>
    </div>
  );
};

// Gubeng, Surabaya Coordinates
const GUBENG_LAT = -7.2756;
const GUBENG_LNG = 112.7486;

const fetchSunData = async () => {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  const cached = localStorage.getItem('sunData');
  if (cached) {
     const parsed = JSON.parse(cached);
     if (parsed.date === dateStr) {
       return parsed;
     }
  }

  try {
    const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${GUBENG_LAT}&lng=${GUBENG_LNG}&formatted=0`);
    const data = await res.json();
    if (data.status === 'OK') {
       const sunData = {
         sunrise: data.results.sunrise,
         sunset: data.results.sunset,
         date: dateStr
       };
       localStorage.setItem('sunData', JSON.stringify(sunData));
       return sunData;
    }
  } catch (e) {
    console.error('Failed to fetch sun data', e);
  }
  
  // Fallback to 5:30 AM local time if offline
  const fallbackSunrise = new Date();
  fallbackSunrise.setHours(5, 30, 0, 0);
  const fallbackSunset = new Date();
  fallbackSunset.setHours(17, 30, 0, 0);
  
  return {
    sunrise: fallbackSunrise.toISOString(),
    sunset: fallbackSunset.toISOString(),
    date: dateStr
  };
};

export default function App() {
  const [prayerData, setPrayerData] = useState<PrayerData>({ history: [] });
  const [currentView, setCurrentView] = useState<'home' | 'stats'>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  
  const [todayStr, setTodayStr] = useState('');
  const [isMorning, setIsMorning] = useState(false);
  const [isAfternoon, setIsAfternoon] = useState(false);
  const [isNight, setIsNight] = useState(true);
  const [sunTimes, setSunTimes] = useState<{sunrise: Date, sunset: Date} | null>(null);

  useEffect(() => {
    async function initialize() {
      // 1. Fetch Sun Data for Gubeng & Calculate Logic
      const sun = await fetchSunData();
      const now = new Date();
      const sunrise = new Date(sun.sunrise);
      const sunset = new Date(sun.sunset);
      setSunTimes({ sunrise, sunset });
      
      const logicalDate = new Date();
      if (now < sunrise) logicalDate.setDate(logicalDate.getDate() - 1);
      
      const dStr = `${logicalDate.getFullYear()}-${String(logicalDate.getMonth() + 1).padStart(2, '0')}-${String(logicalDate.getDate()).padStart(2, '0')}`;
      setTodayStr(dStr);
      
      if (now >= sunset || now < sunrise) {
        setIsNight(true); setIsMorning(false); setIsAfternoon(false);
      } else if (now >= sunrise && now < new Date(sunrise.getTime() + 6 * 60 * 60 * 1000)) {
        setIsMorning(true); setIsNight(false); setIsAfternoon(false);
      } else {
        setIsAfternoon(true); setIsNight(false); setIsMorning(false);
      }

      // 2. Fetch Supabase Data
      try {
        const { data, error } = await supabase.from('prayer_history').select('*').order('date', { ascending: false });

        if (error) {
          console.error('Error fetching from Supabase:', error);
          setIsLoading(false);
          return;
        }

        const history: PrayerRecord[] = data.map((row: any) => ({
           date: row.date, 
           morning: row.morning || false, 
           night: row.night || false 
        }));
        
        setPrayerData({ history });
      } catch (err) {
         console.error('Unexpected error:', err);
      } finally {
         setIsLoading(false);
      }
    }
    initialize();
  }, []);

  const heroTheme = isNight 
    ? "from-gray-900 via-indigo-950 to-slate-900 text-white" 
    : isMorning
      ? "from-sky-100 via-blue-50 to-amber-50 text-gray-900"
      : "from-orange-100 via-amber-50 to-red-50 text-gray-900";

  const todayRecord = prayerData.history.find(r => r.date === todayStr) || { date: todayStr, morning: false, night: false };

  const calculateStreak = () => {
    if (prayerData.history.length === 0 || !sunTimes) return 0;
    let streak = 0;
    const historySet = new Set(prayerData.history.filter(r => r.morning || r.night).map(r => r.date));
    let checkDate = new Date();
    if (checkDate < sunTimes.sunrise) checkDate.setDate(checkDate.getDate() - 1);
    
    // Check if hasn't prayed today at all
    if (!todayRecord.morning && !todayRecord.night) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    while (true) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (historySet.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
    return streak;
  };

  const calculateConsistency = () => {
    if (!sunTimes) return 0;
    let prayedDays = 0;
    const historySet = new Set(prayerData.history.filter(r => r.morning || r.night).map(r => r.date));
    const checkDate = new Date();
    if (checkDate < sunTimes.sunrise) checkDate.setDate(checkDate.getDate() - 1);

    for (let i = 0; i < 30; i++) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (historySet.has(dateStr)) prayedDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return Math.round((prayedDays / 30) * 100);
  };

  const handlePrayed = async (type: 'morning' | 'night') => {
    playBell();
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: type === 'morning' ? ['#FDE68A', '#FCD34D', '#ffffff'] : ['#000000', '#ffffff', '#888888'] 
    });

    const updatedRecord = { ...todayRecord, [type]: true };
    const newHistory = [...prayerData.history.filter(r => r.date !== todayStr), updatedRecord];
    setPrayerData({ history: newHistory });
    
    const { error } = await supabase.from('prayer_history').upsert({ 
       date: todayStr, 
       morning: updatedRecord.morning, 
       night: updatedRecord.night 
    });
      
    if (error) console.error('Error saving to Supabase:', error);
  };
  
  const subscribeToPush = async () => {
    setIsSubscribing(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Browser Anda tidak mendukung notifikasi web push.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Izin notifikasi ditolak.');
        return;
      }
      
      const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicVapidKey) {
        alert('Kunci VAPID belum dikonfigurasi di server.');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });
      
      const subJson = subscription.toJSON();
      
      const { error } = await supabase.from('push_subscriptions').insert([{
        endpoint: subJson.endpoint,
        auth: subJson.keys?.auth,
        p256dh: subJson.keys?.p256dh
      }]);

      if (error && error.code === '23505') {
          alert('Perangkat ini sudah terdaftar untuk menerima notifikasi pengingat.');
      } else if (error) {
          alert('Gagal mengaktifkan notifikasi di database.');
      } else {
        alert('Notifikasi Pengingat berhasil diaktifkan! Anda akan diingatkan setiap jam 8 malam.');
        confetti({ particleCount: 50, spread: 60, colors: ['#000000', '#ffffff'] });
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat mengaktifkan notifikasi.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const showRandomSloka = () => {
    const random = slokas[Math.floor(Math.random() * slokas.length)];
    setActiveQuote(random);
  };

  const streak = calculateStreak();
  const consistency = calculateConsistency();

  const generateLast30Days = () => {
    if (!sunTimes) return [];
    const days = [];
    const checkDate = new Date();
    if (checkDate < sunTimes.sunrise) checkDate.setDate(checkDate.getDate() - 1);
    checkDate.setDate(checkDate.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      const record = prayerData.history.find(r => r.date === dateStr);
      days.push({
        date: new Date(checkDate),
        dateStr,
        prayedMorning: record?.morning || false,
        prayedNight: record?.night || false,
      });
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return days;
  };

  if (isLoading || !sunTimes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <Moon className="w-10 h-10 text-gray-400 mb-4 animate-spin-slow" />
          <p className="text-gray-500 font-medium">Menyesuaikan jam rotasi bumi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-200 text-black font-sans selection:bg-black selection:text-white relative overflow-hidden">
      <Particles />

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
              <button onClick={() => setShowAbout(false)} className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors"><X className="w-6 h-6" /></button>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-6"><Moon className="w-6 h-6 text-black" /></div>
              <h2 className="text-2xl font-bold mb-4">Filosofi Bhakti</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Waktu di aplikasi ini selaras dengan alam semesta. "Hari Baru" Anda direset tepat pada detik 
                <strong> matahari terbit di ufuk timur Surabaya</strong> ({sunTimes.sunrise.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' })}). 
                Jaga sradha Anda setiap pagi dan malam.
              </p>
              <button onClick={() => setShowAbout(false)} className="w-full py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors">Tutup</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quote Modal */}
      <AnimatePresence>
        {activeQuote && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setActiveQuote(null)}>
            <motion.div initial={{ scale: 0.8, rotateX: 20 }} animate={{ scale: 1, rotateX: 0 }} exit={{ scale: 0.8, rotateX: 20 }} className="bg-gradient-to-b from-gray-800 to-black border border-gray-700 text-white rounded-[2rem] p-8 md:p-12 max-w-lg w-full shadow-2xl relative text-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <Star className="w-8 h-8 text-yellow-500 mx-auto mb-8 animate-pulse" />
              <p className="text-xl md:text-2xl font-medium leading-relaxed italic text-gray-200 min-h-[6rem]">
                <Typewriter text={activeQuote} />
              </p>
              <button onClick={() => setActiveQuote(null)} className="mt-12 px-8 py-3 bg-white/10 rounded-full text-sm font-semibold hover:bg-white/20 transition-colors">Selesai</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto relative z-10">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setCurrentView('home')}>
          <motion.div whileHover={{ rotate: 180 }} transition={{ duration: 0.5 }}>
            <Moon className="w-6 h-6 group-hover:text-gray-600 transition-colors" />
          </motion.div>
          <span className="font-bold text-xl tracking-tight">Bhakti</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium text-gray-600">
          <button onClick={() => setCurrentView('home')} className={`transition-colors ${currentView === 'home' ? 'text-black font-bold' : 'hover:text-black'}`}>Beranda</button>
          <button onClick={() => setCurrentView('stats')} className={`transition-colors ${currentView === 'stats' ? 'text-black font-bold' : 'hover:text-black'}`}>Statistik</button>
          <button onClick={() => setShowAbout(true)} className="hover:text-black transition-colors">Tentang</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 pt-4 md:pt-12 pb-24 relative z-10">
        {currentView === 'stats' ? (
           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
             <div className="bg-white rounded-[2rem] p-10 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-gray-800" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">Riwayat 30 Hari</h2>
                    <p className="text-gray-500">Titik kuning: Pagi, Titik hitam: Malam</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-3">
                  {generateLast30Days().map((day, i) => (
                    <motion.div 
                      key={i} whileHover={{ scale: 1.15, y: -5 }}
                      className="aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-semibold cursor-default bg-gray-50 border border-gray-200 relative overflow-hidden"
                      title={`${day.dateStr}`}
                    >
                      <span className="z-10">{day.date.getDate()}</span>
                      <span className="text-[10px] opacity-60 z-10">{day.date.toLocaleDateString('id-ID', { weekday: 'short' })}</span>
                      
                      <div className="absolute bottom-1.5 flex gap-1 z-10">
                         {day.prayedMorning && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-sm"></div>}
                         {day.prayedNight && <div className="w-1.5 h-1.5 rounded-full bg-black shadow-sm"></div>}
                      </div>
                      
                      {(day.prayedMorning && day.prayedNight) && <div className="absolute inset-0 bg-green-100 opacity-50 z-0"></div>}
                    </motion.div>
                  ))}
                </div>

                <div className="mt-10 flex gap-6 border-t border-gray-100 pt-8">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Total Streak Aktif</p>
                    <p className="text-3xl font-bold">{streak} Hari</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Konsistensi Bulan Ini</p>
                    <p className="text-3xl font-bold">{consistency}%</p>
                  </div>
                </div>
             </div>
           </motion.div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16">
              <div className={`lg:col-span-7 bg-gradient-to-br rounded-[2rem] p-8 md:p-12 flex flex-col justify-between border border-gray-200/20 shadow-sm relative overflow-hidden transition-colors duration-1000 ${heroTheme}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold tracking-wide flex items-center gap-2 border border-white/20">
                      {isMorning ? <Sun className="w-3 h-3"/> : isAfternoon ? <Cloud className="w-3 h-3"/> : <Star className="w-3 h-3" />} 
                      {isMorning ? "SELAMAT PAGI" : isAfternoon ? "SELAMAT SORE" : "SELAMAT MALAM"}
                    </span>
                  </div>
                  
                  <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6 drop-shadow-sm">
                    Sembahyang <br />
                    <span className="opacity-80">
                       Harian
                    </span>
                  </h1>
                  
                  <p className="opacity-90 max-w-md text-lg mb-12">
                    Hari ini dimulai tepat pukul {sunTimes.sunrise.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' })}. Jaga pikiran dan jiwa tetap tenang.
                  </p>
                </div>

                <div className="relative z-10 flex flex-col sm:flex-row gap-4 mt-auto">
                   <SwipeToPray type="morning" completed={todayRecord.morning} onComplete={() => handlePrayed('morning')} />
                   <SwipeToPray type="night" completed={todayRecord.night} onComplete={() => handlePrayed('night')} />
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-6">
                <motion.div drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragElastic={0.2} className="col-span-2 sm:col-span-1 bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center cursor-grab active:cursor-grabbing hover:border-gray-300 transition-colors z-20 bg-opacity-90 backdrop-blur-sm">
                  <h3 className="text-6xl font-bold tracking-tighter mb-2 text-gray-900">{streak}<span className="text-3xl text-gray-400">+</span></h3>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">Hari berturut-turut<br/>menjaga konsistensi</p>
                  <div className="mt-6 flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center"><User className="w-4 h-4 text-gray-500"/></div>
                    <div className="w-8 h-8 rounded-full bg-yellow-100 border-2 border-white flex items-center justify-center"><Sun className="w-4 h-4 text-yellow-600"/></div>
                    <div className="w-8 h-8 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center"><Moon className="w-4 h-4 text-white"/></div>
                  </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={showRandomSloka} className="col-span-2 sm:col-span-1 bg-gradient-to-tr from-gray-900 to-gray-700 rounded-[2rem] p-6 shadow-sm relative overflow-hidden group cursor-pointer">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
                   <Moon className="w-12 h-12 text-white/80 absolute bottom-6 right-6 drop-shadow-lg" />
                   <p className="text-white/40 text-xs font-bold uppercase tracking-widest absolute top-6 left-6">Pesan Alam</p>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={showRandomSloka} className="col-span-2 bg-gradient-to-br from-white to-gray-100 rounded-[2rem] p-8 border border-gray-200 flex items-center justify-between relative overflow-hidden shadow-sm group cursor-pointer">
                   <div className="z-10">
                     <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-hover:text-black transition-colors">Lihat Sloka</p>
                     <h4 className="text-2xl font-bold text-gray-900 leading-tight">Ketenangan Hati &<br/>Pikiran Positif</h4>
                   </div>
                   <motion.div initial={{ rotate: 0 }} whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }} className="w-24 h-24 bg-white rounded-2xl shadow-sm flex items-center justify-center z-10 border border-gray-100">
                     <CheckCircle2 className="w-10 h-10 text-gray-800" />
                   </motion.div>
                </motion.div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-24 mb-12">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
                <h2 className="text-3xl md:text-4xl font-bold max-w-xl leading-tight text-gray-900">
                  Membangun Kebiasaan dengan <span className="text-gray-400">Bhakti</span>
                </h2>
                <motion.button 
                   whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                   onClick={subscribeToPush}
                   disabled={isSubscribing}
                   className="flex items-center gap-2 text-sm font-semibold bg-white px-5 py-2.5 rounded-full shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors z-20"
                >
                   <BellRing className={`w-4 h-4 ${isSubscribing ? 'animate-bounce' : 'text-gray-600'}`} /> 
                   {isSubscribing ? 'Mengaktifkan...' : 'Aktifkan Pengingat HP'}
                </motion.button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative z-20">
                <motion.div whileHover={{ y: -10 }} onClick={showRandomSloka} className="bg-gray-900 text-white rounded-[2rem] p-8 relative overflow-hidden group shadow-xl shadow-gray-900/10 cursor-pointer">
                   <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 group-hover:rotate-45 transition-all">
                     <ArrowUpRight className="w-5 h-5 text-white" />
                   </div>
                   <div className="mt-20">
                     <h4 className="text-2xl font-bold mb-3 leading-snug">Pilihan yang lebih baik untuk masa depan</h4>
                     <p className="text-gray-400 text-sm leading-relaxed">Konsistensi membentuk karakter dan kedamaian jiwa di setiap langkah.</p>
                   </div>
                </motion.div>

                <motion.div whileHover={{ y: -10 }} onClick={showRandomSloka} className="bg-gradient-to-b from-white to-orange-50 rounded-[2rem] p-8 relative overflow-hidden border border-gray-200 shadow-sm cursor-pointer group">
                   <div className="flex items-center gap-2 mb-20 group-hover:scale-110 origin-left transition-transform">
                     <Sun className="w-5 h-5 text-orange-500" />
                     <span className="font-bold text-gray-600 tracking-wide">Fajar</span>
                   </div>
                   <h4 className="text-2xl font-bold text-gray-900 leading-snug">Sambut pagi<br/>dengan kedamaian</h4>
                   <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-orange-200/40 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-300/50 transition-colors duration-700"></div>
                </motion.div>

                <motion.div whileHover={{ y: -10 }} className="bg-white rounded-[2rem] p-8 border border-gray-200 shadow-sm flex flex-col justify-center relative group">
                   <div className="flex justify-between items-start mb-8">
                     <div>
                       <h3 className="text-6xl font-bold tracking-tighter mb-1 text-gray-900">{consistency}<span className="text-3xl text-gray-300">%</span></h3>
                       <p className="text-gray-500 font-medium">Konsistensi 30 Hari</p>
                     </div>
                     <motion.div whileHover={{ scale: 1.1, rotate: 10 }} whileTap={{ scale: 0.9 }} className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer" onClick={() => setCurrentView('stats')}>
                       <Calendar className="w-5 h-5" />
                     </motion.div>
                   </div>
                   <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-auto">
                     <motion.div initial={{ width: 0 }} animate={{ width: `${consistency}%` }} transition={{ duration: 1.5, delay: 0.5, ease: 'easeOut' }} className="h-full bg-black rounded-full"></motion.div>
                   </div>
                   <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-2 group-hover:text-black transition-colors">
                     <CheckCircle2 className="w-3.5 h-3.5" /> Ketenangan Jiwa terukur
                   </p>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}