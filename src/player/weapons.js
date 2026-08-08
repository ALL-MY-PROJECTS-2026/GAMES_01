import {
  TransformNode, MeshBuilder, StandardMaterial, Color3, SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// 칼끝까지의 길이 — 궤적(트레일) 계산에 쓴다
export const SWORD_TIP_Y = 1.72;

// 무기 정의.
//   combo   — 어느 연계표를 쓸지 (punch / sword / heavy). 없으면 sword
//   kit     — 손에 들릴 KayKit 메시. make는 불러오기 실패 시의 절차적 대체
//   start   — 처음부터 갖고 시작하는 무기. 나머지는 드랍으로 해금한다 (loot.js)
//   magicMul— 들고 있는 동안 술법 피해 배율 (법장의 정체성)
//   idleKey — 무기를 든 채로 서 있을 때의 대기 자세 (없으면 기본 idle)
// 손에 드는 메시는 셋 중 하나다: kit(별도 파일) · make(절차적) · 캐릭터 모델 내장 프롭
// (내장 프롭은 characters.js의 model.props에서 무기 키로 연결한다)
export const WEAPONS = {
  punch: { name: '권법', icon: '👊', slot: 2, type: 'melee', damage: 12, range: 2.4, arcDot: 0.25, cd: 0.38, hitDelay: 0.16, knock: 9, lunge: 3.5, animScale: 2.0, combo: 'punch', start: true, idleKey: 'idleUnarmed' },
  sword: { name: '퇴마검', icon: '🗡️', slot: 3, type: 'melee', damage: 22, range: 3.4, arcDot: 0.05, cd: 0.55, hitDelay: 0.2, knock: 13, lunge: 4.2, animScale: 1.6, start: true, kit: { file: 'sword_1handed.gltf', height: SWORD_TIP_Y }, make: 'sword' },
  gun: { name: '석궁', icon: '🏹', slot: 4, type: 'ranged', damage: 11, range: 9, arcDot: 0, cd: 0.42, hitDelay: 0, knock: 5, lunge: 0, animScale: 1.6, projectile: 'arrow', kit: { file: 'crossbow_1handed.gltf', height: 0.7 }, make: 'gun' },
  // 비수 — 짧고 빠르다. 사거리를 포기하고 초당 피해를 가져간다
  dagger: { name: '비수', icon: '🔪', slot: 5, type: 'melee', damage: 14, range: 2.6, arcDot: 0.2, cd: 0.3, hitDelay: 0.12, knock: 6, lunge: 4.0, animScale: 2.0, kit: { file: 'dagger.gltf', height: 0.85 } },
  // 도끼 — 퇴마검과 대도 사이. 넉백이 세다
  axe: { name: '도끼', icon: '🪓', slot: 6, type: 'melee', damage: 28, range: 3.0, arcDot: 0.05, cd: 0.66, hitDelay: 0.22, knock: 20, lunge: 4.0, animScale: 1.5, kit: { file: 'axe_1handed.gltf', height: 1.15 }, idleKey: 'idleHeavy' },
  // 대도 — 느리지만 한 방이 무겁고 넓게 벤다. 두 손 연계표를 쓴다
  greatsword: { name: '대도', icon: '⚔️', slot: 7, type: 'melee', damage: 40, range: 4.0, arcDot: -0.1, cd: 0.9, hitDelay: 0.3, knock: 26, lunge: 4.6, animScale: 1.3, combo: 'heavy', kit: { file: 'sword_2handed.gltf', height: 2.0 }, idleKey: 'idleHeavy' },
  // 법장 — 근접은 약하지만 들고 있는 동안 술법이 세진다
  staff: { name: '법장', icon: '🪄', slot: 8, type: 'melee', damage: 16, range: 3.0, arcDot: 0.05, cd: 0.6, hitDelay: 0.2, knock: 10, lunge: 3.6, animScale: 1.6, magicMul: 1.3, kit: { file: 'staff.gltf', height: 1.9 } },
  // 쌍비수 — 모델 내장 단검 두 자루. 3단 연계로 가장 촘촘하게 때린다
  twinKnife: { name: '쌍비수', icon: '🗡️', slot: 9, type: 'melee', damage: 13, range: 2.5, arcDot: 0.15, cd: 0.26, hitDelay: 0.1, knock: 5, lunge: 4.2, animScale: 2.2, combo: 'dual' },
  // 표창 — 던지는 무기. 석궁보다 사거리가 짧고 대신 빠르다
  throwStar: { name: '표창', icon: '✴️', slot: 0, type: 'ranged', damage: 15, range: 7, arcDot: 0, cd: 0.5, hitDelay: 0, knock: 7, lunge: 0, animScale: 1.5, projectile: 'arrow', shootKey: 'throw1', projColor: '#cfd8e4' },
  // 거부(巨斧) — 대도보다도 느리고 무겁다. 지금 가진 것 중 한 방이 가장 세다
  battleAxe: { name: '거부', icon: '🪚', slot: 10, type: 'melee', damage: 46, range: 3.8, arcDot: -0.15, cd: 1.05, hitDelay: 0.34, knock: 30, lunge: 4.4, animScale: 1.2, combo: 'heavy', kit: { file: 'axe_2handed.gltf', height: 1.95 }, idleKey: 'idleHeavy' }
};

// 단축키 순서 — 무기창과 키 입력이 같은 순서를 쓴다.
// 표창은 0번 칸이라 정렬에서는 맨 뒤로 보낸다 (숫자열 배치와 같게)
const slotOrder = (k) => (WEAPONS[k].slot === 0 ? 10 : WEAPONS[k].slot);
export const WEAPON_ORDER = Object.keys(WEAPONS).sort((a, b) => slotOrder(a) - slotOrder(b));

function mat(scene, name, hex) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
}

/**
 * KayKit 무기 모델을 불러와 지정한 부모에 붙인다.
 * 실패하면 null을 돌려주고, 호출부는 절차적 메시로 대체한다.
 */
export async function loadKitMesh(scene, file, { height = null } = {}) {
  try {
    const res = await SceneLoader.ImportMeshAsync('', 'models/kit/', file, scene);
    const root = new TransformNode('kit_' + file, scene);
    for (const m of res.meshes) {
      if (!m.parent) m.parent = root;
      m.isPickable = false;
    }
    if (height) {
      const { min, max } = root.getHierarchyBoundingVectors(true);
      const h = max.y - min.y;
      if (h > 0.001) root.scaling.setAll(height / h);
    }
    return root;
  } catch (e) {
    return null;
  }
}

export function makeSwordMesh(scene) {
  const g = new TransformNode('sword', scene);
  const steel = mat(scene, 'steel', '#d8dde4');
  const gold = mat(scene, 'gold', '#b08945');
  const grip = mat(scene, 'grip', '#6b4a2e');
  // 원작처럼 칼날이 한눈에 읽히도록 밝게
  steel.emissiveColor = Color3.FromHexString('#5b6c86');

  const blade = MeshBuilder.CreateBox('blade', { width: 0.065, height: 1.4, depth: 0.16 }, scene);
  blade.material = steel;
  blade.position.y = 0.85;
  blade.parent = g;

  const tip = MeshBuilder.CreateCylinder('tip', { diameterTop: 0, diameterBottom: 0.16, height: 0.24, tessellation: 4 }, scene);
  tip.material = steel;
  tip.position.y = 1.6;
  tip.rotation.y = Math.PI / 4;
  tip.parent = g;

  const guard = MeshBuilder.CreateBox('guard', { width: 0.3, height: 0.06, depth: 0.24 }, scene);
  guard.material = gold;
  guard.position.y = 0.14;
  guard.parent = g;

  const handle = MeshBuilder.CreateCylinder('handle', { diameter: 0.095, height: 0.28, tessellation: 8 }, scene);
  handle.material = grip;
  handle.parent = g;

  const pommel = MeshBuilder.CreateSphere('pommel', { diameter: 0.12, segments: 8 }, scene);
  pommel.material = gold;
  pommel.position.y = -0.16;
  pommel.parent = g;

  return g;
}

export function makeGunMesh(scene) {
  const g = new TransformNode('talisman', scene);
  const paper = mat(scene, 'talisPaper', '#ffe9a8');
  const seal = mat(scene, 'talisSeal', '#c43a2e');

  for (let i = 0; i < 3; i++) {
    const sheet = MeshBuilder.CreateBox(
      'talisSheet', { width: 0.16, height: 0.015, depth: 0.34 }, scene
    );
    sheet.material = paper;
    sheet.position.set(0, i * 0.02, -i * 0.03);
    sheet.rotation.y = (i - 1) * 0.18;
    sheet.parent = g;
  }
  const stamp = MeshBuilder.CreateBox(
    'talisStamp', { width: 0.09, height: 0.02, depth: 0.09 }, scene
  );
  stamp.material = seal;
  stamp.position.set(0, 0.055, 0.06);
  stamp.parent = g;

  return g;
}
