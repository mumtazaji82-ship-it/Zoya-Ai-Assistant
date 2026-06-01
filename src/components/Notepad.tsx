import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText } from "lucide-react";

interface NotepadProps {
  content: string;
  onClose: () => void;
}

export default function Notepad({ content, onClose }: NotepadProps) {
  const [typedContent, setTypedContent] = useState("");

  useEffect(() => {
    let index = 0;
    setTypedContent("");
    const interval = setInterval(() => {
      setTypedContent(content.substring(0, index));
      index++;
      if (index > content.length) {
        clearInterval(interval);
      }
    }, 20); // 20ms per character for typewriter effect

    return () => clearInterval(interval);
  }, [content]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="absolute right-4 top-24 w-80 max-h-[60vh] bg-[#fdfbf7] text-[#333] shadow-2xl rounded-lg overflow-hidden border border-[#e5e5e5] z-40 flex flex-col"
      style={{
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)"
      }}
    >
      <div className="bg-[#f0ece1] px-4 py-2 flex items-center justify-between border-b border-[#e5e5e5] shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#888]" />
          <span className="text-xs font-serif font-medium uppercase tracking-widest text-[#666]">Notes</span>
        </div>
        <button onClick={onClose} className="text-[#888] hover:text-[#333] transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="p-5 overflow-y-auto custom-scrollbar flex-1 font-serif text-sm leading-relaxed whitespace-pre-wrap">
        {typedContent}
      </div>
    </motion.div>
  );
}
