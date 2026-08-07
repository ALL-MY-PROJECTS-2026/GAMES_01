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
import { WEAPONS, makeSwordMesh, makeGunMesh } from './weapons.js';
import { setHP, setMP, showCombo } from '../ui/hud.js';
import { weaponDamage, stats } from '../core/stats.js';
import { applyWeaponSkills, moveSpeedMul, finisherMods } from '../core/skills.js';
import { CHARACTERS } from '../core/characters.js';
import { sfx } from '../core/sfx.js';

const UP = new Vector3(0, 1, 0);
const GRAVITY = 30;
const JUMP_SPEED = 9.5;
const MAGIC_COST = 20;
const MAGIC_CD = 0.8;
const COMBO_WINDOW = 1.1;
// 권법 5단 연계: 잽 → 잽 → 훅 → 어퍼 → 붕권(마무리)
const PUNCH_COMBO = [
  { dmgMul: 0.8, knock: 3, cd: 0.26, lunge: 3.6, animSpeed: 2.4 },
  { dmgMul: 0.9, knock: 3.5, cd: 0.26, lunge: 3.8, animSpeed: 2.4 },
  { dmgMul: 1.05, knock: 5, cd: 0.3, lunge: 4.2, animSpeed: 2.2 },
  { dmgMul: 1.25, knock: 7, cd: 0.34, lunge: 4.6, animSpeed: 2.0 },
  { dmgMul: 2.0, knock: 18, cd: 0.6, lunge: 6.0, animSpeed: 1.6 }
];
const FINISHER_STEP = PUNCH_COMBO.length - 1;
const LOOPING = new Set(['Idle', 'Walking', 'Running']);
const SPEEDS = { Idle: 1, Walking: 1.2, Running: 1.25, Jump: 1.25, Punch: 2.0 };

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

    this.knockV = new Vector3(0, 0, 0);
    this._dir = new Vector3(0, 0, 0);
    this._right = new Vector3(0, 0, 0);
    this._move = new Vector3(0, 0, 0);
    this._face = new Vector3(0, 0, 0);

    this._loadModel(shadow);
  }

  async _loadModel(shadow) {
    const res = await SceneLoader.ImportMeshAsync('', 'models/', 'character.glb', this.scene);
    const rootMesh = res.meshes[0];

    this.model = new TransformNode('playerModel', this.scene);
    this.model.parent = this.group;
    rootMesh.parent = this.model;

    const { min, max } = rootMesh.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = 1.9 / h;
    this.modelScale = scale;
    this.model.scaling.setAll(scale);
    this.model.position.y = -min.y * scale;

    const tint = this.charCfg.tint ? Color3.FromHexString(this.charCfg.tint) : null;
    const tinted = new Set();
    for (const m of res.meshes) {
      if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m);
      const mat = m.material;
      if (tint && mat && !tinted.has(mat)) {
        tinted.add(mat);
        if (mat.albedoColor) mat.albedoColor = mat.albedoColor.multiply(tint);
        else if (mat.diffuseColor) mat.diffuseColor = mat.diffuseColor.multiply(tint);
      }
    }

    this.groups = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.groups[g.name] = g;
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.1;
      }
    }
    const punch = this.groups.Punch;
    if (punch) {
      const anim = punch.targetedAnimations[0] ? punch.targetedAnimations[0].animation : null;
      const fps = anim ? anim.framePerSecond : 60;
      this.punchClipDur = (punch.to - punch.from) / fps;
    }

    this.placeholder.dispose();
    this.placeholder = null;
    this.play('Idle');

    const hand =
      this.scene.getTransformNodeByName('Hand.R') ||
      this.scene.getTransformNodeByName('HandR') ||
      this.scene.getTransformNodeByName('Hand.L') ||
      this.scene.getTransformNodeByName('LowerArm.R');
    const sword = makeSwordMesh(this.scene);
    const gun = makeGunMesh(this.scene);
    if (hand) {
      const inv = 1 / scale;
      for (const w of [sword, gun]) {
        w.parent = hand;
        w.scaling.setAll(inv);
      }
      sword.position.set(0, 0.25 / scale, 0);
      sword.rotation.set(Math.PI / 2, 0, 0);
      gun.position.set(0, 0.22 / scale, 0.05 / scale);
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
  }

  play(name, force = false, speedOverride = null) {
    if (!this.groups) return;
    const next = this.groups[name];
    if (!next) return;
    if (this.currentName === name && !force) return;

    const speed = speedOverride !== null ? speedOverride : SPEEDS[name] || 1;
    if (this.currentAction && this.currentAction !== next) this.currentAction.stop();
    if (this.currentName === name && force) next.stop();
    next.start(LOOPING.has(name), speed);
    this.currentAction = next;
    this.currentName = name;
  }

  setWeapon(key) {
    if (!WEAPONS[key]) return false;
    this.weapon = key;
    this.comboStep = -1;
    this.comboTimer = 0;
    if (this.weaponMeshes.sword) this.weaponMeshes.sword.setEnabled(key === 'sword');
    if (this.weaponMeshes.gun) this.weaponMeshes.gun.setEnabled(key === 'gun');
    return true;
  }

  takeDamage(amount, dir = null) {
    this.hp = Math.max(0, this.hp - amount);
    setHP(this.hp, this.maxHp);
    sfx.hurt();
    if (dir) {
      this.knockV.copyFromFloats(dir.x, 0, dir.z);
      this.knockV.scaleInPlace(6);
    }
    if (this.hp <= 0) {
      this.group.position.set(0, 0, 0);
      this.velY = 0;
      this.knockV.setAll(0);
      this.hp = this.maxHp;
      setHP(this.hp, this.maxHp);
    }
  }

  // 우클릭 술법: 청염탄 — MP 소모, 원거리 즉시 시전
  castMagic(point) {
    if (this.magicCd > 0 || this.dead) return false;
    if (this.mp < MAGIC_COST) return false;
    if (!this.projectiles) return false;

    this.mp -= MAGIC_COST;
    this.magicCd = MAGIC_CD;
    setMP(Math.round(this.mp), this.maxMp);

    this.group.rotation.y = Math.atan2(
      point.x - this.group.position.x,
      point.z - this.group.position.z
    );
    const face = this._face.copyFromFloats(
      Math.sin(this.group.rotation.y),
      0,
      Math.cos(this.group.rotation.y)
    );

    this.play('Wave', true, 1.8);
    this.lockTimer = 0.35;
    this.currentLunge = 0;
    this.lungeUntil = 0;
    sfx.shoot();

    const origin = this.group.position.clone();
    origin.y += 1.15;
    origin.x += face.x * 0.6;
    origin.z += face.z * 0.6;
    const damage = Math.round((14 + stats.level * 2) * this.charCfg.magicMul);
    this.projectiles.spawn(origin, face.clone(), damage, 7, '#7fb0ff');
    return true;
  }

  _dmgMul(weaponKey) {
    const w = WEAPONS[weaponKey];
    return w && w.type === 'ranged' ? this.charCfg.rangedMul : this.charCfg.meleeMul;
  }

  tryAttack(input, monsters, camRig = null, facePoint = null) {
    if (this.attackCd > 0) return;
    if (!input.consumeAttack()) return;

    const w = applyWeaponSkills(WEAPONS[this.weapon], this.weapon, stats.skills);
    this.attackCd = w.cd;

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

    this.play('Punch', true, w.animScale);

    if (w.type === 'ranged') {
      this.lockTimer = 0.14;
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
          w.knock
        );
      }
      this.knockV.x -= face.x * 0.9;
      this.knockV.z -= face.z * 0.9;
    } else if (this.weapon === 'punch') {
      const step = this.comboTimer > 0 ? (this.comboStep + 1) % PUNCH_COMBO.length : 0;
      const st = PUNCH_COMBO[step];
      this.comboStep = step;
      this.comboTimer = COMBO_WINDOW;
      this.pendingComboStep = step;

      const fin = step === FINISHER_STEP ? finisherMods(stats.skills) : { dmgMul: 1, knockMul: 1 };
      this.attackCd = st.cd;
      this.lockTimer = this.punchClipDur / st.animSpeed;
      this.currentLunge = st.lunge;
      this.lungeUntil = this.lockTimer - 0.25;
      this.pendingHit = w.hitDelay;
      this.pendingList = monsters;
      this.pendingWeapon = {
        ...w,
        damage: Math.round(w.damage * st.dmgMul * fin.dmgMul),
        knock: st.knock * fin.knockMul
      };
      this.pendingWeaponKey = this.weapon;
      this.play('Punch', true, st.animSpeed);
      if (step === FINISHER_STEP) sfx.punchHeavy();
      else sfx.punch();
    } else {
      this.lockTimer = this.punchClipDur / w.animScale;
      this.currentLunge = w.lunge;
      this.lungeUntil = this.lockTimer - 0.25;
      this.pendingHit = w.hitDelay;
      this.pendingList = monsters;
      this.pendingWeapon = w;
      this.pendingWeaponKey = this.weapon;
      sfx.swing();
    }
  }

  _applyHit() {
    const monsters = this.pendingList || [];
    const w = this.pendingWeapon || WEAPONS.punch;
    const fwd = this._face.copyFromFloats(
      Math.sin(this.group.rotation.y),
      0,
      Math.cos(this.group.rotation.y)
    );
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
      const killed = m.takeDamage(
        Math.round(weaponDamage(w.damage, wKey) * this._dmgMul(wKey)),
        fwd,
        w.knock
      );
      hitAny = true;
      if (killed) {
        sfx.kill();
        if (this.onKill) this.onKill(m);
      } else {
        sfx.hit();
      }
    }
    if (hitAny && (this.pendingWeaponKey || this.weapon) === 'punch') {
      showCombo(this.pendingComboStep + 1, this.pendingComboStep === FINISHER_STEP);
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
    const running = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    this.speedFov = moving && running && this.onGround ? 0.16 : 0;

    const move = this._move.setAll(0);
    if (moving) {
      dir.normalize();
      const run = running ? 2.1 : 1;
      move.copyFrom(dir).scaleInPlace(this.walkSpeed * moveSpeedMul(stats.skills) * run * delta);
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

    if (this.onGround && input.pressed('Space')) {
      this.velY = JUMP_SPEED;
      this.onGround = false;
      this.play('Jump', true);
      sfx.jump();
    }

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
    if (this.mp < this.maxMp) {
      this.mp = Math.min(this.maxMp, this.mp + this.charCfg.mpRegen * delta);
      setMP(Math.round(this.mp), this.maxMp);
    }
    this.lockTimer = Math.max(0, this.lockTimer - delta);
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) this.comboStep = -1;
    }

    if (this.groups && this.onGround && this.lockTimer <= 0) {
      if (moving && running) this.play('Running');
      else if (moving) this.play('Walking');
      else this.play('Idle');
    }
  }
}
