import { TransformNode, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

export const WEAPONS = {
  punch: { name: '펀치', icon: '👊', slot: 2, type: 'melee', damage: 12, range: 2.4, arcDot: 0.25, cd: 0.38, hitDelay: 0.16, knock: 9, lunge: 3.5, animScale: 2.0 },
  sword: { name: '검', icon: '🗡️', slot: 3, type: 'melee', damage: 22, range: 3.4, arcDot: 0.05, cd: 0.55, hitDelay: 0.2, knock: 13, lunge: 4.2, animScale: 1.6 },
  gun: { name: '총', icon: '🔫', slot: 4, type: 'ranged', damage: 8, range: 32, arcDot: 0, cd: 0.16, hitDelay: 0, knock: 3.5, lunge: 0, animScale: 3.0 }
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
  const g = new TransformNode('gun', scene);
  const dark = mat(scene, 'gunDark', '#3a3f47');
  const wood = mat(scene, 'gunWood', '#8a5a3b');

  const body = MeshBuilder.CreateBox('gunBody', { width: 0.11, height: 0.16, depth: 0.4 }, scene);
  body.material = dark;
  body.parent = g;

  const barrel = MeshBuilder.CreateCylinder('barrel', { diameter: 0.07, height: 0.34, tessellation: 8 }, scene);
  barrel.material = dark;
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, 0.34);
  barrel.parent = g;

  const gripPart = MeshBuilder.CreateBox('gunGrip', { width: 0.09, height: 0.2, depth: 0.11 }, scene);
  gripPart.material = wood;
  gripPart.position.set(0, -0.15, -0.1);
  gripPart.rotation.x = 0.35;
  gripPart.parent = g;

  return g;
}
