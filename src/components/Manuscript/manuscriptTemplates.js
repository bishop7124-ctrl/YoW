// Structural templates for manuscript setup.
// Each template generates acts/chapters when applied; users can freely edit all content afterward.
// guidance fields are editable hints shown in the sidebar — not locked content.
// projectTypes: array of project type keys this template applies to.

export const MANUSCRIPT_TEMPLATES = [
  {
    id: 'three-act',
    name: 'Three Act Structure',
    genre: 'General Fiction',
    projectTypes: ['novel'],
    description: 'The classic setup-confrontation-resolution framework. Reliable, battle-tested, and flexible enough for almost any story.',
    targetWords: 90000,
    acts: [
      {
        title: 'Act I — Setup',
        guidance: 'Establish the world, introduce your protagonist, and present the inciting incident that disrupts the status quo. End with a clear first turning point that forces your character into the main conflict.',
        chapters: [
          { title: 'Opening Image', guidance: 'First impression of your world and hero. Sets the tone and emotional baseline you will contrast against the ending.' },
          { title: 'Ordinary World', guidance: 'Show life before the story disrupts it. Plant seeds of your theme and hint at your protagonist\'s fatal flaw.' },
          { title: 'Inciting Incident', guidance: 'The event that kicks the story into motion. Your protagonist can\'t ignore it — it forces a choice.' },
          { title: 'Debate & Decision', guidance: 'Your hero resists the call. Show what they stand to lose. End with them committing to Act II.' },
        ],
      },
      {
        title: 'Act II — Confrontation',
        guidance: 'Your protagonist pursues their goal and meets escalating obstacles. The midpoint raises the stakes dramatically. Everything falls apart at the low point before a second turning point forces the final push.',
        chapters: [
          { title: 'Entering New World', guidance: 'Your hero steps into unfamiliar territory — a new place, problem, or way of life. Establish new rules and relationships.' },
          { title: 'Fun & Games', guidance: 'Deliver the story\'s promise — the reason readers picked this book. Explore, test, win small victories.' },
          { title: 'Midpoint', guidance: 'A major shift: false victory, false defeat, or a revelation that reframes everything. Stakes rise. The hero commits fully.' },
          { title: 'Bad Guys Close In', guidance: 'External pressure intensifies. Internal cracks widen. Allies fracture or betray. The protagonist\'s flaw starts costing them.' },
          { title: 'All Is Lost', guidance: 'The lowest point. The plan fails. Something important is lost — hope, a relationship, a belief. The protagonist must change or die (figuratively or literally).' },
          { title: 'Dark Night of the Soul', guidance: 'Your hero sits with the failure. What do they choose to believe? This is where theme crystallizes.' },
        ],
      },
      {
        title: 'Act III — Resolution',
        guidance: 'Armed with a new understanding, your protagonist makes one final push against the antagonist. The climax resolves the central conflict; the denouement shows how the world has changed.',
        chapters: [
          { title: 'Break Into Three', guidance: 'The hero finds the answer — often hidden in plain sight. They decide to act, even if it means sacrifice.' },
          { title: 'Climax', guidance: 'The final confrontation. Your protagonist faces the antagonist (person, system, or inner demon) with everything on the line. Theme is proven.' },
          { title: 'Closing Image', guidance: 'Mirror the opening but show transformation. Leave the reader with an emotional resonance that lingers.' },
        ],
      },
    ],
  },

  {
    id: 'heros-journey',
    name: "Hero's Journey",
    genre: 'Epic / Adventure / Fantasy',
    projectTypes: ['novel'],
    description: "Joseph Campbell's monomyth — the mythic cycle of departure, initiation, and return. Ideal for epic fantasy, adventure, and coming-of-age stories.",
    targetWords: 110000,
    acts: [
      {
        title: 'Departure',
        guidance: 'The hero exists in their ordinary world until a call to adventure disrupts everything. After resistance and encouragement, they cross the threshold into the unknown.',
        chapters: [
          { title: 'Ordinary World', guidance: 'Establish who your hero is before the journey changes them. Show their routine, relationships, and the wound they carry.' },
          { title: 'Call to Adventure', guidance: 'A herald arrives — a message, a stranger, a crisis. The hero is summoned to a quest they didn\'t ask for.' },
          { title: 'Refusal of the Call', guidance: 'The hero hesitates. Fear, duty, or disbelief holds them back. Show what keeps them tied to the ordinary world.' },
          { title: 'Meeting the Mentor', guidance: 'A wise figure offers guidance, tools, or encouragement. They don\'t do the work — they prepare the hero to do it themselves.' },
          { title: 'Crossing the Threshold', guidance: 'The hero commits and enters the special world. There\'s no easy return. Rules are different here.' },
        ],
      },
      {
        title: 'Initiation',
        guidance: 'The hero navigates challenges, temptations, and a supreme ordeal in the special world. They die and are reborn — metaphorically or literally — and seize their reward.',
        chapters: [
          { title: 'Tests, Allies, Enemies', guidance: 'The hero learns the rules of the new world by being tested. They discover who they can trust.' },
          { title: 'Approach to the Inmost Cave', guidance: 'Preparation for the ordeal. The hero and allies edge toward the greatest danger. Tension builds.' },
          { title: 'The Ordeal', guidance: 'The supreme crisis — death and rebirth. Your hero faces their greatest fear. Something must be sacrificed for them to emerge transformed.' },
          { title: 'The Reward', guidance: 'Having survived, the hero seizes the prize: an object, knowledge, reconciliation, or inner truth.' },
        ],
      },
      {
        title: 'Return',
        guidance: 'The hero brings their reward back to the ordinary world — but the road home is treacherous. A final test proves the transformation was real before the hero is integrated into a changed world.',
        chapters: [
          { title: 'The Road Back', guidance: 'The hero must return, but the journey isn\'t over. Old enemies pursue; the reward creates new complications.' },
          { title: 'Resurrection', guidance: 'A final, climactic ordeal that tests everything the hero learned. They must apply their transformation or die.' },
          { title: 'Return with the Elixir', guidance: 'The hero comes home changed, bringing a gift that heals the ordinary world — wisdom, freedom, love, or literal treasure.' },
        ],
      },
    ],
  },

  {
    id: 'save-the-cat',
    name: 'Save the Cat',
    genre: 'Commercial Fiction / Screenwriting',
    projectTypes: ['novel'],
    description: "Blake Snyder's beat sheet adapted for novels. Precise pacing with 15 named beats. Great for commercial fiction that needs to move fast and satisfy completely.",
    targetWords: 85000,
    acts: [
      {
        title: 'Act One',
        guidance: 'Establish your hero and world quickly, then deliver the inciting catalyst. End with the hero fully committed to the act two journey.',
        chapters: [
          { title: 'Opening Image', guidance: 'A single image that sets the tone and shows the "before" world. It will contrast with your closing image to prove transformation.' },
          { title: 'Theme Stated', guidance: 'Someone (not the hero) states the theme — the lesson your hero will learn, usually in a throwaway line they don\'t yet understand.' },
          { title: 'Set-Up', guidance: 'Establish the hero\'s ordinary world and all six things that need to change. Show the hero\'s flaw in action.' },
          { title: 'Catalyst', guidance: 'The inciting incident that knocks the hero\'s world off balance. They can\'t ignore it. Page 12 energy.' },
          { title: 'Debate', guidance: 'The hero resists. Should they go? Can they? Show the internal struggle before they decide. End on the leap of faith.' },
        ],
      },
      {
        title: 'Act Two (Part A)',
        guidance: 'The hero enters a new world — an upside-down version of act one — and has fun exploring it. A false victory at the midpoint shifts everything.',
        chapters: [
          { title: 'Break Into Two', guidance: 'The hero makes a proactive choice and enters the upside-down world. No going back. Thesis world gives way to antithesis world.' },
          { title: 'B Story', guidance: 'A new character enters — often a love interest or mentor — who carries the theme. This is the emotional heart of your story.' },
          { title: 'Fun and Games', guidance: 'The promise of the premise. Deliver what the logline sells. The hero tests their new world. Audience pleasure zone.' },
          { title: 'Midpoint', guidance: 'False victory or false defeat. Stakes raise. Hero seems to win or lose publicly. The fun-and-games phase is over.' },
        ],
      },
      {
        title: 'Act Two (Part B)',
        guidance: 'The antagonistic forces regroup and overwhelm the hero. An internal flaw causes a major setback. Everything the hero built falls apart.',
        chapters: [
          { title: 'Bad Guys Close In', guidance: 'External pressure and internal doubt mount simultaneously. Allies become liabilities. The plan unravels.' },
          { title: 'All Is Lost', guidance: 'The false defeat: the worst thing that can happen, happens. Often features a "whiff of death" — someone or something dies.' },
          { title: 'Dark Night of the Soul', guidance: 'The hero wallows in hopelessness. The old world is gone. The new world won\'t accept them. Who are they now?' },
        ],
      },
      {
        title: 'Act Three',
        guidance: 'The hero discovers the solution — often by synthesizing thesis and antithesis — and executes the final plan, proving their transformation in a climactic showdown.',
        chapters: [
          { title: 'Break Into Three', guidance: 'The A and B stories collide: the hero\'s relationship insight unlocks the solution to the main plot. The answer was there all along.' },
          { title: 'Finale', guidance: 'Execute the final plan in a five-point sequence: gather the team, execute the plan, execute it again when it fails, the real climax, the aftermath.' },
          { title: 'Final Image', guidance: 'Mirror the opening image. Show the hero\'s transformation through contrast. Prove the theme worked.' },
        ],
      },
    ],
  },

  {
    id: 'romantasy',
    name: 'Romantasy Structure',
    genre: 'Romantasy / Fantasy Romance',
    projectTypes: ['novel'],
    description: 'Dual-engine structure: a fantasy quest arc and a romance arc intertwined. Both must resolve satisfyingly — neither can be purely a subplot of the other.',
    targetWords: 120000,
    acts: [
      {
        title: 'Part One — Collision',
        guidance: 'Establish your heroine in her world, introduce the fantasy stakes, and force the first encounter with the love interest under hostile or fraught circumstances. Plant the enemies-to-lovers or reluctant-allies dynamic.',
        chapters: [
          { title: 'Her World', guidance: 'Ground readers in your protagonist\'s life, her power (or lack thereof), and what she wants vs. what she needs.' },
          { title: 'The Fantasy Inciting Incident', guidance: 'The quest, prophecy, threat, or political crisis that sets the main plot in motion.' },
          { title: 'First Encounter', guidance: 'The meeting that matters. Conflict, chemistry, or both. Something about this person gets under her skin.' },
          { title: 'Forced Together', guidance: 'Circumstances — a mission, a contract, a curse — force your couple to cooperate despite their friction.' },
        ],
      },
      {
        title: 'Part Two — Kindling',
        guidance: 'The quest deepens and so does the relationship. Banter evolves into genuine connection. A major fantasy revelation and an emotional turning point (almost-kiss, vulnerable confession, or betrayal) land close together.',
        chapters: [
          { title: 'On the Road / In the World', guidance: 'The quest begins in earnest. Shared danger forces trust. Banter and worldbuilding intertwine.' },
          { title: 'Cracks in the Armor', guidance: 'Both characters reveal something real beneath the posturing. Vulnerability, backstory, or a shared wound.' },
          { title: 'The Almost', guidance: 'A moment that almost becomes something more — interrupted kiss, pulled-back confession, charged silence. Readers know. The characters almost do.' },
          { title: 'Fantasy Midpoint Revelation', guidance: 'A major plot twist reframes the quest. The stakes grow larger or more personal. The couple\'s mission shifts.' },
          { title: 'Emotional Climax of Part Two', guidance: 'The romance escalates: first kiss, confession, or night together. The relationship becomes real — which means it can now be broken.' },
        ],
      },
      {
        title: 'Part Three — The Fracture',
        guidance: 'External enemies and internal doubts conspire to tear the couple apart. A betrayal (real or perceived) hits at the worst moment as the fantasy stakes reach their crisis point.',
        chapters: [
          { title: 'The Cost of Love', guidance: 'The relationship creates complications for the quest — or vice versa. One must be sacrificed for the other, or so it seems.' },
          { title: 'Betrayal or Break', guidance: 'The couple is separated — by a lie exposed, a sacrifice demanded, a misunderstanding weaponized by the villain.' },
          { title: 'Fantasy Low Point', guidance: 'The quest seems unwinnable. The villain\'s plan is revealed in full. The world is at its most desperate.' },
          { title: 'Alone', guidance: 'Both characters face their darkest moment alone. What do they each choose when they have nothing left?' },
        ],
      },
      {
        title: 'Part Four — The Triumph',
        guidance: 'The couple reunites, the fantasy conflict reaches its climax, and both arcs resolve. The world is saved. The relationship is earned. End with emotional and narrative satisfaction.',
        chapters: [
          { title: 'Reunion', guidance: 'They find each other again. The misunderstanding is resolved or the sacrifice is acknowledged. This reunion must be earned, not handed over.' },
          { title: 'Final Battle', guidance: 'The fantasy climax. Both characters fight — together and separately — for the world and for each other.' },
          { title: 'The Declaration', guidance: 'The romantic climax. Grand gesture, plain words, or quiet certainty — whatever fits these characters. Make readers feel it.' },
          { title: 'Epilogue', guidance: 'Show the new world — and the new relationship within it. Leave readers satisfied and, if series, hungry for more.' },
        ],
      },
    ],
  },

  {
    id: 'mystery-thriller',
    name: 'Mystery / Thriller',
    genre: 'Mystery / Thriller / Suspense',
    projectTypes: ['novel'],
    description: 'A case or threat drives relentless forward momentum. Clues, suspects, reversals, and a ticking clock keep tension high. The solution must be both surprising and inevitable.',
    targetWords: 90000,
    acts: [
      {
        title: 'The Hook',
        guidance: 'Establish your detective/protagonist and deliver the inciting crime or threat as quickly as possible. Give readers a reason to be afraid and a reason to trust your protagonist to solve it.',
        chapters: [
          { title: 'Opening Crime or Threat', guidance: 'Start as close to the action as possible. A body, a threat, a disappearance. Establish tone immediately.' },
          { title: 'Meet the Investigator', guidance: 'Who is your detective/protagonist? What is their particular skill set, wound, or obsession that makes them right (and wrong) for this case?' },
          { title: 'Entering the Case', guidance: 'The protagonist is pulled into the investigation — voluntarily or not. Establish the central question: whodunit, will they survive, can they stop it?' },
          { title: 'First Clues & Suspects', guidance: 'Begin laying the groundwork. Every clue you plant here must matter. Every suspect introduced needs a motive.' },
        ],
      },
      {
        title: 'Investigation',
        guidance: 'The investigator pursues leads, interviews suspects, and pieces together a picture — only to have that picture shattered by a midpoint reversal. False solutions collapse under new evidence.',
        chapters: [
          { title: 'Following Leads', guidance: 'The investigation opens up. New evidence, new suspects, new complications. Maintain multiple live threads.' },
          { title: 'False Lead / Red Herring', guidance: 'A promising lead goes nowhere — or implicates the wrong person. Your protagonist (and reader) must recover and reorient.' },
          { title: 'Tightening Circle', guidance: 'Evidence accumulates. The suspect list narrows. Your protagonist gets close — close enough to become a target.' },
          { title: 'Midpoint Reversal', guidance: 'A revelation that flips the case. The obvious suspect is cleared, a trusted ally is implicated, or the crime turns out to be something else entirely.' },
          { title: 'Raising the Stakes', guidance: 'The threat escalates. Another victim, a deadline, or a personal threat against the investigator. They can no longer stay detached.' },
          { title: 'The Trap', guidance: 'The investigator attempts to catch the villain — but the trap is turned against them. They are now the prey.' },
        ],
      },
      {
        title: 'The Reckoning',
        guidance: 'The pieces fall into place through a combination of deduction and desperation. The confrontation with the true villain resolves the case — and the protagonist\'s personal arc.',
        chapters: [
          { title: 'Darkest Hour', guidance: 'The case seems unsolvable. The protagonist is discredited, trapped, or grieving. The villain seems to have won.' },
          { title: 'The Revelation', guidance: 'The final piece clicks into place. The protagonist sees what they missed. The truth should feel both surprising and inevitable.' },
          { title: 'Confrontation', guidance: 'The showdown with the villain — in a courtroom, a dark room, or at gunpoint. The case is resolved, but so must the personal stakes be.' },
          { title: 'Resolution', guidance: 'The aftermath. Justice (or its absence). How the protagonist is changed. Close out the personal arc that has run alongside the case.' },
        ],
      },
    ],
  },

  {
    id: 'novel-blank',
    name: 'Blank Novel',
    genre: 'Novel',
    projectTypes: ['novel'],
    description: 'Start with a clean slate. One act, one chapter — add and organize everything yourself. For writers who prefer to discover their structure rather than follow one.',
    targetWords: 80000,
    acts: [
      {
        title: 'Act One',
        guidance: 'This is your first act. Rename it, adjust the guidance, and build the structure that fits your story.',
        chapters: [
          { title: 'Chapter One', guidance: 'Your first chapter. Add scenes, set the scene, begin your story.' },
        ],
      },
    ],
  },

  // ─── Short Story templates ───────────────────────────────────────────────────

  {
    id: 'short-story-blank',
    name: 'Blank Short Story',
    genre: 'Short Story',
    projectTypes: ['short_story'],
    description: 'A compact empty structure for short fiction. Start with one part and one section, then add only the beats the story needs.',
    targetWords: 5000,
    acts: [
      {
        title: 'Part One',
        guidance: 'This is your starting part. Keep the shape compact and focused on one central turn.',
        chapters: [
          { title: 'Section One', guidance: 'Begin the story in the most useful place. Add scenes only where they sharpen the core effect.' },
        ],
      },
    ],
  },

  {
    id: 'freytags-pyramid',
    name: "Freytag's Pyramid",
    genre: 'General Fiction',
    projectTypes: ['short_story'],
    description: 'The classic five-stage arc — exposition, rising action, climax, falling action, denouement. Tightly paced for short-form fiction with a strong emotional payoff.',
    targetWords: 5000,
    acts: [
      {
        title: 'Exposition',
        guidance: 'Establish the world, introduce your protagonist, and set the emotional baseline. In a short story, this needs to happen in a few paragraphs. Ground the reader fast.',
        chapters: [
          { title: 'Opening Situation', guidance: 'Who is your protagonist and what is their world right now? Hint at the central tension before it arrives.' },
        ],
      },
      {
        title: 'Rising Action',
        guidance: 'The conflict intensifies through a series of escalating events. Each beat should raise the stakes or deepen the protagonist\'s predicament.',
        chapters: [
          { title: 'Inciting Complication', guidance: 'The event that disrupts the status quo and forces your protagonist into the conflict.' },
          { title: 'Escalation', guidance: 'The protagonist attempts to resolve the conflict. Things get harder. Raise the stakes with each beat.' },
        ],
      },
      {
        title: 'Climax',
        guidance: 'The point of highest tension — the moment your protagonist cannot avoid. Everything pivots here.',
        chapters: [
          { title: 'The Crisis Point', guidance: 'The protagonist faces the central conflict head-on. The outcome is uncertain. Maximum emotional charge.' },
        ],
      },
      {
        title: 'Falling Action',
        guidance: 'The aftermath of the climax. Tensions release, consequences land, and the protagonist begins to process what happened.',
        chapters: [
          { title: 'Consequences', guidance: 'Show what the climax has cost or changed. Don\'t rush this — let the emotional weight land.' },
        ],
      },
      {
        title: 'Denouement',
        guidance: 'The new equilibrium. The story settles into its ending image. Leave the reader with a lasting feeling or thought.',
        chapters: [
          { title: 'Resolution', guidance: 'Where does your protagonist land? What has changed for them, even subtly? A short story\'s ending should resonate, not just stop.' },
        ],
      },
    ],
  },

  {
    id: 'flash-fiction',
    name: 'Flash Fiction',
    genre: 'General Fiction',
    projectTypes: ['short_story'],
    description: 'Extreme compression: one charged moment, one character, one turn. Under 1,500 words. The entire story lives in the space between before and after.',
    targetWords: 1000,
    acts: [
      {
        title: 'Before',
        guidance: 'Establish the character and their world in as few words as possible. Every detail must earn its place.',
        chapters: [
          { title: 'The Setup', guidance: 'Drop the reader into a specific moment. Establish character and stakes instantly. No preamble.' },
        ],
      },
      {
        title: 'The Turn',
        guidance: 'The single pivot that changes everything. Flash fiction lives or dies by the quality of this turn.',
        chapters: [
          { title: 'The Moment', guidance: 'The event, revelation, or choice that reframes everything before and after it. It must feel both surprising and inevitable.' },
        ],
      },
      {
        title: 'After',
        guidance: 'The world, seen through the turn. A flash ending is a reverb — the reader should feel the echo long after the last word.',
        chapters: [
          { title: 'The Resonance', guidance: 'Two or three sentences. Show what has changed — or hasn\'t. End on an image, not an explanation.' },
        ],
      },
    ],
  },

  {
    id: 'in-medias-res',
    name: 'In Medias Res',
    genre: 'General Fiction',
    projectTypes: ['short_story'],
    description: 'Begin in the middle of the action, then layer in context as the story unfolds. Ideal for literary short fiction where tension is established before explanation.',
    targetWords: 5000,
    acts: [
      {
        title: 'The Plunge',
        guidance: 'Drop the reader directly into a charged moment. Don\'t explain — immerse. The reader will orient themselves.',
        chapters: [
          { title: 'Opening Action', guidance: 'Start mid-event. Something is already happening. Who, what, and where emerge from the action itself.' },
          { title: 'First Complication', guidance: 'The situation deepens. The reader begins to piece together what this moment means.' },
        ],
      },
      {
        title: 'Context & Escalation',
        guidance: 'Backstory and context arrive naturally through action, dialogue, and reflection — never as a data dump. The conflict continues to escalate.',
        chapters: [
          { title: 'Layering the Past', guidance: 'Reveal what led to this moment through brief, precise details woven into the present action.' },
          { title: 'The Real Stakes', guidance: 'Now that the reader has context, the true weight of the situation becomes clear. What is actually on the line?' },
        ],
      },
      {
        title: 'Resolution',
        guidance: 'The story concludes — not necessarily with answers, but with a shift. Literary short fiction often ends on ambiguity that feels earned.',
        chapters: [
          { title: 'The Turn', guidance: 'The protagonist makes a choice, reaches a realization, or is overtaken by events. The moment changes them.' },
          { title: 'Closing Image', guidance: 'An image or moment that holds the emotional truth of the story. Let it breathe.' },
        ],
      },
    ],
  },

  // ─── Novella templates ───────────────────────────────────────────────────────

  {
    id: 'novella-blank',
    name: 'Blank Novella',
    genre: 'Novella',
    projectTypes: ['novella'],
    description: 'A simple novella starter: one part, one chapter, and room to build a focused 20–40k word story.',
    targetWords: 30000,
    acts: [
      {
        title: 'Part One',
        guidance: 'This is your first part. Rename it, adjust the guidance, and build a novella-length structure around one clear story engine.',
        chapters: [
          { title: 'Chapter One', guidance: 'Your opening chapter. Establish the central character, situation, and pressure quickly.' },
        ],
      },
    ],
  },

  {
    id: 'compressed-three-act',
    name: 'Compressed Three Act',
    genre: 'General Fiction',
    projectTypes: ['novella'],
    description: 'A lean, purposeful three-act structure built for 20–40k words. No subplots — every scene serves the central conflict. One protagonist, one clear transformation.',
    targetWords: 30000,
    acts: [
      {
        title: 'Act I — Setup',
        guidance: 'Establish character, world, and conflict quickly. A novella can\'t afford a slow start — the inciting incident should land early. End on a clear commitment.',
        chapters: [
          { title: 'Opening — Character & World', guidance: 'Introduce the protagonist and their world in a vivid, specific scene. Plant the wound or want that will drive them.' },
          { title: 'Inciting Incident', guidance: 'The disruption that forces action. In a novella this should hit by page 15–20. The protagonist\'s life can no longer continue as before.' },
          { title: 'The Commitment', guidance: 'The protagonist chooses to pursue their goal. No more hesitation — the conflict is engaged.' },
        ],
      },
      {
        title: 'Act II — Confrontation',
        guidance: 'The protagonist pursues their goal against mounting resistance. One strong midpoint pivot, one low point. Keep the focus narrow — one main conflict, one relationship, one transformation arc.',
        chapters: [
          { title: 'Into the Problem', guidance: 'The protagonist begins working toward their goal. Show the obstacles and the cost of engaging with the conflict.' },
          { title: 'Midpoint Pivot', guidance: 'A reversal or revelation that raises the stakes and reframes the conflict. The protagonist must adjust.' },
          { title: 'Collapse', guidance: 'The low point. The protagonist\'s approach has failed. Something is lost. They must find a new way forward or quit.' },
        ],
      },
      {
        title: 'Act III — Resolution',
        guidance: 'A swift, decisive final push. The climax resolves the central conflict and proves the protagonist\'s transformation. Denouement is brief but emotionally complete.',
        chapters: [
          { title: 'The Final Approach', guidance: 'The protagonist re-engages with everything they\'ve learned. They move toward the final confrontation.' },
          { title: 'Climax', guidance: 'The central conflict resolves. The transformation is proven through action.' },
          { title: 'Denouement', guidance: 'Brief. Show the new equilibrium. One beat that earns the ending.' },
        ],
      },
    ],
  },

  {
    id: 'novella-mystery',
    name: 'Novella Mystery',
    genre: 'Mystery / Thriller / Suspense',
    projectTypes: ['novella'],
    description: 'A focused mystery or suspense arc for 25–35k words. One central question, a small suspect pool, and a clean reveal.',
    targetWords: 30000,
    acts: [
      {
        title: 'Part One — The Question',
        guidance: 'Open with the mystery, threat, or disappearance and give the protagonist a personal reason to pursue it.',
        chapters: [
          { title: 'Opening Disturbance', guidance: 'Start close to the disruption. A missing person, a strange message, a body, or a threat that cannot be ignored.' },
          { title: 'First Lead', guidance: 'The protagonist follows the clearest lead and discovers the situation is sharper or stranger than expected.' },
        ],
      },
      {
        title: 'Part Two — Pressure',
        guidance: 'The investigation tightens. Every clue should either reveal character, change the suspect picture, or increase danger.',
        chapters: [
          { title: 'False Answer', guidance: 'The obvious explanation fails. A red herring collapses or points toward a deeper truth.' },
          { title: 'Personal Stakes', guidance: 'The case touches the protagonist directly. They now have something specific to lose.' },
          { title: 'Midpoint Reversal', guidance: 'A reveal changes what the protagonist thinks the story is about.' },
        ],
      },
      {
        title: 'Part Three — The Reveal',
        guidance: 'Resolve the central question quickly and clearly, then land the emotional consequence.',
        chapters: [
          { title: 'Final Clue', guidance: 'The missing piece falls into place. The answer should surprise the reader while making earlier details click.' },
          { title: 'Confrontation', guidance: 'The protagonist faces the truth, the culprit, or the source of danger.' },
          { title: 'Aftermath', guidance: 'Show what justice, survival, or failure costs.' },
        ],
      },
    ],
  },

  {
    id: 'novella-romance',
    name: 'Novella Romance',
    genre: 'Romance',
    projectTypes: ['novella'],
    description: 'A streamlined romance structure for 25–35k words. Two leads, one core obstacle, and a satisfying emotional resolution.',
    targetWords: 30000,
    acts: [
      {
        title: 'Part One — Spark',
        guidance: 'Introduce both leads, the attraction or friction between them, and the reason this relationship cannot be simple.',
        chapters: [
          { title: 'First Meeting', guidance: 'Bring the leads together in a scene with immediate emotional charge.' },
          { title: 'The Complication', guidance: 'Define the obstacle: history, duty, distance, secrecy, rivalry, or fear.' },
        ],
      },
      {
        title: 'Part Two — Pull',
        guidance: 'Let intimacy build while the obstacle becomes harder to ignore. Keep the emotional focus tight.',
        chapters: [
          { title: 'Forced Proximity', guidance: 'Circumstances keep the leads in each other\'s orbit.' },
          { title: 'Vulnerability', guidance: 'One or both leads reveal something real. The relationship deepens.' },
          { title: 'The Almost', guidance: 'A near-confession, almost-kiss, or moment of trust shows what is possible.' },
        ],
      },
      {
        title: 'Part Three — Choice',
        guidance: 'The obstacle peaks, the leads choose differently than they would have at the start, and the ending feels earned.',
        chapters: [
          { title: 'The Break', guidance: 'Fear, duty, or misunderstanding pulls the leads apart.' },
          { title: 'The Choice', guidance: 'A clear action proves growth and commitment.' },
          { title: 'Happy Ending', guidance: 'Resolve the central relationship with warmth and specificity.' },
        ],
      },
    ],
  },

  // ─── Screenplay templates ────────────────────────────────────────────────────

  {
    id: 'screenplay-three-act',
    name: 'Three Act (Feature)',
    genre: 'Feature Film',
    projectTypes: ['screenplay'],
    description: 'The industry-standard feature structure — setup, confrontation, resolution across ~110 pages. Built on page-count checkpoints that match industry expectations.',
    targetWords: 0,
    acts: [
      {
        title: 'Act One (pp. 1–25)',
        guidance: 'Establish the protagonist, world, and tone. Deliver the inciting incident around page 12. End Act One with the protagonist crossing into the main conflict — the point of no return.',
        chapters: [
          { title: 'Opening Image (p. 1)', guidance: 'A single image or scene that establishes tone, genre, and theme. This image will be mirrored at the end.' },
          { title: 'Ordinary World (pp. 2–10)', guidance: 'Introduce the protagonist in their normal life. Show their flaw, their world, and what they want vs. what they need.' },
          { title: 'Inciting Incident (pp. 10–12)', guidance: 'The event that kicks the story into motion. The protagonist cannot ignore it.' },
          { title: 'Debate & Decision (pp. 12–25)', guidance: 'The protagonist resists or wrestles with the call. End on their commitment — the act break that launches the main story.' },
        ],
      },
      {
        title: 'Act Two (pp. 25–85)',
        guidance: 'The protagonist pursues their goal in a new or disrupted world. A midpoint raises the stakes (p. 55). Everything falls apart around page 75 before the final push.',
        chapters: [
          { title: 'New World / Fun & Games (pp. 25–55)', guidance: 'The protagonist engages with the new situation. Deliver the promise of your premise — what makes this story special. Win small victories.' },
          { title: 'Midpoint (p. 55)', guidance: 'A false victory, false defeat, or major revelation. The stakes shift upward. The protagonist commits fully.' },
          { title: 'Bad Guys Close In (pp. 55–75)', guidance: 'External pressure mounts. Internal doubts deepen. Allies fracture. The protagonist\'s flaw starts costing them.' },
          { title: 'All Is Lost / Dark Night (pp. 75–85)', guidance: 'The lowest point. The plan fails. Something is lost. The protagonist must find a new resolve or give up.' },
        ],
      },
      {
        title: 'Act Three (pp. 85–110)',
        guidance: 'The protagonist finds the answer and makes one final push. The climax resolves the central conflict. The closing image mirrors the opening.',
        chapters: [
          { title: 'Break Into Three (pp. 85–90)', guidance: 'The solution emerges — often from the B story or an unexpected angle. The protagonist chooses to act.' },
          { title: 'Finale (pp. 90–105)', guidance: 'Execute the final plan. It begins to fail. True climax arrives through improvisation and sacrifice.' },
          { title: 'Closing Image (pp. 105–110)', guidance: 'Mirror the opening image. Prove the transformation. Let the theme land.' },
        ],
      },
    ],
  },

  {
    id: 'screenplay-hero',
    name: "Hero's Journey (Feature)",
    genre: 'Epic / Adventure / Fantasy',
    projectTypes: ['screenplay'],
    description: "The mythic monomyth adapted for feature film — departure, initiation, return. Classic for adventure, fantasy, and origin stories.",
    targetWords: 0,
    acts: [
      {
        title: 'Departure (pp. 1–30)',
        guidance: 'Establish the ordinary world and introduce the hero. The call arrives and is refused before a mentor pushes the hero through the threshold.',
        chapters: [
          { title: 'Ordinary World (pp. 1–10)', guidance: 'The hero\'s life before the adventure. Establish who they are, what they want, and what they lack.' },
          { title: 'Call & Refusal (pp. 10–22)', guidance: 'The call to adventure arrives. The hero refuses — fear, duty, or disbelief. Show the cost of staying.' },
          { title: 'Mentor & Threshold (pp. 22–30)', guidance: 'A mentor provides tools or courage. The hero crosses into the special world — there\'s no easy way back.' },
        ],
      },
      {
        title: 'Initiation (pp. 30–80)',
        guidance: 'The hero is tested, makes allies and enemies, and faces a supreme ordeal that demands sacrifice. The reward is seized — but at a cost.',
        chapters: [
          { title: 'Tests, Allies, Enemies (pp. 30–55)', guidance: 'The hero navigates the special world. Every challenge reveals character. Trust is built and broken.' },
          { title: 'Approach to the Cave (pp. 55–65)', guidance: 'Preparation for the greatest danger. The team assembles, the stakes are clarified, and tension builds.' },
          { title: 'Ordeal (pp. 65–75)', guidance: 'Death and rebirth. The hero faces their deepest fear. Something must be sacrificed for transformation to occur.' },
          { title: 'Reward (pp. 75–80)', guidance: 'The hero seizes the prize — object, knowledge, or inner truth. But the road home awaits.' },
        ],
      },
      {
        title: 'Return (pp. 80–110)',
        guidance: 'The road home is treacherous. A resurrection test proves the transformation. The hero returns with the elixir — a gift that heals the ordinary world.',
        chapters: [
          { title: 'Road Back (pp. 80–90)', guidance: 'Returning is harder than leaving. Old enemies or new complications pursue the hero.' },
          { title: 'Resurrection (pp. 90–105)', guidance: 'The final ordeal. Every lesson must be applied. The hero proves their transformation through action.' },
          { title: 'Return with Elixir (pp. 105–110)', guidance: 'The hero comes home transformed, bringing a gift — wisdom, freedom, or healing — to the ordinary world.' },
        ],
      },
    ],
  },

  {
    id: 'screenplay-thriller',
    name: 'Thriller / Mystery (Feature)',
    genre: 'Mystery / Thriller',
    projectTypes: ['screenplay'],
    description: 'Page-count-anchored thriller structure. Relentless tension, a midpoint reversal, and a confrontation that resolves the mystery and the protagonist\'s personal arc simultaneously.',
    targetWords: 0,
    acts: [
      {
        title: 'Act One — The Hook (pp. 1–25)',
        guidance: 'Establish the investigator/protagonist and deliver the crime or threat fast. By page 25, the protagonist is locked into the case.',
        chapters: [
          { title: 'Opening Crime (pp. 1–5)', guidance: 'Start at the action. A body, a threat, a disappearance. Tone is established immediately.' },
          { title: 'Meet the Investigator (pp. 5–15)', guidance: 'Who is this person? What makes them right — and dangerously wrong — for this case?' },
          { title: 'Into the Case (pp. 15–25)', guidance: 'The protagonist enters the investigation. The central question is established. Clues and suspects are introduced.' },
        ],
      },
      {
        title: 'Act Two — Investigation (pp. 25–85)',
        guidance: 'Leads are followed, red herrings deployed, and a midpoint reversal reshuffles everything. The investigator becomes the hunted.',
        chapters: [
          { title: 'Following Leads (pp. 25–45)', guidance: 'Active investigation. Multiple threads. Each clue opens two new questions.' },
          { title: 'Midpoint Reversal (pp. 45–55)', guidance: 'The case flips. The obvious suspect is cleared, a trusted ally is implicated, or the nature of the crime changes entirely.' },
          { title: 'Tightening Circle (pp. 55–70)', guidance: 'The investigator gets close — close enough to become a target. The threat becomes personal.' },
          { title: 'The Trap Reversed (pp. 70–85)', guidance: 'The investigator tries to catch the villain; the trap is turned. They are now the prey. Darkest hour.' },
        ],
      },
      {
        title: 'Act Three — Reckoning (pp. 85–110)',
        guidance: 'The final piece clicks into place. The confrontation resolves the case and the protagonist\'s personal arc.',
        chapters: [
          { title: 'The Revelation (pp. 85–95)', guidance: 'The truth crystallizes — surprising yet inevitable in hindsight. Every planted clue pays off.' },
          { title: 'Confrontation (pp. 95–105)', guidance: 'The showdown. Case resolved. Personal stakes settled.' },
          { title: 'Aftermath (pp. 105–110)', guidance: 'Justice — or its absence. Show how the protagonist is changed. Close the personal arc.' },
        ],
      },
    ],
  },

  // ─── Play templates ──────────────────────────────────────────────────────────

  {
    id: 'play-two-act',
    name: 'Two-Act Play',
    genre: 'Theatre',
    projectTypes: ['play'],
    description: 'The most common stage structure — a long first act that builds the world and conflict, a shorter second act that escalates to climax and resolution. Designed around the interval.',
    targetWords: 0,
    acts: [
      {
        title: 'Act One',
        guidance: 'Establish the world, characters, and central conflict. Build steadily to the interval curtain — a moment of crisis, revelation, or irrevocable choice that sends the audience out wanting to return.',
        chapters: [
          { title: 'Scene 1 — Exposition', guidance: 'Establish the world and characters economically. In theatre, the audience is already watching — earn their attention immediately.' },
          { title: 'Scene 2 — Complication', guidance: 'The central conflict enters. Introduce the antagonistic force — person, situation, or internal struggle.' },
          { title: 'Scene 3 — Rising Stakes', guidance: 'The conflict deepens. Relationships are tested. The characters reveal themselves through action and dialogue.' },
          { title: 'Scene 4 — Interval Curtain', guidance: 'End Act One on a moment of maximum tension, revelation, or irrevocable choice. This is what carries the audience through the interval.' },
        ],
      },
      {
        title: 'Act Two',
        guidance: 'The conflict reaches its crisis. The climax resolves the central question — not always happily — and the denouement lands the play\'s thematic weight.',
        chapters: [
          { title: 'Scene 1 — Return & Escalation', guidance: 'Pick up from the interval with renewed energy. The situation is more desperate or more charged than before.' },
          { title: 'Scene 2 — Crisis Point', guidance: 'Everything is on the table. Characters cannot avoid confrontation. The play\'s theme is tested.' },
          { title: 'Scene 3 — Climax', guidance: 'The central conflict resolves. A decision is made, a truth is spoken, a transformation occurs — or is refused.' },
          { title: 'Scene 4 — Denouement', guidance: 'Brief, resonant. What does the world look like now? Theatre endings must land — they cannot be read twice.' },
        ],
      },
    ],
  },

  {
    id: 'play-three-act',
    name: 'Three-Act Play',
    genre: 'Theatre',
    projectTypes: ['play'],
    description: 'Classical structure used by Chekhov, Ibsen, and Shaw. Three acts with two intervals allow for deliberate pacing, complex relationships, and thematic depth.',
    targetWords: 0,
    acts: [
      {
        title: 'Act One — Exposition',
        guidance: 'Establish the world, relationships, and the situation that contains the seeds of conflict. Chekhov called it "planting the gun" — everything here will fire in Act Three.',
        chapters: [
          { title: 'Scene 1 — The World As It Is', guidance: 'Show the characters in their social context. Establish hierarchies, tensions, desires. Make the audience feel at home — before you pull the rug.' },
          { title: 'Scene 2 — The Disruption', guidance: 'Something arrives or is revealed that destabilizes the status quo. The conflict is now unavoidable.' },
        ],
      },
      {
        title: 'Act Two — Complication',
        guidance: 'The conflict plays out in full. Attempts at resolution make things worse. Relationships fracture or transform. End on the play\'s lowest point.',
        chapters: [
          { title: 'Scene 1 — Attempts & Failures', guidance: 'Characters try to resolve or contain the conflict through their characteristic methods — which are often the problem themselves.' },
          { title: 'Scene 2 — The Revelation', guidance: 'A truth is exposed that changes the terms of the conflict. Nothing can be unsaid or undone.' },
          { title: 'Scene 3 — Lowest Point', guidance: 'The situation is at its most desperate or broken. Characters face an impossible choice.' },
        ],
      },
      {
        title: 'Act Three — Resolution',
        guidance: 'Every planted element fires. The conflict resolves — through confrontation, acceptance, or collapse. The play\'s moral weight lands in the final image.',
        chapters: [
          { title: 'Scene 1 — Final Confrontation', guidance: 'The central conflict comes to a head. The play\'s theme is argued through character action.' },
          { title: 'Scene 2 — Resolution & Final Image', guidance: 'The world settles into its new state. The final moment — a gesture, a line, a silence — carries the full emotional weight of the play.' },
        ],
      },
    ],
  },

  {
    id: 'play-one-act',
    name: 'One-Act Play',
    genre: 'Theatre',
    projectTypes: ['play'],
    description: 'A complete dramatic arc in one uninterrupted act — typically 20–45 minutes. Ideal for a single location, small cast, and one concentrated conflict.',
    targetWords: 0,
    acts: [
      {
        title: 'One Act',
        guidance: 'A single unbroken arc. Establish characters and conflict quickly, escalate relentlessly, and resolve with precision. One act demands economy — every beat must earn its place.',
        chapters: [
          { title: 'Opening — World & Character', guidance: 'Establish who these people are and what their relationship is. The conflict should be latent from the first moment.' },
          { title: 'Inciting Action', guidance: 'The event that forces the conflict into the open. In a one-act, this needs to happen early.' },
          { title: 'Escalation', guidance: 'The conflict intensifies through action and dialogue. Characters reveal themselves under pressure.' },
          { title: 'Crisis & Climax', guidance: 'The confrontation — the moment of maximum pressure. A choice is made or forced.' },
          { title: 'Resolution', guidance: 'Brief. The world after the climax. One final image or exchange that holds the play\'s meaning.' },
        ],
      },
    ],
  },

  // ─── Comic / Graphic Novel templates ────────────────────────────────────────

  {
    id: 'comic-blank',
    name: 'Blank Comic',
    genre: 'Comic / Graphic Novel',
    projectTypes: ['comic'],
    description: 'A clean comic structure with one volume and one issue. Build pages and panels around the visual story you want to tell.',
    targetWords: 0,
    acts: [
      {
        title: 'Volume 1',
        guidance: 'This is your first volume. Use it as a container for issues, pages, and panel planning.',
        chapters: [
          { title: 'Issue 1', guidance: 'Your opening issue. Establish the visual premise, protagonist, and first dramatic movement.' },
        ],
      },
    ],
  },

  {
    id: 'comic-arc',
    name: 'Multi-Issue Arc',
    genre: 'Sequential Art',
    projectTypes: ['comic'],
    description: 'A 4–6 issue storyline with a contained arc and a hook into the next. Each issue has its own emotional climax and ends on a page-turn moment.',
    targetWords: 0,
    acts: [
      {
        title: 'Issue 1 — Establishing',
        guidance: 'Hook the reader in the first few pages. Establish the protagonist, the world\'s visual grammar, and the central conflict. End on a cliffhanger that makes Issue 2 essential.',
        chapters: [
          { title: 'Opening Splash', guidance: 'A strong visual statement that establishes tone and world. The reader should feel the genre immediately.' },
          { title: 'Character & World', guidance: 'Introduce the protagonist and their context. Comics must work visually — show, don\'t tell.' },
          { title: 'Inciting Incident', guidance: 'The event that launches the arc. Clear, visual, and emotionally charged.' },
          { title: 'Issue 1 Cliffhanger', guidance: 'End on a beat that makes the next issue a must-read — a reveal, a threat, a choice left unresolved.' },
        ],
      },
      {
        title: 'Issues 2–3 — Escalation',
        guidance: 'The protagonist engages with the conflict. Escalating action beats alternate with character moments. A midpoint revelation reshuffles the arc.',
        chapters: [
          { title: 'Issue 2 — Into the Problem', guidance: 'The protagonist takes action. New allies or enemies are introduced. The scope of the conflict expands.' },
          { title: 'Issue 2 Cliffhanger', guidance: 'End on a visual punch — a surprise reveal, a fight\'s outcome, a betrayal.' },
          { title: 'Issue 3 — Midpoint Reversal', guidance: 'A revelation or reversal that changes the arc\'s direction. The protagonist\'s assumptions are wrong.' },
          { title: 'Issue 3 Cliffhanger', guidance: 'The darkest moment so far. Stakes at maximum. Demands Issue 4.' },
        ],
      },
      {
        title: 'Issues 4–5 — Resolution',
        guidance: 'The arc drives toward its climax. The protagonist faces the central threat with everything on the line. The final issue resolves the arc while opening onto the next.',
        chapters: [
          { title: 'Issue 4 — Final Approach', guidance: 'Gathering resources, facing down fears, and preparing for the confrontation. A penultimate-issue battle or sacrifice.' },
          { title: 'Issue 5 — Climax', guidance: 'The central conflict resolves. The visual climax should be the arc\'s most striking sequence.' },
          { title: 'Issue 5 Coda', guidance: 'Resolution and character moment. The final page plants the next arc or leaves the reader with a lasting image.' },
        ],
      },
    ],
  },

  {
    id: 'graphic-novel',
    name: 'Standalone Graphic Novel',
    genre: 'Graphic Novel',
    projectTypes: ['comic'],
    description: 'A self-contained narrative with a complete arc — no ongoing series. Designed for maximum thematic depth and a definitive ending.',
    targetWords: 0,
    acts: [
      {
        title: 'Volume 1 — Setup',
        guidance: 'Establish the world, protagonist, and central conflict. A graphic novel has more space than a single issue — use it for character depth and visual world-building.',
        chapters: [
          { title: 'Opening Sequence', guidance: 'Establish tone and visual language from page one. The reader should know what kind of story this is immediately.' },
          { title: 'Protagonist & World', guidance: 'Ground the reader in character and context. Show the protagonist\'s normal life before it\'s disrupted.' },
          { title: 'Inciting Incident', guidance: 'The disruption that forces the protagonist into the central conflict.' },
          { title: 'Commitment', guidance: 'The protagonist chooses to engage. The story\'s central question is locked in.' },
        ],
      },
      {
        title: 'Volume 2 — Conflict',
        guidance: 'The protagonist engages with the conflict through escalating challenges. A midpoint reversal raises the stakes. The low point arrives before the final push.',
        chapters: [
          { title: 'Rising Action', guidance: 'The protagonist tests their approach against the conflict. Visual storytelling carries the weight — show the world through sequential art.' },
          { title: 'Midpoint', guidance: 'A reversal or revelation that changes the terms of the conflict. The protagonist must adapt.' },
          { title: 'Collapse', guidance: 'The approach fails. The protagonist hits their lowest point. Something is lost.' },
        ],
      },
      {
        title: 'Volume 3 — Resolution',
        guidance: 'The protagonist finds their answer and faces the final confrontation. The graphic novel ends definitively — no hooks, no sequels. Give the reader a complete emotional experience.',
        chapters: [
          { title: 'Recovery & Final Approach', guidance: 'The protagonist re-engages with the conflict transformed by what they\'ve learned.' },
          { title: 'Climax', guidance: 'The visual climax. The central conflict resolves through the protagonist\'s transformation.' },
          { title: 'Final Image', guidance: 'The last page is the most important. A definitive image that holds the entire story\'s meaning.' },
        ],
      },
    ],
  },

  // ─── Video Game templates ────────────────────────────────────────────────────

  {
    id: 'game-linear-narrative',
    name: 'Linear Narrative',
    genre: 'Story-Driven Game',
    projectTypes: ['video_game'],
    description: 'A authored, linear story arc — the player drives the pacing but the narrative path is fixed. Ideal for story-first games where cinematic experience is the goal.',
    targetWords: 0,
    acts: [
      {
        title: 'Act 1 — Tutorial & Setup',
        guidance: 'Establish the world, protagonist, and core mechanics simultaneously. The tutorial should feel like story, not instruction. End with the inciting incident that launches the main conflict.',
        chapters: [
          { title: 'Tutorial Hook', guidance: 'Introduce the player to mechanics through a gripping opening sequence. The player should feel capable and invested before the tutorial is over.' },
          { title: 'World Establishment', guidance: 'Establish the world\'s rules, factions, and stakes through play — not cutscenes alone. Let the player discover the world.' },
          { title: 'Inciting Incident', guidance: 'The event that launches the main story. Something is lost, broken, or revealed that the protagonist must address.' },
          { title: 'Call to Action', guidance: 'The protagonist commits to the mission. The player understands the goal and is motivated to pursue it.' },
        ],
      },
      {
        title: 'Act 2 — Rising Action',
        guidance: 'The protagonist pursues their goal through escalating missions and encounters. World-building deepens. Allies are made, enemies clarified. A midpoint revelation raises the stakes.',
        chapters: [
          { title: 'Early Missions', guidance: 'The player grows in power and knowledge. Secondary characters are introduced. The world reveals its complexity.' },
          { title: 'Major Character Beat', guidance: 'A narrative moment that deepens the protagonist\'s motivation — a loss, a revelation, or a relationship development.' },
          { title: 'Midpoint Revelation', guidance: 'A plot twist that reframes the mission. The enemy\'s true nature, a hidden truth, or a betrayal.' },
          { title: 'Escalating Conflict', guidance: 'The missions get harder and more personal. The protagonist\'s choices begin to have real consequences in the world.' },
        ],
      },
      {
        title: 'Act 3 — Final Push',
        guidance: 'The protagonist converges on the final confrontation. The world is at its most dangerous. The narrative climax and gameplay climax should align.',
        chapters: [
          { title: 'Point of No Return', guidance: 'The protagonist commits to the final mission. Make it clear to the player that the end is approaching.' },
          { title: 'Final Missions', guidance: 'Maximum difficulty and narrative intensity. All threads converge. Allies contribute to the final push.' },
          { title: 'Boss Encounter & Climax', guidance: 'The final confrontation. Narrative and gameplay resolve simultaneously. The antagonist is defeated or the conflict resolved.' },
          { title: 'Epilogue', guidance: 'Show the world changed by the player\'s actions. Close the protagonist\'s arc. Set up sequel seeds if appropriate.' },
        ],
      },
    ],
  },

  {
    id: 'game-open-world',
    name: 'Open World / Sandbox',
    genre: 'Open World Game',
    projectTypes: ['video_game'],
    description: 'A main quest arc surrounded by faction quests, side stories, and world events. The player sets the pace — the narrative must work whether played first or last.',
    targetWords: 0,
    acts: [
      {
        title: 'World Bible',
        guidance: 'Before writing quests, establish the world\'s history, factions, and the central conflict that every quest will relate to. The world should feel alive even when the player isn\'t following the main story.',
        chapters: [
          { title: 'World History & Lore', guidance: 'The events that shaped this world. The factions, their motivations, and how they got here.' },
          { title: 'Central Conflict', guidance: 'The main story\'s driving force — what threatens or defines the world the player enters.' },
          { title: 'Protagonist Setup', guidance: 'Who is the player character? What is their relationship to the world\'s conflict?' },
        ],
      },
      {
        title: 'Main Quest Arc',
        guidance: 'The primary narrative path. It should be completable in any order relative to side content but have clear internal structure.',
        chapters: [
          { title: 'Inciting Main Quest', guidance: 'The quest that launches the main story. Low barrier to entry — the player can\'t miss it.' },
          { title: 'Investigation / Discovery Phase', guidance: 'The player explores the world to gather information or allies. The main threat becomes clearer.' },
          { title: 'Midpoint Revelation', guidance: 'The main story\'s central twist. Recontextualizes the world and raises the stakes.' },
          { title: 'Final Quest Line', guidance: 'The main story concludes in a quest sequence that draws on everything the player has seen and done.' },
        ],
      },
      {
        title: 'Faction & Side Quests',
        guidance: 'Independent story threads that deepen the world and reflect the central conflict from different angles. Each faction should have its own complete arc.',
        chapters: [
          { title: 'Faction A Arc', guidance: 'A complete faction storyline with its own beginning, escalation, and resolution.' },
          { title: 'Faction B Arc', guidance: 'A second faction with different values, methods, and relationship to the main conflict.' },
          { title: 'Notable Side Stories', guidance: 'One-off quests that illuminate the world\'s texture — tragic, humorous, or morally complex.' },
        ],
      },
    ],
  },

  {
    id: 'game-branching',
    name: 'Branching Narrative',
    genre: 'Choice-Driven Game',
    projectTypes: ['video_game'],
    description: 'A story with meaningful choice points where player decisions fork the narrative. Plan the branches, convergence points, and how each ending is earned.',
    targetWords: 0,
    acts: [
      {
        title: 'Shared Opening (All Paths)',
        guidance: 'The portion of the story all players experience, regardless of choices. Establish character, world, and the first meaningful choice point.',
        chapters: [
          { title: 'Opening Sequence', guidance: 'The universal starting point. Establish protagonist, world, and stakes before choices begin.' },
          { title: 'First Choice Point', guidance: 'The first meaningful decision. Establish early that choices matter and have consequences.' },
        ],
      },
      {
        title: 'Mid-Game Branches',
        guidance: 'The narrative forks based on player choices. Plan each branch\'s unique content, then mark the convergence points where branches rejoin.',
        chapters: [
          { title: 'Branch A — Path Description', guidance: 'Name and describe the first major branch. What does this path explore? What consequences does it carry?' },
          { title: 'Branch B — Path Description', guidance: 'The alternative branch. Different events, different allies, different costs — but heading toward the same narrative convergence.' },
          { title: 'Convergence Point', guidance: 'Where branches rejoin. The player\'s choices have changed their character, resources, or relationships — but the main conflict awaits everyone.' },
        ],
      },
      {
        title: 'Endings',
        guidance: 'Each ending should feel earned by the choices that led to it. Plan your endings before your branches — work backward to ensure every path leads somewhere meaningful.',
        chapters: [
          { title: 'Ending A — Best Outcome', guidance: 'The "good" ending. What did the player do to earn it? How is the world different?' },
          { title: 'Ending B — Alternative Outcome', guidance: 'A different resolution — not necessarily worse, but different values or costs.' },
          { title: 'Ending C — Dark / Failure Outcome', guidance: 'The consequence of poor or selfish choices. Should feel deserved, not arbitrary.' },
        ],
      },
    ],
  },

  // ─── D&D Campaign templates ──────────────────────────────────────────────────

  {
    id: 'dnd-blank',
    name: 'Blank D&D Campaign',
    genre: 'D&D Campaign',
    projectTypes: ['dnd_campaign'],
    description: 'A clean D&D campaign starter with one story arc and one session. Add encounters, prep notes, maps, NPCs, and rewards as you plan.',
    targetWords: 0,
    acts: [
      {
        title: 'Story Arc 1',
        guidance: 'This is your first campaign arc. Rename it for the threat, region, dungeon, or adventure premise you want to run.',
        chapters: [
          { title: 'Session 1', guidance: 'Plan the opening session: hook, key scenes, likely encounters, NPCs, treasure, and follow-up threads.' },
        ],
      },
    ],
  },

  {
    id: 'dnd-three-arc',
    name: 'Three-Arc Campaign',
    genre: 'D&D Campaign',
    projectTypes: ['dnd_campaign'],
    description: 'A full D&D campaign in three escalating story arcs — local threat, regional stakes, world-ending crisis. Each arc has its own villain, dungeon, and resolution.',
    targetWords: 0,
    acts: [
      {
        title: 'Arc 1 — Local Threat (Levels 1–5)',
        guidance: 'Introduce the party, the region, and a local villain. The stakes are grounded — a town, a dungeon, a threat the party can directly confront. This arc establishes your world\'s tone and teaches the players how things work here.',
        chapters: [
          { title: 'Session 1 — The Hook', guidance: 'Get the party in the same room and give them a reason to work together. A quest board, a threat, or a shared predicament.' },
          { title: 'Exploration & Worldbuilding', guidance: 'The party explores the local region, discovers its factions, history, and the scope of the local threat.' },
          { title: 'Dungeon or Set Piece', guidance: 'The arc\'s main challenge — a dungeon, a heist, a political encounter, or a siege. The local villain is confronted.' },
          { title: 'Arc 1 Climax & Resolution', guidance: 'The local threat is defeated or resolved. The party levels up and a thread is revealed that points toward the larger conflict.' },
        ],
      },
      {
        title: 'Arc 2 — Regional Stakes (Levels 5–10)',
        guidance: 'The threat expands. A regional villain or conspiracy is revealed. The party must travel, make alliances, and deal with moral complexity. The world feels larger and more dangerous.',
        chapters: [
          { title: 'The Larger Threat Revealed', guidance: 'The regional conflict comes into focus. The arc 1 villain was a pawn, a symptom, or a signpost.' },
          { title: 'Faction Politics & Alliances', guidance: 'The party navigates competing factions. Their choices here will shape the resources available in Arc 3.' },
          { title: 'Major Set Piece (Levels 7–9)', guidance: 'A dungeon, confrontation, or event that defines this arc — a keep assault, a divine trial, a planar excursion.' },
          { title: 'Arc 2 Climax', guidance: 'The regional villain is defeated or the conspiracy is broken — but the true threat is now fully revealed. The stakes are now existential.' },
        ],
      },
      {
        title: 'Arc 3 — World-Ending Crisis (Levels 10–20)',
        guidance: 'The campaign\'s final act. The party must stop a world-ending threat — a god, a lich, a planar invasion, or a catastrophic ritual. Everything the party has built, earned, and decided comes to bear.',
        chapters: [
          { title: 'The True Antagonist', guidance: 'Reveal the final villain in full. Establish what they want, why they cannot simply be stopped, and what the world loses if they succeed.' },
          { title: 'Gathering Power & Allies', guidance: 'The party assembles the resources, artifacts, and alliances they need for the final confrontation. Call backs to arc 1 and 2 choices pay off here.' },
          { title: 'The Final Dungeon', guidance: 'The ultimate location — a demi-plane, a fortress, a divine realm, a corrupted capital. Multiple encounters, high stakes, party resources taxed.' },
          { title: 'Final Boss & Epilogue', guidance: 'The final confrontation. Then: what happens next? Give each character a moment in the epilogue. The world they saved should feel different.' },
        ],
      },
    ],
  },

  {
    id: 'dnd-oneshot',
    name: 'One-Shot Adventure',
    genre: 'D&D Campaign',
    projectTypes: ['dnd_campaign'],
    description: 'A self-contained adventure for a single session (3–5 hours). One clear objective, one dungeon or location, one satisfying resolution. No session zero required.',
    targetWords: 0,
    acts: [
      {
        title: 'The Hook',
        guidance: 'Get the party together and motivated in the first 15–30 minutes. The objective should be clear, the stakes should be legible, and the tone should be established immediately.',
        chapters: [
          { title: 'Opening Scene', guidance: 'Drop the party into a situation that immediately communicates the one-shot\'s tone and establishes what\'s at stake.' },
          { title: 'The Objective', guidance: 'State the goal clearly: retrieve the artifact, rescue the prisoner, stop the ritual. The party should know what success looks like.' },
        ],
      },
      {
        title: 'The Adventure',
        guidance: 'Three to five encounters — combat, exploration, and social — that escalate toward the climax. Each encounter should reveal something or change the situation.',
        chapters: [
          { title: 'Encounter 1 — Exploration / Setup', guidance: 'The party moves toward the objective. Establish the location\'s atmosphere and plant clues about the climax.' },
          { title: 'Encounter 2 — Complication', guidance: 'Something makes the objective harder — a twist, an ambush, or a revelation that changes the approach.' },
          { title: 'Encounter 3 — Escalation', guidance: 'The stakes are clear and maximum. The party is close to the objective and the danger is at its highest.' },
        ],
      },
      {
        title: 'Climax & Resolution',
        guidance: 'The final encounter resolves the one-shot\'s objective. Brief epilogue. End on a satisfying note — comedy, triumph, or bittersweet depending on tone.',
        chapters: [
          { title: 'Boss Encounter', guidance: 'The final fight, negotiation, or puzzle. Challenge level should feel appropriately dangerous without being lethal.' },
          { title: 'Epilogue', guidance: 'A quick narrative beat that closes the loop. What did the party accomplish? What changed in the world?' },
        ],
      },
    ],
  },

  // ─── TTRPG Campaign templates ────────────────────────────────────────────────

  {
    id: 'ttrpg-blank',
    name: 'Blank TTRPG Campaign',
    genre: 'TTRPG Campaign',
    projectTypes: ['tabletop_rpg'],
    description: 'A system-neutral campaign starter with one arc and one session. Add encounters, NPCs, rules notes, and consequences as the campaign takes shape.',
    targetWords: 0,
    acts: [
      {
        title: 'Story Arc 1',
        guidance: 'This is your first campaign arc. Shape it around the conflict, mystery, journey, or situation your system supports.',
        chapters: [
          { title: 'Session 1', guidance: 'Plan the opening session: premise, key beats, likely encounters, NPCs, player choices, and next hooks.' },
        ],
      },
    ],
  },

  {
    id: 'ttrpg-three-act',
    name: 'Three-Act Campaign',
    genre: 'TTRPG Campaign',
    projectTypes: ['tabletop_rpg'],
    description: 'System-neutral three-act campaign structure. A local threat, a regional crisis, and a climactic final arc — adaptable to any ruleset from fantasy to horror to sci-fi.',
    targetWords: 0,
    acts: [
      {
        title: 'Act 1 — Introduction',
        guidance: 'Establish the world, the player characters, and the local threat. Keep stakes manageable. This act teaches the players how the world works and what the game feels like.',
        chapters: [
          { title: 'Session 0 Notes', guidance: 'Record your session zero agreements: tone, safety tools, house rules, and initial character hooks.' },
          { title: 'The Inciting Session', guidance: 'The first adventure that brings the group together and establishes the local threat.' },
          { title: 'Exploration & Development', guidance: 'The group investigates the local situation. Factions, NPCs, and the world\'s texture are introduced.' },
          { title: 'Act 1 Climax', guidance: 'The local threat is resolved. A thread is revealed that points toward the larger conflict.' },
        ],
      },
      {
        title: 'Act 2 — Escalation',
        guidance: 'The stakes expand. A larger antagonist or conspiracy comes into view. The party must make difficult choices, navigate factions, and grow into the protagonists the story needs.',
        chapters: [
          { title: 'The Larger Picture', guidance: 'Act 1\'s resolution reveals a bigger threat. The scope of the problem expands.' },
          { title: 'Complications & Factions', guidance: 'Competing interests complicate the mission. The group\'s choices here create the material for Act 3.' },
          { title: 'Midpoint Crisis', guidance: 'A major setback or revelation. The group\'s assumptions are challenged. Something important is lost.' },
          { title: 'Act 2 Climax', guidance: 'The act\'s villain or obstacle is overcome — but the true final threat is now fully revealed.' },
        ],
      },
      {
        title: 'Act 3 — Endgame',
        guidance: 'The final arc. Everything the group has built — allies, resources, experience — is tested against the campaign\'s ultimate antagonist. The story ends here.',
        chapters: [
          { title: 'Final Preparations', guidance: 'The group assembles what they need for the final confrontation. Callbacks to earlier sessions pay off.' },
          { title: 'The Final Confrontation', guidance: 'The climactic encounter or sequence. The campaign\'s central conflict resolves.' },
          { title: 'Epilogue', guidance: 'What happens after? Give each character their moment. Let the world reflect what the group changed.' },
        ],
      },
    ],
  },

  {
    id: 'ttrpg-oneshot',
    name: 'One-Shot / Convention',
    genre: 'TTRPG Campaign',
    projectTypes: ['tabletop_rpg'],
    description: 'A self-contained adventure for a single session. System-neutral. Clear objective, escalating encounters, satisfying resolution. Works with pre-generated characters.',
    targetWords: 0,
    acts: [
      {
        title: 'The Setup',
        guidance: 'Establish the situation and objective in the first 20–30 minutes. With a one-shot, you can\'t afford a slow start. Get players invested immediately.',
        chapters: [
          { title: 'Opening Situation', guidance: 'The group is already in a situation that demands action. Communicate tone and stakes immediately.' },
          { title: 'The Objective', guidance: 'What does success look like? State it clearly. One-shots work best with a legible goal.' },
        ],
      },
      {
        title: 'The Challenge',
        guidance: 'Two to four escalating encounters that move the group toward the objective. Each beat should reveal something new or change the situation.',
        chapters: [
          { title: 'First Encounter', guidance: 'Introduce the core challenge — exploration, combat, negotiation, or investigation.' },
          { title: 'Complication', guidance: 'A twist that makes the objective harder or reveals a new dimension to the problem.' },
          { title: 'Final Approach', guidance: 'The group converges on the climax. Everything they\'ve learned and done is brought to bear.' },
        ],
      },
      {
        title: 'Resolution',
        guidance: 'The climactic encounter and a quick, satisfying close. Leave time for the resolution — one-shots that cut off mid-epilogue feel unfinished.',
        chapters: [
          { title: 'Climax', guidance: 'The final encounter. Design it to feel dangerous but not arbitrary. Every player should have a moment.' },
          { title: 'Epilogue', guidance: 'Brief but complete. Close the loop. End on an image or line that captures the session\'s tone.' },
        ],
      },
    ],
  },

  {
    id: 'ttrpg-horror',
    name: 'Horror Campaign',
    genre: 'Horror / Investigation',
    projectTypes: ['tabletop_rpg'],
    description: 'For horror-adjacent systems (Call of Cthulhu, Vaesen, Blades, Monster of the Week). Investigation-first structure with escalating dread, cost, and an ending that doesn\'t promise safety.',
    targetWords: 0,
    acts: [
      {
        title: 'The Uncanny',
        guidance: 'Horror begins before the monster arrives. Establish normalcy, then corrupt it. The first session should leave the players uneasy — not terrified, but off-balance.',
        chapters: [
          { title: 'Normal World', guidance: 'Establish the world and characters before the horror intrudes. Make the players care about what will be threatened.' },
          { title: 'The First Sign', guidance: 'Something is wrong. It\'s easy to explain away — but the players shouldn\'t be able to unsee it.' },
          { title: 'Investigation Begins', guidance: 'The group starts asking questions. Every answer reveals a worse truth. Safety tools in place.' },
        ],
      },
      {
        title: 'The Descent',
        guidance: 'The horror reveals itself in stages. Knowledge comes at a cost. Characters are changed — damaged, haunted, or complicit — by what they discover and do.',
        chapters: [
          { title: 'The Truth Revealed', guidance: 'The nature of the horror becomes clear. It\'s worse than expected. There may be no clean solution.' },
          { title: 'Costs & Losses', guidance: 'Horror is about cost. Something is lost here — a character, a relationship, a piece of sanity or safety.' },
          { title: 'The Point of No Return', guidance: 'The group cannot walk away. They know too much, are too involved, or the horror has found them.' },
        ],
      },
      {
        title: 'The Reckoning',
        guidance: 'The horror is confronted — but horror endings are rarely triumphant. Survival, partial victory, or meaningful sacrifice may be the best available outcome.',
        chapters: [
          { title: 'Final Confrontation', guidance: 'The group faces the source of the horror. Design the ending to match the campaign\'s tone — not every horror story ends in victory.' },
          { title: 'Aftermath', guidance: 'What remains? Who survived and what did it cost them? Horror\'s power is in the lasting mark it leaves.' },
        ],
      },
    ],
  },
]

export function getTemplateById(id) {
  return MANUSCRIPT_TEMPLATES.find(t => t.id === id) ?? null
}

export function getTemplatesForProjectType(projectType) {
  return MANUSCRIPT_TEMPLATES.filter(t => t.projectTypes?.includes(projectType))
}
