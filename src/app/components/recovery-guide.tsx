import { useState } from "react";
import { useRecovery } from "./store";
import {
  UtensilsCrossed,
  Droplets,
  Dumbbell,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Clock,
  Heart,
  Brain,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { RecoveryChatbot } from "./recovery-chatbot";

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  items: { title: string; description: string; important?: boolean }[];
}

export function RecoveryGuide() {
  const { data } = useRecovery();
  const [activeSection, setActiveSection] = useState("chatbot");

  const sections: GuideSection[] = [
    {
      id: "chatbot",
      title: "AI Recovery Assistant",
      icon: <Sparkles className="w-5 h-5" />,
      color: "text-primary bg-primary/10",
      items: [],
    },
    {
      id: "diet",
      title: "Dietary Recommendations",
      icon: <UtensilsCrossed className="w-5 h-5" />,
      color: "text-emerald-600 bg-emerald-50",
      items: [
        {
          title: "High-Protein Foods",
          description:
            "Include lean meats, fish, eggs, Greek yogurt, and legumes. Protein is essential for tissue repair and wound healing after surgery.",
          important: true,
        },
        {
          title: "Iron-Rich Foods",
          description:
            "Your hemoglobin is slightly low. Eat spinach, red meat, fortified cereals, and beans to help restore healthy blood levels.",
          important: true,
        },
        {
          title: "Vitamin C Sources",
          description:
            "Citrus fruits, bell peppers, strawberries, and broccoli support collagen production for wound healing.",
        },
        {
          title: "Anti-Inflammatory Foods",
          description:
            "Fatty fish, walnuts, olive oil, and berries can help reduce inflammation and support recovery.",
        },
        {
          title: "Calcium & Vitamin D",
          description:
            "Dairy products, fortified foods, and sunlight exposure support bone healing after your knee surgery.",
        },
        {
          title: "Foods to Avoid",
          description:
            "Limit processed foods, excess sugar, alcohol, and high-sodium foods as they can increase inflammation and slow healing.",
          important: true,
        },
      ],
    },
    {
      id: "hydration",
      title: "Hydration Guidelines",
      icon: <Droplets className="w-5 h-5" />,
      color: "text-blue-600 bg-blue-50",
      items: [
        {
          title: "Daily Water Intake",
          description:
            "Aim for 8-10 glasses (64-80 oz) of water daily. Proper hydration supports healing, medication absorption, and prevents constipation from pain medications.",
          important: true,
        },
        {
          title: "Morning Hydration",
          description:
            "Start your day with a glass of water before breakfast. This helps kickstart your metabolism and rehydrate after sleep.",
        },
        {
          title: "Electrolyte Balance",
          description:
            "Consider electrolyte drinks if you're experiencing nausea or reduced appetite. Coconut water is a natural option.",
        },
        {
          title: "Avoid Dehydrating Drinks",
          description:
            "Limit caffeine and avoid alcohol as they can cause dehydration. Herbal teas are a good alternative.",
        },
        {
          title: "Track Your Intake",
          description:
            "Use a water bottle with measurements to track your daily intake. Set reminders every 2 hours to drink water.",
        },
      ],
    },
    {
      id: "exercise",
      title: "Exercise & Movement",
      icon: <Dumbbell className="w-5 h-5" />,
      color: "text-purple-600 bg-purple-50",
      items: [
        {
          title: "Ankle Pumps",
          description:
            "Slowly move your foot up and down at the ankle. Do 10 repetitions every hour while awake. This improves circulation and prevents blood clots.",
          important: true,
        },
        {
          title: "Quad Sets",
          description:
            "Tighten the front thigh muscle by pushing the back of your knee into the bed. Hold 5 seconds, repeat 10 times. Do 3 sets daily.",
        },
        {
          title: "Heel Slides",
          description:
            "While lying down, slowly bend your knee by sliding your heel toward your buttock. Hold 5 seconds, then straighten. 10 repetitions, 3 times daily.",
        },
        {
          title: "Assisted Walking",
          description:
            "Use your walker or crutches for short walks. Start with 5-10 minutes, 3 times daily. Gradually increase distance as tolerated.",
          important: true,
        },
        {
          title: "Seated Knee Extension",
          description:
            "Sit in a chair and slowly straighten your knee, hold for 5 seconds, then lower. 10 repetitions, 3 times daily.",
        },
        {
          title: "Important Precautions",
          description:
            "Stop if you feel sharp pain, dizziness, or excessive swelling. Do not force movements beyond comfortable range. Ice after exercise for 15-20 minutes.",
          important: true,
        },
      ],
    },
    {
      id: "wound",
      title: "Wound Care",
      icon: <ShieldCheck className="w-5 h-5" />,
      color: "text-amber-600 bg-amber-50",
      items: [
        {
          title: "Keep It Clean & Dry",
          description:
            "Keep the incision area clean and dry. Gently clean around the wound with mild soap during showering. Pat dry carefully — don't rub.",
          important: true,
        },
        {
          title: "Monitor for Infection Signs",
          description:
            "Watch for increased redness, warmth, swelling, drainage (especially yellow/green), or foul odor. Contact your doctor immediately if these occur.",
          important: true,
        },
        {
          title: "Dressing Changes",
          description:
            "Change wound dressing as instructed by your surgeon. Use clean hands and sterile supplies. Typically every 1-2 days.",
        },
        {
          title: "Avoid Submerging",
          description:
            "Do not soak the wound in baths, pools, or hot tubs until fully healed and approved by your surgeon (typically 3-4 weeks).",
        },
        {
          title: "Sun Protection",
          description:
            "Protect the scar from sun exposure for at least 12 months. Use sunscreen or cover with clothing to prevent darkening.",
        },
      ],
    },
    {
      id: "warnings",
      title: "Warning Signs",
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-red-600 bg-red-50",
      items: [
        {
          title: "Fever Above 101°F (38.3°C)",
          description:
            "A persistent fever above 101°F may indicate infection. Contact your healthcare provider immediately.",
          important: true,
        },
        {
          title: "Increased Pain or Swelling",
          description:
            "Pain that suddenly worsens or does not improve with medication, or swelling that increases significantly after the first week.",
          important: true,
        },
        {
          title: "Chest Pain or Shortness of Breath",
          description:
            "These could indicate a blood clot in the lungs (pulmonary embolism). Seek emergency medical attention immediately.",
          important: true,
        },
        {
          title: "Calf Pain or Swelling",
          description:
            "Pain, swelling, redness, or warmth in your calf may indicate a deep vein thrombosis (DVT). Contact your doctor promptly.",
          important: true,
        },
        {
          title: "Wound Changes",
          description:
            "Redness spreading from the incision, pus or unusual drainage, wound opening, or foul smell — all require medical attention.",
          important: true,
        },
      ],
    },
  ];

  if (data.recoveryGuidance) {
    sections.unshift({
      id: "ai-plan",
      title: "AI Recovery Plan",
      icon: <Brain className="w-5 h-5" />,
      color: "text-indigo-600 bg-indigo-50",
      items: [],
    });
  }

  const active = sections.find((s) => s.id === activeSection) || sections[0];

  // Recovery timeline
  const timeline = [
    {
      week: "Week 1-2",
      title: "Initial Recovery",
      description: "Focus on wound care, pain management, and gentle ankle/foot exercises.",
      status: "completed" as const,
    },
    {
      week: "Week 3-4",
      title: "Early Mobility",
      description: "Increase range of motion exercises, begin short assisted walks.",
      status: "current" as const,
    },
    {
      week: "Week 5-6",
      title: "Building Strength",
      description: "Progress to unassisted walking, start strengthening exercises.",
      status: "upcoming" as const,
    },
    {
      week: "Week 7-12",
      title: "Active Recovery",
      description: "Resume most daily activities, continue physical therapy.",
      status: "upcoming" as const,
    },
    {
      week: "Month 3-6",
      title: "Full Recovery",
      description: "Return to normal activities. Continue strengthening exercises.",
      status: "upcoming" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] text-foreground">Recovery Guide</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Personalized guidance for your {data.surgeryType.toLowerCase()} recovery
        </p>
      </div>

      {/* Recovery Timeline */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-[15px] mb-4">Recovery Timeline</h3>
        <div className="space-y-0">
          {timeline.map((stage, i) => (
            <div key={stage.week} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    stage.status === "completed"
                      ? "bg-emerald-500 text-white"
                      : stage.status === "current"
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {stage.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : stage.status === "current" ? (
                    <Heart className="w-4 h-4" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                </div>
                {i < timeline.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 min-h-8 ${
                      stage.status === "completed" ? "bg-emerald-300" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className="pb-6">
                <p className="text-[11px] text-muted-foreground">{stage.week}</p>
                <p className={`text-[14px] ${stage.status === "current" ? "text-primary" : "text-foreground"}`}>
                  {stage.title}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{stage.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Guide Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Section Nav */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left whitespace-nowrap transition-colors ${
                activeSection === section.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {section.icon}
              <span className="text-[13px]">{section.title}</span>
            </button>
          ))}
        </div>

        {/* Section Content */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active.color}`}>
              {active.icon}
            </div>
            <h3 className="text-[16px]">{active.title}</h3>
          </div>

          <div className="space-y-4">
            {active.id === "chatbot" ? (
              <RecoveryChatbot />
            ) : active.id === "ai-plan" && data.recoveryGuidance ? (
              <div className="prose prose-sm max-w-none">
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span className="text-[12px] font-medium text-indigo-600 uppercase tracking-wider">Generated from your Discharge Summary</span>
                  </div>
                  <div className="space-y-6 text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
                    {data.recoveryGuidance.split('\n').map((line, i) => {
                      if (line.startsWith('###')) {
                        return <h3 key={i} className="text-[16px] font-semibold mt-6 mb-2 text-indigo-900 border-b border-indigo-100 pb-1">{line.replace('###', '').trim()}</h3>;
                      }
                      if (line.startsWith('##')) {
                        return <h2 key={i} className="text-[18px] font-bold mt-8 mb-3 text-indigo-950">{line.replace('##', '').trim()}</h2>;
                      }
                      if (line.startsWith('-') || line.startsWith('*')) {
                        return <div key={i} className="flex gap-2 ml-1 my-1"><span className="text-indigo-400 mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" /><span>{line.substring(1).trim()}</span></div>;
                      }
                      return line.trim() ? <p key={i} className="mb-2">{line}</p> : <div key={i} className="h-2" />;
                    })}
                  </div>
                </div>
              </div>
            ) : (
              active.items.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-4 ${
                    item.important ? "bg-secondary border border-primary/10" : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[14px] text-foreground">
                        {item.title}
                        {item.important && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            Important
                          </span>
                        )}
                      </p>
                      <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
