import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WORLD_HALF, resolveCollision } from './ground.js';
import { loadKitMesh } from '../player/weapons.js';

const RED = Color3.FromHexString('#e24b4a');
const ATTACK_INTERVAL = 1.2;
const RESPAWN_TIME = 15;

export const MONSTER_TYPES = {
  slime: {
    name: '원귀',
    hp: 30, damage: 5, speed: 3.6, wanderSpeed: 1, aggro: 10, attackRange: 1.9,
    xp: 12, gold: [3, 7], jelly: 1,
    barY: 1.9, ring: [18, 55]
  },
  mushroom: {
    name: '도깨비',
    hp: 60, damage: 10, speed: 2.2, wanderSpeed: 0.7, aggro: 9, attackRange: 2.0,
    xp: 25, gold: [8, 14], jelly: 2,
    barY: 2.1, ring: [45, 85]
  },
  fox: {
    name: '요호',
    hp: 45, damage: 8, speed: 5.4, wanderSpeed: 1.8, aggro: 13, attackRange: 1.8,
    xp: 20, gold: [6, 12], jelly: 1,
    barY: 1.7, ring: [30, 70],
    model: { file: 'Fox.glb', height: 1.1, clips: { idle: 'Survey', walk: 'Walk', run: 'Run' } }
  },
  // 골귀(骨鬼) — 뼈만 남은 무사. 느리지만 단단하고 한 방이 무겁다
  bone: {
    name: '골귀',
    hp: 90, damage: 14, speed: 2.6, wanderSpeed: 0.8, aggro: 11, attackRange: 2.3,
    xp: 38, gold: [12, 20], jelly: 2,
    barY: 2.3, ring: [50, 90],
    model: {
      file: 'Skeleton_Warrior.glb', height: 1.95,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_A'
      },
      kitProps: [
        { file: 'sword_1handed.gltf', height: 0.95 },
        { file: 'axe_1handed.gltf', height: 0.85 },
        { file: 'sword_2handed.gltf', height: 1.25 }
      ]
    }
  },
  // 마검졸 — 마물이 아닌 인간 산적 (REFERENCE.md T1). 방패를 들고 끈질기게 파고든다
  bandit: {
    name: '마검졸',
    hp: 70, damage: 11, speed: 3.8, wanderSpeed: 1.1, aggro: 12, attackRange: 2.1,
    xp: 30, gold: [15, 26], jelly: 1,
    barY: 2.2, ring: [35, 75],
    model: {
      file: 'Knight.glb', height: 1.85,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Slice_Diagonal', hit: 'Hit_A', death: 'Death_A'
      },
      props: ['1H_Sword', 'Round_Shield'],
      // 개체마다 다른 무기를 들려 같은 모델로 변형을 만든다 (REFERENCE.md의 리스킨 기법)
      propVariants: [
        ['1H_Sword', 'Round_Shield'],
        ['2H_Sword'],
        ['1H_Sword', 'Spike_Shield']
      ]
    }
  },
  // 악귀 술사 — 거리를 두고 술법을 쏜다. 근접하면 물러난다
  // (REFERENCE.md: 원거리·술법형 적이 없으면 전투가 단조로워진다)
  caster: {
    name: '악귀 술사',
    hp: 55, damage: 13, speed: 3.0, wanderSpeed: 0.9, aggro: 18, attackRange: 15,
    xp: 34, gold: [14, 24], jelly: 2,
    barY: 2.2, ring: [40, 80],
    ranged: { projectileColor: '#b06cff', speed: 22, interval: 2.2, keepDistance: 7 },
    model: {
      file: 'Mage.glb', height: 1.85,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Spellcast_Shoot', hit: 'Hit_A', death: 'Death_A'
      },
      props: ['2H_Staff', 'Spellbook']
    }
  },
  // 왕도깨비 — 1장 필드 보스. 느리고 단단하며 패턴 2개를 번갈아 쓴다
  boss: {
    name: '왕도깨비',
    hp: 900, damage: 22, speed: 2.4, wanderSpeed: 0.6, aggro: 16, attackRange: 3.1,
    xp: 400, gold: [180, 260], jelly: 12,
    barY: 3.4, ring: [55, 70],
    isBoss: true,
    superArmor: true,       // 넉백·에어본 면역 (REFERENCE.md: 무게 등급)
    respawn: 60,
    model: {
      file: 'Barbarian.glb', height: 3.0,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '2H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_A',
        spin: '2H_Melee_Attack_Spin', taunt: 'Taunt'
      },
      props: ['2H_Axe']
    },
    // 번갈아 쓰는 공격 패턴
    patterns: [
      { clip: 'attack', range: 3.1, damageMul: 1, windup: 0.45, knock: 16, knockUp: 0, radius: 0 },
      { clip: 'spin', range: 4.2, damageMul: 1.5, windup: 0.55, knock: 22, knockUp: 5, radius: 4.2 }
    ]
  },
  // 뼈 졸개 — 약하지만 무리로 몰려온다
  minion: {
    name: '뼈 졸개',
    hp: 34, damage: 6, speed: 4.2, wanderSpeed: 1.4, aggro: 12, attackRange: 1.9,
    xp: 15, gold: [4, 9], jelly: 1,
    barY: 1.8, ring: [25, 65],
    model: {
      file: 'Skeleton_Minion.glb', height: 1.5,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Unarmed_Melee_Attack_Punch_A', hit: 'Hit_A', death: 'Death_A'
      },
      kitProps: [
        { file: 'dagger.gltf', height: 0.55 },
        { file: 'sword_1handed.gltf', height: 0.9 }
      ]
    }
  }
};

function flatMat(scene, name, hex, emissive = false) {
  const mat = new StandardMaterial(name, scene);
  if (emissive) {
    mat.emissiveColor = Color3.FromHexString(hex);
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = Color3.FromHexString(hex);
  }
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

class Monster {
  constructor(scene, shadow, typeKey) {
    this.scene = scene;
    this.typeKey = typeKey;
    this.cfg = MONSTER_TYPES[typeKey];
    this.group = new TransformNode('mon-' + typeKey, scene);
    this.body = new TransformNode('monBody', scene);
    this.body.parent = this.group;

    const eyeMat = flatMat(scene, 'eye', '#222222', true);

    if (this.cfg.model) {
      // GLB 스킨드 메시 몬스터 — 히트 플래시 대신 스쿼시만 사용
      this.flashMat = new StandardMaterial('dummyFlash' + typeKey, scene);
      this.baseColor = this.flashMat.diffuseColor.clone();
      this.anims = null;
      this.animName = '';
      this._loadModel(shadow);
    } else if (typeKey === 'slime') {
      this.flashMat = new StandardMaterial('ghostMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#dfe9ff');
      this.flashMat.emissiveColor = Color3.FromHexString('#2a3a6a');
      this.flashMat.alpha = 0.72;
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#dfe9ff');

      const head = MeshBuilder.CreateSphere('ghostHead', { diameter: 1.1, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.0;
      head.parent = this.body;

      const tail = MeshBuilder.CreateCylinder(
        'ghostTail', { diameterTop: 1.05, diameterBottom: 0.1, height: 0.9, tessellation: 10 }, scene
      );
      tail.material = this.flashMat;
      tail.position.y = 0.45;
      tail.parent = this.body;

      for (const sx of [-0.2, 0.2]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.16, segments: 6 }, scene);
        eye.material = eyeMat;
        eye.position.set(sx, 1.08, 0.46);
        eye.parent = this.body;
      }
    } else {
      this.flashMat = new StandardMaterial('dokkaebiMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#a04a38');
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#a04a38');

      const torso = MeshBuilder.CreateCylinder(
        'dkBody', { diameterTop: 0.9, diameterBottom: 1.15, height: 1.3, tessellation: 10 }, scene
      );
      torso.material = this.flashMat;
      torso.position.y = 0.65;
      torso.parent = this.body;
      if (shadow) shadow.addShadowCaster(torso);

      const head = MeshBuilder.CreateSphere('dkHead', { diameter: 0.85, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.55;
      head.parent = this.body;
      if (shadow) shadow.addShadowCaster(head);

      const horn = MeshBuilder.CreateCylinder(
        'dkHorn', { diameterTop: 0, diameterBottom: 0.22, height: 0.45, tessellation: 8 }, scene
      );
      horn.material = flatMat(scene, 'hornMat', '#e8d8a8');
      horn.position.set(0, 2.05, 0);
      horn.parent = this.body;

      const club = MeshBuilder.CreateCylinder(
        'dkClub', { diameterTop: 0.3, diameterBottom: 0.14, height: 1.0, tessellation: 8 }, scene
      );
      club.material = flatMat(scene, 'clubMat', '#5a4028');
      club.position.set(0.62, 0.9, 0.15);
      club.rotation.z = -0.5;
      club.parent = this.body;

      for (const sx of [-0.18, 0.18]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.15, segments: 6 }, scene);
        eye.material = flatMat(scene, 'dkEye', '#ffd23e', true);
        eye.position.set(sx, 1.6, 0.38);
        eye.parent = this.body;
      }
    }

    this.hpBg = MeshBuilder.CreatePlane('hpBg', { width: 1.3, height: 0.14 }, scene);
    this.hpBg.material = flatMat(scene, 'hpBg', '#2c2c2a', true);
    this.hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBg.position.y = this.cfg.barY;
    this.hpBg.parent = this.group;

    this.hpBar = MeshBuilder.CreatePlane('hpBar', { width: 1.24, height: 0.1 }, scene);
    this.hpBar.material = flatMat(scene, 'hpFill', '#e24b4a', true);
    this.hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBar.position.y = this.cfg.barY;
    this.hpBar.parent = this.group;

    this.hp = this.cfg.hp;
    this.dead = false;
    this.respawnT = 0;
    this.attackT = 0;
    this.attackAnim = 0;
    this.flashT = 0;
    this.velY = 0;
    this.deathT = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.wanderT = 0;
    this.wanderDir = new Vector3(0, 0, 0);
    this.knock = new Vector3(0, 0, 0);
    this.bounce = Math.random() * 10;
    this._tmp = new Vector3(0, 0, 0);

    for (const cm of this.group.getChildMeshes()) cm.metadata = { monster: this };

    this.placeRandom();
  }

  async _loadModel(shadow) {
    const m = this.cfg.model;
    const res = await SceneLoader.ImportMeshAsync('', 'models/', m.file, this.scene);
    const rootMesh = res.meshes[0];

    const holder = new TransformNode('monModel', this.scene);
    holder.parent = this.body;
    rootMesh.parent = holder;

    const { min, max } = rootMesh.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = m.height / h;
    holder.scaling.setAll(scale);
    holder.position.y = -min.y * scale;
    holder.rotation.y = m.yaw || 0;

    // 모델 내장 무기 프롭은 기본적으로 끄고, 지정된 것만 켠다
    const variants = m.propVariants;
    const wanted = variants
      ? variants[Math.floor(Math.random() * variants.length)]
      : (m.props || []);
    for (const mesh of res.meshes) {
      if (shadow && mesh.getTotalVertices && mesh.getTotalVertices() > 0) shadow.addShadowCaster(mesh);
      mesh.metadata = { monster: this };
      const parent = mesh.parent && mesh.parent.name;
      if (parent && /^handslot/i.test(parent)) mesh.setEnabled(wanted.includes(mesh.name));
    }

    this.anims = {};
    this.animDur = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.anims[g.name] = g;
      const a = g.targetedAnimations[0] ? g.targetedAnimations[0].animation : null;
      this.animDur[g.name] = (g.to - g.from) / (a ? a.framePerSecond : 60);
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.12;
      }
    }
    // 내장 무기가 없는 모델(해골 등)은 kit 무기를 본에 직접 붙인다
    const kit = m.kitProps;
    if (kit && kit.length && res.skeletons[0]) {
      const pick = kit[Math.floor(Math.random() * kit.length)];
      if (pick) {
        const bone = res.skeletons[0].bones.find((b) => b.name === (pick.bone || 'handslot.r'));
        if (bone) {
          const mesh = await loadKitMesh(this.scene, pick.file, { height: pick.height || 0.9 });
          if (mesh) {
            mesh.parent = bone.getTransformNode();
            mesh.position.set(0, 0, 0);
            if (shadow) for (const cm of mesh.getChildMeshes()) shadow.addShadowCaster(cm);
          }
        }
      }
    }

    this.playAnim('idle');
  }

  // key는 논리 이름(idle/walk/run/attack/hit/death) — 몬스터별 클립 맵으로 변환된다
  playAnim(key, speed = 1, loop = true) {
    if (!this.anims) return;
    const name = this.cfg.model.clips[key];
    const next = name && this.anims[name];
    if (!next || this.animName === name) return;
    if (this.animName && this.anims[this.animName]) this.anims[this.animName].stop();
    next.start(loop, speed);
    this.animName = name;
    return this.animDur[name] / speed;
  }

  // 공격·피격·사망처럼 한 번만 재생하고 끝나는 동작
  playOneShot(key, speed = 1) {
    if (!this.anims || !this.cfg.model.clips[key]) return 0;
    const dur = this.playAnim(key, speed, false) || 0;
    this.animLock = Math.max(this.animLock || 0, dur);
    return dur;
  }

  placeRandom() {
    const [rMin, rMax] = this.cfg.ring;
    const angle = Math.random() * Math.PI * 2;
    const radius = rMin + Math.random() * (rMax - rMin);
    this.group.position.set(
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.cos(angle) * radius)),
      0,
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.sin(angle) * radius))
    );
  }

  setVisible(v) {
    this.group.setEnabled(v);
  }

  takeDamage(amount, dir = null, knock = 9, knockUp = 0) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flashT = 0.15;
    this.flashMat.diffuseColor.copyFrom(RED);
    this.body.scaling.set(1.18, 0.45, 1.18);
    // 슈퍼아머(보스): 밀리지도, 뜨지도 않는다
    if (dir && !this.cfg.superArmor) {
      this.knock.copyFromFloats(dir.x, 0, dir.z);
      this.knock.scaleInPlace(knock);
    }
    if (knockUp > 0 && !this.cfg.superArmor) this.velY = Math.max(this.velY, knockUp);
    if (this.hp <= 0) {
      this.dead = true;
      this.respawnT = this.cfg.respawn || RESPAWN_TIME;
      this.pendingAtk = null;
      // 사망 연출: 막타 방향으로 시체가 날아간다 (PHYSICS.md §2-4)
      this.deathT = 0.55;
      this.knock.scaleInPlace(1.4);
      this.hpBg.setEnabled(false);
      this.hpBar.setEnabled(false);
      // 사망 클립이 있으면 쓰러지는 연출로, 없으면 시체가 날아가는 연출로
      if (this.cfg.model && this.cfg.model.clips.death) {
        this.playOneShot('death', 1);
      } else {
        this.velY = Math.max(this.velY, 4.5);
      }
      return true;
    }
    // 슈퍼아머는 피격 모션으로 공격이 끊기지 않는다
    if (!this.cfg.superArmor) this.playOneShot('hit', 1.6);
    return false;
  }

  _rotateToward(target, rate, delta) {
    let diff = target - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, delta * rate);
  }

  update(delta, targets, obstacles) {
    // 빙결 둔화 — 지속 동안 이동이 느려진다
    if (this.slowT > 0) this.slowT -= delta;
    const slow = this.slowT > 0 ? (this.slowMul || 0.5) : 1;
    if (this.dead) {
      if (this.deathT > 0) {
        this.deathT -= delta;
        const pos = this.group.position;
        this.velY -= 30 * delta;
        pos.y += this.velY * delta;
        pos.x += this.knock.x * delta;
        pos.z += this.knock.z * delta;
        this.knock.scaleInPlace(Math.exp(-2 * delta));
        const hasDeathClip = this.cfg.model && this.cfg.model.clips.death;
        if (!hasDeathClip) {
          // 클립이 없는 몬스터만 회전하며 작아지는 연출을 쓴다
          this.body.rotation.x += 9 * delta;
          const s = Math.max(0.25, this.deathT / 0.55);
          this.body.scaling.set(s, s, s);
        }
        if (this.deathT <= 0 || pos.y < -1) {
          this.deathT = 0;
          this.setVisible(false);
          pos.y = 0;
          this.velY = 0;
          this.knock.setAll(0);
          this.body.rotation.x = 0;
          this.body.scaling.set(1, 1, 1);
          this.animName = '';
          this.animLock = 0;
        }
      }
      this.respawnT -= delta;
      if (this.respawnT <= 0) {
        this.dead = false;
        this.hp = this.cfg.hp;
        this.hpBg.setEnabled(true);
        this.hpBar.setEnabled(true);
        this.setVisible(true);
        this.placeRandom();
      }
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= delta;
      if (this.flashT <= 0) {
        this.flashMat.diffuseColor.copyFrom(this.baseColor);
        this.body.scaling.set(1, 1, 1);
      }
    }

    const pos = this.group.position;

    // 에어본(수직) + 넉백(수평) — 힘을 받는 동안은 행동 불가 (PHYSICS.md §2-2/2-3)
    const airborne = pos.y > 0.001 || this.velY > 0;
    if (airborne || this.knock.lengthSquared() > 0.04) {
      if (airborne) {
        this.velY -= 30 * delta;
        pos.y += this.velY * delta;
        if (pos.y <= 0) {
          pos.y = 0;
          this.velY = 0;
          this.body.scaling.set(1.3, 0.55, 1.3); // 착지 스쿼시
          this.flashT = Math.max(this.flashT, 0.12);
        }
      }
      pos.addInPlace(this._tmp.copyFrom(this.knock).scaleInPlace(delta));
      this.knock.scaleInPlace(Math.exp(-6 * delta));
      pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
      pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
      resolveCollision(pos, 0.7, obstacles);
      this.hpBar.scaling.x = Math.max(0, this.hp / this.cfg.hp);
      return;
    }

    let target = null;
    let dist = Infinity;
    for (const t of targets) {
      if (t.dead || t.hp <= 0) continue;
      const d = Math.hypot(t.group.position.x - pos.x, t.group.position.z - pos.z);
      if (d < dist) {
        dist = d;
        target = t;
      }
    }

    if (target && dist < this.cfg.aggro) {
      const toT = this._tmp.copyFrom(target.group.position).subtractInPlace(pos);
      toT.y = 0;
      const safeD = Math.max(dist, 0.001);
      const nx = toT.x / safeD;
      const nz = toT.z / safeD;

      this._rotateToward(Math.atan2(toT.x, toT.z), 10, delta);

      const rng = this.cfg.ranged;
      if (rng) {
        // 원거리형: 사거리 안이면 멈추고, 너무 붙으면 뒷걸음질친다
        if (dist > this.cfg.attackRange * 0.85) {
          pos.x += nx * this.cfg.speed * slow * delta;
          pos.z += nz * this.cfg.speed * slow * delta;
          this._moveState = 'run';
        } else if (dist < rng.keepDistance) {
          pos.x -= nx * this.cfg.speed * 0.85 * delta;
          pos.z -= nz * this.cfg.speed * 0.85 * delta;
          this._moveState = 'walk';
        } else {
          this._moveState = 'idle';
        }
      } else if (dist > this.cfg.attackRange * 0.8) {
        pos.x += nx * this.cfg.speed * slow * delta;
        pos.z += nz * this.cfg.speed * slow * delta;
        this._moveState = 'run';
      } else {
        this._moveState = 'idle';
      }
      this.attackT -= delta;
      if (this.cfg.patterns) {
        // 보스: 패턴을 번갈아 쓰고, 예비동작 뒤에 판정이 나간다
        if (this.pendingAtk) {
          this.pendingAtk.t -= delta;
          if (this.pendingAtk.t <= 0) {
            const pat = this.pendingAtk.pattern;
            const dmg = Math.round(this.cfg.damage * pat.damageMul);
            for (const t of targets) {
              if (t.dead || t.hp <= 0) continue;
              const d = Math.hypot(t.group.position.x - pos.x, t.group.position.z - pos.z);
              const reach = pat.radius > 0 ? pat.radius : pat.range;
              if (d > reach) continue;
              const ux = (t.group.position.x - pos.x) / Math.max(d, 0.001);
              const uz = (t.group.position.z - pos.z) / Math.max(d, 0.001);
              t.takeDamage(dmg, { x: ux, z: uz });
            }
            this.pendingAtk = null;
          }
        } else if (dist < this.cfg.attackRange + 1 && this.attackT <= 0) {
          this.patIndex = ((this.patIndex || 0) + 1) % this.cfg.patterns.length;
          const pat = this.cfg.patterns[this.patIndex];
          this.attackT = ATTACK_INTERVAL * 1.9;
          this.attackAnim = 0.3;
          this.playOneShot(pat.clip, 1);
          this.pendingAtk = { pattern: pat, t: pat.windup };
        }
      } else if (this.cfg.ranged) {
        // 원거리형: 투사체를 쏜다 (판정은 ProjectileManager가 처리)
        if (dist < this.cfg.attackRange && this.attackT <= 0 && this.projectiles) {
          const rng = this.cfg.ranged;
          this.attackT = rng.interval;
          this.attackAnim = 0.3;
          this.playOneShot('attack', 1.2);
          this.projectiles.spawnHostile(
            { x: pos.x + nx * 0.6, y: 1.3, z: pos.z + nz * 0.6 },
            { x: nx, z: nz },
            this.cfg.damage, rng.projectileColor, rng.speed
          );
        }
      } else if (dist < this.cfg.attackRange && this.attackT <= 0) {
        this.attackT = ATTACK_INTERVAL;
        this.attackAnim = 0.3;
        this.playOneShot('attack', 1.3);
        target.takeDamage(this.cfg.damage, { x: nx, z: nz });
      }
    } else {
      this.wanderT -= delta;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.copyFromFloats(Math.sin(a), 0, Math.cos(a));
        if (Math.random() < 0.35) this.wanderDir.copyFromFloats(0, 0, 0);
      }
      if (this.wanderDir.lengthSquared() > 0) {
        pos.x += this.wanderDir.x * this.cfg.wanderSpeed * delta;
        pos.z += this.wanderDir.z * this.cfg.wanderSpeed * delta;
        this._rotateToward(Math.atan2(this.wanderDir.x, this.wanderDir.z), 6, delta);
        this._moveState = 'walk';
      } else {
        this._moveState = 'idle';
      }
    }

    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.7, obstacles);

    this.bounce += delta * (this.typeKey === 'slime' ? 2.2 : 3.5);
    let hop = 0;
    if (this.attackAnim > 0) {
      this.attackAnim -= delta;
      hop = Math.sin(Math.max(0, this.attackAnim) / 0.3 * Math.PI) * 0.35;
    }
    if (this.cfg.model) {
      // 원샷(공격/피격) 재생 중에는 이동 애니메이션으로 덮어쓰지 않는다
      this.animLock = Math.max(0, (this.animLock || 0) - delta);
      if (this.animLock <= 0) {
        if (this._moveState === 'run') this.playAnim('run', 1.3);
        else if (this._moveState === 'walk') this.playAnim('walk', 1.1);
        else this.playAnim('idle');
      }
      this.body.position.y = hop;
    } else if (this.typeKey === 'slime') {
      this.body.position.y = 0.25 + Math.sin(this.bounce) * 0.18 + hop;
    } else {
      this.body.position.y = Math.abs(Math.sin(this.bounce)) * 0.12 + hop;
    }

    this.hpBar.scaling.x = Math.max(0, this.hp / this.cfg.hp);
  }
}

export class MonsterManager {
  constructor(scene, obstacles, shadow,
    counts = { slime: 4, mushroom: 3, fox: 3, minion: 5, bone: 4, bandit: 3, caster: 3, boss: 1 }) {
    this.obstacles = obstacles;
    this.list = [];
    for (const [type, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) this.list.push(new Monster(scene, shadow, type));
    }
  }

  // 원거리형 몬스터가 투사체를 쏠 수 있도록 매니저를 넘겨준다
  setProjectiles(projectiles) {
    for (const m of this.list) m.projectiles = projectiles;
  }

  update(delta, targets) {
    for (const m of this.list) m.update(delta, targets, this.obstacles);
  }
}
