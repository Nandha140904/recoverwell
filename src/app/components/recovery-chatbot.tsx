import { useState, useRef, useEffect } from "react";
import { useRecovery } from "./store";
import { Send, Bot, User, Loader2, Sparkles, MessageSquare, X } from "lucide-react";

interface Message {
  role: "user" | "bot";
  content: string;
}

export function RecoveryChatbot() {
  const { data } = useRecovery();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      content: "Hello! I'm your Recovery Assistant. I've reviewed your discharge summary and I'm here to answer any questions you have about your diet, medications, or post-surgery care. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    // Build context from clinical data
    const medicationsList = data.medications
      .filter(m => m.isActive)
      .map(m => `- ${m.name} (${m.dosage}): ${m.frequency}`)
      .join("\n");
      
    const contextLines = [
      `Patient Name: ${data.userProfile?.name}`,
      `Surgery: ${data.surgeryType}`,
      `Surgery Date: ${data.surgeryDate}`,
      `Recovery Guidance: ${data.recoveryGuidance || "Not specified"}`,
      `Current Medications:\n${medicationsList || "None listed"}`,
    ];

    const systemPrompt = `You are a helpful, professional medical recovery assistant chatbot for a platform called RecoverWell.
Your goal is to provide personalized recovery advice based ONLY on the patient's discharge information and safe medical practices.

CONTEXT:
${contextLines.join("\n")}

RULES:
1. Be encouraging, empathetic, and clear.
2. If a patient asks for medical advice that requires a doctor (e.g., severe pain, signs of infection), strongly advise them to contact their surgeon (Dr. ${data.userProfile?.doctorName || "their doctor"}) or emergency services immediately.
3. Keep answers concise and patient-friendly.
4. Use the provided context to answer specific questions about their recovery plan.
5. If you don't know the answer or it's not in the summary, be honest and suggest checking with their medical team.
6. DO NOT provide prescriptions, diagnosis of new conditions, or unsafe medical advice.
7. Use Markdown for formatting (bold, lists).

User Question: ${userMsg}
`;

    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        }),
      });

      if (!res.ok) throw new Error("API Limit reached or error occurred.");
      
      const resData = await res.json();
      const botResponse = resData?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.";

      setMessages((prev) => [...prev, { role: "bot", content: botResponse }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "bot", content: "I encountered an error. Please check your internet connection and try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] lg:h-[600px] bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-primary/5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">AI Recovery Assistant</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <p className="text-[11px] text-muted-foreground font-medium">Online • Personalized Guidance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20"
      >
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`flex gap-2.5 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-muted" : "bg-primary text-primary-foreground"
              }`}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`rounded-2xl p-3.5 text-[13px] leading-relaxed shadow-sm ${
                msg.role === "user" 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-card border border-border text-foreground rounded-tl-none"
              }`}>
                {msg.content.split('\n').map((line, idx) => (
                  <p key={idx} className={idx > 0 ? "mt-2" : ""}>{line}</p>
                ))}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-2.5 items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-none p-3 shadow-sm">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-card border-t border-border">
        <form 
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask about your diet, exercises, or medicine..."
            className="flex-1 px-4 py-2.5 bg-muted/50 border border-border rounded-full text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-3 scale-90 opacity-70">
          AI assistant may provide general guidance. Always confirm with Dr. {data.userProfile?.doctorName || "your doctor"} for clinical decisions.
        </p>
      </div>
    </div>
  );
}
