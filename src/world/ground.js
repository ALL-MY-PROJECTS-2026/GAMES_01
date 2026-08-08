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

/**
 * 시드 난수 (mulberry32).
 * 지형을 Math.random으로 뿌리면 실행할 때마다 달라져 지도가 성립하지 않고,
 * 멀티에서는 피어마다 나무 위치가 어긋나 한쪽만 막히는 일이 생긴다.
 * 존마다 고정 시드를 주면 누가 언제 켜도 같은 지형이 나온다.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrassMaterial(scene, palette) {
  const tex = new DynamicTexture('grassTex', 256, scene, true);
  const g = tex.getContext();
  g.fillStyle = palette.base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4500; i++) {
    g.fillStyle = palette.shades[(Math.random() * palette.shades.length) | 0];
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

/**
 * 존 하나의 지형을 세운다.
 * 나무·바위는 원본 메시 하나를 만들고 나머지는 인스턴스로 복제한다 (STACK.md §8).
 * 원본 자체를 첫 번째 배치로 쓰므로 보이지 않는 원본이 원점에 남지 않는다.
 */
export function buildWorld(scene, shadow, zone) {
  const obstacles = [];
  const created = [];
  const rand = rng(zone.seed);
  const pal = zone.palette;

  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: WORLD_HALF * 2 + 10, height: WORLD_HALF * 2 + 10 },
    scene
  );
  ground.material = makeGrassMaterial(scene, pal.ground);
  ground.receiveShadows = true;
  created.push(ground, ground.material);

  const trunkMat = lambert(scene, 'trunk', pal.trunk);
  const leafMat = lambert(scene, 'leaf', pal.leaf);
  const rockMat = lambert(scene, 'rock', pal.rock);
  created.push(trunkMat, leafMat, rockMat);

  // ── 나무 ──────────────────────────────────────────────────
  let trunkSrc = null;
  let leafSrc = null;
  for (let i = 0; i < zone.trees; i++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 6);
    if (Math.hypot(x, z) < 12) continue;          // 시작 지점은 비워 둔다
    const s = 0.8 + rand() * 0.7;

    let trunk;
    let leaves;
    if (!trunkSrc) {
      trunkSrc = MeshBuilder.CreateCylinder(
        'trunk',
        { diameterTop: 0.6, diameterBottom: 0.9, height: 2.2, tessellation: 7 },
        scene
      );
      trunkSrc.material = trunkMat;
      leafSrc = MeshBuilder.CreateCylinder(
        'leaves',
        { diameterTop: 0, diameterBottom: 4.4, height: 5, tessellation: 8 },
        scene
      );
      leafSrc.material = leafMat;
      created.push(trunkSrc, leafSrc);
      if (shadow) {
        shadow.addShadowCaster(trunkSrc);
        shadow.addShadowCaster(leafSrc);
      }
      trunk = trunkSrc;
      leaves = leafSrc;
    } else {
      trunk = trunkSrc.createInstance('trunkI' + i);
      leaves = leafSrc.createInstance('leavesI' + i);
    }
    trunk.scaling.setAll(s);
    trunk.position.set(x, 1.1 * s, z);
    leaves.scaling.setAll(s);
    leaves.position.set(x, 4.4 * s, z);
    obstacles.push({ x, z, r: 0.6 * s, h: 7 * s });
  }

  // ── 바위 ──────────────────────────────────────────────────
  let rockSrc = null;
  for (let i = 0; i < zone.rocks; i++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 6);
    if (Math.hypot(x, z) < 10) continue;
    let rock;
    if (!rockSrc) {
      rockSrc = MeshBuilder.CreatePolyhedron('rock', { type: 2, size: 0.8 }, scene);
      rockSrc.material = rockMat;
      created.push(rockSrc);
      if (shadow) shadow.addShadowCaster(rockSrc);
      rock = rockSrc;
    } else {
      rock = rockSrc.createInstance('rockI' + i);
    }
    const sx = 1 + rand();
    const sy = 0.6 + rand() * 0.4;
    const sz = 1 + rand();
    rock.scaling.set(sx, sy, sz);
    rock.position.set(x, 0.35, z);
    obstacles.push({ x, z, r: Math.max(sx, sz) * 0.8, h: 1.6 });
  }

  // 존을 바꿀 때 통째로 걷어내야 하므로 만든 것을 다 들고 있는다
  const dispose = () => {
    if (trunkSrc) for (const inst of [...trunkSrc.instances]) inst.dispose();
    if (leafSrc) for (const inst of [...leafSrc.instances]) inst.dispose();
    if (rockSrc) for (const inst of [...rockSrc.instances]) inst.dispose();
    for (const c of created) c.dispose();
  };

  return { obstacles, ground, dispose };
}
