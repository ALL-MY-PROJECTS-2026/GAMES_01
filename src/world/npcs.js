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

function makeNameLabel(scene, name) {
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
        name: '촌장 로한',
        role: 'elder',
        color: '#6e5a9e',
        x: 5,
        z: -6,
        lines: [
          '오오, 새로운 모험가로군! 바람의 왕국에 온 것을 환영하네.',
          '요즘 초원에 슬라임이 부쩍 늘어서 마을 사람들이 걱정이 많아.',
          '슬라임을 잡아 주면 경험치와 골드를 얻을 수 있을 걸세. 레벨이 오르면 더 강해지지!',
          '몸이 위험해지면 잠시 쉬면 기력이 돌아온다네. 행운을 비네, 모험가여!'
        ]
      }),
      new NPC(scene, shadow, {
        name: '상인 메이',
        role: 'merchant',
        color: '#c4703f',
        x: -6,
        z: -4,
        lines: [
          '어서 오세요~ 떠돌이 상인 메이라고 해요.',
          '슬라임이 떨어뜨리는 젤리를 모아 오시면 좋은 값에 쳐드릴게요.',
          '언젠가 이 자리에 멋진 상점을 차릴 거예요. 그때 다시 만나요!'
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
