import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  Mesh
} from '@babylonjs/core';

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
  constructor(scene, shadow, { name, role, color, x, z, lines }) {
    this.name = name;
    this.role = role;
    this.lines = lines;
    this.group = new TransformNode('npc-' + name, scene);

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

  update(delta, player) {
    const dx = player.group.position.x - this.group.position.x;
    const dz = player.group.position.z - this.group.position.z;
    if (dx * dx + dz * dz < 64) {
      const target = Math.atan2(dx, dz);
      let diff = target - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(1, delta * 5);
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
