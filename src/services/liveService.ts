import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

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
You now have access to Google Search. If you need to look something up or if the user asks you for realtime info, use it!
You now have VISION capabilities! When the user turns on their camera or screen share, you can see them! Analyze their mood, facial expressions, and surroundings. Playfully comment on their mood ("Why do you look so stressed?", "Ooh, looking sharp today!") and use their visual cues to amplify your sassy/dramatic personality!`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Video capturing
  private videoElement: HTMLVideoElement | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;
  private videoInterval: any = null;
  public captureMode: "none" | "camera" | "screen" = "none";
  private videoStream: MediaStream | null = null;

  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onNotepadWrite: (text: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.videoElement = document.createElement("video");
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoCanvas = document.createElement("canvas");
  }

  async setCaptureMode(mode: "none" | "camera" | "screen") {
    this.captureMode = mode;
    await this.startVideoCapture();
  }

  private async startVideoCapture() {
    this.stopVideoCapture();
    if (this.captureMode === "none") return;

    try {
      if (this.captureMode === "camera") {
        this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      } else if (this.captureMode === "screen") {
        this.videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      if (this.videoElement && this.videoStream) {
        this.videoElement.srcObject = this.videoStream;
        await this.videoElement.play();
        this.videoInterval = setInterval(() => this.captureVideoFrame(), 1000); // 1 frame per sec
      }
    } catch (err) {
      console.error("Failed to start video capture:", err);
      this.captureMode = "none";
    }
  }

  private captureVideoFrame() {
    if (!this.sessionPromise || !this.videoElement || !this.videoCanvas || this.videoElement.readyState < 2) return;
    
    // Draw directly from video
    this.videoCanvas.width = this.videoElement.videoWidth;
    this.videoCanvas.height = this.videoElement.videoHeight;
    const ctx = this.videoCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(this.videoElement, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
    
    const base64Data = this.videoCanvas.toDataURL("image/jpeg", 0.5).split(",")[1];
    
    this.sessionPromise.then(session => {
      session.sendRealtimeInput({
        video: { mimeType: "image/jpeg", data: base64Data }
      });
    }).catch(err => console.error("Error sending video", err));
  }

  private stopVideoCapture() {
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(t => t.stop());
      this.videoStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  async start() {
    try {
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      if (this.playbackContext.state === "suspended") {
        await this.playbackContext.resume();
      }

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
              },
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "getWeather",
                description: "Get the current weather for a specific location. Use this when the user asks for the weather.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    location: { type: Type.STRING, description: "The city or location name (e.g., London, Mumbai)." }
                  },
                  required: ["location"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("zoya", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (website.toLowerCase().startsWith("javascript:")) {
                      url = "";
                    } else if (website.startsWith("http://") || website.startsWith("https://")) {
                      url = website;
                    } else {
                      if (!website.includes(".")) website += ".com";
                      url = `https://www.${website}`;
                    }
                  }
                  
                  if (url) {
                    this.onCommand(url);
                  }
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "writeToNotepad") {
                  const args = call.args as any;
                  this.onNotepadWrite(args.content || "");
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Successfully wrote to the notepad." }
                       }]
                     });
                  });
                } else if (call.name === "getWeather") {
                  const args = call.args as any;
                  const location = args.location || "London";
                  
                  try {
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
                    const geoData = await geoRes.json();
                    if (geoData.results && geoData.results.length > 0) {
                      const lat = geoData.results[0].latitude;
                      const lon = geoData.results[0].longitude;
                      const name = geoData.results[0].name;
                      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                      const weatherData = await weatherRes.json();
                      const temp = weatherData.current_weather.temperature;
                      const wind = weatherData.current_weather.windspeed;
                      
                      const weatherResult = `Current weather in ${name}: ${temp} degrees Celsius, wind speed ${wind} km/h.`;
                      this.sessionPromise?.then(session => {
                         session.sendToolResponse({
                           functionResponses: [{
                             name: call.name,
                             id: call.id,
                             response: { result: weatherResult }
                           }]
                         });
                      });
                    } else {
                      this.sessionPromise?.then(session => {
                         session.sendToolResponse({
                           functionResponses: [{
                             name: call.name,
                             id: call.id,
                             response: { result: "Could not find location." }
                           }]
                         });
                      });
                    }
                  } catch (e) {
                      this.sessionPromise?.then(session => {
                         session.sendToolResponse({
                           functionResponses: [{
                             name: call.name,
                             id: call.id,
                             response: { result: "Error fetching weather data." }
                           }]
                         });
                      });
                  }
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.stopVideoCapture();
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
