import { createScene } from './core/scene.js';
import { Input } from './core/input.js';
import { initPhysics, addStaticWorld } from './core/physics.js';
import { buildWorld } from './world/ground.js';
import { zoneOf, SEAL_COST, sealReward } from './world/zones.js';
import { MonsterManager } from './world/monsters.js';
import { NPCManager } from './world/npcs.js';
import { DropManager } from './world/drops.js';
import { ProjectileManager } from './world/projectiles.js';
import { initDialog, isDialogOpen, openDialog, advanceDialog } from './ui/dialog.js';
import { initShop, isShopOpen, openShop, closeShop } from './ui/shop.js';
import { initSkills, toggleSkills, closeSkills } from './ui/skills.js';
import { CHARACTERS } from './core/characters.js';
import {
  bindPlayer, addXp, addGold, addJelly, useJelly, stats, grantWeapon, loadZoneKey, setZone,
  sealedIn, markSealed
} from './core/stats.js';
import { Player } from './player/player.js';
import { CompanionManager } from './player/companions.js';
import { WEAPONS } from './player/weapons.js';
import { applyWeaponSkills } from './core/skills.js';
import { ThirdPersonCamera } from './player/camera.js';
import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { Minimap } from './ui/minimap.js';
import {
  initHUD, setMP, setHP, toggleInventory, setActiveWeapon, setPlayerIdentity, setBossBar,
  showPickup, setAutoHunt, showToast, setQuest
} from './ui/hud.js';
import { sfx, initAudio } from './core/sfx.js';
import { juice, hitstop, shake } from './core/juice.js';
import { setLoadingTotal, loadingStep, finishLoading } from './ui/loading.js';
import { VFX } from './world/vfx.js';
import {
  initSpellBar, getSelectedSpell, setSpellCooldown, setSpellAffordable, selectSpellByIndex
} from './ui/spellbar.js';
import { SPELLS, SPELL_ORDER, castClipOf } from './core/spells.js';
import {
  currentStep, currentChapter, questProgress, isChapterDone,
  onKillFor, onSeal, onOffer, offerNeeded
} from './core/quest.js';
import { net } from './net/net.js';
import { GhostManager } from './net/ghosts.js';
import { initInventory, addItem, renderInventory } from './ui/inventory.js';
import { initChat, isChatOpen, openChat, closeChat, pushChat, updateChat } from './ui/chat.js';

async function boot() {
  setLoadingTotal(5);
  const { engine, scene, canvas, shadow } = createScene(document.getElementById('app'));
  // 픽셀 비율 상한 (STACK.md §14) — 고DPI 화면에서 픽셀을 4배 그리는 낭비를 막는다
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  const input = new Input(canvas);

  loadingStep('물리 엔진 준비 중…');
  await initPhysics(scene);
  // 시작 존 — 세이브에 남아 있으면 그 자리에서 이어 한다
  let zone = zoneOf(loadZoneKey());
  loadingStep(`${zone.name}을(를) 그리는 중…`);
  // obstacles 배열은 여러 곳이 참조로 들고 있으므로, 존을 바꿀 때
  // 새 배열로 갈아끼우지 않고 이 배열의 내용만 바꾼다
  const obstacles = [];
  let world = buildWorld(scene, shadow, zone);
  obstacles.push(...world.obstacles);
  let worldPhys = addStaticWorld(scene, world.ground, obstacles);

  // 단일 주인공으로 바로 시작 (선택 화면 없음)
  loadingStep('퇴마사를 부르는 중…');
  const charKey = 'ilim';
  const player = new Player(scene, obstacles, shadow, charKey);
  player.group.position.set(zone.start.x, 0, zone.start.z);
  loadingStep('원귀를 깨우는 중…');
  const monsters = new MonsterManager(scene, obstacles, shadow);
  monsters.load(zone, sealedIn(zone.key));
  const npcs = new NPCManager(scene, obstacles, shadow);
  // 사당 마을(청운·소하)은 초원에만 있다
  for (const npc of npcs.list) npc.group.setEnabled(!!zone.hasNpc);
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

  // ── 관문 ──────────────────────────────────────────────────
  // 존 경계에 세우는 빛기둥. 밟으면 다음 구역으로 넘어간다.
  let portals = [];
  function buildPortals() {
    for (const p of portals) p.mesh.dispose();
    portals = [];
    for (const exit of (zone.exits || [])) {
      const mesh = MeshBuilder.CreateCylinder(
        'portal', { diameter: 3.2, height: 7, tessellation: 20 }, scene
      );
      const mat = new StandardMaterial('portalMat' + exit.to, scene);
      mat.emissiveColor = Color3.FromHexString('#9fd8ff');
      mat.diffuseColor = new Color3(0, 0, 0);
      mat.disableLighting = true;
      mat.alpha = 0.32;
      mat.backFaceCulling = false;
      mesh.material = mat;
      mesh.position.set(exit.x, 3.5, exit.z);
      mesh.isPickable = false;
      portals.push({ mesh, exit });
    }
  }
  buildPortals();

  // ── 귀문 균열 ─────────────────────────────────────────────
  // 마물이 스며 나오는 구멍. 혼백을 바쳐 봉인하면 그 구멍은 멎는다 (REFERENCE.md §5)
  let riftMeshes = [];
  function buildRifts() {
    for (const r of riftMeshes) r.mesh.dispose();
    riftMeshes = [];
    for (const rift of (monsters.rifts || [])) {
      const mesh = MeshBuilder.CreateCylinder(
        'rift', { diameterTop: 4.2, diameterBottom: 1.2, height: 5, tessellation: 16 }, scene
      );
      const mat = new StandardMaterial('riftMat' + rift.id, scene);
      mat.diffuseColor = new Color3(0, 0, 0);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.alpha = 0.5;
      mesh.material = mat;
      mesh.position.set(rift.x, 2.5, rift.z);
      mesh.isPickable = false;
      riftMeshes.push({ mesh, mat, rift });
    }
    paintRifts();
  }
  function paintRifts() {
    for (const r of riftMeshes) {
      r.mat.emissiveColor = Color3.FromHexString(r.rift.sealed ? '#6b7a6b' : '#b06cff');
      r.mat.alpha = r.rift.sealed ? 0.18 : 0.5;
    }
  }
  buildRifts();

  /**
   * 균열 봉인 — 혼백을 바치면 그 구멍이 멎고 경험치를 받는다.
   * 파밍할 구멍만 남기고 지나갈 곳은 막는 선택이 성립한다 (REFERENCE.md §5).
   */
  function sealRift(rift) {
    // 봉인은 리스폰을 바꾸는데 그 계산은 호스트만 한다 — 비호스트가 하면 혼백만 날린다
    if (net.connected && !net.isHost) {
      showToast('봉인은 방장만 할 수 있습니다', '#e24b4a');
      return;
    }
    if (stats.items.jelly < SEAL_COST) {
      showToast(`혼백이 모자랍니다 (${stats.items.jelly}/${SEAL_COST})`, '#e24b4a');
      return;
    }
    if (!monsters.sealRift(rift)) return;
    addJelly(-SEAL_COST);
    const xp = sealReward(rift);
    addXp(xp);
    paintRifts();
    player.playAction('interact');
    sfx.levelup();
    vfx.circle({ x: rift.x, z: rift.z }, { radius: 4.5, color: '#b06cff', dur: 1.6 });
    vfx.flare({ x: rift.x, z: rift.z }, { key: 'symbol', size: 5, color: '#e8d8a8',
      dur: 1.4, grow: 1.2, y: 1.2 });
    showToast(`귀문 균열을 봉인했습니다 — 경험치 +${xp}`, '#b06cff');
    markSealed(zone.key, rift.id);
    announceQuest(onSeal());
  }

  // ── 결계석 ────────────────────────────────────────────────
  // 1장의 목표물 (SCENARIO.md §4). 혼백을 바쳐 되살린다
  let wardMesh = null;
  let wardMat = null;
  function buildWard() {
    if (wardMesh) { wardMesh.dispose(); wardMesh = null; }
    const w = zone.wardStone;
    if (!w) return;
    wardMesh = MeshBuilder.CreateCylinder(
      'wardStone', { diameterTop: 0.5, diameterBottom: 1.6, height: 3.4, tessellation: 6 }, scene
    );
    wardMat = new StandardMaterial('wardMat', scene);
    wardMat.diffuseColor = Color3.FromHexString('#6a675e');
    wardMat.specularColor = new Color3(0, 0, 0);
    wardMesh.material = wardMat;
    wardMesh.position.set(w.x, 1.7, w.z);
    wardMesh.isPickable = false;
    paintWard();
  }
  function paintWard() {
    if (!wardMat) return;
    // 아직 바칠 게 남았으면 어둡고, 되살아나면 타오른다
    const lit = offerNeeded() === 0;
    wardMat.emissiveColor = Color3.FromHexString(lit ? '#ffb03a' : '#2a2620');
  }
  buildWard();

  /** 결계석 봉헌 — 가진 혼백 중 필요한 만큼만 바친다 */
  function offerToWard() {
    const need = offerNeeded();
    if (need <= 0) return;
    const give = Math.min(need, stats.items.jelly);
    if (give <= 0) {
      showToast('바칠 혼백이 없습니다', '#e24b4a');
      return;
    }
    addJelly(-give);
    player.playAction('interact');
    sfx.pickup();
    vfx.circle({ x: wardMesh.position.x, z: wardMesh.position.z },
      { radius: 3, color: '#ffb03a', dur: 1.2 });
    const res = onOffer(give);
    paintWard();
    if (res && !res.advanced) showToast(`결계석에 혼백 ${give}개를 바쳤습니다`, '#ffb03a');
    else if (res) {
      vfx.flare({ x: wardMesh.position.x, z: wardMesh.position.z },
        { key: 'symbol', size: 6, color: '#ffb03a', dur: 1.6, grow: 1.3, y: 2 });
      showToast('결계석이 타오릅니다', '#ffb03a');
    }
    announceQuest(res);
  }

  /**
   * 청운은 지금 해야 할 일을 짚어 준다 — 대사가 진행도를 따라간다.
   * 대사 데이터는 그대로 두고 첫 줄만 앞에 끼운다
   */
  function npcLines(npc) {
    if (npc.role !== 'elder') return npc;
    const step = currentStep();
    const head = step
      ? (step.hint || step.text)
      : '초원의 귀문은 닫혔네. 이제 안개 삼림으로 가게.';
    return { ...npc, lines: [head, ...npc.lines] };
  }

  /**
   * 관문이 열렸는가 — 레벨과 장 진행을 둘 다 본다.
   * 2장은 1장을 끝내야 들어갈 수 있다 (SCENARIO.md §4)
   */
  function portalOpen(exit) {
    if (stats.level < exit.needLevel) return false;
    if (exit.to === 'forest' && !isChapterDone(1)) return false;
    return true;
  }

  /** 추적기를 다시 그린다 */
  function refreshQuest() {
    const q = questProgress();
    setQuest(q.step ? { chapter: currentChapter(), step: q.step, progress: q.progress } : null);
  }

  /** 단계가 넘어갔을 때의 알림 — 장이 끝나면 크게 띄운다 */
  function announceQuest(res) {
    if (!res) return;
    refreshQuest();
    if (!res.advanced) return;
    if (res.chapterDone) {
      showToast('1장 완료 — 안개 삼림으로 가는 길이 열렸습니다', '#ffb03a');
      pushChat(null, '결계석이 되살아났다. 초원의 귀문이 닫혔다.', 'system');
      sfx.levelup();
    } else {
      showToast(`「${res.step.text}」 완료`, '#b06cff');
      if (res.nextStep) pushChat(null, res.nextStep.hint || res.nextStep.text, 'system');
    }
  }

  /** 구역을 갈아끼운다 — 씬은 그대로 두고 지형·몬스터·물리만 바꾼다 */
  let switching = false;
  async function enterZone(key, arrive) {
    if (switching) return;
    switching = true;
    const next = zoneOf(key);
    zone = next;

    // 구역이 바뀌면 방도 갈라진다 (몬스터 인덱스가 어긋나므로)
    if (net.connected) {
      net.leave();
      ghosts.clear();
      pushChat(null, '구역이 바뀌어 방에서 나왔습니다', 'system');
      renderNetStatus();
    }
    monsters.dispose();
    worldPhys.dispose();
    world.dispose();
    obstacles.length = 0;               // 참조를 들고 있는 곳들이 있어 배열은 유지한다

    world = buildWorld(scene, shadow, next);
    obstacles.push(...world.obstacles);
    worldPhys = addStaticWorld(scene, world.ground, obstacles);
    monsters.load(next, sealedIn(next.key));
    monsters.setProjectiles(projectiles);
    buildPortals();
    buildRifts();
    buildWard();
    refreshQuest();

    // 사당 마을(청운·소하)은 초원에만 있다
    for (const npc of npcs.list) npc.group.setEnabled(!!next.hasNpc);

    const at = arrive || next.start;
    player.group.position.set(at.x, 0, at.z);
    player.moveTarget = null;
    player.attackTarget = null;
    marker.setEnabled(false);
    setZone(key);
    showToast(`${next.name} (Lv.${next.level[0]}~${next.level[1]})`, '#9fd8ff');
    pushChat(null, `${next.name}에 들어섰습니다`, 'system');
    switching = false;
  }

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
  // 처치 보상은 applyDamage → onMonsterKilled 에서 기여도대로 지급한다

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
  const myName = CHARACTERS[charKey].name;
  initChat((text) => {
    pushChat(myName, text, 'me');
    if (net.connected) net.broadcast({ t: 'chat', n: myName, m: text });
  });
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
    player.playAction('useItem', 1.5);
    sfx.pickup();
    return true;
  }, (key) => {
    // 소지품에서 무기를 눌러 장착한다
    if (!player.setWeapon(key)) return;
    setActiveWeapon(player.weapon);
    renderInventory(player.weapon);
    sfx.pickup();
  });
  initAudio();
  bindPlayer(player);
  refreshQuest();
  setMP(player.mp, player.maxMp);

  // 무기는 숫자키로 바꾸지 않는다 — 소지품(I)에서 눌러 장착한다
  setActiveWeapon(player.weapon);
  window.addEventListener('keydown', (e) => {
    // 채팅 입력 중에는 게임 단축키가 먹지 않는다
    if (isChatOpen()) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); openChat(); return; }
    if (e.code === 'KeyI') { renderInventory(player.weapon); toggleInventory(); }
    if (e.code === 'KeyK') toggleSkills();
    // F1~F12로 술법 선택
    const fk = /^F([1-9]|1[0-2])$/.exec(e.code);
    if (fk) {
      e.preventDefault();
      selectSpellByIndex(Number(fk[1]) - 1);
      return;
    }
    if (e.code === 'KeyV') { autoHunt = !autoHunt; setAutoHunt(autoHunt); }
    // T — 이펙트 텍스처를 절차적 ↔ Kenney 스프라이트로 번갈아 본다
    if (e.code === 'KeyT') {
      const set = vfx.toggleTextureSet();
      showToast(set === 'kenney' ? '이펙트: Kenney 스프라이트' : '이펙트: 절차적 (기본)');
    }
    if (e.code === 'Digit1') useJelly();
    if (e.code === 'Escape') { closeShop(); closeSkills(); }
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
      pushChat(null, '방에서 나왔습니다', 'system');
    } else {
      const code = (mRoom.value || '').trim();
      if (!code) { mRoom.focus(); return; }
      // 몬스터 스냅샷이 인덱스 기반이라, 구역이 다르면 엉뚱한 개체가 움직인다.
      // 방 이름에 구역을 붙여 애초에 같은 구역끼리만 만나게 한다
      net.join(`${code}@${zone.key}`);
      pushChat(null, `'${code}' 방에 들어왔습니다 (${zone.name})`, 'system');
    }
    renderNetStatus();
  });
  // 입력창에 포커스가 있을 때 게임 단축키가 먹지 않게
  mRoom.addEventListener('keydown', (e) => e.stopPropagation());

  net.onPeerJoin = () => { pushChat(null, '동료가 들어왔습니다', 'system'); renderNetStatus(); };
  net.onPeerLeave = (id) => {
    ghosts.remove(id);
    pushChat(null, '동료가 나갔습니다', 'system');
    renderNetStatus();
  };

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
  net.onHitReport = (rep, peerId) => {
    const mon = monsters.list[rep.i];
    if (!mon || mon.dead) return;
    credit(mon, peerId, rep.d);
    const killed = mon.takeDamage(rep.d, { x: rep.x, z: rep.z }, rep.k, rep.u);
    if (killed) onMonsterKilled(mon);
  };

  // ── 기여도 집계와 보상 분배 ──────────────────────────────
  // 멀티에서는 피해 판정을 호스트가 하므로, 처치 보상도 호스트가 계산해 나눠준다.
  // 누가 얼마나 때렸는지를 몬스터마다 기록해 그 비율대로 경험치·골드·아이템을 준다.
  const SELF = () => (net.connected ? net.selfId : 'me');

  function credit(mon, who, dmg) {
    if (!mon._credit) mon._credit = {};
    mon._credit[who] = (mon._credit[who] || 0) + dmg;
  }

  // 기여 비율 (합이 1)
  function shares(mon) {
    const c = mon._credit || {};
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    if (total <= 0) return { [SELF()]: 1 };
    const out = {};
    for (const [k, v] of Object.entries(c)) out[k] = v / total;
    return out;
  }

  // 가중 추첨으로 아이템 주인을 뽑는다 (많이 때린 쪽이 자주 가져간다)
  function pickOwner(sh) {
    let r = Math.random();
    for (const [k, v] of Object.entries(sh)) { r -= v; if (r <= 0) return k; }
    return Object.keys(sh)[0];
  }

  // 내 몫을 실제로 지급한다
  function grant(cfg, share) {
    if (share <= 0) return;
    const xp = Math.max(1, Math.round(cfg.xp * share));
    const goldBase = cfg.gold[0] + Math.floor(Math.random() * (cfg.gold[1] - cfg.gold[0] + 1));
    addXp(xp);
    addGold(Math.max(1, Math.round(goldBase * share)));
  }

  // 호스트(또는 싱글)에서 처치가 확정됐을 때
  function onMonsterKilled(mon) {
    announceQuest(onKillFor(mon.typeKey));
    const sh = shares(mon);
    // 개체 스탯 — 같은 종이라도 존·거리에 따라 레벨이 달라 보상도 다르다
    const cfg = {
      xp: mon.xpValue, gold: mon.goldRange, jelly: mon.jellyCount,
      hp: mon.maxHp, isBoss: mon.cfg.isBoss
    };
    // 아이템: 개수만큼 주인을 뽑는다
    const owners = [];
    for (let i = 0; i < cfg.jelly; i++) owners.push(pickOwner(sh));
    const pos = { x: mon.group.position.x, z: mon.group.position.z };

    if (net.connected) {
      net.broadcast({ t: 'kill', xp: cfg.xp, g: cfg.gold, sh, o: owners,
        x: pos.x, z: pos.z, hp: cfg.hp, b: cfg.isBoss ? 1 : 0 });
    }
    // 내 몫
    grant(cfg, sh[SELF()] || 0);
    const mine = owners.filter((o) => o === SELF()).length;
    if (mine > 0) drops.spawnFor(cfg, mon.group.position, mine);
    mon._credit = null;
  }

  // 로컬에서 피해를 적용하는 경로 (호스트이거나 싱글) — 기여도를 기록한다
  player.applyDamage = (mon, dmg, dir, knock, knockUp) => {
    credit(mon, SELF(), dmg);
    const killed = mon.takeDamage(dmg, dir, knock, knockUp);
    if (killed) onMonsterKilled(mon);
    return killed;
  };
  projectiles.applyDamage = (mon, dmg, dir, knock, knockUp) =>
    player.applyDamage(mon, dmg, dir, knock, knockUp);

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

  // 내 공격·시전을 동료에게 알린다 (상태 샘플링으로는 짧은 동작을 놓친다)
  player.onAction = (evt) => { if (net.connected) net.broadcast(evt); };

  // 동료의 공격·시전을 그대로 재생한다 (판정은 하지 않는다 — 호스트만 한다)
  net.onEvent = (e, peerId) => {
    const gh = ghosts.map.get(peerId);
    if (gh && e.r !== undefined) { gh.target.ry = e.r; gh.group.rotation.y = e.r; }

    if (e.t === 'kill') {
      const myShare = e.sh && e.sh[net.selfId];
      if (myShare) grant({ xp: e.xp, gold: e.g }, myShare);
      const mine = (e.o || []).filter((o) => o === net.selfId).length;
      // 등급을 그대로 받아 같은 급의 아이템이 나오게 한다
      if (mine > 0) drops.spawnFor({ hp: e.hp || 1, isBoss: !!e.b }, { x: e.x, z: e.z }, mine);
      return;
    }
    if (e.t === 'chat') {
      pushChat(e.n || '동료', e.m, 'peer');
      return;
    }
    if (e.t === 'atk') {
      if (gh) gh.playOnce(e.k, e.s || 1, e.f || 0, e.o === undefined ? 1 : e.o);
      const color = e.w === 'punch' ? '#ffd23e' : e.w === 'sword' ? '#cfe4ff' : '#ffb03a';
      vfx.slash({ x: e.x, z: e.z }, e.r || 0, { radius: 3.2, color, dur: 0.24 });
    } else if (e.t === 'shot') {
      if (gh) gh.playOnce('shoot', 1.6);
      projectiles.spawnVisual({ x: e.ox, y: e.oy, z: e.oz }, { x: e.dx, z: e.dz }, '#ffd666', e.k);
      vfx.burst({ x: e.ox, y: e.oy - 0.9, z: e.oz }, { size: 0.9, color: '#ffd666', dur: 0.16 });
    } else if (e.t === 'bolt') {
      if (gh) gh.playOnce('cast', 1.8);
      projectiles.spawnVisual({ x: e.ox, y: e.oy, z: e.oz }, { x: e.dx, z: e.dz }, e.c, 'bolt');
      vfx.burst({ x: e.ox, y: e.oy - 0.9, z: e.oz }, { size: 1.1, color: e.c, dur: 0.22 });
    } else if (e.t === 'spell') {
      const sp = SPELLS[e.k];
      if (!sp) return;
      if (gh) gh.playOnce(castClipOf(sp), 1.6);
      // 남의 술법도 내 것과 같은 그림으로 보여야 무엇을 쓴 건지 알 수 있다
      const at = { x: e.x, z: e.z };
      const to = { x: e.gx, z: e.gz };
      if (sp.fx === 'frost') {
        vfx.frostNova(at, { radius: sp.radius, color: sp.color });
        vfx.frostSpikes(at, sp.radius, sp.color);
      } else if (sp.fx === 'whirl') {
        vfx.whirl(at, { radius: sp.radius, color: sp.color });
      } else if (sp.fx === 'quake') {
        vfx.quake(at, { radius: sp.radius, color: sp.color });
      } else if (sp.fx === 'stone') {
        vfx.stoneField(at, { radius: sp.radius, color: sp.color });
      } else if (sp.fx === 'heal') {
        if (gh) vfx.heal(gh.group, { color: sp.color });
        else vfx.heal(at, { color: sp.color });
      } else if (sp.fx === 'firewall') {
        if (gh) vfx.aura(gh.group, { radius: sp.radius * 0.55, color: sp.color, dur: sp.duration });
        vfx.circle(at, { radius: sp.radius, color: sp.color, dur: 1.2 });
      } else if (sp.fx === 'iron') {
        if (gh) vfx.aura(gh.group, { radius: 1.5, color: sp.color, dur: sp.duration });
        vfx.flare(at, { key: 'symbol', size: 2.2, color: sp.color, dur: 0.8, grow: 1.3, y: 1.0 });
      } else if (sp.fx === 'spirit') {
        vfx.spiritCall(at, { color: sp.color });
      } else if (sp.fx === 'blaze') {
        vfx.circle(to, { radius: sp.radius, color: sp.color, dur: 0.9 });
        vfx.fireField(to, { radius: sp.radius, color: sp.color, dur: sp.duration });
      } else if (sp.fx === 'ward') {
        if (gh) vfx.aura(gh.group, { radius: 1.5, color: sp.color, dur: sp.duration });
        vfx.circle(at, { radius: 2.4, color: sp.color, dur: 1.1 });
      } else if (sp.fx === 'cry') {
        if (gh) vfx.aura(gh.group, { radius: 1.5, color: sp.color, dur: sp.duration });
        vfx.cry(at, { color: sp.color });
      } else if (sp.fx === 'thunder') {
        vfx.burst(at, { size: 1.6, color: sp.color, dur: 0.28 });
        vfx.circle(at, { radius: 2, color: sp.color, dur: 0.5 });
      } else if (sp.fx === 'gust') {
        vfx.gust(at, e.r || 0, Math.abs(sp.distance), { color: sp.color });
      } else if (sp.fx === 'wind') {
        vfx.windTrail(at, e.r || 0, { color: sp.color });
      } else if (sp.fx === 'meteor' || sp.fx === 'arrows') {
        // 낙하 연출은 호스트/시전자 쪽 타이머를 따라가지 않으므로 여기서 한꺼번에 뿌린다
        vfx.circle(to, { radius: sp.radius, color: sp.color, dur: 1.0 });
        for (let i = 0; i < sp.strikes; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * sp.radius * 0.8;
          const hx = e.gx + Math.cos(a) * rr;
          const hz = e.gz + Math.sin(a) * rr;
          if (sp.fx === 'arrows') {
            vfx.arrowFall({ x: hx, z: hz }, { color: sp.color, count: 4, radius: 1.6 });
          } else {
            vfx.meteor({ x: hx, z: hz }, { color: sp.color, size: 2.2 });
          }
        }
      }
    }
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

    // 관문 — 가까이 가면 안내가 뜨고, 레벨이 되면 밟아서 넘어간다
    let nearPortal = null;
    for (const p of portals) {
      p.mesh.rotation.y += d * 0.6;
      const dx = p.mesh.position.x - player.group.position.x;
      const dz = p.mesh.position.z - player.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6 && (!nearPortal || dist < nearPortal.dist)) {
        nearPortal = { ...p, dist };
      }
    }
    if (nearPortal && nearPortal.dist < 2.0 && !switching && portalOpen(nearPortal.exit)) {
      enterZone(nearPortal.exit.to, nearPortal.exit.arrive);
    }

    // 균열 — 가까이 가면 봉인할 수 있다
    let nearRift = null;
    for (const r of riftMeshes) {
      if (!r.rift.sealed) r.mesh.rotation.y -= d * 1.1;
      const dist = Math.hypot(r.mesh.position.x - player.group.position.x,
                              r.mesh.position.z - player.group.position.z);
      if (dist < 5 && (!nearRift || dist < nearRift.dist)) nearRift = { ...r, dist };
    }

    // 결계석 — 봉헌 단계일 때만 반응한다
    let nearWard = false;
    if (wardMesh) {
      wardMesh.rotation.y += d * 0.25;
      nearWard = Math.hypot(wardMesh.position.x - player.group.position.x,
                            wardMesh.position.z - player.group.position.z) < 4.5;
    }

    const nearNpc = npcs.nearest(player);
    if (input.consumeInteract()) {
      if (isShopOpen()) closeShop();
      else if (isDialogOpen()) advanceDialog();
      else if (nearWard && offerNeeded() > 0) offerToWard();
      else if (nearRift && !nearRift.rift.sealed) sealRift(nearRift.rift);
      else if (nearNpc && nearNpc.role === 'merchant') { player.playAction('interact'); openShop(); }
      else if (nearNpc) { player.playAction('interact'); openDialog(npcLines(nearNpc)); }
    }
    const talking = isDialogOpen() || isShopOpen();
    if (!talking && nearWard) {
      const need = offerNeeded();
      talkHint.innerHTML = need > 0
        ? `<b>E</b> 결계석에 혼백을 바친다 (남은 ${need}개 · 소지 ${stats.items.jelly})`
        : `<b>결계석</b> — 다시 타오르고 있습니다`;
      talkHint.style.display = 'block';
    } else if (!talking && nearRift) {
      const rf = nearRift.rift;
      talkHint.innerHTML = rf.sealed
        ? `<b>봉인된 귀문 균열</b> — 더는 마물이 나오지 않습니다`
        : `<b>E</b> 귀문 균열 봉인 (Lv.${rf.level} · 혼백 ${SEAL_COST}개)`;
      talkHint.style.display = 'block';
    } else if (!talking && nearPortal) {
      const ex = nearPortal.exit;
      const ok = portalOpen(ex);
      talkHint.innerHTML = ok
        ? `<b>${ex.label}</b>로 가는 관문 — 걸어 들어가세요`
        : (stats.level < ex.needLevel
            ? `<b>${ex.label}</b> — Lv.${ex.needLevel} 부터 들어갈 수 있습니다`
            : `<b>${ex.label}</b> — 1장을 끝내야 열립니다`);
      talkHint.style.display = 'block';
    } else if (!talking && nearNpc) {
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
    player.update(d, (talking || isChatOpen()) ? idleInput : input, camRig);

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
        if (m.hpBar) m.hpBar.scaling.x = Math.max(0, m.hp / m.maxHp);
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
    player.updateRain(d, monsters.list, handleHit);
    player.updateAuraField(d, monsters.list, handleHit);
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
      // 가만히 서 있을 때만 줍는 동작을 보여준다 (자동 수집으로 연달아 주울 때 튀지 않게)
      player.playAction('pickup', 1.6);
      if (!item) { addJelly(1); sfx.pickup(); return; }
      const amt = Array.isArray(item.amount)
        ? item.amount[0] + Math.floor(Math.random() * (item.amount[1] - item.amount[0] + 1))
        : item.amount;
      switch (item.effect) {
        case 'jelly': addJelly(amt); break;
        case 'gold': addGold(amt); break;
        case 'item': addItem(item.key, 1); break;   // 소모품은 소지품에 쌓인다
        case 'weapon':
          // 무기는 영구 해금 — 얻는 즉시 손에 쥐어주고 무기창을 새로 그린다
          if (grantWeapon(item.weapon)) {
            if (player.setWeapon(item.weapon)) setActiveWeapon(player.weapon);
            renderInventory(player.weapon);
            sfx.levelup();
            showToast(`${WEAPONS[item.weapon].name}을(를) 얻었다 — I 에서 장착`);
          }
          break;
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
    // 조준 보조 — 원거리 무기·지점 술법의 사거리와 착탄 범위를 바닥에 표시
    {
      const sp = getSelectedSpell();
      const wp = WEAPONS[player.weapon];
      const ppos = player.group.position;
      // 사거리 원: 석궁을 들었거나, 지점을 찍는 술법을 고른 경우
      const showRange = wp.type === 'ranged' || (sp && sp.range);
      if (showRange) {
        const rad = sp && sp.range ? sp.range : wp.range;
        vfx.aimRing('range', ppos, rad, sp && sp.range ? sp.color : '#ffd666');
      } else {
        vfx.hideAim('range');
      }
      // 착탄 범위: 지점 술법을 고른 채 마우스를 올린 곳
      if (sp && sp.radius && (sp.kind === 'ground' || sp.kind === 'rain')) {
        const pk = scene.pick(scene.pointerX, scene.pointerY, undefined, false, camRig.cam);
        if (pk && pk.hit && pk.pickedPoint) {
          const dx = pk.pickedPoint.x - ppos.x;
          const dz = pk.pickedPoint.z - ppos.z;
          const dd = Math.hypot(dx, dz);
          const k = dd > sp.range ? sp.range / dd : 1;
          vfx.aimRing('area', { x: ppos.x + dx * k, z: ppos.z + dz * k }, sp.radius, sp.color);
        }
      } else {
        vfx.hideAim('area');
      }
    }

    updateChat(delta);
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
