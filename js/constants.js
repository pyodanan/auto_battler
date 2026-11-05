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
  MAX_BATTLE_TIME_SEC: 30,
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
    counterNote: 'ได้เปรียบ: Cleric | เสียเปรียบ: Rogue, Knight',
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

// 10 Distinct Champions: 2 for each of the 5 classes (1 Cost & 3 Cost)
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
    hp: 520,
    attack: 56,
    armor: 18,
    magicResist: 20,
    attackSpeed: 1.15,
    range: 5,
    maxMana: 55,
    startingMana: 10,
    skill: {
      name: 'Piercing Volley',
      nameTh: 'ยิงทะลวงจุดตาย',
      type: 'PHYSICAL',
      damage: 220,
      armorPen: 0.25,
      description: 'ระดมยิงศรทรงพลัง ทำดาเมจ 220 กายภาพทะลุเกราะ 25%'
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
  }
};

export const STAR_MULTIPLIERS = {
  1: { hp: 1.0, attack: 1.0, skill: 1.0, color: '#ffffff' },
  2: { hp: 1.8, attack: 1.7, skill: 1.7, color: '#f1c40f' },
  3: { hp: 3.2, attack: 3.0, skill: 3.0, color: '#e056fd' }
};
