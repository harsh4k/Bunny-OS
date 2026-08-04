/** Voice pill status lines — Claude Code spinner verbs (gerunds, no trailing …). */

export type SpinnerPhase = "thinking" | "transcribing" | "speaking";

/** Full Claude Code v2.1.42 spinner verb roster (185 words). */
export const SPINNER_PHRASES: Record<SpinnerPhase, readonly string[]> = {
  thinking: [
    "Accomplishing",
    "Actioning",
    "Actualizing",
    "Architecting",
    "Baking",
    "Beaming",
    "Beboppin'",
    "Befuddling",
    "Billowing",
    "Blanching",
    "Bloviating",
    "Boogieing",
    "Boondoggling",
    "Booping",
    "Bootstrapping",
    "Brewing",
    "Burrowing",
    "Calculating",
    "Canoodling",
    "Caramelizing",
    "Cascading",
    "Catapulting",
    "Cerebrating",
    "Channeling",
    "Channelling",
    "Choreographing",
    "Churning",
    "Clauding",
    "Coalescing",
    "Cogitating",
    "Combobulating",
    "Composing",
    "Computing",
    "Concocting",
    "Considering",
    "Contemplating",
    "Cooking",
    "Crafting",
    "Creating",
    "Crunching",
    "Crystallizing",
    "Cultivating",
    "Deciphering",
    "Deliberating",
    "Determining",
    "Dilly-dallying",
    "Discombobulating",
    "Doing",
    "Doodling",
    "Drizzling",
    "Ebbing",
    "Effecting",
    "Elucidating",
    "Embellishing",
    "Enchanting",
    "Envisioning",
    "Evaporating",
    "Fermenting",
    "Fiddle-faddling",
    "Finagling",
    "Flambéing",
    "Flibbertigibbeting",
    "Flowing",
    "Flummoxing",
    "Fluttering",
    "Forging",
    "Forming",
    "Frolicking",
    "Frosting",
    "Gallivanting",
    "Galloping",
    "Garnishing",
    "Generating",
    "Germinating",
    "Gitifying",
    "Grooving",
    "Gusting",
    "Harmonizing",
    "Hashing",
    "Hatching",
    "Herding",
    "Honking",
    "Hullaballooing",
    "Hyperspacing",
    "Ideating",
    "Imagining",
    "Improvising",
    "Incubating",
    "Inferring",
    "Infusing",
    "Ionizing",
    "Jitterbugging",
    "Julienning",
    "Kneading",
    "Leavening",
    "Levitating",
    "Lollygagging",
    "Manifesting",
    "Marinating",
    "Meandering",
    "Metamorphosing",
    "Misting",
    "Moonwalking",
    "Moseying",
    "Mulling",
    "Musing",
    "Mustering",
    "Nebulizing",
    "Nesting",
    "Newspapering",
    "Noodling",
    "Nucleating",
    "Orbiting",
    "Orchestrating",
    "Osmosing",
    "Perambulating",
    "Percolating",
    "Perusing",
    "Philosophising",
    "Photosynthesizing",
    "Pollinating",
    "Pondering",
    "Pontificating",
    "Pouncing",
    "Precipitating",
    "Prestidigitating",
    "Processing",
    "Proofing",
    "Propagating",
    "Puttering",
    "Puzzling",
    "Quantumizing",
    "Razzle-dazzling",
    "Razzmatazzing",
    "Recombobulating",
    "Reticulating",
    "Roosting",
    "Ruminating",
    "Sautéing",
    "Scampering",
    "Schlepping",
    "Scurrying",
    "Seasoning",
    "Shenaniganing",
    "Shimmying",
    "Simmering",
    "Skedaddling",
    "Sketching",
    "Slithering",
    "Smooshing",
    "Sock-hopping",
    "Spelunking",
    "Spinning",
    "Sprouting",
    "Stewing",
    "Sublimating",
    "Swirling",
    "Swooping",
    "Symbioting",
    "Synthesizing",
    "Tempering",
    "Thinking",
    "Thundering",
    "Tinkering",
    "Tomfoolering",
    "Topsy-turvying",
    "Transfiguring",
    "Transmuting",
    "Twisting",
    "Undulating",
    "Unfurling",
    "Unravelling",
    "Vibing",
    "Waddling",
    "Wandering",
    "Warping",
    "Whatchamacalliting",
    "Whirlpooling",
    "Whirring",
    "Whisking",
    "Wibbling",
    "Working",
    "Wrangling",
    "Zesting",
    "Zigzagging",
  ],
  transcribing: [
    "Capturing",
    "Decoding",
    "Deciphering",
    "Dictating",
    "Inscribing",
    "Parsing",
    "Perusing",
    "Scribing",
    "Transcribing",
    "Translating",
    "Untangling",
    "Unscrambling",
    "Unravelling",
    "Wavesurfing",
  ],
  speaking: [
    "Bloviating",
    "Elucidating",
    "Enunciating",
    "Holding forth",
    "Narrating",
    "Orating",
    "Pontificating",
    "Reciting",
    "Speaking",
    "Spinning yarns",
    "Vocalizing",
  ],
} as const;

const SPINNER_INTERVAL_MS = 3_200;

/** Fixed-seed shuffle — random feel, not A→Z walk order. */
function shufflePhrases<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SHUFFLED_PHRASES: Record<SpinnerPhase, readonly string[]> = {
  thinking: shufflePhrases(SPINNER_PHRASES.thinking, 0xc0de_001),
  transcribing: shufflePhrases(SPINNER_PHRASES.transcribing, 0xc0de_002),
  speaking: shufflePhrases(SPINNER_PHRASES.speaking, 0xc0de_003),
};

export function pickSpinnerPhrase(phase: SpinnerPhase, tick: number): string {
  const list = SHUFFLED_PHRASES[phase];
  const idx = ((tick % list.length) + list.length) % list.length;
  return list[idx];
}

export function spinnerIntervalMs(): number {
  return SPINNER_INTERVAL_MS;
}

export interface VoicePillCopy {
  title: string;
  subtitle?: string;
}

export function voicePillCopy(args: {
  voiceState: string;
  hearing: boolean;
  error: string | null;
  spinnerTick: number;
  shortError: (msg: string) => string;
}): VoicePillCopy {
  const { voiceState, error, spinnerTick, shortError } = args;

  if (error) {
    return { title: shortError(error) };
  }

  switch (voiceState) {
    case "listening":
    case "transcribing":
      return { title: pickSpinnerPhrase("transcribing", spinnerTick) };
    case "thinking":
      return { title: pickSpinnerPhrase("thinking", spinnerTick) };
    case "speaking":
      return { title: pickSpinnerPhrase("speaking", spinnerTick) };
    default:
      return { title: pickSpinnerPhrase("thinking", spinnerTick) };
  }
}
