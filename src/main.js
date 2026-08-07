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
  initHUD, setMP, setHP, toggleInventory, setActiveWeapon, setPlayerIdentity, setBossBar,
  showPickup, setAutoHunt
} from './ui/hud.js';
import { sfx, initAudio } from './core/sfx.js';
import { juice, hitstop, shake } from './core/juice.js';
import { setLoadingTotal, loadingStep, finishLoading } from './ui/loading.js';
import { VFX } from './world/vfx.js';
import {
  initSpellBar, getSelectedSpell, setSpellCooldown, setSpellAffordable, selectSpellByIndex
} from './ui/spellbar.js';
import { SPELLS, SPELL_ORDER } from './core/spells.js';
import { net } from './net/net.js';
import { GhostManager } from './net/ghosts.js';
import { initInventory, addItem, renderInventory } from './ui/inventory.js';

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
  projectiles.vfx = vfx;
  const ghosts = new GhostManager(scene, shadow);
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
    drops.spawnFor(cfg, m.group.position, cfg.jelly);
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
  // 소지품에서 소모품을 눌렀을 때
  initInventory((def) => {
    if (def.use === 'heal') {
      if (player.hp >= player.maxHp) return false;
      player.hp = Math.min(player.maxHp, player.hp + def.amount);
      setHP(player.hp, player.maxHp);
    } else if (def.use === 'mana') {
      if (player.mp >= player.maxMp) return false;
      player.mp = Math.min(player.maxMp, player.mp + def.amount);
      setMP(Math.round(player.mp), player.maxMp);
    } else if (def.use === 'stamina') {
      if (player.stamina >= player.maxStamina) return false;
      player.stamina = player.maxStamina;
      player.exhaustT = 0;
    } else {
      return false;
    }
    sfx.pickup();
    return true;
  });
  initAudio();
  bindPlayer(player);
  setMP(player.mp, player.maxMp);

  const weaponKeys = { Digit2: 'punch', Digit3: 'sword', Digit4: 'gun' };
  setActiveWeapon(player.weapon);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') { renderInventory(); toggleInventory(); }
    if (e.code === 'KeyK') toggleSkills();
    if (e.code === 'F1' || e.code === 'F2') {
      e.preventDefault();
      selectSpellByIndex(e.code === 'F1' ? 0 : 1);
    }
    if (e.code === 'KeyV') { autoHunt = !autoHunt; setAutoHunt(autoHunt); }
    if (e.code === 'Digit1') useJelly();
    if (e.code === 'Escape') { closeShop(); closeSkills(); }
    if (weaponKeys[e.code] && player.setWeapon(weaponKeys[e.code])) {
      setActiveWeapon(player.weapon);
    }
  });

  // 자동 사냥 — 가장 가까운 적을 스스로 찾아 싸운다
  let autoHunt = false;
  const autoBtn = document.getElementById('autohunt');
  if (autoBtn) autoBtn.addEventListener('click', () => { autoHunt = !autoHunt; setAutoHunt(autoHunt); });

  // ── 멀티플레이 ─────────────────────────────────────────────
  // 스탯·레벨·스킬은 각자 로컬 세이브에 남는다. 네트워크로는 위치·동작·전투 결과만 오간다.
  const mPanel = document.getElementById('multi');
  const mRoom = document.getElementById('m-room');
  const mBtn = document.getElementById('m-btn');
  const mStatus = document.getElementById('m-status');

  function renderNetStatus() {
    if (!net.connected) {
      mPanel.classList.remove('on');
      mBtn.textContent = '방 참가';
      mStatus.innerHTML = '혼자 플레이 중<br>같은 방 이름을 넣으면 만납니다';
      return;
    }
    mPanel.classList.add('on');
    mBtn.textContent = '나가기';
    mStatus.innerHTML =
      `방 <b>${net.roomCode}</b> · 동료 <b>${net.peerCount}</b>명` +
      (net.isHost ? '<br><span class="m-host">내가 호스트 (몬스터 담당)</span>' : '<br>호스트에 연결됨');
  }

  mBtn.addEventListener('click', () => {
    if (net.connected) {
      net.leave();
      ghosts.clear();
    } else {
      const code = (mRoom.value || '').trim();
      if (!code) { mRoom.focus(); return; }
      net.join(code);
    }
    renderNetStatus();
  });
  // 입력창에 포커스가 있을 때 게임 단축키가 먹지 않게
  mRoom.addEventListener('keydown', (e) => e.stopPropagation());

  net.onPeerJoin = renderNetStatus;
  net.onPeerLeave = (id) => { ghosts.remove(id); renderNetStatus(); };

  // 비호스트: 호스트가 보낸 몬스터 상태를 그대로 반영한다
  net.onMonsterSnapshot = (snap) => {
    for (const m of snap) {
      const mon = monsters.list[m.i];
      if (!mon) continue;
      mon.netTarget = { x: m.x, z: m.z, ry: m.r };
      mon.hp = m.h;
      if (m.d && !mon.dead) mon.takeDamage(99999, null, 0, 0);
      else if (!m.d && mon.dead) { mon.dead = false; mon.hp = m.h; mon.respawnT = 0; mon.setVisible(true); mon.hpBg.setEnabled(true); mon.hpBar.setEnabled(true); }
    }
  };

  // 호스트: 다른 피어가 보고한 타격을 실제 피해로 적용한다
  net.onHitReport = (rep) => {
    const mon = monsters.list[rep.i];
    if (!mon || mon.dead) return;
    const killed = mon.takeDamage(rep.d, { x: rep.x, z: rep.z }, rep.k, rep.u);
    if (killed) drops.spawnFor(mon.cfg, mon.group.position, mon.cfg.jelly);
  };

  // 몬스터가 피해를 입을 때: 비호스트면 직접 적용하지 않고 호스트에 보고한다
  projectiles.reportDamage = (monster, dmg, dir, knock, knockUp) =>
    player.reportDamage(monster, dmg, dir, knock, knockUp);
  player.reportDamage = (monster, dmg, dir, knock, knockUp) => {
    if (!net.connected || net.isHost) return false;
    const i = monsters.list.indexOf(monster);
    if (i < 0) return false;
    net.reportHit(i, dmg, dir.x, dir.z, knock, knockUp);
    return true;
  };

  renderNetStatus();

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

    // 자동 사냥: 대상이 없거나 죽었으면 가까운 적을 새로 고른다
    if (autoHunt && !talking) {
      const cur = player.attackTarget;
      if (!cur || cur.dead) {
        let best = null;
        let bd = 40;
        for (const m of monsters.list) {
          if (m.dead) continue;
          if (m.cfg.isBoss && stats.level < 8) continue;   // 저레벨에 보스로 돌진하지 않게
          const dd = Math.hypot(m.group.position.x - player.group.position.x,
                                m.group.position.z - player.group.position.z);
          if (dd < bd) { bd = dd; best = m; }
        }
        if (best) {
          player.attackTarget = best;
          player.moveTarget = null;
        }
      }
      // 체력이 바닥나면 물러나 회복부터
      if (player.hp < player.maxHp * 0.3 && stats.items.jelly > 0) useJelly();
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
    // 몬스터 AI는 호스트만 돌린다. 비호스트는 받은 좌표로 부드럽게 따라간다.
    if (!net.connected || net.isHost) {
      monsters.update(d, party);
    } else {
      for (const m of monsters.list) {
        if (!m.netTarget) continue;
        const k = Math.min(1, d * 12);
        m.group.position.x += (m.netTarget.x - m.group.position.x) * k;
        m.group.position.z += (m.netTarget.z - m.group.position.z) * k;
        let df = m.netTarget.ry - m.group.rotation.y;
        df = Math.atan2(Math.sin(df), Math.cos(df));
        m.group.rotation.y += df * k;
        if (m.hpBar) m.hpBar.scaling.x = Math.max(0, m.hp / m.cfg.hp);
        if (m.anims) { m.animLock = Math.max(0, (m.animLock || 0) - d); if (m.animLock <= 0) m.playAnim('walk', 1.1); }
      }
    }
    ghosts.update(d, net.peers);
    net.tick(d,
      () => ({
        x: +player.group.position.x.toFixed(2),
        z: +player.group.position.z.toFixed(2),
        ry: +player.group.rotation.y.toFixed(2),
        a: player.currentKey || 'idle',
        n: CHARACTERS[charKey].name,
        lv: stats.level
      }),
      () => monsters.list.map((m, i) => ({
        i, x: +m.group.position.x.toFixed(2), z: +m.group.position.z.toFixed(2),
        r: +m.group.rotation.y.toFixed(2), h: Math.round(m.hp), d: m.dead ? 1 : 0
      }))
    );
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
    drops.update(d, player, (item) => {
      if (!item) { addJelly(1); sfx.pickup(); return; }
      const amt = Array.isArray(item.amount)
        ? item.amount[0] + Math.floor(Math.random() * (item.amount[1] - item.amount[0] + 1))
        : item.amount;
      switch (item.effect) {
        case 'jelly': addJelly(amt); break;
        case 'gold': addGold(amt); break;
        case 'item': addItem(item.key, 1); break;   // 소모품은 소지품에 쌓인다
      }
      showPickup(item, amt);
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
    companions, party, marker, net, ghosts, vfx, drops,
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
