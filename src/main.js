import { createScene } from './core/scene.js';
import { Input } from './core/input.js';
import { initPhysics, addStaticWorld } from './core/physics.js';
import { buildWorld } from './world/ground.js';
import { MonsterManager } from './world/monsters.js';
import { NPCManager } from './world/npcs.js';
import { DropManager } from './world/drops.js';
import { ProjectileManager } from './world/projectiles.js';
import { initDialog, isDialogOpen, openDialog, advanceDialog } from './ui/dialog.js';
import { bindPlayer, addXp, addGold, addJelly, useJelly } from './core/stats.js';
import { Player } from './player/player.js';
import { ThirdPersonCamera } from './player/camera.js';
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
  player.onKill = (m) => {
    addXp(12);
    addGold(3 + Math.floor(Math.random() * 5));
    drops.spawn(m.group.position);
  };

  initHUD();
  initDialog();
  initAudio();
  bindPlayer(player);
  setMP(100, 100);

  const weaponKeys = { Digit2: 'punch', Digit3: 'sword', Digit4: 'gun' };
  setActiveWeapon(player.weapon);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') toggleInventory();
    if (e.code === 'Digit1') useJelly();
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
      if (isDialogOpen()) advanceDialog();
      else if (nearNpc) openDialog(nearNpc);
    }
    const talking = isDialogOpen();
    if (!talking && nearNpc) {
      talkHint.innerHTML = `<b>E</b> 대화하기 — ${nearNpc.name}`;
      talkHint.style.display = 'block';
    } else {
      talkHint.style.display = 'none';
    }

    if (!talking) player.tryAttack(input, monsters.list, camRig);
    player.update(delta, talking ? idleInput : input, camRig);

    monsters.update(delta, player);
    projectiles.update(delta, monsters.list, (m, killed) => {
      if (killed) {
        sfx.kill();
        if (player.onKill) player.onKill(m);
      } else {
        sfx.hit();
      }
    });
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
