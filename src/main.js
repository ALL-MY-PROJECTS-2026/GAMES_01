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
import { bindPlayer, addXp, addGold, addJelly, useJelly, stats } from './core/stats.js';
import { Player } from './player/player.js';
import { CompanionManager } from './player/companions.js';
import { WEAPONS } from './player/weapons.js';
import { ThirdPersonCamera } from './player/camera.js';
import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { Minimap } from './ui/minimap.js';
import { initHUD, setMP, toggleInventory, setActiveWeapon } from './ui/hud.js';
import { sfx, initAudio } from './core/sfx.js';

async function boot() {
  const { engine, scene, canvas, shadow } = createScene(document.getElementById('app'));
  const input = new Input(canvas);

  await initPhysics(scene);
  const { obstacles, ground } = buildWorld(scene, shadow);
  addStaticWorld(scene, ground, obstacles);

  const player = new Player(scene, obstacles, shadow);
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
  const companions = new CompanionManager(scene, shadow);
  const party = [player, ...companions.list];

  scene.cameraToUseForPointers = camRig.cam;

  const marker = MeshBuilder.CreateDisc('moveMarker', { radius: 0.5, tessellation: 24 }, scene);
  const markerMat = new StandardMaterial('markerMat', scene);
  markerMat.emissiveColor = Color3.FromHexString('#e8c25f');
  markerMat.disableLighting = true;
  markerMat.alpha = 0.55;
  marker.material = markerMat;
  marker.rotation.x = Math.PI / 2;
  marker.setEnabled(false);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isDialogOpen() || isShopOpen()) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    if (!pick || !pick.hit) return;
    const mon = pick.pickedMesh && pick.pickedMesh.metadata && pick.pickedMesh.metadata.monster;
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
  initDialog();
  initShop();
  initAudio();
  bindPlayer(player);
  setMP(100, 100);

  const weaponKeys = { Digit2: 'punch', Digit3: 'sword', Digit4: 'gun' };
  setActiveWeapon(player.weapon);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') toggleInventory();
    if (e.code === 'Digit1') useJelly();
    if (e.code === 'Escape') closeShop();
    if (weaponKeys[e.code] && player.setWeapon(weaponKeys[e.code])) {
      setActiveWeapon(player.weapon);
    }
  });

  const talkHint = document.getElementById('talk-hint');
  const idleInput = {
    pressed: () => false,
    consumeAttack: () => false
  };

  function update(delta) {
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
        const w = WEAPONS[player.weapon];
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
    player.update(delta, talking ? idleInput : input, camRig);

    const handleHit = (m, killed) => {
      if (killed) {
        sfx.kill();
        if (player.onKill) player.onKill(m);
      } else {
        sfx.hit();
      }
    };
    monsters.update(delta, party);
    companions.update(delta, player, monsters.list, obstacles, projectiles, handleHit);
    projectiles.update(delta, monsters.list, handleHit);
    npcs.update(delta, player);
    drops.update(delta, player, () => {
      addJelly(1);
      sfx.pickup();
    });
    camRig.update(delta, input, player, player.speedFov);
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

  engine.runRenderLoop(() => {
    const delta = Math.min(Math.max(engine.getDeltaTime() / 1000, 0.001), 0.05);
    update(delta);
    scene.render();
  });
}

boot();
