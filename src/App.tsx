import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, Smile, Settings, X, Database, Sparkles, History, Search, Video, VideoOff, MonitorUp, MonitorOff } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import Notepad from "./components/Notepad";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [useLongTermMemory, setUseLongTermMemory] = useState<boolean>(() => {
    const saved = localStorage.getItem("zoya_long_term_memory");
    return saved ? JSON.parse(saved) : true;
  });
  
  const [autoClearDuration, setAutoClearDuration] = useState<string>(() => {
    return localStorage.getItem("zoya_auto_clear_duration") || "off";
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [dramaLevel, setDramaLevel] = useState(0);

  const [appState, setAppState] = useState<AppState>("idle");
  const [captureMode, setCaptureMode] = useState<"none" | "camera" | "screen">("none");

  // Drama/Boredom Meter tick
  useEffect(() => {
    const interval = setInterval(() => {
      setDramaLevel((prev) => {
        if (appState === "idle" && prev < 100) {
          return prev + 1; // Increases when idle (full in 100s)
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [appState]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const useMemoryStr = localStorage.getItem("zoya_long_term_memory");
    const useMemory = useMemoryStr ? JSON.parse(useMemoryStr) : true;
    
    const clearDuration = localStorage.getItem("zoya_auto_clear_duration") || "off";
    const lastInteraction = localStorage.getItem("zoya_last_interaction_timestamp");
    
    if (useMemory && clearDuration !== 'off' && lastInteraction) {
      const now = Date.now();
      const last = parseInt(lastInteraction, 10);
      let threshold = 0;
      if (clearDuration === '1h') threshold = 60 * 60 * 1000;
      if (clearDuration === '24h') threshold = 24 * 60 * 60 * 1000;
      if (clearDuration === '1w') threshold = 7 * 24 * 60 * 60 * 1000;
      
      if (now - last > threshold) {
        localStorage.removeItem("zoya_chat_history");
        return [];
      }
    }

    if (useMemory) {
      const saved = localStorage.getItem("zoya_chat_history");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse chat history", e);
        }
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    localStorage.setItem("zoya_long_term_memory", JSON.stringify(useLongTermMemory));
  }, [useLongTermMemory]);

  useEffect(() => {
    localStorage.setItem("zoya_auto_clear_duration", autoClearDuration);
  }, [autoClearDuration]);

  useEffect(() => {
    messagesRef.current = messages;
    if (useLongTermMemory) {
      // Persist the last 80 conversation turns (160 messages)
      const historyToSave = messages.slice(-160);
      localStorage.setItem("zoya_chat_history", JSON.stringify(historyToSave));
      if (messages.length > 0) {
        localStorage.setItem("zoya_last_interaction_timestamp", Date.now().toString());
      }
    } else {
      localStorage.removeItem("zoya_chat_history");
      localStorage.removeItem("zoya_last_interaction_timestamp");
    }
  }, [messages, useLongTermMemory]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [notepadContent, setNotepadContent] = useState("");
  const [showNotepad, setShowNotepad] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setDramaLevel(0); // Reset drama on interaction
    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = await processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      let historyToSend = useLongTermMemory ? messagesRef.current : [];
      let rawResponse = await getZoyaResponse(finalTranscript, historyToSend);
      
      const notepadMatch = rawResponse.match(/@@NOTEPAD:([\s\S]*?)@@/);
      if (notepadMatch) {
         setNotepadContent(notepadMatch[1]);
         setShowNotepad(true);
         responseText = rawResponse.replace(/@@NOTEPAD:[\s\S]*?@@/, "");
      } else {
         responseText = rawResponse;
      }

      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    if (dramaLevel >= 100 && appState === "idle") {
      setDramaLevel(0);
      handleTextCommand("I am literally dying of boredom! Roast me or say something dramatic!");
    }
  }, [dramaLevel, appState, handleTextCommand]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!liveSessionRef.current || !isSessionActive) {
      alert("Please start the session first to share your camera!");
      return;
    }
    const newMode = captureMode === "camera" ? "none" : "camera";
    setCaptureMode(newMode);
    await liveSessionRef.current.setCaptureMode(newMode);
  }, [captureMode, isSessionActive]);

  const toggleScreenShare = useCallback(async () => {
    if (!liveSessionRef.current || !isSessionActive) {
      alert("Please start the session first to share your screen!");
      return;
    }
    const newMode = captureMode === "screen" ? "none" : "screen";
    setCaptureMode(newMode);
    await liveSessionRef.current.setCaptureMode(newMode);
  }, [captureMode, isSessionActive]);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      setCaptureMode("none");
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };
        
        session.onNotepadWrite = (text) => {
          setNotepadContent(text);
          setShowNotepad(true);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl m-4 relative flex flex-col gap-6"
          >
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5"
            >
              <X size={20} />
            </button>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-serif font-medium text-white flex items-center gap-2">
                <Database size={20} className="text-violet-400" />
                Settings
              </h2>
              <p className="text-xs text-white/50">Manage Zoya's memory and behavior.</p>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-white">Long-term Memory</span>
                  <span className="text-xs text-white/50">Remember previous conversations across sessions.</span>
                </div>
                <button
                  onClick={() => {
                    const nextVal = !useLongTermMemory;
                    setUseLongTermMemory(nextVal);
                    if (!nextVal) {
                      setMessages([]);
                      resetZoyaSession();
                    }
                  }}
                  className={`w-12 h-6 rounded-full p-1 transition-colors relative flex items-center shrink-0 ${
                    useLongTermMemory ? "bg-violet-500" : "bg-white/20"
                  }`}
                >
                  <motion.div
                    className="w-4 h-4 bg-white rounded-full shadow-md"
                    animate={{ x: useLongTermMemory ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 transition-opacity ${!useLongTermMemory ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex flex-col gap-1 w-2/3">
                  <span className="text-sm font-medium text-white">Auto-clear History</span>
                  <span className="text-xs text-white/50">Clear past interactions after a set duration.</span>
                </div>
                <select
                  value={autoClearDuration}
                  onChange={(e) => setAutoClearDuration(e.target.value)}
                  disabled={!useLongTermMemory}
                  className="bg-[#222] text-sm text-white rounded-lg p-2 outline-none border border-white/10 shrink-0"
                >
                  <option value="off">Off</option>
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="1w">1 Week</option>
                </select>
              </div>
            </div>
            
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors"
            >
              Done
            </button>
          </motion.div>
        </div>
      )}

      {showHistory && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg h-[80vh] bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl m-4 relative flex flex-col gap-6"
          >
            <button
              onClick={() => setShowHistory(false)}
              className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5"
            >
              <X size={20} />
            </button>
            <div className="flex flex-col gap-1 shrink-0">
              <h2 className="text-xl font-serif font-medium text-white flex items-center gap-2">
                <History size={20} className="text-violet-400" />
                Conversation History
              </h2>
              <p className="text-xs text-white/50">Your past interactions with Zoya.</p>
            </div>
            
            <div className="relative shrink-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input 
                type="text" 
                placeholder="Search history..." 
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-2 custom-scrollbar">
              {messages
                .filter(msg => msg.text.toLowerCase().includes(historySearch.toLowerCase()))
                .map(msg => (
                  <div key={msg.id} className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-white/30 uppercase tracking-widest">{msg.sender === 'user' ? 'You' : 'Zoya'}</span>
                    <div className={`text-sm px-4 py-2 rounded-2xl max-w-[85%] ${
                      msg.sender === 'user' 
                        ? 'bg-violet-600 text-white rounded-tr-sm' 
                        : 'bg-white/10 text-white/90 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
              ))}
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-sm text-white/40 italic">
                  No conversation history yet.
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
      </div>

      <AnimatePresence>
        {showNotepad && (
          <Notepad 
            content={notepadContent} 
            onClose={() => setShowNotepad(false)} 
          />
        )}
      </AnimatePresence>

      {/* Drama Meter */}
      <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10 select-none pointer-events-none">
        <span 
          className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold rotate-180 text-white/50" 
          style={{ writingMode: 'vertical-rl' }}
        >
          Drama Meter
        </span>
        <div className="h-32 md:h-48 w-1.5 md:w-2 bg-white/5 rounded-full overflow-hidden flex flex-col justify-end shadow-inner border border-white/5">
          <motion.div 
            className="w-full rounded-full"
            style={{ 
              background: `linear-gradient(to top, #ec4899, #ef4444)` 
            }}
            animate={{ 
              height: `${dramaLevel}%`,
              opacity: dramaLevel > 10 ? 1 : 0.5
            }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
        </div>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-sm">
            Z
          </div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Zoya</h1>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetZoyaSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Conversation History"
          >
            <History size={18} className="opacity-70" />
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Settings"
          >
            <Settings size={18} className="opacity-70" />
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Zoya Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Zoya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}

          {isSessionActive && (
            <>
              <button
                onClick={toggleCamera}
                className={`p-4 rounded-full border transition-colors shadow-2xl ${captureMode === 'camera' ? 'bg-violet-500/20 text-violet-400 border-violet-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                title={captureMode === 'camera' ? "Stop Camera" : "Share Camera"}
              >
                {captureMode === 'camera' ? <Video size={20} /> : <VideoOff size={20} className="opacity-70" />}
              </button>
              <button
                onClick={toggleScreenShare}
                className={`p-4 rounded-full border transition-colors shadow-2xl ${captureMode === 'screen' ? 'bg-violet-500/20 text-violet-400 border-violet-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                title={captureMode === 'screen' ? "Stop Screen Share" : "Share Screen"}
              >
                {captureMode === 'screen' ? <MonitorUp size={20} /> : <MonitorOff size={20} className="opacity-70" />}
              </button>
            </>
          )}
          
          <button
            onClick={() => handleTextCommand("Tell me a funny joke!")}
            className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl group flex items-center justify-center"
            title="Tell me a joke"
          >
            <Smile size={20} className="opacity-70 group-hover:text-yellow-400 group-hover:opacity-100 transition-colors" />
          </button>
          
          <button
            onClick={() => handleTextCommand("Read my mind!")}
            className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl group flex items-center justify-center"
            title="Read my mind"
          >
            <Sparkles size={20} className="opacity-70 group-hover:text-violet-400 group-hover:opacity-100 transition-colors" />
          </button>
          
        </div>
      </footer>
    </div>
  );
}
