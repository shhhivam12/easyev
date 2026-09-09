// Prototype testing for affirmative parser & clean utterance extractor

export const AFFIRMATIVE_TERMS = [
  'haan', 'haa', 'ha', 'han', 'haanji', 'haaji', 'haji', 'ji haan', 'ji ha', 'ji',
  'kardo', 'kar do', 'kar dijiye', 'kardijiye', 'kar dena', 'kardena', 'karo',
  'daldo', 'daaldo', 'daal do', 'dal do', 'daal dijiye', 'dal dijiye', 'daal dena', 'dal dena', 'dalo', 'daalo',
  'add kardo', 'add kar do', 'add kar dijiye', 'add karo', 'jod do', 'jod do',
  'available hai', 'available h', 'available', 'milta hai', 'milte hain', 'rehta hai', 'rehte hain', 'hota hai', 'hote hain', 'hoti hai',
  'sahi hai', 'sahi h', 'bilkul sahi', 'bilkul sahi hai', 'ekdam sahi', 'ekdam sahi hai', 'ekdum sahi hai', 'sahi', 'theek hai', 'thik hai', 'theek h', 'thik h', 'bilkul theek', 'theek', 'thik', 'chalega',
  'dete hai', 'dete hain', 'dete h', 'provide karte hai', 'provide karte hain', 'provide hota hai', 'karwate hai', 'karwate hain', 'karate hai', 'karate hain', 'karte hai', 'karte hain', 'deal karte hai',
  'chalo', 'aage chalo', 'aage badho', 'badho', 'aage', 'next', 'proceed', 'continue',
  'sab', 'sab kuch', 'sab hai', 'sab kardo', 'sab daldo', 'sab add kardo', 'sab on kardo', 'sab dete hai', 'sab provide karte hai', 'saare', 'sabhi',
  'dono', 'dono hai', 'dono kardo', 'dono daldo', 'dono dete hai', 'dono available hai', 'dono karwate hai', 'dono chalega',
  'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright', 'perfect', 'done', 'absolutely', 'definitely', 'confirm', 'confirmed', 'confirm kardo', 'submit', 'submit kardo', 'submit kar do'
];

export function isAffirmative(text = '') {
  if (!text) return false;
  const clean = String(text).trim().toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Devanagari affirmations
  if (/(?:हाँ|हां|हा|हाँजी|हांजी|जी\s*हाँ|जी\s*हां|जी|ज़रूर|जरूर|बिल्कुल|बिलकुल|सही|ठीक|उपलब्ध|देते|कर\s*दो|कर\s*दीजिए|डाल\s*दो|डाल\s*दीजिए|सभी|सब|दोनों|करवाते|कराते|करते|कर\s*देना|डाल\s*देना|चलो|आगे|बढ़ो|बढो|सबमिट)/.test(clean)) {
    return true;
  }

  // 2. Exact match / phrase patterns
  const affPattern = /(?:haan+|ha+|han+|haa+|haaji|haanji|haji|yes+|yeah+|yep+|yup+|sure+|ok+|okay+|theek|thik|thek|sahi|bilkul|available|dete|provide|milta|done|kardo|kar\s*do|kar\s*dijiye|kardijiye|kar\s*dena|kardena|karo|daldo|daaldo|daal\s*do|dal\s*do|daal\s*dijiye|dal\s*dijiye|daal\s*dena|dal\s*dena|daalo|dalo|add\s*kardo|add\s*kar\s*do|jod\s*do|rakho|rakhna|confirmed|confirm|chalega|all\s*services|sab\s*kuch|sab\s*hai|sab\s*kardo|sab\s*daldo|sab\s*dete|sab\s*provide|sabhi|saare|dono|dono\s*hai|dono\s*dete|dono\s*kardo|dono\s*daldo|dono\s*available|karte\s*hain|karate\s*hain|karwate\s*hain|dete\s*hain|karte\s*hai|karate\s*hai|karwate\s*hai|dete\s*hai|h|hai|aage|badho|chalo|proceed|next)/i;

  if (affPattern.test(clean)) {
    return true;
  }

  return false;
}

export function isPureAffirmation(text = '') {
  if (!text) return false;
  let str = String(text).trim().toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip all conversational affirmation tokens and fillers
  const tokensToRemove = [
    /\b(?:haan+|ha+|han+|haa+|haaji|haanji|haji|ji\s*haan|ji\s*ha|ji|yes+|yeah+|yep+|yup+|sure+|ok+|okay+|alright|perfect|done|absolutely|definitely)\b/gi,
    /\b(?:kardo|kar\s*do|kar\s*dijiye|kardijiye|kar\s*dena|kardena|karo|karein)\b/gi,
    /\b(?:daldo|daaldo|daal\s*do|dal\s*do|daal\s*dijiye|dal\s*dijiye|daal\s*dena|dal\s*dena|daalo|dalo)\b/gi,
    /\b(?:add\s*kardo|add\s*kar\s*do|add\s*kar\s*dijiye|add\s*karo|add|jod\s*do)\b/gi,
    /\b(?:available\s*hai|available\s*h|available|milta\s*hai|milte\s*hain|rehta\s*hai|rehte\s*hain|hota\s*hai|hote\s*hain|hoti\s*hai)\b/gi,
    /\b(?:sahi\s*hai|sahi\s*h|bilkul\s*sahi|bilkul\s*sahi\s*hai|ekdam\s*sahi|ekdam\s*sahi\s*hai|ekdum\s*sahi\s*hai|sahi|theek\s*hai|thik\s*hai|theek\s*h|thik\s*h|bilkul\s*theek|theek|thik|chalega|bilkul)\b/gi,
    /\b(?:dete\s*hai|dete\s*hain|dete\s*h|provide\s*karte\s*hai|provide\s*karte\s*hain|provide\s*hota\s*hai|provide|karwate\s*hai|karwate\s*hain|karate\s*hai|karate\s*hain|karte\s*hai|karte\s*hain)\b/gi,
    /\b(?:chalo|aage\s*chalo|aage\s*badho|badho|aage|next|proceed|continue)\b/gi,
    /\b(?:sab\s*kuch|sab\s*hai|sab\s*kardo|sab\s*daldo|sab\s*add\s*kardo|sab\s*on\s*kardo|sab\s*dete\s*hai|sab\s*provide\s*karte|sab|sabhi|saare)\b/gi,
    /\b(?:dono\s*hai|dono\s*kardo|dono\s*daldo|dono\s*dete\s*hai|dono\s*available\s*hai|dono\s*karwate\s*hai|dono\s*chalega|dono)\b/gi,
    /\b(?:submit\s*kardo|submit\s*kar\s*do|submit\s*kar\s*dijiye|submit|confirm\s*kardo|confirm\s*kar\s*do|confirm|confirmed)\b/gi,
    /\b(?:bhai|yaar|ji|sir|please|na|to|ab|to\s*fir|hain|hai|h|hoon|me|mein|par|aur|bhi|kar|do|raha|rahe|diya|bol|bola|bolo)\b/gi,
    /(?:हाँ|हां|हा|हाँजी|हांजी|जी\s*हाँ|जी\s*हां|जी|ज़रूर|जरूर|बिल्कुल|बिलकुल|सही\s*है|ठीक\s*है|उपलब्ध\s*है|उपलब्ध|देते\s*हैं|देते|कर\s*दो|कर\s*दीजिए|डाल\s*दो|डाल\s*दीजिए|सभी|सब|दोनों|करवाते\s*हैं|कराते\s*हैं|करते\s*हैं|कर\s*देना|डाल\s*देना|बिल्कुल\s*सही|एकदम\s*सही|सही|ठीक|चलो|आगे|बढ़ो|बढो|सबमिट|जमा)/g
  ];

  for (const pat of tokensToRemove) {
    str = str.replace(pat, ' ');
  }
  str = str.replace(/\s+/g, ' ').trim();

  // If after removing all affirmative & filler tokens nothing substantial remains, it is a pure affirmation!
  return str.length === 0;
}

export function cleanSpokenValue(text = '') {
  if (!text) return '';
  let str = String(text).trim();

  // Strip leading conversational phrases / affirmation prefixes
  str = str.replace(/^(?:(?:haan+|ha+|han+|haa+|haaji|haanji|haji|yes+|yeah+|yep+|yup+|sure+|ok+|okay+|ji\s*haan|ji\s*ha|ji|arre\s*haan|are\s*haan|bhai\s*haan|haan\s*bhai|haa\s*bhai|bhai|yaar|ji|arre|are|suno|sunno|hello|namaste|hi)\s*)+/i, '');
  
  // Strip common field intro prefixes
  str = str.replace(/^(?:hamara|humara|hamare|humare|mera|mere|apna|apne|dealership\s*ka|dealership\s*ki|dealership\s*ke|showroom\s*ka|showroom\s*ki|showroom\s*ke|official|primary|contact\s*person|contact)?\s*(?:naam|name|address|pata|location|phone|mobile|number|email|mail|city|shahar|pincode|pin|brands?|manager|owner)?\s*(?:hai|is|:|=|ka|ki|ke)?\s*(?:likho|likh\s*do|rakho|rakh\s*do|karo|kar\s*do|kardo|daldo|daaldo|daal\s*do|dal\s*do|batao|daal\s*dijiye|kar\s*dijiye)?\s*/i, '');

  // Strip trailing commands / fillers
  str = str.replace(/\s+(?:likh\s*do|likhdo|likho|rakh\s*do|rakhdo|rakho|kardo|kar\s*do|kar\s*dijiye|kardijiye|kar\s*dena|kardena|karo|daldo|daaldo|daal\s*do|dal\s*do|daal\s*dijiye|dal\s*dijiye|daal\s*dena|dal\s*dena|daalo|dalo|add\s*kardo|add\s*kar\s*do|add\s*kar\s*dijiye|add\s*karo|jod\s*do|bhi\s*hai|available\s*hai|available\s*h|available|dete\s*hai|dete\s*hain|karwate\s*hai|karate\s*hai|karte\s*hai|karte\s*hain|sahi\s*hai|theek\s*hai|bhai|yaar|na|hai|is|hoon|h|sir|ji|है|कर\s*दो|डाल\s*दो|लिख\s*दो)$/i, '');

  // Transliterate if Devanagari or cleanup extra spaces
  str = str.replace(/\s+/g, ' ').trim();
  return str;
}

const testList = [
  'haa Shakti Motors daldo',
  'haa kardo',
  'haa daldo',
  'haa available hai',
  'haa sahi hai',
  'haa dete hai',
  'haa provide karte hai',
  'haa dono dete hai',
  'haa sab dete hai',
  'haa bhai',
  'haa hota hai',
  'bilkul dete hai',
  'yes do it',
  'yes add it',
  'haa mera naam Satvik Kesarwani hai',
  'haa Satvik Kesarwani daldo',
  'haa Satvik Kesarwani kardo',
  'haan Satvik Kesarwani',
  'haa Delhi daldo',
  'haa Plot 10 South Extension',
  'haa address Plot 10 Ring Road daldo',
  'haan MG Road Sector 62 kardo',
  'haa sabhi brands',
  'haa all brands',
  'haa Tata Motors aur Mahindra',
  'haa kardo bhai submit',
  'haa submit kardo'
];

console.log('Testing isAffirmative, isPureAffirmation, and cleanSpokenValue:');
for (const t of testList) {
  const isAff = isAffirmative(t);
  const isPure = isPureAffirmation(t);
  const cleaned = cleanSpokenValue(t);
  console.log(`\nInput: "${t}"`);
  console.log(`  isAffirmative: ${isAff} | isPureAffirmation: ${isPure} | cleanedValue: "${cleaned}"`);
}
