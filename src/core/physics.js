import { Vector3, MeshBuilder, PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import HavokPhysics from '@babylonjs/havok';
import { WORLD_HALF } from '../world/ground.js';

export async function initPhysics(scene) {
  const havok = await HavokPhysics();
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -22, 0), plugin);
  return plugin;
}

/**
 * 지형의 정적 물리를 세운다. 존을 바꿀 때 걷어내야 하므로 dispose를 돌려준다.
 */
export function addStaticWorld(scene, groundMesh, obstacles) {
  const made = [];
  const groundAgg = new PhysicsAggregate(
    groundMesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, scene
  );
  made.push({ agg: groundAgg, mesh: null });

  for (const o of obstacles) {
    const col = MeshBuilder.CreateCylinder(
      'obsCol',
      { diameter: o.r * 2, height: 5 },
      scene
    );
    col.position.set(o.x, 2.5, o.z);
    col.isVisible = false;
    made.push({ agg: new PhysicsAggregate(col, PhysicsShapeType.CYLINDER, { mass: 0 }, scene), mesh: col });
  }

  return {
    dispose() {
      for (const m of made) {
        if (m.agg) m.agg.dispose();
        if (m.mesh) m.mesh.dispose();
      }
      made.length = 0;
    }
  };
}
