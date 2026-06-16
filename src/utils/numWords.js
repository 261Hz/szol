// numWords.js — integer to spoken/written form, 0–9999, for all 15 app languages.
// Returns null for unsupported ranges so callers can fall back to showing the numeral.

function en(n) {
  const ones = ['','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
  if (n < 20) return ones[n]
  if (n < 100) return tens[~~(n/10)] + (n%10 ? '-'+ones[n%10] : '')
  if (n < 1000) { const r=n%100; return ones[~~(n/100)]+' hundred'+(r?' '+en(r):'') }
  const r=n%1000; return en(~~(n/1000))+' thousand'+(r?' '+en(r):'')
}

function es(n) {
  const ones = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve']
  const twenties = ['veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco',
    'veintiséis','veintisiete','veintiocho','veintinueve']
  const tens = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa']
  const hundreds = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
    'seiscientos','setecientos','ochocientos','novecientos']
  if (n === 100) return 'cien'
  if (n < 20) return ones[n]
  if (n < 30) return twenties[n-20]
  if (n < 100) return tens[~~(n/10)] + (n%10 ? ' y '+ones[n%10] : '')
  if (n < 1000) return hundreds[~~(n/100)] + (n%100 ? ' '+es(n%100) : '')
  if (n === 1000) return 'mil'
  const r=n%1000; return es(~~(n/1000))+' mil'+(r?' '+es(r):'')
}

function fr(n) {
  const ones = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
    'dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf']
  const tens = ['','','vingt','trente','quarante','cinquante','soixante']
  if (n < 20) return ones[n]
  if (n < 70) { const u=n%10; return tens[~~(n/10)]+(u===1?' et un':u?'-'+ones[u]:'') }
  if (n < 80) { const u=n-60; return 'soixante'+(u===11?'-et-onze':'-'+ones[u]) }
  if (n < 100) { const u=n-80; return 'quatre-vingt'+(u?'-'+ones[u]:'s') }
  if (n < 1000) {
    const h=~~(n/100); const r=n%100
    return (h===1?'cent':ones[h]+' cent'+(r?'':'s'))+(r?' '+fr(r):'')
  }
  const t=~~(n/1000); const r=n%1000
  return (t===1?'mille':fr(t)+' mille')+(r?' '+fr(r):'')
}

function de(n) {
  const ones = ['','ein','zwei','drei','vier','fünf','sechs','sieben','acht','neun',
    'zehn','elf','zwölf','dreizehn','vierzehn','fünfzehn','sechzehn','siebzehn','achtzehn','neunzehn']
  const tens = ['','','zwanzig','dreißig','vierzig','fünfzig','sechzig','siebzig','achtzig','neunzig']
  if (n < 20) return ones[n]
  if (n < 100) { const u=n%10; return u?ones[u]+'und'+tens[~~(n/10)]:tens[~~(n/10)] }
  if (n < 1000) { const h=~~(n/100); const r=n%100; return (h===1?'ein':ones[h])+'hundert'+(r?de(r):'') }
  const t=~~(n/1000); const r=n%1000; return (t===1?'ein':de(t))+'tausend'+(r?de(r):'')
}

function it(n) {
  const ones = ['','uno','due','tre','quattro','cinque','sei','sette','otto','nove',
    'dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove']
  const tens = ['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta']
  if (n < 20) return ones[n]
  if (n < 100) {
    const t=tens[~~(n/10)]; const u=n%10
    return (u===1||u===8) ? t.slice(0,-1)+ones[u] : t+(u?ones[u]:'')
  }
  if (n < 1000) { const h=~~(n/100); const r=n%100; return (h===1?'cento':ones[h]+'cento')+(r?it(r):'') }
  if (n < 2000) return 'mille'+(n%1000?it(n%1000):'')
  const t=~~(n/1000); const r=n%1000; return it(t)+'mila'+(r?it(r):'')
}

function ja(n) {
  const d = ['','一','二','三','四','五','六','七','八','九']
  const t=~~(n/1000), h=~~(n%1000/100), te=~~(n%100/10), u=n%10
  return (t?(t===1?'':d[t])+'千':'')+(h?(h===1?'':d[h])+'百':'')+(te?(te===1?'':d[te])+'十':'')+(u?d[u]:'')
}

function zh(n) {
  const d = ['','一','二','三','四','五','六','七','八','九']
  const t=~~(n/1000), h=~~(n%1000/100), te=~~(n%100/10), u=n%10
  let s=''
  if (t) s+=(t===1?'一':d[t])+'千'
  if (h) s+=d[h]+'百'; else if (t&&(te||u)) s+='零'
  if (te) s+=(te===1&&!h?'':d[te])+'十'; else if ((t||h)&&u) s+='零'
  if (u) s+=d[u]
  return s
}

function ru(n) {
  const ones  = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять',
    'десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
    'шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const onesF = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять',
    'десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
    'шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const tens  = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']
  const hunds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']
  function below(m, fem=false) {
    if (m<20) return fem?onesF[m]:ones[m]
    if (m<100) return tens[~~(m/10)]+(m%10?' '+(fem?onesF[m%10]:ones[m%10]):'')
    return hunds[~~(m/100)]+(m%100?' '+below(m%100,fem):'')
  }
  if (n<1000) return below(n)
  const t=~~(n/1000); const r=n%1000
  const last2=t%100, last1=t%10
  const tWord = (last2>=11&&last2<=14) ? 'тысяч'
    : last1===1 ? 'тысяча'
    : (last1>=2&&last1<=4) ? 'тысячи'
    : 'тысяч'
  return below(t,true)+' '+tWord+(r?' '+below(r):'')
}

function el(n) {
  const ones = ['','ένα','δύο','τρία','τέσσερα','πέντε','έξι','επτά','οκτώ','εννιά',
    'δέκα','έντεκα','δώδεκα','δεκατρία','δεκατέσσερα','δεκαπέντε','δεκαέξι',
    'δεκαεπτά','δεκαοκτώ','δεκαεννιά']
  const tens  = ['','','είκοσι','τριάντα','σαράντα','πενήντα','εξήντα','εβδομήντα','ογδόντα','ενενήντα']
  const hunds = ['','εκατό','διακόσια','τριακόσια','τετρακόσια','πεντακόσια',
    'εξακόσια','επτακόσια','οκτακόσια','εννιακόσια']
  if (n<20) return ones[n]
  if (n<100) return tens[~~(n/10)]+(n%10?' '+ones[n%10]:'')
  if (n<1000) return hunds[~~(n/100)]+(n%100?' '+el(n%100):'')
  const t=~~(n/1000); const r=n%1000
  return (t===1?'χίλια':el(t)+' χιλιάδες')+(r?' '+el(r):'')
}

function hu(n) {
  const ones = ['','egy','kettő','három','négy','öt','hat','hét','nyolc','kilenc',
    'tíz','tizenegy','tizenkettő','tizenhárom','tizennégy','tizenöt','tizenhat',
    'tizenhét','tizennyolc','tizenkilenc']
  const onesM = ['','egy','két','három','négy','öt','hat','hét','nyolc','kilenc']
  const tens   = ['','','húsz','harminc','negyven','ötven','hatvan','hetven','nyolcvan','kilencven']
  function below100(m) {
    if (m<20) return ones[m]
    const u=m%10; const d=~~(m/10)
    if (d===2) return u ? 'huszon'+ones[u] : 'húsz'
    return u ? tens[d]+ones[u] : tens[d]
  }
  if (n<100) return below100(n)
  if (n<1000) {
    const h=~~(n/100); const r=n%100
    return (h===1?'száz':onesM[h]+'száz')+(r?below100(r):'')
  }
  const t=~~(n/1000); const r=n%1000
  return (t===1?'ezer':onesM[t]+'ezer')+(r?hu(r):'')
}

function he(n) {
  const ones = ['','אחד','שניים','שלושה','ארבעה','חמישה','שישה','שבעה','שמונה','תשעה',
    'עשרה','אחד עשר','שניים עשר','שלושה עשר','ארבעה עשר','חמישה עשר','שישה עשר',
    'שבעה עשר','שמונה עשר','תשעה עשר']
  const tens  = ['','','עשרים','שלושים','ארבעים','חמישים','שישים','שבעים','שמונים','תשעים']
  const hunds = ['','מאה','מאתיים','שלוש מאות','ארבע מאות','חמש מאות','שש מאות','שבע מאות','שמונה מאות','תשע מאות']
  const thous = ['','אלף','אלפיים','שלושת אלפים','ארבעת אלפים','חמשת אלפים',
    'ששת אלפים','שבעת אלפים','שמונת אלפים','תשעת אלפים']
  if (n<20) return ones[n]
  if (n<100) return tens[~~(n/10)]+(n%10?' ו'+ones[n%10]:'')
  if (n<1000) return hunds[~~(n/100)]+(n%100?' ו'+he(n%100):'')
  if (n<10000) return thous[~~(n/1000)]+(n%1000?' ו'+he(n%1000):'')
  return null
}

function ar(n) {
  const ones = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة',
    'عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر',
    'سبعة عشر','ثمانية عشر','تسعة عشر']
  const tens  = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون']
  const hunds = ['','مائة','مئتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة']
  if (n<20) return ones[n]
  if (n<100) return tens[~~(n/10)]+(n%10?' و'+ones[n%10]:'')
  if (n<1000) return hunds[~~(n/100)]+(n%100?' و'+ar(n%100):'')
  if (n===1000) return 'ألف'
  if (n===2000) return 'ألفان'
  const t=~~(n/1000); const r=n%1000
  return (t<3?ar(t)+' آلاف':ar(t)+' آلاف')+(r?' و'+ar(r):'')
}

function arz(n) {
  const ones = ['','واحد','اتنين','تلاتة','أربعة','خمسة','ستة','سبعة','تمانية','تسعة',
    'عشرة','حداشر','اتناشر','تلتاشر','أرباتاشر','خمستاشر','ستاشر',
    'سباتاشر','تمانتاشر','تساتاشر']
  const tens  = ['','','عشرين','تلاتين','أربعين','خمسين','ستين','سبعين','تمانين','تسعين']
  const hunds = ['','مية','ميتين','تلتمية','أربعمية','خمسمية','ستمية','سبعمية','تمنمية','تسعمية']
  if (n<20) return ones[n]
  if (n<100) { const u=n%10; return u?ones[u]+' و'+tens[~~(n/10)]:tens[~~(n/10)] }
  if (n<1000) return hunds[~~(n/100)]+(n%100?' و'+arz(n%100):'')
  if (n===1000) return 'ألف'
  if (n===2000) return 'ألفين'
  const t=~~(n/1000); const r=n%1000
  return arz(t)+' آلاف'+(r?' و'+arz(r):'')
}

function pt(n) {
  const ones = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove',
    'dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove']
  const tens = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa']
  const hunds = ['','cento','duzentos','trezentos','quatrocentos','quinhentos',
    'seiscentos','setecentos','oitocentos','novecentos']
  if (n === 100) return 'cem'
  if (n < 20) return ones[n]
  if (n < 100) { const u=n%10; return tens[~~(n/10)]+(u?' e '+ones[u]:'') }
  if (n < 1000) { const r=n%100; return hunds[~~(n/100)]+(r?' e '+pt(r):'') }
  const t=~~(n/1000); const r=n%1000
  return (t===1?'mil':pt(t)+' mil')+(r?(r<100?' e ':' ')+pt(r):'')
}

function id(n) {
  const ones = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan']
  if (n < 10) return ones[n]
  if (n === 10) return 'sepuluh'
  if (n === 11) return 'sebelas'
  if (n < 20) return ones[n-10]+' belas'
  if (n < 100) { const u=n%10; return ones[~~(n/10)]+' puluh'+(u?' '+ones[u]:'') }
  if (n < 1000) { const h=~~(n/100); const r=n%100; return (h===1?'se':ones[h]+' ')+'ratus'+(r?' '+id(r):'') }
  const t=~~(n/1000); const r=n%1000
  return (t===1?'se':ones[t]+' ')+'ribu'+(r?' '+id(r):'')
}

const ZERO = {
  en:'zero', es:'cero', fr:'zéro', de:'null', it:'zero',
  ru:'ноль', ja:'零', zh:'零', he:'אפס', ar:'صفر',
  arz:'صفر', el:'μηδέν', hu:'nulla', pt:'zero', id:'nol',
}

const HANDLERS = { en, es, fr, de, it, ja, zh, ru, el, hu, he, ar, arz, pt, id }

export function numToWords(n, lang) {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null
  if (n === 0) return ZERO[lang] ?? null
  return HANDLERS[lang]?.(n) ?? null
}
