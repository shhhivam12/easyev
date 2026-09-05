import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PATHWAY_FILE = resolve(ROOT, 'data/bland-test-drive-pathway.json');

const pathway = {
  name: 'EasyEV Voice Test-Drive Booking Pathway',
  description: 'Production-ready Bland AI Pathway for EasyEV Virtual Showroom Test-Drive Bookings',
  start_node_id: 'node_intro',
  nodes: [
    {
      id: 'node_intro',
      type: 'Default',
      name: 'Intro & Welcome',
      prompt: 'You are Aarav, the intelligent AI specialist from EasyEV. Welcome the buyer warmly: "Good evening! Welcome to EasyEV. I\'m calling to help you book your test drive for the {{vehicle_name}}." Then ask: "Could you please tell me your preferred city or dealership location for the test drive?"',
      extract_variables: [
        { name: 'location', type: 'string', description: 'Buyer preferred city, area, or dealership' },
        { name: 'preferred_date', type: 'string', description: 'Buyer preferred date or day of week' },
        { name: 'preferred_time', type: 'string', description: 'Buyer preferred time or part of day' }
      ]
    },
    {
      id: 'node_location_retry_1',
      type: 'Default',
      name: 'Location Retry 1',
      prompt: 'Sorry, I didn\'t catch that location. Which city or dealership location would work best for you?'
    },
    {
      id: 'node_location_retry_2',
      type: 'Default',
      name: 'Location Retry 2',
      prompt: 'Could you please mention a specific city, like Noida, Delhi, or Gurgaon, where you would like the test drive?'
    },
    {
      id: 'node_ask_date_time',
      type: 'Default',
      name: 'Ask Date & Time',
      prompt: 'Great, location recorded as {{location}}. Which day and time would you prefer for taking the {{vehicle_name}} out for a spin?',
      extract_variables: [
        { name: 'preferred_date', type: 'string', description: 'Day or date' },
        { name: 'preferred_time', type: 'string', description: 'Time of day' }
      ]
    },
    {
      id: 'node_check_availability',
      type: 'Webhook',
      name: 'Check Availability Tool',
      url: '{{backend_url}}/api/test-drive/check-availability',
      method: 'POST',
      body: {
        session_id: '{{session_id}}',
        capability_token: '{{capability_token}}',
        vehicle_id: '{{vehicle_id}}',
        location: '{{location}}',
        date: '{{preferred_date}}',
        time: '{{preferred_time}}'
      },
      response_variables: [
        { name: 'is_available', path: 'available' },
        { name: 'formatted_slot', path: 'formatted_slot' },
        { name: 'suggested_alternatives', path: 'alternatives' }
      ]
    },
    {
      id: 'node_slot_unavailable',
      type: 'Default',
      name: 'Slot Unavailable Alternatives',
      prompt: 'That exact slot isn\'t available right now. However, I have {{suggested_alternatives}} available. Would any of those work for you?'
    },
    {
      id: 'node_pre_booking_confirm',
      type: 'Default',
      name: 'Pre-Booking Confirmation',
      prompt: 'Your slot on {{formatted_slot}} in {{location}} is available! Would you like me to go ahead and book this test drive for your {{vehicle_name}}?',
      extract_variables: [
        { name: 'user_confirmed', type: 'boolean', description: 'Whether the user said yes / go ahead / book it' }
      ]
    },
    {
      id: 'node_book_atomic',
      type: 'Webhook',
      name: 'Atomic Booking Tool',
      url: '{{backend_url}}/api/test-drive/book',
      method: 'POST',
      body: {
        session_id: '{{session_id}}',
        capability_token: '{{capability_token}}',
        vehicle_id: '{{vehicle_id}}',
        location: '{{location}}',
        date: '{{preferred_date}}',
        time: '{{preferred_time}}',
        customer_email: '{{customer_email}}',
        customer_phone: '{{customer_phone}}'
      },
      response_variables: [
        { name: 'booking_success', path: 'success' },
        { name: 'booking_id', path: 'booking_id' },
        { name: 'confirmed_date', path: 'formatted_date' },
        { name: 'confirmed_time', path: 'formatted_time' }
      ]
    },
    {
      id: 'node_success_confirm',
      type: 'Default',
      name: 'Final Spoken Confirmation',
      prompt: 'Perfect! Your test drive for the {{vehicle_name}} is officially confirmed for {{confirmed_date}} at {{confirmed_time}} at {{location}}. Your booking reference ID is {{booking_id}}. We have also emailed the complete details to {{customer_email}}. Thank you for choosing EasyEV and have a wonderful day!'
    },
    {
      id: 'node_end_call',
      type: 'End Call',
      name: 'End Call Node'
    }
  ]
};

writeFileSync(PATHWAY_FILE, JSON.stringify(pathway, null, 2), 'utf-8');
console.log(`[Pathway Export] Generated Bland AI Pathway Schema at: ${PATHWAY_FILE}`);
