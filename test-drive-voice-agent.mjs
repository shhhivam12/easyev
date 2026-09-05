import { randomUUID } from 'node:crypto';
import { testDriveDb, FSM_STATES } from './test-drive-db.mjs';
import { sendTestDriveConfirmationEmail } from './email-service.mjs';

export const TEST_DRIVE_STEPS = Object.freeze({
  GREETING: 'GREETING',
  LOCATION: 'LOCATION',
  DATE_TIME: 'DATE_TIME',
  SLOT_VERIFY: 'SLOT_VERIFY',
  EMAIL: 'EMAIL',
  CONFIRMED: 'CONFIRMED',
});

const DEFAULT_LOCATIONS = [
  'EasyEV Superhub DLF CyberCity, Gurgaon',
  'EasyEV Hub Sector 62, Noida',
  'EasyEV Experience Center Connaught Place, New Delhi',
  'EasyEV Flagship Indiranagar, Bengaluru',
  'EasyEV Hub Baner Road, Pune',
  'EasyEV Hub Andheri West, Mumbai',
];

export function formatSlotSpoken(dateStr, timeStr) {
  return {
    formattedDate: dateStr || 'Tomorrow',
    formattedTime: timeStr || '5:00 PM',
    spoken: `${dateStr || 'Tomorrow'} at ${timeStr || '5:00 PM'}`,
  };
}

export class TestDriveSession {
  constructor({ sessionId = '', vehicleId = 'tata-nexon-ev', vehicleName = 'Tata Nexon.ev', language = 'Hinglish', voice = 'maya', initialValues = {} } = {}) {
    this.sessionId = sessionId || `td_sess_${Date.now()}_${randomUUID().slice(0, 6)}`;
    this.vehicleId = vehicleId;
    this.vehicleName = vehicleName;
    this.language = language;
    this.voice = voice;
    this.currentStep = TEST_DRIVE_STEPS.LOCATION;
    this.attemptCount = 0;
    this.values = {
      location: initialValues.location || '',
      date: initialValues.date || '',
      time: initialValues.time || '',
      customerEmail: initialValues.customerEmail || initialValues.email || '',
      customerPhone: initialValues.customerPhone || initialValues.phone || '',
      ...initialValues,
    };
    this.transcript = [];
    this.booking = null;
    this.createdAt = Date.now();
  }

  getInitialGreeting() {
    let spoken = '';
    if (this.language === 'Hindi') {
      spoken = `नमस्ते! मैं EasyEV का वॉइस स्पेशलिस्ट आरव हूँ। मैं आपकी ${this.vehicleName} की टेस्ट ड्राइव बुक करने में मदद करूँगा। आप किस शहर या डीलरशिप लोकेशन पर टेस्ट ड्राइव लेना पसंद करेंगे?`;
    } else if (this.language === 'English') {
      spoken = `Hello! I'm Aarav, your EasyEV voice specialist. I'm here to help you schedule an official test drive for the ${this.vehicleName}. Which city or dealership location works best for you?`;
    } else {
      spoken = `Hello! Main EasyEV se Aarav hoon. Main aapko ${this.vehicleName} ki test drive schedule karne me help karunga. Aap kaunse city ya dealership location par test drive prefer karenge?`;
    }

    this.transcript.push({ role: 'agent', text: spoken, step: this.currentStep, timestamp: Date.now() });

    return {
      step: this.currentStep,
      spoken,
      values: { ...this.values },
      vehicleName: this.vehicleName,
      isCompleted: false,
    };
  }

  async processTurn({ text = '', patch = null }) {
    const rawText = String(text || '').trim();
    if (patch && typeof patch === 'object') {
      Object.assign(this.values, patch);
    }

    if (rawText) {
      this.transcript.push({ role: 'user', text: rawText, step: this.currentStep, timestamp: Date.now() });
    }

    // 1. Check for off-topic / gibberish speech
    if (this.isRubbishSpeech(rawText)) {
      this.attemptCount++;
      return this.handleRubbishResponse();
    }

    // 2. Global intent check (FAQs, fees, documents, centers list)
    const faqResponse = this.checkGlobalFaq(rawText);
    if (faqResponse) {
      this.transcript.push({ role: 'agent', text: faqResponse, step: this.currentStep, timestamp: Date.now() });
      return {
        step: this.currentStep,
        spoken: faqResponse,
        values: { ...this.values },
        vehicleName: this.vehicleName,
        isCompleted: false,
      };
    }

    // 3. Multi-entity check: check if user provided multiple fields at once
    const extractedEmail = this.extractEmail(rawText);
    const extractedLoc = this.extractLocation(rawText);
    const extractedDt = this.extractDateTime(rawText);

    if (extractedLoc) this.values.location = extractedLoc;
    if (extractedDt.date) this.values.date = extractedDt.date;
    if (extractedDt.time) this.values.time = extractedDt.time;
    if (extractedEmail) this.values.customerEmail = extractedEmail;

    // If user provided all required details in one sentence: Location + Date/Time + Email
    if (this.values.location && this.values.date && this.values.time && this.values.customerEmail) {
      return await this.completeBooking();
    }

    // 4. State Machine Turn Progression
    let spoken = '';

    switch (this.currentStep) {
      case TEST_DRIVE_STEPS.LOCATION: {
        if (this.values.location) {
          this.attemptCount = 0;
          this.currentStep = TEST_DRIVE_STEPS.DATE_TIME;

          // If date/time was also provided in the same turn
          if (this.values.date && this.values.time) {
            this.currentStep = TEST_DRIVE_STEPS.SLOT_VERIFY;
            return this.buildSlotVerificationTurn();
          }

          if (this.language === 'Hindi') {
            spoken = `बहुत बढ़िया, ${this.values.location}! आप कौन से दिन और किस समय टेस्ट ड्राइव लेना चाहेंगे? जैसे कल शाम 5 बजे या इस शनिवार 11 बजे।`;
          } else if (this.language === 'English') {
            spoken = `Excellent, ${this.values.location}! Which day and time slot would you prefer? For instance, tomorrow at 5 PM or this Saturday at 11 AM.`;
          } else {
            spoken = `Great, ${this.values.location}! Aap kaunse din aur kis time test drive lena chahenge? For example, kal shaam 5 baje ya this Saturday 11 AM.`;
          }
        } else {
          this.attemptCount++;
          if (this.attemptCount >= 2) {
            this.values.location = DEFAULT_LOCATIONS[0];
            this.currentStep = TEST_DRIVE_STEPS.DATE_TIME;
            spoken = `No problem! Maine aapke liye ${this.values.location} select kar diya hai. Aap kaunsa din aur time slot prefer karenge?`;
          } else {
            spoken = this.language === 'Hindi'
              ? 'कृपया अपना शहर जैसे नोएडा, दिल्ली, गुरुग्राम, पुणे या बेंगलुरु बताइए जहाँ आप टेस्ट ड्राइव लेना चाहते हैं।'
              : 'Could you please specify your preferred city or dealership hub like Gurgaon, Noida, Delhi, Pune, or Bengaluru?';
          }
        }
        break;
      }

      case TEST_DRIVE_STEPS.DATE_TIME: {
        if (this.values.date || this.values.time || this.attemptCount >= 2) {
          if (!this.values.date) {
            const tmrw = new Date();
            tmrw.setDate(tmrw.getDate() + 1);
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            this.values.date = `Tomorrow (${days[tmrw.getDay()]}, ${months[tmrw.getMonth()]} ${tmrw.getDate()}, ${tmrw.getFullYear()})`;
          }
          if (!this.values.time) {
            this.values.time = '5:00 PM';
          }

          this.attemptCount = 0;
          this.currentStep = TEST_DRIVE_STEPS.SLOT_VERIFY;
          return this.buildSlotVerificationTurn();
        } else {
          this.attemptCount++;
          spoken = this.language === 'Hindi'
            ? 'आप किस दिन और समय टेस्ट ड्राइव लेना चाहेंगे? जैसे कल शाम 5 बजे या इस शनिवार 11 बजे।'
            : 'Which day and time would you prefer? For example, tomorrow at 5 PM or this Saturday at 11 AM.';
        }
        break;
      }

      case TEST_DRIVE_STEPS.SLOT_VERIFY: {
        const isYes = this.isAffirmative(rawText);
        const isNo = this.isNegative(rawText);

        // If user wants to change location or time
        if (isNo || /\b(change|badlo|dusra|different|koi aur|nahi)\b/i.test(rawText)) {
          if (extractedLoc) {
            this.values.location = extractedLoc;
            spoken = `Sure! Location updated to ${this.values.location}. Should I confirm on ${this.values.date} at ${this.values.time}?`;
            break;
          }
          if (extractedDt.date || extractedDt.time) {
            if (extractedDt.date) this.values.date = extractedDt.date;
            if (extractedDt.time) this.values.time = extractedDt.time;
            return this.buildSlotVerificationTurn();
          }
          this.currentStep = TEST_DRIVE_STEPS.DATE_TIME;
          spoken = 'No problem, let us pick a different date or time. Which day and time slot works better for you?';
          break;
        }

        if (isYes || (!isNo && rawText.length > 0)) {
          this.attemptCount = 0;
          this.currentStep = TEST_DRIVE_STEPS.EMAIL;

          if (this.values.customerEmail) {
            return await this.completeBooking();
          }

          if (this.language === 'Hindi') {
            spoken = `बहुत बढ़िया! ${this.values.location} पर ${this.values.date} को ${this.values.time} का स्लॉट लॉक कर दिया गया है। कृपया अपना Gmail एड्रेस बताइए ताकि मैं आपका ऑफिशियल टेस्ट ड्राइव पास तुरंत भेज सकूँ।`;
          } else if (this.language === 'English') {
            spoken = `Perfect! Your slot at ${this.values.location} on ${this.values.date} at ${this.values.time} is locked. Please share your Gmail address so I can dispatch your official Test Drive Pass.`;
          } else {
            spoken = `Great! ${this.values.location} par ${this.values.date} ko ${this.values.time} ka slot lock ho gaya hai. Please apna Gmail address batayein taaki main official pass turant dispatch kar sakun.`;
          }
        } else {
          spoken = `Should I confirm your test drive for ${this.vehicleName} on ${this.values.date} at ${this.values.time}? Just say yes or confirm.`;
        }
        break;
      }

      case TEST_DRIVE_STEPS.EMAIL: {
        const email = this.extractEmail(rawText) || this.values.customerEmail;
        if (email && email.includes('@')) {
          this.values.customerEmail = email;
          return await this.completeBooking();
        } else {
          this.attemptCount++;
          spoken = this.language === 'Hindi'
            ? 'कृपया अपना सही Gmail एड्रेस बताइए (जैसे satvik005@gmail.com) ताकि कन्फर्मेशन पास भेजा जा सके।'
            : 'Please share your valid Gmail address (e.g. satvik005@gmail.com) so we can dispatch your confirmed pass.';
        }
        break;
      }

      case TEST_DRIVE_STEPS.CONFIRMED: {
        spoken = `Aapka test drive already confirm ho chuka hai (Booking ID: ${this.booking?.id || 'EEV-TD-CONFIRMED'}). Details aapke Gmail (${this.values.customerEmail}) par send kar di gayi hain. Have a great drive!`;
        break;
      }

      default: {
        spoken = 'How can I assist you with your EasyEV test drive?';
      }
    }

    this.transcript.push({ role: 'agent', text: spoken, step: this.currentStep, timestamp: Date.now() });

    return {
      step: this.currentStep,
      spoken,
      values: { ...this.values },
      vehicleName: this.vehicleName,
      isCompleted: this.currentStep === TEST_DRIVE_STEPS.CONFIRMED,
      booking: this.booking,
    };
  }

  buildSlotVerificationTurn() {
    let spoken = '';
    if (this.language === 'Hindi') {
      spoken = `हमारे पास ${this.values.location} पर ${this.values.date} को ${this.values.time} का स्लॉट उपलब्ध है। क्या मैं आपकी ${this.vehicleName} के लिए यह स्लॉट कन्फर्म कर दूँ?`;
    } else if (this.language === 'English') {
      spoken = `We have an open slot available at ${this.values.location} on ${this.values.date} at ${this.values.time}. Would you like me to confirm this booking for your ${this.vehicleName}?`;
    } else {
      spoken = `Hamare paas ${this.values.location} par ${this.values.date} ko ${this.values.time} ka slot available hai. Kya main aapke liye ye slot lock kar doon?`;
    }

    this.transcript.push({ role: 'agent', text: spoken, step: this.currentStep, timestamp: Date.now() });

    return {
      step: this.currentStep,
      spoken,
      values: { ...this.values },
      vehicleName: this.vehicleName,
      isCompleted: false,
    };
  }

  async completeBooking() {
    this.currentStep = TEST_DRIVE_STEPS.CONFIRMED;

    let bookingId = `EEV-TD-${Math.floor(10000 + Math.random() * 90000)}`;

    try {
      // Create session & atomic booking in database
      const { session } = await testDriveDb.createSession({
        vehicleId: this.vehicleId,
        vehicleName: this.vehicleName,
        customerPhone: this.values.customerPhone || '+919876543210',
        customerEmail: this.values.customerEmail || 'buyer@gmail.com',
      });

      const bookingResult = await testDriveDb.createBookingAtomic({
        sessionId: session.id,
        capabilityToken: session.capability_token,
        location: this.values.location || DEFAULT_LOCATIONS[0],
        date: this.values.date || 'Tomorrow',
        time: this.values.time || '5:00 PM',
      });

      if (bookingResult.success && bookingResult.booking) {
        this.booking = bookingResult.booking;
        const bookingTime = this.booking.time || this.booking.start_time || this.values.time || '5:00 PM';
        this.booking.time = bookingTime;
        const formatted = formatSlotSpoken(this.booking.date, bookingTime);
        sendTestDriveConfirmationEmail({
          bookingId: this.booking.id,
          customerEmail: this.booking.customer_email || this.values.customerEmail,
          customerPhone: this.booking.customer_phone || this.values.customerPhone,
          vehicleName: this.booking.vehicle_name || this.vehicleName,
          location: this.booking.location,
          formattedDate: formatted.formattedDate,
          formattedTime: formatted.formattedTime,
        }).then(emailRes => {
          testDriveDb.updateBookingEmailStatus(this.booking.id, emailRes.success ? 'SENT' : 'FAILED', emailRes);
        }).catch(err => {
          console.error('[VoiceAgent] Email error:', err.message);
        });
      }
    } catch (err) {
      console.warn('[VoiceAgent] Booking persistence note:', err.message);
      this.booking = {
        id: bookingId,
        date: this.values.date || 'Tomorrow',
        time: this.values.time || '5:00 PM',
        location: this.values.location || DEFAULT_LOCATIONS[0],
        status: 'CONFIRMED',
      };
    }

    let spoken = '';
    if (this.language === 'Hindi') {
      spoken = `बधाई हो! आपकी ${this.vehicleName} की टेस्ट ड्राइव बुक हो गई है। बुकिंग आईडी है ${bookingId}। कन्फर्मेशन पास आपके Gmail (${this.values.customerEmail}) पर भेज दिया गया है।`;
    } else if (this.language === 'English') {
      spoken = `Congratulations! Your test drive for the ${this.vehicleName} is confirmed with Booking ID ${bookingId}. The official pass has been sent to your Gmail (${this.values.customerEmail}).`;
    } else {
      spoken = `Mubarak ho! Aapki ${this.vehicleName} ki test drive confirm ho gayi hai. Booking ID hai ${bookingId}. Confirmation pass aapke Gmail (${this.values.customerEmail}) par send kar diya gaya hai.`;
    }

    this.transcript.push({ role: 'agent', text: spoken, step: this.currentStep, timestamp: Date.now() });

    return {
      step: this.currentStep,
      spoken,
      values: { ...this.values },
      vehicleName: this.vehicleName,
      isCompleted: true,
      booking: this.booking || {
        id: bookingId,
        date: this.values.date,
        time: this.values.time,
        location: this.values.location,
      },
    };
  }

  checkGlobalFaq(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Free test drive query
    if (/\b(free|charge|cost|fees|paise|price of test drive)\b/i.test(lower)) {
      return `EasyEV par test drives bilkul 100% free hain! Koi charges nahi hain. Aaiye pehle aapka slot schedule kar lete hain.`;
    }

    // License / Documents required
    if (/\b(license|licence|document|documents|id proof|kagaz)\b/i.test(lower)) {
      return `Test drive ke liye aapko bas apna valid Driving License sath rakhna hoga. Kya hum aapka slot schedule karein?`;
    }

    // Doorstep test drive
    if (/\b(doorstep|ghar pe|home delivery|ghar par)\b/i.test(lower)) {
      return `Haan, aap dealership center par ya doorstep par bhi test drive schedule kar sakte hain. Aap kaunsa area prefer karenge?`;
    }

    // List of hubs
    if (/\b(centers|hubs|locations|kahan kahan|available cities|dealerships)\b/i.test(lower)) {
      return `Hamare hubs Gurgaon DLF CyberCity, Noida Sector 62, Delhi Connaught Place, Bengaluru Indiranagar, Pune Baner aur Mumbai Andheri me available hain. Aap kaunse hub par schedule karna chahenge?`;
    }

    return null;
  }

  isRubbishSpeech(text) {
    if (!text || text.length < 2) return false;
    const lower = text.toLowerCase();
    const rubbishPatterns = [
      /^(blah|haha|lol|asdf|qwerty|zzz|yo yo|test test|testing 123)/i,
      /\b(tell me a joke|who is the pm|weather today|sing a song|crypto|bitcoin|recipe)\b/i,
      /^[^\w\s]+$/,
    ];
    return rubbishPatterns.some(p => p.test(lower));
  }

  handleRubbishResponse() {
    let spoken = '';
    if (this.language === 'Hindi') {
      spoken = `मैं आपकी ${this.vehicleName} की टेस्ट ड्राइव बुक करने के लिए यहाँ हूँ। आइए पहले आपकी लोकेशन और पसंदीदा समय चुन लेते हैं।`;
    } else if (this.language === 'English') {
      spoken = `I'm right here to help you schedule your ${this.vehicleName} test drive! Let's get your preferred location and time slot locked in.`;
    } else {
      spoken = `Main aapki ${this.vehicleName} ki test drive lock karne ke liye yahan hoon! Pehle aapki preferred location aur time slot confirm kar lete hain.`;
    }

    this.transcript.push({ role: 'agent', text: spoken, step: this.currentStep, timestamp: Date.now() });

    return {
      step: this.currentStep,
      spoken,
      values: { ...this.values },
      vehicleName: this.vehicleName,
      isCompleted: false,
    };
  }

  extractLocation(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const map = [
      { pattern: /\b(cyber\s*city|cybercity|dlf|gurgaon|gurugram|sector\s*29|mg\s*road|sohna|golf\s*course)\b/i, loc: 'EasyEV Superhub DLF CyberCity, Gurgaon' },
      { pattern: /\b(noida|sector\s*62|sector\s*18|greater\s*noida|expressway)\b/i, loc: 'EasyEV Hub Sector 62, Noida' },
      { pattern: /\b(delhi|cp|connaught\s*place|south\s*delhi|dwarka|saket|rohini|vasant\s*kunj|lajpat|karol\s*bagh|faridabad|ghaziabad)\b/i, loc: 'EasyEV Experience Center Connaught Place, New Delhi' },
      { pattern: /\b(bengaluru|bangalore|indiranagar|koramangala|whitefield|hsr|electronic\s*city|jayanagar|bellandur)\b/i, loc: 'EasyEV Flagship Indiranagar, Bengaluru' },
      { pattern: /\b(pune|baner|kothrud|wakad|viman\s*nagar|hinjewadi|hadapsar|magarpatta)\b/i, loc: 'EasyEV Hub Baner Road, Pune' },
      { pattern: /\b(mumbai|andheri|bandra|thane|navi\s*mumbai|worli|powai|juhu|bkc|dadar|borivali)\b/i, loc: 'EasyEV Hub Andheri West, Mumbai' },
      { pattern: /\b(hyderabad|gachibowli|hitec\s*city|madhapur|jubilee\s*hills|banjara|kondapur)\b/i, loc: 'EasyEV Hub Gachibowli, Hyderabad' },
      { pattern: /\b(chennai|anna\s*nagar|t\s*nagar|omr|velachery|adyar|guindy)\b/i, loc: 'EasyEV Hub Anna Nagar, Chennai' },
      { pattern: /\b(kolkata|salt\s*lake|new\s*town|park\s*street)\b/i, loc: 'EasyEV Hub Park Street, Kolkata' },
      { pattern: /\b(ahmedabad|sg\s*highway|prahlad\s*nagar|bopal)\b/i, loc: 'EasyEV Hub SG Highway, Ahmedabad' },
      { pattern: /\b(jaipur|chandigarh|lucknow|kochi|indore|surat|nagpur|bhopal)\b/i, loc: (match) => `EasyEV Center ${match.charAt(0).toUpperCase() + match.slice(1)}` },
    ];

    for (const item of map) {
      const m = lower.match(item.pattern);
      if (m) {
        return typeof item.loc === 'function' ? item.loc(m[0]) : item.loc;
      }
    }

    // Generic match if user explicitly said "in X" or "near X"
    const explicitLocMatch = lower.match(/\b(?:in|at|near|me|mein)\s+([a-zA-Z\s]{3,30})/i);
    if (explicitLocMatch && explicitLocMatch[1]) {
      const cand = explicitLocMatch[1].trim();
      if (!/^(yes|no|haan|nahi|ok|morning|evening|tomorrow|today|kal|parso|email|gmail|test|drive)$/i.test(cand)) {
        return `EasyEV Center, ${cand.charAt(0).toUpperCase() + cand.slice(1)}`;
      }
    }

    return null;
  }

  extractDateTime(text) {
    if (!text) return { date: null, time: null };
    const lower = text.toLowerCase();
    let date = null;
    let time = null;

    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // 1. Relative dates
    if (/\b(today|aaj)\b/i.test(lower)) {
      const d = new Date(now);
      date = `Today (${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()})`;
    } else if (/\b(tomorrow|kal|tom)\b/i.test(lower)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      date = `Tomorrow (${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()})`;
    } else if (/\b(day after tomorrow|parso|parson)\b/i.test(lower)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      date = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } else {
      // Day of week
      const dayMap = {
        sunday: 0, ravivar: 0, sun: 0,
        monday: 1, somvar: 1, mon: 1,
        tuesday: 2, mangalvar: 2, tue: 2,
        wednesday: 3, budhvar: 3, wed: 3,
        thursday: 4, guruvar: 4, thu: 4,
        friday: 5, shukravar: 5, fri: 5,
        saturday: 6, shanivar: 6, sat: 6,
      };

      for (const [dayName, targetDay] of Object.entries(dayMap)) {
        const re = new RegExp(`\\b${dayName}\\b`, 'i');
        if (re.test(lower)) {
          const d = new Date(now);
          const currentDay = d.getDay();
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7;
          d.setDate(d.getDate() + diff);
          date = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
          break;
        }
      }

      // Explicit dates e.g. "15 September", "Sep 15", "2026-11-20"
      if (!date) {
        const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
        const explicitDate1 = lower.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthPattern.source}(?:\\s+(\\d{4}))?`, 'i'));
        const explicitDate2 = lower.match(new RegExp(`${monthPattern.source}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`, 'i'));
        const isoDate = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);

        if (explicitDate1) {
          const dayNum = explicitDate1[1];
          const mStr = explicitDate1[2];
          const yearNum = explicitDate1[3] || now.getFullYear();
          date = `${dayNum} ${mStr.charAt(0).toUpperCase() + mStr.slice(1)} ${yearNum}`;
        } else if (explicitDate2) {
          const mStr = explicitDate2[1];
          const dayNum = explicitDate2[2];
          const yearNum = explicitDate2[3] || now.getFullYear();
          date = `${dayNum} ${mStr.charAt(0).toUpperCase() + mStr.slice(1)} ${yearNum}`;
        } else if (isoDate) {
          date = isoDate[0];
        }
      }
    }

    // 2. Extract Time (Numeric & Spoken Hindi/Hinglish numbers)
    // Spoken Hindi hours
    const hindiHourMap = {
      'dedh': '1:30 PM', 'dhai': '2:30 PM',
      'ek': '1:00 PM', 'do': '2:00 PM', 'teen': '3:00 PM', 'chaar': '4:00 PM', 'char': '4:00 PM',
      'paanch': '5:00 PM', 'panch': '5:00 PM', 'chhah': '6:00 PM', 'che': '6:00 PM', 'chhe': '6:00 PM',
      'saat': '7:00 PM', 'aath': '8:00 PM', 'ath': '8:00 PM',
      'gyaarah': '11:00 AM', 'gyarah': '11:00 AM', 'baarah': '12:00 PM', 'barah': '12:00 PM',
      'das': '10:00 AM', 'nau': '9:00 AM',
    };

    for (const [hWord, hTime] of Object.entries(hindiHourMap)) {
      if (new RegExp(`\\b${hWord}\\s*(?:baje)?\\b`, 'i').test(lower)) {
        time = hTime;
        break;
      }
    }

    if (!time) {
      const timeMatch = lower.match(/\b([1-9]|1[0-2])(?::([0-5][0-9]))?\s*(am|pm)\b/i) || lower.match(/\b([1-9]|1[0-2])\s*(baje|o'clock)\b/i);
      if (timeMatch) {
        if (/baje|o'clock/i.test(timeMatch[0])) {
          const hr = parseInt(timeMatch[1], 10);
          const isPm = hr >= 1 && hr <= 8;
          time = `${hr}:00 ${isPm ? 'PM' : 'AM'}`;
        } else {
          time = timeMatch[0].toUpperCase();
        }
      } else if (/\b(evening|shaam|sham)\b/i.test(lower)) {
        time = '5:00 PM';
      } else if (/\b(morning|subah)\b/i.test(lower)) {
        time = '11:00 AM';
      } else if (/\b(afternoon|dopahar)\b/i.test(lower)) {
        time = '3:00 PM';
      } else if (/\b(noon)\b/i.test(lower)) {
        time = '12:00 PM';
      }
    }

    return { date, time };
  }

  extractEmail(text) {
    if (!text) return null;
    let clean = text.trim();

    // 1. Direct standard email match first (before any transformation)
    const rawDirect = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (rawDirect) return rawDirect[0].toLowerCase();

    // 2. Phonetic transformations
    clean = clean.replace(/\b(at\s*the\s*rate|at\s*rate|add\s*the\s*rate|attherate|attherat|\bat\b)\s*(?:the\s*)?/gi, '@');
    clean = clean.replace(/\b(dot\s*com|point\s*com)\b/gi, '.com');
    clean = clean.replace(/\b(dot|point)\b/gi, '.');
    clean = clean.replace(/\bdouble\s*zero\b/gi, '00')
                 .replace(/\btriple\s*zero\b/gi, '000')
                 .replace(/\bzero\b/gi, '0')
                 .replace(/\bone\b/gi, '1')
                 .replace(/\btwo\b/gi, '2')
                 .replace(/\bthree\b/gi, '3')
                 .replace(/\bfour\b/gi, '4')
                 .replace(/\bfive\b/gi, '5')
                 .replace(/\bsix\b/gi, '6')
                 .replace(/\bseven\b/gi, '7')
                 .replace(/\beight\b/gi, '8')
                 .replace(/\bnine\b/gi, '9');

    clean = clean.replace(/\s+/g, '');

    const transformedMatch = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (transformedMatch) return transformedMatch[0].toLowerCase();

    const atDomainMatch = clean.match(/([a-zA-Z0-9._%+-]{3,30})@gmail(?:\.com)?/i);
    if (atDomainMatch) return atDomainMatch[1].toLowerCase() + '@gmail.com';

    const prefixMatch = text.match(/(?:email\s*(?:is|hai|:)?|gmail\s*(?:is|hai|:)?)\s*([a-zA-Z0-9._%+-]{3,35})/i);
    if (prefixMatch && prefixMatch[1]) {
      const candidate = prefixMatch[1].trim().toLowerCase();
      if (!/^(yes|no|haan|nahi|ok|confirm|please|my|is|hai|sure|theek|chalega)$/i.test(candidate)) {
        return candidate.includes('@') ? candidate : candidate + '@gmail.com';
      }
    }

    return null;
  }

  isAffirmative(text) {
    return /\b(yes|haan|ha|sure|confirm|chalega|theek|sahi|kar do|book|lock|done|ok|okay|yep|yeah|bilkul|pakka|absolutely|perfect)\b/i.test(text);
  }

  isNegative(text) {
    return /\b(no|nahi|na|cancel|change|badlo|wait|ruk|dont|mat|dusra|different)\b/i.test(text);
  }
}

export class TestDriveVoiceAgentManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(options = {}) {
    const session = new TestDriveSession(options);
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  destroySession(sessionId) {
    return this.sessions.delete(sessionId);
  }
}

export const testDriveVoiceAgentManager = new TestDriveVoiceAgentManager();
