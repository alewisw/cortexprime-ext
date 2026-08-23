// Ready-made complications, transcribed from Appendix G of the rulebook. Hand-edit this file to
// add, rename, or reorganize presets - there is no in-app editor for this list by design.
//
// Severity fixes the die: Mild steps up to Moderate, which steps up to Severe.
export const SEVERITY_DICE = {
  mild: 6,
  moderate: 8,
  severe: 10
}

export const SEVERITIES = Object.keys(SEVERITY_DICE)

export const COMPLICATION_PRESETS = {
  Mental: {
    'Anger and Aggression': {
      mild: ['Annoyed', 'Bristling', 'Curt', 'Flushed', 'Glowering', 'Goaded', 'Hot Under the Collar', 'Indignant', 'Irritable', 'Needled', 'Nettled', 'On a Short Fuse', 'Peeved', 'Prickly', 'Riled', 'Short-Tempered', 'Snappish', 'Stung', 'Sullen', 'Tetchy'],
      moderate: ['Antagonised', 'Boiling Over', 'Easily Provoked', 'Fuming', 'Furious', 'Hackles Up', 'Heated', 'Incensed', 'Itching for a Fight', 'Lashing Out', 'Quick to Anger', 'Reckless With Temper', 'Seeing Red', 'Seething', 'Spoiling for Trouble', 'Squaring Up', 'Storming', 'Wrathful'],
      severe: ['Apoplectic', 'Berserk', 'Beyond Reason', 'Blind Rage', 'Consumed by Fury', 'Frenzied', 'Lost to Anger', 'Murderous', 'Out of Control', 'Past Restraint', 'Raging', 'Shaking With Rage', 'Tunnel-Visioned', 'Uncontrollable', 'Vengeful Beyond Sense', 'White-Hot Fury']
    },
    'Confusion and Doubt': {
      mild: ['Befuddled', 'Distracted', 'Foggy', 'Fumbling for Words', 'Hesitant', 'Misremembering', 'Muddled', 'Mulling It Over', 'Nagged by Doubt', 'Out of Step', 'Puzzled', 'Second-Guessing', 'Thrown Off', 'Turned Around', 'Uncertain', 'Unsure', 'Wavering', 'Wrong-Footed'],
      moderate: ['Adrift', 'Baffled', 'Bewildered', "Can't Think Straight", 'Disoriented', 'Doubting Everything', 'Floundering', 'Grasping for Sense', 'Lost the Thread', 'Mind Spinning', 'Misled', 'Out of His Depth', 'Rattled by Doubt', 'Reeling', 'Second-Guessing Everything', 'Stumped', 'Thoroughly Confused', 'Unmoored'],
      severe: ['Completely Lost', 'Dazed and Disbelieving', 'Grip on Reality Slipping', 'Hopelessly Confused', 'Mind in Tatters', 'Mind-Blanked', "No Idea What's Real", 'Overwhelmed and Lost', 'Paralysed by Doubt', "Reality Won't Hold", 'Senses Make No Sense', 'Shattered Certainty', 'Unable to Trust His Own Mind', 'Untethered', 'Utterly Bewildered', 'Wits Scattered']
    },
    'Conviction and Zeal': {
      mild: ["Certain He's Right", 'Dead Set', 'Dug In', 'Eager to Act', 'Fired Up', 'Fixed on the Goal', 'Headstrong', 'Impatient to Move', 'Keyed Up', 'Set in His Course', 'Single-Minded', 'Stubborn', 'Sure of Himself', 'Unwilling to Wait', "Won't Hear Otherwise", 'Zealous'],
      moderate: ['Blind to Other Options', 'Bullish', 'Burning With Purpose', 'Cannot Be Dissuaded', 'Charging Ahead', 'Deaf to Caution', 'Heedless of Risk', 'Hell-Bent', 'Overcommitted', 'Overconfident', 'Refuses to Back Down', 'Righteous', 'True-Believing', 'Tunnel Vision', "Won't Be Reasoned With", 'Zealously Driven'],
      severe: ['Beyond All Reason', 'Consumed by the Cause', 'Crusading Blindly', 'Fanatical', 'Heedless of All Cost', 'Martyr-Minded', 'Messianic', 'No Thought of Survival', 'Possessed by Purpose', 'Reckless Unto Death', 'Sees Only the Mission', 'Suicidally Committed', 'Will Burn It All Down', 'Will Sacrifice Anything', 'Zeal Past Sanity', "Zealot's Fury"]
    },
    'Demoralisation and Shame': {
      mild: ['Abashed', 'Awkward', 'Bashful', 'Chastened', 'Crestfallen', 'Deflated', 'Discouraged', 'Embarrassed', 'Flustered', 'Put Out', 'Red-Faced', 'Rueful', 'Self-Conscious', 'Sheepish', 'Stung by a Slight', 'Subdued', 'Taken Down a Peg', 'Uneasy in the Spotlight'],
      moderate: ['Browbeaten', 'Cowed', 'Demoralised', 'Disgraced', 'Dispirited', 'Downhearted', 'Faltering Resolve', 'Humbled', 'Humiliated', 'Lost His Nerve', 'Mortified', 'Shamed', 'Shrinking Back', 'Stripped of Confidence', 'Wants to Disappear', 'Wilting Under Judgment', 'Withering', 'Wounded Pride'],
      severe: ['Beaten Down', 'Beyond Caring', 'Broken', 'Crushed', 'Defeated', 'Disgraced Past Recovery', 'Gutted', 'Hollowed Out', 'Humiliated Past Bearing', 'No Fight Left', 'Past Reach', 'Robbed of All Worth', 'Shame-Stricken', 'Spirit Broken', 'Utterly Defeated', 'Will to Try Gone']
    },
    'Fear and Dread': {
      mild: ['Anxious', 'Apprehensive', 'Edgy', 'Flinching', 'Jittery', 'Jumpy', 'Nervous', 'On Edge', 'Rattled', 'Skittish', 'Spooked', 'Startled', 'Tense', 'Twitchy', 'Uneasy', 'Unnerved', 'Wary', 'Wide-Eyed'],
      moderate: ['Afraid', 'Alarmed', 'Badly Shaken', 'Cornered and Scared', 'Dreading the Worst', 'Fearful', 'Heart Pounding', 'Losing His Nerve', 'Nerves Fraying', 'Rooted by Fear', 'Scared Stiff', 'Shaking', 'Spooked Witless', 'Terror Rising', 'Trembling', 'Unsettled to the Core', 'White-Knuckled'],
      severe: ['Blind Panic', 'Bolting in Terror', 'Frozen in Fear', 'Gibbering', 'Horror-Struck', 'Mind White With Fear', 'Out of His Wits', 'Overcome by Dread', 'Panic-Stricken', 'Paralysed by Terror', 'Petrified', 'Pure Terror', 'Scared Past Thought', 'Terrified Beyond Reason', 'Trembling Uncontrollably', 'Undone by Fear']
    },
    'Focus and Distraction': {
      mild: ['Daydreaming', 'Distractible', 'Drifting Off', 'Eyes Wandering', 'Fidgety', 'Half-Listening', 'Inattentive', 'Losing the Thread', 'Mind Elsewhere', 'Preoccupied', 'Restless', 'Side-Tracked', 'Skimming', 'Slow to Notice', 'Unfocused', 'Wool-Gathering'],
      moderate: ["Can't Concentrate", 'Drawn Off Task', 'Mind Racing', 'Pulled in Two Directions', 'Scattered', 'Spread Too Thin', 'Thoughts Scattering', 'Too Much at Once', 'Unable to Settle', 'Worrying at Something Else'],
      severe: ['Cannot Focus at All', 'Hopelessly Scattered', 'Mind Fragmenting', 'Overloaded and Reeling', 'Paralysed by Indecision', 'Pulled Apart', 'Senses Swamped', 'Thoughts in Chaos', 'Unable to Hold a Thought', 'Utterly Distracted']
    },
    'Grief and Despair': {
      mild: ['Bereaved', 'Blue', 'Cast Down', 'Crestfallen', 'Disheartened', 'Downcast', 'Heavy-Hearted', 'Low', 'Melancholy', 'Mournful', 'Sad', 'Sombre', 'Sorrowful', 'Subdued', 'Tearful', 'Wistful'],
      moderate: ['Anguished', 'Bereft', 'Bowed by Grief', 'Despairing', 'Disconsolate', 'Grief-Stricken', 'Heartsick', 'Heavy With Loss', 'Inconsolable', 'Numb With Sorrow', 'Sinking', 'Sorrow-Laden', 'Stricken', 'Weighed Down', 'Wretched'],
      severe: ['Beyond Consolation', 'Beyond Reach', 'Broken by Loss', 'Crushed by Despair', 'Drowning in Grief', 'Empty', 'Gutted', 'Hollowed Out', 'Hopeless', 'Lost to Sorrow', 'Numb and Unreachable', 'Past Caring', 'Shut Down', 'Unreachable', 'Wracked With Grief']
    }
  },
  Physical: {
    'Blunt Trauma and Bruising': {
      mild: ['Banged Up', 'Battered', 'Bruised', 'Dazed by a Blow', 'Jarred', 'Knocked About', 'Knocked Breathless', 'Rib-Sore', 'Smarting', 'Sore-Ribbed', 'Stunned', 'Tender', 'Throbbing', 'Walloped', 'Welted', 'Winded'],
      moderate: ['Badly Bruised', 'Black-Eyed', 'Bruised to the Bone', 'Cracked Rib', 'Doubled Over', 'Heavily Battered', 'Hobbled by a Blow', 'Knocked Down Hard', 'Reeling From Impact', 'Ribs Aching', 'Seeing Stars', 'Staggered', 'Struggling for Breath', 'Whiplashed', 'Winded and Hurting'],
      severe: ['Bones Crushed', 'Caved-In Ribs', 'Coughing Blood', 'Cracked Sternum', 'Crushed Underfoot', 'Flattened', 'Internal Bruising', 'Pulped', 'Ribs Stove In', 'Ruptured by Impact', 'Shattered Cheekbone', 'Smashed Flat', 'Spine Jarred', 'Stove In', 'Winded Past Standing']
    },
    'Breaks and Joints': {
      mild: ['Jammed Finger', 'Jarred Joint', 'Pulled Muscle', 'Stiff Joint', 'Strained', 'Tender Ankle', 'Tweaked', 'Twinging Knee', 'Twisted Slightly', 'Wrenched', 'Wrenched Wrist'],
      moderate: ['Cracked Bone', 'Dislocated Finger', 'Dislocated Shoulder', 'Hairline Fracture', 'Hobbled', 'Limping Badly', 'Popped Joint', 'Sprained Ankle', 'Torn Ligament', 'Twisted Ankle', 'Wrenched Knee'],
      severe: ['Broken Arm', 'Broken Leg', 'Compound Fracture', 'Crushed Hand', 'Knee Blown Out', "Leg Won't Bear Weight", 'Mangled Limb', 'Shattered Joint', 'Shattered Kneecap', 'Shattered Wrist', 'Snapped Bone', 'Splintered Bone']
    },
    'Burns and Exposure': {
      mild: ['Blistering', 'Chilled to the Bone', 'Numb Fingers', 'Reddened', 'Scalded', 'Scorched', 'Seared', 'Shivering', 'Singed', 'Smarting Burn', 'Stinging Burn', 'Sunstruck', 'Wind-Burnt'],
      moderate: ['Badly Burnt', 'Blistered Raw', 'Chemical Burn', 'Frostbitten', 'Heat-Exhausted', 'Hypothermic', 'Scalded Raw', 'Searing Pain', 'Second-Degree Burn', 'Shock From Burns', 'Smoke-Choked', 'Sunstroke'],
      severe: ['Charred', 'Cooked Through', 'Deep Burns', 'Electrocuted', 'Flesh Seared Away', 'Frostbite Setting In', 'Hands Burnt Useless', 'Hypothermia Closing In', 'Lungs Scorched', 'Seared to the Bone', 'Third-Degree Burns', 'Wracked by Shock']
    },
    'Cuts and Bleeding': {
      mild: ['Bleeding Lightly', 'Chafed Raw', 'Cut', 'Grazed', 'Nicked', 'Scoured', 'Scraped', 'Scratched', 'Shallow Cut', 'Slashed', 'Sliced', 'Smarting Cut', 'Split Lip', 'Stinging Gash', 'Weeping Graze'],
      moderate: ['Bleeding', 'Bleeding Freely', 'Deep Cut', 'Deep Gash', 'Gashed', 'Gushing', 'Knife Wound', 'Lacerated', 'Laid Open', 'Losing Blood', 'Slashed Open', 'Slick With Blood', 'Torn Open', "Wound Won't Close"],
      severe: ['Arterial Spray', 'Bleeding Badly', 'Bleeding Out', 'Blood Loss Mounting', 'Cut to the Bone', 'Deep Laceration', 'Going Cold From Blood Loss', 'Gushing Blood', 'Haemorrhaging', 'Major Vessel Cut', 'Pooling Blood', 'Slashed Throat', 'Throat Cut']
    },
    'Exhaustion and Depletion': {
      mild: ['Aching', 'Drained', 'Flagging', 'Footsore', 'Heavy-Limbed', 'Out of Puff', 'Peckish', 'Puffing', 'Run-Down', 'Sluggish', 'Stiff', 'Tired', 'Weary', 'Winded', 'Worn', 'Yawning'],
      moderate: ['Bone-Tired', 'Burnt Out', 'Dead on His Feet', 'Dehydrated', 'Drooping', 'Fading Fast', 'Faint With Hunger', 'Famished', 'Flagging Badly', 'Half-Starved', 'Legs Like Lead', 'Parched', 'Running on Empty', 'Sapped', 'Spent', 'Wrung Out'],
      severe: ['At the Limit', 'Body Failing', 'Can Barely Stand', 'Collapsing', 'Cramping Uncontrollably', 'Dead Weight', 'Past Endurance', 'Ready to Drop', 'Running on Fumes', 'Shaking With Fatigue', 'Spent Past Recovery', 'Staggering', 'Strength Gone', 'Trembling Legs', 'Utterly Drained', 'Wrecked']
    },
    'Head and Concussion': {
      mild: ['Bell Rung', 'Blurred for a Moment', 'Dazed', 'Dizzy From a Knock', 'Ears Ringing', 'Head Reeling', 'Head Spinning', 'Lightheaded', 'Seeing Stars', 'Slow to Focus', 'Vision Swimming', 'Woozy'],
      moderate: ['Concussed', 'Confused by a Blow', 'Disoriented', 'Double Vision', "Ears Won't Stop Ringing", 'Head Pounding', 'Memory Hazy', 'Nauseous From a Hit', 'Reeling', 'Slurred and Dazed', 'Splitting Headache', 'Unsteady on His Feet'],
      severe: ['Blacking Out', 'Brain Rattled', 'Cracked Skull', 'Drifting Out of Consciousness', 'Fractured Skull', 'Knocked Senseless', 'Mind Fogged Over', 'Out Cold', 'Severe Concussion', 'Skull Fractured', 'Unable to Stand', 'Vision Greying Out']
    },
    'Impairment and Intoxication': {
      mild: ['Bleary', 'Buzzed', 'Dizzy', 'Drowsy', 'Foggy-Headed', 'Giddy', 'Heavy-Lidded', 'Lightheaded', 'Loosened Up', 'Merry', 'Muzzy', 'Slightly Off', 'Slow to React', 'Tipsy', 'Unsteady', 'Woozy'],
      moderate: ['Befogged', 'Clumsy-Handed', 'Doped', 'Drugged', 'Drunk', 'Hazy', 'Off-Balance', 'Reeling', 'Sedated', 'Seeing Double', 'Slowed', 'Slurring', 'Stumbling', 'Swaying', 'Unfocused', 'Wits Dulled'],
      severe: ['Barely Conscious', 'Blackout Drunk', "Can't Stand", 'Comatose', 'Drugged Senseless', 'Hallucinating', 'Incapacitated', 'Numb All Over', 'Out Cold', 'Overdosing', 'Paralysed', 'Passing Out', 'Poisoned', 'Stupefied', 'Unable to Function', 'Vision Swimming']
    },
    'Internal and Systemic': {
      mild: ['Bruised Inside', 'Coughing', 'Light-Headed', 'Nauseated', 'Queasy', 'Short of Breath', 'Sickened', 'Sluggish From Toxin', 'Stomach Churning', 'Tightness in the Chest', 'Winded Deep'],
      moderate: ['Air Cut Off', 'Coughing Blood', 'Envenomed', 'Gasping for Air', 'Internal Bleeding', 'Organ Bruised', 'Poisoned', 'Ruptured Something', 'Struggling to Breathe', 'Toxin Spreading', 'Winded and Wheezing'],
      severe: ['Asphyxiating', 'Bleeding Internally', 'Choking to Death', 'Collapsed Lung', 'Drowning', 'Organs Failing', 'Poison Taking Hold', 'Punctured Lung', 'Ruptured Organ', 'Suffocating', 'Systemic Shock', 'Venom Overwhelming']
    },
    'Penetrating Wounds': {
      mild: ['Grazed by a Shot', 'Jabbed', 'Nicked by a Blade', 'Pierced Shallow', 'Pricked', 'Punctured', 'Shallow Stab', 'Skin Broken', 'Speared Lightly', 'Stuck', 'Winged'],
      moderate: ['Bleeding From a Puncture', 'Deep Puncture', 'Gored', 'Gunshot Wound', 'Impaled Shallow', 'Knife in the Side', 'Shot', 'Speared', 'Stabbed', 'Wound in the Gut', 'Wounded Deep'],
      severe: ['Bullet Lodged Deep', 'Gut-Shot', 'Impaled', 'Multiple Wounds', 'Pierced Through', 'Pinned by a Blade', 'Punctured Lung', 'Riddled', 'Run Through', 'Shot Through', 'Skewered', 'Spitted']
    },
    'Sensory Overload': {
      mild: ['Blinking in the Glare', 'Dazzled', 'Distracting Din', 'Eyes Watering', 'Half-Deafened', 'Loud in His Ears', 'Momentarily Blinded', 'Muffled Hearing', 'Ringing Ears', 'Seeing Spots', 'Smarting Eyes', 'Squinting', 'Stinging Nostrils', 'Struggling to Hear', 'Swimming Vision', 'Too Much Noise'],
      moderate: ['Blinded by the Flash', 'Disoriented by Noise', 'Drowned Out', 'Ears Ringing Loud', 'Eyes Streaming', 'Gagging on the Stench', 'Overwhelmed by Sound', 'Reeling From the Glare', 'Senses Swamped', 'Sensory Chaos', 'Staggered by the Blast', 'Syncopated and Dizzy', 'Unable to Hear Orders', 'Vision Whited Out'],
      severe: ['Blind and Deaf', 'Blinded Completely', 'Deafened', 'Overcome by the Assault', 'Reeling and Helpless', 'Senses Overwhelmed', 'Senses Shut Down', 'Stunned Senseless', 'Swamped Past Function', 'Unable to See or Hear', 'Wits Battered Loose']
    },
    'State and Position': {
      mild: ['Crowded', 'Encumbered', 'Exposed', 'Footing Lost', 'Hemmed In', 'Off-Balance', 'Out of Position', 'Overbalanced', 'Pressed', 'Slipping', 'Stumbling', 'Tangled', 'Teetering', 'Unbalanced', 'Unsteady Footing', 'Wrong-Footed'],
      moderate: ['Backed Up to the Edge', 'Boxed In', 'Cornered', 'Driven Back', 'Flanked', 'Grabbed', 'Knocked Down', 'Off His Feet', 'Outflanked', 'Overextended', 'Pinned', 'Prone', 'Separated From the Others', 'Staggered', 'Surrounded', 'Trapped'],
      severe: ['At Their Mercy', 'Bound', 'Buried', 'Crushed Underneath', 'Dangling', 'Disarmed and Held', 'Held Fast', 'Helpless', 'Immobilised', 'No Way to Move', 'Overpowered', 'Pinned and Helpless', 'Restrained', 'Shackled', 'Swept Away', 'Trapped Beyond Escape']
    }
  },
  Social: {
    'Connection and Isolation': {
      mild: ['Cold-Shouldered', 'Excluded', 'Ignored', "Kept at Arm's Length", 'Left Out', 'Naming No Allies', 'On the Outside', 'Out of the Loop', 'Overlooked', 'Passed Over', 'Sidelined', 'Talked Over', 'Unheard', 'Unwelcome', 'Without a Friend Here', 'Without Backup'],
      moderate: ['Alienated', 'Cut Off', 'Disowned', 'Frozen Out', 'Isolated', 'No One in His Corner', 'Ostracised', 'Out in the Cold', 'Shunned', 'Stranded Among Strangers', 'Turned Away', 'Unsupported', 'Without Allies', 'Without Recourse'],
      severe: ['Abandoned', 'Alone Against Everyone', 'Banished', 'Betrayed by All', 'Cast Out', 'Cut Off Entirely', 'Disavowed', 'Friendless', 'Hunted by Former Friends', 'No One Left', 'Outcast', 'Pariah', 'Totally Alone', 'Utterly Forsaken']
    },
    'Influence and Leverage': {
      mild: ['Asked a Favour', 'Beholden', 'Compromised a Little', 'Holding Back', 'Hooked', 'Leaned On', 'Mildly Exposed', 'Nudged', 'Obliged to Listen', 'On the Hook', 'Open to Suggestion', 'Persuaded Against His Will', 'Reminded of a Debt', 'Softened Up', 'Talked Around', 'Under a Little Pressure'],
      moderate: ['Backed Into a Deal', 'Blackmail Hanging Over Him', 'Bought', 'Compromised', 'Cornered Into Agreeing', 'Has a Marker Called', 'Held to Account', "In Someone's Pocket", 'Leveraged', 'Manipulated', 'Obligated to Comply', 'Outmanoeuvred', 'Owned a Little', 'Pressured Into It', 'Strings Attached', 'Under the Thumb'],
      severe: ["At Someone's Mercy", 'Blackmailed Outright', 'Bought and Owned', 'Boxed In Completely', 'Coerced', 'Controlled', 'Dancing to Their Tune', 'Held Hostage to a Secret', 'In Too Deep to Refuse', 'No Choice Left', 'Owned Outright', 'Puppet on a String', 'Snared', 'Trapped by His Own Past', 'Wholly Compromised']
    },
    'Obligation and Debt': {
      mild: ['Asked to Repay', 'Behind on a Promise', 'Beholden', 'Called On', 'Expected to Help', 'In Arrears', 'Indebted', 'Late on a Favour', 'Mildly Owing', 'Nagged for Payment', 'On Notice', 'Owing a Small Debt', 'Promised Too Much', 'Reminded of His Word', 'Under Obligation', 'Vouched For'],
      moderate: ['Bound by an Oath', 'Chased for Payment', 'Deep in Debt', 'Honour-Bound', 'In Over His Head', 'Indentured', 'Marker Called In', 'Mortgaged to a Patron', 'On the Hook for More', 'Overcommitted', 'Owing Dangerous People', 'Pledged Beyond His Means', 'Pressed to Deliver', 'Sworn to a Task', 'Tied to a Bargain', 'Underwater'],
      severe: ['Bound on Pain of Death', 'Buried in Debt', 'Debt Called With Menace', 'Enslaved to a Bargain', 'Honour Forfeit', 'In Blood Debt', 'Indebted to the Wrong People', 'Life Owed', 'No Way to Repay', 'Oath He Cannot Keep', 'Owned by His Creditors', 'Ruined by What He Owes', 'Sworn Past Escape', 'Trapped by an Oath']
    },
    'Pressure and Scrutiny': {
      mild: ['Asked Pointed Questions', 'Being Sized Up', 'Clock Ticking', 'Eyed Suspiciously', 'Hurried', 'On Show', 'On the Spot', 'Put on Notice', 'Questioned', 'Rushed', 'Tested', 'Under a Deadline', 'Under Mild Suspicion', 'Watched', 'Watched Closely', 'Watched From the Corner'],
      moderate: ['Cornered by Questions', 'Cross-Examined', 'Doubted Openly', 'Hounded', 'Interrogated', 'Made to Account', 'On a Knife-Edge', 'Picked Apart', 'Pressed for Answers', 'Pressed Hard', 'Scrutinised', 'Tightening Deadline', 'Under a Spotlight', 'Under Heavy Suspicion', 'Under the Microscope', 'Watched by Everyone'],
      severe: ['Accused Outright', 'Caught Dead to Rights', 'Cornered With No Answer', 'Crushing Deadline', 'Denounced', 'Exposed Before All', 'Grilled Relentlessly', 'Hunted', 'On Trial', 'Pilloried', 'Publicly Doubted', 'Surrounded by Accusers', 'Trapped Under Questioning', 'Unable to Explain', 'Under Open Accusation']
    },
    'Standing and Reputation': {
      mild: ['Doubted', 'Embarrassed Publicly', 'Gossiped About', 'Losing Face', 'Made to Look Foolish', 'Mocked', 'Murmured About', 'Out of Favour', 'Overshadowed', 'Passed Over', 'Questioned', 'Slighted', 'Snubbed', 'Talked About', 'Undercut', 'Whispered About'],
      moderate: ['Belittled in Public', 'Credibility Shaken', 'Discredited', 'Distrusted', 'Humiliated Publicly', 'Losing Standing', 'Name Dragged Down', 'Openly Doubted', 'Out of Standing', 'Reputation Slipping', 'Shamed Before Peers', 'Smeared', 'Suspected', 'Tarnished', 'Under a Cloud', 'Undermined'],
      severe: ['Branded a Liar', 'Cast Out in Disgrace', 'Defamed', 'Disgraced', 'Exposed as a Fraud', 'Made a Pariah', 'Name in Ruins', 'Notorious', 'Publicly Ruined', 'Reputation Destroyed', 'Shamed Beyond Recovery', 'Stripped of Standing', 'Thoroughly Discredited', 'Trust Gone', 'Utterly Disgraced']
    }
  }
}

export const getCategories = () => Object.keys(COMPLICATION_PRESETS)

export const getSubCategories = category => Object.keys(COMPLICATION_PRESETS[category] ?? {})

export const getPresetNames = (category, subCategory, severity) =>
  COMPLICATION_PRESETS[category]?.[subCategory]?.[severity] ?? []
