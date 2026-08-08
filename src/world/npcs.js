import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  Mesh,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const INTERACT_RANGE = 2.6;

function lambert(scene, name, hex) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

export function makeNameLabel(scene, name) {
  const tex = new DynamicTexture('label-' + name, { width: 256, height: 64 }, scene, true);
  tex.hasAlpha = true;
  const g = tex.getContext();
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(40, 30, 15, 0.55)';
  g.beginPath();
  g.roundRect(48, 8, 160, 48, 12);
  g.fill();
  g.font = '28px "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffe98a';
  g.fillText(name, 128, 34);
  tex.update();

  const mat = new StandardMaterial('labelMat-' + name, scene);
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane('labelPlane', { width: 2.4, height: 0.6 }, scene);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  return plane;
}

class NPC {
  constructor(scene, shadow, { name, role, color, x, z, lines, model }) {
    this.name = name;
    this.role = role;
    this.lines = lines;
    this.scene = scene;
    this.group = new TransformNode('npc-' + name, scene);

    if (model) {
      this._loadModel(shadow, model);
      const label = makeNameLabel(scene, name);
      label.position.y = 2.4;
      label.parent = this.group;
      this.group.position.set(x, 0, z);
      return;
    }

    const body = MeshBuilder.CreateCylinder(
      'npcBody',
      { diameterTop: 0.84, diameterBottom: 1.1, height: 1.3, tessellation: 10 },
      scene
    );
    body.material = lambert(scene, 'npcBodyMat' + name, color);
    body.position.y = 0.65;
    body.parent = this.group;

    const head = MeshBuilder.CreateSphere('npcHead', { diameter: 0.64, segments: 12 }, scene);
    head.material = lambert(scene, 'npcHead' + name, '#ffe3c8');
    head.position.y = 1.62;
    head.parent = this.group;

    const hat = MeshBuilder.CreateCylinder(
      'npcHat',
      { diameterTop: 0, diameterBottom: 0.84, height: 0.5, tessellation: 10 },
      scene
    );
    hat.material = lambert(scene, 'npcHat' + name, '#8a6b3a');
    hat.position.y = 1.95;
    hat.parent = this.group;

    if (shadow) {
      shadow.addShadowCaster(body);
      shadow.addShadowCaster(head);
    }

    const label = makeNameLabel(scene, name);
    label.position.y = 2.5;
    label.parent = this.group;

    this.group.position.set(x, 0, z);
  }

  async _loadModel(shadow, cfg) {
    const res = await SceneLoader.ImportMeshAsync('', 'models/', cfg.file, this.scene);
    const root = res.meshes[0];
    const holder = new TransformNode('npcModel-' + this.name, this.scene);
    holder.parent = this.group;
    root.parent = holder;

    const { min, max } = root.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = (cfg.height || 1.8) / h;
    holder.scaling.setAll(scale);
    holder.position.y = -min.y * scale;

    const keep = cfg.props || [];
    for (const m of res.meshes) {
      if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m);
      const parent = m.parent && m.parent.name;
      if (parent && /^handslot/i.test(parent)) m.setEnabled(keep.includes(m.name));
    }

    // NPC는 이동하지 않지만, 혼자 있을 때와 사람이 올 때의 자세는 다르다
    this.anims = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.anims[g.name] = g;
    }
    this.restClip = cfg.rest || cfg.idle || 'Idle';   // 아무도 없을 때
    this.idleClip = cfg.idle || 'Idle';               // 다가왔을 때
    this.greetClip = cfg.greet || null;               // 다가온 순간 한 번
    this._play(this.restClip, true);
  }

  _play(name, loop = true, speed = 1) {
    if (!this.anims || !this.anims[name] || this.playing === name) return 0;
    if (this.playing && this.anims[this.playing]) this.anims[this.playing].stop();
    const g = this.anims[name];
    g.start(loop, speed);
    this.playing = name;
    const a = g.targetedAnimations[0] ? g.targetedAnimations[0].animation : null;
    return (g.to - g.from) / (a ? a.framePerSecond : 60) / speed;
  }

  update(delta, player) {
    const dx = player.group.position.x - this.group.position.x;
    const dz = player.group.position.z - this.group.position.z;
    const near = dx * dx + dz * dz < 64;
    if (near) {
      const target = Math.atan2(dx, dz);
      let diff = target - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(1, delta * 5);
    }

    // 사람이 오면 자리에서 일어나 맞이하고, 멀어지면 다시 제 자세로 돌아간다
    if (this.greetT > 0) {
      this.greetT -= delta;
      if (this.greetT <= 0) this._play(this.idleClip, true);
    } else if (near !== this.wasNear) {
      this.wasNear = near;
      if (near && this.greetClip && this.anims[this.greetClip]) {
        this.greetT = this._play(this.greetClip, false, 1.1) || 0.9;
      } else {
        this._play(near ? this.idleClip : this.restClip, true);
      }
    }
  }
}

export class NPCManager {
  constructor(scene, obstacles, shadow) {
    this.list = [
      new NPC(scene, shadow, {
        name: '도사 청운',
        role: 'elder',
        color: '#4a5a8e',
        // 혼자일 때는 바닥에 앉아 명상하다가, 다가오면 일어나 맞이한다
        model: {
          file: 'Mage.glb', height: 1.85, props: ['2H_Staff', 'Spellbook'],
          rest: 'Sit_Floor_Idle', greet: 'Sit_Floor_StandUp', idle: 'Idle'
        },
        x: 5,
        z: -6,
        lines: [
          '왔는가, 젊은 퇴마사여. 이 초원은 밤마다 원귀들이 떠도는 땅이라네.',
          '원귀를 정화하면 혼백이 남지. 무녀 소하에게 가져가면 무기에 힘을 불어넣어 줄 걸세.',
          '바깥 어둠 속에는 도깨비들이 웅크리고 있으니, 부적을 단단히 강화하고 나서게.',
          '자네의 주먹과 검, 그리고 부적이 이 밤을 지킬 것이야. 무운을 비네.'
        ]
      }),
      new NPC(scene, shadow, {
        name: '무녀 소하',
        role: 'merchant',
        // 장사꾼답게 서 있다가, 손님이 오면 반갑게 손을 든다.
        // (의자 메시가 없어 Sit_Chair_* 는 쓰지 않는다 — 허공에 앉은 것처럼 보인다)
        model: {
          file: 'Rogue_Hooded.glb', height: 1.75, props: ['Knife'],
          rest: 'Idle', greet: 'Cheer', idle: 'Idle'
        },
        color: '#b85a7a',
        x: -6,
        z: -4,
        lines: [
          '어서 오세요, 퇴마사님. 혼백을 가져오시면 힘으로 바꿔드릴게요.',
          '정화한 혼백은 좋은 값에 사들이고 있어요.',
          '무기에 신령한 기운을 불어넣는 것도 제 일이랍니다.'
        ]
      })
    ];
    for (const npc of this.list) {
      obstacles.push({ x: npc.group.position.x, z: npc.group.position.z, r: 0.7, h: 2.2 });
    }
  }

  nearest(player) {
    let best = null;
    let bestD = INTERACT_RANGE;
    for (const npc of this.list) {
      const d = Math.hypot(
        player.group.position.x - npc.group.position.x,
        player.group.position.z - npc.group.position.z
      );
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  update(delta, player) {
    for (const npc of this.list) npc.update(delta, player);
  }
}
