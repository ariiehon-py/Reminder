import { useState, useEffect } from 'react';
import { Moon, ArrowUpRight, CheckCircle2, Star, Activity, User, Sun, Calendar, BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PrayerData {
  history: string[]; // YYYY-MM-DD
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function App() {
  const [prayerData, setPrayerData] = useState<PrayerData>({ history: [] });
  const [currentView, setCurrentView] = useState<'home' | 'stats'>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from('prayer_history')
          .select('date')
          .order('date', { ascending: false });

        if (error) {
          console.error('Error fetching from Supabase:', error);
          const stored = localStorage.getItem('sembahyangData');
          if (stored) {
             setPrayerData(JSON.parse(stored));
          }
          return;
        }

        const history = data.map(row => row.date);
        
        const stored = localStorage.getItem('sembahyangData');
        if (history.length === 0 && stored) {
            const localData = JSON.parse(stored);
            if (localData.history && localData.history.length > 0) {
               const inserts = localData.history.map((d: string) => ({ date: d }));
               const { error: insertError } = await supabase.from('prayer_history').insert(inserts);
               if (!insertError) {
                 history.push(...localData.history);
               }
            }
        }
        
        setPrayerData({ history });
        localStorage.setItem('sembahyangData', JSON.stringify({ history }));
      } catch (err) {
         console.error('Unexpected error:', err);
      } finally {
         setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayStr = getTodayStr();
  const hasPrayedToday = prayerData.history.includes(todayStr);

  const calculateStreak = () => {
    if (prayerData.history.length === 0) return 0;
    
    let streak = 0;
    const historySet = new Set(prayerData.history);
    
    let checkDate = new Date();
    if (!hasPrayedToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (historySet.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak;
  };

  const calculateConsistency = () => {
    let prayedDays = 0;
    const historySet = new Set(prayerData.history);
    
    const checkDate = new Date();
    for (let i = 0; i < 30; i++) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (historySet.has(dateStr)) prayedDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return Math.round((prayedDays / 30) * 100);
  };

  const handlePrayed = async () => {
    if (!hasPrayedToday) {
      const newHistory = [...prayerData.history, todayStr];
      const newData = { history: newHistory };
      setPrayerData(newData);
      localStorage.setItem('sembahyangData', JSON.stringify(newData));
      
      const { error } = await supabase
        .from('prayer_history')
        .insert([{ date: todayStr }]);
        
      if (error) {
        console.error('Error saving to Supabase:', error);
      }
    }
  };
  
  const subscribeToPush = async () => {
    setIsSubscribing(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Browser Anda tidak mendukung notifikasi web push. Pastikan Anda membuka web ini di browser modern (Chrome/Safari) atau menambahkannya ke Layar Utama (Home Screen) jika di iOS.');
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

      if (error) {
        if (error.code === '23505') {
            alert('Perangkat ini sudah terdaftar untuk menerima notifikasi pengingat.');
        } else {
            console.error('Error saving subscription', error);
            alert('Gagal mengaktifkan notifikasi di database.');
        }
      } else {
        alert('Notifikasi Pengingat berhasil diaktifkan! Anda akan diingatkan setiap jam 8 malam.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat mengaktifkan notifikasi.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const streak = calculateStreak();
  const consistency = calculateConsistency();

  const generateLast30Days = () => {
    const days = [];
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 29);
    
    for (let i = 0; i < 30; i++) {
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      days.push({
        date: new Date(checkDate),
        dateStr,
        prayed: prayerData.history.includes(dateStr)
      });
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return days;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <Moon className="w-10 h-10 text-gray-400 mb-4 animate-spin-slow" />
          <p className="text-gray-500 font-medium">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-200 text-black font-sans selection:bg-black selection:text-white">
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('home')}>
          <Moon className="w-6 h-6" />
          <span className="font-bold text-xl tracking-tight">Bhakti</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium text-gray-600">
          <button onClick={() => setCurrentView('home')} className={`transition-colors ${currentView === 'home' ? 'text-black font-bold' : 'hover:text-black'}`}>Beranda</button>
          <button onClick={() => setCurrentView('stats')} className={`transition-colors ${currentView === 'stats' ? 'text-black font-bold' : 'hover:text-black'}`}>Statistik</button>
          <a href="#" className="hover:text-black transition-colors">Tentang</a>
        </div>
        <div className="flex gap-4">
          <button className="px-5 py-2 bg-black text-white text-sm font-semibold rounded-full hover:bg-black/80 transition-colors pointer-events-none">
            {hasPrayedToday ? 'Selesai Hari Ini' : 'Belum Sembahyang'}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 pt-4 md:pt-12 pb-24">
        {currentView === 'stats' ? (
           <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="bg-white rounded-[2rem] p-10 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-gray-800" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">Riwayat 30 Hari</h2>
                    <p className="text-gray-500">Jejak konsistensi sembahyang Anda</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-3">
                  {generateLast30Days().map((day, i) => (
                    <div 
                      key={i} 
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all hover:scale-110 cursor-default ${
                        day.prayed 
                          ? 'bg-black text-white shadow-md' 
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}
                      title={`${day.dateStr} - ${day.prayed ? 'Selesai' : 'Kosong'}`}
                    >
                      <span>{day.date.getDate()}</span>
                      <span className="text-[10px] opacity-60">
                        {day.date.toLocaleDateString('id-ID', { weekday: 'short' })}
                      </span>
                    </div>
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
           </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="lg:col-span-7 bg-gradient-to-br from-gray-100 to-gray-50 rounded-[2rem] p-8 md:p-12 flex flex-col justify-between border border-gray-200/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gray-200 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold tracking-wide flex items-center gap-2">
                      <Star className="w-3 h-3" /> PENGINGAT HARIAN
                    </span>
                  </div>
                  
                  <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
                    Sembahyang <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-500">
                      Malam
                    </span>
                  </h1>
                  
                  <p className="text-gray-600 max-w-md text-lg mb-12">
                    Kami hadir untuk membantu Anda membangun kebiasaan baik yang konsisten. Terus jaga sradha dan bhakti setiap malam.
                  </p>
                </div>

                <div className="relative z-10 flex flex-wrap items-center gap-4 mt-auto">
                  <button
                    onClick={handlePrayed}
                    disabled={hasPrayedToday}
                    className={`px-8 py-4 rounded-full text-lg font-semibold transition-all flex items-center gap-3 ${
                      hasPrayedToday 
                        ? 'bg-white text-gray-400 cursor-not-allowed border border-gray-200 shadow-sm' 
                        : 'bg-black text-white hover:bg-gray-800 hover:scale-[1.02] active:scale-95 shadow-xl shadow-black/10'
                    }`}
                  >
                    {hasPrayedToday ? 'Selesai ✅' : 'Sudah Sembahyang'} 
                    {!hasPrayedToday && <ArrowUpRight className="w-5 h-5" />}
                  </button>
                  
                  {hasPrayedToday && (
                     <span className="text-sm font-medium text-gray-500 bg-gray-100 px-4 py-2 rounded-full">
                        Astungkara, sampai jumpa besok!
                     </span>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-6">
                <div className="col-span-2 sm:col-span-1 bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center hover:border-gray-300 transition-colors">
                  <h3 className="text-6xl font-bold tracking-tighter mb-2 text-gray-900">{streak}<span className="text-3xl text-gray-400">+</span></h3>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">Hari berturut-turut<br/>menjaga konsistensi</p>
                  <div className="mt-6 flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center shadow-sm"><User className="w-4 h-4 text-gray-500"/></div>
                    <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center shadow-sm"><Activity className="w-4 h-4 text-gray-600"/></div>
                    <div className="w-8 h-8 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center shadow-sm"><Star className="w-4 h-4 text-white"/></div>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-gradient-to-tr from-gray-900 to-gray-700 rounded-[2rem] p-6 shadow-sm relative overflow-hidden group">
                   <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9zdmc+')] opacity-20 group-hover:scale-110 transition-transform duration-700"></div>
                   <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
                   <Moon className="w-12 h-12 text-white/80 absolute bottom-6 right-6 drop-shadow-lg" />
                </div>

                <div className="col-span-2 bg-gradient-to-br from-gray-100 to-gray-200 rounded-[2rem] p-8 border border-white flex items-center justify-between relative overflow-hidden shadow-sm group">
                   <div className="z-10">
                     <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pencapaian</p>
                     <h4 className="text-2xl font-bold text-gray-900 leading-tight">Ketenangan Hati &<br/>Pikiran Positif</h4>
                   </div>
                   <div className="w-24 h-24 bg-white/80 backdrop-blur-md rounded-2xl shadow-sm flex items-center justify-center z-10 rotate-3 group-hover:rotate-6 transition-transform">
                     <CheckCircle2 className="w-10 h-10 text-gray-800" />
                   </div>
                </div>
              </div>
            </div>

            <div className="mt-24 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
                <h2 className="text-3xl md:text-4xl font-bold max-w-xl leading-tight text-gray-900">
                  Membangun Kebiasaan dengan <span className="text-gray-400">Bhakti</span>
                </h2>
                <button 
                   onClick={subscribeToPush}
                   disabled={isSubscribing}
                   className="flex items-center gap-2 text-sm font-semibold bg-white px-5 py-2.5 rounded-full shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                   <BellRing className={`w-4 h-4 ${isSubscribing ? 'animate-bounce' : 'text-gray-600'}`} /> 
                   {isSubscribing ? 'Mengaktifkan...' : 'Aktifkan Pengingat HP'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="bg-gray-900 text-white rounded-[2rem] p-8 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 shadow-xl shadow-gray-900/10">
                   <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
                     <ArrowUpRight className="w-5 h-5 text-white" />
                   </div>
                   <div className="mt-20">
                     <h4 className="text-2xl font-bold mb-3 leading-snug">Pilihan yang lebih baik untuk masa depan</h4>
                     <p className="text-gray-400 text-sm leading-relaxed">Konsistensi membentuk karakter dan kedamaian jiwa di setiap langkah.</p>
                   </div>
                </div>

                <div className="bg-gradient-to-b from-white to-gray-100 rounded-[2rem] p-8 relative overflow-hidden hover:-translate-y-1 transition-transform duration-300 border border-gray-200 shadow-sm">
                   <div className="flex items-center gap-2 mb-20">
                     <Sun className="w-5 h-5 text-gray-500" />
                     <span className="font-bold text-gray-600 tracking-wide">Fajar</span>
                   </div>
                   <h4 className="text-2xl font-bold text-gray-900 leading-snug">Sambut pagi<br/>dengan kedamaian</h4>
                   <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-gray-200/50 rounded-full blur-3xl pointer-events-none"></div>
                </div>

                <div className="bg-white rounded-[2rem] p-8 border border-gray-200 shadow-sm flex flex-col justify-center hover:-translate-y-1 transition-transform duration-300">
                   <div className="flex justify-between items-start mb-8">
                     <div>
                       <h3 className="text-6xl font-bold tracking-tighter mb-1 text-gray-900">{consistency}<span className="text-3xl text-gray-300">%</span></h3>
                       <p className="text-gray-500 font-medium">Konsistensi 30 Hari</p>
                     </div>
                     <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-transform" onClick={() => setCurrentView('stats')}>
                       <Calendar className="w-5 h-5" />
                     </div>
                   </div>
                   <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-auto">
                     <div className={`h-full bg-black rounded-full`} style={{ width: `${consistency}%`, transition: 'width 1s ease-in-out' }}></div>
                   </div>
                   <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-2">
                     <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" /> Ketenangan Jiwa terukur
                   </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}