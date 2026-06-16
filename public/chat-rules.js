/**
 * SkyCast bilingual chat rules (Arabic + English). Works in browser and Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SkyCastChat = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isArabic(text) {
    return /[\u0600-\u06FF]/.test(text || '');
  }

  function normalizeArabic(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[إأآٱا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[؟،؛]/g, ' ')
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeEnglish(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^\w\s\u0600-\u06FF'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeText(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (isArabic(raw)) return normalizeArabic(raw);
    return normalizeEnglish(raw);
  }

  function lightStemArabicToken(token) {
    let word = normalizeArabic(token);
    if (!word) return '';
    word = word.replace(/^(وال|فال|بال|كال|لل|ال)/, '');
    word = word.replace(/^[وفبكلس]/, '');
    word = word.replace(/(كما|هما|كم|كن|نا|ها|هم|هن|ه|ي)$/, '');
    word = word.replace(/(ات|ون|ين|ان|يه|ية)$/, '');
    return word;
  }

  const arabicStopWords = new Set([
    'هل', 'ما', 'ماذا', 'متي', 'اين', 'كيف', 'كم', 'من', 'الي', 'في', 'عن', 'علي',
    'او', 'ام', 'اذا', 'لو', 'انا', 'انت', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'تلك',
    'اريد', 'ابغي', 'احتاج', 'يمكن', 'ممكن', 'فضلا', 'رجاء', 'بعد', 'قبل',
    'الان', 'حاليا', 'اليوم', 'غدا', 'بكره', 'لدي', 'عندي', 'معي', 'كان', 'يكون',
    'سوف', 'يجب', 'لازم', 'جدا',
  ]);

  const englishStopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'do', 'does', 'did', 'have', 'has', 'had', 'i', 'you', 'we', 'they', 'he', 'she', 'it',
    'my', 'your', 'our', 'their', 'me', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about',
    'can', 'could', 'would', 'should', 'will', 'what', 'when', 'where', 'how', 'why', 'which',
    'please', 'tell', 'show', 'give', 'want', 'need', 'like',
  ]);

  function tokenize(text) {
    const normalized = normalizeText(text);
    if (isArabic(text)) {
      return normalized
        .split(' ')
        .map(lightStemArabicToken)
        .filter((t) => t && t.length > 1 && !arabicStopWords.has(t));
    }
    return normalized
      .split(' ')
      .filter((t) => t.length > 1 && !englishStopWords.has(t));
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const cur = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  function tokensMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4) {
      return levenshtein(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1);
    }
    return false;
  }

  function uniqueTokens(items) {
    return [...new Set(items.flatMap((item) => tokenize(item)))];
  }

  function makeIntent(name, response, config) {
    return {
      name,
      response,
      phrases: config.phrases || [],
      keywords: config.keywords || [],
      tokens: uniqueTokens([...(config.phrases || []), ...(config.keywords || [])]),
      priority: config.priority || 1,
    };
  }

  function t(ar, en, query) {
    return isArabic(query) ? ar : en;
  }

  function ctxBlock(context, query) {
    if (!context) return '';
    const label = t('**بيانات الطقس الحالية:**\n', '**Current weather context:**\n', query);
    return `\n\n${label}${context}`;
  }

  const intents = [
    makeIntent('greeting', (q) => t(
      'أهلًا! أنا مساعد SkyCast. اسألني عن الطقس، الخريطة، الملابس، الخروج، المقارنة، أو التصدير — بالعربية أو الإنجليزية.',
      'Hello! I\'m the SkyCast assistant. Ask about weather, the map, clothing, going out, comparing places, or exporting data — in Arabic or English.',
      q
    ), {
      priority: 3,
      phrases: ['السلام عليكم', 'مرحبا', 'اهلا', 'صباح الخير', 'مساء الخير', 'hello', 'hi there', 'good morning', 'good evening', 'hey skycast'],
      keywords: ['سلام', 'مرحبا', 'اهلا', 'hello', 'hi', 'hey', 'greetings'],
    }),
    makeIntent('thanks', (q) => t(
      'عفوًا! اسأل أي سؤال آخر عن الطقس أو التطبيق.',
      'You\'re welcome! Ask anything else about weather or the app.',
      q
    ), {
      priority: 3,
      phrases: ['شكرا', 'شكرا لك', 'thanks', 'thank you', 'appreciate it', 'great thanks'],
      keywords: ['شكرا', 'thanks', 'thank', 'thx'],
    }),
    makeIntent('goodbye', (q) => t(
      'مع السلامة! عد متى احتجت مساعدة في الطقس أو الخريطة.',
      'Goodbye! Come back anytime you need weather or map help.',
      q
    ), {
      priority: 2,
      phrases: ['مع السلامه', 'وداعا', 'bye', 'goodbye', 'see you', 'later'],
      keywords: ['سلامه', 'وداع', 'bye', 'goodbye'],
    }),
    makeIntent('help', (q) => getCapabilities(q), {
      priority: 2,
      phrases: [
        'ماذا تستطيع', 'بماذا تساعدني', 'what can you do', 'what do you understand',
        'help me', 'show commands', 'what questions', 'how can you help', 'capabilities',
      ],
      keywords: ['مساعده', 'help', 'commands', 'capabilities', 'what can', 'features', 'examples'],
    }),
    makeIntent('clothing', (q) => getClothing(q), {
      priority: 2,
      phrases: [
        'ماذا ارتدي', 'what should i wear', 'clothing advice', 'outfit today', 'need a jacket',
        'should i wear coat', 'dress for weather', 'ملابس مناسبه',
      ],
      keywords: ['ارتدي', 'لباس', 'ملابس', 'جاكيت', 'معطف', 'wear', 'outfit', 'clothes', 'jacket', 'coat', 'dress'],
    }),
    makeIntent('rain', (q) => getRain(q), {
      priority: 2,
      phrases: [
        'هل ستمطر', 'هل احتاج مظله', 'will it rain', 'do i need umbrella', 'is it rainy',
        'precipitation today', 'rain forecast',
      ],
      keywords: ['مطر', 'امطار', 'مظله', 'هطول', 'rain', 'rainy', 'umbrella', 'precipitation', 'drizzle'],
    }),
    makeIntent('temperature', (q) => getTemperature(q), {
      priority: 2,
      phrases: [
        'درجه الحراره', 'هل الجو حار', 'how hot', 'how cold', 'temperature today',
        'is it hot', 'is it cold', 'feels like',
      ],
      keywords: ['حراره', 'حار', 'بارد', 'temperature', 'hot', 'cold', 'warm', 'freezing', 't2m'],
    }),
    makeIntent('wind', (q) => getWind(q), {
      priority: 2,
      phrases: ['سرعه الرياح', 'هل الرياح قويه', 'wind speed', 'is it windy', 'strong winds'],
      keywords: ['رياح', 'عاصف', 'wind', 'windy', 'breeze', 'ws2m', 'storm'],
    }),
    makeIntent('airQuality', (q) => getAirQuality(q), {
      priority: 2,
      phrases: ['جوده الهواء', 'air quality', 'pollution', 'dust', 'aod', 'smog'],
      keywords: ['هواء', 'تلوث', 'غبار', 'aod', 'air', 'pollution', 'dust', 'haze'],
    }),
    makeIntent('forecast', (q) => getForecast(q), {
      priority: 1,
      phrases: [
        'توقعات الطقس', 'حالة الطقس', 'weather forecast', 'weather today', 'weather tomorrow',
        'what is the weather', 'how is the weather',
      ],
      keywords: ['توقعات', 'طقس', 'جو', 'weather', 'forecast', 'conditions'],
    }),
    makeIntent('outdoor', (q) => getOutdoor(q), {
      priority: 2,
      phrases: [
        'هل الجو مناسب للخروج', 'can i go outside', 'good for picnic', 'is it nice out',
        'should i go out', 'outdoor today',
      ],
      keywords: ['خروج', 'نزهه', 'picnic', 'outside', 'outdoor', 'go out'],
    }),
    makeIntent('activity', (q) => getActivity(q), {
      priority: 3,
      phrases: [
        'مناسب للجري', 'good for running', 'cycling weather', 'swimming today', 'hiking weather',
        'exercise outside', 'sports weather',
      ],
      keywords: ['جري', 'رياضه', 'running', 'jog', 'cycling', 'bike', 'swim', 'hike', 'sports', 'gym'],
    }),
    makeIntent('mapUsage', (q) => getMapHelp(q), {
      priority: 2,
      phrases: [
        'كيف استخدم الخريطه', 'how to use the map', 'select location on map', 'click on map',
        'pick a place', 'map tutorial',
      ],
      keywords: ['خريطه', 'map', 'location', 'coordinates', 'click', 'right click'],
    }),
    makeIntent('weatherData', (q) => getWeatherDataHelp(q), {
      priority: 2,
      phrases: [
        'كيف اجيب بيانات الطقس', 'get weather data', 'nasa power', 'historical weather',
        'weather charts', 'load weather', 'date range weather',
      ],
      keywords: ['بيانات', 'nasa', 'power', 'historical', 'charts', 'weather data', 'get weather'],
    }),
    makeIntent('markers', (q) => getMarkers(q), {
      priority: 2,
      phrases: ['اضيف علامه', 'add marker', 'delete markers', 'clear markers', 'map pin'],
      keywords: ['علامه', 'ماركر', 'marker', 'markers', 'pin'],
    }),
    makeIntent('savedLocations', (q) => getSaved(q), {
      priority: 2,
      phrases: ['احفظ مكان', 'save location', 'saved places', 'bookmarks', 'my locations'],
      keywords: ['احفظ', 'حفظ', 'saved', 'bookmark', 'favorite place'],
    }),
    makeIntent('compare', (q) => getCompare(q), {
      priority: 2,
      phrases: ['قارن موقعين', 'compare locations', 'compare two cities', 'which is warmer'],
      keywords: ['قارن', 'مقارنه', 'compare', 'comparison', 'versus', 'vs'],
    }),
    makeIntent('export', (q) => getExport(q), {
      priority: 2,
      phrases: ['تصدير', 'export data', 'download csv', 'pdf report', 'export pdf'],
      keywords: ['تصدير', 'export', 'download', 'csv', 'pdf', 'kml', 'json'],
    }),
    makeIntent('layers', (q) => getLayers(q), {
      priority: 2,
      phrases: ['طبقات الخريطه', 'map layers', 'satellite view', 'dark map', 'terrain layer'],
      keywords: ['طبقات', 'layers', 'satellite', 'terrain', 'dark mode map'],
    }),
    makeIntent('tracking', (q) => getTracking(q), {
      priority: 2,
      phrases: ['تتبع الموقع', 'location tracking', 'my gps', 'live location', 'find me on map'],
      keywords: ['تتبع', 'tracking', 'gps', 'geolocation', 'my location'],
    }),
    makeIntent('search', (q) => getSearch(q), {
      priority: 2,
      phrases: ['ابحث عن مدينه', 'search city', 'find place', 'search bar', 'geocode'],
      keywords: ['بحث', 'search', 'find city', 'lookup', 'geocode'],
    }),
    makeIntent('account', (q) => getAccount(q), {
      priority: 2,
      phrases: ['تسجيل الدخول', 'sign up', 'create account', 'login help', 'logout'],
      keywords: ['حساب', 'login', 'signup', 'sign up', 'account', 'password', 'register'],
    }),
    makeIntent('chat', (q) => getChatMeta(q), {
      priority: 1,
      phrases: ['who are you', 'are you ai', 'من انت', 'هل انت ذكاء اصطناعي', 'chatbot'],
      keywords: ['bot', 'assistant', 'ai', 'chatbot', 'مساعد', 'ذكاء'],
    }),
    makeIntent('unsupportedData', (q) => getUnsupported(q), {
      priority: 3,
      phrases: ['humidity', 'pressure', 'uv index', 'الرطوبه', 'الضغط الجوي'],
      keywords: ['رطوبه', 'ضغط', 'humidity', 'pressure', 'uv'],
    }),
  ];

  function scoreIntent(query, intent) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(query);
    const tokenSet = new Set(queryTokens);
    let score = 0;

    for (const phrase of intent.phrases) {
      const np = normalizeText(phrase);
      if (np && normalizedQuery.includes(np)) score += 5;
    }

    for (const keyword of intent.keywords) {
      const nk = normalizeText(keyword);
      const kwTokens = tokenize(keyword);
      if (nk && normalizedQuery.includes(nk)) {
        score += nk.includes(' ') ? 3 : 2;
        continue;
      }
      for (const kt of kwTokens) {
        if (tokenSet.has(kt)) score += 2;
        else if (queryTokens.some((qt) => tokensMatch(qt, kt))) score += 1;
      }
    }

    if (/\b(هل|كيف|ماذا|ما|why|how|what|when|where|can|should)\b/i.test(normalizedQuery)) score += 0.5;
    return score * intent.priority;
  }

  function getCapabilities(q) {
    return t(
      `أستطيع مساعدتك في:\n• الطقس: حرارة، مطر، رياح، جودة هواء\n• نصائح: ملابس، خروج، رياضة\n• التطبيق: خريطة، markers، حفظ أماكن، مقارنة، تصدير PDF/CSV\n\nاكتب بأي صياغة عربية أو إنجليزية.`,
      `I can help with:\n• Weather: temperature, rain, wind, air quality\n• Advice: clothing, going out, sports\n• App: map, markers, saved places, compare locations, PDF/CSV export\n\nAsk in Arabic or English, any wording.`,
      q
    );
  }

  function getClothing(q) {
    return t(
      '🧥 **ملابس:** راجع بيانات الحرارة من Weather Info. أقل من 10°C: معطف ثقيل. 10–20°C: جاكيت خفيف. 20–30°C: ملابس خفيفة. فوق 30°C: قطن وقبعة وماء.',
      '🧥 **Clothing:** Check temperature from Weather Info. Below 10°C: heavy coat. 10–20°C: light jacket. 20–30°C: light clothes. Above 30°C: cotton, hat, water.',
      q
    );
  }

  function getRain(q) {
    return t(
      '🌧️ **مطر:** إذا precipitation > 0 فهناك أمطار. 0–5 مم خفيف، 5–20 متوسط، >20 غزير. خذ مظلة عند الأمطار المتوقعة.',
      '🌧️ **Rain:** If precipitation > 0, rain is expected. 0–5 mm light, 5–20 moderate, >20 heavy. Take an umbrella when rain shows in your weather data.',
      q
    );
  }

  function getTemperature(q) {
    return t(
      '🌡️ **حرارة:** <5°C بارد جدًا، 5–15 بارد، 15–30 معتدل، 30–38 حار، >38 حار جدًا. استخدم Weather Info لموقعك وتاريخك.',
      '🌡️ **Temperature:** <5°C very cold, 5–15 cool, 15–30 mild, 30–38 hot, >38 very hot. Use Weather Info for your place and dates.',
      q
    );
  }

  function getWind(q) {
    return t(
      '💨 **رياح:** <3 m/s هادئة، 3–7 عادية، 7–12 قوية، >12 شديدة. تجنب الأنشطة المكشوفة عند الرياح العالية.',
      '💨 **Wind:** <3 m/s calm, 3–7 normal, 7–12 strong, >12 very strong. Avoid exposed activities in high wind.',
      q
    );
  }

  function getAirQuality(q) {
    return t(
      '🍃 **جودة الهواء (AOD):** أقل من 0.1 نظيف، 0.1–0.3 منخفض، 0.3–0.7 متوسط، >0.7 مرتفع. حساسية الصدر: قلل الخروج عند الغبار.',
      '🍃 **Air quality (AOD):** <0.1 clean, 0.1–0.3 low, 0.3–0.7 moderate, >0.7 high. If sensitive, limit outdoor time when dusty.',
      q
    );
  }

  function getForecast(q) {
    return t(
      '📅 **الطقس:** كليك يمين على الخريطة → Weather Information → اختر التواريخ → Get Weather Data.',
      '📅 **Weather data:** Right-click the map → Weather Information → pick dates → Get Weather Data.',
      q
    );
  }

  function getOutdoor(q) {
    return t(
      '🏕️ **الخروج:** مناسب غالبًا عند 18–30°C، مطر قليل، رياح معتدلة. غير مناسب مع أمطار غزيرة أو حر شديد.',
      '🏕️ **Going out:** Usually good at 18–30°C, little rain, moderate wind. Avoid heavy rain or extreme heat.',
      q
    );
  }

  function getActivity(q) {
    return t(
      '🏃 **أنشطة:** مشي/جري بجو معتدل. دراجة برياح خفيفة. تصوير بجو صافٍ. اسأل "هل يناسب الجري؟" بأي لغة.',
      '🏃 **Activities:** Walk/run in mild weather. Cycling needs lighter wind. Photography works in clear skies. Ask "Is it good for running?" in any wording.',
      q
    );
  }

  function getMapHelp(q) {
    return t(
      '🗺️ **الخريطة:** حرّك الخريطة، كليك يمين → Weather Information / Add Marker / Save Location / Get Directions.',
      '🗺️ **Map:** Pan and zoom, right-click → Weather Information / Add Marker / Save Location / Get Directions.',
      q
    );
  }

  function getWeatherDataHelp(q) {
    return t(
      '🌦️ **بيانات NASA POWER:** كليك يمين → Weather Information → تواريخ → Get Weather Data. تظهر رسوم الحرارة والأمطار والرياح.',
      '🌦️ **NASA POWER data:** Right-click → Weather Information → date range → Get Weather Data. Charts show temp, rain, wind, air quality.',
      q
    );
  }

  function getMarkers(q) {
    return t(
      '📍 **Markers:** كليك يمين → Add Marker. للحذف: Control Panel → Clear Markers.',
      '📍 **Markers:** Right-click → Add Marker. To clear all: Control Panel → Clear Markers.',
      q
    );
  }

  function getSaved(q) {
    return t(
      '🔖 **حفظ مكان:** كليك يمين → Save Location. عرض المحفوظ: Control Panel → Saved Locations. مع تسجيل الدخول يُزامَن للسحابة.',
      '🔖 **Save place:** Right-click → Save Location. View saved: Control Panel → Saved Locations. When logged in, syncs to the cloud.',
      q
    );
  }

  function getCompare(q) {
    return t(
      '⚖️ **مقارنة:** من الشريط العلوي Compare Locations — أدخل موقعين وتواريخ لمقارنة الحرارة والأمطار.',
      '⚖️ **Compare:** Use Compare Locations in the header — enter two places and dates to compare temperature and rain.',
      q
    );
  }

  function getExport(q) {
    return t(
      '📤 **تصدير:** Control Panel → Export Data (JSON/CSV/KML) أو PDF من نافذة الطقس.',
      '📤 **Export:** Control Panel → Export Data (JSON/CSV/KML) or PDF from the weather panel.',
      q
    );
  }

  function getLayers(q) {
    return t(
      '🛰️ **طبقات:** Control Panel → Map Layers — OpenStreetMap، Satellite، Terrain، Dark، Jawg.',
      '🛰️ **Layers:** Control Panel → Map Layers — OpenStreetMap, Satellite, Terrain, Dark, Jawg.',
      q
    );
  }

  function getTracking(q) {
    return t(
      '📍 **التتبع:** Control Panel → Location Tracking لتفعيل/إيقاف موقعك الحالي على الخريطة.',
      '📍 **Tracking:** Control Panel → Location Tracking to show your live GPS position on the map.',
      q
    );
  }

  function getSearch(q) {
    return t(
      '🔍 **بحث:** استخدم شريط البحث في الأعلى للمدن والأماكن، ثم اختر النتيجة للانتقال على الخريطة.',
      '🔍 **Search:** Use the top search bar for cities and places, then pick a result to fly the map there.',
      q
    );
  }

  function getAccount(q) {
    return t(
      '👤 **حساب:** Login / Signup من الأعلى. بعد التسجيل يمكن مزامنة المواقع والـ markers.',
      '👤 **Account:** Login / Signup in the header. After signing in you can sync locations and markers.',
      q
    );
  }

  function getChatMeta(q) {
    return t(
      'أنا مساعد SkyCast (قواعد ذكية + اختياري OpenAI). أفهم العربية والإنجليزية بصيغ كثيرة.',
      'I\'m the SkyCast assistant (smart rules + optional OpenAI). I understand Arabic and English in many phrasings.',
      q
    );
  }

  function getUnsupported(q) {
    return t(
      'الواجهة تعرض: حرارة، أمطار، رياح، AOD. الرطوبة والضغط وUV غير متوفرة حاليًا من NASA POWER في هذا العرض.',
      'The app shows: temperature, rain, wind, AOD. Humidity, pressure, and UV are not in this NASA POWER view yet.',
      q
    );
  }

  function getGeneral(q, context) {
    return t(
      `لم أتأكد من المقصود. جرّب:\n• هل أحتاج مظلة؟ / Do I need an umbrella?\n• ماذا أرتدي؟ / What should I wear?\n• كيف أجيب بيانات الطقس؟ / How do I get weather data?\n• قارن موقعين / Compare two locations\n\nأفهم مرادفات كثيرة بالعربية والإنجليزية.${ctxBlock(context, q)}`,
      `I'm not sure I understood. Try:\n• Do I need an umbrella?\n• What should I wear?\n• How do I get weather data?\n• Compare two locations\n\nI understand many synonyms in Arabic and English.${ctxBlock(context, q)}`,
      q
    );
  }

  function processMessage(query, context = '') {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return isArabic(query)
        ? 'اكتب سؤالك بالعربية أو الإنجليزية.'
        : 'Type your question in Arabic or English.';
    }

    const scored = intents
      .map((intent) => ({ intent, score: scoreIntent(trimmed, intent) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return getGeneral(trimmed, context);
    }

    const nq = normalizeText(trimmed);
    const compound =
      nq.includes(' وهل ') || nq.includes(' and ') || nq.includes(' also ') || nq.includes(' كذلك ');
    const top = scored[0];
    const matches = compound ? scored.filter((s) => s.score >= 4) : [top];
    const useful = matches
      .filter((m) => !['greeting', 'thanks', 'goodbye'].includes(m.intent.name))
      .slice(0, 2);

    if (useful.length > 1 && trimmed.length > 20) {
      return useful.map((m) => m.intent.response(trimmed)).join('\n\n────────────\n\n') + ctxBlock(context, trimmed);
    }

    return top.intent.response(trimmed) + ctxBlock(context, trimmed);
  }

  const QUICK_PROMPTS = [
    { ar: 'ماذا أرتدي اليوم؟', en: 'What should I wear today?' },
    { ar: 'هل أحتاج مظلة؟', en: 'Do I need an umbrella?' },
    { ar: 'هل الجو مناسب للخروج؟', en: 'Is it good to go outside?' },
    { ar: 'كيف أجيب بيانات الطقس؟', en: 'How do I get weather data?' },
    { ar: 'كيف أستخدم الخريطة؟', en: 'How do I use the map?' },
    { ar: 'قارن بين موقعين', en: 'Compare two locations' },
    { ar: 'كيف أحفظ مكان؟', en: 'How do I save a location?' },
    { ar: 'ما سرعة الرياح؟', en: 'What is the wind speed?' },
    { ar: 'هل الجو مناسب للجري؟', en: 'Is it good for running?' },
    { ar: 'كيف أصدّر PDF؟', en: 'How do I export a PDF?' },
    { ar: 'ما الذي تستطيع فعله؟', en: 'What can you do?' },
    { ar: 'كيف أغير طبقة الخريطة؟', en: 'How do I change map layers?' },
  ];

  return {
    processMessage,
    isArabic,
    QUICK_PROMPTS,
  };
});
