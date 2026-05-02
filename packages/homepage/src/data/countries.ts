/**
 * Curated link directory of major news sites by country.
 *
 * Selection rules:
 *  - Mainstream, well-known sources native readers would recognize.
 *  - Native-language sites only (skip the English editions of foreign papers).
 *  - 4–6 entries per country to keep the visual grid balanced.
 *
 * Editorial labels are honest: state-controlled outlets are tagged "state",
 * outlets operating from exile are "independent-in-exile", popular populist
 * dailies are "tabloid", and ordinary commercial/public-broadcaster outlets
 * are "mainstream".
 */

export type SiteCategory =
  | "newspaper"
  | "broadcaster"
  | "tabloid"
  | "magazine"
  | "wire"
  | "tech";

export type EditorialKind =
  | "state"
  | "independent-in-exile"
  | "tabloid"
  | "mainstream";

export type Editorial = {
  kind: EditorialKind;
  note?: string;
};

export type Site = {
  name: string;
  url: string;
  category: SiteCategory;
  description?: string;
  editorial?: Editorial;
};

export type Country = {
  code: string;
  name: string;
  flag: string;
  language: string;
  sites: Site[];
};

export const countries: Country[] = [
  {
    code: "fr",
    name: "France",
    flag: "🇫🇷",
    language: "Français",
    sites: [
      {
        name: "Le Monde",
        url: "https://www.lemonde.fr/",
        category: "newspaper",
        description: "Center-left daily of record; deep international coverage.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Le Figaro",
        url: "https://www.lefigaro.fr/",
        category: "newspaper",
        description: "Center-right daily, France's oldest national newspaper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Libération",
        url: "https://www.liberation.fr/",
        category: "newspaper",
        description: "Left-leaning daily founded in the post-1968 era.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Mediapart",
        url: "https://www.mediapart.fr/",
        category: "magazine",
        description: "Subscriber-funded investigative outlet, no ads.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "France Info",
        url: "https://www.franceinfo.fr/",
        category: "broadcaster",
        description: "Public-service rolling news from Radio France.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Le Parisien",
        url: "https://www.leparisien.fr/",
        category: "tabloid",
        description: "Popular Paris-region daily with national tabloid edition.",
        editorial: { kind: "tabloid" },
      },
    ],
  },
  {
    code: "de",
    name: "Germany",
    flag: "🇩🇪",
    language: "Deutsch",
    sites: [
      {
        name: "Der Spiegel",
        url: "https://www.spiegel.de/",
        category: "magazine",
        description: "Hamburg-based weekly, Germany's leading investigative magazine.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Süddeutsche Zeitung",
        url: "https://www.sueddeutsche.de/",
        category: "newspaper",
        description: "Center-left Munich daily, one of the largest national papers.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "FAZ",
        url: "https://www.faz.net/",
        category: "newspaper",
        description: "Frankfurter Allgemeine, center-right paper of record.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Tagesschau",
        url: "https://www.tagesschau.de/",
        category: "broadcaster",
        description: "Flagship news service of public broadcaster ARD.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Bild",
        url: "https://www.bild.de/",
        category: "tabloid",
        description: "Mass-market tabloid by Axel Springer, large reach.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "Heise Online",
        url: "https://www.heise.de/",
        category: "tech",
        description: "Long-running German technology and IT news site.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "es",
    name: "Spain",
    flag: "🇪🇸",
    language: "Español",
    sites: [
      {
        name: "El País",
        url: "https://elpais.com/",
        category: "newspaper",
        description: "Center-left Madrid daily, largest paid Spanish newspaper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "El Mundo",
        url: "https://www.elmundo.es/",
        category: "newspaper",
        description: "Center-right national daily known for investigative reporting.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "ABC",
        url: "https://www.abc.es/",
        category: "newspaper",
        description: "Conservative monarchist daily founded in 1903.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "La Vanguardia",
        url: "https://www.lavanguardia.com/",
        category: "newspaper",
        description: "Barcelona-based daily, dominant in Catalonia.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "RTVE",
        url: "https://www.rtve.es/",
        category: "broadcaster",
        description: "Spain's public broadcaster (radio and television).",
        editorial: { kind: "mainstream" },
      },
      {
        name: "elDiario.es",
        url: "https://www.eldiario.es/",
        category: "magazine",
        description: "Member-supported progressive online newspaper.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "it",
    name: "Italy",
    flag: "🇮🇹",
    language: "Italiano",
    sites: [
      {
        name: "Corriere della Sera",
        url: "https://www.corriere.it/",
        category: "newspaper",
        description: "Milan-based daily, Italy's largest-circulation newspaper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "la Repubblica",
        url: "https://www.repubblica.it/",
        category: "newspaper",
        description: "Center-left Rome daily, second-largest national paper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "La Stampa",
        url: "https://www.lastampa.it/",
        category: "newspaper",
        description: "Turin-based daily, one of Italy's oldest newspapers.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Il Sole 24 Ore",
        url: "https://www.ilsole24ore.com/",
        category: "newspaper",
        description: "Italy's leading business and financial daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Rai News",
        url: "https://www.rainews.it/",
        category: "broadcaster",
        description: "News service of public broadcaster Rai.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "nl",
    name: "Netherlands",
    flag: "🇳🇱",
    language: "Nederlands",
    sites: [
      {
        name: "NOS",
        url: "https://nos.nl/",
        category: "broadcaster",
        description: "Dutch public broadcaster's main news service.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "NRC",
        url: "https://www.nrc.nl/",
        category: "newspaper",
        description: "Quality evening daily known for analysis and culture.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "de Volkskrant",
        url: "https://www.volkskrant.nl/",
        category: "newspaper",
        description: "Center-left Amsterdam-based morning daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "De Telegraaf",
        url: "https://www.telegraaf.nl/",
        category: "tabloid",
        description: "Largest-circulation Dutch daily, populist tone.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "AD",
        url: "https://www.ad.nl/",
        category: "newspaper",
        description: "Algemeen Dagblad, broadly-read general-interest daily.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "se",
    name: "Sweden",
    flag: "🇸🇪",
    language: "Svenska",
    sites: [
      {
        name: "Dagens Nyheter",
        url: "https://www.dn.se/",
        category: "newspaper",
        description: "Stockholm-based liberal daily, paper of record.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "SVT Nyheter",
        url: "https://www.svt.se/nyheter/",
        category: "broadcaster",
        description: "News from Sweden's public service television.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Aftonbladet",
        url: "https://www.aftonbladet.se/",
        category: "tabloid",
        description: "Largest evening tabloid, social-democratic leaning.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "Expressen",
        url: "https://www.expressen.se/",
        category: "tabloid",
        description: "Liberal-leaning evening tabloid, national reach.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "Sydsvenskan",
        url: "https://www.sydsvenskan.se/",
        category: "newspaper",
        description: "Malmö-based regional daily covering southern Sweden.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "fi",
    name: "Finland",
    flag: "🇫🇮",
    language: "Suomi",
    sites: [
      {
        name: "Yle Uutiset",
        url: "https://yle.fi/uutiset/",
        category: "broadcaster",
        description: "News from Finland's public broadcaster Yle.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Helsingin Sanomat",
        url: "https://www.hs.fi/",
        category: "newspaper",
        description: "Helsinki-based daily, largest subscription paper in the Nordics.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Iltalehti",
        url: "https://www.iltalehti.fi/",
        category: "tabloid",
        description: "Popular evening tabloid, free online.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "Ilta-Sanomat",
        url: "https://www.is.fi/",
        category: "tabloid",
        description: "Long-running afternoon tabloid sister of Helsingin Sanomat.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "MTV Uutiset",
        url: "https://www.mtvuutiset.fi/",
        category: "broadcaster",
        description: "News service of Finland's largest commercial broadcaster.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "no",
    name: "Norway",
    flag: "🇳🇴",
    language: "Norsk",
    sites: [
      {
        name: "VG",
        url: "https://www.vg.no/",
        category: "tabloid",
        description: "Verdens Gang, country's most-read tabloid.",
        editorial: { kind: "tabloid" },
      },
      {
        name: "NRK",
        url: "https://www.nrk.no/",
        category: "broadcaster",
        description: "Norway's public broadcaster, news in Bokmål and Nynorsk.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Aftenposten",
        url: "https://www.aftenposten.no/",
        category: "newspaper",
        description: "Oslo-based conservative daily of record.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Dagbladet",
        url: "https://www.dagbladet.no/",
        category: "tabloid",
        description: "Liberal national tabloid with broad reach.",
        editorial: { kind: "tabloid" },
      },
    ],
  },
  {
    code: "pl",
    name: "Poland",
    flag: "🇵🇱",
    language: "Polski",
    sites: [
      {
        name: "Gazeta Wyborcza",
        url: "https://wyborcza.pl/",
        category: "newspaper",
        description: "Liberal Warsaw daily founded by Solidarity in 1989.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Onet",
        url: "https://www.onet.pl/",
        category: "newspaper",
        description: "Top Polish news portal, broad general-interest mix.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Rzeczpospolita",
        url: "https://www.rp.pl/",
        category: "newspaper",
        description: "Center-right daily focused on legal and economic news.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "TVN24",
        url: "https://tvn24.pl/",
        category: "broadcaster",
        description: "Private 24-hour news channel, mainstream coverage.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "tr",
    name: "Türkiye",
    flag: "🇹🇷",
    language: "Türkçe",
    sites: [
      {
        name: "Hürriyet",
        url: "https://www.hurriyet.com.tr/",
        category: "newspaper",
        description: "Mass-market daily, owned by Demirören Group.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Cumhuriyet",
        url: "https://www.cumhuriyet.com.tr/",
        category: "newspaper",
        description: "Secular Kemalist daily, often in opposition to the government.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Sabah",
        url: "https://www.sabah.com.tr/",
        category: "newspaper",
        description: "Pro-government daily aligned with the ruling AKP.",
        editorial: { kind: "mainstream", note: "Pro-government" },
      },
      {
        name: "NTV",
        url: "https://www.ntv.com.tr/",
        category: "broadcaster",
        description: "Private 24-hour news channel owned by Doğuş Group.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "ru",
    name: "Russia",
    flag: "🇷🇺",
    language: "Русский",
    sites: [
      {
        name: "Meduza",
        url: "https://meduza.io/",
        category: "magazine",
        description: "Independent Russian-language outlet, operating from Riga.",
        editorial: { kind: "independent-in-exile", note: "Based in Latvia; banned in Russia." },
      },
      {
        name: "Kommersant",
        url: "https://www.kommersant.ru/",
        category: "newspaper",
        description: "Business-oriented daily, traditionally less polemical.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "RBC",
        url: "https://www.rbc.ru/",
        category: "newspaper",
        description: "Business and finance news portal.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Lenta.ru",
        url: "https://lenta.ru/",
        category: "newspaper",
        description: "General-news site closely aligned with the Kremlin since 2014.",
        editorial: { kind: "state", note: "Editorially aligned with state since 2014 ownership change." },
      },
      {
        name: "Novaya Gazeta",
        url: "https://novayagazeta.eu/",
        category: "newspaper",
        description: "Investigative paper now publishing from Europe in exile.",
        editorial: { kind: "independent-in-exile", note: "Russian print suspended in 2022; European edition continues." },
      },
    ],
  },
  {
    code: "ua",
    name: "Ukraine",
    flag: "🇺🇦",
    language: "Українська",
    sites: [
      {
        name: "Українська правда",
        url: "https://www.pravda.com.ua/",
        category: "newspaper",
        description: "Influential online daily founded in 2000.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Hromadske",
        url: "https://hromadske.ua/",
        category: "broadcaster",
        description: "Public-interest broadcaster launched during Euromaidan.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Ukrinform",
        url: "https://www.ukrinform.ua/",
        category: "wire",
        description: "Ukraine's national news agency.",
        editorial: { kind: "state", note: "State-owned national news agency." },
      },
      {
        name: "Liga.net",
        url: "https://www.liga.net/",
        category: "newspaper",
        description: "Business-focused general news site.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "jp",
    name: "Japan",
    flag: "🇯🇵",
    language: "日本語",
    sites: [
      {
        name: "朝日新聞",
        url: "https://www.asahi.com/",
        category: "newspaper",
        description: "Asahi Shimbun, liberal-leaning national daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "読売新聞",
        url: "https://www.yomiuri.co.jp/",
        category: "newspaper",
        description: "Yomiuri Shimbun, world's largest-circulation newspaper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "毎日新聞",
        url: "https://mainichi.jp/",
        category: "newspaper",
        description: "Mainichi Shimbun, one of Japan's three big national dailies.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "日本経済新聞",
        url: "https://www.nikkei.com/",
        category: "newspaper",
        description: "Nikkei, Japan's leading business and economic daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "NHK ニュース",
        url: "https://www3.nhk.or.jp/news/",
        category: "broadcaster",
        description: "News from Japan's public broadcaster NHK.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "ITmedia",
        url: "https://www.itmedia.co.jp/",
        category: "tech",
        description: "Major Japanese technology and IT news portal.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "kr",
    name: "South Korea",
    flag: "🇰🇷",
    language: "한국어",
    sites: [
      {
        name: "조선일보",
        url: "https://www.chosun.com/",
        category: "newspaper",
        description: "Chosun Ilbo, conservative daily, largest paid circulation.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "한겨레",
        url: "https://www.hani.co.kr/",
        category: "newspaper",
        description: "Hankyoreh, progressive daily founded in 1988.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "중앙일보",
        url: "https://www.joongang.co.kr/",
        category: "newspaper",
        description: "JoongAng Ilbo, center-right national daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "동아일보",
        url: "https://www.donga.com/",
        category: "newspaper",
        description: "Dong-A Ilbo, century-old conservative daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Yonhap News",
        url: "https://www.yna.co.kr/",
        category: "wire",
        description: "South Korea's main news agency, state-funded.",
        editorial: { kind: "state", note: "Major-share state-funded news agency." },
      },
    ],
  },
  {
    code: "cn",
    name: "China",
    flag: "🇨🇳",
    language: "简体中文",
    sites: [
      {
        name: "人民日报",
        url: "http://www.people.com.cn/",
        category: "newspaper",
        description: "People's Daily, official paper of the Communist Party of China.",
        editorial: { kind: "state", note: "Official Communist Party of China newspaper." },
      },
      {
        name: "新华网",
        url: "http://www.xinhuanet.com/",
        category: "wire",
        description: "Xinhua, China's official state-run news agency.",
        editorial: { kind: "state", note: "Official state news agency." },
      },
      {
        name: "新浪新闻",
        url: "https://news.sina.com.cn/",
        category: "newspaper",
        description: "Sina News, large commercial portal under PRC content rules.",
        editorial: { kind: "mainstream", note: "Operates under PRC content regulation." },
      },
      {
        name: "搜狐新闻",
        url: "https://news.sohu.com/",
        category: "newspaper",
        description: "Sohu News, commercial portal under PRC content rules.",
        editorial: { kind: "mainstream", note: "Operates under PRC content regulation." },
      },
      {
        name: "财新网",
        url: "https://www.caixin.com/",
        category: "newspaper",
        description: "Caixin, business magazine known for investigative reporting.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "br",
    name: "Brazil",
    flag: "🇧🇷",
    language: "Português",
    sites: [
      {
        name: "Folha de S.Paulo",
        url: "https://www.folha.uol.com.br/",
        category: "newspaper",
        description: "São Paulo-based national daily, large general-news circulation.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "G1",
        url: "https://g1.globo.com/",
        category: "broadcaster",
        description: "Globo's online news portal, Brazil's largest media group.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Estadão",
        url: "https://www.estadao.com.br/",
        category: "newspaper",
        description: "O Estado de S. Paulo, traditional center-right daily.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "UOL",
        url: "https://www.uol.com.br/",
        category: "newspaper",
        description: "One of Brazil's largest content portals and ISPs.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "mx",
    name: "Mexico",
    flag: "🇲🇽",
    language: "Español",
    sites: [
      {
        name: "El Universal",
        url: "https://www.eluniversal.com.mx/",
        category: "newspaper",
        description: "Mexico City daily founded in 1916.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Reforma",
        url: "https://www.reforma.com/",
        category: "newspaper",
        description: "Center-right daily known for political coverage.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "La Jornada",
        url: "https://www.jornada.com.mx/",
        category: "newspaper",
        description: "Left-leaning daily covering politics and social movements.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Milenio",
        url: "https://www.milenio.com/",
        category: "newspaper",
        description: "National daily with strong regional editions.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "ar",
    name: "Argentina",
    flag: "🇦🇷",
    language: "Español",
    sites: [
      {
        name: "Clarín",
        url: "https://www.clarin.com/",
        category: "newspaper",
        description: "Buenos Aires-based daily, Argentina's largest paper.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "La Nación",
        url: "https://www.lanacion.com.ar/",
        category: "newspaper",
        description: "Center-right daily founded in 1870.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Página/12",
        url: "https://www.pagina12.com.ar/",
        category: "newspaper",
        description: "Left-leaning daily focused on politics and human rights.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
  {
    code: "sa",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    language: "العربية",
    sites: [
      {
        name: "Al Riyadh",
        url: "https://www.alriyadh.com/",
        category: "newspaper",
        description: "Riyadh daily aligned with Saudi government editorial line.",
        editorial: { kind: "state", note: "Operates under Saudi state media rules." },
      },
      {
        name: "Okaz",
        url: "https://www.okaz.com.sa/",
        category: "newspaper",
        description: "Jeddah daily, broad general-news coverage.",
        editorial: { kind: "state", note: "Operates under Saudi state media rules." },
      },
      {
        name: "Al Arabiya",
        url: "https://www.alarabiya.net/",
        category: "broadcaster",
        description: "Pan-Arab news channel based in Riyadh and Dubai.",
        editorial: { kind: "state", note: "Saudi-owned pan-Arab broadcaster." },
      },
    ],
  },
  {
    code: "in-hi",
    name: "India (Hindi)",
    flag: "🇮🇳",
    language: "हिन्दी",
    sites: [
      {
        name: "Dainik Jagran",
        url: "https://www.jagran.com/",
        category: "newspaper",
        description: "One of the most-read Hindi-language dailies.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Dainik Bhaskar",
        url: "https://www.bhaskar.com/",
        category: "newspaper",
        description: "Major Hindi daily with a wide multi-state footprint.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Amar Ujala",
        url: "https://www.amarujala.com/",
        category: "newspaper",
        description: "Hindi daily strong in northern India.",
        editorial: { kind: "mainstream" },
      },
      {
        name: "Aaj Tak",
        url: "https://www.aajtak.in/",
        category: "broadcaster",
        description: "Leading Hindi 24-hour news channel.",
        editorial: { kind: "mainstream" },
      },
    ],
  },
];

export const categoryLabels: Record<SiteCategory, string> = {
  newspaper: "Newspaper",
  broadcaster: "Broadcaster",
  tabloid: "Tabloid",
  magazine: "Magazine",
  wire: "Wire service",
  tech: "Tech",
};

export const editorialLabels: Record<EditorialKind, string> = {
  state: "State media",
  "independent-in-exile": "Independent · in exile",
  tabloid: "Tabloid",
  mainstream: "Mainstream",
};
