import * as THREE from 'three';

const VALID_COLOR = new THREE.Color(0x58f3e3);
const BLOCKED_COLOR = new THREE.Color(0xff765f);

export class BlinkPreviewRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'blink-destination-preview';
    this.group.visible = false;
    this.group.renderOrder = 40;

    this.material = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.92, 48),
      this.material,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 40;
    this.group.add(this.ring);

    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.core = new THREE.Mesh(
      new THREE.CircleGeometry(0.68, 48),
      this.coreMaterial,
    );
    this.core.rotation.x = -Math.PI / 2;
    this.core.position.y = 0.002;
    this.core.renderOrder = 39;
    this.group.add(this.core);

    const chevronGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.34, 0.018, 0.2),
      new THREE.Vector3(0, 0.018, -0.22),
      new THREE.Vector3(0.34, 0.018, 0.2),
    ]);
    this.chevronMaterial = new THREE.LineBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.chevron = new THREE.Line(chevronGeometry, this.chevronMaterial);
    this.chevron.renderOrder = 41;
    this.group.add(this.chevron);

    this.blockedGlyph = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.3, 0.022, -0.3),
        new THREE.Vector3(0.3, 0.022, 0.3),
        new THREE.Vector3(-0.3, 0.022, 0.3),
        new THREE.Vector3(0.3, 0.022, -0.3),
      ]),
      this.chevronMaterial,
    );
    this.blockedGlyph.renderOrder = 42;
    this.blockedGlyph.visible = false;
    this.group.add(this.blockedGlyph);

    this.rangeMaterial = new THREE.LineDashedMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.42,
      dashSize: 0.55,
      gapSize: 0.3,
      depthWrite: false,
    });
    this.rangeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, 1),
      ]),
      this.rangeMaterial,
    );
    this.rangeLine.computeLineDistances();
    this.rangeLine.frustumCulled = false;
    this.rangeLine.renderOrder = 38;
    this.scene.add(this.rangeLine);
    this.rangeLine.visible = false;
    this.scene.add(this.group);
  }

  update(preview, elapsedSeconds = 0, reducedMotion = false) {
    const active = preview?.active === true && preview?.destination?.isVector3;
    this.group.visible = active;
    this.rangeLine.visible = active;
    if (!active) return;

    const color = preview.valid ? VALID_COLOR : BLOCKED_COLOR;
    this.material.color.copy(color);
    this.coreMaterial.color.copy(color);
    this.chevronMaterial.color.copy(color);
    this.rangeMaterial.color.copy(color);
    this.group.position.copy(preview.destination);
    this.group.position.y += 0.025;
    this.group.rotation.y = preview.yaw || 0;
    this.chevron.visible = preview.valid;
    this.blockedGlyph.visible = !preview.valid;

    const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsedSeconds * 8) * 0.035;
    this.ring.scale.setScalar(pulse);
    this.material.opacity = preview.valid ? 0.72 : 0.86;
    this.coreMaterial.opacity = preview.valid ? 0.16 : 0.24;

    const positions = this.rangeLine.geometry.attributes.position;
    positions.setXYZ(0, preview.origin.x, preview.origin.y - 1.25, preview.origin.z);
    positions.setXYZ(
      1,
      preview.destination.x,
      preview.destination.y + 0.04,
      preview.destination.z,
    );
    positions.needsUpdate = true;
    this.rangeLine.computeLineDistances();
  }

  hide() {
    this.group.visible = false;
    this.rangeLine.visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.rangeLine);
    this.ring.geometry.dispose();
    this.core.geometry.dispose();
    this.chevron.geometry.dispose();
    this.blockedGlyph.geometry.dispose();
    this.rangeLine.geometry.dispose();
    this.material.dispose();
    this.coreMaterial.dispose();
    this.chevronMaterial.dispose();
    this.rangeMaterial.dispose();
  }
}
