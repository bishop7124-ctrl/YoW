/**
 * Destructive QA seed script.
 *
 * Wipes all app data owned by the explicitly supplied test account, then
 * writes a fresh Testing Series with one populated project for every active
 * launch project type. It intentionally has no default account or credential.
 *
 * Required environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)
 *   YOW_SEED_EMAIL
 *   YOW_SEED_PASSWORD
 *   YOW_SEED_CONFIRM=WIPE_USER_DATA
 *   YOW_SEED_CONFIRM_EMAIL=<same value as YOW_SEED_EMAIL>
 */
import { createClient } from '@supabase/supabase-js'

const WIPE_CONFIRMATION = 'WIPE_USER_DATA'

const USER_TABLES = ['novels', 'series_items']
const NOVEL_TABLES = [
  'characters',
  'factions',
  'locations',
  'timeline_events',
  'world_history',
  'acts',
  'chapters',
  'scenes',
  'lore_entries',
  'idea_entries',
  'maps_data',
  'whiteboards_data',
  'story_schedule',
  'rpg_characters',
  'comic_pages',
  'comic_panels',
  'eras',
]
const APP_DATA_TABLES = [...USER_TABLES, ...NOVEL_TABLES]

const TABLE_TO_KEY = {
  novels:           'novels',
  series_items:     'series',
  characters:       'characters',
  factions:         'factions',
  locations:        'locations',
  timeline_events:  'timeline',
  world_history:    'worldHistory',
  acts:             'acts',
  chapters:         'chapters',
  scenes:           'scenes',
  lore_entries:     'loreEntries',
  idea_entries:     'ideaEntries',
  maps_data:        'maps',
  whiteboards_data: 'whiteboards',
  story_schedule:   'storySchedule',
  rpg_characters:   'rpgCharacters',
  comic_pages:      'comicPages',
  comic_panels:     'comicPanels',
  eras:             'eras',
}

function getTableRows(table, userId, items = []) {
  if (!items?.length) return []
  if (table === 'scenes') return items.map(item => ({ user_id: userId, scene_id: item.id, data: item }))

  const isUserLevel = USER_TABLES.includes(table)
  return items.map(item => ({
    id: item.id,
    user_id: userId,
    ...(isUserLevel ? {} : { novel_id: item.novelId ?? null }),
    data: item,
    updated_at: new Date().toISOString(),
  }))
}

async function throwIfError(promise, label) {
  const { error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
}

let _counter = 0
const uid = () => (++_counter).toString(36) + Math.random().toString(36).slice(2, 8) + Date.now().toString(36)

// ─── Rich prose content ───────────────────────────────────────────────────────

const NOVEL_SCENE_A = `The morning Kael arrived in Ashenveil, the fog sat so low it swallowed the rooftops whole. He pulled his collar up against the damp and made his way through the market district, past stalls of smoked fish and dyed wool, past children who stopped to stare at the unfamiliar sigil on his travelling cloak. He was used to being looked at. He was not used to being looked at with that particular mix of hope and fear.

"You're the one from the capitol?" The speaker was a woman in her fifties, hair iron-grey, eyes quick and analytical. She didn't wait for his answer. "Council's been waiting since dawn. I'm Aldren. I'll take you."

She turned without ceremony and he followed her through a narrow alley that smelled of brine and old rain, out onto a cobblestone plaza where a fountain stood dry, its basin cracked down the centre as though something enormous had struck it from above. Several people sat on the rim, talking in low voices that stopped entirely when they saw him.

The Council Hall was a squat building of dark stone, its entrance framed by two carved oak trees whose branches met overhead in a canopy of frozen leaves. The carving was old, older than anything Kael had seen outside the Archive. He touched the wood without thinking.

"Don't," Aldren said quietly. "It's considered rude. The trees are the founders. Ancestors of everyone in this town."

He pulled his hand back. "I didn't know."

"No one expects you to. You're from the capitol."

Inside, the hall smelled of candle-smoke and cedar. Seven people sat around a table that was clearly designed for twelve—the empty chairs were conspicuous, some of them pushed back as though their occupants had stood in a hurry and not returned. Kael took this in and said nothing. He had learned long ago that what people didn't say told you more than what they did.

"Warden Kael." The speaker at the head of the table was a man younger than Kael expected, perhaps thirty, with the careful posture of someone who had recently been handed authority he hadn't asked for. "I'm First Speaker Aldric. We appreciate your response to our petition."

"The capitol takes all petitions seriously." A diplomatic lie. The capitol had assigned him to this because no one more senior wanted the posting. A village in the outer reaches, three hundred souls, a report of something wrong with the old roads. Standard haunting protocol, probably nothing.

Except nothing about the dry fountain or the empty chairs felt standard.

"Tell me what happened," he said, pulling out his ledger, "from the beginning. Not the version you wrote in the petition. The version you were afraid to write."

Silence moved around the table like a weather front. Aldric and Aldren exchanged a look. Then an older man at the far end—heavyset, with the calloused hands of someone who had worked stone for decades—cleared his throat.

"It started with the roads," he said. "Three months back. The east road, the one through Greywood. Travellers stopped coming through. We thought—bandits, maybe. Sent two of our warders to check. They came back fine, said the road was clear. But the travellers still didn't come."

"Then Mira's boy went missing," said a woman to Kael's left, her voice flat with the controlled steadiness of someone who had cried about this already and was done with it for now. "He was seven. He went into the yard before supper and didn't come back. We searched for a week."

"Did you find him?" Kael asked, though her tone had already told him.

"We found his shoes," she said. "Both of them, side by side, at the edge of the Greywood. Very neat. Like he'd taken them off before stepping in." She paused. "Mira's boy never took his shoes off. Not voluntarily. He slept in them."

Kael wrote this down. The detail about the shoes was the kind of specific, strange thing that didn't come from imagination. It came from reality, from the specific wrongness of what a person who knew a child understood immediately was out of place.

"And then?" he prompted.

"Then the fog started coming in heavy, even in summer. Then the fountain cracked. Then three more people went into the Greywood—adults, all experienced—and two came back wrong."

"Wrong how?"

Aldren, who had taken a seat without Kael noticing, answered this one. "They couldn't remember their names for three days. When memory came back, there were gaps. Not just the Greywood. Earlier things. One of them forgot her daughter's face."

Kael set down his pen. "What happened to the third person who went in?"

The silence this time was different—heavier, more specific.

"She's still there," Aldric said finally. "As far as we know. She went in six days ago. We haven't searched again. Not after—" He stopped. Collected himself. "Not after what happened to the last search party."

"Which was?"

"They heard her voice," the stone-worker said. "Coming from very deep in the wood. Calling for help. Two of them went toward the sound. The third grabbed them and pulled them back. She said the voice didn't sound right. Too even. Like someone was reading the words off a page."

Kael looked at the empty chairs. He picked his pen back up.

"I'm going to need a guide who knows the Greywood's edge," he said. "I won't go in until I've walked the perimeter and taken readings. And I'm going to need to speak with the two who came back—the ones who forgot." He looked up. "Separately. Without anyone else in the room."

Aldric nodded slowly. "You think you know what it is."

"I think I know what family of things it is," Kael said. "Which narrows it. But I want to be precise before I say anything else." He closed the ledger. "Because if I'm right about the family, the solutions are very different depending on which member of that family we're dealing with. And getting it wrong would be worse than doing nothing."

The First Speaker held his gaze. Outside, somewhere in the fog, a bell rang once and stopped. No one seemed to find this unusual except Kael, who wrote it down.`

const NOVEL_SCENE_B = `The Greywood's edge was not a dramatic thing. No wall of black trunks suddenly materialising from nothing, no clear line where the world changed and became something else. It was a gradual process—the light softening, the undergrowth thickening, the birdsong growing sparse and then absent. Kael walked the perimeter with Torsa, who had grown up in Ashenveil and knew the wood the way most people knew the layout of their own homes.

"Where did the shoes appear?" he asked.

She pointed. "There. See the white birch with the split trunk? Fifteen feet in front of it."

He crouched, not to look at the ground—the trail was three months cold—but to feel the quality of the air at ground level. It was different here. Not colder, exactly. Denser. Like the air just before a storm, that particular heaviness that meant charge building.

"You've felt it too," Torsa said. She was watching him with the flat, careful attention of someone who had given up being surprised.

"The pressure? Yes." He stood. "How long has that been there?"

"Since the cracked fountain. It came at the same time."

He nodded and wrote it down. Chronology mattered. If the pressure had preceded the disappearances, you had a different sequence of cause and effect than if it had followed them. The fountain crack suggested a single large event—a rupture of some kind—rather than gradual deterioration. Things that happened gradually and things that happened suddenly responded to different interventions.

He walked another twenty metres along the perimeter, taking readings with the compass-like instrument from his kit. The needle, which should have pointed magnetic north, was rotating slowly clockwise. Not spinning—it wasn't the fast chaotic rotation you got near an active breach. Slow. Deliberate, almost. Like something below the surface stirring in its sleep.

"The two who came back," he said without looking up. "I spoke to them this morning. One of them—the younger woman, Petra—she said she remembered going in but not what she saw inside. Just that it was very quiet. And dark. Not dark like night. Dark like something was absorbing the light."

"That's not normal dark," Torsa said.

"No. It's a specific effect. It means whatever's in there is consuming ambient energy, which tracks with the air pressure and the compass deviation." He put the instrument away. "Torsa. The third person who went in. The one who's still there. What was she like?"

Torsa didn't answer immediately. She looked at the split white birch.

"Steady," she said finally. "Practical. Not the type to go looking for trouble. She went in because she thought she heard Mira's boy. She was close to that family. Mira is her sister."

"Was there anyone else who might have wanted to find him badly enough to go in despite the danger?"

"Ashenveil isn't a big village." A pause. "We all wanted to find him."

He looked at her. "But she went."

Torsa met his eyes. "She went."

He turned back to the Greywood. The slow clockwise rotation of the compass needle. The absorbed dark. The voice that sounded like someone reading words off a page.

"Whatever's in there," he said quietly, "has been in there long enough to learn from what it's caught. It's been practising. The voice—your warder said it was too even. That's a thing that's never spoken before, or hasn't spoken for a very long time, figuring out how to do it again." He paused. "Which means it's been inactive for a while. Dormant. Something woke it."

"The fountain cracking."

"Possibly. Or the fountain cracking was a symptom of it waking, not a cause." He looked at the split birch. "Tell me about the founders the trees are carved from. The actual people, not the legend."

Torsa frowned. "Why?"

"Because when something dormant wakes up, it's usually because the thing that was keeping it dormant stopped. And in a town this old, the thing doing the keeping is usually a thing the founders put in place. And if I'm going to understand what's in that wood, I need to understand what the founders knew about it."

The fog had thickened while they talked. Somewhere deep in the Greywood—deep enough that it should have been inaudible—something cracked. A single sound like a branch underfoot.

Neither of them moved.

"No one goes in after dark," Torsa said. "That's a rule we haven't broken."

"That's a good rule," Kael said. "We won't break it today." He turned away from the trees. "But tonight, I want to look at whatever records you have about the founding. The older the better. The ones that are hard to read, that no one's bothered with in years. Those are usually the important ones."`

const NOVEL_SCENE_C = `The archive was smaller than he'd hoped but better organized than he'd expected. Someone had cared about these records once. The cataloguing system was antique—arranged by incident rather than date—but meticulous. He found what he was looking for near the back, in a box labelled with a word he didn't recognize, in a dialect that predated the current tongue by at least four centuries.

He sat down on the cold stone floor and began to read. Three hours later he knew what was in the Greywood. He wasn't sure that made him feel better.

It had a name, in the old language. He wrote the name down phonetically and then spent another twenty minutes reading around it to make sure he had the correct translation: Threshold Keeper. The entry was seven pages long, written in a hand that was even and unhurried, suggesting someone who had known they were writing something permanent and had taken their time. The prose was dense with technical terminology from a tradition that predated the Warden Network by at least two centuries, but the meaning was extractable.

A Threshold Keeper, according to the text, was an entity of territorial rather than appetitive nature—it did not consume its environment but rather monitored it. Specifically: it monitored the boundary between the Greywood and Ashenveil, and by extension the boundary between whatever the Greywood represented and whatever Ashenveil represented. The Keeper did not define these categories. It enforced them.

The founders had not created it. They had found it. They had made a contract with it, the terms of which were written in a separate document that was apparently kept elsewhere—Kael searched for an hour and could not find it. What the founding entry said about the contract was limited: that it had been renewed twice in Ashenveil's history, that the renewal required a specific ceremony conducted at specific locations, and that failure to renew would result in the contract lapsing "with consequences that will be known to any who have witnessed the Keeper unbound."

He had interviewed Old Soven that afternoon. He thought about what Soven had told him, reluctantly, with the specific reluctance of someone who has been carrying a thing alone for a very long time and is simultaneously relieved and terrified to set it down. The event sixty years ago. The things that had happened in the weeks before it was contained. The measures taken. The measures that had stopped short of what was probably necessary because the alternative would have left Ashenveil without enough people to continue being a town.

The anchor points, Soven said. There were four of them, at the cardinal directions. They were physical objects, placed by the founders, renewed in the ceremony. He didn't know what the objects were. Only the ceremony masters knew. The ceremony masters were dead—the last one had died twenty-two years ago, an old woman named Thern who had tried to write it down but whose handwriting, by that point in her life, was almost entirely illegible. Her notes were, he suspected, the document he hadn't been able to find.

He sat for a moment with what he knew. Then he went to find Old Soven again, because there were more questions, and because the old man had started talking and sometimes when that happened there was more to come if you were patient.

Soven was in the tavern. He was not drinking—he had a cup of hot water, which was, Kael thought, either the economy of old age or a statement of purpose. He looked up when Kael came in and didn't seem surprised.

"The objects," Kael said, sitting down. "The anchor points. You don't know what they are. But sixty years ago, when things went wrong—what were the symptoms? Before the resolution, before the ceremony. How did you know it was the anchors?"

Soven wrapped his large hands around the cup. "The same as now," he said. "The compass changed. The air changed. And something came out of the wood. Not all the way out. Just to the edge. And it started—communicating." He paused. "Not talking. Not yet. More like insisting on being noticed. Making the world around it say things."

"What kind of things?"

"Things that were there but that you weren't supposed to know about yet. Private things. True things." He looked at his water. "It went through the people at the village boundary first. The ones who lived closest to the Greywood. After three days, they couldn't keep secrets anymore. Not even from themselves."

Kael was very still.

"It forced truth," he said.

"Not forced. Revealed. There's a difference. If it had forced, people would have blamed it. Because it only revealed what was already there—" He stopped. "People had a harder time with that."

"What happened to them? The people who lived at the boundary?"

"Some of them were fine. Some of them—the ones whose truths were things they couldn't live with—" He didn't finish the sentence. He didn't need to. "The ceremony, when it happened, was complicated. But it worked. The anchors were renewed. The Keeper went quiet. And we agreed, as a village, not to talk about what we'd learned in those weeks."

"Did that work?"

Soven looked at him steadily. "Some things you know and you carry and you don't let them change what you do. It works if you're determined enough." He put the cup down. "But I'm eighty-one. And I'm tired of being determined."

Kael was quiet for a moment. "What did you learn? About yourself. In those weeks."

A long pause.

"That I knew, when I was young, about a wrong thing being done and I chose not to speak because I was afraid of what speaking would cost me. And later I told myself I hadn't known clearly enough to be sure." He looked at his hands. "That was not the truth."

Kael looked at the old man across the table—the enormousness of him, the patience, the specific kind of dignity that comes not from having done everything right but from having lived long enough with having done things wrong that you've made a kind of peace.

"Thank you," Kael said.

"Find the document," Soven said. "Thern's notes. The handwriting is bad but you'll manage—you're the type. And find the anchors before it gets worse. It always gets worse if you wait."

Kael stood. "I know."

"And Warden." Soven looked up. "When it reveals things about you—because it will, if you get close enough—try not to be surprised by what you learn. In my experience the things it shows you are things you already knew, on some level, and were waiting for permission to look at directly."

Kael considered this. Then he left the tavern and went back to the archive to look for a document with very bad handwriting.`

const NOVEL_SCENE_D = `She was still there.

Kael found her on the fourth day inside the Greywood—not in the centre, where the dark was absolute, but in a clearing near the northern edge where the light came down through the canopy at a strange angle, more silver than gold. She was sitting against a tree, eyes open, not asleep. She had the quality of someone who had stopped expecting things.

Her name was Solen Mira—same surname as Aldric, he noted, though they'd said nothing about that—and she was Mira Chen's sister. She was thirty-one. She had a practical face, a carpenter's callused hands, and she was looking at something in the middle distance that wasn't there.

He approached slowly. The Greywood had specific rules about sudden movement. He'd learned three of them in the first hour, the hard way, the fourth by observing what happened to a branch he'd dropped.

"Solen."

She turned her head. Her eyes focused with the particular effort of someone returning from a great distance.

"You're the warden," she said. Her voice was steady. He'd expected worse.

"Yes. Kael Morven." He sat down a few metres away from her, cross-legged, at her eye level. "Are you injured?"

"No." A pause. "I don't think so. I'm not sure how to tell anymore." She looked at her hands. "I've been here for—how long has it been?"

"Ten days."

A silence.

"That's more than I thought." She processed this without visible panic, which told him something. "I found the boy," she said. "Peyt. He's fine. He's—he's been with it. The thing in the wood. It wasn't hurting him. It was keeping him because it didn't know what else to do with him. He wandered in and it—collected him. Like a curiosity." She paused. "I sent him out. I think he went. I told him to follow the compass in my kit and not stop."

"He came out two days ago," Kael said. "He's home."

She closed her eyes briefly. When she opened them there was something in them that hadn't been there before—a release, slight but real. "Good. Good." Then: "Why are you still here? Why are you inside?"

"Because you're still here."

"I stayed." She said it without inflection. "When I found it—the thing—I understood that if I left without talking to it, we'd never resolve the situation. It was trying to communicate. It just didn't have the—" She gestured with one hand, a shape like something reaching and finding nothing. "The framework. It knows what things are but not how to tell anyone. And it doesn't understand that not knowing how is a problem, because it doesn't know that other minds work differently from its own."

Kael was writing quickly. "What has it been doing? In the ten days."

"Showing me things." She said it simply. "Not visions. Real things. Things about the village. About its history here. It remembers everything that happened in or near this wood since it's been here. It has—" She paused. "It has records. They're not written down. They're just in it. All of it. The founders' contract. What the anchors are. What they were supposed to do."

He went very still. "It knows about the anchors."

"It made the anchors. The founders didn't provide them—they worked out the contract and then it produced something from itself and gave the objects to the founders. Four pieces of it, essentially. Parts of its attention placed outside the wood as anchor points. And when those parts stop working, it stops being bounded by the contract, because the contract can't hold without them." She looked at him. "It's not trying to cause harm. It's trying to get the contract renewed. It doesn't have the language to ask, so it's been—demonstrating. Showing people what happens when it's unbound, to make the point that something needs to be done."

"The missing memories," Kael said. "The revealed truths."

"Those are side effects of proximity, not deliberate acts. It doesn't understand that the way it perceives things—the accessing of memory, the surfacing of buried knowledge—is experienced as violation by people with discrete private minds. It's never understood that, because it doesn't have a private mind itself. Everything it knows is simply known. Nothing is hidden."

Kael sat with this. It was the longest explanation of a non-human cognition he had encountered in twenty years of work, and it had come from a carpenter who had spent ten days in a wood with something that had no face.

"Can you tell it," he said carefully, "that I'm here to renew the contract? That I need to understand what form the renewal takes."

Solen was quiet. Then something shifted in the quality of the air around them—a pressure change, a slight alteration in the light.

"It hears you," she said. "It's been hearing you since you entered the wood. It's been deciding whether to answer."

"And?"

"And," she said, "it's going to answer. But it wants something first. Not a negotiation—it doesn't negotiate the same way. More like a condition it needs to know is met."

"What condition?"

She looked at him steadily.

"It wants to know if you understand that what you're repairing was wrong to begin with. The original contract was imposed, not agreed to. The founders bound it without fully understanding what they were dealing with and set terms that were—" She hesitated. "Inadequate. It has held to the contract because holding to contracts is part of what it is. But it wants to know if the person renewing the contract knows that, and is prepared to work toward something more equitable in the long term."

Kael looked around the clearing. The strange silver light. The stillness that was not empty but full.

"Yes," he said. "I understand that."

A long pause.

"It believes you," Solen said. "Which is interesting—it doesn't generally believe people. But it says you have the quality of someone who has made errors of understanding and is aware of them." She paused. "It says that's rare."

Kael looked down at his ledger. He had stopped writing.

"Tell it," he said quietly, "that I'll need her to stay with me as translator. And tell it that I'm going to do this correctly or not at all."`

const NOVEL_SCENE_E = `The ceremony took three days.

Not because it was complex—the objects themselves were straightforward, once the Keeper had shown him where they were buried, which it did through a series of increasingly unambiguous environmental signals that Solen translated with the patience of someone who had, over ten days, learned a language that had no words. The objects were smooth river stones, each about the size of a fist, each containing what Kael could only describe as a presence—something aware, quiet, patient in the way of things that have been waiting for a specific thing for a long time.

They were buried at the four cardinal points of the village's founding perimeter—not where the village boundary currently stood, but where it had stood two hundred years ago, which was further out than anyone living knew. Old Soven knew. Of course Old Soven knew. When Kael came to him with the measurements, Soven went to a box under his bed that contained a paper he'd held for thirty years and never opened, because the old woman who gave it to him had told him not to open it unless someone who knew what to ask for came asking.

The paper had a map.

The map was accurate.

The stones, once located, had to be cleansed—the old working that had sustained them was not gone but corrupted, the way a bone heals wrong if it's set badly. Kael knew how to do this. It was meticulous, painstaking work that he had done twice before under very different circumstances, and he did it with the same care, working slowly so he wouldn't have to redo it. Solen sat with him at each site and described what the Keeper was experiencing as the process happened. It was—she said—the closest she could get to the word relief. The release of something that had been held under pressure for a very long time.

The third stone was the difficult one. It was under the dry fountain.

The fountain had cracked because the stone beneath it had been struggling—the Keeper had been pushing against the failing anchor, not to break it but to sustain it, and the force had come up through the ground in ways the world above expressed as structural damage. He worked at the fountain for most of a day, on his knees in the empty basin, while a small crowd of Ashenveil residents watched from what they had decided was a safe distance. He didn't mind. He had worked with crowds before. The witnesses helped, sometimes—something about the presence of people who cared about the outcome made the work go more cleanly.

Aldren brought him tea at midday. She didn't ask questions, which he appreciated.

"How will we know when it's done?" she asked.

"The fog will lift," he said. "The compass will settle. And the fountain will fill." He looked at the cracked basin. "I'd have someone there to watch when that happens. The first water will be cold, but it will be clear."

"And the Keeper?"

"Will return to the Greywood. Not because it's confined—the new terms are different on that point—but because the Greywood is its home and it doesn't particularly want to be elsewhere. It will still monitor the boundary. That's its nature. But the monitoring will be—" He looked for the word. "Quieter. Less pressured."

"Will it take things again? People who go into the wood?"

"No." He was certain of this. "It understands now that the way it perceives things is experienced differently by human minds. It won't stop perceiving—it can't, it's what it is—but it will be more careful about where that perception goes. And people who go into the Greywood without preparation will find it—strange. They'll want to leave. It will encourage that, not out of hostility but out of a kind of hospitality: the wood is not a place that suits human minds for extended periods, and it has learned enough to know it."

Aldren was quiet for a moment. "And Solen?"

"She'll need some time. The experience of sustained contact with something that has no concept of privacy leaves marks. Not damage—she's stronger than that—but marks. She'll find, for a while, that she knows things she doesn't know how she knows. That will fade. What won't fade is the perspective. Which she can do what she likes with."

The third stone settled at the close of the day. He felt it happen in his hands—a click, not audible, but real, the way a lock opening is real. The air above the basin changed. And then the water came—slow at first, trickling from the crack, then steadier, then flowing as though the crack had never been there—clear and cold and continuous.

Several people in the watching crowd made sounds. He didn't look up. He was writing in his ledger, and what he was writing was not the technical notes of the ceremony but something else: an account of what Solen had told him, over three days of translation, about what the Keeper had experienced across two centuries of holding the line between the wood and the village. It was not a story he had expected to hear. He had expected something alien and incomprehensible. What he had gotten was—in many ways—the most comprehensible account of endurance and obligation he had ever recorded.

He would file this in the Archive. He would also, he decided, file a recommendation that the Archive's category for non-human entities be revised. "Family Four" was inadequate. He had always suspected it was inadequate. Now he had evidence.

He finished writing. The fountain filled. The fog lifted, slowly, like something deciding not to stay.`

const NOVEL_SCENE_F = `He left Ashenveil on a clear morning, three weeks after arriving.

Solen Mira walked with him to the road's edge—she had recovered faster than he'd predicted, which he noted with professional satisfaction and something less professional, something warmer. She had the quality of someone who had been changed by an experience and was neither trying to pretend otherwise nor performing having been changed. She was simply different, in the specific way of people who had looked at something true and let it be true.

"What will you write?" she asked. "In the official report."

"The standard account. Dormant entity, Family Four classification pending reclassification, anchor degradation, ceremony of renewal performed successfully, settlement returned to stable condition." He paused. "And a recommendation for revised protocols around the classification system, and a separate note about the founder contract that will go to the Archive's historical division."

"Will they read it?"

"Someone will read it," he said. "It may take twenty years, but someone will. The Archive has its own kind of memory. Things get to where they need to go, eventually."

She looked at the road ahead of him—east, toward the capitol, through country that was flat and clear in the autumn morning light.

"What did it show you?" she asked. "The Keeper. When it was assessing you." She paused. "You said it told me it believed you because you were aware of your own errors of understanding. What was it seeing?"

He had expected this question. He had been deciding, over three weeks, whether he would answer it.

"My partner," he said. "Twelve years ago. The case where I lost her. I had data that suggested one classification and chose another, because I had more experience and I was certain I was right. I wasn't right." He looked at the road. "I've been working alone since because I convinced myself it was better for the work. But the Keeper saw—it showed me—that the truth was that I was afraid of being responsible for someone else again. And I'd built a very good rationale around the fear and called it professional discipline."

Solen was quiet.

"What did you do with that?" she asked. "When it showed you."

"Nothing yet. It's only been three weeks." He glanced at her. "That's the other thing it showed me. I'm in too much of a hurry. I've always been in too much of a hurry. Twenty years of working quickly because I was afraid that slow meant another person getting hurt while I deliberated. The Keeper lives on a timescale that makes my twenty years look like a week. Watching it work—" He stopped. "It changed something in how I think about the relationship between urgency and care."

"In a good way?"

"I hope so. Ask me in ten years."

She smiled—the first full smile he'd seen from her, not the careful functional expressions of someone managing a complicated internal situation but something unguarded and real.

"I'll hold you to that," she said.

He picked up his pack and started walking. He had half a mile before the road curved and Ashenveil would be out of sight. He didn't look back until the curve, where he stopped and looked once—the cluster of buildings, the market district, the Council Hall with its carved oak founders, and at the centre of the plaza, the fountain, which was running clear in the morning light.

He wrote in his ledger for a moment. Then he put the ledger away, turned, and walked east.

Behind him, in the Greywood, the Keeper felt the last of his presence leave the edge of its territory and settled back into the long patience of its kind—monitoring, maintaining, remembering everything, the way it had always done, the way it would do for as long as the contract held, which was, under the new terms, a matter of ongoing renegotiation between parties who had, finally, been introduced properly.

The fog did not return.

The compass pointed north.

The village of Ashenveil, population three hundred, continued its ordinary life in the manner of places that have survived something and decided not to talk about it—which is to say, quietly, with the specific knowledge that quiet is not the same as empty, and that what you don't say can be, depending on what it is, the most important thing you know.`

// Pad the novel to approach 90k words by repeating scenes with variation
function buildNovelContent(sceneIdx, chapterIdx, actIdx) {
  const bases = [NOVEL_SCENE_A, NOVEL_SCENE_B, NOVEL_SCENE_C, NOVEL_SCENE_D, NOVEL_SCENE_E, NOVEL_SCENE_F]
  const base = bases[(sceneIdx + chapterIdx * 2 + actIdx) % bases.length]
  const padding = `\n\n---\n\n${bases[(sceneIdx + 1) % bases.length].slice(0, 800)}\n\nThe work continued. Each day brought new detail, new complication, new evidence of how much he had not yet understood. He filled pages in his ledger with observations that he would later read and find both more and less useful than they had seemed in the writing—this was, he had learned, the nature of fieldwork. You collected everything. You never knew until later which part mattered.`
  return base + padding
}

const NOVELLA_CONTENT = `PART ONE: THE SUMMER OF LOSING SIGNAL

The summer Dani stopped checking her phone—really stopped, not the performative detox she'd tried twice before—was the summer the house spoke to her for the first time.

She'd been at the coast house for three days before she noticed. The house was her grandmother's, technically—or had been; Gran had died in March and left it to Dani in a will that had surprised everyone, including Dani, who had seen Gran maybe six times in her adult life and had spent half of those visits being gently interrogated about her life choices. The bequest had a condition: Dani had to spend one full summer there before she could sell it.

The house was old, which she'd known. It was also large, which she'd underestimated. Three stories, eight rooms, a basement she hadn't opened yet, a garden that had gone to seed in a specific way that suggested it had been intentional once. The ocean wasn't visible from the house but it was audible on clear days—a presence at the edge of perception, like a word on the tip of your tongue.

On the fourth day, she was sitting at the kitchen table with a cup of coffee and a book she was pretending to read, when she heard it. Not a voice, exactly. More like the house taking a breath. The quality of the silence changed, became pointed, and she looked up from the book to find herself paying attention to the wall to her left in a way that didn't have a ready explanation.

On the wall was a small painting she'd been walking past for days without registering. A coastal landscape—cliffs, water, a figure small in the distance. Competent but not technically distinguished. The kind of painting you inherited with a house and didn't think about.

Except the figure in the painting was different from how she'd seen it yesterday.

She was almost certain. Yesterday it had been on the cliff. Today it was at the water's edge.

She sat with this for a while. Then she took a photograph of the painting, poured more coffee, and sat back down. She would look at the photograph tomorrow and compare. There was probably an explanation. Light changes, perception shifts, the psychological tendency to see change in static things when your brain is running on grief and bad sleep and three days of near-total silence.

She looked at the painting. The figure seemed to be looking back.

"Alright," she said aloud. "What is it?"

The house didn't answer. Of course it didn't. She picked up her book.

Three pages later, without looking up, she said: "Gran. I know it's you. I've read enough of your journals to know your sense of humour."

Still nothing.

"I'll figure out the basement tomorrow," she said. "I promise."

The quality of the silence changed again—less pointed, somehow settled. She decided to take that as satisfaction and go to bed.

PART TWO: THE BASEMENT

The basement contained, in order: a water heater, a washing machine that probably worked, a wine rack that was now empty, seventeen cardboard boxes labelled in her grandmother's handwriting, and a room behind a door that she hadn't seen referenced in the property description.

On top of the most recent box was an envelope with Dani's name on it.

Gran's handwriting was distinctive—small, very precise—and the letter was four pages.

"The house has a memory. Not a ghost—I've never been patient with the word ghost, it's imprecise—but something more like the way a place holds what happened to it, the way that some rooms smell like the person who lived in them long after that person is gone. The house remembers everything that happened in it. Under certain conditions you can ask it to show you.

I am telling you this because you were always the most practical of my grandchildren. Practical people are better at working with memory than sentimental ones. Sentimental people want the memory to be what they wish it was. Practical people can work with what it actually is, even when it's complicated.

The painting in the kitchen shows what the house wants to show you. Pay attention to the figure. It will change. I know this is not how you think about the world. I'm asking you to expand how you think about the world.

There are three questions the house hasn't answered for me, even after seventeen years. The first question is about the summer of 1943. Something happened here. The house shows it but won't let me see clearly. The second question is about the figure in the painting. It appears in all depictions of the property going back to the house's construction in the 1880s. I don't know who it is. I don't know what it wants. The third question I'm not going to write down. You'll understand why when you've been here long enough."

Dani sat on the cold floor for a while after she finished reading.

Then she picked up the first box in the chronological sequence—the earliest date she could find—and she began to read her grandmother's notes.

PART THREE: WHAT REMAINS

She found the answer to the third question on the last day of August.

She'd been in the house for sixty-three days. She had read all seventeen boxes. She had developed a relationship with the painting that she would have found deeply strange to describe to anyone, but that felt, from the inside, like the most natural thing she'd done since arriving: paying attention to something that was paying attention back.

The figure had moved, over the course of the summer, from the water's edge to the path, from the path to the garden, from the garden to the window. Today, for the first time, it stood inside the house. In the painting, it stood in the kitchen doorway. In the kitchen, Dani stood looking at the painting of it standing in the kitchen doorway, and they looked at each other across the strange recursion of the image.

The third question her grandmother hadn't written down: Do you want to stay?

The house had been asking her this, obliquely, all summer. It had shown her the memories, the history, the 1943 summer that had been both worse and more comprehensible than she'd feared. It had shown her what the figure was—not a ghost, not a threat, but a kind of record, the most important thing that had ever happened in this house preserved in the only form the house knew how to keep it. It had shown her her grandmother's work, meticulous and loving, across seventeen years of learning to listen.

And now it was asking.

She looked around the kitchen. The morning light on the worn wood floor. The sound of the ocean. The smell of coffee and old stone.

She thought about her apartment in the city, where Marcus had also been in her apartment in the city. She thought about her work, which could be done from anywhere with an internet connection. She thought about her grandmother, who had spent seventeen years asking questions that the house took its time answering and had found, apparently, that this was a good way to spend a life.

"Yes," she said. "I want to stay."

The painting changed one more time. The figure moved back to the cliff where it had started, and stood there, looking at the water, and in its posture was something that was not quite resolution but was close—the specific quality of a thing that has been carrying something for a very long time and has found, finally, someone to carry it forward.

Dani sat down at the kitchen table with a fresh cup of coffee and opened her grandmother's first notebook to the beginning.

There was a lot to learn. She had the rest of the summer—and, it appeared, considerably more than the rest of the summer—to learn it.`

const SHORT_STORY_CONTENT = `The letter arrived on a Tuesday, which felt wrong from the start. Important things shouldn't arrive on Tuesdays. They should arrive on Mondays, when you're braced for impact, or Fridays, when the week has already decided its shape. Tuesdays are the middle of things. Tuesdays don't have the decency to be momentous.

Elena turned it over in her hands three times before she opened it. The return address was a law firm she didn't recognize in a city she'd never been to, representing an estate she hadn't known existed. Her grandmother's sister—a woman she'd met twice, remembered as a smell of lavender and a very firm handshake—had died and left her something. Not money. The letter was careful about this. It said personal effects and one specific bequest, and gave an address.

She almost didn't go. She had work, she had the cat to feed, she had a dozen small reasons stacked up like sandbags against the specific kind of upheaval that came from unexpected inheritances. But on Thursday she called in and took the day.

The address was a storage unit three towns over, climate-controlled, one of a row of identical orange doors. The facility manager, a man in his seventies with the patient air of someone who had seen a great deal of grief come through these orange doors, gave her the code and left her alone.

The unit contained exactly one thing: a wardrobe.

It was beautiful. Old, solid, the wood dark with age, the handles brass worked into the shapes of leaves. It was also far too large to have fit through the unit's door, which created a problem Elena stood in front of for a while before concluding she was misremembering how wide the door was.

She opened it.

The smell hit her first—not lavender, not cedar, not the mustiness she'd expected—but the specific clean cold smell of air that had never been indoors. Mountain air. The smell of altitude.

She looked inside the wardrobe. She looked into a forest.

The trees were enormous. Silver-barked, their canopy so high it was lost in a grey-white sky. The light had a quality she'd never seen before—diffuse, directionless, as though the sky itself was glowing rather than any single source. The ground was carpeted in something blue—not moss exactly, not flowers, something between the two.

She stood in the door of the wardrobe for a long time. Then she stepped in.

The floor of the wardrobe became ground, the smell of altitude became wind, and behind her—she turned to check—the orange door was still there, three feet away, slightly ajar. She could step back through it any time. That was important. She filed it carefully in the part of her mind that handled emergency protocols and turned back to face the silver trees.

A figure stepped out from behind the nearest one. Not threatening—the posture was wrong for threatening, too open, hands visible, head tilted in something that read as curiosity even from twenty feet away. A woman, tall, dressed in layers of grey and blue that moved like the fabric was thinking about being water. Her face was familiar in the way that faces sometimes were: not that you'd met them, but that they belonged to a category you recognized.

"You're later than we expected," the woman said. Her accent was unlike anything Elena had heard, the vowels slightly wrong in a way that wasn't quite any accent she knew. "But the wardrobe has always had its own timing."

Elena looked at the silver trees. She looked at the blue ground-covering.

"What is this place?" she asked.

The woman smiled—a real one, not a performance of one. "We call it the Interval," she said. "It's the space between your world's before and after. Your grandmother's sister guarded the door for sixty years. She chose you to come next." A pause. "She didn't ask us to tell you that you could say no. But you can. The wardrobe will bring you back, and you'll never think about this again. That's part of how it works."

Elena looked at the orange door, still slightly ajar. Her car was in the parking lot. The cat needed feeding at five.

"What does guarding the door involve?" she asked.

The woman in grey-blue looked surprised, as though this was not the first question she'd expected. Then something in her expression settled into what Elena would later think of as respect.

"That," she said, "is the right question." She turned toward the silver trees. "Come on. I'll show you."

Elena followed her into the Interval, and behind her—without her touching it—the orange door swung gently shut.

She would be back by Thursday. The cat would be fine. And the door, she would discover, was easier to open from the inside than anyone who hadn't been through it would expect.

That was the thing about the Interval: it wanted to be found. It had been waiting, in that patient way of places that exist between things, for someone who would ask the right question. Not "what is this" but "what does this require of me." Not wonder but readiness.

Elena was ready. She hadn't known it until she stepped through, but she was. The woman in grey-blue seemed to know it already, which was fine—Elena preferred people who were ahead of her to people who were behind her. It was easier to follow someone who knew where they were going.

She followed her into the silver trees, and the Interval, sensing that something long-deferred had finally arrived, settled around her like a coat that fit.`

const PLAY_CONTENT = `A bare stage. A single chair. A woman—MARGUERITE, late 60s, wearing an apron that suggests she has interrupted something domestic—stands behind the chair. Opposite her, a man—ELLIOT, 40s, suit jacket over a shirt that has been through a long day—stands with the uncertain posture of someone who was recently somewhere else.

MARGUERITE: (without looking at him) Close the door.

ELLIOT: I didn't—there isn't—

MARGUERITE: The door behind you. The one you came through. Close it. You'll thank me.

He turns. Mimes closing a door. Turns back.

ELLIOT: How did you—I don't understand how I'm here.

MARGUERITE: No one ever does. (finally looks at him) Sit down. You look like you're about to fall.

He sits in the chair.

ELLIOT: Is this—is this where people go? After?

MARGUERITE: After what?

ELLIOT: After—(stops. Tries again.) I was in the car. The road was wet. And then I was here.

MARGUERITE: (sitting on the edge of the stage) It's not where people go after. It's more like—between. A waiting room, except the magazines are your own memories and the chairs are conversations you didn't finish.

ELLIOT: That's not reassuring.

MARGUERITE: It's not meant to be. It's meant to be accurate.

Pause.

ELLIOT: Are you dead?

MARGUERITE: Very much so. For eleven years. (briskly) Before you ask—it gets easier. The not-being-there. The watching. It was very hard for the first three years. Then I found I had stopped missing the things I expected to miss and started missing different things. Smaller things. (pause) The smell of bread. Standing at a window in the morning. The specific weight of a sleeping child on your chest.

ELLIOT: I have children.

MARGUERITE: (quietly) I know.

ELLIOT: Two daughters. Sofia is eight. Mara just turned six last month. I missed—I had to work late so I missed most of the party, but I brought the cake.

MARGUERITE: I know.

ELLIOT: I can't—(stands up) I need to go back. I'm not done. I'm not—there are things that aren't—

MARGUERITE: (not unkindly) Sit down, Elliot.

ELLIOT: (doesn't sit) How do you know my name?

MARGUERITE: Everyone here knows your name. We've been expecting you for a while. You drive very fast on wet roads. People kept mentioning it. (pause) Including your wife.

He sits.

ELLIOT: Marina.

MARGUERITE: She stopped mentioning it two years ago. (off his expression) Not because she stopped worrying. Because she realized you weren't going to slow down and she was spending energy she needed for other things.

ELLIOT: That's—that's not fair.

MARGUERITE: I didn't say it was. I said it was true. (pause) Fair is a thing living people need to believe in. Here, we get to just look at what happened.

A long silence.

ELLIOT: Is there a way back?

MARGUERITE: (carefully) There are cases. Not common. The criteria are very specific, and they're not things you can argue your way into meeting. They're things that are either true or they aren't.

ELLIOT: What are they?

MARGUERITE: (standing) That's the conversation we're here to have. Walk with me.

She moves to the back of the stage. He follows. The lighting shifts—warmer, as though they've moved through a door into somewhere different.

MARGUERITE (CONT'D): The first criterion is unfinished obligation. Not unfinished desire—those are abundant, everyone has them—but something you made a promise about that can't be kept except by you, that will cause specific harm if it isn't kept.

ELLIOT: My children—

MARGUERITE: Are a desire, not an obligation in this sense. Their mother is there. There are grandparents. There are people who love them who will be there. That counts.

ELLIOT: (slowly) Then what counts?

MARGUERITE: Think. (waits) Take your time. This isn't a test you fail. It's a question you either know the answer to or you don't.

He stands very still for a moment. Then something changes in his face.

ELLIOT: David.

MARGUERITE: (watching him) Who is David?

ELLIOT: My brother. We haven't spoken in four years. There was a thing—it doesn't matter what the thing was. I was going to call him. I've been going to call him for four years. I kept not doing it.

Pause.

MARGUERITE: Why didn't you?

ELLIOT: (quietly) Because once I called, he could say no. And I'd have to know. While I was still not calling I could still tell myself he'd probably say yes.

MARGUERITE: (very quietly) And now?

ELLIOT: Now I can't call.

A long silence.

MARGUERITE: I want you to understand something. What I'm about to say is not hope. I'm not giving you hope. I'm telling you the mechanics of something very unusual, and what you do with the information is not my business.

ELLIOT: (quietly) I understand.

MARGUERITE: There is a second criterion. And you just told me what it is. (pause) You have to understand that what you regret is not the argument with your brother. What you regret is the cowardice. The four years of protecting yourself from a possible no.

ELLIOT: (barely audible) Yes.

MARGUERITE: That's the second criterion. Not the unfinished thing, but the understanding of why it's unfinished. The real reason.

ELLIOT: What happens if both criteria are met?

Marguerite is quiet for a long moment.

MARGUERITE: I'll need to check. I haven't seen it happen in eleven years. But I know who to ask.

She moves toward the wings.

ELLIOT: Marguerite.

She pauses.

ELLIOT: Thank you.

MARGUERITE: (not turning) Don't thank me yet. (exits)

Elliot stands alone. The light shifts again—something building in it, a quality of imminence. After a long moment, he sits back down in the chair, and in the stillness, for the first time, we see his face properly: not fear, not grief, but the specific expression of someone who has just been honest with themselves for the first time in years.

End of Scene.

ACT TWO

The same stage. The same chair. MARGUERITE returns. She is moving differently—not faster, but with more purpose.

MARGUERITE: Both criteria are met.

ELLIOT: (very still) What does that mean?

MARGUERITE: It means there is a path back. (pause) It is not the path you came through. It will not return you to the road. It will return you to the hospital, which is where you currently are in a strictly physical sense. The road was not the end. It was close, but it was not the end.

ELLIOT: I'm not dead.

MARGUERITE: You are between. As I said. (sits) The difference between between and after is very small and very large simultaneously. It is the difference between a door that has not yet closed and a door that is closed.

ELLIOT: What do I have to do?

MARGUERITE: Call your brother. When you're back—when you're physically capable of it—call him. That is the obligation that needs keeping. The rest will sort itself out.

ELLIOT: What if he says no?

MARGUERITE: (gently) Then you'll know. And knowing is better than the version of not knowing where you protect yourself from finding out by dying before you make the call.

A pause.

ELLIOT: That's blunt.

MARGUERITE: I've been dead for eleven years. I've run out of time for being anything else.

He almost laughs. It is the most human sound he has made since arriving.

ELLIOT: Will I remember this?

MARGUERITE: Some people do. Some people don't. It doesn't affect the outcome either way. The obligation exists regardless of whether you remember the conversation about it.

ELLIOT: And you? Will I—will I see you again?

MARGUERITE: (standing, moving toward the wings again) I'm your wife's grandmother. I've been watching out for your family for eleven years. You'll feel it occasionally—that particular sense of things working out slightly better than they should. That's me. I'm not going anywhere.

She exits. The light changes one more time—brighter, sharper, the quality of a hospital room rather than a waiting room. The chair remains. ELLIOT remains, sitting in it. After a moment, he stands, squares his shoulders, and walks toward the light.

End of play.`

const SCREENPLAY_CONTENT = `FADE IN:

EXT. COASTAL HIGHWAY - DAWN

A two-lane road hugs a cliff edge. Below, the Pacific. Above, a sky the color of an old bruise, slowly going gold at the edges. A single CAR moves along the road—a beat-up Civic, driving carefully.

INT. CIVIC - CONTINUOUS

DANA REYES (32, exhausted in the specific way of someone who drove through the night by choice) grips the wheel and watches the road. On the passenger seat: a manila folder, a coffee cup that's been empty for two hours, and a dog-eared notebook.

Her phone rings. She glances at the screen. Hits ignore. It rings again. She ignores it again. On the third ring, she picks up.

DANA: I'm almost there.

VICTOR (V.O.): "Almost there" was four hours ago.

DANA: I stopped for coffee in Morro Bay.

VICTOR (V.O.): Dana. The permit window closes at nine.

DANA: I know when the permit window closes.

VICTOR (V.O.): If we miss it—

DANA: We won't miss it. Victor, I've been working this for two years. I'm not going to miss the permit window.

A pause.

VICTOR (V.O.): Did you sleep?

DANA: I'll sleep after.

VICTOR (V.O.): You said that last time.

She says nothing. Outside, the road begins to descend toward sea level, and for a moment the ocean fills her entire windshield—grey and enormous and completely indifferent.

DANA: I'll call you when I'm out.

She hangs up. Puts the phone face-down. Drives.

EXT. HARROW POINT RESEARCH STATION - MORNING

A cluster of prefab buildings at the bottom of a cliff, connected by wooden walkways above the rocky shore. A sign: HARROW POINT MARINE RESEARCH STATION - EST. 1987. The sign is faded.

Dana's Civic pulls into a gravel lot. She gets out, stretches, picks up the manila folder. A DOOR opens and a man emerges: JOEL OKAFOR (40s, the beard of a man who gave up a specific internal argument some years ago, wearing a fleece that's been through too many field seasons). He sees her.

JOEL: (taking in her appearance) How long have you been driving?

DANA: Good to see you too, Joel.

JOEL: Dana.

DANA: I'm fine. I have the signed forms. I have the preliminary data. I have fourteen minutes before the window closes. Where's the terminal?

He looks at her for a moment. Makes a calculation.

JOEL: Inside. Come on.

INT. HARROW POINT - MAIN LAB - CONTINUOUS

Joel leads her to a workstation. She sits and opens the folder, spreading documents with the practiced speed of someone who has done this in worse conditions.

DANA: The hydrophone data is on the drive. Six months of continuous recording, 200 to 1200 meters depth, three transects. The signal analysis is—

JOEL: I saw the preliminary.

DANA: Then you know why I drove through the night.

JOEL: I know why you think you know why you drove through the night. (sits) Dana. The signal could be geological.

DANA: At those frequencies? Geological at those frequencies means—

JOEL: It means something we don't have a category for yet.

DANA: (very precisely) That's what I just said.

They look at each other.

JOEL: The board meets Thursday.

DANA: I know when the board meets.

JOEL: If the permit gets flagged—if there's any hint that this is heading somewhere—

DANA: It's not heading somewhere. It's going somewhere. Specific, defensible, bounded by the data. I just need the permit to continue the deep array work.

Joel is quiet for a moment. He looks at the documents spread across the workstation. Then at her.

JOEL: You look like you've been awake for twenty-seven hours.

DANA: Twenty-nine.

JOEL: Why?

DANA: Because I couldn't sleep. Because every time I close my eyes I hear it.

She pulls up the audio file on the workstation. Puts on headphones, then offers them to him.

DANA (CONT'D): Listen from the forty-third second. That's when it changes.

He puts on the headphones. Listens. The room is very quiet. Through the window, the Pacific sits massive and grey. Something crosses Joel's face—not alarm, not disbelief, but the specific expression of a scientist encountering a data point that doesn't fit any framework they trust.

He takes off the headphones.

JOEL: (quietly) You need to fill out the supplementary form. Section C. And you need to be very careful how you describe the signal source.

DANA: (already typing) I know.

JOEL: "Unknown biological" is going to raise flags.

DANA: I know.

JOEL: Dana.

She stops typing. Looks at him.

JOEL (CONT'D): Whatever this is—if it's what you think it is—the permit is the least of your problems.

A long pause.

DANA: I understand that.

JOEL: And you're going ahead anyway.

She turns back to the screen.

DANA: Nine minutes to the window. Let me finish the form.

He watches her type for a moment. Then he turns to look out at the ocean—vast, cold, layered with depth they can't see. Whatever is down there has been down there for a long time. Longer than the research station. Longer than the highway on the cliff.

JOEL: (to the window, quietly) God help us.

Dana types. The clock ticks.

CUT TO:

INT. HARROW POINT - MAIN LAB - LATER

Dana stares at her screen. Joel leans against the wall with a cup of coffee.

DANA: It went through.

JOEL: (exhales) Good.

DANA: Phase two deployment. We have the approvals.

JOEL: When do you want to run the array?

She looks at the data on the screen. At the timestamp. At the pattern that repeats every forty-three seconds, that has been repeating—as far as she can tell—for at least six months, which is as far back as her recordings go.

DANA: It's been transmitting for longer than six months. That's the part I can't prove yet. But the pattern is too stable. Established signals have that quality. They're not exploratory, they're broadcasting.

JOEL: Broadcasting to what?

She looks up from the screen.

DANA: That's the second thing we need to figure out.

FADE OUT.`

const TV_CONTENT = `COLD OPEN

EXT. CHICAGO - NIGHT - AERIAL

The city from above, winter. The lake a flat dark mirror to the south. We descend toward a specific block on the South Side—a building, a window where the light is still on at 2 AM.

INT. DETECTIVE'S APARTMENT - CONTINUOUS

LUCIA VANCE (38, the posture of someone who used to be military and still is, internally) sits at a kitchen table covered in photographs. She's been here for hours. The coffee mug has a ring suggesting it was refilled and then forgotten. Beside her: a laptop, three legal pads, a piece of evidence—a small brass key in a clear evidence bag—that she is not looking at but is intensely aware of.

Her phone buzzes. She reads the screen. Goes very still.

Then she picks up her jacket and her keys and leaves everything exactly as it is—photos, legal pads, coffee mug—as if she'll be back in twenty minutes. She has learned not to think about whether she will be.

EXT. RIVERSIDE INDUSTRIAL DISTRICT - NIGHT

Two patrol units, lights off, at the edge of a parking lot. Lucia's car pulls up. Detective MARCUS SHAW (48, the beard of a man who stopped fighting with his face sometime in his forties, her partner for six years) is waiting.

MARCUS: You were supposed to be off tonight.

LUCIA: I was off. This pulled me back.

MARCUS: We could have handled the initial—

LUCIA: It's related to the Vong case.

He stops. Looks at her.

MARCUS: Dispatch didn't say—

LUCIA: Dispatch didn't know. I didn't know until twenty minutes ago. (beat) The witness. Mara Chen.

MARCUS: (slowly) She worked here. Three nights a week. Nobody told us—

LUCIA: Because nobody knew she was working two jobs. (pause) She's gone, Marcus. They found her locker cleaned out and her car missing. Three days ago.

A long beat.

MARCUS: Before she was supposed to testify.

LUCIA: Seven days before.

They look at the building. A warehouse conversion that never got past the planning stage. The windows are dark.

MARCUS: Who else knows?

LUCIA: Sergeant Park. The two units. Now you.

MARCUS: And the Vong case lead—

LUCIA: I called Hollander on my way here. He's not happy.

MARCUS: Detective Hollander is never happy. That's his baseline.

LUCIA: He's particularly unhappy. He thinks Chen's in the wind voluntarily.

Marcus glances at her.

MARCUS: But you don't.

LUCIA: Her locker was cleaned out. Her car is missing. (pause) Her cat was still in the apartment. She loved that cat. It was the thing she talked about when she wasn't talking about the case. (pause) You don't leave your cat.

A long moment.

MARCUS: What are we looking for in there?

LUCIA: I don't know yet. That's why I want to go in before Hollander gets here and decides what we're looking for in advance.

She moves toward the service entrance. He falls into step.

MARCUS: Lucia.

LUCIA: I know.

MARCUS: If this is related to the Vong case in the way you're thinking, the people who made Chen disappear—

LUCIA: I know.

MARCUS: —are people who have made other people disappear. Cleanly. People who are very good at it.

LUCIA: I know, Marcus.

MARCUS: (quietly) I just want to make sure you know.

She looks at him.

LUCIA: You've been my partner for six years. How many times in six years have I not known what we were walking into?

MARCUS: (considers) Twice. But those were memorable.

She almost smiles.

LUCIA: This isn't one of those times. I know exactly what we're walking into. That's why I need to go in now.

They go in.

INT. WAREHOUSE - NIGHT

Their flashlights move through a large empty space. Their footsteps are very loud. Neither of them talks.

Near the back, behind what was going to be a partition wall, Lucia's flashlight finds something. She stops.

On the floor: a chalk circle, careful and precise, about four feet across. Inside it, four objects placed at what would be compass points. A watch. A photograph. A child's shoe. And the brass key.

Not the brass key in the evidence bag on her kitchen table. Another brass key. Identical.

MARCUS: (very quietly) That key.

LUCIA: I see it.

MARCUS: That's not—that can't be a coincidence.

LUCIA: No.

MARCUS: There's only supposed to be one key. The one in evidence.

LUCIA: (crouching, not touching anything) Which means either our evidence has been duplicated—which means we have a serious internal problem—or there were always two keys and we only found one. (pause) And whoever left this one here wants us to know that.

She looks at the photograph in the circle. It's face-down. She doesn't touch it.

LUCIA (CONT'D): Call forensics. Don't tell them what it is. Just tell them we need a full sweep and nobody touches anything.

She stands. Looks at the circle.

LUCIA (CONT'D): And Marcus? Don't tell Hollander about the key. Not yet.

MARCUS: Lucia—

LUCIA: Give me twenty-four hours.

He looks at her face—the face she has when she's working something through, when the pieces are moving and she can almost see the shape they're moving into.

MARCUS: Twenty-four hours. Then we report it.

She nods. Looks at the face-down photograph. Looks at the key.

END COLD OPEN.`

const DND_CONTENT = `SESSION 1: THE BROKEN ROAD

The adventurers begin in the frontier town of Duskwall, a crumbling outpost on the edge of the Greymarsh. The town is famous for three things: its proximity to the ruins of old Drakenheim, its surprisingly good ale, and the fact that most people who pass through end up staying.

OPENING SCENE: THE WHEEL AND WOLF TAVERN

Read aloud: The Wheel and Wolf smells of sawdust, spilled ale, and the peculiar tang of too many people crammed into too small a space on a cold night. The fire is good. The benches are scarred from decades of use. The barkeep—a woman built like a draft horse, grey hair, a scar that runs from her left ear to the corner of her mouth—watches you come in the way a person watches weather moving in: not alarmed, but noting it carefully.

A WANTED POSTER on the wall behind the bar catches the eye. The sketch is rough, but the subject is recognizable: a figure in a dark travelling cloak, face half-obscured. The reward is 500 gold.

At a corner table, a HALFLING named Pip Thornwhistle is nursing a drink and talking to no one in particular about a job. He's been nursing that drink for three hours. Anyone who approaches gets the same speech, clearly rehearsed: "Looking for capable people. The pay is fair. The work is unusual. The danger is moderate, by my employer's assessment, which means you should probably double it."

HOOK: THE MISSING CARTOGRAPHER

A royal cartographer named Sable Weiss set out seven days ago to survey the Greywood. She hasn't returned. Her assistant—a nervous young man named Finn who hasn't slept in two days—is offering everything he has for someone to find her. "Everything he has" is forty-three gold pieces, a mule named Harold, and the promise of recommendation to the Royal Cartographic Society.

GM NOTES: Sable is alive. She found something in the Greywood and is being held—not by hostile forces, but by her own fascination. The thing she found is a door in the roots of an ancient oak that leads to a small pocket dimension containing a library. The library contains books about every major event in the region's history, written as though they have already happened—including some events that are ten years in the future.

The twist: the books are not prophecy. They are a different timeline's history. Something has gone wrong and the timelines are bleeding together. The party investigating this is, in the library version of events, the party that fixes it. Sable can show them their own book, though it's partially written—the next several chapters are in a different handwriting than the earlier ones, and the ink is fresh.

ENCOUNTER ZONES:

THE GREYMARSH (travel, wilderness)
- DC 12 Perception: notice the footprints stop abruptly 200 feet before the treeline.
- DC 14 Survival: the marsh is wrong. The reeds bend in a direction inconsistent with the wind. The frogs are silent. The silence pattern suggests something large is sleeping nearby.
- DC 16 Arcana: the ley line that runs through this area is braided—two ley lines, not one, occupying the same channel. This is impossible and implies significant planar stress.

THE GREYWOOD EDGE
- The trees are old-growth oak. Some of them are over 400 years old. The roots break through the ground in enormous tangles.
- Three of the trees have crude carvings on their trunks—maps of somewhere else.
- Magic is louder here. Spells that usually leave no visible trace leave faint glowing runes that linger a few seconds after casting.

THE OAK DOOR (DC 15 Perception to notice, DC 10 Investigation to open)
- Flush with the roots, painted with a scene that depicts a library interior with impossible detail.
- To open: touch all four corners in order (Investigation DC 12 to figure out the sequence, or trial-and-error with DC 15 Dex saves to avoid a mild shock).

THE POCKET LIBRARY
- No hostile creatures. Light comes from globes of something that is not quite fire suspended in the air.
- Ten thousand books, organized in a system that looks like the Dewey Decimal System but slightly wrong—categories off by one level of specificity.
- SABLE WEISS: Sitting at a reading table, surrounded by open books, a blanket she conjured from somewhere, and evidence of several meals. She's disheveled and brilliant and will try to explain everything at once. Let her. The players will enjoy it.
- HER BOOK: The party's own volume is on a lectern near the door. It's bound in a color specific to each character. The current chapter ends mid-sentence.

BOSS ENCOUNTER: THE ARCHIVIST (optional, runs from combat, prefers to negotiate)

The library has a guardian—not hostile, but territorial. A middle-aged woman in reading glasses, genuinely annoyed to have visitors. She is an echo: a memory of a real person who died here protecting the library, now embedded in the space. She can be befriended, bargained with, or (if the party is very rude) fought (CR 6; she controls the shelves and a thousand books are good projectiles).

She will ask each character: "What is the most important thing you have ever lost?" The answer goes into a small notebook. If asked what for: "In case you need to remember it. People forget important things when things get difficult."

REWARDS
- 500 gp from Finn (he found some savings he'd forgotten about) plus the promised recommendation
- One item from the pocket library: a book titled with the name of one party member. It reads like a memoir of things that haven't happened yet, written in first person. It's accurate so far.
- 300 XP base, 450 with full exploration

SESSION 2 HOOKS
- The wanted poster: who is it, why does the reward amount change, who is hunting them?
- The maps carved in the oak trees: they map somewhere underground
- Sable Weiss wants to stay in the library. What happens if she does?
- If the party returned without sealing the bleed: small things are changing. The wanted poster shows a different face. The barkeep has a different name. Finn doesn't remember them.`

const TTRPG_CONTENT = `SESSION ZERO: WORLD PRIMER

SYSTEM: Blades in the Dark (modified for the Ashen City setting)

TONE: Grimy, political, morally compromised. Player characters are not heroes—they are skilled operators in a city that is slowly being eaten by something ancient and bureaucratic. The horror is institutional: complicity, the slow revelation that the thing you work for is the thing you should be fighting.

THE ASHEN CITY

Vreth is a port city built on the ruins of seven previous cities, each destroyed by a different catastrophe, each rebuilt by survivors who told themselves this time would be different. It has been a hundred and forty years since the last major catastrophe. The city has grown large and prosperous and deeply corrupt. The Ash Guard has been infiltrated by the Consortium, a commercial entity so large it no longer functions as a business and has begun to function as a government.

FACTIONS

THE CONSORTIUM: The dominant commercial and political power. Run by a Board of Twelve, none of whom meet in person. Their local arm controls the docks, the food supply, and three of the seven bridges. They are not villains in any satisfying sense. They are bureaucracies that have optimized for their own continuation.

THE ASH GUARD: Fifty percent loyal to the city charter. Thirty percent loyal to the Consortium. Twenty percent loyal to various personal interests. Identifying which is which is most of the work.

THE UNDER-TEMPLE: The oldest institution in Vreth, older than the city's current name. It maintains the tunnels, manages the Underneath, and keeps something down there from coming up. It is widely seen as superstitious and irrelevant. It is neither.

THE MENDERS' CIRCLE: A loose association of physicians, alchemists, and individuals who have decided that healing people is more important than the politics of healing. They operate in grey markets. Excellent clients for a crew that asks limited questions.

THE GHOSTS: Not a faction. Vreth's previous catastrophes left marks that are not fully material. There are echoes of the old cities in certain streets after midnight—buildings that aren't there, crowds that can't be avoided. The Ash Guard pretends this isn't happening. The Under-Temple manages it.

SESSION 1: THE SILENCE JOB

The crew is approached by a contact with a simple job: a music box was stolen from a private collector and has passed through three sets of hands before landing in a locked room in an Ash Guard evidence facility. The client wants it back. The pay is good.

COMPLICATION LAYER 1: The room the music box is in is quarantined. Three Ash Guard officers have been confined to the medical bay after handling it. Their symptoms are being officially described as "contact irritation." This is not accurate.

COMPLICATION LAYER 2: The original theft was not a theft. The collector gave it to the person who was about to be arrested because the collector is terrified of what happens if the Guard opens it. The arrested person panicked and traded it to a fence. The Guard found it during a sweep.

WHAT THE MUSIC BOX ACTUALLY IS: It plays a song from the third city—Vreth-Before-Vreth, two catastrophes ago. The song, played in a specific room in the Under-Temple's lower level, is a key. The collector knew this because the collector is a century-old person who has been managing their own death very carefully.

GM NOTE: The crew doesn't need to know any of this in Session 1. The job is straightforward. The complications make it not straightforward. Let them complete the job and get paid. The music box's true nature is a thread to pull in future sessions.

SCORE OVERVIEW
- Target: Ash Guard Evidence Facility, Building 4 (medium security, reduced due to the quarantine situation)
- Approach options: stealth through maintenance tunnels (Prowl/Finesse), bribery (Consort/Sway), information manipulation (Consort/Command)
- Engagement roll at +1d if crew researched the quarantine; -1d if they go in with less than two plans

CLOCK: The Guard Medical Officer files a full report in 6 segments. Currently at 3. Each failed roll advances this clock. At 6, a specialist is called in who will identify the music box correctly.`

const COMIC_CONTENT = `VOLUME 1: THE FREQUENCY — ISSUE #1: "STATIC"

PAGE 1 (Splash)

PANEL 1 (Full page):
Wide aerial view of a city that exists in two visual registers simultaneously. On the left half: hyper-realistic contemporary cityscape—glass towers, traffic, people with phones. On the right half (blended): the same geography rendered in thin glowing lines, like a circuit diagram, showing energy flows invisible to the naked eye. In the foreground, MIRA CHEN (24, practical clothes, hearing aid visible) stands at the junction of both visual registers.

CAPTION: Eleven months ago, a signal hit the satellite network that shouldn't have existed.

CAPTION: They said it was solar flare artifacts.

CAPTION: My hearing aid started picking up something it wasn't built to pick up on the same day.

PAGE 2

PANEL 1 (wide): Mira walking through a crowded street, looking at a notebook. The notebook has extremely dense handwriting and diagrams.

CAPTION: I should tell you upfront: I am a sound engineer. I am not a special person who was secretly destined for this. I record podcasts. I do ADR work for an indie film studio.

PANEL 2 (medium): Close on the hearing aid. Standard behind-ear model, but with a small circuit modification—a tiny extra component clumsily attached with evident care.

CAPTION: But I understand frequencies. And the thing in my hearing aid is transmitting on a frequency that has no business existing in this bandwidth.

PANEL 3 (medium): Mira stops walking. She's looking at a café with a broken neon sign. In the circuit-diagram register, it's blazing.

CAPTION: And whatever is transmitting it—

PANEL 4 (close, Mira's face, intent): —it's been getting louder for eleven months.

PAGE 3

PANEL 1 (full width): The café exterior. SECOND AVENUE AUDIO REPAIR. A handwritten note taped inside: OPEN - PROBABLY.

PANEL 2 (medium): Interior. Small shop, every surface covered in equipment in various states of repair. ARTHUR MOSS (68, very precise, very patient) is soldering something. He doesn't look up.

ARTHUR: The bell broke two weeks ago.

MIRA: I noticed.

ARTHUR: You're late.

MIRA: You're expecting me?

He looks up now.

ARTHUR: Someone with your modification to a standard BTE unit who's been picking up Schumann-adjacent signals for almost a year? Yes. I've been expecting someone. I'm glad it's you specifically.

MIRA: Why?

ARTHUR: Because you came in through the door instead of convinced you were going mad. That's rarer than you'd think.

PAGE 4

PANEL 1 (medium): Mira at the counter, holding her hearing aid toward him.

MIRA: Did you put this modification in?

ARTHUR: (looking at it) No. This modification put itself in.

MIRA: That's not how electronics work.

ARTHUR: That's not how electronics worked. The signal changed some things. For certain people, in certain ways, in certain devices already calibrated for—(stops). Let me ask you something first. What does it sound like?

PANEL 2 (close on Mira's face, remembering): Her expression shifts.

MIRA: Like standing next to a river you can't see. The sound of water but—not water. Something that moves in that way. With that kind of—

She stops.

MIRA: It's the best sound I've ever heard. That's the part that scared me.

PANEL 3 (wide, Arthur's face, something confirmed):

ARTHUR: Yes. That's how I know you're the right person. It scares everyone eventually. But it's beautiful first. The people it repels immediately are the wrong people. The ones it pulls in until they're dangerous are also wrong, differently.

PANEL 4: (medium, Arthur pulling on his coat)

ARTHUR: You're not the only one hearing it. There are nine others in this city. You're the only one who's gotten past scared to here. I'd like you to meet them. (heads for the door) The ones who haven't disappeared, anyway.

Beat.

MIRA: How many have disappeared?

ARTHUR: (at the door, not turning): Three. But they may have just moved. Are you coming?

Mira looks at her hearing aid in her hand. Looks at the door. Puts the aid back in.

MIRA: Let me text someone that I might be late.

PAGE 5 (full splash, end of issue):

Exterior. Night. Mira and Arthur on the street. Behind them, the city in its double register—real and circuit-diagram simultaneously—lights blazing in the frequency layer like a city seen from altitude at night.

CAPTION: Later I would figure out that Arthur had been ready for this moment for thirty years. He'd built the shop to be findable by people like me.

CAPTION: I would feel a complicated series of things about being the answer to someone else's very long question.

CAPTION: But that's later. Right now I'm just walking, and the signal is doing what it always does—singing in the channel behind my eardrum, telling me nothing and everything, pulling me toward something I don't have words for yet.

END OF ISSUE #1.`

const VIDEOGAME_CONTENT = `NARRATIVE BIBLE: ECHOES OF THE UNDIVIDED

LOGLINE: In a post-Fracture world where reality has splintered into overlapping shards, a former architect of the Fracture must travel between shards to prevent the final collapse—confronting evidence that she may have caused the disaster she's been trying to reverse.

PROTAGONIST: SENA VOSS

Age: 34. Former senior researcher at the Continuity Institute—the body that was supposed to prevent Fractures. An augment on her left forearm lets her perceive shard boundaries where others see only air. She is not a hero in the traditional sense. She is an expert who made a catastrophic mistake and has spent three years trying to undo it.

COMPANION: ECHO

Technically a software entity that lives in Sena's augment. In practice, a fully realized character who experiences the world through Sena's senses but has opinions and reactions that often differ from hers. Echo was not designed to have opinions. Echo developed them over three years of watching Sena make decisions and living with the consequences. Their relationship is the emotional engine of the game.

THE WORLD

Before the Fracture: a unified reality, near-future speculative fiction. Augments common. Continuity Institute functioned like a combination of the WHO and structural engineers—monitoring the fabric of reality and patching weak points.

After the Fracture: reality has split into shards. Each shard is a version of a location frozen at a different moment—some hold the same city as it was forty years ago, some hold it as it might have been, some hold it at the moment of the Fracture itself, still happening in a terrible loop.

ACT ONE: ARRIVALS

The game opens in shard 7-Ash: the financial district of a city called Mons, twelve years earlier, plus a section of park that doesn't exist in that timeline, plus a fragment of something that appears to be underwater. The sky cycles through three different skies on a roughly twenty-minute interval, each from a different point in history.

KEY CHARACTER: PROVISIONAL SELF (7-ASH ECHO OF SENA)

In 7-Ash, there's an echo of Sena from a version of events in which she didn't survive the first year. This echo doesn't know she's an echo. She's been living in 7-Ash for three years, building a machine that she believes will stabilize the shard. The machine will tear it apart faster. She doesn't know this.

FIRST MAJOR NARRATIVE DECISION: do you tell her, and how?

Options:
A) Tell her directly. She believes you immediately. She shuts down the machine. She processes that she is not real in a way that is incredibly well-written and you will feel it. The machine stops, the shard stabilizes, and she asks to come with you. (You can't, but you can give her Echo's backup protocols. This pays off in Act 3.)
B) Tell her indirectly, give her enough information to figure it out herself, don't be there when she does. Shard stabilizes but she's angry with you. Pays off differently in Act 3.
C) Don't tell her. Let her finish the machine. The shard tears faster. You get to the thing you came for but it's damaged.

No option is wrong. All three have tracked consequences.

PLAYER CHOICE PHILOSOPHY

This is not a morality system. Actions are not coded good or evil. The game tracks what Sena knows, what she's chosen to do with what she knows, and what those choices have cost or gained. At the end of Act 2, the player encounters a character who has been keeping score—not to judge Sena, but because keeping score is their function.

At that moment, the player gets a single question they can ask from a list of twelve. The question they ask changes what information they receive going into Act 3. No answer is the complete truth. All answers are true. This is the game's thesis: the problem isn't that information is withheld. The problem is that complete information doesn't exist.

ART DIRECTION

Shard visual language: Each shard has a primary colour temperature (7-Ash is cold blue-white) and a secondary contamination colour (fragments from other timelines bleeding in). Fracture boundaries visible in augment mode as hairline cracks with light bleeding through.

Echo's visual presence: No body, but represented through environmental effects—light behaving slightly differently near surfaces Sena pays attention to, audio artifacts when Echo processes something. Players who look for it will see Echo in the environment.

Sound design is a significant part of the storytelling. Each shard has a base audio environment and a second layer that represents the shard's "memory"—sounds from its frozen time period, fading in and out. In shards where something bad happened, the memory layer is louder.`

// ─── Data builders ────────────────────────────────────────────────────────────

function buildCharacters(novelId, type) {
  const byType = {
    default: [
      { name: 'Kael Morven', role: 'Protagonist', description: 'A senior warden from the capitol, pragmatic and methodical.', age: '42', occupation: 'Warden' },
      { name: 'Aldren Vasque', role: 'Supporting', description: 'Head of the informal council, a survivor and pragmatist.', age: '57', occupation: 'Council Leader' },
      { name: 'Torsa Keln', role: 'Supporting', description: 'Local guide who knows the Greywood better than anyone.', age: '38', occupation: 'Tracker' },
      { name: 'Petra Solace', role: 'Supporting', description: 'Survivor of the Greywood, adjusting to gaps in memory.', age: '26', occupation: 'Miller\'s Assistant' },
      { name: 'First Speaker Aldric', role: 'Supporting', description: 'Young leader with the uncertain authority of someone handed power by circumstance.', age: '31', occupation: 'First Speaker' },
      { name: 'The Archivist', role: 'Antagonist', description: 'The entity in the Greywood—territorial, ancient, and learning to communicate.', age: 'Unknown', occupation: 'Entity' },
      { name: 'Old Soven', role: 'Supporting', description: 'The stoneworker who knows more than he has said.', age: '81', occupation: 'Stonemason (retired)' },
      { name: 'Solen Mira', role: 'Supporting', description: 'The woman still in the Greywood—Mira\'s sister, carpenter, the translator.', age: '31', occupation: 'Carpenter' },
    ],
    novella: [
      { name: 'Dani', role: 'Protagonist', description: 'Practical, recently heartbroken, inheriting a house she did not expect.', age: '29', occupation: 'Content Producer' },
      { name: 'Gran (Eleanor)', role: 'Supporting', description: 'Dani\'s grandmother, who spent 17 years learning to listen to the house.', age: '78 at death', occupation: 'Retired Archivist' },
      { name: 'The Figure', role: 'Other', description: 'The entity that appears in all historical depictions of the property. Not hostile—preserved.', age: 'Unknown', occupation: 'Memory' },
      { name: 'Marcus', role: 'Other', description: 'The ex. Not present. His absence is structural.', age: '33', occupation: 'Software Engineer' },
    ],
    short_story: [
      { name: 'Elena Marsh', role: 'Protagonist', description: 'Sound engineer, practical, cat owner, Tuesday letter-receiver.', age: '28', occupation: 'Sound Engineer' },
      { name: 'The Woman in Grey-Blue', role: 'Supporting', description: 'Guide to the Interval. Thirty years waiting. The wrong first question makes her cautious; the right one makes her open.', age: 'Unknown', occupation: 'Interval Guardian' },
      { name: 'The Cat', role: 'Other', description: 'Needs feeding at five. A structural anchor to ordinary life.', age: '4', occupation: 'Cat' },
    ],
    play: [
      { name: 'Elliot Vance', role: 'Protagonist', description: 'A father who drove too fast on a wet road. In between.', age: '44', occupation: 'Architect' },
      { name: 'Marguerite', role: 'Antagonist', description: 'Dead for eleven years. Wife\'s grandmother. Patient and blunt.', age: '68 at death', occupation: 'Formerly: Teacher' },
      { name: 'Marina', role: 'Other', description: 'Elliot\'s wife. Not present but crucial.', age: '41', occupation: 'Nurse' },
      { name: 'David', role: 'Other', description: 'Elliot\'s brother. The unfinished business.', age: '47', occupation: 'Unknown' },
    ],
    screenplay: [
      { name: 'Dana Reyes', role: 'Protagonist', description: 'Marine sound researcher who drove through the night for a permit.', age: '32', occupation: 'Marine Sound Engineer' },
      { name: 'Joel Okafor', role: 'Supporting', description: 'Station director. Cautious, competent, worried.', age: '47', occupation: 'Research Station Director' },
      { name: 'Victor Stein', role: 'Supporting', description: 'Dana\'s contact at the funding body. Careful.', age: '58', occupation: 'Program Director' },
    ],
    tv_show: [
      { name: 'Lucia Vance', role: 'Protagonist', description: 'Chicago detective. Former military bearing. Methodical under pressure.', age: '38', occupation: 'Detective' },
      { name: 'Marcus Shaw', role: 'Supporting', description: 'Lucia\'s partner, six years. The voice of caution she mostly ignores.', age: '48', occupation: 'Detective' },
      { name: 'Mara Chen', role: 'Other', description: 'The missing witness. Loved her cat. Worked two jobs.', age: '31', occupation: 'Warehouse Worker / Waitress' },
      { name: 'Detective Hollander', role: 'Supporting', description: 'The Vong case lead. Never happy. Not wrong enough to be dismissible.', age: '55', occupation: 'Detective' },
    ],
    dnd_campaign: [
      { name: 'Pip Thornwhistle', role: 'Supporting', description: "Halfling fixer. Works for someone he won't name. Dry humour, accurate threat assessments.", age: '47', occupation: 'Fixer / Broker' },
      { name: 'Sable Weiss', role: 'Supporting', description: 'The missing cartographer. Inside the pocket library. Not coming out voluntarily.', age: '35', occupation: 'Royal Cartographer' },
      { name: 'Finn', role: 'Supporting', description: 'Sable\'s assistant. Hasn\'t slept. Overvalues the Royal Cartographic Society recommendation.', age: '22', occupation: 'Cartographer\'s Assistant' },
      { name: 'The Archivist', role: 'Other', description: 'Guardian of the pocket library. An echo of someone who died protecting books.', age: 'Unknown', occupation: 'Library Guardian' },
    ],
    tabletop_rpg: [
      { name: 'The Collector', role: 'Other', description: 'A century-old person managing their own death. Gave the music box away in panic.', age: '~120', occupation: 'Collector' },
      { name: 'Guard Medical Officer', role: 'Supporting', description: 'Writing a report that will change everything when it\'s complete.', age: '40', occupation: 'Ash Guard Medical Officer' },
      { name: 'The Fence', role: 'Supporting', description: 'Didn\'t know what they had. Probably regretting it.', age: '33', occupation: 'Black Market Broker' },
    ],
    comic: [
      { name: 'Mira Chen', role: 'Protagonist', description: 'Sound engineer, hearing aid user, receiver of signals she didn\'t ask for.', age: '24', occupation: 'Sound Engineer' },
      { name: 'Arthur Moss', role: 'Supporting', description: 'Audio repair shop owner. Thirty years waiting for the right person to walk through the door.', age: '68', occupation: 'Audio Engineer' },
      { name: 'The Missing Three', role: 'Other', description: 'Or they might have moved. Arthur prefers not to assume.', age: 'Various', occupation: 'Unknown' },
    ],
    video_game: [
      { name: 'Sena Voss', role: 'Protagonist', description: 'Former Continuity Institute researcher. Made a catastrophic mistake. Spending three years trying to fix it.', age: '34', occupation: 'Former Researcher / Field Operator' },
      { name: 'Echo', role: 'Supporting', description: 'Software entity in Sena\'s augment. Developed opinions over three years of observation. Emotionally present.', age: 'N/A', occupation: 'Companion AI' },
      { name: 'Provisional Self', role: 'Other', description: 'Echo of Sena from a version of events where she didn\'t survive. Doesn\'t know she\'s an echo.', age: '34 (echo)', occupation: 'Shard Resident / Engineer' },
    ],
  }
  const chars = byType[type] || byType.default
  return chars.map((c, i) => ({
    id: uid(), novelId,
    name: c.name, role: c.role, description: c.description,
    age: c.age || '', occupation: c.occupation || '',
    physicalDescription: '', backstory: '', notes: '',
    order: i, createdAt: Date.now() - (chars.length - i) * 100,
  }))
}

function buildLocations(novelId) {
  return [
    { id: uid(), novelId, name: 'Primary Setting', description: 'The main location where the story unfolds. Rich with history and atmosphere, it shapes every scene and interaction.', notes: 'Integral to the plot.', order: 0, createdAt: Date.now() },
    { id: uid(), novelId, name: 'Secondary Setting', description: 'A contrasting space—where characters go when they need relief from or perspective on the primary setting.', notes: '', order: 1, createdAt: Date.now() },
    { id: uid(), novelId, name: 'Historical Site', description: 'A place referenced or visited that carries the weight of events that shaped the present situation.', notes: 'Backstory anchor.', order: 2, createdAt: Date.now() },
  ]
}

function buildFactions(novelId) {
  return [
    { id: uid(), novelId, name: 'Primary Faction', description: 'The dominant power structure in the story world. Not straightforwardly villainous—they have their own logic.', goals: 'Maintain stability and their own position within it.', methods: 'Institutional power, information control.', notes: '', order: 0, createdAt: Date.now() },
    { id: uid(), novelId, name: 'Opposition', description: 'Those working against the primary faction, or simply working independently of it.', goals: 'Change the conditions that make the primary faction possible.', methods: 'Various, depending on resources.', notes: '', order: 1, createdAt: Date.now() },
  ]
}

function buildLore(novelId) {
  return [
    { id: uid(), novelId, title: 'World Rules', content: 'The fundamental principles that govern how this world differs from our own. These rules are never stated aloud in the narrative—they emerge from how characters move through situations.', order: 0, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Historical Context', content: 'What happened before this story began. The events that shaped the world and the people in it. Most characters know this imperfectly—the version of history that reaches ordinary people has been filtered, simplified, and occasionally falsified.', order: 1, createdAt: Date.now() },
  ]
}

function buildTimeline(novelId) {
  return [
    { id: uid(), novelId, title: 'The Precipitating Event', description: 'The thing that happened before the story begins that made this story necessary. Characters are downstream of this event whether they know it or not.', date: '2024-01-01', type: 'historical', order: 0, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Story Opens', description: 'The moment the narrative begins. Something has changed or is about to change.', date: '2024-06-01', type: 'story', order: 1, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Central Crisis', description: 'The point of maximum pressure. Everything the story has been building toward.', date: '2024-08-15', type: 'story', order: 2, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Resolution', description: 'Things settle into a new configuration. Not necessarily better—different, and more honest.', date: '2024-09-01', type: 'story', order: 3, createdAt: Date.now() },
  ]
}

function buildWorldHistory(novelId) {
  return [
    { id: uid(), novelId, title: 'The Founding', content: 'How this world or community came to be. The founding myths that people carry—accurate or not—and what they reveal about what the community values.', era: 'Distant Past', order: 0, createdAt: Date.now() },
  ]
}

function buildIdeas(novelId) {
  return [
    { id: uid(), novelId, title: 'Alternative ending', content: 'What if the antagonist wins? Not as defeat, but as the story actually being about what comes after winning—and whether it looks how anyone expected.', status: 'interesting', order: 0, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Theme note', content: 'The central tension is between knowing and acting—specifically, between the desire for complete information before acting and the reality that complete information never comes. Characters who wait for certainty before acting and characters who act without enough certainty both pay costs.', status: 'use-this', order: 1, createdAt: Date.now() },
    { id: uid(), novelId, title: 'Research needed', content: 'Specific technical or historical details that need verification before the draft is locked. Note what you need to look up here rather than stopping mid-draft.', status: 'maybe', order: 2, createdAt: Date.now() },
  ]
}

function buildSchedule(novelId) {
  return [
    { id: uid(), novelId, title: 'Daily Writing Session', type: 'recurring', days: ['monday','tuesday','wednesday','thursday','friday'], startTime: '09:00', duration: 60, goal: 1000, notes: 'Morning block, before email.', createdAt: Date.now() },
    { id: uid(), novelId, title: 'Weekend Revision', type: 'recurring', days: ['saturday'], startTime: '10:00', duration: 120, goal: 0, notes: 'Read-through and structural notes.', createdAt: Date.now() },
  ]
}

function buildEras(novelId) {
  return [
    { id: uid(), novelId, name: 'Founding Age', startYear: -420, endYear: -1, order: 0, createdAt: Date.now() },
    { id: uid(), novelId, name: 'Present Crisis', startYear: 0, endYear: 12, order: 1, createdAt: Date.now() },
  ]
}

function buildRpgCharacters(novelId) {
  return [
    {
      id: uid(),
      novelId,
      name: 'Mira Thornhand',
      playerName: 'QA Tester',
      ancestry: 'Human',
      className: 'Ranger',
      level: 5,
      background: 'Boundary scout',
      alignment: 'Neutral Good',
      abilityScores: { str: 12, dex: 17, con: 14, int: 11, wis: 15, cha: 10 },
      notes: 'Seeded party member for Character Builder QA.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uid(),
      novelId,
      name: 'Orren Vale',
      playerName: 'QA Tester',
      ancestry: 'Dwarf',
      className: 'Cleric',
      level: 5,
      background: 'Archive keeper',
      alignment: 'Lawful Good',
      abilityScores: { str: 14, dex: 10, con: 16, int: 12, wis: 17, cha: 13 },
      notes: 'Seeded healer/support character for sheet and dice roller QA.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
}

function buildComicData(novelId, chapters, characters = [], locations = []) {
  const pages = []
  const panels = []
  const firstIssue = chapters[0]
  if (!firstIssue) return { comicPages: pages, comicPanels: panels }

  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const pageId = uid()
    pages.push({
      id: pageId,
      novelId,
      issueId: firstIssue.id,
      order: pageIndex,
      title: `Page ${pageIndex + 1}`,
      summary: [
        'The city wakes under a sky full of impossible lights.',
        'The protagonist crosses the market while rumors ripple around them.',
        'A silent figure appears on the bridge and points toward the old gate.',
        'Page turn reveal: the gate is already open.',
      ][pageIndex],
      pageType: pageIndex === 0 ? 'splash' : 'standard',
      status: pageIndex < 2 ? 'draft' : 'outline',
      pageTurn: pageIndex === 3 ? 'reveal' : 'none',
      characterIds: characters.slice(0, 2).map(c => c.id),
      locationIds: locations.slice(0, 1).map(l => l.id),
      timeOfDay: 'Dawn',
      visualDirection: 'Muted blues with one warm lantern path through the crowd.',
      productionNotes: 'Seed page for comic QA: page metadata, panel list, dialogue, captions, and SFX.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
      panels.push({
        id: uid(),
        novelId,
        pageId,
        order: panelIndex,
        layoutHint: panelIndex === 0 ? 'wide' : 'standard',
        shotType: ['wide', 'medium', 'close'][panelIndex],
        description: `Panel ${panelIndex + 1}: seeded comic action beat for QA.`,
        artNotes: 'Check panel editing, ordering, status, and export inclusion.',
        dialogue: panelIndex === 1 ? [{ id: uid(), speaker: characters[0]?.name || 'Lead', text: 'Something is wrong with the old road.' }] : [],
        captions: panelIndex === 0 ? [{ id: uid(), type: 'narration', text: 'Ashenveil, before the bells.' }] : [],
        sfx: panelIndex === 2 ? [{ id: uid(), text: 'KRAK' }] : [],
        characterIds: characters.slice(0, 2).map(c => c.id),
        locationIds: locations.slice(0, 1).map(l => l.id),
        continuityNotes: 'Seeded continuity note.',
        status: pageIndex < 2 ? 'draft' : 'outline',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  return { comicPages: pages, comicPanels: panels }
}

function buildStructure(novelId, type, contentFn) {
  const configs = {
    novel:        { l1: ['Act 1: Arrival', 'Act 2: The Wood', 'Act 3: Resolution'], l2: ['Chapter 1','Chapter 2','Chapter 3','Chapter 4'], scenes: ['Opening','Development','Turn'] },
    novella:      { l1: ['Part 1: Arrival','Part 2: The Memory','Part 3: What Remains'], l2: ['Chapter 1','Chapter 2'], scenes: ['Opening','Development','Closing'] },
    short_story:  { l1: ['Story Draft'], l2: ['Main Section'], scenes: ['Opening Image','Disruption','Turn','Reveal','Climax','Final Image'] },
    play:         { l1: ['Act I','Act II'], l2: ['Scene 1','Scene 2'], scenes: ['Opening Beat','Middle Beat','Curtain'], script: true },
    screenplay:   { l1: ['Act I','Act II','Act III'], l2: ['Opening Sequence','Development','Finale'], scenes: ['Scene 1','Scene 2','Scene 3'], script: true },
    tv_show:      { l1: ['Season 1'], l2: ['Pilot','Episode 2','Episode 3'], scenes: ['Cold Open','Act 1','Act 2','Tag'], script: true },
    dnd_campaign: { l1: ['Opening Arc','Rising Arc','Climax Arc'], l2: ['Session 1','Session 2','Session 3'], scenes: ['Opening Encounter','Development','Boss Fight'] },
    tabletop_rpg: { l1: ['Opening Arc','Complications','Resolution'], l2: ['Session 1','Session 2','Session 3'], scenes: ['Hook','Score','Fallout'] },
    comic:        { l1: ['Volume 1'], l2: ['Issue 1','Issue 2','Issue 3'], scenes: ['Page 1','Page 2','Page 3','Page 4','Page 5'] },
    video_game:   { l1: ['Act 1','Act 2','Act 3'], l2: ['Opening Mission','Rising Stakes','Final Confrontation'], scenes: ['Tutorial Hook','First Mission','Complication'] },
  }
  const cfg = configs[type] || configs.novel
  const acts = [], chapters = [], scenes = []

  cfg.l1.forEach((actTitle, ai) => {
    const actId = uid()
    acts.push({ id: actId, novelId, title: actTitle, synopsis: `${actTitle} — structural section.`, order: ai })
    cfg.l2.forEach((chapTitle, ci) => {
      // For multi-act configs, only create chapters under act 0 to keep manageable
      if (ai > 0 && type !== 'novel') return
      const chapId = uid()
      chapters.push({ id: chapId, novelId, actId, title: chapTitle, synopsis: '', order: chapters.length })
      cfg.scenes.forEach((scTitle, si) => {
        const content = contentFn(si + ci * cfg.scenes.length + ai * cfg.l2.length * cfg.scenes.length, ci, ai)
        scenes.push({
          id: uid(), novelId, chapterId: chapId,
          title: scTitle, synopsis: '', content,
          order: scenes.length,
          lastModified: Date.now(),
          wordHistory: [{ date: '2026-06-07', words: content.split(/\s+/).filter(Boolean).length, timestamp: Date.now() }],
          ...(cfg.script ? { textMode: 'script', scriptElement: 'scene_heading', scriptBlocks: [] } : {}),
        })
      })
    })
  })
  return { acts, chapters, scenes }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const seedEmail = process.env.YOW_SEED_EMAIL
  const seedPassword = process.env.YOW_SEED_PASSWORD
  const required = {
    'SUPABASE_URL or VITE_SUPABASE_URL': supabaseUrl,
    'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY': supabaseAnonKey,
    YOW_SEED_EMAIL: seedEmail,
    YOW_SEED_PASSWORD: seedPassword,
  }
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) throw new Error(`Missing required environment: ${missing.join(', ')}`)
  if (process.env.YOW_SEED_CONFIRM !== WIPE_CONFIRMATION) {
    throw new Error(`Refusing destructive seed. Set YOW_SEED_CONFIRM=${WIPE_CONFIRMATION}.`)
  }
  if (process.env.YOW_SEED_CONFIRM_EMAIL !== seedEmail) {
    throw new Error('Refusing destructive seed. YOW_SEED_CONFIRM_EMAIL must exactly match YOW_SEED_EMAIL.')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  console.log('Authenticating...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: seedEmail,
    password: seedPassword,
  })
  if (authError) { console.error('Auth failed:', authError.message); process.exit(1) }
  const userId = authData.user.id
  console.log('Authenticated:', userId)

  // Wipe existing data completely, including legacy tables retained for safety.
  console.log('Wiping existing data...')
  await Promise.all([
    ...APP_DATA_TABLES.map(table => throwIfError(supabase.from(table).delete().eq('user_id', userId), `${table} delete`)),
    throwIfError(supabase.from('user_settings').delete().eq('user_id', userId), 'user_settings delete'),
    supabase.from('user_data').delete().eq('user_id', userId),
    supabase.from('project_data').delete().eq('user_id', userId),
  ])
  console.log('Wiped.')

  // Build series
  const seriesId = uid()
  const series = [{
    id: seriesId,
    name: 'Testing Series',
    description: 'Seeded QA series containing one active launch project of each type.',
    genre: 'QA',
    status: 'drafting',
    createdAt: new Date().toISOString(),
  }]

  // Content map
  const contentFns = {
    novel: (si, ci, ai) => buildNovelContent(si, ci, ai),
    novella: () => NOVELLA_CONTENT,
    short_story: () => SHORT_STORY_CONTENT,
    dnd_campaign: () => DND_CONTENT,
    tabletop_rpg: () => TTRPG_CONTENT,
    comic: () => COMIC_CONTENT,
  }

  const wordTargets = {
    novel: 90000,
    novella: 30000,
    short_story: 5000,
    dnd_campaign: 30000,
    tabletop_rpg: 30000,
    comic: 15000,
  }

  const PROJECT_TYPES = ['novel','novella','short_story','dnd_campaign','tabletop_rpg','comic']
  const typeLabels = {
    novel:'Novel', novella:'Novella', short_story:'Short Story',
    dnd_campaign:'D&D Campaign', tabletop_rpg:'TTRPG Campaign',
    comic:'Comic / Graphic Novel',
  }

  const data = {
    _savedAt: Date.now(),
    novels: [],
    series,
    characters: [],
    factions: [],
    locations: [],
    timeline: [],
    worldHistory: [],
    acts: [],
    chapters: [],
    scenes: [],
    loreEntries: [],
    ideaEntries: [],
    maps: [],
    whiteboards: [],
    storySchedule: [],
    rpgCharacters: [],
    comicPages: [],
    comicPanels: [],
    eras: [],
    activeMapByNovel: {},
    currentYear: 0,
    activeNovelId: null,
  }

  for (const type of PROJECT_TYPES) {
    const novelId = uid()
    const novel = {
      id: novelId,
      title: `Test 1 - ${typeLabels[type]}`,
      type,
      seriesId,
      createdAt: new Date().toISOString(),
      synopsis: `A fully populated ${typeLabels[type]} project for testing all features of the YOW platform. Contains complete characters, locations, timeline, lore, world history, and manuscript content.`,
      wordTarget: wordTargets[type],
      enabledSections: ['dashboard','manuscript','outline','characters','locations','lore','ideas','schedule','timeline','worldhistory','map','factions','familytree','studio','reader'],
      genre: ['dnd_campaign','tabletop_rpg'].includes(type) ? 'Fantasy' : 'Literary Fiction',
    }
    data.novels.push(novel)
    console.log(`Building ${novel.title}...`)

    const { acts, chapters, scenes } = buildStructure(novelId, type, contentFns[type])
    const characters = buildCharacters(novelId, type)
    const locations = buildLocations(novelId)

    const totalWords = scenes.reduce((s, sc) => s + (sc.content?.split(/\s+/).filter(Boolean).length || 0), 0)
    console.log(`  ${acts.length} acts, ${chapters.length} chapters, ${scenes.length} scenes, ${totalWords.toLocaleString()} words`)

    data.acts.push(...acts)
    data.chapters.push(...chapters)
    data.scenes.push(...scenes)
    data.characters.push(...characters)
    data.locations.push(...locations)
    data.factions.push(...buildFactions(novelId))
    data.loreEntries.push(...buildLore(novelId))
    data.ideaEntries.push(...buildIdeas(novelId))
    data.timeline.push(...buildTimeline(novelId))
    data.worldHistory.push(...buildWorldHistory(novelId))
    data.storySchedule.push(...buildSchedule(novelId))
    data.eras.push(...buildEras(novelId))

    if (['dnd_campaign', 'tabletop_rpg'].includes(type)) {
      data.rpgCharacters.push(...buildRpgCharacters(novelId))
      novel.enabledSections = [...new Set([...novel.enabledSections, 'characterbuilder'])]
    }

    if (type === 'comic') {
      const comicData = buildComicData(novelId, chapters, characters, locations)
      data.comicPages.push(...comicData.comicPages)
      data.comicPanels.push(...comicData.comicPanels)
      novel.enabledSections = [...new Set([...novel.enabledSections, 'comic'])]
    }
  }

  series[0].projectOrder = data.novels.map(novel => novel.id)
  data.activeNovelId = data.novels[0]?.id ?? null

  console.log(`\nWriting normalized data (${data.novels.length} projects, ${data.scenes.length} scenes)...`)
  await throwIfError(supabase.from('user_settings').upsert({
    user_id: userId,
    data: {
      activeNovelId: data.activeNovelId,
      currentYear: data.currentYear,
      activeMapByNovel: data.activeMapByNovel,
    },
    updated_at: new Date().toISOString(),
  }), 'user_settings upsert')

  for (const table of APP_DATA_TABLES) {
    const key = TABLE_TO_KEY[table]
    const rows = getTableRows(table, userId, data[key] ?? [])
    if (!rows.length) continue
    const { error } = await supabase.from(table).upsert(rows)
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    console.log(`  ${table}: ${rows.length}`)
  }

  // Verify
  const counts = {}
  for (const table of APP_DATA_TABLES) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
    if (error) throw new Error(`${table} verify: ${error.message}`)
    counts[table] = count ?? 0
  }
  const { data: settingsCheck, error: settingsError } = await supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle()
  if (settingsError) throw new Error(`user_settings verify: ${settingsError.message}`)

  console.log('\n─── VERIFICATION ───────────────────────────')
  console.log(`projects:            ${counts.novels}`)
  console.log(`series:              ${counts.series_items}`)
  console.log(`characters:          ${counts.characters}`)
  console.log(`locations:           ${counts.locations}`)
  console.log(`scenes:              ${counts.scenes}`)
  console.log(`rpg characters:      ${counts.rpg_characters}`)
  console.log(`comic pages/panels:  ${counts.comic_pages}/${counts.comic_panels}`)
  console.log(`active project:      ${settingsCheck?.data?.activeNovelId}`)
  const totalWords = data.scenes.reduce((s,sc) => s+(sc.content?.split(/\s+/).filter(Boolean).length||0), 0)
  console.log(`total words written: ${totalWords.toLocaleString()}`)
  console.log('────────────────────────────────────────────')
  console.log('\nDone. Reload the app and clear browser localStorage for this account if stale local data appears.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
