import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

/*
  MQTT CLI Trainer — Page 1 (Bottom Dock Terminal + Test Mode)

  Key features:
  - "Test my knowledge" mode: hides guidance, disables Send buttons, Coach off; terminal still works.
  - Bottom‑docked single terminal with color‑coded context (MQTT = green, Node‑RED = red).
  - Auto‑swap terminal context when selecting the Node‑RED page.
  - Only MQTT & Node‑RED commands (no PLC prompt).
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

// Terminal component (single, color‑coded)
const Terminal = forwardRef(function Terminal({ title, bindToPublishes, heightClass = "h-72 md:h-96", testMode = false, context = "mqtt" }, ref) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState([]);
  const [subs, setSubs] = useState([]); // {filter, verbose, countMax}
  const scrollRef = useRef(null);

  // Theme by context (MQTT = green, Node-RED = red)
  const theme = context === 'nodered'
    ? { border: 'border-red-500/30', bg: 'bg-[#1a0000]', headerBg: 'bg-[#2b0000]', text: 'text-red-200', accent: 'text-red-300', dot: 'bg-red-500', inputBorder: 'border-red-500/40', placeholder: 'placeholder:text-red-400', ring: 'focus:ring-red-500/40', btn: 'bg-red-600' }
    : { border: 'border-emerald-500/30', bg: 'bg-black', headerBg: 'bg-[#001a12]', text: 'text-emerald-300', accent: 'text-emerald-400', dot: 'bg-emerald-500', inputBorder: 'border-emerald-500/40', placeholder: 'placeholder:text-emerald-600', ring: 'focus:ring-emerald-500/40', btn: 'bg-emerald-600' };

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
    <div className={`rounded-xl border ${theme.border} ${theme.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${theme.border} ${theme.headerBg}`}>
        <div className={`text-[11px] font-semibold ${theme.text}`}>{title}</div>
        <div className={`flex items-center gap-1 ${theme.accent}`}><span className={`w-2 h-2 rounded-full ${theme.dot}`}/><span className="text-[10px]">connected</span></div>
      </div>
      <div ref={scrollRef} className={`${heightClass} overflow-auto font-mono text-[12px] ${theme.bg} ${theme.text} p-3`}>
        {lines.length === 0 ? <div className={`${context==='nodered'?'text-red-300':'text-emerald-600'}`}>Type <span className={`${context==='nodered'?'text-red-200':'text-emerald-400'}`}>help</span> or run a command.</div> : lines.map((ln, i) => (<div key={i} className="whitespace-pre-wrap">{ln}</div>))}
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 border-t ${theme.border} ${theme.headerBg}`}>
        <span className={`font-mono text-[10px] ${context==='nodered'?'text-red-400':'text-emerald-500'}`}>$</span>
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter"){ const v=input; setInput(""); handleCommand(v);} }} placeholder={context === 'nodered' ? "Type a Node‑RED command (e.g., node-red) and press Enter" : "Type an MQTT command (e.g., mosquitto_pub ...) and press Enter"} className={`flex-1 ${theme.bg} ${theme.text} ${theme.placeholder} rounded border ${theme.inputBorder} px-2 py-1 text-xs focus:outline-none focus:ring-2 ${theme.ring}`}/>
        <button onClick={()=>{ const v=input; setInput(""); handleCommand(v); }} className={`px-2 py-1 text-[11px] rounded ${theme.btn} text-black font-semibold`}>Run</button>
      </div>
    </div>
  );
});

// Coach (Play‑by‑Play) panel
const CoachPanel = forwardRef(function CoachPanel(_, ref) {
  const [notes, setNotes] = useState([]);
  function add(line) { const stamp = formatTime(); setNotes((prev)=>[...prev, `${stamp} — ${line}`]); }
  function clear() { setNotes([]); }
  useImperativeHandle(ref, () => ({ add, clear, get: () => [...notes] }));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Play‑by‑Play (plain English)</h3><button onClick={clear} className="px-2 py-1 text-[11px] rounded border">Clear</button></div>
      <ol className="text-[13px] text-gray-800 space-y-2 list-decimal pl-5 max-h-64 overflow-auto">
        {notes.length === 0 ? (<div className="text-xs text-gray-500">Run a guided command to see step‑by‑step explanations here.</div>) : notes.map((n,i)=>(<li key={i} className="whitespace-pre-wrap">{n}</li>))}
      </ol>
    </div>
  );
});

// Sidebar Nav Icon
function Icon({ name }) {
  const common = "w-4 h-4";
  switch (name) {
    case "overview": return (<svg viewBox="0 0 24 24" className={common}><path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>);
    case "config": return (<svg viewBox="0 0 24 24" className={common}><path d="M12 6l2 3 3 .5-2 2 .5 3-3-.5-2 2-.5-3-3-.5 2-2L9 6z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>);
    case "send": return (<svg viewBox="0 0 24 24" className={common}><path d="M4 12h13M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>);
    case "receive": return (<svg viewBox="0 0 24 24" className={common}><path d="M20 12H7M11 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>);
    case "nodered": return (<svg viewBox="0 0 24 24" className={common}><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="18" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M9 12h6" stroke="currentColor" strokeWidth="2"/></svg>);
    case "logs": return (<svg viewBox="0 0 24 24" className={common}><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2"/></svg>);
    case "tests": return (<svg viewBox="0 0 24 24" className={common}><path d="M9 11l2 2 4-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/></svg>);
    default: return null;
  }
}

// Command card used in panels (single send)
function CommandBox({ label, cmd, onSend, explain, disabled, codeClassName }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{label}</div>
          {explain && <div className="text-xs text-gray-600 mt-1">{explain}</div>}
        </div>
        <div className="flex gap-2 shrink-0">
          {onSend && (
            <button disabled={disabled} onClick={onSend} className={`px-2 py-1 text-xs rounded border ${disabled?"opacity-40 cursor-not-allowed":"hover:bg-gray-50"}`}>
              Send to terminal
            </button>
          )}
        </div>
      </div>
      <pre className={`mt-2 rounded-lg p-3 text-xs overflow-x-auto ${codeClassName || 'bg-black text-emerald-300'}`}><code>{cmd}</code></pre>
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

  // ===== Panels =====
  function PanelOverview() {
    const exampleJsonCmd = `mosquitto_pub -h 127.0.0.1 -t sensors/line1 -m '{"temp":22.8,"hum":41}'`;
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm text-gray-700">We practice only the tools you asked for: <strong>MQTT CLI</strong> (mosquitto_pub/sub/rr) and <strong>Node‑RED</strong> (install + start). Use the menu to focus on one area at a time. The terminal is <em>single</em> and color‑coded. Pick which context you want from the toolbar, then send commands from the cards.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-xl border p-3 bg-white"><div className="text-sm font-medium mb-1">Configure</div><div className="text-xs text-gray-600">Check Mosquitto + follow logs.</div></div>
          <div className="rounded-xl border p-3 bg-white"><div className="text-sm font-medium mb-1">Send/Receive</div><div className="text-xs text-gray-600">Publish DS1; subscribe to commands.</div></div>
          <div className="rounded-xl border p-3 bg-white"><div className="text-sm font-medium mb-1">Node‑RED</div><div className="text-xs text-gray-600">Install & start the editor/server.</div></div>
        </div>
        <div className="rounded-xl border p-3 bg-white">
          <div className="text-sm font-medium mb-1">Try a quick publish</div>
          <div className="text-xs text-gray-600 mb-2">Publishes a JSON reading. Make sure the terminal is set to <strong>MQTT</strong> (toolbar below).</div>
          <button disabled={testMode} onClick={() => runAndNarrate(exampleJsonCmd, ["You published a JSON payload on sensors/line1","Broker delivered it to any subscribers (e.g., Node‑RED mqtt‑in)"])} className={`px-3 py-2 text-xs rounded-lg border ${testMode?"opacity-40 cursor-not-allowed":""}`}>Send to terminal</button>
        </div>
      </div>
    );
  }

  function PanelConfigure() {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Initial configuration (broker ready)</h2>
        <p className="text-sm text-gray-700">Make sure the <strong>broker</strong> is up and that we can see traffic. Set the terminal to <strong>MQTT</strong>.</p>
        <div className="space-y-2">
          <CommandBox disabled={testMode} label="Check broker status" cmd="systemctl status mosquitto" explain="Shows if Mosquitto is running and listening on 1883." onSend={()=>runAndNarrate("systemctl status mosquitto",["Ask the OS for Mosquitto status","If active, clients can connect on 1883"])}/>
          <CommandBox disabled={testMode} label="Follow broker logs" cmd="journalctl -u mosquitto -f" explain="Live log tail — publishes will show up here." onSend={()=>runAndNarrate("journalctl -u mosquitto -f",["Following Mosquitto logs","Press Ctrl+C to stop (simulated)"])}/>
          <CommandBox disabled={testMode} label="Sniff click telemetry" cmd="mosquitto_sub -h 127.0.0.1 -t click/# -v" explain="Subscribe to all topics under click/; -v prints topic + payload." onSend={()=>runAndNarrate("mosquitto_sub -h 127.0.0.1 -t click/# -v",["Listening to click/#","Any publish to click/... will appear here"])}/>
        </div>
      </div>
    );
  }

  function PanelSend() {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Send data (CLICK → Node‑RED via MQTT)</h2>
        <p className="text-sm text-gray-700">Publish PLC‑like readings with <code className="font-mono">mosquitto_pub</code>. Set the terminal to <strong>MQTT</strong>.</p>
        <div className="space-y-2">
          <CommandBox disabled={testMode} label="Publish DS1 to telemetry" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/telemetry/DS1 -m 123" explain="Emulates CLICK sending DS1=123; Node‑RED mqtt‑in (click/line1/telemetry/#) would show it." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/telemetry/DS1 -m 123",["PLC publishes DS1=123","Broker routes to all subscribers","Node‑RED debug would show 123"])}/>
          <CommandBox disabled={testMode} label="Set status with retain" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/status -m RUN -r" explain="Pins the latest run state so late subscribers see it immediately." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/status -m RUN -r",["Published retained status RUN","Late subscribers get RUN instantly"])}/>
        </div>
      </div>
    );
  }

  function PanelReceive() {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Receive commands (Node‑RED → CLICK via MQTT)</h2>
        <p className="text-sm text-gray-700">Subscribe and simulate a command being sent. Set terminal to <strong>MQTT</strong>.</p>
        <div className="space-y-2">
          <CommandBox disabled={testMode} label="Subscribe to command topics" cmd="mosquitto_sub -h 127.0.0.1 -t click/line1/cmd/# -v" explain="Wildcards let you catch all commands under cmd/." onSend={()=>runAndNarrate("mosquitto_sub -h 127.0.0.1 -t click/line1/cmd/# -v",["Listening for Node‑RED commands","Any publish under cmd/ will print here"])}/>
          <CommandBox disabled={testMode} label="Send START" cmd="mosquitto_pub -h 127.0.0.1 -t click/line1/cmd/start -m 1" explain="Control path: Node‑RED → broker → PLC mapping sets bit/register." onSend={()=>runAndNarrate("mosquitto_pub -h 127.0.0.1 -t click/line1/cmd/start -m 1",["Command start=1 published","Broker forwards to subscribers","PLC would set the mapped bit to 1"])}/>
        </div>
      </div>
    );
  }

  function PanelNodeRed() {
    const installCmd = "npm install -g --unsafe-perm node-red";
    const startCmd = "node-red";
    const startPortCmd = "node-red --port 1880";
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Node‑RED (install & start)</h2>
        <p className="text-sm text-gray-700">Set the terminal to <strong>Node‑RED</strong>. These are the only commands included here as requested.</p>
        <div className="space-y-2">
          <CommandBox disabled={testMode} label="Install Node‑RED (global)" cmd={installCmd} explain="Installs Node‑RED globally via npm." onSend={()=>runAndNarrate(installCmd,["Installing Node‑RED globally with npm","When finished, you can run 'node-red'"])} codeClassName="bg-black text-red-300"/>
          <CommandBox disabled={testMode} label="Start Node‑RED" cmd={startCmd} explain="Launches the editor/server on port 1880 by default." onSend={()=>runAndNarrate(startCmd,["Starting Node‑RED server","Open http://127.0.0.1:1880/ in your browser"])} codeClassName="bg-black text-red-300"/>
          <CommandBox disabled={testMode} label="Start on a specific port" cmd={startPortCmd} explain="Override the port (1880 default)." onSend={()=>runAndNarrate(startPortCmd,["Starting Node‑RED on port 1880 (override)","Visit the shown URL in a browser"])} codeClassName="bg-black text-red-300"/>
        </div>
      </div>
    );
  }

  function PanelLogs() {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Logs</h2>
        <p className="text-sm text-gray-700">Live broker logs appear below whenever a publish occurs.</p>
        <div className="font-mono text-sm bg-black text-emerald-300 rounded-xl p-3 overflow-auto max-h-80">
          {logs.map((l,i)=>(<div key={i} className="whitespace-pre">{l}</div>))}
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
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Self‑tests</h2>
        <p className="text-sm text-gray-700">Quick checks to prove the simulation behaves like the real tools.</p>
        <button onClick={runQuickTests} className="px-3 py-2 text-xs rounded-lg bg-emerald-600 text-black font-semibold">Run tests</button>
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

  // Toolbar containing the terminal selector + test toggle
  function Toolbar() {
    return (
      <div className="rounded-xl border bg-white p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Terminal context:</span>
          <div className="inline-flex rounded-lg border overflow-hidden text-sm">
            <button onClick={()=>setActiveTerm("mqtt")} className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${activeTerm==="mqtt"?"bg-black text-emerald-300 border border-emerald-400":"bg-white"}`}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true"><path d="M3 12h4m2 0h4m2 0h4M7 8l2 2m0 4l-2 2M17 8l-2 2m0 4l2 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
              MQTT
            </button>
            <button onClick={()=>setActiveTerm("nodered")} className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${activeTerm==="nodered"?"bg-[#2b0000] text-red-300 border border-red-400":"bg-white"}`}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true"><circle cx="7" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="17" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M10 12h4" stroke="currentColor" strokeWidth="2"/></svg>
              Node‑RED
            </button>
          </div>
          <div className={`ml-2 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${activeTerm==='nodered'?'bg-red-50 text-red-600':'bg-emerald-50 text-emerald-700'}`}>
            {activeTerm==='nodered' ? (
              <>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                  <circle cx="7" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <circle cx="17" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M10 12h4" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span>Node‑RED terminal</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                  <rect x="4" y="5" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="4" y="13" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M7 8h4M7 16h4" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span>MQTT terminal</span>
              </>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 ml-auto text-sm">
          <input type="checkbox" checked={testMode} onChange={(e)=>{ setTestMode(e.target.checked); if(e.target.checked){ setShowCoach(false);} }} />
          <span>Test my knowledge</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showCoach} onChange={(e)=>setShowCoach(e.target.checked)} disabled={testMode}/> Coach
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLogs} onChange={(e)=>setShowLogs(e.target.checked)} /> Logs
        </label>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">MQTT CLI Trainer — Page 1</h1>
            <p className="text-xs text-gray-600">Menu‑driven • Single terminal (MQTT/Node‑RED) • Color‑coded terminal</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Toolbar/>
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar */}
          {!testMode && (
            <aside className="col-span-12 md:col-span-3 lg:col-span-2">
              <nav className="rounded-xl border bg-white p-2 sticky top-20">
                {nav.map((n)=> (
                  <button key={n.id} onClick={()=>setView(n.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${view===n.id?"bg-black text-white":"hover:bg-gray-50"}`}>
                    <span className="text-current"><Icon name={n.icon}/></span>
                    <span>{n.label}</span>
                  </button>
                ))}
                <div className="mt-2 border-t pt-2 text-[11px] text-gray-500">Pick a section, then use the command cards.</div>
              </nav>
            </aside>
          )}

          {/* Main Panel */}
          <section className={`${!testMode ? 'col-span-12 md:col-span-9 lg:col-span-10' : 'col-span-12'}`}>
            <div className="rounded-xl border bg-white p-4">
              {testMode ? (
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">Test Mode</h2>
                  <p className="text-sm text-gray-700">All guidance is hidden and the buttons are disabled. Type commands from memory. Use <code className="font-mono">help</code> to see available tools.</p>
                </div>
              ) : (
                renderPanel()
              )}
            </div>

            {showCoach && !testMode && (
              <div className="mt-4"><CoachPanel ref={coachRef}/></div>
            )}
          </section>
        </div>

        {/* Bottom dock terminal */}
        {showTerm && (
          <div className="mt-6">
            <Terminal ref={termRef} title={`Terminal (${activeTerm === 'mqtt' ? 'MQTT CLI' : 'Node‑RED shell'})`} bindToPublishes heightClass="h-80 md:h-[28rem]" testMode={testMode} context={activeTerm}/>
          </div>
        )}

        {showLogs && (
          <div className="rounded-xl border bg-white p-4 mt-4">
            <h3 className="text-sm font-semibold mb-2">Live broker logs</h3>
            <div className="font-mono text-xs bg-black text-emerald-300 rounded-lg p-3 overflow-auto max-h-56">
              {logs.map((l,i)=>(<div key={i} className="whitespace-pre">{l}</div>))}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-gray-500 py-4">Page 1 · Bottom Dock Terminal · Test Mode available</footer>
    </div>
  );
}
