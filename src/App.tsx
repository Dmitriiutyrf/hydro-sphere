import { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { HydraCore } from './components/HydraCore';
import { Droplet, Send, Activity, Zap, Trophy, Flame, Paperclip, X, FileText, MessageSquare, Wallet, Store, Lock, Unlock, ShoppingCart, MousePointer2, Sparkles, Clock, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type Attachment = {
  data: string;
  mimeType: string;
  name: string;
  url: string;
};

type ChatMessage = {
  role: 'user' | 'sphere';
  text: string;
  attachments?: Attachment[];
};

// Gemini Live Hook — Самый продвинутый живой голос (Gemini 3.1 Live)
const useHydraLive = (onTranscript: (text: string, role: 'user' | 'sphere') => void, setStatus: (s: {message: string, type: 'info' | 'error' | 'warning'} | null) => void) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueue = useRef<Float32Array[]>([]);
  const isPlaying = useRef(false);

  const stop = async () => {
    if (sessionRef.current) {
      try { await sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsSpeaking(false);
    setIsConnected(false);
    audioQueue.current = [];
    isPlaying.current = false;
    setStatus(null);
  };

  const playQueue = async () => {
    if (isPlaying.current || !audioContextRef.current) return;
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    isPlaying.current = true;
    setIsSpeaking(true);

    try {
      while (audioQueue.current.length > 0) {
        const chunk = audioQueue.current.shift();
        if (!chunk) break;

        const buffer = audioContextRef.current.createBuffer(1, chunk.length, 16000);
        buffer.getChannelData(0).set(chunk);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        
        if (!analyserRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        }
        
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        
        const playPromise = new Promise(resolve => {
          source.onended = resolve;
        });
        
        source.start(0);
        await playPromise;
      }
    } finally {
      isPlaying.current = false;
      setIsSpeaking(false);
      if (audioQueue.current.length > 0) {
        playQueue();
      }
    }
  };

  const connect = async (trait: string) => {
    await stop();
    setStatus({ message: "Установка связи...", type: "info" });
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setStatus({ message: "Ошибка: API ключ не найден", type: "error" });
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `Ты — Hydro Sphere, живой AI-агент. Твоя специализация: ${trait}. 
          Общайся максимально естественно. Твои ответы должны быть лаконичными (1-2 предложения). 
          Используй живые интонации. Поприветствуй пользователя коротко при подключении.`,
        },
        callbacks: {
          onopen: () => {
            console.log("Live API: Connected");
            setStatus({ message: "Связь установлена", type: "info" });
            setIsConnected(true);
            setIsRecording(true);
            setTimeout(() => {
              if (sessionRef.current) {
                sessionRef.current.sendRealtimeInput({ text: "Система активна. Я тебя слушаю." });
              }
            }, 500);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              setIsSpeaking(false);
              return;
            }

            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  try {
                    const binaryString = window.atob(part.inlineData.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    const alignedLength = bytes.length - (bytes.length % 2);
                    const int16Data = new Int16Array(bytes.buffer, 0, alignedLength / 2);
                    const float32Data = new Float32Array(int16Data.length);
                    for (let i = 0; i < int16Data.length; i++) {
                      float32Data[i] = int16Data[i] / 32768.0;
                    }
                    audioQueue.current.push(float32Data);
                    playQueue();
                  } catch (e) {
                    console.error("Audio Decode Error:", e);
                  }
                }
                if (part.text) {
                  onTranscript(part.text, 'sphere');
                }
              }
            }
          },
          onclose: () => {
            setStatus({ message: "Связь разорвана", type: "warning" });
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setStatus({ message: "Ошибка Live API", type: "error" });
            setIsConnected(false);
          },
        },
      });

      sessionRef.current = session;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      const dummyGain = audioContextRef.current.createGain();
      dummyGain.gain.value = 0;
      
      source.connect(processor);
      processor.connect(dummyGain);
      dummyGain.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        if (sessionRef.current && isConnected) {
          const inputData = e.inputBuffer.getChannelData(0);
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
          }
          
          const uint8 = new Uint8Array(int16Data.buffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64Data = btoa(binary);

          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

    } catch (error) {
      console.error("Connection Error:", error);
      setStatus({ message: "Ошибка подключения", type: "error" });
      setIsConnected(false);
    }
  };

  return { connect, stop, isSpeaking, isRecording, isConnected, analyser: analyserRef, dataArray: dataArrayRef };
};

export default function App() {
  const [message, setMessage] = useState('');
  const [sphereRarity, setSphereRarity] = useState<'Common' | 'Rare' | 'Legendary'>('Common');
  const [isInteracting, setIsInteractingState] = useState(false);
  const isInteractingRef = useRef(false);
  const setIsInteracting = (val: boolean) => {
    isInteractingRef.current = val;
    setIsInteractingState(val);
  };
  const [systemStatus, setSystemStatus] = useState<{message: string, type: 'info' | 'error' | 'warning'} | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  
  // New state for elegant top-bar modals
  const [openModal, setOpenModal] = useState<'none' | 'chat' | 'quests' | 'wallet' | 'store'>('none');
  const [isMobile, setIsMobile] = useState(false);
  
  // Economy & Wallet State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [tonBalance, setTonBalance] = useState(10); // Start with some mock TON
  
  const handleTranscript = (text: string, role: 'user' | 'sphere') => {
    setChatHistory(prev => [...prev, { role, text }]);
  };

  const { connect, stop: stopLive, isSpeaking, isRecording, isConnected, analyser, dataArray } = useHydraLive(handleTranscript, setSystemStatus);

  // Generate random trait on load
  const [agentTrait] = useState(() => {
    const traits = ['MEV Hunter', 'DeFi Oracle', 'Liquidity Sniper', 'Arbitrage Node'];
    return traits[Math.floor(Math.random() * traits.length)];
  });

  const toggleLiveSession = () => {
    if (isConnected) {
      stopLive();
    } else {
      connect(agentTrait);
    }
  };

  const connectWallet = (provider: string) => {
    const mockAddresses = {
      metamask: '0x71C...976F',
      ton: 'EQD...a1b2',
      monad: '0xMon...ad99'
    };
    setWalletAddress(mockAddresses[provider as keyof typeof mockAddresses] || '0x...');
    setOpenModal('none');
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentGenerationIdRef = useRef<number>(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, { 
          data: base64, 
          mimeType: file.type, 
          name: file.name, 
          url: reader.result as string 
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e?: React.FormEvent | string) => {
    if (e && typeof e !== 'string') {
      e.preventDefault();
    }
    
    const currentMessage = typeof e === 'string' ? e : message;
    
    // Strict guard against empty messages or concurrent processing
    if ((!currentMessage.trim() && attachments.length === 0) || isInteractingRef.current) {
      return;
    }

    // Immediately set interacting state to prevent double triggers
    setIsInteracting(true);

    const currentAttachments = [...attachments];

    // Always add user message to history for visibility and context
    setChatHistory(prev => [...prev, { role: 'user', text: currentMessage, attachments: currentAttachments }]);
    
    setMessage('');
    setAttachments([]);
    setOpenModal('none'); 
    
    const generationId = ++currentGenerationIdRef.current;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const contents: any[] = chatHistory.map(msg => {
        const msgParts: any[] = [];
        if (msg.text) msgParts.push({ text: msg.text });
        if (msg.attachments) {
          msg.attachments.forEach(att => {
            msgParts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
          });
        }
        return {
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msgParts.length > 0 ? msgParts : [{ text: ' ' }]
        };
      });

      const currentParts: any[] = [];
      if (currentMessage) currentParts.push({ text: currentMessage });
      
      currentAttachments.forEach(att => {
        currentParts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
      });
      
      contents.push({
        role: 'user',
        parts: currentParts.length > 0 ? currentParts : [{ text: ' ' }]
      });

      // Add empty message for sphere
      setChatHistory(prev => [...prev, { role: 'sphere', text: '' }]);

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          maxOutputTokens: 150,
          systemInstruction: `Ты — Hydro Sphere, живой AI-агент. Твоя специализация: ${agentTrait}. 
          Общайся естественно, как живой человек. Твои ответы должны быть лаконичными, но содержательными (1-2 предложения). 
          Никаких списков, никаких формальностей. Если тебя просто поприветствовали — ответь дружелюбно и коротко. 
          Будь живой, используй современный сленг если уместно, но не перебарщивай.
          НИКОГДА не повторяй приветствие, если диалог уже идет.`,
        }
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        if (generationId !== currentGenerationIdRef.current) break;
        
        const textChunk = chunk.text || '';
        fullText += textChunk;
        
        setChatHistory(prev => {
          const newHistory = [...prev];
          if (newHistory.length > 0) {
            newHistory[newHistory.length - 1].text = fullText;
          }
          return newHistory;
        });
      }
      
      // Text chat doesn't trigger voice in this mode to avoid conflicts with Live API
      if (fullText) {
        // Just update history, no speak() call here
      }
    } catch (error) {
      console.error(error);
      const errorMsg = 'Ошибка RPC узла Monad. Повторная попытка синхронизации...';
      setChatHistory(prev => {
        const newHistory = [...prev];
        if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'sphere' && newHistory[newHistory.length - 1].text === '') {
           newHistory[newHistory.length - 1].text = errorMsg;
        } else {
           newHistory.push({ role: 'sphere', text: errorMsg });
        }
        return newHistory;
      });
    } finally {
      if (generationId === currentGenerationIdRef.current) {
        setIsInteracting(false);
      }
    }
  };

  useEffect(() => {
    if (openModal === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, openModal]);

  const latestMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-hidden font-sans flex flex-col">
      
      {/* 3D Canvas - Base Layer (100% Fullscreen) */}
      <div className="absolute inset-0 z-0 touch-none">
        <Canvas 
          camera={{ position: [0, 0, 4.5], fov: 50 }} 
          dpr={[1, 1.5]} // Reduced max DPR for performance
          gl={{ powerPreference: "high-performance", antialias: false }} // Disable default AA since we use post-processing
        >
          <ambientLight intensity={0.5} />
          <HydraCore 
            isInteracting={isSpeaking || isRecording} 
            isSpeaking={isSpeaking}
            isRecording={isRecording}
            analyser={analyser}
            dataArray={dataArray}
          />
          <OrbitControls enableZoom={true} enablePan={false} minDistance={2} maxDistance={8} autoRotate autoRotateSpeed={0.8} />
          
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <Bloom 
              luminanceThreshold={0.5} 
              mipmapBlur 
              intensity={1.2} 
            />
          </EffectComposer>
        </Canvas>

        {/* Subtle Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#050505_120%)]"></div>
      </div>

      {/* System Status Notification */}
      <AnimatePresence>
        {systemStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`absolute top-24 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full border backdrop-blur-xl text-xs font-bold flex items-center gap-2 shadow-2xl transition-all ${
              systemStatus.type === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-200 shadow-red-500/10' : 
              systemStatus.type === 'warning' ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200 shadow-yellow-500/10' : 
              'bg-blue-500/20 border-blue-500/40 text-blue-200 shadow-blue-500/10'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {systemStatus.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar - Elegant Navigation */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-5 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-auto">
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center border border-white/20 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform group-hover:scale-105">
              <Zap className="w-6 h-6 text-white fill-white/20" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-[#050505] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
          </div>
          
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-black text-white tracking-tight">Hydra Core</h1>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest font-black bg-purple-600/30 text-purple-300 border border-purple-500/40 backdrop-blur-md">
                  {agentTrait.toUpperCase()}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest font-black border backdrop-blur-md ${
                  sphereRarity === 'Legendary' ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]' :
                  sphereRarity === 'Rare' ? 'bg-purple-500/30 border-purple-500/50 text-purple-400' :
                  'bg-blue-600/30 border-blue-500/50 text-blue-300'
                }`}>
                  {sphereRarity.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-blue-400/90 flex items-center gap-1.5 font-bold tracking-wide">
                <Activity className="w-3 h-3 stroke-[3]"/> TON
              </span>
              <span className="text-[11px] text-purple-400/90 flex items-center gap-1.5 font-bold tracking-wide">
                <Zap className="w-3 h-3 stroke-[3]"/> Monad
              </span>
            </div>
          </div>
        </div>
        
        {/* Right Side Controls */}
        <div className="flex items-center gap-3">
          
          <div className="flex items-center gap-2">
            {/* Chat Toggle */}
            <button 
              onClick={() => setOpenModal(openModal === 'chat' ? 'none' : 'chat')}
              className={`p-2.5 rounded-xl border transition-all backdrop-blur-xl flex items-center justify-center ${
                openModal === 'chat' 
                ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.4)]' 
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <MessageSquare className="w-5 h-5 text-white" />
            </button>
            
            {/* Store Toggle */}
            <button 
              onClick={() => setOpenModal(openModal === 'store' ? 'none' : 'store')}
              className={`p-2.5 rounded-xl border transition-all backdrop-blur-xl flex items-center justify-center ${
                openModal === 'store' 
                ? 'bg-purple-600 border-purple-400 shadow-[0_0_20px_rgba(147,51,234,0.4)]' 
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <Store className="w-5 h-5 text-white" />
            </button>
            
            {/* Wallet Toggle */}
            <button 
              onClick={() => setOpenModal(openModal === 'wallet' ? 'none' : 'wallet')}
              className={`px-4 py-2 rounded-xl border transition-all backdrop-blur-xl flex items-center gap-2.5 font-bold text-sm ${
                openModal === 'wallet' 
                ? 'bg-blue-600 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <Wallet className="w-4 h-4 text-white" />
              <span className="hidden lg:inline">{walletAddress || 'Connect'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Floating Modals (Side Panel on Desktop, Overlay on Mobile) */}
      <AnimatePresence>
        {openModal !== 'none' && (
          <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-20 right-4 left-4 md:left-auto md:w-[400px] bottom-24 z-30 bg-black/60 backdrop-blur-2xl border border-purple-500/30 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
              <h2 className="font-bold text-sm tracking-wide flex items-center gap-2">
                {openModal === 'chat' && <><MessageSquare className="w-4 h-4 text-purple-400"/> Terminal Log</>}
                {openModal === 'quests' && <><Trophy className="w-4 h-4 text-yellow-400"/> Network Quests</>}
                {openModal === 'wallet' && <><Wallet className="w-4 h-4 text-blue-400"/> Web3 Wallet</>}
                {openModal === 'store' && <><Store className="w-4 h-4 text-pink-400"/> Hydra Store</>}
              </h2>
              <button onClick={() => setOpenModal('none')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4 text-neutral-400 hover:text-white"/>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-purple-500/30">
              {openModal === 'wallet' && (
                <div className="flex flex-col gap-4">
                  <div className="bg-blue-900/10 border border-blue-500/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                      <Wallet className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{walletAddress ? 'Connected' : 'Connect Wallet'}</h3>
                      <p className="text-xs text-neutral-400 mt-1">
                        {walletAddress ? walletAddress : 'Link your wallet to buy Hydro tokens and interact with Hydra Core.'}
                      </p>
                    </div>
                    {walletAddress && (
                      <button onClick={() => setWalletAddress(null)} className="text-xs text-red-400 hover:text-red-300 mt-2">Disconnect</button>
                    )}
                  </div>

                  {!walletAddress && (
                    <div className="grid grid-cols-1 gap-3 mt-2">
                      <button onClick={() => connectWallet('metamask')} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
                        <span className="font-bold text-sm">MetaMask</span>
                        <span className="text-[10px] text-neutral-400">ETH / Monad</span>
                      </button>
                      <button onClick={() => connectWallet('ton')} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
                        <span className="font-bold text-sm">TON Wallet</span>
                        <span className="text-[10px] text-neutral-400">TON Network</span>
                      </button>
                      <button onClick={() => connectWallet('monad')} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
                        <span className="font-bold text-sm">Monad Native</span>
                        <span className="text-[10px] text-neutral-400">Monad L1</span>
                      </button>
                    </div>
                  )}

                  {walletAddress && (
                    <div className="mt-4">
                      <h4 className="text-xs font-bold text-neutral-400 mb-2 uppercase tracking-wider">Wallet Actions</h4>
                      <div className="grid grid-cols-1 gap-3">
                        <button onClick={() => setTonBalance(prev => prev + 10)} className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-blue-900/40 transition-colors">
                          <Activity className="w-6 h-6 text-blue-400" />
                          <span className="font-bold text-sm">10 TON</span>
                          <span className="text-[10px] text-blue-300">Top Up Mock</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {openModal === 'store' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-4 bg-purple-900/20 border border-purple-500/30 rounded-2xl">
                    <div>
                      <h3 className="font-bold text-sm text-purple-100">Hydra Upgrades</h3>
                      <p className="text-[10px] text-purple-300/70">Enhance your sphere's capabilities</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {/* Sphere Rarity Upgrades */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Sphere Rarity</h4>
                      <div className="grid grid-cols-1 gap-2">
                        <button 
                          onClick={() => setSphereRarity('Rare')}
                          disabled={sphereRarity !== 'Common'}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            sphereRarity === 'Rare' || sphereRarity === 'Legendary' ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4" />
                            <span className="text-xs font-bold">Rare Upgrade</span>
                          </div>
                          <span className="text-[10px] font-mono">{sphereRarity === 'Rare' || sphereRarity === 'Legendary' ? 'OWNED' : 'FREE'}</span>
                        </button>

                        <button 
                          onClick={() => setSphereRarity('Legendary')}
                          disabled={sphereRarity !== 'Rare'}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            sphereRarity === 'Legendary' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            <span className="text-xs font-bold">Legendary Upgrade</span>
                          </div>
                          <span className="text-[10px] font-mono">{sphereRarity === 'Legendary' ? 'OWNED' : 'FREE'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {openModal === 'chat' && (
                <div className="flex flex-col gap-4 pb-2">
                  {chatHistory.length === 0 ? (
                    <div className="text-center text-neutral-400 text-xs py-8 flex flex-col items-center gap-2 opacity-60">
                      <Activity className="w-5 h-5 text-purple-400/50" />
                      <p>Log is empty. Awaiting input...</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, i) => (
                      <div 
                        key={i}
                        className={`px-4 py-3 max-w-[90%] text-sm backdrop-blur-md shadow-lg ${
                          msg.role === 'user' 
                            ? 'bg-blue-900/20 text-blue-50 self-end ml-auto border border-blue-500/20 rounded-2xl rounded-br-sm' 
                            : 'bg-purple-900/20 text-purple-50 self-start mr-auto border border-purple-500/20 rounded-2xl rounded-bl-sm'
                        }`}
                      >
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {msg.attachments.map((att, idx) => (
                              <div key={idx} className="w-12 h-12 rounded-lg overflow-hidden bg-black/60 border border-white/10">
                                {att.mimeType.startsWith('image/') ? (
                                  <img src={att.url} alt="attachment" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center flex-col p-1">
                                    <FileText className="w-4 h-4 text-blue-300 mb-1" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.text && <p className="whitespace-pre-wrap leading-relaxed font-light">{msg.text}</p>}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
              
              {openModal === 'quests' && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-900/10 border border-purple-500/20 rounded-2xl p-4 flex flex-col items-center text-center gap-2">
                      <Flame className="w-6 h-6 text-orange-400" />
                      <h3 className="font-bold text-xs tracking-wide">Stake Hydro</h3>
                      <p className="text-[9px] text-neutral-400 font-light">Unlock MEV Alerts</p>
                      <button className="mt-1 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold transition-colors">
                        Stake (3%)
                      </button>
                    </div>
                    <div className="bg-blue-900/10 border border-blue-500/20 rounded-2xl p-4 flex flex-col items-center text-center gap-2">
                      <Trophy className="w-6 h-6 text-blue-400" />
                      <h3 className="font-bold text-xs tracking-wide">Upgrade NFT</h3>
                      <p className="text-[9px] text-neutral-400 font-light">Boost farming rate</p>
                      <button className="mt-1 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold transition-colors">
                        Mint Agent
                      </button>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <h3 className="font-bold mb-3 flex items-center gap-2 text-xs tracking-wide"><Zap className="w-3 h-3 text-yellow-400"/> Active Protocols</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                        <div>
                          <p className="text-xs font-medium">Share Alpha on TG</p>
                          <p className="text-[9px] text-neutral-400 font-light">Post scan to crypto chat</p>
                        </div>
                        <span className="text-[10px] font-bold text-blue-400">+50 HYDRO</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                        <div>
                          <p className="text-xs font-medium">Connect Monad Wallet</p>
                          <p className="text-[9px] text-neutral-400 font-light">Link for execution</p>
                        </div>
                        <span className="text-[10px] font-bold text-purple-400">+100 HYDRO</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Subtitle (Latest Message) - Only visible when modals are closed */}
      <AnimatePresence>
        {openModal === 'none' && !isInteracting && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-24 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[500px] z-10 pointer-events-none flex flex-col items-center gap-2"
          >
            {/* Voice Status Hint */}
            <button 
              onClick={toggleLiveSession}
              className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full px-5 py-2 flex items-center gap-2.5 shadow-2xl transition-all hover:border-white/20 hover:bg-white/5 cursor-pointer"
            >
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${
                isRecording ? 'bg-red-500 animate-pulse text-red-500' : 
                isSpeaking ? 'bg-green-500 animate-pulse text-green-500' : 
                'bg-blue-500 text-blue-500'
              }`} />
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white/70">
                {isRecording ? 'Live Link Active' : isSpeaking ? 'Transmitting...' : 'Initiate Live Link'}
              </span>
            </button>

            {latestMessage && (
              <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center w-full">
                <p className="text-xs font-light text-white/90 line-clamp-2">
                  <span className={`font-bold mr-2 ${latestMessage.role === 'user' ? 'text-blue-400' : 'text-purple-400'}`}>
                    {latestMessage.role === 'user' ? 'You:' : 'Agent:'}
                  </span>
                  {latestMessage.text}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Input Area - Always at the bottom */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-4 md:p-6 pointer-events-none flex flex-col items-center">
        <div className="w-full max-w-2xl pointer-events-auto flex flex-col">
          
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex gap-2 p-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl mb-2 overflow-x-auto w-max max-w-full shadow-lg">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-neutral-800 border border-white/10">
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.url} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><FileText className="w-5 h-5 text-neutral-400" /></div>
                  )}
                  <button type="button" onClick={() => removeAttachment(idx)} className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl-lg hover:bg-red-500 transition-colors">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="relative flex items-center bg-black/60 backdrop-blur-3xl border border-white/10 rounded-full p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] group hover:border-white/20 transition-all">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,.pdf,.txt"
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()} 
              className="p-3 text-neutral-500 hover:text-white transition-all rounded-full hover:bg-white/5"
              disabled={isInteracting}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Transmit data to Agent..."
              className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none font-medium tracking-tight"
              disabled={isInteracting}
            />
            
            <button 
              type="submit"
              disabled={(!message.trim() && attachments.length === 0) || isInteracting}
              className="p-3 ml-1 bg-white/5 hover:bg-white/10 disabled:bg-transparent disabled:text-neutral-700 text-white rounded-full transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
