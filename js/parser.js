/**
 * ScriptFlow / VidRush Studio - Script Parser & NLP Beat Slicer
 * Splits long-form narration scripts into discrete sentence/clause beats.
 */

const Parser = (() => {
  const STOPWORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'his',
    'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'my',
    'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
    'ours', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours',
    'actually', 'also', 'know', 'just', 'make', 'makes', 'like', 'even', 'time', 'want', 'need'
  ]);

  /**
   * Split raw script into sentence/clause segments with estimated durations
   */
  function splitScript(rawText, mode = 'sentence', wpm = 145, minDuration = 3.0) {
    if (!rawText || !rawText.trim()) return [];

    let segments = [];
    if (mode === 'paragraph') {
      segments = rawText.split(/\n\s*\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
    } else if (mode === 'clause') {
      segments = rawText.split(/(?<=[.!?;\n])\s+|,\s+|—\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
    } else {
      segments = rawText.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    }

    return segments.map((text) => {
      const words = text.split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const rawDuration = wordCount / (wpm / 60);
      const duration = Math.max(minDuration, Math.round(rawDuration * 10) / 10);
      const keywords = extractKeywords(text);

      return {
        text,
        wordCount,
        duration,
        keywords
      };
    });
  }

  function extractKeywords(text) {
    const cleaned = text.toLowerCase().replace(/\[\d+:\d+\]/g, '').replace(/[^a-z\s]/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
    const candidateKeywords = [];
    const seen = new Set();

    for (const word of words) {
      if (!STOPWORDS.has(word) && !seen.has(word)) {
        seen.add(word);
        candidateKeywords.push(word);
      }
    }
    return candidateKeywords.slice(0, 5);
  }

  const api = {
    splitScript,
    extractKeywords,
    parseScriptWithAI: async (text, mode, wpm, minDuration) => splitScript(text, mode, wpm, minDuration)
  };

  if (typeof window !== 'undefined') {
    window.Parser = api;
    window.ScriptParser = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Parser = api;
    globalThis.ScriptParser = api;
  }
  if (typeof module !== 'undefined') {
    module.exports = api;
  }

  return api;
})();
