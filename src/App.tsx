import { useEffect, useRef, useState, useCallback } from "react";
import { FPSGame } from "./game/FPSGame";

/* ── Reusable Low-Poly SVG Logo ─────────────────────────────── */
function Logo({ size = "normal" }: { size?: "normal" | "large" }) {
  const s = size === "large";
  return (
    <div className="flex items-center gap-2 select-none">
      <svg
        className={`text-emerald-500 transition-transform hover:scale-105 ${s ? "w-10 h-10" : "w-8 h-8"}`}
        viewBox="0 0 100 100"
        fill="none"
      >
        <polygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="#0f2e1b" stroke="#10b981" strokeWidth="4" />
        <polygon points="50,5 95,25 50,50" fill="#047857" />
        <polygon points="95,25 95,75 50,50" fill="#065f46" />
        <polygon points="95,75 50,95 50,50" fill="#0f766e" />
        <polygon points="50,95 5,75 50,50" fill="#115e59" />
        <polygon points="5,75 5,25 50,50" fill="#134e4a" />
        <polygon points="5,25 50,5 50,50" fill="#0d9488" />
        <circle cx="50" cy="50" r="15" fill="#f59e0b" />
        <polygon points="50,20 55,45 80,50 55,55 50,80 45,55 20,50 45,45" fill="#fff" />
      </svg>
      <div className="flex flex-col">
        <span className={`font-black tracking-widest font-mono text-white leading-none ${s ? "text-2xl" : "text-xl"}`}>
          POLY<span className="text-emerald-400">OPS</span>
        </span>
        <span className="text-[9px] font-mono text-emerald-500/80 tracking-widest uppercase leading-tight">
          Tactical Portal
        </span>
      </div>
    </div>
  );
}

/* ── Navigation link IDs & labels ───────────────────────────── */
const NAV_ITEMS = [
  { id: "hero", label: "HQ Portal" },
  { id: "lore", label: "Soldier Profile" },
  { id: "features", label: "Tactical Specs" },
  { id: "disclaimer", label: "Disclaimer" },
] as const;

/* ──────────────────────────────────────────────────────────── */
export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState("hero");

  /* ── Game state ─────────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<FPSGame | null>(null);
  const [hp, setHp] = useState(100);
  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState(12);
  const [reserve, setReserve] = useState(60);
  const [wave, setWave] = useState(1);
  const [enemiesLeft, setEnemiesLeft] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [weapon, setWeapon] = useState<"pistol" | "shotgun" | "ak47" | "mg42">("pistol");
  const [musicOn, setMusicOn] = useState(false);
  const [notifications, setNotifications] = useState<{ id: number; kind: "health" | "ammo"; text: string }[]>([]);
  const notifIdRef = useRef(0);

  /* ── IntersectionObserver scroll-spy ────────────────────── */
  useEffect(() => {
    if (isPlaying) return;
    const ids = NAV_ITEMS.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTab(entry.target.id);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    const els: Element[] = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { observer.observe(el); els.push(el); }
    }
    return () => { for (const el of els) observer.unobserve(el); };
  }, [isPlaying]);

  /* ── Game init ──────────────────────────────────────────── */
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    setNotifications([]);
    setGameOver(false);

    const game = new FPSGame(containerRef.current, {
      onHealthChange: setHp,
      onScoreChange: setScore,
      onAmmoChange: (a, r) => { setAmmo(a); setReserve(r); },
      onWaveChange: (w, e) => { setWave(w); setEnemiesLeft(e); },
      onGameOver: (s) => { setGameOver(true); setFinalScore(s); setPaused(true); if (document.pointerLockElement) document.exitPointerLock(); },
      onWeaponChange: setWeapon,
      onPickup: (kind, amount, weaponName) => {
        const id = ++notifIdRef.current;
        const text = kind === "health" ? `+${amount} HP` : `+${amount} ${(weaponName ?? "").toUpperCase()} AMMO`;
        setNotifications((p) => [...p, { id, kind, text }]);
        setTimeout(() => setNotifications((p) => p.filter((n) => n.id !== id)), 1800);
      },
    });
    gameRef.current = game;

    const onPL = () => { setPaused(document.pointerLockElement !== containerRef.current?.querySelector("canvas")); };
    document.addEventListener("pointerlockchange", onPL);
    return () => { document.removeEventListener("pointerlockchange", onPL); game.destroy(); };
  }, [isPlaying]);

  const startGame = useCallback(() => {
    if (gameOver) { window.location.reload(); return; }
    setStarted(true);
    gameRef.current?.requestPointerLock();
    if (!musicOn) { setMusicOn(true); gameRef.current?.startMusic(); }
  }, [gameOver, musicOn]);

  const toggleMusic = useCallback(() => {
    if (musicOn) { gameRef.current?.stopMusic(); setMusicOn(false); }
    else { gameRef.current?.startMusic(); setMusicOn(true); }
  }, [musicOn]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const hpPct = Math.max(0, Math.min(100, hp));
  const hpColor = hpPct > 60 ? "bg-emerald-400" : hpPct > 30 ? "bg-amber-400" : "bg-red-500";

  /* ════════════════════════════════════════════════════════════
     ██  GAME MODE  ██
     ════════════════════════════════════════════════════════ */
  if (isPlaying) {
    return (
      <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-mono text-white">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Back button */}
        {paused && !gameOver && (
          <div className="absolute top-4 left-4 z-50">
            <button onClick={() => setIsPlaying(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 rounded-md text-xs font-bold uppercase tracking-widest text-white transition-all shadow-md cursor-pointer flex items-center gap-2">
              <i className="bi bi-arrow-left" /> Back to Portal
            </button>
          </div>
        )}

        {/* Pickup notifications */}
        {started && notifications.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-[55%] -translate-x-1/2 flex flex-col items-center gap-1.5 font-mono z-40">
            {notifications.map((n) => (
              <div key={n.id} className={`px-4 py-1.5 rounded-md text-base font-black tracking-wider border-2 backdrop-blur shadow-lg pickup-notif ${n.kind === "health" ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/60 shadow-emerald-500/40" : "bg-amber-500/30 text-amber-200 border-amber-400/60 shadow-amber-500/40"}`}>
                <i className={`bi ${n.kind === "health" ? "bi-plus-circle-fill" : "bi-box-fill"} mr-1`} />{n.text}
              </div>
            ))}
          </div>
        )}

        {/* Crosshair */}
        {started && !paused && !gameOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
            <div className="relative w-6 h-6">
              <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
              <div className="absolute left-1/2 bottom-0 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
              <div className="absolute top-1/2 left-0 w-2 h-0.5 -translate-y-1/2 bg-white/90" />
              <div className="absolute top-1/2 right-0 w-2 h-0.5 -translate-y-1/2 bg-white/90" />
              <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 transition-all duration-150 ${weapon === "shotgun" ? "w-2.5 h-2.5 opacity-60" : weapon === "mg42" ? "w-1.5 h-1.5 opacity-80" : weapon === "ak47" ? "w-1 h-1 opacity-90" : "w-0.5 h-0.5"}`} />
            </div>
          </div>
        )}

        {/* HUD */}
        {started && (
          <div className="pointer-events-none absolute inset-0 p-4 flex flex-col justify-between z-20">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-lg border border-white/10 shadow-lg">
                  <div className="text-xs uppercase tracking-widest opacity-70">Wave</div>
                  <div className="text-2xl font-bold">{wave}</div>
                  <div className="text-xs text-emerald-400 font-bold">{enemiesLeft} remaining</div>
                </div>
                <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-lg border border-white/10 flex flex-col justify-center gap-1 shadow-lg">
                  <div className="text-[10px] uppercase tracking-widest opacity-60 mb-0.5 font-sans">Arsenal</div>
                  {([["pistol","Pistol","amber"],["shotgun","Shotgun","orange"],["ak47","AK-47","red"],["mg42","MG42","purple"]] as const).map(([k,lbl,c])=>(
                    <div key={k} className="text-sm font-bold flex items-center gap-2 h-5">
                      <span className={`text-[10px] px-1.5 py-0 rounded font-mono ${weapon===k?`bg-${c}-500/30 text-${c}-300 border border-${c}-400/40`:"text-white/40 border border-white/10"}`}>
                        {k==="pistol"?"1":k==="shotgun"?"2":k==="ak47"?"3":"4"}
                      </span>
                      <span className={`text-xs ${weapon===k?`text-${c}-300 font-black`:"text-white/40"}`}>{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-lg border border-white/10 text-right shadow-lg">
                <div className="text-xs uppercase tracking-widest opacity-70">Score</div>
                <div className="text-2xl font-bold text-yellow-300">{score.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex justify-between items-end">
              <div className="bg-black/50 backdrop-blur px-4 py-3 rounded-lg border border-white/10 w-64 shadow-lg">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs uppercase tracking-widest opacity-70">Health</span>
                  <span className="text-lg font-bold">{Math.ceil(hpPct)}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${hpColor} transition-all duration-200`} style={{ width: `${hpPct}%` }} />
                </div>
              </div>
              <div className="bg-black/50 backdrop-blur px-5 py-3 rounded-lg border border-white/10 text-right shadow-lg">
                <div className="text-xs uppercase tracking-widest opacity-70">
                  {weapon === "pistol" ? "Pistol" : weapon === "shotgun" ? "Shotgun" : weapon === "ak47" ? "AK-47" : "MG42"}
                </div>
                <div className="text-3xl font-bold tabular-nums">
                  <span className={ammo === 0 ? "text-red-500" : ""}>{ammo}</span>
                  <span className="opacity-50 text-xl"> / {reserve}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {(paused || !started) && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md z-50">
            <div className="max-w-lg text-center text-white px-8">
              <div className="flex justify-center mb-4"><Logo size="large" /></div>
              <p className="text-emerald-400 mb-6 text-xs uppercase tracking-[0.2em] font-bold bg-emerald-950/40 py-1 px-3 rounded inline-block border border-emerald-500/20">
                <i className="bi bi-shield-lock-fill mr-1" /> ACTIVE BATTLEFIELD LOCK
              </p>

              <div className="grid grid-cols-2 gap-3 text-left text-xs bg-white/5 border border-white/10 rounded-xl p-4 mb-6 shadow-inner">
                <div className="opacity-70">Move / Sprint</div><div className="font-mono text-white">W A S D / L-SHIFT</div>
                <div className="opacity-70">Look / Shoot</div><div className="font-mono text-white">MOUSE / LEFT CLICK</div>
                <div className="opacity-70">Reload / Pause</div><div className="font-mono text-white">R / ESC</div>
                <div className="opacity-70 font-bold text-amber-400">1. Pistol</div><div className="font-mono text-amber-400">Semi-Auto, Precise</div>
                <div className="opacity-70 font-bold text-orange-400">2. Shotgun</div><div className="font-mono text-orange-400">8 Pellets, Wide Spread</div>
                <div className="opacity-70 font-bold text-red-400">3. AK-47</div><div className="font-mono text-red-400">Full-Auto, High Impact</div>
                <div className="opacity-70 font-bold text-purple-400">4. MG42</div><div className="font-mono text-purple-400">1,200 RPM, Side Drum</div>
                <div className="col-span-2 border-t border-white/10 pt-2 mt-1 text-center font-bold text-red-400 text-[11px]">
                  <i className="bi bi-exclamation-triangle-fill mr-1" />Green soldiers shoot fast (72m/s)! Take cover behind crates &amp; trees.
                </div>
                <div className="col-span-2 text-center text-amber-300 text-[11px] -mt-1">
                  <i className="bi bi-box-seam-fill mr-1" />Kill <span className="text-emerald-400 font-black">green soldiers</span> — rare 15%: +1 magazine (max 500)
                </div>
                <div className="col-span-2 text-center text-emerald-300 text-[11px] -mt-1">
                  <i className="bi bi-heart-pulse-fill mr-1" />Kill <span className="text-red-400 font-black">red melee</span> — rare 12%: drops +10 HP pack
                </div>
                <div className="col-span-2 text-center text-orange-300 text-[11px] font-bold -mt-1 bg-orange-950/40 p-1.5 rounded border border-orange-500/20">
                  <i className="bi bi-radioactive mr-1" /><span className="text-orange-400 font-black">ORANGE EXPLODERS</span> sprint &amp; detonate — 45 HP blast! 350 pts
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 mb-4">
                <button onClick={startGame} className="px-10 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-lg text-lg font-black uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:scale-105 transition-transform cursor-pointer text-white border border-emerald-300/30 flex items-center gap-2">
                  <i className="bi bi-crosshair" />{started ? "Resume Action" : "Engage Ops"}
                </button>
                <button onClick={toggleMusic} className={`px-4 py-4 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2 ${musicOn ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-white/10 hover:bg-white/20 text-white/60"}`}>
                  <i className={`bi ${musicOn ? "bi-volume-up-fill" : "bi-volume-mute-fill"}`} />{musicOn ? "ON" : "OFF"}
                </button>
              </div>
              <p className="text-xs text-white/40 mt-2">Click to capture pointer. Press <span className="text-white/80">ESC</span> to pause.</p>
            </div>
          </div>
        )}

        {/* Game over */}
        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-50 font-mono">
            <div className="text-center text-white px-8">
              <h1 className="text-7xl font-black text-red-500 mb-2 tracking-tight">MISSION FAILED</h1>
              <p className="text-white/60 mb-2 uppercase tracking-widest text-xs"><i className="bi bi-heartbreak-fill mr-1" />Vital Integrity Depleted</p>
              <p className="text-5xl font-bold text-yellow-300 mb-2">{finalScore.toLocaleString()} pts</p>
              <p className="text-white/60 mb-6 text-sm">Survived until Wave {wave}</p>
              <div className="flex justify-center gap-4">
                <button onClick={() => window.location.reload()} className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 rounded-md text-sm font-bold uppercase tracking-widest cursor-pointer hover:scale-105 transition-transform flex items-center gap-2">
                  <i className="bi bi-arrow-repeat" />Re-deploy
                </button>
                <button onClick={() => setIsPlaying(false)} className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-md text-sm font-bold uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2">
                  <i className="bi bi-globe2" />Web Portal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     ██  WEBSITE  ██
     ════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0b130e] text-slate-300 font-sans selection:bg-emerald-500 selection:text-black">
      {/* ── Sticky Header ──────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0b130e]/90 backdrop-blur-md border-b border-emerald-500/20 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo("hero")} className="cursor-pointer"><Logo /></button>

          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)}
                className={`px-3 py-1.5 rounded-md text-xs lg:text-sm font-mono tracking-wider transition-all cursor-pointer uppercase ${activeTab === item.id ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
                {item.label}
              </button>
            ))}
            <button onClick={() => setIsPlaying(true)} className="ml-4 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded font-mono uppercase text-xs font-black tracking-widest shadow-md shadow-emerald-500/20 transition-transform hover:scale-105 cursor-pointer border border-emerald-300/30 flex items-center gap-2">
              <i className="bi bi-lightning-charge-fill" /> Play Game
            </button>
          </nav>

          <div className="flex md:hidden items-center gap-2">
            <button onClick={() => setIsPlaying(true)} className="px-4 py-2 bg-emerald-600 text-white rounded font-mono uppercase text-xs font-black tracking-wider cursor-pointer shadow-md flex items-center gap-1">
              <i className="bi bi-play-fill" />Play
            </button>
          </div>
        </div>

        <div className="flex md:hidden justify-around pt-2 mt-2 border-t border-white/5 text-[10px] font-mono tracking-widest uppercase overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => scrollTo(item.id)} className={`px-2 py-1 ${activeTab === item.id ? "text-emerald-400 font-bold" : "text-slate-500"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Mobile notice */}
      <div className="block lg:hidden bg-amber-950/80 border-b border-amber-500/30 px-4 py-2 text-center text-amber-200 text-xs font-mono">
        <i className="bi bi-controller mr-1" /><strong className="text-amber-400">Combat Note:</strong> The 3D FPS simulation is optimized primarily for desktop mouse controls.
      </div>

      {/* ── Hero Section ───────────────────────────────────── */}
      <section id="hero" className="relative py-16 lg:py-24 overflow-hidden border-b border-emerald-500/10">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-96 h-96 bg-emerald-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-500 rounded-full blur-[150px]" />
          <div className="w-full h-full bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:32px_32px] opacity-25" />
        </div>

        <div className="max-w-7xl mx-auto px-4 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded text-xs font-mono text-emerald-400 tracking-widest uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Version 2.0 &bull; Audio Enhanced Ops
              </div>

              <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-none font-mono">
                IMMERSIVE LOW-POLY<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500">
                  TACTICAL SURVIVAL
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
                Enter the combat proving grounds of <strong className="text-emerald-400">Poly Ops</strong>. Engage hostile armed soldiers, dodge rapid hitscan ballistics, collect rare field supplies, and unleash a full high-impact weapon catalog right inside your modern web browser.
              </p>

              <div className="grid grid-cols-3 gap-4 pt-2 max-w-md font-mono">
                {[
                  { val: "4 Guns", sub: "Swappable Slots", icon: "bi-crosshair2", cls: "text-white" },
                  { val: "72 m/s", sub: "Hostile Tracers", icon: "bi-speedometer", cls: "text-emerald-400" },
                  { val: "3 Types", sub: "Smart Opponents", icon: "bi-people-fill", cls: "text-orange-400" },
                ].map((m) => (
                  <div key={m.val} className="bg-[#122217] p-3 rounded border border-emerald-500/10 text-center">
                    <i className={`bi ${m.icon} text-lg ${m.cls} block mb-1`} />
                    <div className={`text-xl sm:text-2xl font-black ${m.cls}`}>{m.val}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{m.sub}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-4">
                <button onClick={() => setIsPlaying(true)} className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-lg font-mono text-base font-black tracking-widest uppercase transition-all hover:scale-105 shadow-xl shadow-emerald-900/50 cursor-pointer border border-emerald-300/40 flex items-center gap-3">
                  <i className="bi bi-lightning-charge-fill text-lg" />LAUNCH DEPLOYMENT
                </button>
                <button onClick={() => scrollTo("features")} className="px-6 py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg font-mono text-xs uppercase tracking-widest transition-all cursor-pointer border border-white/10 flex items-center gap-2">
                  <i className="bi bi-chevron-double-down" />Inspect Arsenal
                </button>
              </div>

              <div className="text-xs text-slate-500 font-mono flex items-center gap-3 pt-2">
                <span className="flex items-center gap-1"><i className="bi bi-shield-check text-emerald-600" />Procedural Audio</span>
                <span>&bull;</span>
                <span className="flex items-center gap-1"><i className="bi bi-gpu-card text-emerald-600" />Instant 3D Engine</span>
              </div>
            </div>

            {/* Right terminal */}
            <div className="lg:col-span-5 relative">
              <div className="bg-[#0e1a13] rounded-xl border border-emerald-500/30 p-6 shadow-2xl space-y-4 font-mono">
                <div className="flex items-center justify-between pb-3 border-b border-emerald-500/10 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="w-3 h-3 rounded-full bg-red-500" /><span className="w-3 h-3 rounded-full bg-yellow-500" /><span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="ml-2 text-emerald-500 font-bold uppercase">Field Ops Specs</span>
                  </div>
                  <span className="text-[10px] text-slate-500">SYS_PORTAL v2.0</span>
                </div>

                <div className="bg-black/60 rounded-lg p-4 text-left border border-white/5 text-xs space-y-2 overflow-hidden relative">
                  <div className="text-emerald-400 text-[10px] uppercase font-bold tracking-widest pb-1">
                    <i className="bi bi-broadcast mr-1" />LIVE COMBAT SIMULATION RULES
                  </div>
                  <p className="text-slate-300"><strong className="text-emerald-400">15% RARE DROP:</strong> Neutralizing green soldiers replenishes active weapon magazines.</p>
                  <p className="text-slate-300"><strong className="text-amber-400">12% RARE DROP:</strong> Defeating red rushers drops a +10 HP pack.</p>
                  <p className="text-orange-400 font-bold"><i className="bi bi-radioactive mr-1" />WARNING: Orange exploders trigger a 45 HP shockwave. Rising audio beeps!</p>
                  <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 space-y-1">
                    <div><span className="text-white font-bold">Key 1:</span> Compact Pistol (Precise)</div>
                    <div><span className="text-white font-bold">Key 2:</span> Shotgun (8-Pellet Spread)</div>
                    <div><span className="text-white font-bold">Key 3:</span> Assault AK-47 (Full-Auto)</div>
                    <div><span className="text-white font-bold">Key 4:</span> MG42 Machine Gun (1,200 RPM)</div>
                  </div>
                  <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                    <svg className="w-32 h-32 text-emerald-500" viewBox="0 0 100 100" fill="currentColor"><polygon points="50,0 100,50 50,100 0,50" /></svg>
                  </div>
                </div>

                <div className="bg-emerald-950/40 p-3 rounded border border-emerald-500/20 text-center">
                  <span className="text-xs text-slate-300 block mb-2">Ready to take full operational command?</span>
                  <button onClick={() => setIsPlaying(true)} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono text-xs font-black tracking-widest uppercase cursor-pointer transition-colors flex items-center justify-center gap-2">
                    <i className="bi bi-box-arrow-in-right" />Enter 3D Arena Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Soldier Profile / Lore ─────────────────────────── */}
      <section id="lore" className="py-16 bg-[#0f1d14] border-b border-emerald-500/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase block mb-2"><i className="bi bi-person-badge-fill mr-1" />Deployed Soldier Record</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">TACTICAL LORE &amp; COMBAT ROLE</h2>
            <div className="w-16 h-1 bg-emerald-500 mx-auto mt-4 rounded" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { n: "01", icon: "bi-geo-alt-fill", title: "Deployed Operator", text: "Deployed into Sector 7’s low-poly combat zone, you operate alone against relentless hostile waves. Adapt quickly, hold the perimeter, and fight to survive the simulation." },
              { n: "02", icon: "bi-book-half", title: "Battlefield Story", text: "The AI defense matrix has gone hostile. Armed security soldiers wear reinforced tactical green helmets and continuously respawn from the edges. Survival demands constant lateral movement, physical cover, and impeccable accuracy." },
              { n: "03", icon: "bi-bullseye", title: "Mission Objective", text: "Clear progressive waves of rushing melee opponents, rapid-firing green soldiers, and unpredictable orange explosive variants. Use stacked crates and low-poly pine trees to block hostile ballistic tracers." },
              { n: "04", icon: "bi-bar-chart-fill", title: "Combat Stats Spec", text: null },
            ].map((b) => (
              <div key={b.n} className="bg-[#0a140e] p-6 rounded-lg border border-emerald-500/10 space-y-3 text-left hover:border-emerald-500/30 transition-all">
                <div className="w-10 h-10 rounded bg-emerald-950 flex items-center justify-center text-emerald-400 text-lg"><i className={`bi ${b.icon}`} /></div>
                <h3 className="text-lg font-bold text-white font-mono uppercase tracking-wider">{b.title}</h3>
                {b.text ? (
                  <p className="text-xs text-slate-400 leading-relaxed">{b.text}</p>
                ) : (
                  <ul className="text-xs text-slate-400 space-y-1 font-mono pt-1">
                    <li><strong className="text-white">Max Reserve:</strong> 500 rounds</li>
                    <li><strong className="text-white">Hitscan Speed:</strong> ~120 m/s</li>
                    <li><strong className="text-white">Sprint:</strong> Audio Assisted</li>
                    <li><strong className="text-white">Headshot Mul:</strong> 2x to 3x</li>
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Audio showcase */}
          <div className="mt-10 bg-[#0b140e] rounded-xl border border-emerald-500/20 p-6 lg:p-8 flex flex-col md:flex-row items-center justify-between gap-6 text-left">
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-emerald-400 font-mono uppercase tracking-wide flex items-center gap-2"><i className="bi bi-soundwave" />Game Audio Enhancements</h4>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">Enjoy fully optimized procedural web audio synthesis. Hear realistic multi-tone pain grunts when sustaining impacts. Sprint triggers an immersive, multi-layer inhale/exhale breathing loop that stops immediately when you stop sprinting.</p>
            </div>
            <button onClick={() => setIsPlaying(true)} className="shrink-0 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded font-mono text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2">
              <i className="bi bi-headphones" />Test Live Audio
            </button>
          </div>
        </div>
      </section>

      {/* ── Tactical Specs / Features ──────────────────────── */}
      <section id="features" className="py-16 lg:py-24 bg-[#0b130e] border-b border-emerald-500/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase block mb-2"><i className="bi bi-tools mr-1" />Hardware &amp; Logistics</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">POLY OPS SPECIFICATIONS</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Switch freely between four specialized weapons during engagements. Manage your supplies carefully to prevent dry fire.</p>
          </div>

          {/* Weapons grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {([
              { k: "1", name: "Tactical Pistol", tag: "Semi-Auto", c: "amber", desc: "Compact black sidearm with crisp trigger pull, high precision, low recoil, and 2.85x critical headshot damage multiplier.", stats: ["Capacity: 12 mag", "Reload: 1.1s", "Spread: Zero"] },
              { k: "2", name: "Pump Shotgun", tag: "Buckshot", c: "orange", desc: "Twin-barrel model with dark wood stock and pump grip. Devastating 8-pellet cone perfect for rushing opponents.", stats: ["Capacity: 6 mag", "Reload: 1.8s", "Pellets: 8x"] },
              { k: "3", name: "Assault AK-47", tag: "Full-Auto", c: "red", desc: "Iconic rifle with low-poly wooden furniture and curved magazine. Rapid 0.1s fire rate with excellent suppression.", stats: ["Capacity: 30 mag", "Reload: 1.5s", "Critical: 3.0x"] },
              { k: "4", name: "Heavy MG42", tag: "1,200 RPM", c: "purple", desc: "Legendary side-mounted green drum machine gun. Unrivaled continuous suppression with rapid muzzle climb.", stats: ["Capacity: 100 drum", "Reload: 2.5s", "Spread: High"] },
            ] as const).map((w) => (
              <div key={w.k} className="bg-[#101f15] rounded-xl p-6 border border-emerald-500/20 flex gap-4 text-left">
                <span className={`shrink-0 w-12 h-12 rounded-lg bg-${w.c}-500/20 text-${w.c}-400 border border-${w.c}-500/30 flex items-center justify-center font-mono font-black text-xl`}>{w.k}</span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white font-mono uppercase">{w.name}</h3>
                    <span className={`text-[10px] font-mono text-${w.c}-400 bg-${w.c}-950 px-2 py-0.5 rounded`}>{w.tag}</span>
                  </div>
                  <p className="text-xs text-slate-300">{w.desc}</p>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] font-mono text-slate-400">
                    {w.stats.map((s) => <div key={s}><i className="bi bi-dot" /><strong className="text-white">{s.split(":")[0]}:</strong>{s.split(":")[1]}</div>)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Hostiles */}
          <div className="mt-16 text-left">
            <h3 className="text-xl font-bold text-white font-mono uppercase tracking-wide mb-6 text-center border-b border-white/10 pb-3 flex items-center justify-center gap-2">
              <i className="bi bi-binoculars-fill" />Identified Opponents &amp; Ballistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: "bi-shield-fill-check", cls: "emerald", title: "Tactical Green Soldiers", text: "Equipped with brimmed helmets, these units hold rifles and fire fast red ballistics at 72 m/s. Take cover behind physical obstacles. Rare 15% drop rate for active weapon magazines." },
                { icon: "bi-lightning-fill", cls: "red", title: "Red Melee Operatives", text: "Fierce red-shirted ground infantry that rush your position. Deliver physical trauma on proximity. Rare 12% drop rate places a floating +10 HP cube on the ground." },
                { icon: "bi-radioactive", cls: "orange", title: "Orange Exploder Units", text: "Marked with hazard stripes, glowing red eyes, and pulsing aura. Sprint fast with increasing warning beeps. Detonate on impact dealing 45 HP damage. 350-point bonus on neutralization." },
              ].map((e) => (
                <div key={e.title} className={`bg-${e.cls}-950/20 p-5 rounded-lg border border-${e.cls}-500/20 space-y-2`}>
                  <span className={`text-xs font-bold text-${e.cls}-400 uppercase font-mono flex items-center gap-1`}><i className={`bi ${e.icon}`} />{e.title}</span>
                  <p className="text-xs text-slate-300">{e.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Disclaimer Section ─────────────────────────────── */}
      <section id="disclaimer" className="py-16 bg-[#0c160f] border-b border-emerald-500/10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 text-left">
          <div className="bg-[#0f1b13] rounded-xl p-8 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-amber-500 font-mono font-bold text-xs uppercase tracking-widest">
              <i className="bi bi-exclamation-octagon-fill" />PROFESSIONAL LEGAL &amp; CONTENT DISCLAIMER
            </div>
            <h3 className="text-xl font-bold text-white font-mono tracking-tight">IMPORTANT NOTICE FOR ALL SITE VISITORS</h3>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>The digital web application and full interactive low-poly 3D shooter experience named <strong className="text-white">Poly Ops</strong> is entirely fictional and developed solely for interactive entertainment and technology-showcase purposes.</p>
              <p>This project strictly does <strong className="text-emerald-400">not</strong> promote violence, terrorism, war crimes, hate speech, genocide, or real-world harm of any nature. All characters, names, settings, weapon items, and interactive audio elements are strictly virtual low-poly computer representations synthesized programmatically.</p>
              <p>The content contained herein should not be interpreted as support, endorsement, or alignment with any extremist ideologies, military real-world operations, or unlawful real-world activities. We take safety, responsibility, and operational guidelines very seriously.</p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/5 rounded text-[10px] font-mono text-slate-400">
                <i className="bi bi-patch-check-fill text-emerald-500" />Authorized Verification &bull; Fictional Studio Production
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-[#080f0a] text-slate-400 text-xs py-12 border-t border-emerald-500/20">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-white/5">
            <div className="text-center md:text-left">
              <Logo />
              <p className="text-[11px] text-slate-500 mt-2 max-w-xs">A highly optimized, performance-focused Web Game Portal. Serving low-poly web experiences natively without heavy dependencies.</p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-3 font-mono">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Communication Hubs</span>
              <div className="flex items-center gap-3 sm:gap-4 text-slate-300">
                {[
                  { href: "https://github.com/Blue-Rangoon", icon: "bi-github", label: "GitHub" },
                  { href: "https://linkedin.com/in/saad-ali-rizvi", icon: "bi-linkedin", label: "LinkedIn" },
                  { href: "https://x.com/Blue_Rangoon", icon: "bi-twitter-x", label: "Twitter/X" },
                  { href: "https://discord.com/users/leoinblue1", icon: "bi-discord", label: "Discord" },
                ].map((s) => (
                  <a key={s.icon} href={s.href} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-white/5 hover:bg-white/10 hover:text-emerald-400 rounded-full transition-all flex items-center justify-center border border-white/5" title={s.label}>
                    <i className={`bi ${s.icon} text-base`} />
                    <span className="sr-only">{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6">
            <p className="text-slate-600">&copy; {new Date().getFullYear()} Poly Ops Web Portal. All rights reserved. Fictional setup.</p>
            <div className="flex items-center gap-4 text-slate-500 text-[11px] font-mono">
              <span className="flex items-center gap-1"><i className="bi bi-browser-chrome" />Chrome</span>
              <span className="flex items-center gap-1"><i className="bi bi-browser-edge" />Edge</span>
              <span className="flex items-center gap-1"><i className="bi bi-browser-firefox" />Firefox</span>
              <span className="flex items-center gap-1"><i className="bi bi-globe2" />Opera</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
