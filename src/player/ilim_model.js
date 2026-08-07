import { TransformNode, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

// 프로시저럴 로우폴리 이림 — 원작 스프라이트의 특징(남색 무복·적갈색 머리·세검)만 참고한
// 오리지널 디자인. 본 없이 부위 노드 회전으로 간이 애니메이션을 구현한다.
const PALETTE = {
  skin: '#e8b48f',
  hair: '#7a3020',
  top: '#26304a',
  topAccent: '#3a4a72',
  belt: '#6a2020',
  pants: '#1c2438',
  shoes: '#141824'
};

const LOOPING = new Set(['Idle', 'Walking', 'Running']);
const ONESHOT_DUR = { Punch: 0.5, Wave: 0.55, Jump: 0.5 };

function mat(scene, name, hex) {
  const m = new StandardMaterial('ilim_' + name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  return m;
}

function box(scene, name, opts, material, parent, x, y, z) {
  const b = MeshBuilder.CreateBox(name, opts, scene);
  b.material = material;
  b.parent = parent;
  b.position.set(x, y, z);
  return b;
}

export function buildIlim(scene, shadow) {
  const root = new TransformNode('ilimRoot', scene);
  const mats = {};
  for (const [k, v] of Object.entries(PALETTE)) mats[k] = mat(scene, k, v);

  const casters = [];

  // 다리 (골반 피벗)
  const legL = new TransformNode('ilimLegL', scene);
  legL.parent = root;
  legL.position.set(-0.13, 0.86, 0);
  casters.push(box(scene, 'legLm', { width: 0.17, height: 0.72, depth: 0.2 }, mats.pants, legL, 0, -0.36, 0));
  box(scene, 'shoeL', { width: 0.18, height: 0.1, depth: 0.28 }, mats.shoes, legL, 0, -0.77, 0.03);

  const legR = new TransformNode('ilimLegR', scene);
  legR.parent = root;
  legR.position.set(0.13, 0.86, 0);
  casters.push(box(scene, 'legRm', { width: 0.17, height: 0.72, depth: 0.2 }, mats.pants, legR, 0, -0.36, 0));
  box(scene, 'shoeR', { width: 0.18, height: 0.1, depth: 0.28 }, mats.shoes, legR, 0, -0.77, 0.03);

  // 몸통 (허리 피벗 — 상체 스웨이용)
  const torso = new TransformNode('ilimTorso', scene);
  torso.parent = root;
  torso.position.set(0, 0.92, 0);
  casters.push(box(scene, 'chest', { width: 0.46, height: 0.52, depth: 0.26 }, mats.top, torso, 0, 0.32, 0));
  box(scene, 'collar', { width: 0.3, height: 0.1, depth: 0.27 }, mats.topAccent, torso, 0, 0.55, 0);
  box(scene, 'beltm', { width: 0.48, height: 0.09, depth: 0.28 }, mats.belt, torso, 0, 0.03, 0);

  // 머리 + 적갈색 머리카락 (뒤로 묶은 꼬리)
  const head = new TransformNode('ilimHead', scene);
  head.parent = torso;
  head.position.set(0, 0.72, 0);
  const face = MeshBuilder.CreateBox('face', { width: 0.26, height: 0.26, depth: 0.24 }, scene);
  face.material = mats.skin;
  face.parent = head;
  casters.push(face);
  box(scene, 'hairTop', { width: 0.28, height: 0.1, depth: 0.26 }, mats.hair, head, 0, 0.15, -0.01);
  box(scene, 'hairBack', { width: 0.28, height: 0.24, depth: 0.08 }, mats.hair, head, 0, 0.02, -0.15);
  const tail = box(scene, 'hairTail', { width: 0.09, height: 0.34, depth: 0.09 }, mats.hair, head, 0, -0.14, -0.2);
  tail.rotation.x = 0.25;

  // 팔 (어깨 피벗)
  const armL = new TransformNode('ilimArmL', scene);
  armL.parent = torso;
  armL.position.set(-0.3, 0.5, 0);
  casters.push(box(scene, 'armLm', { width: 0.13, height: 0.52, depth: 0.16 }, mats.top, armL, 0, -0.22, 0));
  box(scene, 'handL', { width: 0.12, height: 0.12, depth: 0.14 }, mats.skin, armL, 0, -0.52, 0);

  const armR = new TransformNode('ilimArmR', scene);
  armR.parent = torso;
  armR.position.set(0.3, 0.5, 0);
  casters.push(box(scene, 'armRm', { width: 0.13, height: 0.52, depth: 0.16 }, mats.top, armR, 0, -0.22, 0));
  box(scene, 'handR', { width: 0.12, height: 0.12, depth: 0.14 }, mats.skin, armR, 0, -0.52, 0);

  // 오른손 무기 앵커 — 무기의 로컬 +Y가 칼끝 방향이다. 손목 회전으로 칼날 방향을 만든다.
  const handR = new TransformNode('ilimHandR', scene);
  handR.parent = armR;
  handR.position.set(0, -0.55, 0.05);
  handR.rotation.x = -0.35; // 평상시: 칼을 비스듬히 세워 든 자세

  if (shadow) for (const c of casters) shadow.addShadowCaster(c);

  // ---- 간이 애니메이터 ----
  const state = { loop: 'Idle', loopSpeed: 1, one: null, oneT: 0, oneDur: 0, t: 0 };

  // GLB 클립 이름 → 리그 동작 기본 매핑 (rigMotion이 명시되면 그쪽이 우선)
  function variantOf(name, speed, fromFrac) {
    if (name !== 'Punch') return name === 'Wave' ? 'hook' : name === 'Jump' ? 'upper' : name;
    if (fromFrac > 0.2) return 'cross';   // 되치기 — 왼손 역공
    if (speed < 2.0) return 'finisher';   // 붕권 — 느리고 묵직
    return 'jab';
  }

  function setAnim(name, speed = 1, fromFrac = 0, rigMotion = null) {
    if (LOOPING.has(name)) {
      state.loop = name;
      state.loopSpeed = speed;
      if (!state.one) return;
    } else if (rigMotion || ONESHOT_DUR[name] !== undefined) {
      state.one = rigMotion || variantOf(name, speed, fromFrac);
      state.oneDur = (ONESHOT_DUR[name] || 0.5) / Math.max(0.2, speed);
      state.oneT = state.oneDur;
    }
  }

  function tick(dt) {
    state.t += dt;
    const t = state.t;
    // 기본 자세로 감쇠 복귀
    const relax = (node, rx = 0, ry = 0, rz = 0, rate = 14) => {
      node.rotation.x += (rx - node.rotation.x) * Math.min(1, dt * rate);
      node.rotation.y += (ry - node.rotation.y) * Math.min(1, dt * rate);
      node.rotation.z += (rz - node.rotation.z) * Math.min(1, dt * rate);
    };

    if (state.one) {
      state.oneT -= dt;
      const p = 1 - Math.max(0, state.oneT) / state.oneDur; // 0→1 진행도
      const c = Math.sin(Math.min(1, p * 1.6) * Math.PI); // 빠르게 뻗고 되돌아옴
      const v = state.one;
      if (v === 'jab') {
        // 오른손 곧게 찌르기, 상체 살짝 열기
        armR.rotation.x = -1.9 * c;
        armL.rotation.x = 0.45 * c;
        torso.rotation.y = -0.3 * c;
      } else if (v === 'cross') {
        // 왼손 되치기 — 반대쪽 회전
        armL.rotation.x = -1.9 * c;
        armR.rotation.x = 0.5 * c;
        torso.rotation.y = 0.4 * c;
      } else if (v === 'hook') {
        // 훅 — 팔을 옆으로 크게 휘두름
        armR.rotation.x = -1.0 * c;
        armR.rotation.z = -1.4 * c;
        armL.rotation.z = 0.5 * c;
        torso.rotation.y = 0.5 * c;
      } else if (v === 'upper') {
        // 어퍼 — 무릎 굽혀 띄우며 올려치기
        legL.rotation.x = -0.85 * c;
        legR.rotation.x = 0.45 * c;
        armR.rotation.x = -2.5 * c;
        armR.rotation.z = 0.35 * c;
        torso.rotation.x = -0.2 * c;
      } else if (v === 'thrust') {
        // 검 1타 찌르기 — 팔을 정면으로 뻗고 손목을 돌려 칼끝이 앞을 곧게 향하게 한다
        const lunge = Math.sin(Math.min(1, p * 1.9) * Math.PI);
        armR.rotation.x = -1.55 * lunge;
        handR.rotation.x = -0.35 + (Math.PI + 0.35) * lunge; // 칼끝 → 정면
        armL.rotation.x = 0.35 * lunge;
        torso.rotation.y = -0.4 * lunge;
        torso.rotation.x = 0.16 * lunge;
        legR.rotation.x = -0.5 * lunge;
      } else if (v === 'slash') {
        // 검 2타 가로베기 — 칼날을 수평으로 눕히고 왼쪽에서 오른쪽으로 몸통째 훑는다
        const sweep = Math.min(1, p * 1.4);
        const on = Math.sin(sweep * Math.PI); // 시작·끝은 기본 자세
        armR.rotation.x = -1.5 * on;
        handR.rotation.x = -0.35 + (Math.PI + 0.35) * on;
        handR.rotation.z = (Math.PI / 2) * on;              // 날을 수평으로
        armR.rotation.y = (0.6 - 1.2 * sweep) * on;
        torso.rotation.y = (0.85 - 1.7 * sweep) * on;       // 왼 → 오 횡 스윕
        armL.rotation.z = 0.4 * on;
      } else if (v === 'finisher') {
        // 붕권 — 몸을 낮췄다 양손으로 꽂아넣음
        const drop = Math.sin(Math.min(1, p * 1.2) * Math.PI);
        armR.rotation.x = -2.2 * c;
        armL.rotation.x = -1.4 * c;
        torso.rotation.x = 0.3 * drop;
        torso.rotation.y = -0.5 * c;
        legR.rotation.x = -0.4 * drop;
        head.rotation.x = 0.2 * drop;
      }
      if (state.oneT <= 0) state.one = null;
      return;
    }

    if (state.loop === 'Idle') {
      torso.position.y = 0.92 + Math.sin(t * 2.2) * 0.012;
      relax(armL, Math.sin(t * 2.2) * 0.05, 0, 0.06, 6);
      relax(armR, Math.sin(t * 2.2 + 1.5) * 0.05, 0, -0.06, 6);
      relax(legL); relax(legR); relax(torso, 0, 0, 0, 6);
      relax(head, Math.sin(t * 1.1) * 0.04, 0, 0, 4);
      relax(handR, -0.35, 0, 0, 10);
    } else {
      const run = state.loop === 'Running';
      const freq = run ? 11 : 7.5;
      const amp = run ? 0.85 : 0.5;
      const s = Math.sin(t * freq * state.loopSpeed);
      legL.rotation.x = s * amp;
      legR.rotation.x = -s * amp;
      armL.rotation.x = -s * amp * 0.8;
      armR.rotation.x = s * amp * 0.8;
      for (const n of [armL, armR, torso]) {
        n.rotation.y += (0 - n.rotation.y) * Math.min(1, dt * 12);
        n.rotation.z += (0 - n.rotation.z) * Math.min(1, dt * 12);
      }
      handR.rotation.x += (-0.35 - handR.rotation.x) * Math.min(1, dt * 12);
      handR.rotation.z += (0 - handR.rotation.z) * Math.min(1, dt * 12);
      torso.rotation.x = run ? 0.12 : 0.05;
      torso.position.y = 0.92 + Math.abs(Math.cos(t * freq * state.loopSpeed)) * (run ? 0.05 : 0.03);
    }
  }

  return { root, handR, setAnim, tick };
}
