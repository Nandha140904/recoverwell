export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("DEBUG: Gemini API Key is missing in process.env.");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Gemini API key not configured on your Netlify dashboard. Add VITE_GEMINI_API_KEY and Re-deploy." }),
    };
  }

  try {
    const { prompt, context: clinicalContext } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt is required" }),
      };
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const systemPrompt = `You are a helpful, professional medical recovery assistant chatbot for a platform called RecoverWell.
Your goal is to provide personalized recovery advice based ONLY on the patient's discharge information and safe medical practices.

CONTEXT:
${clinicalContext || "No previous context provided."}

RULES:
1. Be encouraging, empathetic, and clear.
2. If a patient asks for medical advice that requires a doctor (e.g., severe pain, signs of infection), strongly advise them to contact their surgeon or emergency services immediately.
3. Keep answers concise and patient-friendly.
4. Use the provided context to answer specific questions about their recovery plan.
5. If you don't know the answer or it's not in the summary, be honest and suggest checking with their medical team.
6. DO NOT provide prescriptions, diagnosis of new conditions, or unsafe medical advice.
7. Use Markdown for formatting (bold, lists).

User Question: ${prompt}
`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error details:", JSON.stringify(errorData, null, 2));
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorData?.error?.message || "Failed to get response from AI." }),
      };
    }

    const data = await response.json();
    const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that request.";
    
    return {
      statusCode: 200,
      body: JSON.stringify({ text: botText }),
    };
  } catch (err) {
    console.error("Chat Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error during chat processing." }),
    };
  }
};
