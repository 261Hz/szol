// src/data/librivox.js
//
// Curated LibriVox books per language.
// Audio is streamed from archive.org via the LibriVox RSS feed (no DB storage).
// Parallel texts are bundled here for the translation exercise.
//
// Each book has:
//   librivox_url  — book page on librivox.org (used to look up the RSS URL)
//   chapters      — optional known chapter list; if absent, fetched via /api/librivox-rss
//   Each chapter may carry a `segments` array of {text} for dictation
//   and a `parallel` map of { langCode: [{text}] } for translation comparison.

// ── Shared fable texts (same story, multiple languages) ───────────────────────
// Used as the `segments` / `parallel` payloads in the chapter entries below.

const FOX_GRAPES = {
  en: [
    { text: 'A Fox one day spied a beautiful bunch of ripe grapes hanging from a vine trained along the branches of a tree.' },
    { text: 'The grapes seemed ready to burst with juice, and the Fox\'s mouth watered as he gazed longingly at them.' },
    { text: 'The bunch hung from a high branch, and the Fox had to jump for it.' },
    { text: 'The first time he jumped he missed it by a long way. So he walked off a short distance and took a running leap at it, only to fall short once more.' },
    { text: 'Again and again he tried, but in vain.' },
    { text: 'At last he had to give it up, and walked away with his nose in the air, saying: "I am sure they are sour."' },
    { text: 'Moral: It is easy to despise what you cannot get.' },
  ],
  fr: [
    { text: 'Maître Renard, par l\'odeur alléché, lui tint à peu près ce langage : "Hé ! bonjour, Monsieur du Corbeau."' },
    { text: 'Maître Corbeau, sur un arbre perché, tenait en son bec un fromage.' },
    { text: 'Un Renard gascon, d\'autres disent normand, mourant presque de faim vit au haut d\'une treille des raisins mûrs apparemment.' },
    { text: 'Le galand en eût fait volontiers un repas ; mais comme il n\'y pouvait atteindre : "Ils sont trop verts, dit-il, et bons pour des goujats."' },
    { text: 'Fit-il pas mieux que de se plaindre ?' },
  ],
  de: [
    { text: 'Ein Fuchs sah eines Tages einen schönen Weinstock mit reifen Trauben.' },
    { text: 'Er versuchte mehrmals, an die Trauben heranzukommen, aber sie hingen zu hoch.' },
    { text: 'Nach vielen vergeblichen Versuchen gab er auf und sagte beim Weggehen: "Die Trauben sind sowieso noch sauer."' },
    { text: 'Moral: Wer etwas nicht erreichen kann, findet leicht einen Grund, es zu verschmähen.' },
  ],
  es: [
    { text: 'Un zorro hambriento vio unos hermosos racimos de uvas maduras que colgaban de una parra.' },
    { text: 'Las uvas brillaban y parecían deliciosas, y la boca del zorro se hizo agua.' },
    { text: 'Saltó una y otra vez, pero las uvas estaban demasiado altas para alcanzarlas.' },
    { text: 'Finalmente, se alejó diciendo con desdén: "De todas formas estaban verdes."' },
    { text: 'Moraleja: Es fácil despreciar lo que no podemos conseguir.' },
  ],
  it: [
    { text: 'Una volpe affamata vide alcuni grappoli d\'uva matura che pendevano da una vite.' },
    { text: 'L\'uva sembrava pronta per essere mangiata, e la volpe cercò di raggiungerla saltando più volte.' },
    { text: 'Ma i grappoli erano troppo alti e non riuscì a prenderli.' },
    { text: 'Alla fine se ne andò dicendo: "Erano acerbi comunque."' },
    { text: 'Morale: È facile disprezzare ciò che non si riesce ad ottenere.' },
  ],
  ru: [
    { text: 'Голодная лисица увидела виноградную лозу со свисающими гроздьями спелого винограда.' },
    { text: 'Виноград казался сочным и аппетитным, и лисица стала прыгать, стараясь его достать.' },
    { text: 'Но сколько она ни прыгала, виноград висел слишком высоко.' },
    { text: 'Наконец она отошла прочь и сказала: «Он ещё зелёный».' },
    { text: 'Мораль: легко презирать то, чего не можешь получить.' },
  ],
  ja: [
    { text: 'お腹を空かせたキツネが、ブドウ棚に実った美しいブドウを見つけました。' },
    { text: 'ブドウは今にも汁が溢れそうなほど熟れていて、キツネは何度も飛び上がって取ろうとしました。' },
    { text: 'しかし、どうしても届きません。' },
    { text: 'とうとうあきらめて立ち去りながら、キツネは言いました。「あのブドウはどうせ酸っぱいに違いない。」' },
    { text: '教訓：手に入らないものを軽蔑するのは簡単なことだ。' },
  ],
  zh: [
    { text: '一只饥饿的狐狸看见葡萄架上挂着一串串成熟的葡萄。' },
    { text: '葡萄看起来又甜又多汁，狐狸跳了一次又一次，想要够到它们。' },
    { text: '但是葡萄挂得太高了，怎么也够不到。' },
    { text: '最后狐狸走开了，说道："那些葡萄一定是酸的。"' },
    { text: '寓意：得不到的东西容易被轻视。' },
  ],
  el: [
    { text: 'Μια πεινασμένη αλεπού είδε ώριμα σταφύλια να κρέμονται ψηλά σε μια κληματαριά.' },
    { text: 'Πήδηξε ξανά και ξανά προσπαθώντας να τα φτάσει, αλλά ήταν πολύ ψηλά.' },
    { text: 'Τελικά έφυγε λέγοντας: "Ούτως ή άλλως ήταν άγουρα."' },
    { text: 'Ηθικό δίδαγμα: Εύκολο να περιφρονείς αυτό που δεν μπορείς να αποκτήσεις.' },
  ],
}

const HARE_TORTOISE = {
  en: [
    { text: 'A Hare was making fun of the Tortoise one day for being so slow.' },
    { text: '"Do you ever get anywhere?" he asked with a mocking laugh.' },
    { text: '"Yes," replied the Tortoise, "and I get there sooner than you think. I\'ll run you a race and prove it."' },
    { text: 'The Hare was much amused at the idea of running a race with the Tortoise, but for the fun of the thing he agreed.' },
    { text: 'The Fox, who had consented to act as judge, marked the distance and started the runners off.' },
    { text: 'The Hare was soon far out of sight, and to make the Tortoise feel very deeply how ridiculous it was for him to try a race with a Hare, he lay down beside the course to take a nap until the Tortoise should catch up.' },
    { text: 'The Tortoise meanwhile kept going slowly but steadily, and, after a time, passed the place where the Hare was sleeping.' },
    { text: 'But the Hare slept on very peacefully; and when at last he did wake up, the Tortoise was near the goal.' },
    { text: 'The Hare now ran his swiftest, but he could not overtake the Tortoise in time.' },
    { text: 'Moral: The race is not always to the swift. Slow and steady wins the race.' },
  ],
  fr: [
    { text: 'Rien ne sert de courir ; il faut partir à point.' },
    { text: 'Le Lièvre et la Tortue en sont un témoignage.' },
    { text: '"Gageons, dit celle-ci, que vous n\'atteindrez point sitôt que moi ce but." "Sitôt ? Êtes-vous sage ? Repartit l\'animal léger. Ma commère, il vous faut purger avec quatre grains d\'ellébore."' },
    { text: 'La Tortue part. Le Lièvre se repose, puis part, puis s\'amuse, puis s\'arrête.' },
    { text: 'La Tortue, cependant, avance à pas comptés. Le Lièvre arriva le dernier et fut bien honteux.' },
    { text: 'Moral : Rien ne sert de courir ; il faut partir à point.' },
  ],
  de: [
    { text: 'Ein Hase verspottete einmal eine Schildkröte wegen ihrer langsamen Beine.' },
    { text: 'Die Schildkröte lachte und sagte: "Ich wette, dass ich schneller am Ziel bin als du!"' },
    { text: 'Der Hase lief los und war bald weit voraus. Er legte sich nieder und schlief ein.' },
    { text: 'Die Schildkröte trottete langsam, aber stetig vorwärts — und kam ans Ziel, während der Hase noch schlief.' },
    { text: 'Moral: Gut Ding will Weile haben. Ausdauer schlägt Schnelligkeit.' },
  ],
  es: [
    { text: 'Una liebre se burlaba de una tortuga por lo despacio que caminaba.' },
    { text: '"¿Alguna vez llegas a algún sitio?" le preguntó con una carcajada.' },
    { text: 'La tortuga respondió: "Te apuesto a que llego a la meta antes que tú." La liebre aceptó el reto.' },
    { text: 'La liebre corrió velozmente, pero pronto se aburrió y se echó a dormir.' },
    { text: 'Mientras tanto, la tortuga avanzó sin prisa pero sin pausa, y cruzó la meta mientras la liebre aún dormía.' },
    { text: 'Moraleja: La constancia vence a la velocidad.' },
  ],
  it: [
    { text: 'Una lepre prendeva in giro una tartaruga per la sua lentezza.' },
    { text: 'La tartaruga rispose con calma: "Ti sfido a una gara di corsa."' },
    { text: 'La lepre partì di gran carriera e, credendo di avere tutto il tempo, si fermò a dormire.' },
    { text: 'La tartaruga invece continuò lentamente ma senza sosta.' },
    { text: 'Quando la lepre si svegliò, la tartaruga era già al traguardo.' },
    { text: 'Morale: Chi va piano va sano e va lontano.' },
  ],
  ru: [
    { text: 'Заяц однажды стал насмехаться над черепахой, потому что она ходила очень медленно.' },
    { text: '"Давай посоревнуемся," — сказала черепаха. — "Я доберусь до цели раньше тебя."' },
    { text: 'Заяц помчался вперёд и вскоре ушёл далеко. Уверенный в своей победе, он лёг отдохнуть и уснул.' },
    { text: 'Черепаха тем временем медленно, но неуклонно шла вперёд.' },
    { text: 'Когда заяц проснулся, черепаха уже была у финиша.' },
    { text: 'Мораль: Тише едешь — дальше будешь.' },
  ],
  ja: [
    { text: 'ある日、ウサギはカメの歩みの遅さをからかいました。' },
    { text: 'カメは言いました。「では競争しましょう。私の方が先にゴールしてみせます。」' },
    { text: 'ウサギはすぐに大きくリードしましたが、余裕をこいて途中で昼寝をしてしまいました。' },
    { text: 'その間、カメはゆっくりとしかし確実に進み続けました。' },
    { text: 'ウサギが目を覚ますと、カメはもうゴールの近くにいました。ウサギは全力で走りましたが間に合いませんでした。' },
    { text: '教訓：遅くても着実に進む者が勝つ。' },
  ],
  zh: [
    { text: '兔子曾经嘲笑乌龟走路太慢。' },
    { text: '乌龟平静地说："我们来赛跑吧，我会先到终点的。"' },
    { text: '兔子跑得很快，遥遥领先，便躺下来睡觉了。' },
    { text: '乌龟一步一步慢慢地向前爬，不停地爬。' },
    { text: '当兔子醒来时，乌龟已经到达终点了。' },
    { text: '寓意：坚持不懈，持之以恒，才能获得成功。' },
  ],
  el: [
    { text: 'Ένας Λαγός κορόιδευε μια Χελώνα για τη βραδύτητά της.' },
    { text: 'Η Χελώνα αποδέχθηκε την πρόκληση για αγώνα δρόμου.' },
    { text: 'Ο Λαγός έτρεξε γρήγορα αλλά σταμάτησε να κοιμηθεί στη μέση.' },
    { text: 'Η Χελώνα συνέχισε αργά αλλά σταθερά.' },
    { text: 'Όταν ο Λαγός ξύπνησε, η Χελώνα ήταν ήδη στο τέρμα.' },
    { text: 'Ηθικό: Η επιμονή νικά την ταχύτητα.' },
  ],
}

const LION_MOUSE = {
  en: [
    { text: 'A Lion lay asleep in the forest, his great head resting on his paws.' },
    { text: 'A timid little Mouse came upon him unexpectedly, and in her fright and haste to get away, ran across the Lion\'s nose.' },
    { text: 'Roused from his nap, the Lion laid his huge paw angrily on the tiny creature to kill her.' },
    { text: '"Spare me!" begged the poor Mouse. "Please let me go and some day I will surely repay you."' },
    { text: 'The Lion was much amused to think that a Mouse could ever help him. But he lifted his paw and let her go.' },
    { text: 'Some days later, while stalking his prey in the forest, the Lion was caught in the toils of a hunter\'s net. Unable to free himself, he filled the forest with his angry roaring.' },
    { text: 'The Mouse knew the voice and quickly found the Lion struggling in the net. Going to work with her sharp little teeth, she soon gnawed the ropes asunder, and the Lion was free.' },
    { text: '"You laughed when I said I would repay you," said the Mouse. "Now you see that even a Mouse can help a Lion."' },
    { text: 'Moral: A kindness is never wasted.' },
  ],
  fr: [
    { text: 'Un lion dormait profondément dans la forêt quand une petite souris lui courut sur le nez.' },
    { text: 'Le lion se réveilla furieux et allait l\'écraser quand la souris le supplia : "Laissez-moi partir, je vous rendrai service un jour."' },
    { text: 'Le lion rit de cette promesse, mais la laissa partir.' },
    { text: 'Quelques jours après, des chasseurs capturèrent le lion dans un filet. Il rugit, incapable de se libérer.' },
    { text: 'La petite souris entendit ses cris, accourut, et rongea les cordes du filet avec ses petites dents.' },
    { text: 'Le lion fut libre. Morale : Il ne faut pas mépriser les petits.' },
  ],
  de: [
    { text: 'Ein Löwe schlief im Wald, als eine kleine Maus über ihn hinweglief.' },
    { text: 'Der Löwe wachte auf und wollte sie töten. Die Maus bat ihn: "Lass mich frei! Vielleicht kann ich dir eines Tages helfen."' },
    { text: 'Der Löwe lachte, ließ sie aber laufen.' },
    { text: 'Kurz darauf wurde der Löwe in einem Netz gefangen. Er brüllte vergeblich.' },
    { text: 'Die kleine Maus kam herbei und zernagt das Netz mit ihren scharfen Zähnen, bis der Löwe frei war.' },
    { text: 'Moral: Wer anderen hilft, erhält auch selbst Hilfe.' },
  ],
  es: [
    { text: 'Un león dormía en el bosque cuando un ratoncillo, sin querer, le pasó por encima.' },
    { text: 'El león se despertó furioso y atrapó al ratón con su garra.' },
    { text: '"¡Por favor, perdóname!" suplicó el ratón. "Algún día podré devolverte el favor."' },
    { text: 'El león soltó al ratón entre carcajadas. ¿Qué podía hacer por él un ratoncillo?' },
    { text: 'Pero días después, el león cayó en una red de cazadores. El ratón oyó sus rugidos, acudió corriendo y roió las cuerdas hasta liberarlo.' },
    { text: 'Moraleja: Nunca se sabe quién puede necesitar tu ayuda ni quién puede ayudarte.' },
  ],
  it: [
    { text: 'Un leone dormiva nella foresta quando un topolino gli corse sul muso.' },
    { text: 'Il leone si svegliò arrabbiato e stava per schiacciare il topolino, ma questi lo supplicò: "Risparmia me! Un giorno ti ripagherò."' },
    { text: 'Il leone rise ma lo lasciò andare.' },
    { text: 'Poco dopo, il leone rimase intrappolato in una rete. Ruggì disperatamente.' },
    { text: 'Il topolino sentì i ruggiti, accorse e con i suoi dentini tagliò le corde liberando il leone.' },
    { text: 'Morale: Non bisogna mai sottovalutare nessuno. Una buona azione trova sempre la sua ricompensa.' },
  ],
  ru: [
    { text: 'Лев спал в лесу, когда маленькая мышка пробежала по его носу.' },
    { text: 'Лев проснулся и хотел её растоптать. Мышка взмолилась: "Пощади меня! Я когда-нибудь отплачу тебе добром."' },
    { text: 'Лев рассмеялся, но отпустил мышку.' },
    { text: 'Вскоре лев попал в сеть охотников и не мог выбраться. Он громко рычал.' },
    { text: 'Мышка услышала рычание, прибежала и перегрызла верёвки острыми зубками. Лев был свободен.' },
    { text: 'Мораль: Не смейся над маленькими — они тоже могут помочь.' },
  ],
}

// ── Curated LibriVox books per language ───────────────────────────────────────

export const LIBRIVOX_BOOKS = [
  {
    lang:         'en',
    title:        "Aesop's Fables, Volume 1 (Fables 1–25)",
    author:       'Aesop',
    librivox_url: 'https://librivox.org/aesops-fables-volume-1-fables-1-25/',
    chapters: [
      { title: 'The Fox and the Grapes',      segments: FOX_GRAPES.en,      parallel: { fr: FOX_GRAPES.fr,      de: FOX_GRAPES.de,      es: FOX_GRAPES.es,      it: FOX_GRAPES.it,      ru: FOX_GRAPES.ru      } },
      { title: 'The Hare and the Tortoise',   segments: HARE_TORTOISE.en,   parallel: { fr: HARE_TORTOISE.fr,   de: HARE_TORTOISE.de,   es: HARE_TORTOISE.es,   it: HARE_TORTOISE.it,   ru: HARE_TORTOISE.ru   } },
      { title: 'The Lion and the Mouse',      segments: LION_MOUSE.en,      parallel: { fr: LION_MOUSE.fr,      de: LION_MOUSE.de,      es: LION_MOUSE.es,      it: LION_MOUSE.it,      ru: LION_MOUSE.ru      } },
    ],
  },
  {
    lang:         'fr',
    title:        "Fables de La Fontaine, Livre I",
    author:       'Jean de La Fontaine',
    librivox_url: 'https://librivox.org/fables-de-la-fontaine-livre-i-by-jean-de-la-fontaine/',
    chapters: [
      { title: 'Le Renard et les Raisins',    segments: FOX_GRAPES.fr,      parallel: { en: FOX_GRAPES.en,      de: FOX_GRAPES.de,      es: FOX_GRAPES.es } },
      { title: 'Le Lièvre et la Tortue',      segments: HARE_TORTOISE.fr,   parallel: { en: HARE_TORTOISE.en,   de: HARE_TORTOISE.de,   es: HARE_TORTOISE.es } },
      { title: 'Le Lion et le Rat',           segments: LION_MOUSE.fr,      parallel: { en: LION_MOUSE.en,      de: LION_MOUSE.de,      es: LION_MOUSE.es } },
    ],
  },
  {
    lang:         'de',
    title:        "Märchen der Brüder Grimm",
    author:       'Jacob & Wilhelm Grimm',
    librivox_url: 'https://librivox.org/maerchen-von-den-gebruedern-grimm-01/',
    chapters: [
      { title: 'Der Fuchs und die Trauben (Äsop)', segments: FOX_GRAPES.de,    parallel: { en: FOX_GRAPES.en,    fr: FOX_GRAPES.fr,    es: FOX_GRAPES.es } },
      { title: 'Der Hase und die Schildkröte',     segments: HARE_TORTOISE.de, parallel: { en: HARE_TORTOISE.en, fr: HARE_TORTOISE.fr, es: HARE_TORTOISE.es } },
      { title: 'Der Löwe und die Maus',            segments: LION_MOUSE.de,    parallel: { en: LION_MOUSE.en,    fr: LION_MOUSE.fr,    es: LION_MOUSE.es } },
    ],
  },
  {
    lang:         'es',
    title:        "Fábulas de Esopo",
    author:       'Esopo',
    librivox_url: 'https://librivox.org/fabulas-de-esopo-by-aesop/',
    chapters: [
      { title: 'El Zorro y las Uvas',         segments: FOX_GRAPES.es,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr,      de: FOX_GRAPES.de } },
      { title: 'La Liebre y la Tortuga',      segments: HARE_TORTOISE.es,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr,   de: HARE_TORTOISE.de } },
      { title: 'El León y el Ratón',          segments: LION_MOUSE.es,      parallel: { en: LION_MOUSE.en,      fr: LION_MOUSE.fr,      de: LION_MOUSE.de } },
    ],
  },
  {
    lang:         'it',
    title:        "Favole di Esopo",
    author:       'Esopo',
    librivox_url: 'https://librivox.org/favole-di-esopo-by-esopo/',
    chapters: [
      { title: 'La Volpe e l\'Uva',          segments: FOX_GRAPES.it,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr,      de: FOX_GRAPES.de } },
      { title: 'La Lepre e la Tartaruga',    segments: HARE_TORTOISE.it,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr,   de: HARE_TORTOISE.de } },
      { title: 'Il Leone e il Topo',         segments: LION_MOUSE.it,      parallel: { en: LION_MOUSE.en,      fr: LION_MOUSE.fr,      de: LION_MOUSE.de } },
    ],
  },
  {
    lang:         'ru',
    title:        "Басни Эзопа",
    author:       'Эзоп',
    librivox_url: 'https://librivox.org/aesops-fables-in-russian/',
    chapters: [
      { title: 'Лиса и виноград',            segments: FOX_GRAPES.ru,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr,      de: FOX_GRAPES.de } },
      { title: 'Заяц и черепаха',            segments: HARE_TORTOISE.ru,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr,   de: HARE_TORTOISE.de } },
      { title: 'Лев и мышь',                 segments: LION_MOUSE.ru,      parallel: { en: LION_MOUSE.en,      fr: LION_MOUSE.fr,      de: LION_MOUSE.de } },
    ],
  },
  {
    lang:         'ja',
    title:        "イソップ寓話集",
    author:       'イソップ',
    librivox_url: 'https://librivox.org/aesops-fables-in-japanese/',
    chapters: [
      { title: 'キツネとブドウ',              segments: FOX_GRAPES.ja,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr } },
      { title: 'ウサギとカメ',               segments: HARE_TORTOISE.ja,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr } },
    ],
  },
  {
    lang:         'zh',
    title:        "伊索寓言",
    author:       '伊索',
    librivox_url: 'https://librivox.org/yi-suo-yu-yan-aesops-fables-in-chinese/',
    chapters: [
      { title: '狐狸和葡萄',                  segments: FOX_GRAPES.zh,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr } },
      { title: '龟兔赛跑',                    segments: HARE_TORTOISE.zh,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr } },
    ],
  },
  {
    lang:         'el',
    title:        "Μύθοι του Αισώπου",
    author:       'Αίσωπος',
    librivox_url: 'https://librivox.org/mythoi-tou-aisopou-fables-of-aesop-in-modern-greek/',
    chapters: [
      { title: 'Η Αλεπού και τα Σταφύλια',  segments: FOX_GRAPES.el,      parallel: { en: FOX_GRAPES.en,      fr: FOX_GRAPES.fr,      de: FOX_GRAPES.de } },
      { title: 'Ο Λαγός και η Χελώνα',       segments: HARE_TORTOISE.el,   parallel: { en: HARE_TORTOISE.en,   fr: HARE_TORTOISE.fr,   de: HARE_TORTOISE.de } },
    ],
  },
]
