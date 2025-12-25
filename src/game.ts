import * as THREE from 'three';

const STORAGE_KEY = 'unlimitedfun-best-hats';

type ObstacleKind = 'doorway' | 'sign' | 'finish';
type HatKind = 'top' | 'cap' | 'beanie' | 'crown';

type HatPickup = {
  mesh: THREE.Group;
  lane: number;
  kind: HatKind;
  spin: number;
  bob: number;
};

type Obstacle = {
  mesh: THREE.Group;
  lane: number;
  kind: ObstacleKind;
  hitWidth: number;
  hitDepth: number;
  baseX: number;
  swingAmp: number;
  swingSpeed: number;
  swingPhase: number;
  spent: boolean;
};

type FallenHat = {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
};

type HudElements = {
  hats: HTMLElement;
  distance: HTMLElement;
  best: HTMLElement;
  message: HTMLElement;
};

export class RunnerGame {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private player: THREE.Group;
  private playerBodyMaterial: THREE.MeshStandardMaterial;
  private playerAccentMaterial: THREE.MeshStandardMaterial;

  private laneWidth = 3.2;
  private laneXs: number[] = [];
  private targetLane = 1;

  private worldScale = 1 / 40;
  private speed = 260;
  private maxSpeed = 520;
  private speedRamp = 6;
  private spawnTimer = 0;
  private spawnInterval = 0.72;
  private minSpawnInterval = 0.36;
  private graceTimer = 0;
  private graceDuration = 0.9;

  private distance = 0;
  private distanceScale = 0.08;
  private finishDistance = 650;
  private finishSpawned = false;

  private hats = 0;
  private bestHats = 0;

  private hatPickups: HatPickup[] = [];
  private obstacles: Obstacle[] = [];
  private fallenHats: FallenHat[] = [];
  private stackHats: THREE.Group[] = [];

  private hatKinds: HatKind[] = ['top', 'beanie', 'cap', 'crown'];
  private hatSpacing = 0.45;
  private hatPickupY = 2.15;
  private headTopY = 2.2;
  private hatPulseDuration = 0.12;

  private hatMaterials: Record<HatKind, THREE.MeshStandardMaterial>;
  private hatAccentMaterial: THREE.MeshStandardMaterial;

  private roadSegments: THREE.Group[] = [];
  private speedStreaks: THREE.Mesh[] = [];
  private segmentLength = 42;
  private scrollLength = 0;

  private pointerStart: { x: number; y: number } | null = null;
  private swipeConsumed = false;
  private hitCooldown = 0;
  private hasStarted = false;
  private isGameOver = false;
  private isFinished = false;

  private shakeTime = 0;
  private shakeDuration = 0.2;
  private shakeStrength = 0.2;
  private playerFlash = 0;
  private playerFlashDuration = 0.2;

  private playerHitWidth = 0.6;
  private playerHitDepth = 0.6;

  private spawnDepth = 40;
  private spawnSpacing = 6;
  private hatTrailSpacing = 4;

  private cleanupZ = 12;

  private ui: HudElements;

  private lastTime = 0;

  private cameraTarget = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private tempVec = new THREE.Vector3();
  private tempQuat = new THREE.Quaternion();

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.setAttribute('aria-label', 'Unlimited Fun 3D runner');
    this.container.setAttribute('role', 'application');

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf4d8c4, 18, 72);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 140);
    this.camera.position.set(0, 6.4, 11.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);

    this.ui = this.createHud(this.container);

    this.laneXs = [-this.laneWidth, 0, this.laneWidth];

    this.hatAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.3,
      metalness: 0.3,
      emissive: new THREE.Color(0x9a3412),
      emissiveIntensity: 0.2
    });
    this.hatMaterials = {
      top: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.2 }),
      cap: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.1 }),
      beanie: new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5, metalness: 0.1 }),
      crown: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.25,
        metalness: 0.4,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 0.35
      })
    };

    this.playerBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(0x0b2f27),
      emissiveIntensity: 0
    });
    this.playerAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.7,
      metalness: 0.05
    });

    this.player = this.createPlayer();
    this.scene.add(this.player);

    this.createEnvironment();
    this.setupInput();

    this.bestHats = this.loadBest();
    this.ui.best.textContent = `Best ${this.bestHats}`;
    this.updateHud();

    this.graceTimer = this.graceDuration;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    const delta = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.update(time, delta);
    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(this.tick);
  };

  private handleResize = () => {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  };

  private update(time: number, delta: number) {
    const isActive = !this.isGameOver && !this.isFinished;

    if (isActive) {
      this.speed = Math.min(this.maxSpeed, this.speed + this.speedRamp * delta);
      this.distance += this.speed * delta * this.distanceScale;
    }

    if (this.hitCooldown > 0) {
      this.hitCooldown = Math.max(0, this.hitCooldown - delta);
    }

    if (isActive && this.graceTimer > 0) {
      this.graceTimer = Math.max(0, this.graceTimer - delta);
    }

    this.updatePlayer(time, delta);
    this.updateHatStack(time, delta);
    this.updateEnvironment(delta);
    this.updateHatPickups(time, delta);
    this.updateObstacles(time, delta);
    this.updateFallenHats(delta);

    if (isActive) {
      if (!this.finishSpawned && this.distance >= this.finishDistance) {
        this.spawnFinishGate();
      }

      if (!this.finishSpawned && this.graceTimer <= 0) {
        this.spawnTimer += delta;
        const spawnInterval = Math.max(
          this.minSpawnInterval,
          this.spawnInterval - (this.speed - 220) * 0.0006
        );
        if (this.spawnTimer >= spawnInterval) {
          this.spawnTimer = 0;
          this.spawnWave();
        }
      }

      this.updateHud();
    }
  }

  private setupInput() {
    const handlePointerDown = (event: PointerEvent) => {
      if (this.isGameOver || this.isFinished) {
        this.resetRun();
        return;
      }

      this.pointerStart = { x: event.clientX, y: event.clientY };
      this.swipeConsumed = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!this.pointerStart || this.swipeConsumed) {
        return;
      }
      this.trySwipe(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!this.pointerStart) {
        return;
      }
      this.trySwipe(event);
      this.pointerStart = null;
    };

    this.renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    window.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        this.shiftLane(-1);
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        this.shiftLane(1);
      }
      if (event.code === 'Space' && (this.isGameOver || this.isFinished)) {
        this.resetRun();
      }
    });
  }

  private trySwipe(event: PointerEvent) {
    if (this.isGameOver || this.isFinished || !this.pointerStart || this.swipeConsumed) {
      return;
    }

    const deltaX = event.clientX - this.pointerStart.x;
    const deltaY = event.clientY - this.pointerStart.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
      this.shiftLane(deltaX > 0 ? 1 : -1);
      this.swipeConsumed = true;
    }
  }

  private shiftLane(direction: number) {
    if (this.isGameOver || this.isFinished) {
      return;
    }

    const nextLane = THREE.MathUtils.clamp(this.targetLane + direction, 0, this.laneXs.length - 1);
    if (nextLane !== this.targetLane) {
      this.targetLane = nextLane;
      if (!this.hasStarted) {
        this.hasStarted = true;
        const message = this.ui.message.textContent ?? '';
        this.setMessage(message, false);
      }
    }
  }

  private updatePlayer(time: number, delta: number) {
    const targetX = this.laneXs[this.targetLane];
    const deltaX = targetX - this.player.position.x;
    this.player.position.x += deltaX * 0.2;

    const timeSeconds = time * 0.001;
    this.player.position.y = Math.sin(timeSeconds * 5) * 0.04;
    this.player.rotation.z = THREE.MathUtils.clamp(deltaX * 0.1, -0.35, 0.35);

    if (this.playerFlash > 0) {
      this.playerFlash = Math.max(0, this.playerFlash - delta);
      const intensity = (this.playerFlash / this.playerFlashDuration) * 1.4;
      this.playerBodyMaterial.emissiveIntensity = intensity;
    } else {
      this.playerBodyMaterial.emissiveIntensity = 0;
    }

    this.updateCamera(timeSeconds, delta);
  }

  private updateCamera(timeSeconds: number, delta: number) {
    const followX = this.player.position.x * 0.4;
    const targetY = 6.4 + Math.sin(timeSeconds * 1.8) * 0.05;
    this.cameraTarget.set(followX, targetY, 11.5);
    this.camera.position.lerp(this.cameraTarget, 0.08);

    this.lookTarget.set(this.player.position.x * 0.6, 1.9, -10.5);
    this.camera.lookAt(this.lookTarget);

    if (this.shakeTime > 0) {
      const shake = (this.shakeTime / this.shakeDuration) * this.shakeStrength;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.shakeTime = Math.max(0, this.shakeTime - delta);
    }
  }

  private updateHatStack(time: number, delta: number) {
    const timeSeconds = time * 0.001;
    for (let i = 0; i < this.stackHats.length; i += 1) {
      const hat = this.stackHats[i];
      const sway = Math.sin(timeSeconds * 2.4 + i * 0.7) * 0.08;
      hat.position.x = sway * 0.35;
      hat.position.y = this.headTopY + i * this.hatSpacing + Math.sin(timeSeconds * 3 + i) * 0.02;
      hat.position.z = 0;
      hat.rotation.z = sway * 0.8;

      const pulse = hat.userData.pulse as number | undefined;
      const baseScale = (hat.userData.baseScale as number | undefined) ?? 1;
      if (pulse && pulse > 0) {
        const nextPulse = Math.max(0, pulse - delta);
        hat.userData.pulse = nextPulse;
        const strength = Math.sin((nextPulse / this.hatPulseDuration) * Math.PI);
        hat.scale.setScalar(baseScale * (1 + strength * 0.12));
      } else {
        hat.scale.setScalar(baseScale);
      }
    }
  }

  private updateEnvironment(delta: number) {
    const dz = this.speed * this.worldScale * delta;
    for (const segment of this.roadSegments) {
      segment.position.z += dz;
      if (segment.position.z > this.segmentLength * 0.5) {
        segment.position.z -= this.scrollLength;
      }
    }

    for (const streak of this.speedStreaks) {
      streak.position.z += dz * 1.4;
      if (streak.position.z > 6) {
        streak.position.z = -this.scrollLength - Math.random() * 12;
        streak.position.x = THREE.MathUtils.randFloat(-this.laneWidth * 1.4, this.laneWidth * 1.4);
        streak.position.y = THREE.MathUtils.randFloat(1.1, 2.4);
        const material = streak.material as THREE.MeshStandardMaterial;
        material.opacity = THREE.MathUtils.randFloat(0.15, 0.45);
      }
    }
  }

  private updateHatPickups(time: number, delta: number) {
    const dz = this.speed * this.worldScale * delta;
    const timeSeconds = time * 0.001;
    const playerX = this.player.position.x;

    for (let i = this.hatPickups.length - 1; i >= 0; i -= 1) {
      const hat = this.hatPickups[i];
      hat.mesh.position.z += dz;
      hat.mesh.rotation.y += hat.spin * delta;
      hat.mesh.position.y = this.hatPickupY + Math.sin(timeSeconds * 2 + hat.bob) * 0.12;

      if (!this.isGameOver && !this.isFinished) {
        const dx = Math.abs(hat.mesh.position.x - playerX);
        const dzAbs = Math.abs(hat.mesh.position.z);
        if (dx < this.playerHitWidth + 0.7 && dzAbs < 0.9) {
          this.collectHat(i);
          continue;
        }
      }

      if (hat.mesh.position.z > this.cleanupZ) {
        this.scene.remove(hat.mesh);
        this.hatPickups.splice(i, 1);
      }
    }
  }

  private updateObstacles(time: number, delta: number) {
    const dz = this.speed * this.worldScale * delta;
    const timeSeconds = time * 0.001;
    const playerX = this.player.position.x;

    for (let i = this.obstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = this.obstacles[i];
      obstacle.mesh.position.z += dz;

      if (obstacle.kind === 'sign') {
        const swing = Math.sin(timeSeconds * obstacle.swingSpeed + obstacle.swingPhase);
        obstacle.mesh.position.x = obstacle.baseX + swing * obstacle.swingAmp;
        obstacle.mesh.rotation.z = swing * 0.25;
      }

      if (!this.isGameOver && !this.isFinished) {
        const dx = Math.abs(obstacle.mesh.position.x - playerX);
        const dzAbs = Math.abs(obstacle.mesh.position.z);
        if (dx < obstacle.hitWidth + this.playerHitWidth && dzAbs < obstacle.hitDepth + this.playerHitDepth) {
          if (obstacle.kind === 'finish') {
            this.finishRun();
          } else if (this.hitCooldown <= 0 && !obstacle.spent) {
            obstacle.spent = true;
            this.hitCooldown = 0.35;
            this.triggerHitFlash();
            const loss = obstacle.kind === 'doorway' ? this.randomInt(2, 3) : this.randomInt(1, 2);
            this.loseHats(loss);
            if (this.hats <= 0) {
              this.gameOver();
            }
          }
        }
      }

      if (obstacle.mesh.position.z > this.cleanupZ) {
        this.scene.remove(obstacle.mesh);
        this.obstacles.splice(i, 1);
      }
    }
  }

  private updateFallenHats(delta: number) {
    for (let i = this.fallenHats.length - 1; i >= 0; i -= 1) {
      const hat = this.fallenHats[i];
      hat.velocity.y -= 9.8 * delta * 0.8;
      hat.mesh.position.addScaledVector(hat.velocity, delta);
      hat.mesh.rotation.x += hat.spin.x * delta;
      hat.mesh.rotation.y += hat.spin.y * delta;
      hat.mesh.rotation.z += hat.spin.z * delta;
      hat.life -= delta;

      if (hat.mesh.position.y < -2 || hat.life <= 0) {
        this.scene.remove(hat.mesh);
        this.fallenHats.splice(i, 1);
      }
    }
  }

  private spawnWave() {
    const lanes = [0, 1, 2];
    this.shuffle(lanes);

    const obstacleRoll = Math.random();
    const blockedLanes: number[] = [];

    if (obstacleRoll < 0.75) {
      const obstacleCount = obstacleRoll < 0.2 ? 2 : 1;
      for (let i = 0; i < obstacleCount; i += 1) {
        const lane = lanes[i];
        blockedLanes.push(lane);
        this.spawnObstacle(lane, -this.spawnDepth - i * this.spawnSpacing);
      }
    }

    const openLanes = lanes.filter((lane) => !blockedLanes.includes(lane));
    if (openLanes.length === 0) {
      openLanes.push(lanes[lanes.length - 1]);
    }

    this.shuffle(openLanes);
    const hatLane = openLanes[0];
    const hatRoll = Math.random();

    if (hatRoll < 0.35) {
      this.spawnHatTrail(hatLane, 3);
    } else {
      this.spawnHat(hatLane, -this.spawnDepth - 4);
      if (openLanes.length > 1 && hatRoll > 0.7) {
        this.spawnHat(openLanes[1], -this.spawnDepth - 10);
      }
    }

    if (Math.random() < 0.25) {
      const extraLane = openLanes[Math.floor(Math.random() * openLanes.length)];
      this.spawnHat(extraLane, -this.spawnDepth - 16);
    }
  }

  private spawnHat(laneIndex: number, spawnZ: number) {
    const kind = this.hatKinds[Math.floor(Math.random() * this.hatKinds.length)];
    const hat = this.createHatModel(kind);
    hat.position.set(this.laneXs[laneIndex], this.hatPickupY, spawnZ);
    hat.scale.setScalar(0.95);
    this.scene.add(hat);
    this.hatPickups.push({
      mesh: hat,
      lane: laneIndex,
      kind,
      spin: THREE.MathUtils.randFloat(0.6, 1.4),
      bob: Math.random() * Math.PI * 2
    });
  }

  private spawnHatTrail(laneIndex: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      this.spawnHat(laneIndex, -this.spawnDepth - i * this.hatTrailSpacing);
    }
  }

  private spawnObstacle(laneIndex: number, spawnZ: number) {
    const kind: ObstacleKind = Math.random() < 0.55 ? 'doorway' : 'sign';
    const obstacle = kind === 'doorway' ? this.createDoorwayModel() : this.createSignModel();
    obstacle.position.set(this.laneXs[laneIndex], 0, spawnZ);
    this.scene.add(obstacle);

    const data: Obstacle = {
      mesh: obstacle,
      lane: laneIndex,
      kind,
      hitWidth: kind === 'doorway' ? 1.35 : 0.9,
      hitDepth: kind === 'doorway' ? 0.75 : 0.6,
      baseX: this.laneXs[laneIndex],
      swingAmp: 0,
      swingSpeed: 0,
      swingPhase: 0,
      spent: false
    };

    if (kind === 'sign') {
      data.swingAmp = THREE.MathUtils.randFloat(0.35, 0.6);
      data.swingSpeed = THREE.MathUtils.randFloat(2.2, 3.4);
      data.swingPhase = Math.random() * Math.PI * 2;
    }

    this.obstacles.push(data);
  }

  private spawnFinishGate() {
    this.finishSpawned = true;
    const gate = this.createFinishGate();
    gate.position.set(0, 0, -this.spawnDepth - 8);
    this.scene.add(gate);
    this.obstacles.push({
      mesh: gate,
      lane: 1,
      kind: 'finish',
      hitWidth: this.laneWidth * 1.8,
      hitDepth: 1.2,
      baseX: 0,
      swingAmp: 0,
      swingSpeed: 0,
      swingPhase: 0,
      spent: false
    });
  }

  private collectHat(index: number) {
    if (this.isGameOver || this.isFinished) {
      return;
    }

    const hat = this.hatPickups[index];
    this.scene.remove(hat.mesh);
    this.hatPickups.splice(index, 1);
    this.addHatToStack(hat.kind);
  }

  private addHatToStack(kind: HatKind) {
    const hat = this.createHatModel(kind);
    hat.position.set(0, this.headTopY + this.stackHats.length * this.hatSpacing, 0);
    hat.userData.baseScale = 0.92;
    hat.userData.pulse = this.hatPulseDuration;
    hat.scale.setScalar(0.92);

    this.player.add(hat);
    this.stackHats.push(hat);
    this.hats = this.stackHats.length;

    if (this.hats > this.bestHats) {
      this.bestHats = this.hats;
      this.saveBest(this.bestHats);
      this.ui.best.textContent = `Best ${this.bestHats}`;
    }

    this.ui.hats.textContent = `Hats ${this.hats}`;
  }

  private triggerHitFlash() {
    this.shakeTime = this.shakeDuration;
    this.playerFlash = this.playerFlashDuration;
  }

  private loseHats(amount: number) {
    const count = Math.min(amount, this.stackHats.length);
    for (let i = 0; i < count; i += 1) {
      const lost = this.stackHats.pop();
      if (!lost) {
        continue;
      }

      lost.getWorldPosition(this.tempVec);
      lost.getWorldQuaternion(this.tempQuat);
      this.player.remove(lost);
      this.scene.add(lost);
      lost.position.copy(this.tempVec);
      lost.quaternion.copy(this.tempQuat);

      const velocity = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloat(1.2, 2.3),
        THREE.MathUtils.randFloat(1.2, 2.8)
      );
      const spin = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(3),
        THREE.MathUtils.randFloatSpread(3),
        THREE.MathUtils.randFloatSpread(3)
      );

      this.fallenHats.push({ mesh: lost, velocity, spin, life: 1.6 });
    }

    this.hats = this.stackHats.length;
    this.ui.hats.textContent = `Hats ${this.hats}`;
  }

  private finishRun() {
    if (this.isFinished) {
      return;
    }

    this.isFinished = true;

    if (this.hats > this.bestHats) {
      this.bestHats = this.hats;
      this.saveBest(this.bestHats);
      this.ui.best.textContent = `Best ${this.bestHats}`;
    }

    this.setMessage(`Finish line!\nStacked ${this.hats} hats\nTap to run again`, true);
  }

  private gameOver() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.setMessage(`Bonked!\nStacked ${this.hats} hats\nTap to retry`, true);
  }

  private resetRun() {
    this.isGameOver = false;
    this.isFinished = false;
    this.finishSpawned = false;
    this.distance = 0;
    this.speed = 260;
    this.spawnTimer = 0;
    this.graceTimer = this.graceDuration;
    this.targetLane = 1;
    this.player.position.set(this.laneXs[this.targetLane], 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.hitCooldown = 0;
    this.pointerStart = null;
    this.hasStarted = false;
    this.playerFlash = 0;
    this.playerBodyMaterial.emissiveIntensity = 0;

    this.clearWorld();
    this.clearStack();

    this.ui.hats.textContent = 'Hats 0';
    this.ui.distance.textContent = `Finish ${this.finishDistance}m`;
    this.setMessage('Swipe to switch lanes\nGrab hats, dodge signs', true);
  }

  private clearWorld() {
    for (const hat of this.hatPickups) {
      this.scene.remove(hat.mesh);
    }
    for (const obstacle of this.obstacles) {
      this.scene.remove(obstacle.mesh);
    }
    for (const hat of this.fallenHats) {
      this.scene.remove(hat.mesh);
    }
    this.hatPickups = [];
    this.obstacles = [];
    this.fallenHats = [];
  }

  private clearStack() {
    for (const hat of this.stackHats) {
      this.player.remove(hat);
    }
    this.stackHats = [];
    this.hats = 0;
  }

  private updateHud() {
    if (!this.finishSpawned) {
      const remaining = Math.max(0, Math.ceil(this.finishDistance - this.distance));
      this.ui.distance.textContent = `Finish ${remaining}m`;
    } else if (!this.isFinished) {
      this.ui.distance.textContent = 'Finish ahead!';
    }
  }

  private setMessage(text: string, visible: boolean) {
    this.ui.message.textContent = text;
    if (visible) {
      this.ui.message.classList.remove('is-hidden');
    } else {
      this.ui.message.classList.add('is-hidden');
    }
  }

  private createHud(container: HTMLElement): HudElements {
    const hud = document.createElement('div');
    hud.id = 'hud';

    const top = document.createElement('div');
    top.id = 'hud-top';

    const hats = document.createElement('div');
    hats.id = 'hud-hats';
    hats.textContent = 'Hats 0';

    const distance = document.createElement('div');
    distance.id = 'hud-distance';
    distance.textContent = `Finish ${this.finishDistance}m`;

    const best = document.createElement('div');
    best.id = 'hud-best';
    best.textContent = 'Best 0';

    top.append(hats, distance, best);

    const message = document.createElement('div');
    message.id = 'hud-message';
    message.textContent = 'Swipe to switch lanes\nGrab hats, dodge signs';
    message.setAttribute('aria-live', 'polite');

    hud.append(top, message);
    container.appendChild(hud);

    return { hats, distance, best, message };
  }

  private createEnvironment() {
    const skyTexture = this.createSkyTexture();
    const skyMaterial = skyTexture
      ? new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
      : new THREE.MeshBasicMaterial({ color: 0xaad7ff, side: THREE.BackSide });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 32), skyMaterial);
    this.scene.add(sky);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xfde4c8, 0.8);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(6, 12, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    this.scene.add(dir);

    const rim = new THREE.PointLight(0xffc272, 0.6, 40);
    rim.position.set(-6, 6, 10);
    this.scene.add(rim);

    const roadWidth = this.laneWidth * 3;
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.92,
      metalness: 0.05
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.1
    });
    const laneMaterial = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color(0x3b82f6),
      emissiveIntensity: 0.4
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb454,
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color(0xff7a45),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    const segmentCount = 3;
    for (let i = 0; i < segmentCount; i += 1) {
      const segment = this.buildRoadSegment(roadWidth, roadMaterial, edgeMaterial, laneMaterial, panelMaterial);
      segment.position.z = -this.segmentLength * i;
      this.scene.add(segment);
      this.roadSegments.push(segment);
    }
    this.scrollLength = this.segmentLength * this.roadSegments.length;

    const streakGeometry = new THREE.BoxGeometry(0.06, 0.18, 2.2);
    for (let i = 0; i < 24; i += 1) {
      const streakMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: THREE.MathUtils.randFloat(0.18, 0.42),
        emissive: new THREE.Color(0x93c5fd),
        emissiveIntensity: 0.7
      });
      const streak = new THREE.Mesh(streakGeometry, streakMaterial);
      streak.position.set(
        THREE.MathUtils.randFloat(-this.laneWidth * 1.4, this.laneWidth * 1.4),
        THREE.MathUtils.randFloat(1.1, 2.4),
        -Math.random() * this.scrollLength
      );
      this.speedStreaks.push(streak);
      this.scene.add(streak);
    }
  }

  private buildRoadSegment(
    roadWidth: number,
    roadMaterial: THREE.MeshStandardMaterial,
    edgeMaterial: THREE.MeshStandardMaterial,
    laneMaterial: THREE.MeshStandardMaterial,
    panelMaterial: THREE.MeshStandardMaterial
  ) {
    const segment = new THREE.Group();

    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, this.segmentLength), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    segment.add(road);

    const edgeGeometry = new THREE.BoxGeometry(0.25, 0.35, this.segmentLength);
    const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    leftEdge.position.set(-roadWidth / 2 - 0.25, 0.16, 0);
    leftEdge.castShadow = true;
    leftEdge.receiveShadow = true;
    const rightEdge = leftEdge.clone();
    rightEdge.position.x = roadWidth / 2 + 0.25;
    segment.add(leftEdge, rightEdge);

    const markerGeometry = new THREE.BoxGeometry(0.1, 0.02, 2.6);
    const markerCount = Math.max(4, Math.floor(this.segmentLength / 6));
    const markerSpacing = this.segmentLength / markerCount;

    const boundaryXs = [-this.laneWidth / 2, this.laneWidth / 2];
    for (const boundaryX of boundaryXs) {
      for (let i = 0; i < markerCount; i += 1) {
        const marker = new THREE.Mesh(markerGeometry, laneMaterial);
        marker.position.set(
          boundaryX,
          0.03,
          -this.segmentLength / 2 + markerSpacing * (i + 0.5)
        );
        segment.add(marker);
      }
    }

    const panelGeometry = new THREE.PlaneGeometry(0.55, 1.4);
    const panelCount = 4;
    for (let i = 0; i < panelCount; i += 1) {
      const z = -this.segmentLength / 2 + (this.segmentLength / panelCount) * i + 4;
      const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
      leftPanel.position.set(-roadWidth / 2 - 0.9, 0.9, z);
      leftPanel.rotation.y = Math.PI / 2;
      leftPanel.castShadow = false;
      leftPanel.receiveShadow = false;

      const rightPanel = leftPanel.clone();
      rightPanel.position.x = roadWidth / 2 + 0.9;
      rightPanel.rotation.y = -Math.PI / 2;

      segment.add(leftPanel, rightPanel);
    }

    return segment;
  }

  private createPlayer() {
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.25 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.4, 16), this.playerBodyMaterial);
    body.position.y = 0.7;
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 16), this.playerBodyMaterial);
    head.position.y = 1.75;
    head.castShadow = true;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), this.playerAccentMaterial);
    visor.position.set(0, 1.68, -0.36);
    visor.castShadow = true;

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.2), this.playerAccentMaterial);
    pack.position.set(0, 1.05, 0.45);
    pack.castShadow = true;

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 10, 24), this.playerAccentMaterial);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.95;
    belt.castShadow = true;

    group.add(shadow, body, head, visor, pack, belt);
    group.position.set(this.laneXs[this.targetLane], 0, 0);

    return group;
  }

  private createHatModel(kind: HatKind) {
    const group = new THREE.Group();
    const material = this.hatMaterials[kind];

    switch (kind) {
      case 'top': {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 24), material);
        brim.position.y = 0.035;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 24), material);
        crown.position.y = 0.24;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 18), this.hatAccentMaterial);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.2;
        group.add(brim, crown, band);
        break;
      }
      case 'cap': {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 20), material);
        cap.position.y = 0.16;
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.35), this.hatAccentMaterial);
        brim.position.set(0, 0.1, -0.35);
        group.add(cap, brim);
        break;
      }
      case 'beanie': {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), material);
        dome.scale.y = 0.75;
        dome.position.y = 0.38;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 18), this.hatAccentMaterial);
        rim.position.y = 0.1;
        group.add(dome, rim);
        break;
      }
      case 'crown': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 12), material);
        base.position.y = 0.11;
        group.add(base);
        const spikeGeometry = new THREE.ConeGeometry(0.12, 0.3, 8);
        for (let i = 0; i < 5; i += 1) {
          const spike = new THREE.Mesh(spikeGeometry, material);
          const angle = (Math.PI * 2 * i) / 5;
          spike.position.set(Math.cos(angle) * 0.45, 0.35, Math.sin(angle) * 0.45);
          group.add(spike);
        }
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), this.hatAccentMaterial);
        gem.position.set(0, 0.35, -0.52);
        group.add(gem);
        break;
      }
    }

    this.enableShadows(group);
    return group;
  }

  private createDoorwayModel() {
    const group = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color(0x1e3a8a),
      emissiveIntensity: 0.35
    });
    const width = this.laneWidth * 0.9;
    const height = 2.4;

    const postGeometry = new THREE.BoxGeometry(0.28, height, 0.28);
    const left = new THREE.Mesh(postGeometry, frameMaterial);
    left.position.set(-width / 2, height / 2, 0);
    const right = left.clone();
    right.position.x = width / 2;

    const topGeometry = new THREE.BoxGeometry(width + 0.3, 0.24, 0.28);
    const top = new THREE.Mesh(topGeometry, frameMaterial);
    top.position.set(0, height - 0.12, 0);

    group.add(left, right, top);
    this.enableShadows(group);
    return group;
  }

  private createSignModel() {
    const group = new THREE.Group();
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.1 });
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(0xb45309),
      emissiveIntensity: 0.35
    });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 12), poleMaterial);
    pole.position.y = 1.1;

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.2), boardMaterial);
    board.position.set(0, 1.7, 0);

    group.add(pole, board);
    this.enableShadows(group);
    return group;
  }

  private createFinishGate() {
    const group = new THREE.Group();
    const width = this.laneWidth * 3.1;
    const height = 2.8;

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color(0xfef3c7),
      emissiveIntensity: 0.3
    });

    const postGeometry = new THREE.BoxGeometry(0.32, height, 0.32);
    const left = new THREE.Mesh(postGeometry, postMaterial);
    left.position.set(-width / 2 - 0.2, height / 2, 0);
    const right = left.clone();
    right.position.x = width / 2 + 0.2;

    const bannerTexture = this.createFinishTexture();
    const bannerMaterial = bannerTexture
      ? new THREE.MeshBasicMaterial({ map: bannerTexture, transparent: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0xfef3c7, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.7, 1.1), bannerMaterial);
    banner.position.set(0, height - 0.55, 0);
    banner.rotation.y = Math.PI;

    group.add(left, right, banner);
    this.enableShadows(group);
    return group;
  }

  private createSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#9bd4ff');
    gradient.addColorStop(0.55, '#f7d7a7');
    gradient.addColorStop(1, '#f4d8c4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < 80; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 2 + 1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createFinishTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = '#fff7ed';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 64px \"Space Grotesk\", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', canvas.width / 2, canvas.height / 2 + 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private enableShadows(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  private loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private saveBest(value: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }
}
