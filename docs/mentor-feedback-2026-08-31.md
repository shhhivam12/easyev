# EasyEV AI — Mentor Feedback Notes

**Date:** 31 August 2026  
**Team:** Team CodeHackers  
**Mentor:** Kamal Walia  
**Status:** Feedback captured; product changes are not finalized yet.

## Main feedback from the mentor

### 1. The current idea is not unique enough

- A voice-based EV sales and negotiation agent feels redundant and easy to reproduce.
- The present concept does not yet have a strong differentiator or defensible reason to win.
- We need to move beyond an agent that mainly answers EV questions during a sales call.

### 2. The agent should continue working after the sales call

The voice conversation can remain one part of the experience, but the system should execute useful follow-up work after the call ends.

Possible post-call tasks discussed:

- Arrange another meeting or product demonstration.
- Schedule and manage follow-ups.
- Send contextual WhatsApp messages.
- Continue the lead journey toward conversion or deal closure.
- Preserve the call context so the buyer does not have to repeat information.
- Create and track the next actions required from the buyer, dealer or human sales representative.

### 3. The agent should perform deeper research for the buyer

If a buyer asks a question that cannot be answered from the internal vehicle catalog, the agent should be able to perform further research and return useful comparisons.

Examples discussed:

- Compare available insurance options.
- Investigate pricing differences.
- Search the web for additional information requested by the buyer.
- Collect and organize information from multiple sources instead of only reading from a fixed database.

Any researched answer should eventually show its sources, date and confidence rather than presenting unverified web information as fact.

### 4. Build an end-to-end EV platform, not only a phone-call agent

- The phone or voice call should be an entry point, not the complete product.
- EasyEV AI could become a broader EV aggregation and decision platform.
- A web dashboard may connect discovery, comparison, research, qualification, follow-up and conversion in one journey.
- The system should reduce friction across the complete EV buying process instead of solving only the conversation stage.

### 5. Explore Agora more deeply

- We need to explore the Agora platform and identify additional capabilities beyond basic real-time voice.
- Agora should power multiple visible parts of the experience and not look like a replaceable microphone layer.
- The final product direction should be selected after mapping Agora capabilities to meaningful user and business outcomes.

## Emerging direction — not yet finalized

**Working hypothesis:** EasyEV AI could become an agentic EV decision and transaction platform powered by Agora, where a live multilingual conversation starts the journey and specialized agents continue the work afterward.

A possible end-to-end journey is:

1. The buyer starts through web voice, a scheduled call or another supported channel.
2. EasyEV understands requirements and updates a persistent buyer decision profile.
3. Research agents compare vehicles, prices, insurance, financing, charging and ownership considerations.
4. The platform presents evidence and comparisons in a web dashboard.
5. The buyer can return to voice and ask follow-up questions without repeating context.
6. Action agents book demonstrations, schedule meetings and prepare follow-ups.
7. WhatsApp or another approved communication channel continues the journey.
8. A dealer or human agent receives the full context when intervention is required.
9. The platform tracks the lead until a clear outcome, such as a test drive, quotation, follow-up or closure.

## Important open questions

- What is the single strongest problem this end-to-end platform solves?
- Who is the primary customer: EV buyer, dealer, marketplace, fleet operator or manufacturer?
- What will be our unique moat beyond combining several agents and databases?
- Which post-call actions can be demonstrated reliably within the hackathon?
- What does “close the deal” mean in the prototype without claiming unsupported payment, lending or legal capabilities?
- Which web sources and partner APIs can provide trustworthy price, insurance, finance, charging and availability data?
- Which interactions should happen through voice, dashboard, WhatsApp and human handoff?
- Which Agora capabilities can produce the strongest judge-visible proof?
- How do we control web research, protect personal data and prevent unsupported recommendations?
- Should the prototype remain a broad EV platform or demonstrate one deep buyer journey that proves the platform model?

## Agenda for the next working session

1. Research Agora's current capabilities and applicable hackathon resources.
2. Convert the mentor feedback into three differentiated product directions.
3. Compare those directions for uniqueness, impact, feasibility and Agora depth.
4. Select one primary user and one end-to-end demo journey.
5. Define the product moat and the judge-visible proof for it.
6. Redesign the web dashboard and post-call agent workflow.
7. Update the architecture, task split, implementation plan and presentation.

## Decision boundary

This file records feedback and possible directions only. The expanded aggregator platform, autonomous web research, WhatsApp follow-ups and deal-closing workflow are not yet approved as the final implementation scope.
