import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WORLD_HALF, resolveCollision } from '../world/ground.js';
import { WEAPONS, makeSwordMesh, makeGunMesh, SWORD_TIP_Y, loadKitMesh } from './weapons.js';
import { BladeTrail } from './blade_trail.js';
import { recolorTexture } from './recolor.js';
import { setHP, setMP, showCombo, flashHurt, showDamage, setStamina } from '../ui/hud.js';
import { hitstop, shake } from '../core/juice.js';
import {
  weaponDamage, stats, attackSpeedMul, moveSpeedAttrMul, magicDamageMul, damageTakenMul
} from '../core/stats.js';
import { applyWeaponSkills, moveSpeedMul, finisherMods } from '../core/skills.js';
import { CHARACTERS } from '../core/characters.js';
import { sfx } from '../core/sfx.js';

const UP = new Vector3(0, 1, 0);
const GRAVITY = 30;
const JUMP_SPEED = 9.5;
const MAGIC_COST = 20;
const MAGIC_CD = 0.8;
// 회피 대시 (PHYSICS.md §4) — 무적으로 파고들거나 빠져나오는 기동
const DODGE_SPEED = 20;
const DODGE_TIME = 0.32;
const DODGE_IFRAME = 0.24;
const DODGE_CD = 0.75;
// 방패 방어 — 정면에서 오는 피해를 크게 줄인다. 이동은 느려지고 공격은 막힌다
const BLOCK_REDUCTION = 0.25;   // 정면 피격 시 받는 피해 배율
const BLOCK_MOVE_MUL = 0.42;
const BLOCK_FRONT_DOT = 0.15;   // 이 값보다 정면이어야 막힌다
// 기력 — 달리기·회피가 소모한다. 최대치는 레벨과 체력 스탯에 따라 늘어난다
const STAMINA_BASE = 100;
const STAMINA_PER_LEVEL = 6;
const STAMINA_PER_VIT = 1.5;
const RUN_DRAIN = 22;        // 초당
const DODGE_COST = 25;
const STAMINA_REGEN = 16;    // 초당
const STAMINA_REGEN_DELAY = 0.7;
const EXHAUST_LOCK = 1.1;    // 바닥나면 이만큼 달릴 수 없다
const COMBO_WINDOW = 1.1;
// 권법 5단 연계: 잽 → 되치기 → 훅(휘두르기) → 어퍼(도약) → 붕권(마무리)
// 단계별로 클립·재생 구간·속도를 다르게 해서 모션을 구분한다
const PUNCH_COMBO = [
  { dmgMul: 0.8, knock: 3, cd: 0.2, lunge: 3.6, anim: { key: 'punch1', speed: 2.8, toFrac: 0.7 } },
  { dmgMul: 0.9, knock: 3.5, cd: 0.24, lunge: 3.8, anim: { key: 'punch2', speed: 2.5, fromFrac: 0.3 } },
  { dmgMul: 1.05, knock: 5, cd: 0.3, lunge: 4.2, anim: { key: 'punch3', speed: 2.4, toFrac: 0.8 } },
  { dmgMul: 1.25, knock: 7, knockUp: 9, cd: 0.38, lunge: 4.6, anim: { key: 'punch4', speed: 1.9, fromFrac: 0.08, toFrac: 0.85 } },
  { dmgMul: 2.0, knock: 18, knockUp: 2.5, cd: 0.68, lunge: 6.0, anim: { key: 'punch5', speed: 1.3 } }
];
const FINISHER_STEP = PUNCH_COMBO.length - 1;
// 퇴마검 2단 기본 콤보: 찌르기 → 가로베기
const SWORD_COMBO = [
  {
    dmgMul: 0.95, knock: 9, knockUp: 0, cd: 0.42, lunge: 5.4, arcDot: 0.5, rangeMul: 1.15,
    anim: { key: 'sword1', speed: 1.7 }   // 찌르기
  },
  {
    dmgMul: 1.35, knock: 15, knockUp: 1.5, cd: 0.58, lunge: 3.4, arcDot: -0.25, rangeMul: 1,
    anim: { key: 'sword2', speed: 1.5 }   // 가로베기
  }
];
const SWORD_FINISHER = SWORD_COMBO.length - 1;
const LOOPING = new Set(['idle', 'walk', 'run']);
const SPEEDS = { idle: 1, walk: 1.2, run: 1.25, jump: 1.25 };

export class Player {
  constructor(scene, obstacles = [], shadow = null, charKey = 'ilim') {
    this.scene = scene;
    this.obstacles = obstacles;
    this.charKey = charKey;
    this.charCfg = CHARACTERS[charKey] || CHARACTERS.ilim;
    this.group = new TransformNode('player', scene);

    this.placeholder = MeshBuilder.CreateCapsule(
      'playerPh',
      { height: 1.8, radius: 0.45 },
      scene
    );
    const phMat = new StandardMaterial('phMat', scene);
    phMat.diffuseColor = Color3.FromHexString('#6e9bd2');
    this.placeholder.material = phMat;
    this.placeholder.position.y = 0.95;
    this.placeholder.parent = this.group;

    this.walkSpeed = 7;
    this.velY = 0;
    this.onGround = true;
    this.maxHp = 100;
    this.hp = 100;
    this.maxMp = this.charCfg.maxMp;
    this.mp = this.maxMp;
    this.magicCd = 0;
    this.attackCd = 0;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.iframe = 0;
    this.blocking = false;
    this.spellCd = {};
    this.spellCdMax = {};
    this.groundAreas = [];
    this.vfx = null;
    this.nearbyMonsters = null;   // main 루프가 매 프레임 넣어준다
    this.wardT = 0;
    this.wardMul = 1;
    this.dmgBuffT = 0;
    this.dmgBuffMul = 1;
    this.hasteT = 0;
    this.hasteMul = 1;
    this.rainQueue = [];
    this.maxStamina = STAMINA_BASE;
    this.stamina = STAMINA_BASE;
    this.staminaIdle = 0;
    this.exhaustT = 0;
    this._dodgeDir = new Vector3(0, 0, 0);
    this.lockTimer = 0;
    this.punchClipDur = 0.85;
    this.pendingHit = -1;
    this.pendingList = null;
    this.pendingWeapon = null;
    this.currentLunge = 0;
    this.lungeUntil = 0;
    this.comboStep = -1;
    this.comboTimer = 0;
    this.weapon = 'sword';
    this.weaponMeshes = {};
    this.moveTarget = null;
    this.attackTarget = null;
    this.dead = false;
    this.projectiles = null;
    this.speedFov = 0;
    this.onKill = null;

    this.groups = null;
    this.currentAction = null;
    this.currentName = '';
    this.trail = new BladeTrail(scene);
    this._tipTmp = new Vector3(0, 0, 0);
    this._baseTmp = new Vector3(0, 0, 0);

    this.knockV = new Vector3(0, 0, 0);
    this._dir = new Vector3(0, 0, 0);
    this._right = new Vector3(0, 0, 0);
    this._move = new Vector3(0, 0, 0);
    this._face = new Vector3(0, 0, 0);

    this._loadModel(shadow);
  }

  async _loadModel(shadow) {
    const cfg = this.charCfg.model;
    this.clipMap = cfg.clips;
    const res = await SceneLoader.ImportMeshAsync('', 'models/', cfg.file, this.scene);
    const rootMesh = res.meshes[0];

    this.model = new TransformNode('playerModel', this.scene);
    this.model.parent = this.group;
    rootMesh.parent = this.model;

    const { min, max } = rootMesh.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = cfg.height / h;
    this.modelScale = scale;
    this.model.scaling.setAll(scale);
    this.model.position.y = -min.y * scale;

    // 모델에 내장된 무기 프롭은 전부 끄고 이름으로 보관 — 무기 슬롯이 필요할 때만 켠다
    this.builtinProps = {};
    for (const m of res.meshes) {
      const parent = m.parent && m.parent.name;
      if (parent && /^handslot/i.test(parent)) {
        m.setEnabled(false);
        this.builtinProps[m.name] = m;
      }
    }
    this.propForWeapon = cfg.props || {};

    // 색조 기반 리컬러(이림의 붉은 무복) 또는 단순 틴트
    let recolored = null;
    if (cfg.recolor && cfg.texture) {
      try {
        recolored = await recolorTexture(this.scene, cfg.texture, cfg.recolor, `${this.charKey}Tex`);
      } catch (e) {
        recolored = null;
      }
    }
    const tint = this.charCfg.tint ? Color3.FromHexString(this.charCfg.tint) : null;
    const touched = new Set();
    for (const m of res.meshes) {
      if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m);
      const mat = m.material;
      if (!mat || touched.has(mat)) continue;
      touched.add(mat);
      if (recolored) {
        if ('albedoTexture' in mat) mat.albedoTexture = recolored;
        else if ('diffuseTexture' in mat) mat.diffuseTexture = recolored;
      } else if (tint) {
        if (mat.albedoColor) mat.albedoColor = mat.albedoColor.multiply(tint);
        else if (mat.diffuseColor) mat.diffuseColor = mat.diffuseColor.multiply(tint);
      }
    }

    this.groups = {};
    this.clipDur = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.groups[g.name] = g;
      const anim = g.targetedAnimations[0] ? g.targetedAnimations[0].animation : null;
      const fps = anim ? anim.framePerSecond : 60;
      this.clipDur[g.name] = (g.to - g.from) / fps;
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.1;
      }
    }
    const punchClip = this.clipMap.punch1;
    if (this.clipDur[punchClip]) this.punchClipDur = this.clipDur[punchClip];

    this.placeholder.dispose();
    this.placeholder = null;
    this.play('idle');

    // 무기 부착: 모델이 전용 무기 슬롯 본을 가지면 그쪽에, 없으면 손 노드에 붙인다
    // 아트 스타일을 맞추기 위해 KayKit 검을 우선 쓰고, 실패하면 절차적 메시로 대체한다
    const sword = (await loadKitMesh(this.scene, 'sword_1handed.gltf', { height: SWORD_TIP_Y }))
      || makeSwordMesh(this.scene);
    const gun = makeGunMesh(this.scene);
    const slotBone = cfg.weaponBone
      ? (res.skeletons[0] && res.skeletons[0].bones.find((b) => b.name === cfg.weaponBone))
      : null;
    const attach = slotBone
      ? slotBone.getTransformNode()
      : this.scene.getTransformNodeByName('Hand.R') ||
        this.scene.getTransformNodeByName('HandR') ||
        this.scene.getTransformNodeByName('LowerArm.R');

    if (attach) {
      for (const w of [sword, gun]) {
        w.parent = attach;
        w.scaling.setAll(1);
        w.position.set(0, 0, 0);
        w.rotation.set(0, 0, 0);
      }
      if (!slotBone) {
        const inv = 1 / scale;
        for (const w of [sword, gun]) w.scaling.setAll(inv);
        sword.position.set(0, 0.25 / scale, 0);
        sword.rotation.set(Math.PI / 2, 0, 0);
        gun.position.set(0, 0.22 / scale, 0.05 / scale);
      } else {
        gun.rotation.set(Math.PI / 2, 0, 0);
      }
    } else {
      sword.parent = this.group;
      gun.parent = this.group;
      sword.position.set(0.5, 1.15, 0.15);
      sword.rotation.z = -0.4;
      gun.position.set(0.5, 1.2, 0.25);
    }
    sword.setEnabled(false);
    gun.setEnabled(false);
    this.weaponMeshes = { sword, gun };
    this.setWeapon(this.weapon);

    // 방패는 왼손 슬롯에 — 방어 중에만 보인다
    const offBone = res.skeletons[0]
      && res.skeletons[0].bones.find((b) => b.name === 'handslot.l');
    if (offBone) {
      const shield = await loadKitMesh(this.scene, 'shield_round.gltf', { height: 0.62 });
      if (shield) {
        shield.parent = offBone.getTransformNode();
        shield.position.set(0, 0, 0);
        shield.setEnabled(false);
        this.shieldMesh = shield;
      }
    }
  }

  setShieldVisible(on) {
    if (this.shieldMesh && this.shieldMesh.isEnabled() !== on) this.shieldMesh.setEnabled(on);
  }

  // 논리 키에 대응하는 클립의 재생 길이(초)
  _clipLen(key) {
    const name = this.clipMap && this.clipMap[key];
    return (name && this.clipDur && this.clipDur[name]) || this.punchClipDur;
  }

  // key는 논리 동작 이름(idle/walk/run/punch1/sword2/...) — 캐릭터별 클립 맵으로 변환된다
  play(key, force = false, speedOverride = null, fromFrac = 0, toFrac = 1) {
    if (!this.groups || !this.clipMap) return;
    const name = this.clipMap[key] || key;
    const next = this.groups[name];
    if (!next) return;
    if (this.currentKey === key && !force) return;

    const speed = speedOverride !== null ? speedOverride : SPEEDS[key] || 1;
    if (this.currentAction && this.currentAction !== next) this.currentAction.stop();
    if (this.currentAction === next && force) next.stop();
    if (fromFrac > 0 || toFrac < 1) {
      const f0 = next.from + (next.to - next.from) * fromFrac;
      const f1 = next.from + (next.to - next.from) * toFrac;
      next.start(false, speed, f0, f1);
    } else {
      next.start(LOOPING.has(key), speed);
    }
    this.currentAction = next;
    this.currentName = name;
    this.currentKey = key;
  }

  setWeapon(key) {
    if (!WEAPONS[key]) return false;
    this.weapon = key;
    this.comboStep = -1;
    this.comboTimer = 0;

    // 모델 내장 프롭을 쓰는 슬롯이면 그것만 켜고, 아니면 게임이 만든 메시를 켠다
    const props = this.propForWeapon || {};
    for (const [slot, propName] of Object.entries(props)) {
      const mesh = this.builtinProps && this.builtinProps[propName];
      if (mesh) mesh.setEnabled(slot === key);
    }
    if (this.weaponMeshes.sword) {
      this.weaponMeshes.sword.setEnabled(key === 'sword' && !props.sword);
    }
    if (this.weaponMeshes.gun) {
      this.weaponMeshes.gun.setEnabled(key === 'gun' && !props.gun);
    }
    return true;
  }

  // 최대 기력 = 기본 + 레벨 + 체력 스탯 (stats가 갱신될 때 호출된다)
  refreshStamina() {
    const next = Math.round(
      STAMINA_BASE + (stats.level - 1) * STAMINA_PER_LEVEL + stats.attrs.vit * STAMINA_PER_VIT
    );
    const gain = next - this.maxStamina;
    this.maxStamina = next;
    if (gain > 0) this.stamina = Math.min(next, this.stamina + gain);
    this.stamina = Math.min(this.stamina, next);
    setStamina(this.stamina, this.maxStamina, this.exhaustT > 0);
  }

  // 회피 대시 — 이동 중이면 그 방향, 아니면 바라보는 방향으로 파고든다
  tryDodge(moveDir = null) {
    if (this.dodgeCd > 0 || this.dodgeT > 0 || this.dead) return false;
    if (this.stamina < DODGE_COST) return false;
    this.stamina -= DODGE_COST;
    this.staminaIdle = 0;
    const d = this._dodgeDir;
    if (moveDir && moveDir.lengthSquared() > 0.001) {
      d.copyFrom(moveDir).normalize();
    } else {
      d.copyFromFloats(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    }
    this.group.rotation.y = Math.atan2(d.x, d.z);
    this.dodgeT = DODGE_TIME;
    this.dodgeCd = DODGE_CD;
    this.iframe = DODGE_IFRAME;
    this.lockTimer = 0;
    this.comboStep = -1;
    this.comboTimer = 0;
    this.play('dodge', true, 1.5);
    sfx.jump();
    return true;
  }

  takeDamage(amount, dir = null) {
    if (this.iframe > 0) return; // 회피 무적

    // 방패: 공격이 정면에서 왔을 때만 막는다 (dir은 공격자→플레이어 방향)
    let blocked = false;
    if (this.blocking && dir) {
      const fx = Math.sin(this.group.rotation.y);
      const fz = Math.cos(this.group.rotation.y);
      if (-(dir.x * fx + dir.z * fz) > BLOCK_FRONT_DOT) {
        blocked = true;
        amount *= BLOCK_REDUCTION;
        this.play('blockHit', true, 1.4);
        this.lockTimer = Math.max(this.lockTimer, 0.18);
      }
    }

    // 결계 버프: 받는 피해 추가 감소
    if (this.wardT > 0) amount *= this.wardMul;
    // 체력(VIT) 스탯: 받는 피해 감소 (최소 1)
    amount = Math.max(1, Math.round(amount * damageTakenMul()));
    this.hp = Math.max(0, this.hp - amount);
    setHP(this.hp, this.maxHp);
    if (blocked) {
      shake(0.14, 0.12);
      sfx.hit();
    } else {
      flashHurt();
      shake(0.28, 0.2);
      sfx.hurt();
    }
    if (dir) {
      this.knockV.copyFromFloats(dir.x, 0, dir.z);
      this.knockV.scaleInPlace(blocked ? 2 : 6);
    }
    if (this.hp <= 0) {
      this.group.position.set(0, 0, 0);
      this.velY = 0;
      this.knockV.setAll(0);
      this.hp = this.maxHp;
      setHP(this.hp, this.maxHp);
    }
  }

  // 우클릭 술법 — 마법창에서 고른 술법을 시전한다
  castMagic(point, spell = null) {
    if (this.dead) return false;
    const s = spell || { cost: MAGIC_COST, cd: MAGIC_CD, kind: 'bolt', color: '#7fb0ff',
      baseDamage: 14, perLevel: 2, knock: 7, key: 'boltFlame' };
    if ((this.spellCd && this.spellCd[s.key] > 0) || this.magicCd > 0) return false;
    if (this.mp < s.cost) return false;
    if (s.kind === 'bolt' && !this.projectiles) return false;

    this.mp -= s.cost;
    this.magicCd = 0.25;                    // 술법 간 공통 최소 간격
    this.spellCd = this.spellCd || {};
    this.spellCd[s.key] = s.cd;
    this.spellCdMax = this.spellCdMax || {};
    this.spellCdMax[s.key] = s.cd;
    setMP(Math.round(this.mp), this.maxMp);
    const damage = Math.round((s.baseDamage + stats.level * s.perLevel)
      * this.charCfg.magicMul * magicDamageMul());

    // 유성우·시우 — 지정 지점에 여러 번 떨어진다. 이동추종 없음 + 고코스트로 제약
    if (s.kind === 'rain') {
      const dx0 = point.x - this.group.position.x;
      const dz0 = point.z - this.group.position.z;
      const dist0 = Math.hypot(dx0, dz0);
      const k0 = dist0 > s.range ? s.range / dist0 : 1;
      const gx = this.group.position.x + dx0 * k0;
      const gz = this.group.position.z + dz0 * k0;
      this.group.rotation.y = Math.atan2(dx0, dz0);
      this.play('cast', true, 1.6);
      this.lockTimer = 0.45;
      sfx.shoot();
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, gx, gz,
        x: this.group.position.x, z: this.group.position.z, r: this.group.rotation.y });
      if (this.vfx) this.vfx.circle({ x: gx, z: gz }, { radius: s.radius, color: s.color, dur: 1.0 });
      this.rainQueue = this.rainQueue || [];
      this.rainQueue.push({
        x: gx, z: gz, radius: s.radius, damage, knock: s.knock, knockUp: s.knockUp || 0,
        color: s.color, fx: s.fx, left: s.strikes, t: 0, interval: s.interval
      });
      return true;
    }

    // 돌풍격·풍신보 — 앞뒤로 파고들며 길목을 친다
    if (s.kind === 'dash') {
      const back = s.distance < 0;
      if (!back) {
        this.group.rotation.y = Math.atan2(
          point.x - this.group.position.x, point.z - this.group.position.z
        );
      }
      const face = this._face.copyFromFloats(
        Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y)
      );
      const dir = back ? -1 : 1;
      this._dodgeDir.copyFromFloats(face.x * dir, 0, face.z * dir);
      this.dodgeT = 0.3;
      this.iframe = 0.2;
      this.play(back ? 'dodgeBack' : 'dodge', true, 1.4);
      sfx.jump();
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, x: this.group.position.x,
        z: this.group.position.z, r: this.group.rotation.y });
      if (this.vfx) {
        if (s.fx === 'wind') {
          this.vfx.windTrail(this.group.position, this.group.rotation.y, { color: s.color });
        } else {
          this.vfx.gust(this.group.position, this.group.rotation.y, Math.abs(s.distance),
            { color: s.color });
        }
      }
      if (s.hasteDuration) { this.hasteT = s.hasteDuration; this.hasteMul = s.hasteMul; }
      if (damage > 0) {
        const len = Math.abs(s.distance);
        for (const m of (this.nearbyMonsters || [])) {
          if (m.dead) continue;
          const rx = m.group.position.x - this.group.position.x;
          const rz = m.group.position.z - this.group.position.z;
          const along = rx * face.x * dir + rz * face.z * dir;
          if (along < 0 || along > len) continue;
          if (Math.abs(rx * face.z * dir - rz * face.x * dir) > s.width) continue;
          const d = Math.max(0.001, Math.hypot(rx, rz));
          const hdir = { x: rx / d, z: rz / d };
          const relayed = this.reportDamage && this.reportDamage(m, damage, hdir, s.knock, s.knockUp);
          const killed = relayed ? false
            : (this.applyDamage ? this.applyDamage(m, damage, hdir, s.knock, s.knockUp)
                                : m.takeDamage(damage, hdir, s.knock, s.knockUp));
          this.popDamage(m, damage, true);
          if (this.onKill && killed) this.onKill(m);
          if (this.vfx) this.vfx.burst(m.group.position, { size: 1.6, color: s.color, dur: 0.26 });
        }
      }
      return true;
    }

    // 관통시·절족시 — 일직선으로 여러 적을 꿰뚫는다
    if (s.kind === 'pierce') {
      this.group.rotation.y = Math.atan2(
        point.x - this.group.position.x, point.z - this.group.position.z
      );
      const face = this._face.copyFromFloats(
        Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y)
      );
      this.play('shoot', true, 1.5);
      this.lockTimer = 0.3;
      sfx.shoot();
      const origin = this.group.position.clone();
      origin.y += 1.15;
      if (this.onAction) this.onAction({ t: 'shot', ox: origin.x, oy: origin.y, oz: origin.z,
        dx: face.x, dz: face.z, k: 'arrow',
        x: this.group.position.x, z: this.group.position.z, r: this.group.rotation.y });
      if (this.projectiles) {
        this.projectiles.spawnVisual(origin, { x: face.x, z: face.z }, s.color, 'arrow');
      }
      if (this.vfx) {
        if (s.fx === 'snare') {
          this.vfx.burst(origin, { size: 1.2, color: s.color, dur: 0.2 });
        } else {
          this.vfx.lance(origin, { x: face.x, z: face.z }, s.range, { color: s.color });
        }
      }
      const hits = [];
      for (const m of (this.nearbyMonsters || [])) {
        if (m.dead) continue;
        const rx = m.group.position.x - this.group.position.x;
        const rz = m.group.position.z - this.group.position.z;
        const along = rx * face.x + rz * face.z;
        if (along < 0 || along > s.range) continue;
        if (Math.abs(rx * face.z - rz * face.x) > 1.3) continue;
        hits.push({ m, along });
      }
      hits.sort((a, b) => a.along - b.along);
      let dmg = damage;
      for (const h of hits.slice(0, s.maxHits)) {
        const rx = h.m.group.position.x - this.group.position.x;
        const rz = h.m.group.position.z - this.group.position.z;
        const d = Math.max(0.001, Math.hypot(rx, rz));
        const hdir = { x: rx / d, z: rz / d };
        const dd = Math.round(dmg);
        const relayed = this.reportDamage && this.reportDamage(h.m, dd, hdir, s.knock, 0);
        const killed = relayed ? false
          : (this.applyDamage ? this.applyDamage(h.m, dd, hdir, s.knock, 0)
                              : h.m.takeDamage(dd, hdir, s.knock, 0));
        this.popDamage(h.m, dd, true);
        if (s.slowDuration) { h.m.slowT = s.slowDuration; h.m.slowMul = s.slowMul; }
        if (this.onKill && killed) this.onKill(h.m);
        if (this.vfx) {
          this.vfx.burst(h.m.group.position, { size: 1.5, color: s.color, dur: 0.26 });
          if (s.fx === 'snare') this.vfx.snare(h.m.group.position, { radius: 1.9, color: s.color });
        }
        dmg *= s.falloff;
      }
      return true;
    }

    // 연사 — 부채꼴로 여러 발
    if (s.kind === 'spread') {
      this.group.rotation.y = Math.atan2(
        point.x - this.group.position.x, point.z - this.group.position.z
      );
      this.play('shoot', true, 1.5);
      this.lockTimer = 0.32;
      sfx.shoot();
      const half = (s.spreadDeg * Math.PI / 180) / 2;
      for (let i = 0; i < s.count; i++) {
        const a = this.group.rotation.y - half
          + (s.count === 1 ? 0 : (i / (s.count - 1)) * half * 2);
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const origin = this.group.position.clone();
        origin.y += 1.15;
        origin.x += dx * 0.6;
        origin.z += dz * 0.6;
        if (this.projectiles) {
          this.projectiles.spawn(origin, new Vector3(dx, 0, dz), damage, s.knock, s.color, 'arrow');
        }
        if (this.onAction) this.onAction({ t: 'shot', ox: origin.x, oy: origin.y, oz: origin.z,
          dx, dz, k: 'arrow', x: this.group.position.x, z: this.group.position.z,
          r: this.group.rotation.y });
      }
      if (this.vfx) {
        this.vfx.fan(this.group.position, this.group.rotation.y,
          { color: s.color, radius: 4.4 });
      }
      return true;
    }

    // 결계 — 자기 버프. 오라를 두르고 지속 동안 받는 피해를 줄인다
    if (s.kind === 'buff') {
      this.play('cast', true, 1.5);
      this.lockTimer = 0.4;
      sfx.levelup();
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, x: this.group.position.x,
        z: this.group.position.z, r: this.group.rotation.y });
      if (s.damageTakenMul) { this.wardT = s.duration; this.wardMul = s.damageTakenMul; }
      if (s.damageBonus) { this.dmgBuffT = s.duration; this.dmgBuffMul = 1 + s.damageBonus; }
      if (this.vfx) {
        this.wardAura = this.vfx.aura(this.group, { radius: 1.5, color: s.color, dur: s.duration });
        if (s.fx === 'cry') {
          this.vfx.cry(this.group.position, { color: s.color });
        } else {
          this.vfx.circle(this.group.position, { radius: 2.4, color: s.color, dur: 1.1 });
        }
      }
      return true;
    }

    // 빙백진 — 자기중심 폭발. 주변을 얼려 밀쳐낸다
    if (s.kind === 'nova') {
      this.play('cast', true, 1.7);
      this.lockTimer = 0.4;
      sfx.punchHeavy();
      shake(0.3, 0.24);
      const origin = this.group.position;
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, x: origin.x, z: origin.z,
        r: this.group.rotation.y });
      if (this.vfx) {
        if (s.fx === 'whirl') {
          this.vfx.whirl(origin, { radius: s.radius, color: s.color });
        } else if (s.fx === 'quake') {
          this.vfx.quake(origin, { radius: s.radius, color: s.color });
        } else {
          this.vfx.frostNova(origin, { radius: s.radius, color: s.color });
          this.vfx.frostSpikes(origin, s.radius, s.color);
        }
      }
      for (const m of (this.pendingList || this.nearbyMonsters || [])) {
        if (m.dead) continue;
        const dx = m.group.position.x - origin.x;
        const dz = m.group.position.z - origin.z;
        if (dx * dx + dz * dz > s.radius * s.radius) continue;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        const dir = { x: dx / d, z: dz / d };
        const relayed = this.reportDamage && this.reportDamage(m, damage, dir, s.knock, s.knockUp);
        const killed = relayed ? false
          : (this.applyDamage ? this.applyDamage(m, damage, dir, s.knock, s.knockUp)
                              : m.takeDamage(damage, dir, s.knock, s.knockUp));
        this.popDamage(m, damage, true);
        m.slowT = s.slowDuration;
        m.slowMul = s.slowMul;
        if (this.onKill && killed) this.onKill(m);
        if (this.vfx) this.vfx.burst(m.group.position, { size: 1.4, color: s.color, dur: 0.28 });
      }
      return true;
    }

    // 귀뢰 — 가장 가까운 적에서 시작해 인접한 적으로 번개가 튄다
    if (s.kind === 'chain') {
      this.play('cast', true, 1.8);
      this.lockTimer = 0.35;
      sfx.shoot();
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, x: this.group.position.x,
        z: this.group.position.z, r: this.group.rotation.y });
      const pool = (this.nearbyMonsters || []).filter((m) => !m.dead);
      let from = { x: this.group.position.x, z: this.group.position.z };
      const hitSet = new Set();
      let dmg = damage;
      for (let i = 0; i < s.maxChains; i++) {
        const reach = i === 0 ? s.range : s.chainRange;
        let best = null;
        let bd = reach;
        for (const m of pool) {
          if (hitSet.has(m)) continue;
          const d = Math.hypot(m.group.position.x - from.x, m.group.position.z - from.z);
          if (d < bd) { bd = d; best = m; }
        }
        if (!best) break;
        hitSet.add(best);
        if (this.vfx) {
          this.vfx.beam(from, best.group.position, { color: s.color, dur: 0.22 });
          this.vfx.lightning(best.group.position, { color: s.color });
          this.vfx.burst(best.group.position, { size: 1.5, color: s.color, dur: 0.26 });
        }
        const dx = best.group.position.x - from.x;
        const dz = best.group.position.z - from.z;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        const dir = { x: dx / d, z: dz / d };
        const dd = Math.round(dmg);
        const relayed = this.reportDamage && this.reportDamage(best, dd, dir, s.knock, 0);
        const killed = relayed ? false
          : (this.applyDamage ? this.applyDamage(best, dd, dir, s.knock, 0)
                              : best.takeDamage(dd, dir, s.knock, 0));
        this.popDamage(best, dd, i === 0);
        if (this.onKill && killed) this.onKill(best);
        from = { x: best.group.position.x, z: best.group.position.z };
        dmg *= s.falloff;
      }
      if (hitSet.size === 0) {
        // 맞은 적이 없으면 자원을 돌려준다
        this.mp += s.cost;
        this.spellCd[s.key] = 0;
        setMP(Math.round(this.mp), this.maxMp);
        return false;
      }
      return true;
    }

    // 지정 지점 술법: 바닥 마법진을 깔고 장판을 남긴다
    if (s.kind === 'ground') {
      const dx = point.x - this.group.position.x;
      const dz = point.z - this.group.position.z;
      const dist = Math.hypot(dx, dz);
      const k = dist > s.range ? s.range / dist : 1;
      const gx = this.group.position.x + dx * k;
      const gz = this.group.position.z + dz * k;
      this.group.rotation.y = Math.atan2(dx, dz);
      this.play('cast', true, 1.6);
      this.lockTimer = 0.45;
      sfx.shoot();
      if (this.onAction) this.onAction({ t: 'spell', k: s.key, gx, gz,
        x: this.group.position.x, z: this.group.position.z, r: this.group.rotation.y });
      if (this.vfx) {
        // 시전 순간 마법진이 잠깐 돌고, 그 자리에 불바다가 남는다
        this.vfx.circle({ x: gx, z: gz }, { radius: s.radius, color: s.color, dur: 0.9 });
        this.vfx.fireField({ x: gx, z: gz }, { radius: s.radius, color: s.color, dur: s.duration });
      }
      if (this.groundAreas) {
        this.groundAreas.push({
          x: gx, z: gz, radius: s.radius, damage, knock: s.knock, color: s.color,
          t: s.duration, tick: 0, interval: s.tickInterval
        });
      }
      return true;
    }

    this.group.rotation.y = Math.atan2(
      point.x - this.group.position.x,
      point.z - this.group.position.z
    );
    const face = this._face.copyFromFloats(
      Math.sin(this.group.rotation.y),
      0,
      Math.cos(this.group.rotation.y)
    );

    this.play('cast', true, 1.8);
    this.lockTimer = 0.35;
    this.currentLunge = 0;
    this.lungeUntil = 0;
    sfx.shoot();

    const origin = this.group.position.clone();
    origin.y += 1.15;
    origin.x += face.x * 0.6;
    origin.z += face.z * 0.6;
    if (this.onAction) this.onAction({ t: 'bolt', ox: origin.x, oy: origin.y, oz: origin.z,
      dx: face.x, dz: face.z, c: s.color, x: this.group.position.x, z: this.group.position.z,
      r: this.group.rotation.y });
    if (this.vfx) {
      this.vfx.burst(origin, { size: 1.1, color: s.color, dur: 0.22 });
      this.vfx.circle(this.group.position, { radius: 1.5, color: s.color, dur: 0.5 });
      this.vfx.sparks({ x: origin.x, y: 0.3, z: origin.z },
        { count: 8, color: s.color, power: 4, size: 0.2, spread: 'up' });
    }
    this.projectiles.spawn(origin, face.clone(), damage, s.knock, s.color);
    return true;
  }

  // 유성우·시우 — 예고된 지점에 순차로 떨어진다
  updateRain(delta, monsters, onHit) {
    if (!this.rainQueue || !this.rainQueue.length) return;
    for (let i = this.rainQueue.length - 1; i >= 0; i--) {
      const r = this.rainQueue[i];
      r.t -= delta;
      if (r.t > 0) continue;
      r.t = r.interval;
      r.left -= 1;
      // 지정 범위 안에서 조금씩 흩어져 떨어진다
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r.radius * 0.8;
      const hx = r.x + Math.cos(a) * rr;
      const hz = r.z + Math.sin(a) * rr;
      if (this.vfx) {
        // 유성우는 불덩이가 떨어지고, 시우는 화살이 촘촘히 꽂힌다
        if (r.fx === 'arrows') {
          this.vfx.arrowFall({ x: hx, z: hz }, { color: r.color, count: 6, radius: 1.9 });
        } else {
          this.vfx.meteor({ x: hx, z: hz }, { color: r.color, size: 2.4 });
        }
      }
      for (const m of monsters) {
        if (m.dead) continue;
        const dx = m.group.position.x - hx;
        const dz = m.group.position.z - hz;
        if (dx * dx + dz * dz > 2.1 * 2.1) continue;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        const dir = { x: dx / d, z: dz / d };
        const relayed = this.reportDamage && this.reportDamage(m, r.damage, dir, r.knock, r.knockUp);
        const killed = relayed ? false
          : (this.applyDamage ? this.applyDamage(m, r.damage, dir, r.knock, r.knockUp)
                              : m.takeDamage(r.damage, dir, r.knock, r.knockUp));
        this.popDamage(m, r.damage, true);
        if (onHit && !relayed) onHit(m, killed);
      }
      if (r.left <= 0) this.rainQueue.splice(i, 1);
    }
  }

  // 장판 술법 유지 — 주기마다 범위 안의 적을 태운다
  updateGroundAreas(delta, monsters, onHit) {
    if (!this.groundAreas) return;
    for (let i = this.groundAreas.length - 1; i >= 0; i--) {
      const a = this.groundAreas[i];
      a.t -= delta;
      a.tick -= delta;
      if (a.tick <= 0) {
        a.tick = a.interval;
        if (this.vfx) {
          this.vfx.sparks({ x: a.x, y: 0, z: a.z },
            { count: 8, color: a.color, power: 4.5, size: 0.26, spread: 'up' });
        }
        for (const m of monsters) {
          if (m.dead) continue;
          const dx = m.group.position.x - a.x;
          const dz = m.group.position.z - a.z;
          if (dx * dx + dz * dz > a.radius * a.radius) continue;
          const d = Math.max(0.001, Math.hypot(dx, dz));
          const dir = { x: dx / d, z: dz / d };
          const relayed = this.reportDamage && this.reportDamage(m, a.damage, dir, a.knock, 0);
          const killed = relayed ? false
            : (this.applyDamage ? this.applyDamage(m, a.damage, dir, a.knock, 0)
                                : m.takeDamage(a.damage, dir, a.knock, 0));
          this.popDamage(m, a.damage, false);
          if (onHit && !relayed) onHit(m, killed);
        }
      }
      if (a.t <= 0) this.groundAreas.splice(i, 1);
    }
  }

  _dmgMul(weaponKey) {
    const w = WEAPONS[weaponKey];
    return w && w.type === 'ranged' ? this.charCfg.rangedMul : this.charCfg.meleeMul;
  }

  tryAttack(input, monsters, camRig = null, facePoint = null) {
    if (this.attackCd > 0 || this.blocking || this.dodgeT > 0) return;
    if (!input.consumeAttack()) return;

    const w = applyWeaponSkills(WEAPONS[this.weapon], this.weapon, stats.skills);
    const aspd = attackSpeedMul(); // 민첩: 공격 속도
    this.attackCd = w.cd / aspd;

    if (facePoint) {
      this.group.rotation.y = Math.atan2(
        facePoint.x - this.group.position.x,
        facePoint.z - this.group.position.z
      );
    } else if (camRig) {
      const f = camRig.flatForward();
      this.group.rotation.y = Math.atan2(f.x, f.z);
    }
    const face = this._face.copyFromFloats(
      Math.sin(this.group.rotation.y),
      0,
      Math.cos(this.group.rotation.y)
    );

    if (w.type === 'ranged') {
      // 석궁 장전 숙련 — 레벨이 낮으면 느리게, 오를수록 빨라진다
      const reloadMul = Math.max(0.55, Math.min(1.9, 1.9 - stats.level * 0.09));
      this.attackCd = (w.cd * reloadMul) / aspd;
      this.play('shoot', true, w.animScale / reloadMul);
      this.lockTimer = 0.14 * reloadMul;
      this.currentLunge = 0;
      this.lungeUntil = 0;
      sfx.shoot();
      if (this.projectiles) {
        const origin = this.group.position.clone();
        origin.y += 1.15;
        origin.x += face.x * 0.6;
        origin.z += face.z * 0.6;
        this.projectiles.spawn(
          origin, face.clone(),
          Math.round(weaponDamage(w.damage, this.weapon) * this._dmgMul(this.weapon)),
          w.knock, '#ffd666', w.projectile || 'bolt'
        );
        if (this.vfx) {
          this.vfx.burst(origin, { size: 0.9, color: '#ffd666', dur: 0.16 });
          this.vfx.sparks(origin, { count: 6, color: '#ffe9a8', power: 3, size: 0.16 });
        }
        if (this.onAction) this.onAction({ t: 'shot', ox: origin.x, oy: origin.y, oz: origin.z,
          dx: face.x, dz: face.z, k: w.projectile || 'bolt',
          x: this.group.position.x, z: this.group.position.z, r: this.group.rotation.y });
      }
      this.knockV.x -= face.x * 0.9;
      this.knockV.z -= face.z * 0.9;
    } else if (this.weapon === 'punch') {
      const step = this.comboTimer > 0 ? (this.comboStep + 1) % PUNCH_COMBO.length : 0;
      const st = PUNCH_COMBO[step];
      this.comboStep = step;
      this.comboTimer = COMBO_WINDOW;
      this.pendingComboStep = step;
      this.pendingIsFinisher = step === FINISHER_STEP;

      const fin = step === FINISHER_STEP ? finisherMods(stats.skills) : { dmgMul: 1, knockMul: 1 };
      const a = st.anim;
      const fromFrac = a.fromFrac || 0;
      const toFrac = a.toFrac !== undefined ? a.toFrac : 1;
      const clipDur = this._clipLen(a.key);
      const sliceDur = clipDur * (toFrac - fromFrac) / (a.speed * aspd);

      this.attackCd = st.cd / aspd;
      this.lockTimer = sliceDur;
      this.currentLunge = st.lunge;
      this.lungeUntil = this.lockTimer - 0.25;
      this.pendingHit = Math.min(w.hitDelay, sliceDur * 0.45);
      this.pendingList = monsters;
      this.pendingWeapon = {
        ...w,
        damage: Math.round(w.damage * st.dmgMul * fin.dmgMul),
        knock: st.knock * fin.knockMul,
        knockUp: st.knockUp || 0
      };
      this.pendingWeaponKey = this.weapon;
      this.play(a.key, true, a.speed * aspd, fromFrac, toFrac);
      if (step === FINISHER_STEP) sfx.punchHeavy();
      else sfx.punch();
    } else {
      // 퇴마검 2단 연계: 찌르기 → 가로베기
      const step = this.comboTimer > 0 ? (this.comboStep + 1) % SWORD_COMBO.length : 0;
      const st = SWORD_COMBO[step];
      this.comboStep = step;
      this.comboTimer = COMBO_WINDOW;
      this.pendingComboStep = step;
      this.pendingIsFinisher = step === SWORD_FINISHER;

      const a = st.anim;
      const fromFrac = a.fromFrac || 0;
      const toFrac = a.toFrac !== undefined ? a.toFrac : 1;
      const clipDur = this._clipLen(a.key);
      const sliceDur = clipDur * (toFrac - fromFrac) / (a.speed * aspd);

      this.attackCd = st.cd / aspd;
      this.lockTimer = sliceDur;
      this.currentLunge = st.lunge;
      this.lungeUntil = this.lockTimer - 0.25;
      this.pendingHit = Math.min(w.hitDelay / aspd, sliceDur * 0.45);
      this.pendingList = monsters;
      this.pendingWeapon = {
        ...w,
        damage: Math.round(w.damage * st.dmgMul),
        knock: st.knock,
        knockUp: st.knockUp || 0,
        arcDot: st.arcDot,          // 찌르기는 좁게, 베기는 넓게
        range: w.range * st.rangeMul
      };
      this.pendingWeaponKey = this.weapon;
      this.play(a.key, true, a.speed * aspd, fromFrac, toFrac);
      if (this.onAction) this.onAction({ t: 'atk', k: a.key, s: a.speed * aspd,
        f: fromFrac, o: toFrac, x: this.group.position.x, z: this.group.position.z,
        r: this.group.rotation.y, w: this.weapon });
      this.trail.start();
      // E. 검기 — 휘두르는 궤적을 부채꼴로 표시 (STACK.md §9 우선순위 2)
      if (this.vfx) {
        this.vfx.slash(this.group.position, this.group.rotation.y,
          { radius: w.range * 1.05, color: '#cfe4ff', dur: 0.24 });
      }
      sfx.swing();
    }
  }

  // 몬스터 머리 위 화면 좌표에 피해 숫자를 띄운다
  popDamage(monster, amount, crit = false) {
    const scene = this.scene;
    const cam = scene.activeCameras && scene.activeCameras[0];
    if (!cam) return;
    const engine = scene.getEngine();
    const p = monster.group.position;
    // 미니맵 카메라가 마지막에 렌더되므로 scene.getTransformMatrix() 대신 메인 카메라 행렬을 쓴다
    const vp = cam.getViewMatrix().multiply(cam.getProjectionMatrix());
    const ndc = Vector3.TransformCoordinates(new Vector3(p.x, p.y + 1.9, p.z), vp);
    if (ndc.z < 0 || ndc.z > 1) return;
    const canvas = engine.getRenderingCanvas();
    const rect = canvas.getBoundingClientRect();
    const x = (ndc.x * 0.5 + 0.5) * rect.width;
    const y = (0.5 - ndc.y * 0.5) * rect.height;
    showDamage(Math.round(x), Math.round(y), amount, crit);
  }

  _applyHit() {
    const monsters = this.pendingList || [];
    const w = this.pendingWeapon || WEAPONS.punch;
    const fwd = this._face.copyFromFloats(
      Math.sin(this.group.rotation.y),
      0,
      Math.cos(this.group.rotation.y)
    );
    const wKeyNow = this.pendingWeaponKey || this.weapon;
    const finisherHit =
      (wKeyNow === 'punch' && this.pendingComboStep === FINISHER_STEP) ||
      (wKeyNow === 'sword' && this.pendingComboStep === SWORD_FINISHER);
    let hitAny = false;
    for (const m of monsters) {
      if (m.dead) continue;
      const to = this._right.copyFrom(m.group.position).subtractInPlace(this.group.position);
      to.y = 0;
      const dist = to.length();
      if (dist > w.range) continue;
      if (dist > 0.4) {
        to.normalize();
        if (Vector3.Dot(to, fwd) < w.arcDot) continue;
      }
      const wKey = this.pendingWeaponKey || this.weapon;
      const buff = this.dmgBuffT > 0 ? this.dmgBuffMul : 1;
      const dealt = Math.round(weaponDamage(w.damage, wKey) * this._dmgMul(wKey) * buff);
      // 멀티: 판정은 호스트가 한다. 비호스트는 보고만 하고 숫자는 띄운다.
      const relayed = this.reportDamage && this.reportDamage(m, dealt, fwd, w.knock, w.knockUp || 0);
      const killed = relayed ? false
        : (this.applyDamage
            ? this.applyDamage(m, dealt, fwd, w.knock, w.knockUp || 0)
            : m.takeDamage(dealt, fwd, w.knock, w.knockUp || 0));
      this.popDamage(m, dealt, this.pendingIsFinisher);
      hitAny = true;
      // D. 타격 이펙트 — 무기별 색
      if (this.vfx) {
        const key = this.pendingWeaponKey || this.weapon;
        const color = key === 'punch' ? '#ffd23e' : key === 'sword' ? '#cfe4ff' : '#ffb03a';
        this.vfx.burst(m.group.position, { size: finisherHit ? 2.4 : 1.5, color });
      }
      if (killed) {
        hitstop(0.12);
        shake(0.3, 0.22);
        sfx.kill();
        if (this.onKill) this.onKill(m);
      } else {
        sfx.hit();
      }
    }
    if (hitAny) {
      const key = this.pendingWeaponKey || this.weapon;
      const isPunch = key === 'punch';
      const isSword = key === 'sword';
      const finisher =
        (isPunch && this.pendingComboStep === FINISHER_STEP) ||
        (isSword && this.pendingComboStep === SWORD_FINISHER);
      hitstop(finisher ? 0.09 : 0.05);
      if (finisher) shake(0.22, 0.18);
      if (isPunch || isSword) {
        showCombo(this.pendingComboStep + 1, finisher, isPunch ? '붕권' : '가로베기');
      }
    }
  }

  update(delta, input, camRig) {
    if (this.pendingHit >= 0) {
      this.pendingHit -= delta;
      if (this.pendingHit < 0) this._applyHit();
    }

    const dir = this._dir.setAll(0);
    const fwd = camRig.flatForward();
    Vector3.CrossToRef(fwd, UP, this._right);
    const right = this._right;

    if (input.pressed('KeyW')) dir.addInPlace(fwd);
    if (input.pressed('KeyS')) dir.subtractInPlace(fwd);
    if (input.pressed('KeyD')) dir.addInPlace(right);
    if (input.pressed('KeyA')) dir.subtractInPlace(right);

    if (dir.lengthSquared() > 0) {
      this.moveTarget = null;
      this.attackTarget = null;
    } else if (this.moveTarget) {
      const mdx = this.moveTarget.x - this.group.position.x;
      const mdz = this.moveTarget.z - this.group.position.z;
      if (mdx * mdx + mdz * mdz < 0.16) {
        this.moveTarget = null;
      } else {
        dir.copyFromFloats(mdx, 0, mdz);
      }
    }

    const moving = dir.lengthSquared() > 0;
    // 기력이 있어야 달릴 수 있다. 바닥나면 잠시 달리기가 잠긴다
    const wantRun = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    const running = wantRun && moving && this.exhaustT <= 0 && this.stamina > 0;
    if (running) {
      this.stamina = Math.max(0, this.stamina - RUN_DRAIN * delta);
      this.staminaIdle = 0;
      if (this.stamina <= 0) this.exhaustT = EXHAUST_LOCK;
    }
    this.speedFov = running && this.onGround ? 0.16 : 0;

    // 회피 대시 입력 (Space) — 대시 중에는 다른 이동을 받지 않는다
    if (input.consumeDodge && input.consumeDodge()) this.tryDodge(moving ? dir : null);

    // 방어 유지 (마우스 가운데 버튼 또는 C) — 대시 중에는 방어 불가
    const wantBlock = this.dodgeT <= 0 && input.pressed('KeyC');
    if (wantBlock !== this.blocking) {
      this.blocking = wantBlock;
      if (wantBlock) {
        this.comboStep = -1;
        this.comboTimer = 0;
      }
    }
    if (this.blocking) this.setShieldVisible(true);
    else this.setShieldVisible(false);

    const move = this._move.setAll(0);
    if (this.dodgeT > 0) {
      this.dodgeT -= delta;
      const ease = Math.max(0.25, this.dodgeT / DODGE_TIME);
      move.x = this._dodgeDir.x * DODGE_SPEED * ease * delta;
      move.z = this._dodgeDir.z * DODGE_SPEED * ease * delta;
      this.speedFov = 0.2;
    } else if (moving) {
      dir.normalize();
      const run = this.blocking ? BLOCK_MOVE_MUL : (running ? 2.1 : 1);
      move.copyFrom(dir).scaleInPlace(
        this.walkSpeed * moveSpeedMul(stats.skills) * moveSpeedAttrMul()
          * (this.hasteT > 0 ? this.hasteMul : 1) * run * delta
      );
      if (this.lockTimer > 0) move.scaleInPlace(0.45);

      if (this.lockTimer <= 0) {
        const target = Math.atan2(dir.x, dir.z);
        let diff = target - this.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.group.rotation.y += diff * Math.min(1, delta * 16);
      }
    }

    if (this.currentLunge > 0 && this.lockTimer > this.lungeUntil) {
      const face = this._face.copyFromFloats(
        Math.sin(this.group.rotation.y),
        0,
        Math.cos(this.group.rotation.y)
      );
      move.x += face.x * this.currentLunge * delta;
      move.z += face.z * this.currentLunge * delta;
    }

    if (this.knockV.lengthSquared() > 0.02) {
      move.x += this.knockV.x * delta;
      move.z += this.knockV.z * delta;
      this.knockV.scaleInPlace(Math.exp(-7 * delta));
    }

    // Space는 회피 대시에 배정 — 점프는 사용하지 않는다

    const pos = this.group.position;
    pos.x += move.x;
    pos.z += move.z;
    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.5, this.obstacles);

    if (!this.onGround) {
      this.velY -= GRAVITY * delta;
      pos.y += this.velY * delta;
      if (pos.y <= 0) {
        pos.y = 0;
        this.velY = 0;
        this.onGround = true;
        sfx.land();
      }
    }

    this.attackCd = Math.max(0, this.attackCd - delta);
    this.magicCd = Math.max(0, this.magicCd - delta);
    this.dodgeCd = Math.max(0, this.dodgeCd - delta);
    this.iframe = Math.max(0, this.iframe - delta);
    this.exhaustT = Math.max(0, this.exhaustT - delta);
    // 잠깐 쉬면 기력이 차오른다
    if (!running) {
      this.staminaIdle += delta;
      if (this.staminaIdle > STAMINA_REGEN_DELAY && this.stamina < this.maxStamina) {
        this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * delta);
      }
    }
    setStamina(this.stamina, this.maxStamina, this.exhaustT > 0);
    if (this.spellCd) {
      for (const k of Object.keys(this.spellCd)) {
        this.spellCd[k] = Math.max(0, this.spellCd[k] - delta);
      }
    }
    if (this.wardT > 0) {
      this.wardT -= delta;
      if (this.wardT <= 0) this.wardAura = null;   // VFX가 스스로 회수한다
    }
    if (this.dmgBuffT > 0) this.dmgBuffT -= delta;
    if (this.hasteT > 0) this.hasteT -= delta;
    if (this.mp < this.maxMp) {
      this.mp = Math.min(this.maxMp, this.mp + this.charCfg.mpRegen * delta);
      setMP(Math.round(this.mp), this.maxMp);
    }
    this.lockTimer = Math.max(0, this.lockTimer - delta);
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) this.comboStep = -1;
    }

    if (this.groups && this.onGround && this.lockTimer <= 0 && this.dodgeT <= 0) {
      if (this.blocking) this.play('block');
      else if (moving && running) this.play('run');
      else if (moving) this.play('walk');
      else this.play('idle');
    }
    this._updateTrail(delta);
  }

  // 칼날의 뿌리·끝 월드 좌표를 매 프레임 궤적에 기록
  _updateTrail(delta) {
    const sword = this.weaponMeshes && this.weaponMeshes.sword;
    if (sword && sword.isEnabled() && this.trail.life > 0) {
      const m = sword.getWorldMatrix();
      Vector3.TransformCoordinatesFromFloatsToRef(0, 0.25, 0, m, this._baseTmp);
      Vector3.TransformCoordinatesFromFloatsToRef(0, SWORD_TIP_Y, 0, m, this._tipTmp);
      this.trail.emit(this._baseTmp, this._tipTmp);
    }
    this.trail.update(delta);
  }
}
