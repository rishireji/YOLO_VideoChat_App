import React, { useState, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { Region, REGION_LABELS, DAILY_ALLOWANCE } from '../types';
import { Brand } from './Brand';
import { LampContainer } from './ui/lamp';
import { motion } from 'framer-motion';

interface LandingPageProps {
  onStart: () => void;
}

const CyberBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* 3D Perspective Grid - Softened for atmosphere */}
      <div className="absolute inset-0 perspective-grid opacity-[0.03]">
        <div 
          className="absolute inset-[-100%] animate-grid" 
          style={{ 
            backgroundImage: `linear-gradient(to right, #444 1px, transparent 1px), linear-gradient(to bottom, #444 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
            transform: 'rotateX(60deg)'
          }}
        ></div>
      </div>

      {/* Radar Sweep - Muted amber tone */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] max-w-[2000px] max-h-[2000px] opacity-[0.02]">
        <div 
          className="w-full h-full rounded-full animate-radar"
          style={{
            background: 'conic-gradient(from 0deg, #f59e0b 0deg, transparent 90deg)'
          }}
        ></div>
      </div>

      {/* Muted Atmospheric Glints */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-indigo-600/[0.02] rounded-full blur-[160px] animate-pulse-fast"></div>
      <div className="absolute bottom-1/4 right-1/3 w-[700px] h-[700px] bg-teal-600/[0.02] rounded-full blur-[200px] animate-pulse"></div>
      
      {/* Scanline Overlay - Extremely subtle */}
      <div className="absolute inset-0 scanline-effect opacity-[0.03]"></div>
    </div>
  );
};

const FAQItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left hover:text-amber-400 transition-colors group"
      >
        <span className="text-lg md:text-xl font-bold text-zinc-200 group-hover:text-inherit font-outfit tracking-tight">{question}</span>
        <div className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 pb-6' : 'max-h-0'}`}>
        <p className="text-zinc-400 leading-relaxed max-w-3xl text-sm md:text-base">
          {answer}
        </p>
      </div>
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const { createSession, session, isLoading } = useSession();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region>('global');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStart = () => {
    if (acceptedTerms) {
      createSession(selectedRegion);
      onStart();
    }
  };

  const faqs = [
    {
      question: "Is this video chat truly anonymous?",
      answer: "Yes. YOLO is serverless and P2P. We do not store logs, emails, or phone numbers. Your session exists only as long as your browser tab is open."
    },
    {
      question: "How does the AI moderation work?",
      answer: "A high-performance AI Safety Shield locally analyzes frames to detect vulgarity. This ensures a clean community without human moderators ever seeing your private feed."
    },
    {
      question: "Is my data stored?",
      answer: "Never. All communication is Peer-to-Peer. Once you skip or exit, the connection is purged from memory instantly."
    }
  ];

  const scrollToFaq = () => {
    const faqSection = document.getElementById('faq-section');
    faqSection?.scrollIntoView({ behavior: 'smooth' });
  };

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="relative w-full bg-[#0a0a0c]">
      <section className="relative min-h-screen pt-24 md:pt-32">
        <LampContainer>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.3,
              duration: 0.8,
              ease: "easeInOut",
            }}
            className="flex flex-col items-center text-center max-w-5xl"
          >
            <div className="inline-block px-4 py-1.5 mb-8 rounded-full border border-red-500/20 bg-red-500/5 text-red-500/80 text-[10px] font-black uppercase tracking-[0.4em] shadow-[0_0_20px_rgba(239,68,68,0.1)]">
              Matchmaking Engine Active
            </div>
            
            <Brand size="lg" className="mb-8 glitch-text md:scale-110" />
            
            <p className="text-2xl md:text-5xl font-black text-white/95 mb-12 max-w-4xl mx-auto leading-tight tracking-tighter px-6 drop-shadow-2xl">
              Global anonymous matchmaking. <br className="hidden md:block"/>
              <span className="text-zinc-500 italic font-medium text-xl md:text-3xl mt-4 block opacity-100">Witness the world, then vanish.</span>
            </p>

            <div className="w-full max-w-[420px] mx-auto bg-black/80 backdrop-blur-3xl border border-white/10 p-9 md:p-11 rounded-[56px] shadow-[0_60px_120px_rgba(0,0,0,0.95)] space-y-8 relative z-[60]">
              <div className="space-y-3 text-left">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.25em] ml-1">Relay Node</label>
                <div className="relative group">
                  <select 
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value as Region)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 text-white rounded-2xl px-6 py-4.5 text-base focus:ring-2 focus:ring-red-600 outline-none transition-all appearance-none cursor-pointer pr-12 hover:border-zinc-600 font-bold shadow-inner"
                  >
                    {Object.entries(REGION_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 text-left group cursor-pointer p-2 rounded-2xl hover:bg-white/5 transition-colors" onClick={() => setAcceptedTerms(!acceptedTerms)}>
                <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all ${acceptedTerms ? 'bg-red-600 border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'border-zinc-700 bg-zinc-900'}`}>
                  {acceptedTerms && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <label className="text-sm text-zinc-400 select-none cursor-pointer leading-relaxed group-hover:text-zinc-200 transition-colors font-semibold tracking-tight">
                  I agree to the <span className="text-red-500 font-black">Safety Compliance</span> and confirm 18+.
                </label>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleStart}
                  disabled={!acceptedTerms}
                  className={`w-full py-6 rounded-[28px] font-black text-lg transition-all transform active:scale-[0.96] flex items-center justify-center gap-4 relative overflow-hidden group/btn ${
                    acceptedTerms
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-500 hover:to-orange-500 shadow-[0_0_60px_rgba(239,68,68,0.5)]' 
                      : 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800'
                  }`}
                >
                  <span className="relative z-10">{session ? 'Reconnect Link' : 'Initialize Match'}</span>
                  <svg className="w-6 h-6 relative z-10 group-hover/btn:translate-x-1.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                  {acceptedTerms && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </LampContainer>

        <div 
          onClick={scrollToFaq}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 cursor-pointer flex flex-col items-center gap-2.5 animate-bounce opacity-40 hover:opacity-100 transition-opacity z-[70]"
        >
          <span className="text-[11px] uppercase font-black tracking-[0.4em] text-zinc-500">Protocol Specs</span>
          <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </section>

      <div className="relative">
        <CyberBackground />
        
        <section className="relative z-10 max-w-6xl mx-auto px-6 py-32 grid md:grid-cols-3 gap-10">
          {[
            { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', title: 'Zero Data Footprint', desc: 'No accounts. No logs. No history. Your presence is ephemeral by design.', color: 'amber' },
            { icon: 'M13 10V3L4 14h7v7l9-11h-7z', title: 'Real-time Translation', desc: 'Global matches supported by Gemini AI translation for seamless cross-border chat.', color: 'amber' },
            { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Automated Safety', desc: 'Proprietary vision engine scans local feeds for compliance without invading privacy.', color: 'amber' }
          ].map((feat, idx) => (
            <div key={idx} className="bg-black/30 backdrop-blur-3xl border border-white/10 p-10 md:p-12 rounded-[56px] hover:border-red-500/20 transition-all hover:-translate-y-3 group shadow-2xl relative z-10">
              <div className={`w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center mb-8 text-red-500 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(239,68,68,0.1)] border border-red-500/10`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={feat.icon}/></svg>
              </div>
              <h3 className="text-2xl font-black mb-5 text-white font-outfit uppercase tracking-tight">{feat.title}</h3>
              <p className="text-zinc-500 leading-relaxed text-sm font-semibold opacity-80">
                {feat.desc}
              </p>
            </div>
          ))}
        </section>

        <section id="faq-section" className="relative z-10 max-w-4xl mx-auto px-6 pb-32 pt-16">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-outfit font-bold text-white mb-8 uppercase tracking-tight italic">Security Protocol</h2>
            <div className="w-32 h-1.5 bg-red-600/30 mx-auto rounded-full shadow-[0_0_30px_rgba(239,68,68,0.2)]"></div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-[64px] p-10 md:p-20 backdrop-blur-3xl shadow-2xl relative z-10">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </section>
      </div>

      <footer className="py-24 border-t border-white/10 text-center relative z-10 bg-black/60 backdrop-blur-3xl">
        <p className="text-zinc-800 text-[11px] font-black uppercase tracking-[1em] animate-pulse">YOLO // SECURE_CORE_v2.5</p>
      </footer>
    </div>
  );
};