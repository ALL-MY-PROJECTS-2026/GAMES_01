import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  PhysicsAggregate,
  PhysicsShapeType
} from '@babylonjs/core';

const PICKUP_RANGE = 1.1;
const MAGNET_RANGE = 3.5;
const LIFETIME = 30;

export class DropManager {
  constructor(scene, physicsEnabled = true) {
    this.scene = scene;
    this.physicsEnabled = physicsEnabled;
    this.mat = new StandardMaterial('jellyMat', scene);
    this.mat.diffuseColor = Color3.FromHexString('#7ede5a');
    this.mat.emissiveColor = Color3.FromHexString('#1d5c10');
    this.mat.specularColor = new Color3(0, 0, 0);
    this.list = [];
  }

  spawn(pos) {
    const mesh = MeshBuilder.CreatePolyhedron('jelly', { type: 3, size: 0.22 }, this.scene);
    mesh.material = this.mat;
    mesh.position.set(pos.x, 0.8, pos.z);

    let agg = null;
    if (this.physicsEnabled) {
      agg = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.SPHERE,
        { mass: 0.3, restitution: 0.55, friction: 0.6 },
        this.scene
      );
      agg.body.setLinearVelocity(
        new Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 2.5, (Math.random() - 0.5) * 4)
      );
      agg.body.setAngularVelocity(
        new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      );
    }
    this.list.push({ mesh, agg, t: 0, life: LIFETIME });
  }

  _removePhysics(d) {
    if (d.agg) {
      d.agg.dispose();
      d.agg = null;
      if (d.mesh.rotationQuaternion) {
        d.mesh.rotationQuaternion = null;
        d.mesh.rotation.set(0, 0, 0);
      }
    }
  }

  _dispose(i) {
    const d = this.list[i];
    this._removePhysics(d);
    d.mesh.dispose();
    this.list.splice(i, 1);
  }

  update(delta, player, onPickup) {
    const ppos = player.group.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += delta;
      d.life -= delta;

      if (d.agg) {
        const dist = Math.hypot(ppos.x - d.mesh.position.x, ppos.z - d.mesh.position.z);
        if (d.t > 0.6 && dist < MAGNET_RANGE) this._removePhysics(d);
      } else {
        d.mesh.rotation.y += delta * 2;
        d.mesh.position.y = Math.max(d.mesh.position.y, 0.3 + Math.sin(d.t * 3) * 0.08);

        const dx = ppos.x - d.mesh.position.x;
        const dz = ppos.z - d.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < MAGNET_RANGE && dist > 0.01) {
          const pull = (1 - dist / MAGNET_RANGE) * 7 * delta;
          d.mesh.position.x += (dx / dist) * pull;
          d.mesh.position.z += (dz / dist) * pull;
          d.mesh.position.y += (0.7 - d.mesh.position.y) * 4 * delta;
        }
        if (dist < PICKUP_RANGE) {
          this._dispose(i);
          if (onPickup) onPickup();
          continue;
        }
      }

      if (d.life <= 0) this._dispose(i);
    }
  }
}
