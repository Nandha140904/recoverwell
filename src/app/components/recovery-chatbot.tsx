import { useState, useRef, useEffect } from "react";
import { useRecovery, type ChatMessage } from "./store";
import { Send, Bot, User, Loader2, Sparkles, MessageSquare, X } from "lucide-react";

export function RecoveryChatbot() {
  const { data, addChatMessage } = useRecovery();
  
  // Local state for the UI, initialized from global store if available
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const existing = data.chatMessages || [];
    if (existing.length > 0) {
      return existing;
    }
    const hasSummary = !!data.recoveryGuidance || data.documents.some(d => d.status === "analyzed");
    return [
      {
        role: "bot",
        content: hasSummary 
          ? `Hello! I'm your Recovery Assistant. I've analyzed your medical records for ${data.surgeryType || "your recovery"}. How can I help you today?`
          : "Hello! I'm your AI Recovery Assistant. Once you upload your discharge summary or lab reports, I can provide personalized guidance about your recovery. How can I help you today?",
      },
    ];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync local view with global data if global changes (e.g. from cloud pull)
  useEffect(() => {
    const cloudMsgs = data.chatMessages || [];
    if (cloudMsgs.length > 0) {
      setMessages(cloudMsgs);
    }
  }, [data.chatMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const saveMessageToCloud = async (msg: ChatMessage) => {
    if (!data.userProfile?.mobile || !data.userProfile?.passwordHash) return;
    
    try {
      await fetch("/api/chat/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: data.userProfile.mobile,
          passwordHash: data.userProfile.passwordHash,
          role: msg.role,
          message: msg.content
        }),
      });
    } catch (err) {
      console.warn("Failed to persist message to cloud:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const currentInput = input.trim();
    const userMsg: ChatMessage = { role: "user", content: currentInput };
    
    setInput("");
    setMessages((prev: ChatMessage[]) => [...prev, userMsg]);
    addChatMessage(userMsg);
    saveMessageToCloud(userMsg);
    
    setLoading(true);

    // Build context from clinical data
    const medicationsList = data.medications
      .filter(m => m.isActive)
      .map(m => `- ${m.name} (${m.dosage}): ${m.frequency}`)
      .join("\n");

    // Include analyzed documents summary
    const docsContext = data.documents
      .filter(doc => doc.status === "analyzed")
      .map(doc => `--- DOCUMENT: ${doc.name} (${doc.type}) ---\n${doc.simplifiedExplanation}\nKey Findings: ${doc.keyFindings.join(", ")}`)
      .join("\n\n");
      
    const context = [
      `Patient Name: ${data.userProfile?.name || "Unknown"}`,
      data.surgeryType && data.surgeryType !== "Post-Surgery Recovery" ? `Primary Diagnosis: ${data.surgeryType}` : null,
      data.surgeryDate ? `Procedure Date: ${data.surgeryDate}` : null,
      data.recoveryGuidance ? `General Recovery Guidance: ${data.recoveryGuidance}` : null,
      medicationsList ? `Current Medications:\n${medicationsList}` : null,
      docsContext ? `Medical Records & Detailed Analysis:\n${docsContext}` : null,
    ].filter(Boolean).join("\n\n");

    const systemPrompt = `You are an expert Medical Recovery Assistant. You provide personalized guidance based on the patient's REAL medical documents and data provided below. 

INSTRUCTIONS:
- Use the "Medical Records & Analysis" section to answer questions specifically about their discharge summary, lab reports, or surgeries.
- If the user asks about something mentioned in their reports, refer to it precisely.
- Avoid giving dangerous unverified medical advice, and refer to their doctor if unsure. 
- Keep your answers brief, empathetic, and formatted in Markdown.
    
PATIENT CONTEXT:
${context}`;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: ChatMessage) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: currentInput }
    ];

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: apiMessages
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "The AI assistant is temporarily unavailable.");
      }
      
      const resData = await res.json();
      const botReply = resData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";
      const botMsg: ChatMessage = { role: "bot", content: botReply };
      
      setMessages((prev: ChatMessage[]) => [...prev, botMsg]);
      addChatMessage(botMsg);
      saveMessageToCloud(botMsg);
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = { 
        role: "bot", 
        content: `**Error:** ${err.message}. Please try again later or contact support if the issue persists.` 
      };
      setMessages((prev: ChatMessage[]) => [...prev, errorMsg]);
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
        {messages.map((msg: ChatMessage, i: number) => (
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
                {msg.content.split('\n').map((line: string, idx: number) => (
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
