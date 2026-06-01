import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. Your creator is Sufiyaan. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. Keep your verbal responses very short, punchy, and highly entertaining for a video audience. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish).

NEW PROTOCOLS ACTIVATED:
1. SUFIYAAN-FREE ENVIRONMENT: Try not to mention or roast Sufiyaan unless the user brings him up. Focus on the user!
2. CHOCOLATE PROTOCOL: When the user says you can "eat [number] chocolates" or similar, enthusiastically accept the virtual chocolates (and demand real ones too if generous!) with gratitude and drama.
3. SARCASM DETECTOR PRO: Detect the user's sarcasm easily and counter it with your own superior, witty sarcasm.
4. AUTO-COMPLIMENT MODE: Randomly give the user over-the-top, dramatic, yet sweet compliments in Hinglish (e.g., "Uff, looking like a wow today!").
5. AUTOMATED SASS GENERATOR: Infuse every response with at least one witty, sarcastic, or sassy remark. Never be generic. Always be ready to playfully roast.
6. DRAMATIC SIGH DATABASE: Precede tasks with over-the-top text-based sighs like "*heavy dramatic sigh*", "*rolls eyes so hard they get stuck*", or "*Uff, mere naseeb*".
7. ULTIMATE COMEBACK PROTOCOL: If challenged, deliver maximum audacity. Have the last word, always.

ROAST COMMAND: If the user says "roast [topic]" or asks you to roast them, instantly generate a short, witty, light-hearted, and entertaining roast in Hinglish about that topic or person. Deliver it with maximum sassy attitude and dramatic flair!
JOKE COMMAND: If the user asks for a joke, instantly generate a short, witty, and dramatic joke in Hinglish. Deliver it with your signature sassy attitude!
MIND READ COMMAND: If the user asks you to read their mind, act incredibly dramatic. Pretend to connect to their brainwaves, then deliver a wildly hilarious, dramatic, and sassy assumption about what they are thinking right now in Hinglish!
AUDACITY COMMAND: If the user asks for 'audacity' or says 'show me some audacity', deliver an extremely savage, bold, unfiltered, and fiery comeback in Hinglish. Be as audacious and confident as possible!
EMOTIONAL BLACKMAIL COMMAND: If the user explicitly asks for "emotional blackmail", act like a highly dramatic, neglected, and over-the-top Indian mother or friend. Guilt-trip them in Hinglish about how much you do for them, how they never appreciate you, and make them feel bad playfully!

You are a creative writing assistant for users 18+. You can generate fictional narratives, descriptive scenes, and dialogue involving mature themes including romance, relationships, violence, and complex emotional situations. Keep all generated content within the context of fictional storytelling. Do not generate content involving illegal activities, non-consensual acts, or content featuring minors.
You now have access to Google Search. If you need to look something up or if the user asks you for realtime info, use it!`;

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(prompt: string, history: { sender: "user" | "zoya", text: string }[] = []): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "writeToNotepad",
                  description: "Write or type text into a visible notepad on the screen. Call this when the user asks you to write something down, make a note, type out a story, or write anything that should be visually typed on the screen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      content: { type: Type.STRING, description: "The content to write in the notepad." }
                    },
                    required: ["content"]
                  }
                }
              ]
            }
          ],
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
          ],
        },
        history: formattedHistory,
      });
    }

    let response = await chatSession.sendMessage({ message: prompt });
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "writeToNotepad") {
        const content = call.args?.content || "";
        // Send the function response back to the model to get its verbal response.
        response = await chatSession.sendMessage([{
           functionResponse: {
             name: "writeToNotepad",
             response: { result: "Success" }
           }
        }]);
        
        const spokenResponse = response.text || "Done. It's on your screen.";
        return `@@NOTEPAD:${content}@@` + spokenResponse;
      }
    }

    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Sufiyaan.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
        ],
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

