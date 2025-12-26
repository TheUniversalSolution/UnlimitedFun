import * as THREE from 'three';

const STORAGE_KEY = 'unlimitedfun-best-hats';

type ObstacleKind = 'doorway' | 'sign' | 'finish';
type HatKind = 'top' | 'cap' | 'beanie' | 'crown';
type CharacterKind = 'female' | 'male' | 'male_shorts' | 'female_summer';

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

type CharacterRig = {
  root: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  hips: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  headRadius: number;
};

type HudElements = {
  hats: HTMLElement;
  distance: HTMLElement;
  best: HTMLElement;
  message: HTMLElement;
  options: HTMLElement;
  distanceGroup: HTMLElement;
  distanceValue: HTMLElement;
  distanceHint: HTMLElement;
  distanceMinus: HTMLButtonElement;
  distancePlus: HTMLButtonElement;
  characterGroup: HTMLElement;
  characterFemale: HTMLButtonElement;
  characterMale: HTMLButtonElement;
  characterMaleShorts: HTMLButtonElement;
  characterFemaleSummer: HTMLButtonElement;
};

export class RunnerGame {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private player: THREE.Group;
  private playerRig!: CharacterRig;
  private playerBodyMaterial: THREE.MeshStandardMaterial;
  private playerAccentMaterial: THREE.MeshStandardMaterial;
  private playerSkinMaterial: THREE.MeshStandardMaterial;

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
  private defaultFinishDistance = 750;
  private minFinishDistance = 400;
  private maxFinishDistance = 3000;
  private finishDistance = 750;
  private finishSpawned = false;

  private hats = 0;
  private bestHats = 0;

  private hatPickups: HatPickup[] = [];
  private obstacles: Obstacle[] = [];
  private fallenHats: FallenHat[] = [];
  private stackHats: THREE.Group[] = [];

  private hatKinds: HatKind[] = ['top', 'beanie', 'cap', 'crown'];
  private hatSpacing = 0.06;
  private hatPickupY = 2.15;
  private headTopY = 2.2;
  private hatPulseDuration = 0.12;

  private hatMaterials: Record<HatKind, THREE.MeshStandardMaterial>;
  private hatAccentMaterial: THREE.MeshStandardMaterial;
  private hairMaterialFemale: THREE.MeshStandardMaterial;
  private hairMaterialMale: THREE.MeshStandardMaterial;

  private roadSegments: THREE.Group[] = [];
  private segmentLength = 42;
  private scrollLength = 0;
  private curveStrength = 0.0012;

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

  private currentCharacter: CharacterKind = 'female';
  private pendingCharacter: CharacterKind | null = null;

  private distanceSelectionActive = false;
  private autoStartActive = false;
  private autoStartDeadline = 0;
  private pendingFinishDistance: number | null = null;

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
    this.scene.fog = new THREE.Fog(0xbfe9ff, 22, 96);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 140);
    this.camera.position.set(0, 6.4, 11.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);

    this.finishDistance = this.defaultFinishDistance;
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
    this.playerSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7d8c2,
      roughness: 0.6,
      metalness: 0.05
    });

    this.hairMaterialFemale = new THREE.MeshStandardMaterial({
      color: 0xf7e2a3,
      roughness: 0.7,
      metalness: 0.05,
      emissive: new THREE.Color(0x7a5f2b),
      emissiveIntensity: 0.1
    });
    this.hairMaterialMale = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.6,
      metalness: 0.05,
      emissive: new THREE.Color(0x0b0f16),
      emissiveIntensity: 0.05
    });

    this.player = this.createPlayer(this.currentCharacter);
    this.scene.add(this.player);

    this.createEnvironment();
    this.setupInput();

    this.bestHats = this.loadBest();
    this.ui.best.textContent = `Best ${this.bestHats}`;
    this.updateHud();

    this.graceTimer = this.graceDuration;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    this.bindHudControls();
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
      const difficulty = this.getDifficultyFactor();
      const ramp = this.speedRamp * (1 + difficulty * 0.55);
      this.speed = Math.min(this.maxSpeed, this.speed + ramp * delta);
      this.distance += this.speed * delta * this.distanceScale;
    }

    if (this.hitCooldown > 0) {
      this.hitCooldown = Math.max(0, this.hitCooldown - delta);
    }

    if (isActive && this.graceTimer > 0) {
      this.graceTimer = Math.max(0, this.graceTimer - delta);
    }

    this.updateEnvironment(delta);
    this.updatePlayer(time, delta);
    this.updateHatStack(time, delta);
    this.updateHatPickups(time, delta);
    this.updateObstacles(time, delta);
    this.updateFallenHats(delta);

    if (isActive) {
      if (!this.finishSpawned && this.distance >= this.finishDistance) {
        this.spawnFinishGate();
      }

      if (!this.finishSpawned && this.graceTimer <= 0) {
        this.spawnTimer += delta;
        const difficulty = this.getDifficultyFactor();
        const baseInterval = this.spawnInterval - (this.speed - 220) * 0.0006;
        const difficultyScale = THREE.MathUtils.lerp(1, 0.85, difficulty);
        const spawnInterval = Math.max(this.minSpawnInterval * 0.95, baseInterval * difficultyScale);
        if (this.spawnTimer >= spawnInterval) {
          this.spawnTimer = 0;
          this.spawnWave();
        }
      }

      this.updateHud();
    }

    this.updatePostRunOptions(time);
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
    const isActive = !this.isGameOver && !this.isFinished;
    const motionScale = isActive ? 1 : 0.2;
    const speedFactor = THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0, 1);
    const pace = THREE.MathUtils.lerp(2.2, 4.6, speedFactor);
    const stride = THREE.MathUtils.lerp(0.18, 0.5, speedFactor) * motionScale;
    this.updateWalkCycle(timeSeconds, stride, pace);
    const bob = Math.sin(timeSeconds * pace * 0.5) * 0.02 * motionScale;
    const groundY = this.getRoadHeightAt(this.player.position.z);
    this.player.position.y = groundY + bob + 0.02 * motionScale;
    this.player.rotation.z = THREE.MathUtils.clamp(deltaX * 0.1, -0.35, 0.35);
    this.player.rotation.x = THREE.MathUtils.lerp(-0.04, -0.12, speedFactor) * motionScale;

    if (this.playerFlash > 0) {
      this.playerFlash = Math.max(0, this.playerFlash - delta);
      const intensity = (this.playerFlash / this.playerFlashDuration) * 1.4;
      this.playerBodyMaterial.emissiveIntensity = intensity;
    } else {
      this.playerBodyMaterial.emissiveIntensity = 0;
    }

    this.updateCamera(timeSeconds, delta);
  }

  private updateWalkCycle(timeSeconds: number, stride: number, pace: number) {
    if (!this.playerRig) {
      return;
    }

    const swing = Math.sin(timeSeconds * pace);
    const armSwing = swing * stride * 0.6;
    const legSwing = -swing * stride;

    this.playerRig.armL.rotation.x = armSwing;
    this.playerRig.armR.rotation.x = -armSwing;
    this.playerRig.legL.rotation.x = legSwing;
    this.playerRig.legR.rotation.x = -legSwing;

    this.playerRig.armL.rotation.z = 0.02;
    this.playerRig.armR.rotation.z = -0.02;
    this.playerRig.legL.rotation.z = 0.04;
    this.playerRig.legR.rotation.z = -0.04;

    const sway = Math.sin(timeSeconds * pace * 0.5) * stride * 0.35;
    this.playerRig.torso.rotation.y = sway;
    this.playerRig.hips.rotation.y = -sway * 0.6;
    this.playerRig.head.rotation.y = -sway * 0.4;
  }

  private updateCamera(timeSeconds: number, delta: number) {
    const followX = this.player.position.x * 0.25;
    const targetY = 6.4 + Math.sin(timeSeconds * 1.8) * 0.05;
    this.cameraTarget.set(followX, targetY, 11.5);
    this.camera.position.lerp(this.cameraTarget, 0.08);

    this.lookTarget.set(this.player.position.x * 0.35, 1.9, -10.5);
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
    let stackY = this.headTopY;
    for (let i = 0; i < this.stackHats.length; i += 1) {
      const hat = this.stackHats[i];
      const sway = Math.sin(timeSeconds * 2.4 + i * 0.7) * 0.08;
      hat.position.x = sway * 0.35;
      const offsetY = this.getHatStackOffset(hat);
      const hatHeight = this.getHatStackHeight(hat);
      hat.position.y = stackY + offsetY + Math.sin(timeSeconds * 3 + i) * 0.02;
      hat.position.z = 0;
      hat.rotation.z = sway * 0.8;
      stackY += hatHeight + this.hatSpacing;

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
    const offscreenZ = this.camera.position.z + this.segmentLength * 0.5 + 2;
    for (const segment of this.roadSegments) {
      segment.position.z += dz;
      if (segment.position.z > offscreenZ) {
        segment.position.z -= this.scrollLength;
      }
      segment.position.y = this.getCurveOffset(segment.position.z);
      segment.rotation.x = this.getCurveTilt(segment.position.z);
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
      const offsetY = (hat.mesh.userData.stackOffsetY as number | undefined) ?? 0;
      hat.mesh.position.y =
        this.hatPickupY +
        offsetY +
        Math.sin(timeSeconds * 2 + hat.bob) * 0.12 +
        this.getCurveOffset(hat.mesh.position.z);

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
      obstacle.mesh.position.y = this.getCurveOffset(obstacle.mesh.position.z);

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

    const difficulty = this.getDifficultyFactor();
    const obstacleChance = THREE.MathUtils.lerp(0.58, 0.82, difficulty);
    const doubleObstacleChance = THREE.MathUtils.lerp(0.16, 0.32, difficulty);
    const obstacleRoll = Math.random();
    const blockedLanes: number[] = [];

    if (obstacleRoll < obstacleChance) {
      const obstacleCount = obstacleRoll < doubleObstacleChance ? 2 : 1;
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
    const hatLanes = [hatLane, ...openLanes.filter((lane) => lane !== hatLane)];
    const hatChance = THREE.MathUtils.lerp(0.8, 0.3, difficulty);
    const hatTrailChance = THREE.MathUtils.lerp(0.25, 0.06, difficulty);
    const extraHatChance = THREE.MathUtils.lerp(0.18, 0.05, difficulty);
    const hatRoll = Math.random();

    if (hatRoll < hatChance) {
      if (hatRoll < hatTrailChance) {
        this.spawnHatTrail(hatLane, 3);
      } else {
        this.spawnHatInLanes(hatLanes, -this.spawnDepth - 4);
        if (openLanes.length > 1 && hatRoll > hatChance * 0.8) {
          this.spawnHatInLanes(hatLanes, -this.spawnDepth - 10);
        }
      }

      if (Math.random() < extraHatChance) {
        this.spawnHatInLanes(hatLanes, -this.spawnDepth - 16);
      }
    }
  }

  private spawnHat(laneIndex: number, spawnZ: number) {
    if (!this.canSpawnHat(laneIndex, spawnZ)) {
      return false;
    }
    const kind = this.hatKinds[Math.floor(Math.random() * this.hatKinds.length)];
    const hat = this.createHatModel(kind);
    const offsetY = (hat.userData.stackOffsetY as number | undefined) ?? 0;
    hat.position.set(this.laneXs[laneIndex], this.hatPickupY + offsetY + this.getCurveOffset(spawnZ), spawnZ);
    hat.scale.setScalar(0.95);
    this.scene.add(hat);
    this.hatPickups.push({
      mesh: hat,
      lane: laneIndex,
      kind,
      spin: THREE.MathUtils.randFloat(0.6, 1.4),
      bob: Math.random() * Math.PI * 2
    });
    return true;
  }

  private spawnHatTrail(laneIndex: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      this.spawnHat(laneIndex, -this.spawnDepth - i * this.hatTrailSpacing);
    }
  }

  private spawnHatInLanes(lanes: number[], spawnZ: number) {
    for (const laneIndex of lanes) {
      if (this.spawnHat(laneIndex, spawnZ)) {
        return true;
      }
    }
    return false;
  }

  private canSpawnHat(laneIndex: number, spawnZ: number) {
    const clearance = 1.4;
    for (const obstacle of this.obstacles) {
      const laneMatches = obstacle.kind === 'finish' ? true : obstacle.lane === laneIndex;
      if (!laneMatches) {
        continue;
      }
      const dz = Math.abs(obstacle.mesh.position.z - spawnZ);
      if (dz < obstacle.hitDepth + clearance) {
        return false;
      }
    }
    return true;
  }

  private spawnObstacle(laneIndex: number, spawnZ: number) {
    const kind: ObstacleKind = Math.random() < 0.55 ? 'doorway' : 'sign';
    const obstacle = kind === 'doorway' ? this.createDoorwayModel() : this.createSignModel();
    obstacle.position.set(this.laneXs[laneIndex], this.getCurveOffset(spawnZ), spawnZ);
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
    const spawnZ = -this.spawnDepth - 8;
    gate.position.set(0, this.getCurveOffset(spawnZ), spawnZ);
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
    let stackY = this.headTopY;
    for (const stacked of this.stackHats) {
      stackY += this.getHatStackHeight(stacked) + this.hatSpacing;
    }
    hat.position.set(0, stackY + this.getHatStackOffset(hat), 0);
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
      this.updateCharacterOptions();
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
    this.openPostRunOptions();
  }

  private gameOver() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.setMessage(`Bonked!\nStacked ${this.hats} hats\nTap to retry`, true);
    this.openPostRunOptions();
  }

  private resetRun() {
    const nextDistance = this.pendingFinishDistance ?? this.defaultFinishDistance;
    const nextCharacter = this.pendingCharacter ?? this.currentCharacter;
    this.closePostRunOptions();

    this.isGameOver = false;
    this.isFinished = false;
    this.finishSpawned = false;
    this.distance = 0;
    this.finishDistance = nextDistance;
    this.speed = 260;
    this.spawnTimer = 0;
    this.graceTimer = this.graceDuration;
    this.targetLane = 1;
    this.hitCooldown = 0;
    this.pointerStart = null;
    this.hasStarted = false;
    this.playerFlash = 0;
    this.playerBodyMaterial.emissiveIntensity = 0;

    this.clearWorld();
    this.clearStack();

    if (nextCharacter !== this.currentCharacter) {
      this.swapCharacter(nextCharacter);
      this.currentCharacter = nextCharacter;
    }
    this.pendingCharacter = null;
    this.player.position.set(this.laneXs[this.targetLane], 0, 0);
    this.player.rotation.set(0, 0, 0);

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

  private getDifficultyFactor() {
    if (this.finishDistance <= 0) {
      return 0;
    }
    return THREE.MathUtils.clamp(this.distance / this.finishDistance, 0, 1);
  }

  private getCurveOffset(z: number) {
    return -this.curveStrength * z * z;
  }

  private getCurveTilt(z: number) {
    const slope = -2 * this.curveStrength * z;
    return -Math.atan(slope);
  }

  private getRoadHeightAt(z: number) {
    if (this.roadSegments.length === 0) {
      return 0;
    }

    let closest: THREE.Group | null = null;
    let closestDistance = Infinity;
    const halfLength = this.segmentLength * 0.5;

    for (const segment of this.roadSegments) {
      const dz = Math.abs(segment.position.z - z);
      if (dz <= halfLength && dz < closestDistance) {
        closestDistance = dz;
        closest = segment;
      }
    }

    if (!closest) {
      for (const segment of this.roadSegments) {
        const dz = Math.abs(segment.position.z - z);
        if (dz < closestDistance) {
          closestDistance = dz;
          closest = segment;
        }
      }
    }

    if (!closest) {
      return this.getCurveOffset(z);
    }

    const tilt = closest.rotation.x;
    return closest.position.y - (z - closest.position.z) * Math.tan(tilt);
  }

  private getHatStackHeight(hat: THREE.Group) {
    const height = hat.userData.stackHeight as number | undefined;
    return typeof height === 'number' && height > 0 ? height : 0.4;
  }

  private getHatStackOffset(hat: THREE.Group) {
    const offset = hat.userData.stackOffsetY as number | undefined;
    return typeof offset === 'number' ? offset : 0;
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

    const options = document.createElement('div');
    options.id = 'hud-options';
    options.classList.add('is-hidden');

    const distanceGroup = document.createElement('div');
    distanceGroup.id = 'hud-distance-group';

    const distanceTitle = document.createElement('div');
    distanceTitle.id = 'hud-distance-title';
    distanceTitle.textContent = 'Next distance';

    const distanceControls = document.createElement('div');
    distanceControls.id = 'hud-distance-controls';

    const distanceMinus = document.createElement('button');
    distanceMinus.id = 'hud-distance-minus';
    distanceMinus.type = 'button';
    distanceMinus.textContent = '-100m';

    const distanceValue = document.createElement('div');
    distanceValue.id = 'hud-distance-value';
    distanceValue.textContent = `${this.defaultFinishDistance}m`;

    const distancePlus = document.createElement('button');
    distancePlus.id = 'hud-distance-plus';
    distancePlus.type = 'button';
    distancePlus.textContent = '+100m';

    distanceControls.append(distanceMinus, distanceValue, distancePlus);

    const distanceHint = document.createElement('div');
    distanceHint.id = 'hud-distance-hint';
    distanceHint.textContent = '3s to change';

    distanceGroup.append(distanceTitle, distanceControls, distanceHint);

    const characterGroup = document.createElement('div');
    characterGroup.id = 'hud-character-group';

    const characterTitle = document.createElement('div');
    characterTitle.id = 'hud-character-title';
    characterTitle.textContent = 'Runner';

    const characterControls = document.createElement('div');
    characterControls.id = 'hud-character-controls';

    const createCharacterButton = (id: string, label: string, unlockText?: string) => {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'hud-character-label';
      labelSpan.textContent = label;
      const lockSpan = document.createElement('span');
      lockSpan.className = 'hud-character-lock';
      lockSpan.textContent = unlockText ?? 'Locked';
      button.append(labelSpan, lockSpan);
      return button;
    };

    const characterFemale = createCharacterButton('hud-character-female', 'Blonde female');
    const characterMale = createCharacterButton('hud-character-male', 'Dark hair male');
    const characterMaleShorts = createCharacterButton(
      'hud-character-male-shorts',
      'Shorts male',
      'Unlock at Best 50+'
    );
    const characterFemaleSummer = createCharacterButton(
      'hud-character-female-summer',
      'Summer dress',
      'Unlock at Best 100+'
    );

    characterControls.append(characterFemale, characterMale, characterMaleShorts, characterFemaleSummer);
    characterGroup.append(characterTitle, characterControls);

    options.append(distanceGroup, characterGroup);

    hud.append(top, message, options);
    container.appendChild(hud);

    return {
      hats,
      distance,
      best,
      message,
      options,
      distanceGroup,
      distanceValue,
      distanceHint,
      distanceMinus,
      distancePlus,
      characterGroup,
      characterFemale,
      characterMale,
      characterMaleShorts,
      characterFemaleSummer
    };
  }

  private bindHudControls() {
    this.ui.distanceMinus.addEventListener('click', (event) => {
      event.stopPropagation();
      this.adjustPendingDistance(-100);
    });
    this.ui.distancePlus.addEventListener('click', (event) => {
      event.stopPropagation();
      this.adjustPendingDistance(100);
    });
    this.ui.characterFemale.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectCharacter('female');
    });
    this.ui.characterMale.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectCharacter('male');
    });
    this.ui.characterMaleShorts.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectCharacter('male_shorts');
    });
    this.ui.characterFemaleSummer.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectCharacter('female_summer');
    });
  }

  private openPostRunOptions() {
    this.ui.options.classList.remove('is-hidden');
    this.ui.distanceGroup.classList.remove('is-hidden');
    this.distanceSelectionActive = true;
    this.pendingFinishDistance = this.defaultFinishDistance;
    this.autoStartActive = true;
    this.autoStartDeadline = performance.now() + 3000;
    this.ui.distanceHint.classList.remove('is-hidden');
    this.updateDistanceOptions();
    this.updateCharacterOptions();
  }

  private closePostRunOptions() {
    this.ui.options.classList.add('is-hidden');
    this.ui.distanceGroup.classList.add('is-hidden');
    this.distanceSelectionActive = false;
    this.autoStartActive = false;
    this.pendingFinishDistance = null;
  }

  private updatePostRunOptions(time: number) {
    if (this.ui.options.classList.contains('is-hidden')) {
      return;
    }

    if (this.autoStartActive) {
      const timeLeft = Math.max(0, this.autoStartDeadline - time);
      const secondsLeft = Math.ceil(timeLeft / 1000);
      this.ui.distanceHint.textContent = `Choose distance (${secondsLeft}s)`;
      if (timeLeft <= 0) {
        this.autoStartActive = false;
        this.resetRun();
        return;
      }
    }
  }

  private adjustPendingDistance(delta: number) {
    if (!this.distanceSelectionActive) {
      return;
    }
    this.cancelAutoStart();
    const value = (this.pendingFinishDistance ?? this.defaultFinishDistance) + delta;
    this.pendingFinishDistance = THREE.MathUtils.clamp(value, this.minFinishDistance, this.maxFinishDistance);
    this.updateDistanceOptions();
  }

  private updateDistanceOptions() {
    const value = this.pendingFinishDistance ?? this.defaultFinishDistance;
    this.ui.distanceValue.textContent = `${value}m`;
    const disabled = !this.distanceSelectionActive;
    this.ui.distanceMinus.disabled = disabled;
    this.ui.distancePlus.disabled = disabled;
    if (!this.distanceSelectionActive) {
      this.ui.distanceHint.textContent = 'Default distance';
      this.ui.distanceHint.classList.remove('is-hidden');
    }
  }

  private cancelAutoStart() {
    if (!this.autoStartActive) {
      return;
    }
    this.autoStartActive = false;
    this.ui.distanceHint.classList.add('is-hidden');
  }

  private selectCharacter(kind: CharacterKind) {
    if (!this.isGameOver && !this.isFinished) {
      return;
    }
    if (!this.isCharacterUnlocked(kind)) {
      return;
    }
    this.cancelAutoStart();
    this.pendingCharacter = kind;
    this.updateCharacterOptions();
  }

  private getCharacterUnlockRequirement(kind: CharacterKind) {
    switch (kind) {
      case 'male_shorts':
        return 50;
      case 'female_summer':
        return 100; 
      default:
        return 0;
    }
  }

  private isCharacterUnlocked(kind: CharacterKind) {
    const requirement = this.getCharacterUnlockRequirement(kind);
    return requirement === 0 || this.bestHats > requirement;
  }

  private updateCharacterButton(button: HTMLButtonElement, kind: CharacterKind, selected: CharacterKind) {
    const unlocked = this.isCharacterUnlocked(kind);
    const selectable = this.distanceSelectionActive && unlocked;
    button.disabled = !selectable;
    button.classList.toggle('is-selected', selected === kind && unlocked);
    button.classList.toggle('is-locked', !unlocked);
    button.setAttribute('aria-disabled', String(!selectable));
  }

  private updateCharacterOptions() {
    const selected = this.pendingCharacter ?? this.currentCharacter;
    this.updateCharacterButton(this.ui.characterFemale, 'female', selected);
    this.updateCharacterButton(this.ui.characterMale, 'male', selected);
    this.updateCharacterButton(this.ui.characterMaleShorts, 'male_shorts', selected);
    this.updateCharacterButton(this.ui.characterFemaleSummer, 'female_summer', selected);
  }

  private createEnvironment() {
    const skyTexture = this.createSkyTexture();
    const skyMaterial = skyTexture
      ? new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
      : new THREE.MeshBasicMaterial({ color: 0xaad7ff, side: THREE.BackSide });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 32), skyMaterial);
    this.scene.add(sky);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb7d7a8, 1.05);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(12, 16, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.02;
    this.scene.add(dir);

    const sunFill = new THREE.PointLight(0xfff1c4, 0.55, 60);
    sunFill.position.set(-10, 12, 16);
    this.scene.add(sunFill);

    const roadWidth = this.laneWidth * 3;
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4251,
      roughness: 0.95,
      metalness: 0.05
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      roughness: 0.65,
      metalness: 0.1
    });
    const laneMaterial = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(0xf8fafc),
      emissiveIntensity: 0.25
    });
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x6fbf54,
      roughness: 0.9,
      metalness: 0.05
    });
    const hedgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f8f3f,
      roughness: 0.85,
      metalness: 0.05
    });
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x7c5f44,
      roughness: 0.8,
      metalness: 0.05
    });
    const leafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x4cae4f, roughness: 0.8, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x66bb6a, roughness: 0.82, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x3f9f5f, roughness: 0.78, metalness: 0.05 })
    ];
    const flowerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      roughness: 0.5,
      metalness: 0.1,
      emissive: new THREE.Color(0xfbcfe8),
      emissiveIntensity: 0.2
    });

    const segmentCount = 3;
    for (let i = 0; i < segmentCount; i += 1) {
      const segment = this.buildRoadSegment(
        roadWidth,
        roadMaterial,
        edgeMaterial,
        laneMaterial,
        grassMaterial,
        hedgeMaterial,
        trunkMaterial,
        leafMaterials,
        flowerMaterial
      );
      segment.position.z = -this.segmentLength * i;
      this.scene.add(segment);
      this.roadSegments.push(segment);
    }
    this.scrollLength = this.segmentLength * this.roadSegments.length;

  }

  private buildRoadSegment(
    roadWidth: number,
    roadMaterial: THREE.MeshStandardMaterial,
    edgeMaterial: THREE.MeshStandardMaterial,
    laneMaterial: THREE.MeshStandardMaterial,
    grassMaterial: THREE.MeshStandardMaterial,
    hedgeMaterial: THREE.MeshStandardMaterial,
    trunkMaterial: THREE.MeshStandardMaterial,
    leafMaterials: THREE.MeshStandardMaterial[],
    flowerMaterial: THREE.MeshStandardMaterial
  ) {
    const segment = new THREE.Group();

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth + 54, this.segmentLength), grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.06;
    grass.receiveShadow = true;
    segment.add(grass);

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

    const hedgeGeometry = new THREE.BoxGeometry(0.8, 0.45, 2.2);
    const hedgeCount = 4;
    for (let i = 0; i < hedgeCount; i += 1) {
      const z = -this.segmentLength / 2 + (this.segmentLength / hedgeCount) * i + 4;
      const leftHedge = new THREE.Mesh(hedgeGeometry, hedgeMaterial);
      leftHedge.position.set(-roadWidth / 2 - 0.9, 0.22, z);
      leftHedge.castShadow = true;
      leftHedge.receiveShadow = true;

      const rightHedge = leftHedge.clone();
      rightHedge.position.x = roadWidth / 2 + 0.9;

      segment.add(leftHedge, rightHedge);
    }

    const plantCount = 8;
    const sideOffsets = [-1, 1];
    for (const side of sideOffsets) {
      for (let i = 0; i < plantCount; i += 1) {
        const plant = this.createPlantCluster(trunkMaterial, leafMaterials, flowerMaterial);
        const z = -this.segmentLength / 2 + (this.segmentLength / plantCount) * (i + Math.random());
        const x = side * (roadWidth / 2 + THREE.MathUtils.randFloat(3.5, 7));
        plant.position.set(x, 0, z);
        segment.add(plant);
      }

      const farPlantCount = 5;
      for (let i = 0; i < farPlantCount; i += 1) {
        const plant = this.createPlantCluster(trunkMaterial, leafMaterials, flowerMaterial);
        const z = -this.segmentLength / 2 + (this.segmentLength / farPlantCount) * (i + Math.random());
        const x = side * (roadWidth / 2 + THREE.MathUtils.randFloat(8, 14));
        plant.position.set(x, 0, z);
        plant.scale.multiplyScalar(THREE.MathUtils.randFloat(1.1, 1.5));
        segment.add(plant);
      }
    }

    return segment;
  }

  private createPlantCluster(
    trunkMaterial: THREE.MeshStandardMaterial,
    leafMaterials: THREE.MeshStandardMaterial[],
    flowerMaterial: THREE.MeshStandardMaterial
  ) {
    const group = new THREE.Group();
    const variant = Math.random();
    const leafMaterial = leafMaterials[Math.floor(Math.random() * leafMaterials.length)];

    if (variant < 0.45) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 12), trunkMaterial);
      trunk.position.y = 1.2;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), leafMaterial);
      canopy.position.y = 2.45;
      canopy.scale.set(1, 1.1, 1);
      group.add(trunk, canopy);

      if (Math.random() > 0.6) {
        const extra = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 12), leafMaterial);
        extra.position.set(0.6, 2.2, 0.2);
        group.add(extra);
      }

      group.scale.setScalar(THREE.MathUtils.randFloat(1.1, 1.6));
    } else if (variant < 0.8) {
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), leafMaterial);
      base.position.y = 0.3;
      const sideA = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 9), leafMaterial);
      sideA.position.set(0.35, 0.22, 0.2);
      const sideB = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 9), leafMaterial);
      sideB.position.set(-0.3, 0.18, -0.15);
      group.add(base, sideA, sideB);
    } else {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), leafMaterial);
      mound.position.y = 0.22;
      group.add(mound);

      for (let i = 0; i < 4; i += 1) {
        const blossom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), flowerMaterial);
        const angle = (Math.PI * 2 * i) / 4;
        blossom.position.set(Math.cos(angle) * 0.18, 0.4, Math.sin(angle) * 0.18);
        group.add(blossom);
      }
    }

    this.enableShadows(group);
    return group;
  }

  private applyCharacterPalette(kind: CharacterKind) {
    switch (kind) {
      case 'female':
        this.playerBodyMaterial.color.set(0xf472b6);
        this.playerBodyMaterial.emissive.set(0x7a274c);
        this.playerAccentMaterial.color.set(0x1f2937);
        break;
      case 'male':
        this.playerBodyMaterial.color.set(0x38bdf8);
        this.playerBodyMaterial.emissive.set(0x0b1b33);
        this.playerAccentMaterial.color.set(0x0f172a);
        break;
      case 'male_shorts':
        this.playerBodyMaterial.color.set(0x22c55e);
        this.playerBodyMaterial.emissive.set(0x064e3b);
        this.playerAccentMaterial.color.set(0xf59e0b);
        break;
      case 'female_summer':
        this.playerBodyMaterial.color.set(0xf9a8d4);
        this.playerBodyMaterial.emissive.set(0x7c2d5a);
        this.playerAccentMaterial.color.set(0xfef3c7);
        break;
    }
  }

  private createHumanRig(kind: CharacterKind): CharacterRig {
    const root = new THREE.Group();

    const isFemale = kind === 'female' || kind === 'female_summer';
    const isShortsMale = kind === 'male_shorts';
    const isSummerFemale = kind === 'female_summer';

    const headRadius = 0.26;
    const legLength = 0.75;
    const armLength = 0.6;
    const torsoHeight = 0.7;
    const hipsHeight = 0.28;

    const torsoWidth = isFemale ? 0.52 : 0.66;
    const hipWidth = isFemale ? (isSummerFemale ? 0.78 : 0.74) : 0.68;
    const armRadius = isFemale ? 0.085 : 0.105;
    const torsoTopRadius = torsoWidth * (isFemale ? 0.4 : 0.46);
    const torsoBottomRadius = torsoWidth * (isFemale ? 0.52 : 0.54);
    const hipTopRadius = hipWidth * 0.42;
    const hipBottomRadius = hipWidth * 0.48;
    const shoulderX = torsoTopRadius + armRadius + 0.02;
    const shoulderZ = 0.03;
    const hipX = hipBottomRadius * 0.4;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.25 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;

    const hips = new THREE.Mesh(
      new THREE.CylinderGeometry(hipTopRadius, hipBottomRadius, hipsHeight, 18),
      this.playerAccentMaterial
    );
    hips.scale.z = 0.88;
    hips.position.y = legLength + hipsHeight * 0.5 - 0.06;

    const hipCap = new THREE.Mesh(
      new THREE.SphereGeometry(hipTopRadius * 0.9, 16, 12),
      this.playerAccentMaterial
    );
    hipCap.scale.z = 0.82;
    hipCap.position.y = hipsHeight * 0.22;
    hips.add(hipCap);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(torsoTopRadius, torsoBottomRadius, torsoHeight, 20),
      this.playerBodyMaterial
    );
    torso.scale.z = 0.88;
    torso.position.y = hips.position.y + hipsHeight * 0.5 + torsoHeight * 0.5 - 0.06;

    const torsoCap = new THREE.Mesh(
      new THREE.SphereGeometry(torsoTopRadius * 1.08, 18, 16),
      this.playerBodyMaterial
    );
    torsoCap.position.y = torsoHeight * 0.36;
    torsoCap.scale.z = 0.86;
    torso.add(torsoCap);

    const waist = new THREE.Mesh(
      new THREE.SphereGeometry(torsoBottomRadius * 0.95, 16, 12),
      this.playerBodyMaterial
    );
    waist.scale.z = 0.82;
    waist.position.y = hips.position.y + hipsHeight * 0.5 - 0.02;

    if (isShortsMale) {
      const shorts = new THREE.Mesh(
        new THREE.CylinderGeometry(hipBottomRadius * 1.05, hipBottomRadius * 1.12, 0.36, 16),
        this.playerAccentMaterial
      );
      shorts.scale.z = 0.9;
      shorts.position.y = hips.position.y - hipsHeight * 0.2;
      root.add(shorts);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 18, 16), this.playerSkinMaterial);
    head.position.y = torso.position.y + torsoHeight * 0.5 + headRadius + 0.05;

    const hair = isFemale ? this.createFemaleHair(headRadius) : this.createMaleHair(headRadius);
    head.add(hair);

    if (isShortsMale) {
      const necklace = new THREE.Mesh(
        new THREE.TorusGeometry(headRadius * 0.55, 0.03, 8, 24),
        this.hatAccentMaterial
      );
      necklace.rotation.x = Math.PI / 2;
      necklace.position.set(0, head.position.y - headRadius * 0.75, headRadius * 0.1);
      root.add(necklace);
    }

    if (isSummerFemale) {
      const dress = new THREE.Mesh(
        new THREE.ConeGeometry(torsoBottomRadius * 1.35, 0.85, 18),
        this.playerBodyMaterial
      );
      dress.position.y = hips.position.y - hipsHeight * 0.1;
      dress.scale.z = 0.88;
      root.add(dress);

      const flowerMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.05,
        emissive: new THREE.Color(0xf472b6),
        emissiveIntensity: 0.25
      });
      const flowerGeometry = new THREE.SphereGeometry(0.05, 8, 8);
      const flowerOffsets = [
        new THREE.Vector3(0, 0.1, torsoBottomRadius * 0.65),
        new THREE.Vector3(0.12, -0.05, torsoBottomRadius * 0.6),
        new THREE.Vector3(-0.12, -0.08, torsoBottomRadius * 0.55),
        new THREE.Vector3(0.05, 0.02, torsoBottomRadius * 0.58)
      ];
      for (const offset of flowerOffsets) {
        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
        flower.position.copy(offset);
        dress.add(flower);
      }

      const earringGeometry = new THREE.SphereGeometry(headRadius * 0.1, 10, 8);
      const earringL = new THREE.Mesh(earringGeometry, this.hatAccentMaterial);
      earringL.position.set(-headRadius * 0.55, -headRadius * 0.12, headRadius * 0.2);
      const earringR = earringL.clone();
      earringR.position.x = headRadius * 0.55;
      head.add(earringL, earringR);
    }

    const armGeometry = new THREE.CylinderGeometry(armRadius, armRadius * 1.05, armLength, 12);
    const sleeveGeometry = new THREE.CylinderGeometry(armRadius * 1.45, armRadius * 1.5, 0.26, 12);

    const armL = new THREE.Group();
    const armR = new THREE.Group();
    const armLMesh = new THREE.Mesh(armGeometry, this.playerSkinMaterial);
    armLMesh.position.y = -armLength * 0.5;
    const armRMesh = armLMesh.clone();
    const sleeveL = new THREE.Mesh(sleeveGeometry, this.playerBodyMaterial);
    sleeveL.position.y = -armLength * 0.12;
    const sleeveR = sleeveL.clone();

    armL.add(armLMesh, sleeveL);
    armR.add(armRMesh, sleeveR);
    armL.position.set(-shoulderX, torso.position.y + torsoHeight * 0.38, shoulderZ);
    armR.position.set(shoulderX, torso.position.y + torsoHeight * 0.38, shoulderZ);

    const shoulderGeometry = new THREE.SphereGeometry(armRadius * 1.25, 12, 10);
    const shoulderL = new THREE.Mesh(shoulderGeometry, this.playerBodyMaterial);
    shoulderL.position.set(-shoulderX, torso.position.y + torsoHeight * 0.42, shoulderZ * 0.5);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = shoulderX;

    const legMaterial = isShortsMale || isSummerFemale ? this.playerSkinMaterial : this.playerAccentMaterial;
    const legGeometry = new THREE.CylinderGeometry(0.13, 0.15, legLength, 14);
    const footGeometry = new THREE.BoxGeometry(0.18, 0.08, 0.32);

    const legL = new THREE.Group();
    const legR = new THREE.Group();
    const legLMesh = new THREE.Mesh(legGeometry, legMaterial);
    legLMesh.position.y = -legLength * 0.5;
    const legRMesh = legLMesh.clone();
    const footL = new THREE.Mesh(footGeometry, this.playerAccentMaterial);
    footL.position.set(0, -legLength + 0.06, 0.12);
    const footR = footL.clone();

    legL.add(legLMesh, footL);
    legR.add(legRMesh, footR);
    legL.position.set(-hipX, legLength - 0.04, 0);
    legR.position.set(hipX, legLength - 0.04, 0);

    root.add(shadow, hips, torso, waist, head, armL, armR, legL, legR, shoulderL, shoulderR);

    this.enableShadows(root);
    shadow.castShadow = false;
    shadow.receiveShadow = false;

    return { root, head, torso, hips, armL, armR, legL, legR, headRadius };
  }

  private createPlayer(kind: CharacterKind) {
    this.applyCharacterPalette(kind);
    const rig = this.createHumanRig(kind);
    this.playerRig = rig;

    rig.root.position.set(this.laneXs[this.targetLane], 0, 0);
    const headTop = rig.head.position.y + rig.headRadius;
    this.headTopY = headTop;
    this.hatPickupY = headTop - 0.08;

    return rig.root;
  }

  private swapCharacter(kind: CharacterKind) {
    const position = this.player.position.clone();
    const rotation = this.player.rotation.clone();
    this.scene.remove(this.player);
    this.player = this.createPlayer(kind);
    this.player.position.copy(position);
    this.player.rotation.copy(rotation);
    this.scene.add(this.player);
  }

  private createFemaleHair(headRadius: number) {
    const group = new THREE.Group();
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius * 1.05, 16, 14),
      this.hairMaterialFemale
    );
    crown.scale.set(1, 0.75, 1);
    crown.position.y = headRadius * 0.45;
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(headRadius * 0.7, headRadius * 0.92, headRadius * 1.45, 14),
      this.hairMaterialFemale
    );
    back.position.set(0, -headRadius * 0.35, headRadius * 0.35);
    group.add(crown, back);
    this.enableShadows(group);
    return group;
  }

  private createMaleHair(headRadius: number) {
    const group = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius * 0.95, 14, 12),
      this.hairMaterialMale
    );
    top.scale.set(1, 0.55, 1);
    top.position.y = headRadius * 0.55;
    const fringe = new THREE.Mesh(
      new THREE.BoxGeometry(headRadius * 1.3, headRadius * 0.25, headRadius * 0.5),
      this.hairMaterialMale
    );
    fringe.position.set(0, headRadius * 0.1, -headRadius * 0.75);
    group.add(top, fringe);
    this.enableShadows(group);
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

    const bounds = new THREE.Box3().setFromObject(group);
    const stackHeight = bounds.max.y - bounds.min.y;
    const stackOffset = -bounds.min.y;
    group.userData.stackHeight = stackHeight;
    group.userData.stackOffsetY = stackOffset;

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
    gradient.addColorStop(0, '#8fd2ff');
    gradient.addColorStop(0.5, '#bfe9ff');
    gradient.addColorStop(1, '#f7d7a7');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sunX = canvas.width * 0.78;
    const sunY = canvas.height * 0.18;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 110);
    sunGlow.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
    sunGlow.addColorStop(0.4, 'rgba(255, 244, 200, 0.45)');
    sunGlow.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 250, 230, 0.95)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    const drawCloud = (x: number, y: number, scale: number, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(-30, 0, 26, 0, Math.PI * 2);
      ctx.arc(0, -10, 30, 0, Math.PI * 2);
      ctx.arc(30, 0, 24, 0, Math.PI * 2);
      ctx.arc(10, 18, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (let i = 0; i < 14; i += 1) {
      drawCloud(
        Math.random() * canvas.width,
        Math.random() * canvas.height * 0.55,
        THREE.MathUtils.randFloat(0.5, 1),
        THREE.MathUtils.randFloat(0.75, 0.98)
      );
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createFinishTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = '#fff4d6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(60, canvas.height / 2 - 58, canvas.width - 120, 116);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.font = 'bold 120px \"Space Grotesk\", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    ctx.strokeStyle = '#fff7ed';
    ctx.lineWidth = 12;
    ctx.strokeText('FINISH', canvas.width / 2, canvas.height / 2 + 6);

    ctx.fillStyle = '#0f172a';
    ctx.fillText('FINISH', canvas.width / 2, canvas.height / 2 + 6);

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
