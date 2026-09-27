// Análisis de texto determinista: estadísticas, legibilidad, palabras clave e idioma.

const STOP = {
  es: "de la que el en y a los se del las un por con no una su para es al lo como más o pero sus le ya fue este ha sí porque esta son entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros",
  en: "the of and to a in is it you that he was for on are with as i his they be at one have this from or had by but some what there we can out other were all your when up use how said an each she which do their if will way about many then them would like so these her see him has more could go come did my no most who over know than call first may down been now find any new also after where must just",
  pt: "de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós",
  fr: "de la le et les des en un du une que est pour qui dans a par sur pas plus ne au se ce il sont avec son ou mais comme on tout nous sa leur été bien aux cette elle ses fait deux même ont ces elles donc peut tous sans",
} as const;

const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(" "))])) as Record<keyof typeof STOP, Set<string>>;

const POS = new Set("bueno buena excelente genial increíble feliz fácil rápido mejor encanta recomiendo perfecto útil good great excellent amazing awesome happy easy fast best love recommend perfect useful nice fantastic ótimo bom excelente".split(" "));
const NEG = new Set("malo mala terrible horrible lento difícil peor odio problema error falla caro inútil triste bad terrible awful horrible slow hard worst hate problem error broken expensive useless sad poor ruim péssimo".split(" "));

function syllablesEs(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouáéíóúü]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function syllablesEn(word: string): number {
  const w = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

export function analyzeText(input: string, topN = 15) {
  const text = input.slice(0, 200_000);
  const sentences = text.split(/(?<=[.!?¡¿…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
  const words = (text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []).filter((w) => /\p{L}/u.test(w));

  const langScores = Object.entries(STOPSETS)
    .map(([lang, set]) => [lang, words.filter((w) => set.has(w)).length] as const)
    .sort((a, b) => b[1] - a[1]);
  const language = langScores[0][1] > 0 ? langScores[0][0] : "unknown";
  const stop = STOPSETS[(language === "unknown" ? "en" : language) as keyof typeof STOP];

  const freq = new Map<string, number>();
  for (const w of words) if (w.length > 2 && !stop.has(w) && !/^\d+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count, density: +(count / Math.max(1, words.length) * 100).toFixed(2) }));

  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const [a, b] = [words[i], words[i + 1]];
    if (a.length > 2 && b.length > 2 && !stop.has(a) && !stop.has(b)) bigrams.set(`${a} ${b}`, (bigrams.get(`${a} ${b}`) ?? 0) + 1);
  }
  const phrases = [...bigrams.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([phrase, count]) => ({ phrase, count }));

  const syl = words.reduce((s, w) => s + (language === "en" ? syllablesEn(w) : syllablesEs(w)), 0);
  const wps = words.length / Math.max(1, sentences.length);
  const spw = syl / Math.max(1, words.length);
  // Fernández-Huerta para español/portugués/francés (aprox.), Flesch Reading Ease para inglés.
  const readability = language === "en" ? 206.835 - 1.015 * wps - 84.6 * spw : 206.84 - 60 * spw - 1.02 * wps;
  const r = Math.max(0, Math.min(100, readability));

  const pos = words.filter((w) => POS.has(w)).length;
  const neg = words.filter((w) => NEG.has(w)).length;
  const sentimentScore = pos + neg === 0 ? 0 : +((pos - neg) / (pos + neg)).toFixed(2);

  return {
    language,
    stats: {
      characters: text.length,
      words: words.length,
      uniqueWords: new Set(words).size,
      sentences: sentences.length,
      paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
      avgWordsPerSentence: +wps.toFixed(1),
      readingTimeMin: Math.max(1, Math.round(words.length / 230)),
    },
    readability: {
      score: +r.toFixed(1),
      formula: language === "en" ? "flesch-reading-ease" : "fernandez-huerta",
      level: r >= 80 ? "muy fácil" : r >= 65 ? "fácil" : r >= 50 ? "normal" : r >= 30 ? "difícil" : "muy difícil",
    },
    sentiment: {
      score: sentimentScore,
      label: sentimentScore > 0.2 ? "positive" : sentimentScore < -0.2 ? "negative" : "neutral",
      positiveHits: pos,
      negativeHits: neg,
    },
    keywords,
    keyPhrases: phrases,
  };
}
