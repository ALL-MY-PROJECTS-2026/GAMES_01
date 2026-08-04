import {
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3
} from '@babylonjs/core';

export const WORLD_HALF = 95;

export function resolveCollision(pos, radius, obstacles) {
  for (const o of obstacles) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const min = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
}

function makeGrassMaterial(scene) {
  const tex = new DynamicTexture('grassTex', 256, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#6fae4e';
  g.fillRect(0, 0, 256, 256);
  const shades = ['#63a344', '#7abb5b', '#5d9c40', '#82c463', '#69ac49'];
  for (let i = 0; i < 4500; i++) {
    g.fillStyle = shades[(Math.random() * shades.length) | 0];
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 40;
  tex.vScale = 40;

  const mat = new StandardMaterial('grassMat', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

function lambert(scene, name, hex) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

export function buildWorld(scene, shadow) {
  const obstacles = [];

  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: WORLD_HALF * 2 + 10, height: WORLD_HALF * 2 + 10 },
    scene
  );
  ground.material = makeGrassMaterial(scene);
  ground.receiveShadows = true;

  const trunkMat = lambert(scene, 'trunk', '#8a5a3b');
  const leafMat = lambert(scene, 'leaf', '#3e7a2a');
  const rockMat = lambert(scene, 'rock', '#9a958a');

  for (let i = 0; i < 34; i++) {
    const x = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    const z = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    if (Math.hypot(x, z) < 12) continue;
    const s = 0.8 + Math.random() * 0.7;

    const trunk = MeshBuilder.CreateCylinder(
      'trunk',
      { diameterTop: 0.6 * s, diameterBottom: 0.9 * s, height: 2.2 * s, tessellation: 7 },
      scene
    );
    trunk.material = trunkMat;
    trunk.position.set(x, 1.1 * s, z);

    const leaves = MeshBuilder.CreateCylinder(
      'leaves',
      { diameterTop: 0, diameterBottom: 4.4 * s, height: 5 * s, tessellation: 8 },
      scene
    );
    leaves.material = leafMat;
    leaves.position.set(x, 4.4 * s, z);

    if (shadow) {
      shadow.addShadowCaster(trunk);
      shadow.addShadowCaster(leaves);
    }
    obstacles.push({ x, z, r: 0.6 * s, h: 7 * s });
  }

  for (let i = 0; i < 14; i++) {
    const x = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    const z = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    if (Math.hypot(x, z) < 10) continue;
    const rock = MeshBuilder.CreatePolyhedron('rock', { type: 2, size: 0.8 }, scene);
    rock.material = rockMat;
    const sx = 1 + Math.random();
    const sy = 0.6 + Math.random() * 0.4;
    const sz = 1 + Math.random();
    rock.scaling.set(sx, sy, sz);
    rock.position.set(x, 0.35, z);
    if (shadow) shadow.addShadowCaster(rock);
    obstacles.push({ x, z, r: Math.max(sx, sz) * 0.8, h: 1.6 });
  }

  return { obstacles, ground };
}
