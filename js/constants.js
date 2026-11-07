// Game Constants, Classes, Champions, and Balance Configuration

export const GAME_CONFIG = {
  GRID_COLS: 8,
  GRID_ROWS: 6,
  BENCH_SLOTS: 8,
  INITIAL_PLAYER_HP: 100,
  INITIAL_GOLD: 10,
  SHOP_SIZE: 5,
  REROLL_COST: 2,
  XP_COST: 4,
  XP_AMOUNT: 4,
  MAX_LEVEL: 8,
  BASE_ROUND_GOLD: 5,
  MAX_INTEREST_GOLD: 5,
  BATTLE_TICKS_PER_SEC: 60,
  MAX_BATTLE_TIME_SEC: 45,
  OVERTIME_START_SEC: 25,
};

export const LEVEL_XP = {
  1: 2,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
  6: 28,
  7: 44,
  8: 999
};

// Class Traits and Synergies
export const CLASSES = {
  KNIGHT: {
    id: 'KNIGHT',
    name: 'Knight',
    nameTh: 'อัศวิน',
    icon: '🛡️',
    color: '#4a75a0',
    description: 'ทนทานต่อดาเมจกายภาพ ล่อการโจมตีจากศัตรู',
    counterNote: 'ได้เปรียบ: Rogue, Archer | เสียเปรียบ: Mage',
    synergies: [
      {
        count: 2,
        desc: 'อัศวินทั้งหมดได้รับเกราะ +35 (Armor)',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'KNIGHT').forEach(u => u.bonusArmor += 35);
        }
      },
      {
        count: 4,
        desc: 'อัศวินเกราะ +80 และพันธมิตรทั้งหมดลดดาเมจที่ได้รับ 20%',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'KNIGHT').forEach(u => u.bonusArmor += 80);
          teamUnits.forEach(u => u.bonusDmgReduction += 0.20);
        }
      }
    ]
  },
  MAGE: {
    id: 'MAGE',
    name: 'Mage',
    nameTh: 'จอมเวท',
    icon: '🔮',
    color: '#8e44ad',
    description: 'ยิงเวทหมู่รุนแรง ทะลุเกราะกายภาพ',
    counterNote: 'ได้เปรียบ: Knight | เสียเปรียบ: Rogue, Cleric',
    synergies: [
      {
        count: 2,
        desc: 'จอมเวททั้งหมดได้รับพลังเวท +40% และเริ่มต่อสู้ด้วยมานา 25',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'MAGE').forEach(u => {
            u.bonusMagicPower += 0.40;
            u.startingMana += 25;
          });
        }
      },
      {
        count: 4,
        desc: 'พันธมิตรทั้งหมดพลังเวท +80% และสกิลลดต้านทานเวทเป้าหมาย 40%',
        apply: (teamUnits) => {
          teamUnits.forEach(u => u.bonusMagicPower += 0.80);
          teamUnits.filter(u => u.heroClass === 'MAGE').forEach(u => u.shredsMR = true);
        }
      }
    ]
  },
  ROGUE: {
    id: 'ROGUE',
    name: 'Rogue',
    nameTh: 'นักฆ่า',
    icon: '🗡️',
    color: '#c0392b',
    description: 'กระโดดล้วงแนวหลัง คริติคอลสูงและว่องไว',
    counterNote: 'ได้เปรียบ: Mage, Archer, Cleric | เสียเปรียบ: Knight',
    synergies: [
      {
        count: 2,
        desc: 'นักฆ่าทั้งหมดเพิ่มโอกาสคริติคอล +30% และความแรงคริ +50%',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'ROGUE').forEach(u => {
            u.bonusCritChance += 0.30;
            u.bonusCritDamage += 0.50;
          });
        }
      },
      {
        count: 4,
        desc: 'นักฆ่าคริติคอล 100% ใน 4 วินาทีแรก และได้รับอัตราหลบหลีก +35%',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'ROGUE').forEach(u => {
            u.bonusCritChance += 0.50;
            u.bonusCritDamage += 0.80;
            u.bonusDodge += 0.35;
            u.earlyCritBuff = true;
          });
        }
      }
    ]
  },
  ARCHER: {
    id: 'ARCHER',
    name: 'Archer',
    nameTh: 'พลธนู',
    icon: '🏹',
    color: '#27ae60',
    description: 'โจมตีกายภาพระยะไกลสม่ำเสมอ ยิงเร็วและแม่นยำ',
    counterNote: 'ได้เปรียบ: Cleric | เสียเปรียบ: Rogue, Knight, Mage',
    synergies: [
      {
        count: 2,
        desc: 'พลธนูทั้งหมดเพิ่มความเร็วโจมตี +40%',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'ARCHER').forEach(u => u.bonusAttackSpeed += 0.40);
        }
      },
      {
        count: 4,
        desc: 'พลธนูทั้งหมดเพิ่มความเร็วโจมตี +90% และยิงทะลุเกราะ 40%',
        apply: (teamUnits) => {
          teamUnits.filter(u => u.heroClass === 'ARCHER').forEach(u => {
            u.bonusAttackSpeed += 0.90;
            u.armorPenetration += 0.40;
          });
        }
      }
    ]
  },
  CLERIC: {
    id: 'CLERIC',
    name: 'Cleric',
    nameTh: 'นักบวช',
    icon: '✨',
    color: '#d4ac0d',
    description: 'ฟื้นฟูเลือด บัฟทีม และมีต้านทานเวทสูง',
    counterNote: 'ได้เปรียบ: Mage (ต้านทานเวทสูง) | เสียเปรียบ: Rogue, Archer',
    synergies: [
      {
        count: 2,
        desc: 'พันธมิตรทุกคนฟื้นฟูพลังชีวิต 5% ของ Max HP ทุกวินาที',
        apply: (teamUnits) => {
          teamUnits.forEach(u => u.hpRegenPercent += 0.05);
        }
      },
      {
        count: 4,
        desc: 'พันธมิตรฟื้นฟู 10% Max HP/วินาที และนักบวชได้รับต้านทานเวท +60',
        apply: (teamUnits) => {
          teamUnits.forEach(u => u.hpRegenPercent += 0.10);
          teamUnits.filter(u => u.heroClass === 'CLERIC').forEach(u => u.bonusMagicResist += 60);
        }
      }
    ]
  }
};

// 20 champions: each class has a cost 1, 2, 3, and 5 unit
export const CHAMPIONS = {
  galahad: {
    id: 'galahad',
    name: 'Galahad',
    nameTh: 'กาลาฮัด (อัศวิน)',
    heroClass: 'KNIGHT',
    cost: 1,
    hp: 680,
    attack: 46,
    armor: 60,
    magicResist: 10,
    attackSpeed: 0.85,
    range: 1,
    maxMana: 55,
    startingMana: 10,
    skill: {
      name: 'Shield Slam',
      nameTh: 'ทุบโล่กึกก้อง',
      type: 'PHYSICAL',
      damage: 150,
      description: 'ฟาดโล่ใส่เป้าหมาย ทำดาเมจ 150 กายภาพ และสตัน 1.2 วินาที พร้อมเพิ่มเกราะตัวเอง 30'
    }
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    nameTh: 'วาลคิรี (อัศวินศักดิ์สิทธิ์)',
    heroClass: 'KNIGHT',
    cost: 3,
    hp: 1200,
    attack: 60,
    armor: 65,
    magicResist: 25,
    attackSpeed: 0.85,
    range: 1,
    maxMana: 75,
    startingMana: 20,
    skill: {
      name: 'Divine Whirlwind',
      nameTh: 'พายุหมุนศักดิ์สิทธิ์',
      type: 'PHYSICAL',
      damage: 200,
      radius: 1.5,
      description: 'หมุนดาบสร้างดาเมจ 200 กายภาพรอบตัว และกางโล่บาเรีย 300 HP ป้องกันดาเมจ'
    }
  },
  pyromancer: {
    id: 'pyromancer',
    name: 'Pyromancer',
    nameTh: 'ไพโรแมนเซอร์ (จอมเวทไฟ)',
    heroClass: 'MAGE',
    cost: 1,
    hp: 480,
    attack: 45,
    attackType: 'MAGIC',
    armor: 15,
    magicResist: 30,
    attackSpeed: 0.90,
    range: 4,
    maxMana: 45,
    startingMana: 20,
    skill: {
      name: 'Fireblast',
      nameTh: 'ลูกไฟระเบิด',
      type: 'MAGIC',
      damage: 360,
      description: 'ยิงลูกบอลเพลิงระเบิดใส่เป้าหมาย ทำดาเมจ 360 เวททะลุเกราะกายภาพ'
    }
  },
  stormcaller: {
    id: 'stormcaller',
    name: 'Stormcaller',
    nameTh: 'สตอร์มคอลเลอร์ (จอมเวทสายฟ้า)',
    heroClass: 'MAGE',
    cost: 3,
    hp: 680,
    attack: 55,
    attackType: 'MAGIC',
    armor: 18,
    magicResist: 45,
    attackSpeed: 0.95,
    range: 4,
    maxMana: 65,
    startingMana: 25,
    skill: {
      name: 'Chain Lightning',
      nameTh: 'สายฟ้าชิ่ง',
      type: 'MAGIC',
      damage: 340,
      bounces: 3,
      description: 'ปล่อยสายฟ้าชิ่งใส่ศัตรู 3 ตัว ทำดาเมจ 340 เวทแก่แต่ละตัว'
    }
  },
  shadowblade: {
    id: 'shadowblade',
    name: 'Shadowblade',
    nameTh: 'ชาโดว์เบลด (นักฆ่าเงา)',
    heroClass: 'ROGUE',
    cost: 1,
    hp: 550,
    attack: 68,
    armor: 20,
    magicResist: 20,
    attackSpeed: 1.20,
    range: 1,
    jumpsToBackline: true,
    maxMana: 45,
    startingMana: 15,
    skill: {
      name: 'Backstab',
      nameTh: 'แทงข้างหลัง',
      type: 'PHYSICAL',
      damageMultiplier: 2.2,
      description: 'แวบแทงจุดตายศัตรูด้านหลัง ทำดาเมจคริติคอล 220% อย่างรวดเร็ว'
    }
  },
  specter: {
    id: 'specter',
    name: 'Specter',
    nameTh: 'สเปกเตอร์ (มัจจุราชไร้เงา)',
    heroClass: 'ROGUE',
    cost: 3,
    hp: 720,
    attack: 82,
    armor: 25,
    magicResist: 25,
    attackSpeed: 1.30,
    range: 1,
    jumpsToBackline: true,
    maxMana: 60,
    startingMana: 20,
    skill: {
      name: 'Shadow Dance',
      nameTh: 'ระบำเงาสับรัว',
      type: 'PHYSICAL',
      hits: 4,
      damagePerHit: 95,
      description: 'ฟันศัตรู 4 ดาบต่อเนื่องอย่างรวดเร็ว พร้อมเป็นอมตะชั่วขณะ'
    }
  },
  woodman: {
    id: 'woodman',
    name: 'Woodsman',
    nameTh: 'วู้ดแมน (พรานป่า)',
    heroClass: 'ARCHER',
    cost: 1,
    hp: 420,
    attack: 74,
    armor: 12,
    magicResist: 12,
    attackSpeed: 1.35,
    range: 5,
    maxMana: 40,
    startingMana: 10,
    skill: {
      name: 'Piercing Volley',
      nameTh: 'ยิงทะลวงจุดตาย',
      type: 'PHYSICAL',
      damage: 180,
      armorPen: 0.05,
      attackSpeedBuff: 0.35,
      description: 'ยิงศร 180 กายภาพใส่เป้าหมาย และเพิ่มความเร็วโจมตีจนจบรอบ เลือดบางจึงแพ้การเบิร์สของจอมเวท นักฆ่า และเกราะของอัศวิน'
    }
  },
  deadeye: {
    id: 'deadeye',
    name: 'Deadeye',
    nameTh: 'เดดอาย (พลซุ่มยิง)',
    heroClass: 'ARCHER',
    cost: 3,
    hp: 680,
    attack: 76,
    armor: 20,
    magicResist: 22,
    attackSpeed: 1.15,
    range: 6,
    maxMana: 75,
    startingMana: 15,
    skill: {
      name: 'Piercing Arrow',
      nameTh: 'ศรทะลวงหัวใจ',
      type: 'PHYSICAL',
      damage: 290,
      description: 'ยิงลูกศรทรงพลังเป็นเส้นตรงทะลุศัตรูทุกตัว ทำดาเมจ 290 กายภาพทะลุเกราะ 40%'
    }
  },
  acolyte: {
    id: 'acolyte',
    name: 'Acolyte',
    nameTh: 'อโคไลต์ (ผู้ฝึกตน)',
    heroClass: 'CLERIC',
    cost: 1,
    hp: 650,
    attack: 40,
    armor: 25,
    magicResist: 75, // Divine Warding (huge magic reduction)
    attackSpeed: 0.95,
    range: 3,
    maxMana: 45,
    startingMana: 20,
    skill: {
      name: 'Lesser Heal',
      nameTh: 'พรแห่งการรักษา',
      type: 'HEAL',
      healAmount: 260,
      description: 'ฟื้นฟูเลือด 260 หน่วย และเพิ่มเกราะ +20'
    }
  },
  highpriest: {
    id: 'highpriest',
    name: 'High Priest',
    nameTh: 'ไฮพรีสต์ (มหาพระสังฆราช)',
    heroClass: 'CLERIC',
    cost: 3,
    hp: 820,
    attack: 48,
    armor: 32,
    magicResist: 60,
    attackSpeed: 0.95,
    range: 3,
    maxMana: 80,
    startingMana: 30,
    skill: {
      name: 'Holy Sanctuary',
      nameTh: 'วิหารศักดิ์สิทธิ์',
      type: 'HEAL',
      healAmount: 380,
      description: 'ฟื้นฟูพลังชีวิตเพื่อนร่วมทีมรอบตัว 380 หน่วย และมอบบาเรียป้องกันดาเมจเวท 150 หน่วย'
    }
  },
  warden: {
    id: 'warden',
    name: 'Warden',
    nameTh: 'วอร์เดน (ผู้พิทักษ์)',
    heroClass: 'KNIGHT',
    cost: 2,
    hp: 900,
    attack: 52,
    armor: 55,
    magicResist: 20,
    attackSpeed: 0.80,
    range: 1,
    maxMana: 60,
    startingMana: 15,
    skill: {
      name: 'Bulwark',
      nameTh: 'กำแพงเหล็ก',
      type: 'PHYSICAL',
      damage: 150,
      radius: 1,
      selfShield: 240,
      description: 'ฟาดรอบตัว 150 กายภาพ และกางโล่ 240'
    }
  },
  frostweaver: {
    id: 'frostweaver',
    name: 'Frostweaver',
    nameTh: 'ฟรอสต์วีฟเวอร์ (จอมหนาว)',
    heroClass: 'MAGE',
    cost: 2,
    hp: 540,
    attack: 48,
    attackType: 'MAGIC',
    armor: 14,
    magicResist: 32,
    attackSpeed: 0.90,
    range: 3,
    maxMana: 50,
    startingMana: 15,
    skill: {
      name: 'Frost Nova',
      nameTh: 'วงแหวนน้ำแข็ง',
      type: 'MAGIC',
      damage: 230,
      radius: 1.5,
      description: 'ระเบิดน้ำแข็งรอบตัว 230 เวท'
    }
  },
  cutpurse: {
    id: 'cutpurse',
    name: 'Cutpurse',
    nameTh: 'คัทเพิร์ส (จอมโจร)',
    heroClass: 'ROGUE',
    cost: 2,
    hp: 580,
    attack: 72,
    armor: 18,
    magicResist: 18,
    attackSpeed: 1.25,
    range: 1,
    jumpsToBackline: true,
    maxMana: 40,
    startingMana: 10,
    skill: {
      name: 'Kidney Strike',
      nameTh: 'แทงใต้ซี่โครง',
      type: 'PHYSICAL',
      damageMultiplier: 2.0,
      alwaysCrit: true,
      stun: 0.6,
      description: 'แทงคริติคอล 200% และสตัน 0.6 วินาที'
    }
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    nameTh: 'เรนเจอร์ (พรานพเนจร)',
    heroClass: 'ARCHER',
    cost: 2,
    hp: 500,
    attack: 64,
    armor: 16,
    magicResist: 16,
    attackSpeed: 1.20,
    range: 4,
    maxMana: 50,
    startingMana: 10,
    skill: {
      name: 'Twin Shot',
      nameTh: 'ยิงคู่',
      type: 'PHYSICAL',
      damage: 150,
      hits: 2,
      armorPen: 0.15,
      description: 'ยิงศร 2 นัด นัดละ 150 กายภาพ'
    }
  },
  chaplain: {
    id: 'chaplain',
    name: 'Chaplain',
    nameTh: 'แชปลิน (บาทหลวงสนาม)',
    heroClass: 'CLERIC',
    cost: 2,
    hp: 720,
    attack: 42,
    armor: 28,
    magicResist: 50,
    attackSpeed: 0.90,
    range: 3,
    maxMana: 50,
    startingMana: 15,
    skill: {
      name: 'Field Mend',
      nameTh: 'เยียวยาแนวหน้า',
      type: 'HEAL',
      healAmount: 240,
      description: 'ฟื้นฟูพันธมิตรที่เลือดต่ำที่สุด 240'
    }
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    nameTh: 'พาลาดิน (อัศวินศักดิ์สิทธิ์)',
    heroClass: 'KNIGHT',
    cost: 5,
    hp: 1600,
    attack: 70,
    armor: 75,
    magicResist: 30,
    attackSpeed: 0.75,
    range: 1,
    maxMana: 80,
    startingMana: 20,
    skill: {
      name: 'Aegis Slam',
      nameTh: 'ทุบโล่เอจิส',
      type: 'PHYSICAL',
      damage: 280,
      stun: 1.2,
      selfShield: 480,
      description: 'ทุบเป้าหมาย 280 กายภาพ สตัน 1.2 วินาที และกางโล่ 480'
    }
  },
  archmage: {
    id: 'archmage',
    name: 'Archmage',
    nameTh: 'อาร์คเมจ (จอมเวทใหญ่)',
    heroClass: 'MAGE',
    cost: 5,
    hp: 820,
    attack: 68,
    attackType: 'MAGIC',
    armor: 20,
    magicResist: 40,
    attackSpeed: 0.85,
    range: 4,
    maxMana: 70,
    startingMana: 25,
    skill: {
      name: 'Meteor',
      nameTh: 'อุกกาบาต',
      type: 'MAGIC',
      damage: 520,
      radius: 2,
      onTarget: true,
      description: 'ถล่มอุกกาบาต 520 เวทรอบเป้าหมาย'
    }
  },
  nightblade: {
    id: 'nightblade',
    name: 'Nightblade',
    nameTh: 'ไนท์เบลด (ดาบรัตติกาล)',
    heroClass: 'ROGUE',
    cost: 5,
    hp: 900,
    attack: 98,
    armor: 28,
    magicResist: 24,
    attackSpeed: 1.35,
    range: 1,
    jumpsToBackline: true,
    maxMana: 55,
    startingMana: 15,
    skill: {
      name: 'Execute',
      nameTh: 'ฟันตัดสิน',
      type: 'PHYSICAL',
      hits: 3,
      damage: 140,
      alwaysCrit: true,
      description: 'ฟันคริติคอล 3 ครั้ง ครั้งละ 140'
    }
  },
  marksman: {
    id: 'marksman',
    name: 'Marksman',
    nameTh: 'มาร์คส์แมน (มือปืนแม่น)',
    heroClass: 'ARCHER',
    cost: 5,
    hp: 760,
    attack: 92,
    armor: 22,
    magicResist: 20,
    attackSpeed: 1.20,
    range: 6,
    maxMana: 60,
    startingMana: 15,
    skill: {
      name: 'Snipe',
      nameTh: 'ยิงศีรษะ',
      type: 'PHYSICAL',
      damage: 420,
      armorPen: 0.35,
      description: 'ยิงนัดเดียว 420 กายภาพ ทะลุเกราะ 35%'
    }
  },
  saint: {
    id: 'saint',
    name: 'Saint',
    nameTh: 'เซนต์ (นักบุญ)',
    heroClass: 'CLERIC',
    cost: 5,
    hp: 980,
    attack: 50,
    armor: 35,
    magicResist: 70,
    attackSpeed: 0.85,
    range: 3,
    maxMana: 90,
    startingMana: 30,
    skill: {
      name: 'Benediction',
      nameTh: 'พรหมู่',
      type: 'HEAL',
      healAll: true,
      healAmount: 280,
      shield: 180,
      description: 'ฮีลพันธมิตรทุกคน 280 และมอบโล่ 180'
    }
  }
};

export const STAR_MULTIPLIERS = {
  1: { hp: 1.0, attack: 1.0, skill: 1.0, color: '#ffffff' },
  2: { hp: 1.8, attack: 1.7, skill: 1.7, color: '#f1c40f' },
  3: { hp: 3.2, attack: 3.0, skill: 3.0, color: '#e056fd' }
};
