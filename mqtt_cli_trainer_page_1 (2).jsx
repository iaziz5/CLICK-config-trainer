import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

/*
  MQTT CLI Trainer — Page 1 (Bottom Dock Terminal + Test Mode)

  Key features:
  - "Test my knowledge" mode: hides guidance, disables Send buttons, Coach off; terminal still works.
  - Bottom‑docked single terminal with color‑coded context (MQTT = green, Node‑RED = red).
  - Auto‑swap terminal context when selecting the Node‑RED page.
  - Only MQTT & Node‑RED commands (no PLC prompt).
  
  UI Improvements:
  - Modern gradient backgrounds and improved visual hierarchy
  - Enhanced card designs with subtle shadows and borders
  - Better typography and spacing
  - Smooth transitions and hover effects
  - Improved terminal design with better readability
  - Enhanced responsive behavior
*/

// --- Topic filter match (supports + and #) ---
function matchTopic(filter, topic) {
  if (filter === "#" || filter === "+/#") return true; // catch-all
  const f = filter.split("/");
  const t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    const part = f[i];
    if (part === "#") return true; // multi-level wildcard matches rest
    if (t[i] == null) return false; // topic shorter than filter
    if (part !== "+" && part !== t[i]) return false;
  }
  return t.length === f.length; // exact length unless '#' consumed rest
}

// Simulated broker bus — simple pub/sub inside the page
const listeners = new Set();
function brokerPublish({ topic, payload, retained = false }) {
  const now = new Date();
  for (const fn of listeners) fn({ topic, payload, retained, ts: now });
}
function brokerListen(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Pre-canned responder for mosquitto_rr
function simulateResponder({ reqTopic, resTopic, payload }) {
  let reply = "ACK";
  const p = String(payload || "").trim().toLowerCase();
  if (p === "get" || p === "status") reply = "RUN";
  else if (p === "stop") reply = "OK";
  else if (p === "start") reply = "OK";
  else if (p) reply = `ACK:${payload}`;
  setTimeout(() => { brokerPublish({ topic: resTopic, payload: reply }); }, 600);
}

// Mock systemctl status output
function systemctlStatus() {
  return [
    "● mosquitto.service - Mosquitto MQTT v2.x broker",
    "     Loaded: loaded (/lib/systemd/system/mosquitto.service; enabled; vendor preset: enabled)",
    "     Active: active (running) since Wed 2025-08-13 10:15:22 EDT; 1 day ago",
    "   Main PID: 742 (mosquitto)",
    "      Tasks: 1 (limit: 19040)",
    "     Memory: 3.6M",
    "        CPU: 12ms",
    "     CGroup: /system.slice/mosquitto.service",
    "             └─742 /usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf",
    "",
    "Aug 14 20:05:01 host mosquitto[742]: mosquitto version 2.0.x running",
    "Aug 14 20:05:01 host mosquitto[742]: Opening ipv4 listen socket on port 1883.",
  ].join("\n");
}

function initialLogs() {
  return [
    "Aug 14 20:05:01 host mosquitto[742]: mosquitto version 2.0.x starting",
    "Aug 14 20:05:01 host mosquitto[742]: Config loaded from /etc/mosquitto/mosquitto.conf",
    "Aug 14 20:05:01 host mosquitto[742]: Opening ipv4 listen socket on port 1883.",
    "Aug 14 20:05:01 host mosquitto[742]: New connection from 127.0.0.1:52344",
  ];
}

function formatTime(ts = new Date()) {
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][ts.getMonth()];
  const dd = String(ts.getDate()).padStart(2, "0");
  const hh = String(ts.getHours()).padStart(2, "0");
  const mm = String(ts.getMinutes()).padStart(2, "0");
  const ss = String(ts.getSeconds()).padStart(2, "0");
  return `${mon} ${dd} ${hh}:${mm}:${ss}`;
}

function useJournalFollow() {
  const [lines, setLines] = useState(initialLogs());
  useEffect(() => {
    const off = brokerListen(({ topic, payload, ts }) => {
      setLines((prev) => [
        ...prev,
        `${formatTime(ts)} host mosquitto[742]: Received PUBLISH on ${topic} (q0, r0, m0, '${payload}')`,
      ]);
    });
    return off;
  }, []);
  return [lines, setLines];
}

// Terminal component (single, color‑coded) with improved styling
const Terminal = forwardRef(function Terminal({ title, bindToPublishes, heightClass = "h-72 md:h-96", testMode = false, context = "mqtt" }, ref) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState([]);
  const [subs, setSubs] = useState([]); // {filter, verbose, countMax}
  const scrollRef = useRef(null);

  // Enhanced theme by context (MQTT = green, Node-RED = red) with improved contrast and shadows
  const theme = context === 'nodered'
    ? { 
        border: 'border-red-500/40', 
        bg: 'bg-gradient-to-b from-[#1f0505] to-[#0d0101]', 
        headerBg: 'bg-gradient-to-r from-[#2d0a0a] to-[#1f0505]', 
        text: 'text-red-200', 
        accent: 'text-red-300', 
        dot: 'bg-red-500 shadow-lg shadow-red-500/50', 
        inputBorder: 'border-red-500/50', 
        placeholder: 'placeholder:text-red-500/60', 
        ring: 'focus:ring-red-500/50 focus:border-red-400', 
        btn: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-600/30',
        shadow: 'shadow-xl shadow-red-900/20'
      }
    : { 
        border: 'border-emerald-500/40', 
        bg: 'bg-gradient-to-b from-[#0a1a14] to-[#050d0a]', 
        headerBg: 'bg-gradient-to-r from-[#0d2818] to-[#0a1a14]', 
        text: 'text-emerald-300', 
        accent: 'text-emerald-400', 
        dot: 'bg-emerald-500 shadow-lg shadow-emerald-500/50', 
        inputBorder: 'border-emerald-500/50', 
        placeholder: 'placeholder:text-emerald-600/60', 
        ring: 'focus:ring-emerald-500/50 focus:border-emerald-400', 
        btn: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 shadow-lg shadow-emerald-600/30',
        shadow: 'shadow-xl shadow-emerald-900/20'
      };

  useEffect(() => {
    if (!bindToPublishes) return;
    const off = brokerListen(({ topic, payload }) => {
      const matched = subs.filter((s) => matchTopic(s.filter, topic));
      if (matched.length === 0) return;
      matched.forEach((s) => {
        const line = s.verbose ? `${topic} ${payload}` : `${payload}`;
        setLines((prev) => [...prev, line]);
        if (s.countMax != null) {
          const newCount = (s.count || 0) + 1; s.count = newCount;
          if (newCount >= s.countMax) {
            setSubs((cur) => cur.filter((x) => x !== s));
            setLines((prev) => [...prev, "(subscription exited: -C reached)"]); 
          }
        }
      });
    });
    return off;
  }, [subs, bindToPublishes]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [lines]);

  function println(text = "") { setLines((prev) => [...prev, text]); }

  function simulateNodeRed(cmd) {
    if (/^node-red(\s+--port\s+\d+)?\s*$/i.test(cmd)) {
      println("Welcome to Node-RED");
      println("[info] Node-RED version x.y.z");
      println("[info] Server now running at http://127.0.0.1:1880/");
      println("[info] Flows file : flows.json");
      return true;
    }
    // Safer boolean variables to avoid parentheses mistakes
    const isNpmInstall = /npm\s+install\s+-g.*node-red/i.test(cmd);
    const isCurlInstall = /bash\s+<\(curl.*node-red/i.test(cmd);
    if (isNpmInstall || isCurlInstall) {
      println("added 200 packages, and audited 200 packages in 5s");
      println("Node-RED installed globally. You can start it with 'node-red'.");
      return true;
    }
    if (/^node\s+-v\s*$/i.test(cmd)) { println("v18.x.x"); return true; }
    return false;
  }

  function handleCommand(raw) {
    const cmd = raw.trim(); if (!cmd) return; println(`$ ${cmd}`);

    // Node-RED simulation first (so users can run these without errors)
    if (simulateNodeRed(cmd)) return;

    // help & clear
    if (cmd === "help") {
      const helpMQTT = testMode ? "Test Mode (MQTT): mosquitto_sub, mosquitto_pub, mosquitto_rr, systemctl status mosquitto, journalctl -u mosquitto -f" : "MQTT: mosquitto_sub, mosquitto_pub, mosquitto_rr, systemctl status mosquitto, journalctl -u mosquitto -f, clear";
      const helpNR = testMode ? "Test Mode (Node-RED): node-red, node-red --port <n>, npm install -g node-red, node -v" : "Node-RED: node-red, node-red --port <n>, npm install -g --unsafe-perm node-red, node -v, clear";
      println(context === 'nodered' ? helpNR : helpMQTT); return;
    }
    if (cmd === "clear") { setLines([]); return; }

    // systemctl status mosquitto
    if (/^systemctl\s+status\s+mosquitto\s*$/i.test(cmd)) { println(systemctlStatus()); return; }

    // journalctl follow
    if (/^journalctl\s+-u\s+mosquitto\s+-f\s*$/i.test(cmd)) {
      println("-- Journal begins -- (CTRL+C to stop)");
      const off = brokerListen(({ topic, payload }) => { println(`${formatTime()} host mosquitto[742]: Received PUBLISH on ${topic} (q0, r0, m0, '${payload}')`); });
      const keyHandler = (e) => { if (e.key === "c" && (e.ctrlKey || e.metaKey)) { off(); println("-- Journal tail stopped --"); window.removeEventListener("keydown", keyHandler); } };
      window.addEventListener("keydown", keyHandler); return;
    }

    // mosquitto_sub
    if (cmd.startsWith("mosquitto_sub")) {
      const v = /\s-v(\s|$)/.test(cmd);
      const tMatch = cmd.match(/-t\s+([^\s]+)/);
      const cMatch = cmd.match(/-C\s+(\d+)/);
      if (!tMatch) { println("Error: missing -t <topic>"); return; }
      const sub = { filter: tMatch[1], verbose: v };
      if (cMatch) sub.countMax = parseInt(cMatch[1], 10);
      setSubs((cur) => [...cur, sub]); return;
    }

    // mosquitto_pub
    if (cmd.startsWith("mosquitto_pub")) {
      const tMatch = cmd.match(/-t\s+([^\s]+)/);
      const mMatch = cmd.match(/-m\s+([^\s].*)/);
      const nFlag = /\s-n(\s|$)/.test(cmd);
      if (!tMatch) { println("Error: missing -t <topic>"); return; }
      const topic = tMatch[1];
      let payload = ""; if (nFlag) payload = ""; else if (mMatch) {
        payload = mMatch[1].trim();
        if ((payload.startsWith('"') && payload.endsWith('"')) || (payload.startsWith("'") && payload.endsWith("'"))) payload = payload.slice(1, -1);
      } else { println("Error: missing -m <message> (or use -n)"); return; }
      brokerPublish({ topic, payload }); return;
    }

    // mosquitto_rr
    if (cmd.startsWith("mosquitto_rr")) {
      const tMatch = cmd.match(/-t\s+([^\s]+)/);
      const eMatch = cmd.match(/-e\s+([^\s]+)/);
      const mMatch = cmd.match(/-m\s+([^\s].*)/);
      const wMatch = cmd.match(/-w\s+(\d+)/);
      if (!tMatch || !eMatch) { println("Error: need -t <reqTopic> and -e <resTopic>"); return; }
      const reqTopic = tMatch[1]; const resTopic = eMatch[1];
      let payload = mMatch ? mMatch[1].trim() : "";
      if ((payload.startsWith('"') && payload.endsWith('"')) || (payload.startsWith("'") && payload.endsWith("'"))) payload = payload.slice(1, -1);
      brokerPublish({ topic: reqTopic, payload }); simulateResponder({ reqTopic, resTopic, payload });
      const off = brokerListen(({ topic, payload: p }) => { if (topic === resTopic) { println(String(p)); off(); } });
      const waitMs = wMatch ? parseInt(wMatch[1], 10) * 1000 : 3000;
      setTimeout(() => { try { off(); } catch {} println("(timeout waiting for response)"); }, waitMs + 50); return;
    }

    println("command not found. Type 'help'");
  }

  useImperativeHandle(ref, () => ({ run: (cmd) => handleCommand(cmd), getLines: () => [...lines], clear: () => setLines([]), setInput: (v) => setInput(v) }));

  return (
    <div className={`rounded-2xl border-2 ${theme.border} ${theme.bg} overflow-hidden ${theme.shadow} transition-all duration-300`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border} ${theme.headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-green-500/80"></span>
          </div>
          <div className={`text-sm font-semibold ${theme.text} tracking-wide`}>{title}</div>
        </div>
        <div className={`flex items-center gap-2 ${theme.accent}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${theme.dot} animate-pulse`}/>
          <span className="text-xs font-medium">connected</span>
        </div>
      </div>
      <div ref={scrollRef} className={`${heightClass} overflow-auto font-mono text-sm leading-relaxed ${theme.bg} ${theme.text} p-4`}>
        {lines.length === 0 ? (
          <div className={`${context==='nodered'?'text-red-400/70':'text-emerald-500/70'} flex items-center gap-2`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Type <span className={`${context==='nodered'?'text-red-300':'text-emerald-400'} font-semibold px-1`}>help</span> or run a command to get started.
          </div>
        ) : lines.map((ln, i) => (<div key={i} className="whitespace-pre-wrap py-0.5">{ln}</div>))}
      </div>
      <div className={`flex items-center gap-3 px-4 py-3 border-t ${theme.border} ${theme.headerBg}`}>
        <span className={`font-mono text-sm font-bold ${context==='nodered'?'text-red-400':'text-emerald-400'}`}>$</span>
        <input 
          value={input} 
          onChange={(e)=>setInput(e.target.value)} 
          onKeyDown={(e)=>{ if(e.key==="Enter"){ const v=input; setInput(""); handleCommand(v);} }} 
          placeholder={context === 'nodered' ? "Type a Node‑RED command (e.g., node-red) and press Enter" : "Type an MQTT command (e.g., mosquitto_pub ...) and press Enter"} 
          className={`flex-1 ${theme.bg} ${theme.text} ${theme.placeholder} rounded-lg border-2 ${theme.inputBorder} px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring} transition-all duration-200`}
        />
        <button 
          onClick={()=>{ const v=input; setInput(""); handleCommand(v); }} 
          className={`px-4 py-2 text-sm rounded-lg ${theme.btn} text-white font-semibold transition-all duration-200 hover:scale-105 active:scale-95`}
        >
          Run
        </button>
      </div>
    </div>
  );
});

// Coach (Play‑by‑Play) panel with improved styling
const CoachPanel = forwardRef(function CoachPanel(_, ref) {
  const [notes, setNotes] = useState([]);
  function add(line) { const stamp = formatTime(); setNotes((prev)=>[...prev, `${stamp} — ${line}`]); }
  function clear() { setNotes([]); }
  useImperativeHandle(ref, () => ({ add, clear, get: () => [...notes] }));
  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-lg shadow-blue-100/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800">Play‑by‑Play Coach</h3>
            <p className="text-xs text-gray-500">Step-by-step explanations in plain English</p>
          </div>
        </div>
        <button onClick={clear} className="px-3 py-1.5 text-xs rounded-lg border-2 border-blue-200 text-blue-700 font-medium hover:bg-blue-100 hover:border-blue-300 transition-all duration-200">
          Clear
        </button>
      </div>
      <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5 max-h-64 overflow-auto">
        {notes.length === 0 ? (
          <div className="text-sm text-gray-500 flex items-center gap-2 py-4">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run a guided command to see step‑by‑step explanations here.
          </div>
        ) : notes.map((n,i)=>(<li key={i} className="whitespace-pre-wrap py-1 px-2 rounded-lg hover:bg-blue-100/50 transition-colors">{n}</li>))}
      </ol>
    </div>
  );
});

// Sidebar Nav Icon with improved styling
function Icon({ name }) {
  const common = "w-5 h-5";
  switch (name) {
    case "overview": return (<svg viewBox="0 0 24 24" className={common}><path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>);
    case "config": return (<svg viewBox="0 0 24 24" className={common}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>);
    case "send": return (<svg viewBox="0 0 24 24" className={common}><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "receive": return (<svg viewBox="0 0 24 24" className={common}><path d="M20 12H4M4 12l6-6M4 12l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "nodered": return (<svg viewBox="0 0 24 24" className={common}><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="18" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M9 12h6" stroke="currentColor" strokeWidth="2"/></svg>);
    case "logs": return (<svg viewBox="0 0 24 24" className={common}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>);
    case "tests": return (<svg viewBox="0 0 24 24" className={common}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    default: return null;
  }
}

// Command card used in panels (single send) with improved styling
function CommandBox({ label, cmd, onSend, explain, disabled, codeClassName }) {
  return (
    <div className="rounded-2xl border-2 border-gray-200 p-4 bg-white hover:border-gray-300 hover:shadow-lg transition-all duration-300 group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-semibold text-base text-gray-800 group-hover:text-gray-900 transition-colors">{label}</div>
          {explain && <div className="text-sm text-gray-600 mt-2 leading-relaxed">{explain}</div>}
        </div>
        <div className="flex gap-2 shrink-0">
          {onSend && (
            <button 
              disabled={disabled} 
              onClick={onSend} 
              className={`px-4 py-2 text-sm rounded-xl border-2 font-medium transition-all duration-200 ${
                disabled
                  ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-md active:scale-95"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Send to terminal
              </span>
            </button>
          )}
        </div>
      </div>
      <pre className={`mt-4 rounded-xl p-4 text-sm overflow-x-auto font-mono ${codeClassName || 'bg-gradient-to-r from-gray-900 to-gray-800 text-emerald-300'} shadow-inner`}>
        <code>{cmd}</code>
      </pre>
    </div>
  );
}

export default function Page() {
  const [logs] = useJournalFollow();
  const termRef = useRef(null); const coachRef = useRef(null);
  const [view, setView] = useState("overview");
  const [showCoach, setShowCoach] = useState(true);
  const [showTerm, setShowTerm] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [activeTerm, setActiveTerm] = useState("mqtt"); // mqtt | nodered (label only)
  const [testMode, setTestMode] = useState(false);

  // Auto-swap terminal based on selected panel
  useEffect(() => {
    if (view === 'nodered') setActiveTerm('nodered');
    else setActiveTerm('mqtt');
  }, [view]);

  function runAndNarrate(cmd, steps) {
    termRef.current?.run(cmd);
    (steps || []).forEach((s, i) => setTimeout(() => coachRef.current?.add(s), 220 * (i + 1)));
  }

  // ===== Panels with improved styling =====
  function PanelOverview() {
    const exampleJsonCmd = `mosquitto_pub -h 127.0.0.1 -t sensors/line1 -m '{"temp":22.8,"hum":41}'`;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Welcome to MQTT CLI Trainer</h2>
            <p className="text-sm text-gray-500">Interactive learning environment for MQTT and Node-RED</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Practice the essential tools: <strong className="text-emerald-700">MQTT CLI</strong> (mosquitto_pub/sub/rr) and <strong className="text-red-600">Node‑RED</strong> (install + start). Use the menu to focus on one area at a time. The terminal is <em>single</em> and color‑coded.</p>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl border-2 border-gray-200 p-5 bg-gradient-to-br from-white to-gray-50 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 cursor-pointer group" onClick={() => setView('config')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div className="text-base font-semibold text-gray-800 mb-1">Configure</div>
            <div className="text-sm text-gray-600">Check Mosquitto status + follow broker logs</div>
          </div>
          <div className="rounded-2xl border-2 border-gray-200 p-5 bg-gradient-to-br from-white to-gray-50 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 cursor-pointer group" onClick={() => setView('send')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div className="text-base font-semibold text-gray-800 mb-1">Send / Receive</div>
            <div className="text-sm text-gray-600">Publish DS1 data; subscribe to commands</div>
          </div>
          <div className="rounded-2xl border-2 border-gray-200 p-5 bg-gradient-to-br from-white to-gray-50 hover:border-red-300 hover:shadow-lg transition-all duration-300 cursor-pointer group" onClick={() => setView('nodered')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center mb-3 shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="6" cy="12" r="3" strokeWidth={2} fill="none"/>
                <circle cx="18" cy="12" r="3" strokeWidth={2} fill="none"/>
                <path strokeWidth={2} d="M9 12h6" />
              </svg>
            </div>
            <div className="text-base font-semibold text-gray-800 mb-1">Node‑RED</div>
            <div className="text-sm text-gray-600">Install & start the flow editor/server</div>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-emerald-200 p-5 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-base font-semibold text-emerald-800">Try a quick publish</div>
          </div>
          <div className="text-sm text-emerald-700 mb-4">Publishes a JSON reading. Make sure the terminal is set to <strong>MQTT</strong> in the toolbar.</div>
          <button 
            disabled={testMode} 
            onClick={() => runAndNarrate(exampleJsonCmd, ["You published a JSON payload on sensors/line1","Broker delivered it to any subscribers (e.g., Node‑RED mqtt‑in)"])} 
            className={`px-5 py-2.5 text-sm rounded-xl font-semibold transition-all duration-200 ${testMode ? "opacity-40 cursor-not-allowed bg-gray-200 text-gray-500" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 active:scale-95"}`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Send to terminal
            </span>
          </button>
        </div>
      </div>
    );
  }

  function PanelConfigure() {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Initial Configuration</h2>
            <p className="text-sm text-gray-500">Verify broker status and monitor traffic</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Make sure the <strong className="text-blue-700">broker</strong> is up and running. Set the terminal to <strong className="text-emerald-700">MQTT</strong>.</p>
        <div className="space-y-4">
          <CommandBox disabled={testMode} label="Check broker status" cmd="systemctl status mosquitto" explain="Shows if Mosquitto is running and listening on port 1883." onSend={()=>runAndNarrate("systemctl status mosquitto",["Ask the OS for Mosquitto status","If active, clients can connect on 1883"])}/>
          <CommandBox disabled={testMode} label="Follow broker logs" cmd="journalctl -u mosquitto -f" explain="Live log tail — publishes will show up here in real-time." onSend={()=>runAndNarrate("journalctl -u mosquitto -f",["Following Mosquitto logs","Press Ctrl+C to stop (simulated)"])}/>
          <CommandBox disabled={testMode} label="Sniff CLICK telemetry" cmd="mosquitto_sub -h 127.0.0.1 -t click/# -v" explain="Subscribe to all topics under click/; -v prints topic + payload." onSend={()=>runAndNarrate("mosquitto_sub -h 127.0.0.1 -t click/# -v",["Listening to click/#","Any publish to click/... will appear here"])}/>
        </div>
      </div>
    );
  }

  function PanelSend() {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Send Data</h2>
            <p className="text-sm text-gray-500">CLICK → Node‑RED via MQTT</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Publish PLC‑like readings with <code className="font-mono bg-gray-100 px-2 py-0.5 rounded-lg text-emerald-700">mosquitto_pub</code>. Set the terminal to <strong className="text-emerald-700">MQTT</strong>.</p>
        <div className="space-y-4">
          <CommandBox disabled={testMode} label="Publish DS1 to telemetry" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/telemetry/DS1 -m 123" explain="Emulates CLICK sending DS1=123; Node‑RED mqtt‑in (click/line1/telemetry/#) would show it." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/telemetry/DS1 -m 123",["PLC publishes DS1=123","Broker routes to all subscribers","Node‑RED debug would show 123"])}/>
          <CommandBox disabled={testMode} label="Set status with retain" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/status -m RUN -r" explain="Pins the latest run state so late subscribers see it immediately." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/status -m RUN -r",["Published retained status RUN","Late subscribers get RUN instantly"])}/>
        </div>
      </div>
    );
  }

  function PanelReceive() {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4M4 12l6-6M4 12l6 6" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Receive Commands</h2>
            <p className="text-sm text-gray-500">Node‑RED → CLICK via MQTT</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Subscribe and simulate a command being sent. Set terminal to <strong className="text-emerald-700">MQTT</strong>.</p>
        <div className="space-y-4">
          <CommandBox disabled={testMode} label="Subscribe to command topics" cmd="mosquitto_sub -h 127.0.0.1 -t click/line1/cmd/# -v" explain="Wildcards let you catch all commands under cmd/." onSend={()=>runAndNarrate("mosquitto_sub -h 127.0.0.1 -t click/line1/cmd/# -v",["Listening for Node‑RED commands","Any publish under cmd/ will print here"])}/>
          <CommandBox disabled={testMode} label="Send START command" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/cmd/start -m 1" explain="Control path: Node‑RED → broker → PLC mapping sets bit/register." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/cmd/start -m 1",["Command start=1 published","Broker forwards to subscribers","PLC would set the mapped bit to 1"])}/>
        </div>
      </div>
    );
  }

  function PanelNodeRed() {
    const installCmd = "npm install -g --unsafe-perm node-red";
    const startCmd = "node-red";
    const startPortCmd = "node-red --port 1880";
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="6" cy="12" r="3" strokeWidth={2} fill="none"/>
              <circle cx="18" cy="12" r="3" strokeWidth={2} fill="none"/>
              <path strokeWidth={2} d="M9 12h6" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Node‑RED</h2>
            <p className="text-sm text-gray-500">Install & start the flow editor</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Set the terminal to <strong className="text-red-600">Node‑RED</strong>. These are the essential commands for getting started.</p>
        <div className="space-y-4">
          <CommandBox disabled={testMode} label="Install Node‑RED (global)" cmd={installCmd} explain="Installs Node‑RED globally via npm." onSend={()=>runAndNarrate(installCmd,["Installing Node‑RED globally with npm","When finished, you can run 'node-red'"])} codeClassName="bg-gradient-to-r from-gray-900 to-gray-800 text-red-300"/>
          <CommandBox disabled={testMode} label="Start Node‑RED" cmd={startCmd} explain="Launches the editor/server on port 1880 by default." onSend={()=>runAndNarrate(startCmd,["Starting Node‑RED server","Open http://127.0.0.1:1880/ in your browser"])} codeClassName="bg-gradient-to-r from-gray-900 to-gray-800 text-red-300"/>
          <CommandBox disabled={testMode} label="Start on a specific port" cmd={startPortCmd} explain="Override the port (1880 default)." onSend={()=>runAndNarrate(startPortCmd,["Starting Node‑RED on port 1880 (override)","Visit the shown URL in a browser"])} codeClassName="bg-gradient-to-r from-gray-900 to-gray-800 text-red-300"/>
        </div>
      </div>
    );
  }

  function PanelLogs() {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Live Broker Logs</h2>
            <p className="text-sm text-gray-500">Real-time MQTT traffic monitoring</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Live broker logs appear below whenever a publish occurs on the simulated MQTT broker.</p>
        <div className="rounded-2xl border-2 border-emerald-500/30 overflow-hidden shadow-xl shadow-emerald-900/10">
          <div className="bg-gradient-to-r from-[#0d2818] to-[#0a1a14] px-4 py-2 border-b border-emerald-500/30 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></span>
            <span className="text-emerald-400 text-xs font-medium">Live Feed</span>
          </div>
          <div className="font-mono text-sm bg-gradient-to-b from-[#0a1a14] to-[#050d0a] text-emerald-300 p-4 overflow-auto max-h-80">
            {logs.map((l,i)=>(<div key={i} className="whitespace-pre py-0.5">{l}</div>))}
          </div>
        </div>
      </div>
    );
  }

  function PanelTests() {
    function runQuickTests() {
      const results = [];
      // Test 1: pub/sub (single terminal)
      termRef.current?.clear(); termRef.current?.run("mosquitto_sub -h 127.0.0.1 -t test/hello -v"); termRef.current?.run("mosquitto_pub -h 127.0.0.1 -t test/hello -m \"hi\"");
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines = termRef.current?.getLines()||[]; resolve({name:"Pub/Sub", pass: lines.some(l=>l.endsWith("test/hello hi"))}); },300); }));
      // Test 2: rr
      termRef.current?.clear(); termRef.current?.run("mosquitto_rr -h 127.0.0.1 -t requests/line1/status -e replies/line1 -m get -w 3");
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines = termRef.current?.getLines()||[]; resolve({name:"RR reply", pass: lines.some(l=>l.trim()==="RUN")}); },1000); }));
      // Test 3: wildcard
      termRef.current?.clear(); termRef.current?.run("mosquitto_sub -h 127.0.0.1 -t sensors/# -v"); termRef.current?.run("mosquitto_pub -h 127.0.0.1 -t sensors/line2 -m ping");
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines = termRef.current?.getLines()||[]; resolve({name:"Wildcard #", pass: lines.some(l=>l.endsWith("sensors/line2 ping"))}); },300); }));
      // Test 4: -C
      termRef.current?.clear(); termRef.current?.run("mosquitto_sub -h 127.0.0.1 -t test/hello -v -C 1"); termRef.current?.run("mosquitto_pub -h 127.0.0.1 -t test/hello -m hi1"); termRef.current?.run("mosquitto_pub -h 127.0.0.1 -t test/hello -m hi2");
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines=termRef.current?.getLines()||[]; const pass=lines.some(l=>l.endsWith("test/hello hi1")) && !lines.some(l=>l.endsWith("test/hello hi2")) && lines.some(l=>l.includes("-C reached")); resolve({name:"-C exits", pass}); },400); }));
      // Test 5: coach
      coachRef.current?.clear(); runAndNarrate("mosquitto_pub -h 127.0.0.1 -t test/hello -m test",["You sent a message","Subscribers on test/hello will receive it"]);
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const pass=(coachRef.current?.get()||[]).length>=2; resolve({name:"Coach logs", pass}); },700); }));
      // Test 6: Auto Node‑RED context + help text
      const prevView = view; 
      setView("nodered");
      setTimeout(()=>{ termRef.current?.clear(); termRef.current?.run("help"); },50);
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines = termRef.current?.getLines()||[]; const pass = lines.some(l=>/Node-RED:|Test Mode \(Node-RED\)/.test(l)); resolve({name:"Node‑RED help context", pass}); setView(prevView); },300); }));
      // Test 7: Node‑RED install sim
      termRef.current?.clear(); termRef.current?.run("npm install -g --unsafe-perm node-red");
      results.push(new Promise((resolve)=>{ setTimeout(()=>{ const lines = termRef.current?.getLines()||[]; const pass = lines.some(l=>/installed globally/i.test(l)); resolve({name:"Node‑RED install sim", pass}); },400); }));

      Promise.all(results).then(arr=>{ const ok = arr.every(r=>r.pass); alert((ok?"✅ All tests passed\n":"❌ Some tests failed\n")+arr.map(r=>`${r.pass?"PASS":"FAIL"} — ${r.name}`).join("\n")); });
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Self‑Tests</h2>
            <p className="text-sm text-gray-500">Verify the simulation works correctly</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">Quick automated checks to prove the simulation behaves like the real MQTT tools.</p>
        <button 
          onClick={runQuickTests} 
          className="px-6 py-3 text-sm rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold shadow-lg shadow-cyan-600/30 hover:from-cyan-500 hover:to-teal-500 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run All Tests
          </span>
        </button>
      </div>
    );
  }

  function renderPanel() {
    switch (view) {
      case "overview": return <PanelOverview/>;
      case "config": return <PanelConfigure/>;
      case "send": return <PanelSend/>;
      case "receive": return <PanelReceive/>;
      case "nodered": return <PanelNodeRed/>;
      case "logs": return <PanelLogs/>;
      case "tests": return <PanelTests/>;
      default: return <PanelOverview/>;
    }
  }

  const nav = [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "config", label: "Configure", icon: "config" },
    { id: "send", label: "Send", icon: "send" },
    { id: "receive", label: "Receive", icon: "receive" },
    { id: "nodered", label: "Node‑RED", icon: "nodered" },
    { id: "logs", label: "Logs", icon: "logs" },
    { id: "tests", label: "Tests", icon: "tests" },
  ];

  // Toolbar containing the terminal selector + test toggle with improved styling
  function Toolbar() {
    return (
      <div className="rounded-2xl border-2 border-gray-200 bg-gradient-to-r from-white to-gray-50 p-4 mb-6 flex flex-wrap items-center gap-4 shadow-lg shadow-gray-100/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Terminal:</span>
          <div className="inline-flex rounded-xl border-2 border-gray-200 overflow-hidden text-sm shadow-sm">
            <button 
              onClick={()=>setActiveTerm("mqtt")} 
              className={`px-4 py-2.5 inline-flex items-center gap-2 font-medium transition-all duration-200 ${
                activeTerm==="mqtt"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <rect x="4" y="5" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="4" y="13" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M7 8h4M7 16h4" stroke="currentColor" strokeWidth="2"/>
              </svg>
              MQTT
            </button>
            <button 
              onClick={()=>setActiveTerm("nodered")} 
              className={`px-4 py-2.5 inline-flex items-center gap-2 font-medium transition-all duration-200 ${
                activeTerm==="nodered"
                  ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <circle cx="7" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="17" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M10 12h4" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Node‑RED
            </button>
          </div>
          <div className={`ml-1 text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 font-medium ${
            activeTerm==='nodered'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeTerm==='nodered' ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`}></span>
            <span>{activeTerm==='nodered' ? 'Node‑RED' : 'MQTT'} active</span>
          </div>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
            <div className="relative">
              <input 
                type="checkbox" 
                checked={testMode} 
                onChange={(e)=>{ setTestMode(e.target.checked); if(e.target.checked){ setShowCoach(false);} }} 
                className="peer sr-only"
              />
              <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-amber-500 transition-colors duration-200"></div>
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform duration-200"></div>
            </div>
            <span className="font-medium text-gray-700 group-hover:text-gray-900">Test Mode</span>
          </label>
          <label className={`flex items-center gap-2.5 text-sm cursor-pointer group ${testMode ? 'opacity-40' : ''}`}>
            <div className="relative">
              <input 
                type="checkbox" 
                checked={showCoach} 
                onChange={(e)=>setShowCoach(e.target.checked)} 
                disabled={testMode}
                className="peer sr-only"
              />
              <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors duration-200"></div>
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform duration-200"></div>
            </div>
            <span className="font-medium text-gray-700 group-hover:text-gray-900">Coach</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
            <div className="relative">
              <input 
                type="checkbox" 
                checked={showLogs} 
                onChange={(e)=>setShowLogs(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-purple-500 transition-colors duration-200"></div>
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform duration-200"></div>
            </div>
            <span className="font-medium text-gray-700 group-hover:text-gray-900">Logs</span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-lg shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">CLICK Config Trainer</h1>
              <p className="text-sm text-gray-500">Interactive MQTT & Node‑RED learning environment</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">MQTT</span>
            <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Node‑RED</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Toolbar/>
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          {!testMode && (
            <aside className="col-span-12 md:col-span-3 lg:col-span-2">
              <nav className="rounded-2xl border-2 border-gray-200 bg-white p-3 sticky top-24 shadow-lg shadow-gray-100/50">
                <div className="space-y-1">
                  {nav.map((n)=> (
                    <button 
                      key={n.id} 
                      onClick={()=>setView(n.id)} 
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                        view===n.id
                          ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className="text-current"><Icon name={n.icon}/></span>
                      <span>{n.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
                  Pick a section to learn
                </div>
              </nav>
            </aside>
          )}

          {/* Main Panel */}
          <section className={`${!testMode ? 'col-span-12 md:col-span-9 lg:col-span-10' : 'col-span-12'}`}>
            <div className="rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-lg shadow-gray-100/50">
              {testMode ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">Test Mode Active</h2>
                      <p className="text-sm text-gray-500">Prove what you've learned</p>
                    </div>
                  </div>
                  <p className="text-base text-gray-700 leading-relaxed">All guidance is hidden and buttons are disabled. Type commands from memory in the terminal below. Use <code className="font-mono bg-gray-100 px-2 py-0.5 rounded-lg text-amber-700">help</code> to see available tools.</p>
                </div>
              ) : (
                renderPanel()
              )}
            </div>

            {showCoach && !testMode && (
              <div className="mt-6"><CoachPanel ref={coachRef}/></div>
            )}
          </section>
        </div>

        {/* Bottom dock terminal */}
        {showTerm && (
          <div className="mt-8">
            <Terminal ref={termRef} title={`Terminal (${activeTerm === 'mqtt' ? 'MQTT CLI' : 'Node‑RED shell'})`} bindToPublishes heightClass="h-80 md:h-[28rem]" testMode={testMode} context={activeTerm}/>
          </div>
        )}

        {showLogs && (
          <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5 mt-6 shadow-lg shadow-purple-100/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Live Broker Logs</h3>
                <p className="text-xs text-gray-500">Real-time MQTT traffic</p>
              </div>
            </div>
            <div className="rounded-xl border-2 border-emerald-500/30 overflow-hidden">
              <div className="font-mono text-sm bg-gradient-to-b from-[#0a1a14] to-[#050d0a] text-emerald-300 p-4 overflow-auto max-h-56">
                {logs.map((l,i)=>(<div key={i} className="whitespace-pre py-0.5">{l}</div>))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-8 border-t border-gray-200/50 mt-8">
        <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            MQTT Terminal
          </span>
          <span className="text-gray-300">•</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Node‑RED Terminal
          </span>
          <span className="text-gray-300">•</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Test Mode
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-400">CLICK Config Trainer — Interactive learning for IoT protocols</p>
      </footer>
    </div>
  );
}
