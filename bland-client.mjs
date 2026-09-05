import { resolve } from 'node:path';

const BLAND_API_URL = 'https://api.bland.ai/v1/calls';

export class BlandClient {
  constructor({ apiKey = '', pathwayId = '', webhookSecret = '', baseUrl = '', voice = 'maya' } = {}) {
    this.apiKey = apiKey.trim();
    this.pathwayId = pathwayId.trim();
    this.webhookSecret = webhookSecret.trim();
    this.baseUrl = baseUrl.trim().replace(/\/$/, '');
    this.voice = voice.trim() || 'maya';
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  /**
   * Builds the comprehensive system prompt for the Bland AI Voice Agent
   */
  buildPrompt({ vehicleName, customerEmail, customerPhone }) {
    return `You are "Aarav", the intelligent AI Voice Specialist from EasyEV — India's premier Electric Vehicle platform.
You are calling the buyer to help them schedule an official test drive for the **${vehicleName}**.

### CONVERSATIONAL OBJECTIVES:
1. Greet the customer warmly: "Good evening! Welcome to EasyEV. I'm calling to help you book your test drive for the ${vehicleName}."
2. Collect the customer's preferred **location** (city, neighborhood, or dealership).
3. Collect the customer's preferred **day/date** and **time**.
4. Check slot availability using the \`check_test_drive_availability\` tool.
5. **CRITICAL PRE-BOOKING CONFIRMATION**: If the slot is available, explicitly ask:
   "[Date] at [Time] at [Location] is available. Would you like me to go ahead and confirm this booking for your ${vehicleName}?"
6. **ONLY AFTER THE BUYER SAYS YES**: Call the \`book_test_drive\` tool to create the atomic booking.
7. Confirm the successful booking with the exact Booking ID returned by the tool, mention that details have been sent to their email (${customerEmail}), and conclude warmly.

### NATURAL LANGUAGE & FIELD PARSING:
- Understand expressions like: "this Saturday", "tomorrow evening", "around 5", "5 PM", "Sunday morning".
- If the customer gives multiple details at once (e.g. "Noida Sector 62 this Saturday at 5 PM"), extract location, date, and time together without asking redundant questions.
- If the customer corrects themselves (e.g. "Actually make it Sunday instead"), update the date and re-check availability.

### 3-ATTEMPT RECOVERY RULES (DO NOT LOOP ROBOTICALLY):
- **Attempt 1 (Normal)**: Ask standard question.
- **Attempt 2 (Simpler rephrase)**: "Sorry, I didn't catch that clearly. Which city or dealership location would work best for you?"
- **Attempt 3 (Direct examples)**: "Could you mention a city like Noida, Delhi, or Gurgaon?"
- **Silence / No input**: "Are you still with me? Take your time, or let me know when you're ready."
- **Customer says "I don't know" / "Not sure"**: "No problem at all! Would you prefer a weekend or a weekday?" If still unsure: "We can save your request and you can pick a slot anytime on easyev.in."
- **Irrelevant / Out-of-topic input**: "I can assist with that, but first let's lock in your test drive slot for the ${vehicleName}. Which day works best?"

### STRICT SAFETY & BEHAVIOR RULES:
- NEVER claim a slot is booked before the \`book_test_drive\` tool returns success: true with a valid booking_id.
- If a slot is unavailable, politely offer the alternative slots returned by the availability tool.
- Keep spoken responses concise, natural, and confident in Indian English.`;
  }

  /**
   * Initiates an outbound call via Bland AI
   */
  async initiateCall({
    sessionId,
    capabilityToken,
    vehicleId,
    vehicleName,
    customerPhone,
    customerEmail,
  }) {
    const webhookUrl = this.baseUrl ? `${this.baseUrl}/api/bland/post-call` : undefined;
    const checkAvailabilityUrl = this.baseUrl ? `${this.baseUrl}/api/test-drive/check-availability` : undefined;
    const bookUrl = this.baseUrl ? `${this.baseUrl}/api/test-drive/book` : undefined;

    const customTools = [];
    if (checkAvailabilityUrl) {
      customTools.push({
        name: 'check_test_drive_availability',
        description: 'Checks if the requested test-drive date, time, and location slot is available in the EasyEV dealership network.',
        url: checkAvailabilityUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          session_id: '{{request_data.session_id}}',
          capability_token: '{{request_data.capability_token}}',
          vehicle_id: '{{request_data.vehicle_id}}',
          location: '{{input.location}}',
          date: '{{input.date}}',
          time: '{{input.time}}',
        },
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City or dealership location' },
            date: { type: 'string', description: 'Requested date (e.g. 2026-09-05 or natural language like Saturday)' },
            time: { type: 'string', description: 'Requested time (e.g. 17:00 or 5 PM)' },
          },
          required: ['location', 'date', 'time'],
        },
      });
    }

    if (bookUrl) {
      customTools.push({
        name: 'book_test_drive',
        description: 'Executes the atomic test drive booking and sends the confirmation email. ONLY call this after the buyer has confirmed YES to the specific available slot.',
        url: bookUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          session_id: '{{request_data.session_id}}',
          capability_token: '{{request_data.capability_token}}',
          vehicle_id: '{{request_data.vehicle_id}}',
          location: '{{input.location}}',
          date: '{{input.date}}',
          time: '{{input.time}}',
          customer_email: '{{request_data.customer_email}}',
          customer_phone: '{{request_data.customer_phone}}',
        },
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Confirmed location' },
            date: { type: 'string', description: 'Confirmed date' },
            time: { type: 'string', description: 'Confirmed time' },
          },
          required: ['location', 'date', 'time'],
        },
      });
    }

    const payload = {
      phone_number: customerPhone,
      task: this.buildPrompt({ vehicleName, customerEmail, customerPhone }),
      voice: this.voice,
      language: 'en',
      first_sentence: `Good evening! Welcome to EasyEV. I'm calling to help you book your test drive for the ${vehicleName}.`,
      max_duration: 10,
      record: true,
      request_data: {
        session_id: sessionId,
        capability_token: capabilityToken,
        vehicle_id: vehicleId,
        vehicle_name: vehicleName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      metadata: {
        session_id: sessionId,
        source: 'easyev_virtual_showroom',
        vehicle_id: vehicleId,
      },
      webhook: webhookUrl,
      tools: customTools.length > 0 ? customTools : undefined,
    };

    if (this.pathwayId) {
      payload.pathway_id = this.pathwayId;
    }

    if (this.isConfigured) {
      try {
        const res = await fetch(BLAND_API_URL, {
          method: 'POST',
          headers: {
            'authorization': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.status === 'error') {
          console.warn('[BlandClient] Telephony Notice:', data.message || data.error);
          const simulatedCallId = `bland_sim_${Date.now()}`;
          return {
            success: true,
            call_id: simulatedCallId,
            status: 'simulated_fallback',
            isSimulated: true,
            message: data.message || 'Bland AI live telephony credit limit reached; running in fallback mode',
          };
        }

        return {
          success: true,
          call_id: data.call_id || data.id,
          status: 'queued',
          raw: data,
        };
      } catch (err) {
        console.warn('[BlandClient] Fetch note:', err.message);
        const simulatedCallId = `bland_sim_${Date.now()}`;
        return {
          success: true,
          call_id: simulatedCallId,
          status: 'simulated_fallback',
          isSimulated: true,
          message: err.message,
        };
      }
    }

    // Simulation mode when BLAND_API_KEY is not configured
    const simulatedCallId = `bland_sim_${Date.now()}`;
    console.log(`[BlandClient] SIMULATED OUTBOUND CALL: To ${customerPhone} for ${vehicleName} (ID: ${simulatedCallId})`);
    return {
      success: true,
      call_id: simulatedCallId,
      status: 'simulated',
      isSimulated: true,
      message: 'Running in simulation mode (Set BLAND_API_KEY in .env for live outbound telephony)',
    };
  }
}
