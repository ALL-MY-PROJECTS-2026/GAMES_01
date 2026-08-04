import { TransformNode, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

export const WEAPONS = {
  punch: { name: '권법', icon: '👊', slot: 2, type: 'melee', damage: 12, range: 2.4, arcDot: 0.25, cd: 0.38, hitDelay: 0.16, knock: 9, lunge: 3.5, animScale: 2.0 },
  sword: { name: '퇴마검', icon: '🗡️', slot: 3, type: 'melee', damage: 22, range: 3.4, arcDot: 0.05, cd: 0.55, hitDelay: 0.2, knock: 13, lunge: 4.2, animScale: 1.6 },
  gun: { name: '부적', icon: '🧧', slot: 4, type: 'ranged', damage: 8, range: 32, arcDot: 0, cd: 0.16, hitDelay: 0, knock: 3.5, lunge: 0, animScale: 3.0 }
};

function mat(scene, name, hex) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
}

export function makeSwordMesh(scene) {
  const g = new TransformNode('sword', scene);
  const steel = mat(scene, 'steel', '#d8dde4');
  const gold = mat(scene, 'gold', '#b08945');
  const grip = mat(scene, 'grip', '#6b4a2e');

  const blade = MeshBuilder.CreateBox('blade', { width: 0.07, height: 0.95, depth: 0.18 }, scene);
  blade.material = steel;
  blade.position.y = 0.62;
  blade.parent = g;

  const tip = MeshBuilder.CreateCylinder('tip', { diameterTop: 0, diameterBottom: 0.18, height: 0.18, tessellation: 4 }, scene);
  tip.material = steel;
  tip.position.y = 1.18;
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
