/**
 * Curated link directory of major news sites by country.
 *
 * Selection rules:
 *  - Mainstream, well-known sources native readers would recognize.
 *  - Native-language sites only (skip the English editions of foreign papers).
 *  - 4–6 entries per country to keep the visual grid balanced.
 */

export type SiteCategory =
  | "newspaper"
  | "broadcaster"
  | "tabloid"
  | "magazine"
  | "wire"
  | "tech";

export type Site = {
  name: string;
  url: string;
  category: SiteCategory;
  description?: string;
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
      { name: "Le Monde", url: "https://www.lemonde.fr/", category: "newspaper" },
      { name: "Le Figaro", url: "https://www.lefigaro.fr/", category: "newspaper" },
      { name: "Libération", url: "https://www.liberation.fr/", category: "newspaper" },
      { name: "Mediapart", url: "https://www.mediapart.fr/", category: "magazine" },
      { name: "France Info", url: "https://www.franceinfo.fr/", category: "broadcaster" },
      { name: "Le Parisien", url: "https://www.leparisien.fr/", category: "tabloid" },
    ],
  },
  {
    code: "de",
    name: "Germany",
    flag: "🇩🇪",
    language: "Deutsch",
    sites: [
      { name: "Der Spiegel", url: "https://www.spiegel.de/", category: "magazine" },
      { name: "Süddeutsche Zeitung", url: "https://www.sueddeutsche.de/", category: "newspaper" },
      { name: "FAZ", url: "https://www.faz.net/", category: "newspaper" },
      { name: "Tagesschau", url: "https://www.tagesschau.de/", category: "broadcaster" },
      { name: "Bild", url: "https://www.bild.de/", category: "tabloid" },
      { name: "Heise Online", url: "https://www.heise.de/", category: "tech" },
    ],
  },
  {
    code: "es",
    name: "Spain",
    flag: "🇪🇸",
    language: "Español",
    sites: [
      { name: "El País", url: "https://elpais.com/", category: "newspaper" },
      { name: "El Mundo", url: "https://www.elmundo.es/", category: "newspaper" },
      { name: "ABC", url: "https://www.abc.es/", category: "newspaper" },
      { name: "La Vanguardia", url: "https://www.lavanguardia.com/", category: "newspaper" },
      { name: "RTVE", url: "https://www.rtve.es/", category: "broadcaster" },
      { name: "elDiario.es", url: "https://www.eldiario.es/", category: "magazine" },
    ],
  },
  {
    code: "it",
    name: "Italy",
    flag: "🇮🇹",
    language: "Italiano",
    sites: [
      { name: "Corriere della Sera", url: "https://www.corriere.it/", category: "newspaper" },
      { name: "la Repubblica", url: "https://www.repubblica.it/", category: "newspaper" },
      { name: "La Stampa", url: "https://www.lastampa.it/", category: "newspaper" },
      { name: "Il Sole 24 Ore", url: "https://www.ilsole24ore.com/", category: "newspaper" },
      { name: "Rai News", url: "https://www.rainews.it/", category: "broadcaster" },
    ],
  },
  {
    code: "nl",
    name: "Netherlands",
    flag: "🇳🇱",
    language: "Nederlands",
    sites: [
      { name: "NOS", url: "https://nos.nl/", category: "broadcaster" },
      { name: "NRC", url: "https://www.nrc.nl/", category: "newspaper" },
      { name: "de Volkskrant", url: "https://www.volkskrant.nl/", category: "newspaper" },
      { name: "De Telegraaf", url: "https://www.telegraaf.nl/", category: "tabloid" },
      { name: "AD", url: "https://www.ad.nl/", category: "newspaper" },
    ],
  },
  {
    code: "se",
    name: "Sweden",
    flag: "🇸🇪",
    language: "Svenska",
    sites: [
      { name: "Dagens Nyheter", url: "https://www.dn.se/", category: "newspaper" },
      { name: "SVT Nyheter", url: "https://www.svt.se/nyheter/", category: "broadcaster" },
      { name: "Aftonbladet", url: "https://www.aftonbladet.se/", category: "tabloid" },
      { name: "Expressen", url: "https://www.expressen.se/", category: "tabloid" },
      { name: "Sydsvenskan", url: "https://www.sydsvenskan.se/", category: "newspaper" },
    ],
  },
  {
    code: "fi",
    name: "Finland",
    flag: "🇫🇮",
    language: "Suomi",
    sites: [
      { name: "Yle Uutiset", url: "https://yle.fi/uutiset/", category: "broadcaster" },
      { name: "Helsingin Sanomat", url: "https://www.hs.fi/", category: "newspaper" },
      { name: "Iltalehti", url: "https://www.iltalehti.fi/", category: "tabloid" },
      { name: "Ilta-Sanomat", url: "https://www.is.fi/", category: "tabloid" },
      { name: "MTV Uutiset", url: "https://www.mtvuutiset.fi/", category: "broadcaster" },
    ],
  },
  {
    code: "no",
    name: "Norway",
    flag: "🇳🇴",
    language: "Norsk",
    sites: [
      { name: "VG", url: "https://www.vg.no/", category: "tabloid" },
      { name: "NRK", url: "https://www.nrk.no/", category: "broadcaster" },
      { name: "Aftenposten", url: "https://www.aftenposten.no/", category: "newspaper" },
      { name: "Dagbladet", url: "https://www.dagbladet.no/", category: "tabloid" },
    ],
  },
  {
    code: "pl",
    name: "Poland",
    flag: "🇵🇱",
    language: "Polski",
    sites: [
      { name: "Gazeta Wyborcza", url: "https://wyborcza.pl/", category: "newspaper" },
      { name: "Onet", url: "https://www.onet.pl/", category: "newspaper" },
      { name: "Rzeczpospolita", url: "https://www.rp.pl/", category: "newspaper" },
      { name: "TVN24", url: "https://tvn24.pl/", category: "broadcaster" },
    ],
  },
  {
    code: "tr",
    name: "Türkiye",
    flag: "🇹🇷",
    language: "Türkçe",
    sites: [
      { name: "Hürriyet", url: "https://www.hurriyet.com.tr/", category: "newspaper" },
      { name: "Cumhuriyet", url: "https://www.cumhuriyet.com.tr/", category: "newspaper" },
      { name: "Sabah", url: "https://www.sabah.com.tr/", category: "newspaper" },
      { name: "NTV", url: "https://www.ntv.com.tr/", category: "broadcaster" },
    ],
  },
  {
    code: "ru",
    name: "Russia",
    flag: "🇷🇺",
    language: "Русский",
    sites: [
      { name: "Meduza", url: "https://meduza.io/", category: "magazine", description: "Independent, in exile" },
      { name: "Kommersant", url: "https://www.kommersant.ru/", category: "newspaper" },
      { name: "RBC", url: "https://www.rbc.ru/", category: "newspaper" },
      { name: "Lenta.ru", url: "https://lenta.ru/", category: "newspaper" },
      { name: "Novaya Gazeta", url: "https://novayagazeta.eu/", category: "newspaper" },
    ],
  },
  {
    code: "ua",
    name: "Ukraine",
    flag: "🇺🇦",
    language: "Українська",
    sites: [
      { name: "Українська правда", url: "https://www.pravda.com.ua/", category: "newspaper" },
      { name: "Hromadske", url: "https://hromadske.ua/", category: "broadcaster" },
      { name: "Ukrinform", url: "https://www.ukrinform.ua/", category: "wire" },
      { name: "Liga.net", url: "https://www.liga.net/", category: "newspaper" },
    ],
  },
  {
    code: "jp",
    name: "Japan",
    flag: "🇯🇵",
    language: "日本語",
    sites: [
      { name: "朝日新聞", url: "https://www.asahi.com/", category: "newspaper" },
      { name: "読売新聞", url: "https://www.yomiuri.co.jp/", category: "newspaper" },
      { name: "毎日新聞", url: "https://mainichi.jp/", category: "newspaper" },
      { name: "日本経済新聞", url: "https://www.nikkei.com/", category: "newspaper" },
      { name: "NHK ニュース", url: "https://www3.nhk.or.jp/news/", category: "broadcaster" },
      { name: "ITmedia", url: "https://www.itmedia.co.jp/", category: "tech" },
    ],
  },
  {
    code: "kr",
    name: "South Korea",
    flag: "🇰🇷",
    language: "한국어",
    sites: [
      { name: "조선일보", url: "https://www.chosun.com/", category: "newspaper" },
      { name: "한겨레", url: "https://www.hani.co.kr/", category: "newspaper" },
      { name: "중앙일보", url: "https://www.joongang.co.kr/", category: "newspaper" },
      { name: "동아일보", url: "https://www.donga.com/", category: "newspaper" },
      { name: "Yonhap News", url: "https://www.yna.co.kr/", category: "wire" },
    ],
  },
  {
    code: "cn",
    name: "China",
    flag: "🇨🇳",
    language: "简体中文",
    sites: [
      { name: "人民日报", url: "http://www.people.com.cn/", category: "newspaper" },
      { name: "新华网", url: "http://www.xinhuanet.com/", category: "wire" },
      { name: "新浪新闻", url: "https://news.sina.com.cn/", category: "newspaper" },
      { name: "搜狐新闻", url: "https://news.sohu.com/", category: "newspaper" },
      { name: "财新网", url: "https://www.caixin.com/", category: "newspaper" },
    ],
  },
  {
    code: "br",
    name: "Brazil",
    flag: "🇧🇷",
    language: "Português",
    sites: [
      { name: "Folha de S.Paulo", url: "https://www.folha.uol.com.br/", category: "newspaper" },
      { name: "G1", url: "https://g1.globo.com/", category: "broadcaster" },
      { name: "Estadão", url: "https://www.estadao.com.br/", category: "newspaper" },
      { name: "UOL", url: "https://www.uol.com.br/", category: "newspaper" },
    ],
  },
  {
    code: "mx",
    name: "Mexico",
    flag: "🇲🇽",
    language: "Español",
    sites: [
      { name: "El Universal", url: "https://www.eluniversal.com.mx/", category: "newspaper" },
      { name: "Reforma", url: "https://www.reforma.com/", category: "newspaper" },
      { name: "La Jornada", url: "https://www.jornada.com.mx/", category: "newspaper" },
      { name: "Milenio", url: "https://www.milenio.com/", category: "newspaper" },
    ],
  },
  {
    code: "ar",
    name: "Argentina",
    flag: "🇦🇷",
    language: "Español",
    sites: [
      { name: "Clarín", url: "https://www.clarin.com/", category: "newspaper" },
      { name: "La Nación", url: "https://www.lanacion.com.ar/", category: "newspaper" },
      { name: "Página/12", url: "https://www.pagina12.com.ar/", category: "newspaper" },
    ],
  },
  {
    code: "sa",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    language: "العربية",
    sites: [
      { name: "Al Riyadh", url: "https://www.alriyadh.com/", category: "newspaper" },
      { name: "Okaz", url: "https://www.okaz.com.sa/", category: "newspaper" },
      { name: "Al Arabiya", url: "https://www.alarabiya.net/", category: "broadcaster" },
    ],
  },
  {
    code: "in-hi",
    name: "India (Hindi)",
    flag: "🇮🇳",
    language: "हिन्दी",
    sites: [
      { name: "Dainik Jagran", url: "https://www.jagran.com/", category: "newspaper" },
      { name: "Dainik Bhaskar", url: "https://www.bhaskar.com/", category: "newspaper" },
      { name: "Amar Ujala", url: "https://www.amarujala.com/", category: "newspaper" },
      { name: "Aaj Tak", url: "https://www.aajtak.in/", category: "broadcaster" },
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
