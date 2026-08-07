import { createScene } from './core/scene.js';
import { Input } from './core/input.js';
import { initPhysics, addStaticWorld } from './core/physics.js';
import { buildWorld } from './world/ground.js';
import { MonsterManager } from './world/monsters.js';
import { NPCManager } from './world/npcs.js';
import { DropManager } from './world/drops.js';
import { ProjectileManager } from './world/projectiles.js';
import { initDialog, isDialogOpen, openDialog, advanceDialog } from './ui/dialog.js';
import { initShop, isShopOpen, openShop, closeShop } from './ui/shop.js';
import { initSkills, toggleSkills, closeSkills } from './ui/skills.js';
import { CHARACTERS } from './core/characters.js';
import { bindPlayer, addXp, addGold, addJelly, useJelly, stats } from './core/stats.js';
import { Player } from './player/player.js';
import { CompanionManager } from './player/companions.js';
import { WEAPONS } from './player/weapons.js';
import { applyWeaponSkills } from './core/skills.js';
import { ThirdPersonCamera } from './player/camera.js';
import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { Minimap } from './ui/minimap.js';
import {
  initHUD, setMP, toggleInventory, setActiveWeapon, setPlayerIdentity, setBossBar
} from './ui/hud.js';
import { sfx, initAudio } from './core/sfx.js';
import { juice, hitstop, shake } from './core/juice.js';
import { setLoadingTotal, loadingStep, finishLoading } from './ui/loading.js';
import { VFX } from './world/vfx.js';
import {
  initSpellBar, getSelectedSpell, setSpellCooldown, setSpellAffordable, selectSpellByIndex
} from './ui/spellbar.js';
import { SPELLS, SPELL_ORDER } from './core/spells.js';

async function boot() {
  setLoadingTotal(5);
  const { engine, scene, canvas, shadow } = createScene(document.getElementById('app'));
  // 픽셀 비율 상한 (STACK.md §14) — 고DPI 화면에서 픽셀을 4배 그리는 낭비를 막는다
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  const input = new Input(canvas);

  loadingStep('물리 엔진 준비 중…');
  await initPhysics(scene);
  loadingStep('초원을 그리는 중…');
  const { obstacles, ground } = buildWorld(scene, shadow);
  addStaticWorld(scene, ground, obstacles);

  // 단일 주인공으로 바로 시작 (선택 화면 없음)
  loadingStep('퇴마사를 부르는 중…');
  const charKey = 'ilim';
  const player = new Player(scene, obstacles, shadow, charKey);
  loadingStep('원귀를 깨우는 중…');
  const monsters = new MonsterManager(scene, obstacles, shadow);
  const npcs = new NPCManager(scene, obstacles, shadow);
  const camRig = new ThirdPersonCamera(scene);
  camRig.setObstacles(obstacles);
  const minimap = new Minimap(scene, engine, player);

  camRig.cam.layerMask = 0x1;
  scene.activeCameras = [camRig.cam, minimap.cam];

  const drops = new DropManager(scene, true);
  const projectiles = new ProjectileManager(scene, obstacles);
  player.projectiles = projectiles;
  monsters.setProjectiles(projectiles);
  const vfx = new VFX(scene);
  player.vfx = vfx;
  // 솔로 플레이: 선택한 캐릭터 한 명만 등장 (동료 AI 비활성)
  const companions = new CompanionManager(scene, shadow, []);
  const party = [player];

  scene.cameraToUseForPointers = camRig.cam;

  const marker = MeshBuilder.CreateDisc('moveMarker', { radius: 0.5, tessellation: 24 }, scene);
  const markerMat = new StandardMaterial('markerMat', scene);
  markerMat.emissiveColor = Color3.FromHexString('#e8c25f');
  markerMat.disableLighting = true;
  markerMat.alpha = 0.55;
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.setEnabled(false);

  // 클릭 지점 근처의 살아있는 몬스터를 찾아 자동 타게팅 (클릭 어시스트)
  const AIM_ASSIST_RADIUS = 2.8;
  function monsterNearPoint(point) {
    let best = null;
    let bd = AIM_ASSIST_RADIUS;
    for (const m of monsters.list) {
      if (m.dead) continue;
      const d = Math.hypot(m.group.position.x - point.x, m.group.position.z - point.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (isDialogOpen() || isShopOpen()) return;
    // 멀티 카메라(미니맵) 환경에서는 픽 카메라를 반드시 명시해야 한다
    const pick = scene.pick(scene.pointerX, scene.pointerY, undefined, false, camRig.cam);
    if (!pick || !pick.hit) return;
    let mon = pick.pickedMesh && pick.pickedMesh.metadata && pick.pickedMesh.metadata.monster;
    if (!mon && pick.pickedPoint) mon = monsterNearPoint(pick.pickedPoint);

    if (e.button === 2) {
      // 우클릭 = 술법 공격 (몬스터 또는 지점 방향으로 즉시 시전)
      const spell = getSelectedSpell();
      if (mon && !mon.dead) {
        player.attackTarget = mon;
        player.castMagic(mon.group.position, spell);
      } else if (pick.pickedPoint) {
        player.castMagic(pick.pickedPoint, spell);
      }
      return;
    }

    if (mon && !mon.dead) {
      player.attackTarget = mon;
      player.moveTarget = null;
      marker.setEnabled(false);
    } else if (pick.pickedPoint) {
      player.attackTarget = null;
      player.moveTarget = { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
      marker.position.set(pick.pickedPoint.x, 0.06, pick.pickedPoint.z);
      marker.setEnabled(true);
    }
  });
  player.onKill = (m) => {
    const cfg = m.cfg;
    addXp(cfg.xp);
    addGold(cfg.gold[0] + Math.floor(Math.random() * (cfg.gold[1] - cfg.gold[0] + 1)));
    for (let i = 0; i < cfg.jelly; i++) drops.spawn(m.group.position);
  };

  initHUD();
  setPlayerIdentity(CHARACTERS[charKey]);
  for (const id of ['comp1-row', 'comp2-row']) {
    const row = document.getElementById(id);
    if (row) row.remove();
  }
  initDialog();
  initShop();
  initSkills();
  initSpellBar();
  initAudio();
  bindPlayer(player);
  setMP(player.mp, player.maxMp);

  const weaponKeys = { Digit2: 'punch', Digit3: 'sword', Digit4: 'gun' };
  setActiveWeapon(player.weapon);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') toggleInventory();
    if (e.code === 'KeyK') toggleSkills();
    if (e.code === 'F1' || e.code === 'F2') {
      e.preventDefault();
      selectSpellByIndex(e.code === 'F1' ? 0 : 1);
    }
    if (e.code === 'Digit1') useJelly();
    if (e.code === 'Escape') { closeShop(); closeSkills(); }
    if (weaponKeys[e.code] && player.setWeapon(weaponKeys[e.code])) {
      setActiveWeapon(player.weapon);
    }
  });

  const talkHint = document.getElementById('talk-hint');
  const idleInput = {
    pressed: () => false,
    consumeAttack: () => false,
    consumeDodge: () => false
  };

  function update(delta) {
    // 히트스톱: 월드 시간만 6%로 감속, 카메라/UI는 실시간 (PHYSICS.md §2-1)
    let d = delta;
    if (juice.hitstopT > 0) {
      juice.hitstopT -= delta;
      d = delta * 0.06;
    }

    // 자기중심·연쇄 술법이 참조할 대상 목록
    player.nearbyMonsters = monsters.list;

    const nearNpc = npcs.nearest(player);
    if (input.consumeInteract()) {
      if (isShopOpen()) closeShop();
      else if (isDialogOpen()) advanceDialog();
      else if (nearNpc && nearNpc.role === 'merchant') openShop();
      else if (nearNpc) openDialog(nearNpc);
    }
    const talking = isDialogOpen() || isShopOpen();
    if (!talking && nearNpc) {
      const verb = nearNpc.role === 'merchant' ? '상점' : '대화하기';
      talkHint.innerHTML = `<b>E</b> ${verb} — ${nearNpc.name}`;
      talkHint.style.display = 'block';
    } else {
      talkHint.style.display = 'none';
    }

    const at = player.attackTarget;
    if (at) {
      if (at.dead) {
        player.attackTarget = null;
      } else {
        const w = applyWeaponSkills(WEAPONS[player.weapon], player.weapon, stats.skills);
        const d = Math.hypot(
          at.group.position.x - player.group.position.x,
          at.group.position.z - player.group.position.z
        );
        const reach = w.type === 'ranged' ? Math.min(w.range, 16) : w.range * 0.8;
        if (d > reach) {
          player.moveTarget = { x: at.group.position.x, z: at.group.position.z };
        } else {
          player.moveTarget = null;
          if (player.attackCd <= 0) input.queueAttack();
        }
      }
    }
    if (!player.moveTarget) marker.setEnabled(false);

    if (!talking) {
      player.tryAttack(
        input, monsters.list, camRig,
        at && !at.dead ? at.group.position : null
      );
    }
    player.update(d, talking ? idleInput : input, camRig);

    const handleHit = (m, killed) => {
      if (killed) {
        hitstop(0.12);
        shake(0.3, 0.22);
        sfx.kill();
        if (player.onKill) player.onKill(m);
      } else {
        hitstop(0.025);
        sfx.hit();
      }
    };
    monsters.update(d, party);
    projectiles.updateHostile(d, player);
    player.updateGroundAreas(d, monsters.list, handleHit);
    vfx.update(d);
    for (const key of SPELL_ORDER) {
      const sp = SPELLS[key];
      const left = (player.spellCd && player.spellCd[key]) || 0;
      setSpellCooldown(key, left / sp.cd);
      setSpellAffordable(key, player.mp >= sp.cost);
    }
    companions.update(d, player, monsters.list, obstacles, projectiles, handleHit);
    projectiles.update(d, monsters.list, handleHit);
    npcs.update(delta, player);
    drops.update(d, player, () => {
      addJelly(1);
      sfx.pickup();
    });
    // 보스 HP바: 교전 거리 안에 살아있는 보스가 있을 때만
    const boss = monsters.list.find((m) => m.cfg.isBoss && !m.dead
      && Math.hypot(m.group.position.x - player.group.position.x,
                    m.group.position.z - player.group.position.z) < 28);
    setBossBar(boss || null);

    camRig.update(delta, input, player, player.speedFov);
    if (juice.shakeT > 0) {
      juice.shakeT -= delta;
      const k = juice.shakeMag * Math.min(1, juice.shakeT * 6);
      camRig.cam.position.x += (Math.random() - 0.5) * k;
      camRig.cam.position.y += (Math.random() - 0.5) * k;
      camRig.cam.position.z += (Math.random() - 0.5) * k;
      if (juice.shakeT <= 0) juice.shakeMag = 0;
    }
    minimap.update();
  }

  window.__game = {
    engine, scene, player, camRig, minimap, input, monsters, npcs, drops, projectiles, obstacles,
    companions, party, marker,
    stats,
    debug: { addGold, addJelly, addXp },
    dialog: { openDialog, advanceDialog, isDialogOpen },
    step: (dt) => {
      update(dt);
      scene.render();
    }
  };

  // 고정 스텝 루프 (STACK.md §14) — 로직은 1/60로 고정, 렌더만 가변.
  // 가변 delta를 그대로 쓰면 120Hz 모니터에서 이동·쿨다운이 배로 빨라진다.
  const FIXED_STEP = 1 / 60;
  const MAX_STEPS = 5; // 탭 복귀 등으로 크게 밀렸을 때 따라잡기 상한
  let accumulator = 0;

  // 플레이어 모델까지 실제로 붙은 뒤에 로딩 화면을 걷는다
  await scene.whenReadyAsync();
  finishLoading();

  engine.runRenderLoop(() => {
    accumulator += Math.min(engine.getDeltaTime() / 1000, 0.25);
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;
    scene.render();
  });
}

boot();
