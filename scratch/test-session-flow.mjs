import { DealerAgentSession } from '../dealer-voice-agent.mjs';

async function testFullSessionFlow() {
  console.log('=== Testing Complete Interactive Session Flow with conversational Hindi/Hinglish ===');
  const session = new DealerAgentSession({ language: 'Hinglish' });
  
  // Greeting
  const g = session.getInitialGreeting();
  console.log('Greeting:', g.speechText, '| Target:', g.targetField, '| Step:', g.step);

  // Turn 1: shopName
  const t1 = await session.processTurn({ text: 'haa Shakti Motors daldo' });
  console.log('Turn 1 (shopName):', {
    target: t1.targetField,
    extracted: t1.extractedFields,
    speech: t1.speechText,
    formShop: t1.currentForm?.shopName
  });

  // Turn 2: managerName
  const t2 = await session.processTurn({ text: 'haan manager Satvik Kesarwani kardo' });
  console.log('Turn 2 (managerName):', {
    target: t2.targetField,
    extracted: t2.extractedFields,
    speech: t2.speechText,
    formMgr: t2.currentForm?.managerName
  });

  // Turn 3: phone
  const t3 = await session.processTurn({ text: 'haan 9811234567 daldo' });
  console.log('Turn 3 (phone):', {
    target: t3.targetField,
    extracted: t3.extractedFields,
    speech: t3.speechText,
    formPhone: t3.currentForm?.phone
  });

  // Turn 4: email
  const t4 = await session.processTurn({ text: 'haan email satvik at the rate gmail dot com kardo' });
  console.log('Turn 4 (email):', {
    target: t4.targetField,
    extracted: t4.extractedFields,
    speech: t4.speechText,
    formEmail: t4.currentForm?.email
  });

  // Turn 5: city
  const t5 = await session.processTurn({ text: 'haan Delhi daldo' });
  console.log('Turn 5 (city):', {
    action: t5.action,
    target: t5.targetField,
    extracted: t5.extractedFields,
    speech: t5.speechText,
    step: t5.step
  });

  // Turn 6: Step 1 Confirmation ("Kya Step 2 par chalein?")
  const t6 = await session.processTurn({ text: 'haa kardo' });
  console.log('Turn 6 (Step 1 Confirm "haa kardo"):', {
    action: t6.action,
    target: t6.targetField,
    speech: t6.speechText,
    step: t6.step
  });

  // Turn 7: address
  const t7 = await session.processTurn({ text: 'haa address Plot 10 South Extension kardo' });
  console.log('Turn 7 (address):', {
    target: t7.targetField,
    extracted: t7.extractedFields,
    speech: t7.speechText,
    formAddress: t7.currentForm?.address
  });

  // Turn 8: pincode
  const t8 = await session.processTurn({ text: 'haan pincode 110049 daldo' });
  console.log('Turn 8 (pincode):', {
    target: t8.targetField,
    extracted: t8.extractedFields,
    speech: t8.speechText,
    formPin: t8.currentForm?.pincode
  });

  // Turn 9: Step 2 Confirmation ("Kya Step 3 par chalein?")
  const t9 = await session.processTurn({ text: 'haa sahi hai' });
  console.log('Turn 9 (Step 2 Confirm "haa sahi hai"):', {
    action: t9.action,
    target: t9.targetField,
    speech: t9.speechText,
    step: t9.step
  });

  // Turn 10: brands
  const t10 = await session.processTurn({ text: 'haa sabhi brands daldo' });
  console.log('Turn 10 (brands "haa sabhi brands daldo"):', {
    action: t10.action,
    target: t10.targetField,
    extracted: t10.extractedFields,
    speech: t10.speechText,
    formBrands: t10.currentForm?.brands
  });

  // Turn 11: Step 3 Confirmation ("Kya last step par chalein?")
  const t11 = await session.processTurn({ text: 'haa available hai' });
  console.log('Turn 11 (Step 3 Confirm "haa available hai"):', {
    action: t11.action,
    target: t11.targetField,
    speech: t11.speechText,
    step: t11.step
  });

  // Turn 12: Step 4 EMI ("Kya EMI aur Insurance dete hain?")
  const t12 = await session.processTurn({ text: 'haa kardo haa available hai' });
  console.log('Turn 12 (EMI "haa kardo haa available hai"):', {
    action: t12.action,
    target: t12.targetField,
    extracted: t12.extractedFields,
    speech: t12.speechText,
    step: t12.step
  });

  // Turn 13: Step 4 Test Drive ("Kya test drive dete hain?")
  const t13 = await session.processTurn({ text: 'haa dete hai showroom aur doorstep dono' });
  console.log('Turn 13 (Test Drive "haa dete hai..."):', {
    action: t13.action,
    target: t13.targetField,
    extracted: t13.extractedFields,
    speech: t13.speechText,
    step: t13.step
  });

  // Turn 14: Final Submit ("Kya main verified registration submit kar doon?")
  const t14 = await session.processTurn({ text: 'haa kardo bhai submit' });
  console.log('Turn 14 (Submit "haa kardo bhai submit"):', {
    action: t14.action,
    isSubmitted: t14.isSubmitted,
    speech: t14.speechText,
    partnerId: t14.partnerId
  });
}

testFullSessionFlow();
