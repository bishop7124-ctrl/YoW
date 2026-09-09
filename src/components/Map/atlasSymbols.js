// Original compact line drawings, shared by the picker, canvas and image export.
export const EXTRA_SYMBOL_PATHS = {
  hills: ['M-32 17Q-15-20 4 17M-3 17Q15-9 32 17', 'M-18 7Q-12-2-6 7M10 9l6-4'],
  volcano: ['M-30 22-10-12H9L30 22Z', 'M-10-12Q0-3 9-12M-4-19q-10-6 0-12M6-18q10-7 2-14M0 0l-3 10 9 12'],
  palm: ['M-3 24Q5 1 0-14', 'M0-14Q-17-30-30-13Q-12-20 0-14M0-14Q12-32 28-18Q11-20 0-14M0-14Q22-16 27 1Q12-10 0-14M0-14Q-20-13-25 5Q-11-8 0-14'],
  marsh: ['M-30 20q8-4 16 0t16 0t16 0M-22 7q8-4 16 0t16 0t16 0', 'M-12 10V-17m0 5-7-7m7 13 7-9M10 9V-23m0 10-6-7m6 12 8-9'],
  dune: ['M-32 20Q-12-10 2-16Q0 5 31 20Z', 'M2-16Q-8 1-7 11M9-8Q20-15 33 9'],
  cave: ['M-31 21-20-6-8-21 12-15 30 21Z', 'M-15 21Q-16-5 0-5Q15-4 16 21ZM-18-7l9-7 7 5'],
  mine: ['M-27 22V-17H27V22M-20 22V-10H20V22', 'M-13 22V4Q0-11 13 4V22M-23-17l8 7m38-7-8 7M-8 15 9 2M-4-1q9-2 16 7'],
  bridge: ['M-31 16V-9Q0-27 31-9V16H20Q0-10-20 16Z', 'M-31-1Q0-19 31-1M-20-14v8m13-13v8m14-8v8m13-5v8M-34 25q8-3 16 0t16 0t16 0t16 0'],
  harbour: ['M0-22V17M-24 2Q-22 25 0 25Q22 25 24 2M-9-8H9', 'M-24 2l-5 9 10-2M24 2l5 9-10-2M-5-27a5 5 0 1 0 10 0a5 5 0 1 0-10 0'],
  lighthouse: ['M-12 25-8-17H8L12 25ZM-11-17v-10h22v10ZM-14-27 0-35 14-27Z', 'M-9 1H9M-11 14H11M-19-23l-13-7m13 13-13 6M19-23l13-7m-13 13 13 6'],
  temple: ['M-30-8 0-28 30-8ZM-28 22H28V27H-28Z', 'M-22-5v24m8-24v24m10-24v24m8-24v24m10-24v24m8-24v24M-32-5H32'],
  camp: ['M-29 22 0-20 29 22ZM-11 22 0-2 11 22Z', 'M0-20v-10M-5-26l10 0M-33 25h66'],
  windmill: ['M-12 25-8-5H8L12 25ZM-3 25V14H4V25', 'M0-10-23-29-28-22-5-4ZM0-10 19-33 26-28 7-5ZM0-10 23 9 28 2 5-16ZM0-10-19 13-26 8-7-15Z'],
  well: ['M-21 5Q0-5 21 5V22Q0 33-21 22ZM-21 5Q0 16 21 5', 'M-19 3V-19M19 3V-19M-27-19 0-32 27-19ZM0-18V3M-4 0h8v7h-8Z'],
  graveyard: ['M-24 24V2Q-24-10-14-10Q-4-10-4 2V24ZM5 24V-8Q5-21 16-21Q27-21 27-8V24Z', 'M-19 3h10m-5-5V11M16-13V6M10-7h12M-30 26H32'],
  bed: ['M-22-29H22V29H-22ZM-18-24H-2V-12H-18ZM2-24H18V-12H2Z', 'M-22-6H22M-22 22H22'],
  chest: ['M-25-6Q-25-22-9-22H9Q25-22 25-6V22H-25Z', 'M-25-6H25M-14-20V22M14-20V22M-4-10H4V3H-4Z'],
  barrel: ['M-17-25Q-29 0-17 25Q0 32 17 25Q29 0 17-25Q0-32-17-25Z', 'M-21-15Q0-8 21-15M-21 15Q0 22 21 15M-7-26Q-12 0-7 27M7-26Q12 0 7 27'],
  throne: ['M-19 11V-24L-10-17 0-30 10-17 19-24V11M-25 3H-17V17H17V3H25V27H-25Z', 'M-17 11H17M-18 27V33M18 27V33'],
  fireplace: ['M-27-25H27V25H-27ZM-19 25V-5Q0-21 19-5V25', 'M-9 19Q-19 9-3-1Q-5 9 5 6Q7-2 10-6Q22 13 9 20ZM-17 25H17'],
  pillar: ['M-18-27H18V-20H-18ZM-18 20H18V27H-18Z', 'M-13-20V20M13-20V20M-5-18V18M5-18V18'],
}

export const SYMBOL_GROUPS = [
  { name: 'Landscape', interior: false, symbols: ['mountain','hills','volcano','forest','palm','marsh','dune'] },
  { name: 'Settlements', interior: false, symbols: ['village','castle','tower','temple','camp','windmill'] },
  { name: 'Landmarks', interior: false, symbols: ['ruin','cave','mine','bridge','harbour','lighthouse','well','graveyard'] },
  { name: 'Rooms & furnishings', interior: true, symbols: ['door','stairs','table','bed','chest','barrel','throne','fireplace','pillar','ruin'] },
]
