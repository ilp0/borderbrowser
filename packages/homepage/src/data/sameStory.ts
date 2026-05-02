/**
 * SCAFFOLD — mock data for the /same-story page.
 *
 * The "Same story, many countries" view is the project's killer feature:
 * one major news event, shown side-by-side as covered by 6–8 sources from
 * different countries. Live ingestion (RSS + clustering + translation) is
 * a later phase; for now we render a single hard-coded story so the page
 * scaffold can be designed, reviewed, and styled independently.
 *
 * When the live pipeline lands, this file will be replaced by a typed
 * loader that returns the same `SameStory` shape from a content store.
 */

export type Source = {
  /** Outlet name in its native script. */
  name: string;
  /** Country flag emoji for quick visual identification. */
  flag: string;
  /** Country / region label (English). */
  country: string;
  /** Native-language label, e.g. "Français", "العربية". */
  language: string;
  /** BCP-47 language tag of the headline, e.g. "fr", "ja", "ar". */
  langCode: string;
  /** Headline as published, in the source's original language. */
  headline: string;
  /** Mock English translation of the headline. */
  headlineEn: string;
  /** One-sentence excerpt / dek, mock-translated to English. */
  excerpt: string;
  /** Outbound link to the article (mock — points to outlet homepage). */
  url: string;
};

export type SameStory = {
  /** Internal id, useful once we have multiple stories. */
  id: string;
  /** A short English label for the underlying event. */
  title: string;
  /** One-line synopsis in English, neutral phrasing. */
  synopsis: string;
  /** ISO timestamp the cluster was last refreshed (mock). */
  updatedAt: string;
  sources: Source[];
};

export const sameStory: SameStory = {
  id: "global-climate-summit-2026",
  title: "Global climate summit reaches contentious agreement",
  synopsis:
    "Delegates at this week's UN climate talks announced a draft accord on emissions cuts and adaptation finance — coverage diverges sharply across regions.",
  updatedAt: "2026-05-03T08:00:00Z",
  sources: [
    {
      name: "BBC News",
      flag: "🇬🇧",
      country: "United Kingdom",
      language: "English",
      langCode: "en",
      headline: "Nations strike fragile climate deal after marathon talks",
      headlineEn: "Nations strike fragile climate deal after marathon talks",
      excerpt:
        "Negotiators agreed a compromise text on fossil fuel transition language, but small island states warned the pledges fall short of what science demands.",
      url: "https://www.bbc.com/news",
    },
    {
      name: "Le Monde",
      flag: "🇫🇷",
      country: "France",
      language: "Français",
      langCode: "fr",
      headline: "Climat : un accord arraché in extremis, jugé insuffisant par les ONG",
      headlineEn: "Climate: a last-minute deal, deemed insufficient by NGOs",
      excerpt:
        "Paris welcomed the text as a step forward while environmental groups denounced concessions made to oil-producing states during the closing plenary.",
      url: "https://www.lemonde.fr/",
    },
    {
      name: "Der Spiegel",
      flag: "🇩🇪",
      country: "Germany",
      language: "Deutsch",
      langCode: "de",
      headline: "Klimagipfel: Kompromiss mit vielen Schlupflöchern",
      headlineEn: "Climate summit: a compromise riddled with loopholes",
      excerpt:
        "German commentators focused on the watered-down language around coal phase-out and the unresolved question of who pays for adaptation in the Global South.",
      url: "https://www.spiegel.de/",
    },
    {
      name: "朝日新聞",
      flag: "🇯🇵",
      country: "Japan",
      language: "日本語",
      langCode: "ja",
      headline: "気候サミット、合意成立も実効性に疑問の声",
      headlineEn: "Climate summit reaches agreement, but doubts persist over effectiveness",
      excerpt:
        "Tokyo's delegation highlighted technology-transfer commitments, while domestic editorials questioned whether the timeline matches Japan's own decarbonization path.",
      url: "https://www.asahi.com/",
    },
    {
      name: "Al Jazeera",
      flag: "🇶🇦",
      country: "Qatar",
      language: "العربية",
      langCode: "ar",
      headline: "قمة المناخ: اتفاق هش وسط انقسام حول تمويل الدول النامية",
      headlineEn: "Climate summit: a fragile deal amid division over funding for developing countries",
      excerpt:
        "Coverage centered on the loss-and-damage fund, with extensive interviews from delegations across Africa and South Asia describing the text as a starting point at best.",
      url: "https://www.aljazeera.net/",
    },
    {
      name: "RT",
      flag: "🇷🇺",
      country: "Russia",
      language: "Русский",
      langCode: "ru",
      headline: "Климатический саммит: Запад навязывает повестку, говорят критики",
      headlineEn: "Climate summit: critics say the West is imposing its agenda",
      excerpt:
        "The state broadcaster framed the talks as a geopolitical contest and emphasized voices arguing that emissions targets disadvantage energy-exporting economies.",
      url: "https://www.rt.com/",
    },
    {
      name: "人民日报",
      flag: "🇨🇳",
      country: "China",
      language: "简体中文",
      langCode: "zh-CN",
      headline: "气候大会达成共识 中方呼吁发达国家兑现承诺",
      headlineEn: "Climate conference reaches consensus; China urges developed nations to honor pledges",
      excerpt:
        "The official daily highlighted China's role as a bridge between blocs and reiterated calls for industrialized countries to deliver promised climate finance.",
      url: "http://www.people.com.cn/",
    },
    {
      name: "Folha de S.Paulo",
      flag: "🇧🇷",
      country: "Brazil",
      language: "Português",
      langCode: "pt-BR",
      headline: "Cúpula do clima fecha acordo com avanços e omissões para o Sul Global",
      headlineEn: "Climate summit closes deal with gains and gaps for the Global South",
      excerpt:
        "Brazilian coverage zeroed in on Amazon protection language and the practical mechanics of the new adaptation fund that emerging economies have long demanded.",
      url: "https://www.folha.uol.com.br/",
    },
  ],
};
