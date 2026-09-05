/**
 * VidRush Studio - AI Director & Rush In-Editor Copilot Agent
 * 
 * 1. Director Agent: Idea-to-Script generation, fact sheet reasoning, scene beat decomposition, preflight quotes.
 * 2. Rush Agent: In-editor plain-language timeline manipulation, media replacement, caption styling, theme switching.
 * 3. Optional assistant providers: Gemini, OpenAI, or local Ollama for non-critical editor help.
 */

const AIAssistant = (() => {
  const STORAGE_KEY_OPENAI = 'scriptflow_openai_key';
  const STORAGE_KEY_GEMINI = 'scriptflow_gemini_key';
  const STORAGE_KEY_OLLAMA_URL = 'scriptflow_ollama_url';
  const STORAGE_KEY_PROVIDER = 'scriptflow_ai_provider';

  function getOpenAIKey() {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_OPENAI) || '') : '';
  }

  function setOpenAIKey(key) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_OPENAI, key.trim().replace(/^["']|["']$/g, ''));
    }
  }

  function getGeminiKey() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_GEMINI) || '';
    }
    return '';
  }

  function setGeminiKey(key) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_GEMINI, key.trim().replace(/^["']|["']$/g, ''));
    }
  }

  function getOllamaUrl() {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_OLLAMA_URL) || 'http://localhost:11434') : 'http://localhost:11434';
  }

  function setOllamaUrl(url) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_OLLAMA_URL, url.trim());
    }
  }

  function getProvider() {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_PROVIDER) || 'gemini') : 'gemini';
  }

  function setProvider(p) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PROVIDER, p);
    }
  }

  function hasLiveApiKey() {
    const p = getProvider();
    if (p === 'gemini') return !!getGeminiKey();
    if (p === 'openai') return !!getOpenAIKey();
    if (p === 'ollama') return true;
    return !!getGeminiKey() || !!getOpenAIKey();
  }

  /**
   * Director Agent: Analyzes a sentence and produces cinematography direction
   */
  async function generateSemanticVisualPlan(sceneSentence, fullScriptContext = '') {
    const prompt = `You are a literal visual-contract director for a scripted video. Analyze this narration unit:
"${sceneSentence}"

Full-script context, used only to resolve pronouns or missing named subjects:
"${String(fullScriptContext || '').slice(0, 1200)}"

Define what pixels must prove before searching. Do not search metaphors, moods, or generic themes when the narration refers to a literal person, place, object, event, process, map, comparison, or action.
Require one retrievable visual idea and one to three visible facts that a single asset can prove. Never demand several unrelated visuals in one candidate.
Return four or five distinct stock-search queries, each a two-to-seven-word noun phrase. Use exact, synonym, location-or-era, format, and broader-literal angles. Never copy the full visual description into a query.
Never use cinematic, dramatic, mystery, background, b-roll, epic, or beautiful as query filler.
Output ONLY a JSON object:
{
  "visualType": "historical-map | archival | documentary-footage | diagram | chart | portrait | object-detail | location-establishing",
  "visualRole": "map | comparison | evidence | action | explanation | location | person | object",
  "coreClaim": "literal visible claim",
  "mustShow": ["one to three facts one asset can visibly prove"],
  "mustNotShow": ["specific misleading substitute"],
  "visualIntent": "one literal sentence describing what must be visible",
  "shotType": "specific framing or visual treatment",
  "searchQueries": ["exact query", "synonym query", "location or era query", "format query", "broader literal query"],
  "directorReasoning": "why these pixels directly explain the narration",
  "candidateAcceptanceTest": "Is this media an exact visible match ...?",
  "aiVisualPrompt": "16:9 fallback prompt containing every requirement and exclusion"
}`;

    if (hasLiveApiKey()) {
      try {
        const rawJson = await callLLM(prompt, 'You output strictly valid JSON.');
        const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.searchQueries && parsed.searchQueries.length > 0) {
          return {
            visualType: parsed.visualType || 'documentary-footage',
            visualRole: parsed.visualRole || 'evidence',
            coreClaim: parsed.coreClaim || sceneSentence,
            mustShow: Array.isArray(parsed.mustShow) ? parsed.mustShow : [sceneSentence],
            mustNotShow: Array.isArray(parsed.mustNotShow) ? parsed.mustNotShow : ['an unrelated thematic substitute'],
            visualIntent: parsed.visualIntent || parsed.coreClaim || sceneSentence,
            shotType: parsed.shotType || 'Cinematic Shot',
            searchQueries: parsed.searchQueries.map((query) => String(query || '').trim()).filter(Boolean).slice(0, 5),
            directorReasoning: parsed.directorReasoning || 'Visual matches narrative beat.',
            candidateAcceptanceTest: parsed.candidateAcceptanceTest || `Is this media an exact visible match for "${sceneSentence}"?`,
            aiVisualPrompt: parsed.aiVisualPrompt || `Cinematic 8k shot --ar 16:9`
          };
        }
      } catch (e) {
        console.warn('[AIAssistant] LLM JSON parse error, using semantic matcher', e);
      }
    }

    return generateLocalSemanticPlan(sceneSentence);
  }

  function generateLocalSemanticPlan(sentence) {
    const cleanWords = sentence
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\b(the|a|an|in|on|at|to|for|of|with|and|is|are|was|were|be|been|did|know|how|why|what|when|where|who|this|that|these|those|from|into|over|after)\b/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const primarySubject = cleanWords.slice(0, 3).join(' ') || 'cinematic visual';
    const secondarySubject = cleanWords.slice(1, 4).join(' ') || primarySubject;
    const requiredSubject = primarySubject || sentence;

    return {
      visualType: 'documentary-footage',
      visualRole: 'evidence',
      coreClaim: requiredSubject,
      mustShow: [requiredSubject],
      mustNotShow: ['an unrelated subject used only for atmosphere'],
      visualIntent: `The media must visibly show ${requiredSubject}.`,
      shotType: 'Literal establishing view',
      searchQueries: [primarySubject, secondarySubject].filter(Boolean),
      directorReasoning: `The visible subject must directly support the narration rather than only match its mood.`,
      candidateAcceptanceTest: `Is this media an exact visible match for "${requiredSubject}" with no unrelated substitute?`,
      aiVisualPrompt: `Create one 16:9 visual that literally shows ${requiredSubject}; exclude unrelated atmospheric substitutes.`
    };
  }

  /**
   * Director Agent: Generate Full High-Retention Script & Fact Breakdown
   */
  async function generateDirectorScript(topic, format = 'documentary', theme = 'cinematic-documentary', targetDurationSec = 0) {
    const cleanTopic = topic.trim() || 'AI YouTube Automation & The Next Media Wave';
    const durationInstruction = Number(targetDurationSec) > 0
      ? `Target approximately ${Math.round(Number(targetDurationSec))} seconds at a natural speaking pace.`
      : 'Choose the duration needed to explain the topic properly.';

    const systemPrompt = `You are an evidence-led documentary narration writer.
${durationInstruction} Use as many sentences and paragraphs as the subject requires; there is no fixed sentence or scene count.
Rules:
1. Open with a specific question, contradiction, or consequence grounded in the supplied topic; never use empty suspense.
2. Every sentence must contain a complete claim with an explicit subject and enough context to stand alone.
3. Do not invent quotations, precise statistics, dates, studies, or named authorities.
4. Avoid metaphors that hide the literal meaning and generic phrases such as "everything changed" or "the truth is shocking".
5. Output ONLY spoken narration separated by double line breaks. No speaker tags, headings, or bullet numbers.`;

    const userPrompt = `Topic: "${cleanTopic}". Format: ${format}. Theme: ${theme}. Write the narration script.`;

    if (hasLiveApiKey()) {
      try {
        const text = await callLLM(userPrompt, systemPrompt);
        if (text && text.length > 50) return text;
      } catch (e) {
        console.warn('[AIAssistant] Live script error, using procedural fallback:', e);
      }
    }

    return `Deep inside historical archives lies a secret that historians rarely discuss.\n\nFor centuries, ancient gladiators in Rome trained not as mindless fighters, but as revered sporting titans.\n\nIn the roaring sands of the Colosseum, armored combatants risked everything for legendary glory.\n\nEvery clashing blade echoed across thousands of roaring spectators.\n\nToday, modern excavations reveal the astonishing truth behind these warriors of the arena.`;
  }

  /**
   * Rush Agent: Evaluates user chat instructions and returns natural response + action
   */
  async function processRushCommand(userPrompt, currentScriptText = '') {
    const systemPrompt = `You are Rush Agent, an elite AI Video Director assistant in ScriptFlow Studio.
You help video creators refine their YouTube documentary scripts, visual choices, durations, and themes.
Give punchy, professional, and directly actionable video editing feedback.`;

    if (hasLiveApiKey()) {
      try {
        const response = await callLLM(`User says: "${userPrompt}". Current script snippet: "${currentScriptText.slice(0, 300)}"`, systemPrompt);
        if (response) return response;
      } catch (e) {
        console.warn('[AIAssistant] Live Rush Agent call failed:', e);
      }
    }

    return `🎬 **Rush Agent:** I'm on it! I can help you adjust scene durations, rewrite narration hooks, or re-source cinematic visual footage.`;
  }

  /**
   * Unified Multi-LLM Gateway (traced Gemini backend / direct fallback / OpenAI / Ollama)
   */
  async function callLLM(prompt, systemPrompt = 'You are a helpful AI assistant.') {
    const geminiKey = getGeminiKey();
    const openaiKey = getOpenAIKey();
    const ollamaUrl = getOllamaUrl();
    const provider = getProvider();

    // 1. Traced backend Gemini gateway, with direct Gemini only as a server-unavailable fallback.
    if ((provider === 'gemini' || provider === 'auto') && geminiKey) {
      try {
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://127.0.0.1:8080';
        const backendResponse = await fetch(`${origin}/api/gemini/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt,
            prompt,
            apiKey: geminiKey,
            operation: 'Gemini assistant text'
          }),
          signal: AbortSignal.timeout(60_000)
        });
        const backendPayload = await backendResponse.json().catch(() => ({}));
        if (backendResponse.ok && backendPayload.text) return String(backendPayload.text).trim();
      } catch (error) {
        console.warn('[AIAssistant] Backend Gemini gateway unavailable, trying direct Gemini', error);
      }

      try {
        const cleanKey = geminiKey.trim().replace(/^["']|["']$/g, '');
        for (const model of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest']) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }]
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
              return data.candidates[0].content.parts[0].text.trim();
            }
          }
        }
      } catch (e) {
        console.warn('[AIAssistant] Gemini API direct fetch error, trying backend proxy', e);
      }
    }

    // 2. OpenAI API
    if ((provider === 'openai' || provider === 'auto') && openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7
          })
        });
        if (res.ok) {
          const data = await res.json();
          return data.choices[0].message.content.trim();
        }
      } catch (e) {
        console.warn('[AIAssistant] OpenAI API fetch error', e);
      }
    }

    // 3. Local Ollama LLM
    if ((provider === 'ollama' || provider === 'auto') && ollamaUrl) {
      try {
        const res = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3:latest',
            prompt: `${systemPrompt}\n\n${prompt}`,
            stream: false
          })
        });
        if (res.ok) {
          const data = await res.json();
          return data.response.trim();
        }
      } catch (e) {
        console.warn('[AIAssistant] Ollama local API error', e);
      }
    }

    const rawSubject = prompt.replace(/[^\w\s]/gi, ' ').split(/\s+/).slice(0, 4).join(' ');
    return `The untold secret behind ${rawSubject} is far more surprising than most people realize.\n\nFor years, conventional wisdom overlooked the single most critical factor driving results.\n\nRecent discoveries have revealed that subtle foundational adjustments create massive compounding advantages.\n\nBy mastering the fundamental mechanics early, you bypass the common pitfalls that hold most others back.\n\nApplying this simple technique immediately transforms your consistency and overall performance.`;
  }

  const api = {
    getOpenAIKey,
    setOpenAIKey,
    getGeminiKey,
    setGeminiKey,
    getOllamaUrl,
    setOllamaUrl,
    getProvider,
    setProvider,
    hasLiveApiKey,
    generateSemanticVisualPlan,
    generateDirectorScript,
    processRushCommand,
    callLLM
  };

  if (typeof window !== 'undefined') window.AIAssistant = api;
  if (typeof globalThis !== 'undefined') globalThis.AIAssistant = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
