import * as THREE from "three";
import { soundManager } from "./SoundManager";

export type GameCallbacks = {
  onHealthChange: (hp: number) => void;
  onScoreChange: (score: number) => void;
  onAmmoChange: (ammo: number, reserve: number) => void;
  onWaveChange: (wave: number, enemiesLeft: number) => void;
  onGameOver: (score: number) => void;
  onWeaponChange: (weapon: "pistol" | "shotgun" | "ak47" | "mg42") => void;
  onPickup: (kind: "health" | "ammo", amount: number, weaponName?: string) => void;
};

type Enemy = {
  group: THREE.Group;
  hp: number;
  speed: number;
  alive: boolean;
  attackCooldown: number;
  isRanged: boolean;
  isExploder: boolean;
  shootCooldown: number;
  beepTimer: number;
};

type Bullet = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  isEnemy: boolean;
};

type Obstacle = {
  mesh: THREE.Mesh;
  box: THREE.Box3;
};

type Pickup = {
  group: THREE.Group;
  kind: "health";
  amount: number;
  baseY: number;
  spawnTime: number;
};

type WeaponDef = {
  name: "pistol" | "shotgun" | "ak47" | "mg42";
  maxAmmo: number;
  reserve: number;
  ammo: number;
  fireCooldownTime: number;
  reloadTime: number;
  damageBase: number;
  headshotMul: number;
  pellets: number;
  spread: number;
};

const WORLD_SIZE = 80;

export class FPSGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private container: HTMLElement;

  private yaw = 0;
  private pitch = 0;
  private playerPos = new THREE.Vector3(0, 1.6, 0);
  private playerRadius = 0.5;
  private keys: Record<string, boolean> = {};
  private mouseDown = false;

  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];

  private hp = 100;
  private score = 0;
  private wave = 0;
  private enemiesToSpawn = 0;
  private spawnTimer = 0;
  private fireCooldown = 0;
  private reloading = false;
  private reloadTimer = 0;
  private muzzleFlash!: THREE.PointLight;

  // Weapon systems
  private pistolsDef: WeaponDef = {
    name: "pistol",
    maxAmmo: 12,
    reserve: 60,
    ammo: 12,
    fireCooldownTime: 0.13,
    reloadTime: 1.1,
    damageBase: 35,
    headshotMul: 2.85,
    pellets: 1,
    spread: 0,
  };
  private shotgunsDef: WeaponDef = {
    name: "shotgun",
    maxAmmo: 6,
    reserve: 30,
    ammo: 6,
    fireCooldownTime: 0.55,
    reloadTime: 1.8,
    damageBase: 18,
    headshotMul: 2,
    pellets: 8,
    spread: 0.07,
  };
  private ak47Def: WeaponDef = {
    name: "ak47",
    maxAmmo: 30,
    reserve: 120,
    ammo: 30,
    fireCooldownTime: 0.10,
    reloadTime: 1.5,
    damageBase: 32,
    headshotMul: 3.0,
    pellets: 1,
    spread: 0.015,
  };
  private mg42Def: WeaponDef = {
    name: "mg42",
    maxAmmo: 100,
    reserve: 200,
    ammo: 100,
    fireCooldownTime: 0.05,
    reloadTime: 2.5,
    damageBase: 36,
    headshotMul: 2.3,
    pellets: 1,
    spread: 0.038,
  };

  private currentWeapon: WeaponDef = this.pistolsDef;
  private weaponSwitchTimer = 0;

  private gunGroup!: THREE.Group;
  private pistolModel!: THREE.Group;
  private shotgunModel!: THREE.Group;
  private ak47Model!: THREE.Group;
  private mg42Model!: THREE.Group;

  private gunBaseY = -0.35;
  private gunRecoil = 0;
  private damageFlashTime = 0;
  private overlayMat!: THREE.MeshBasicMaterial;
  private gameOverSoundPlayed = false;

  private cb: GameCallbacks;
  private running = true;
  private gameOver = false;
  private rafId = 0;

  constructor(container: HTMLElement, cb: GameCallbacks) {
    this.container = container;
    this.cb = cb;

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88c0e8);
    this.scene.fog = new THREE.Fog(0x88c0e8, 30, 90);

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    this.camera.position.copy(this.playerPos);

    this.buildWorld();
    this.buildGuns();

    // Damage overlay
    const overlayGeo = new THREE.PlaneGeometry(2, 2);
    this.overlayMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const overlay = new THREE.Mesh(overlayGeo, this.overlayMat);
    overlay.position.set(0, 0, -0.5);
    overlay.renderOrder = 999;
    this.camera.add(overlay);
    this.scene.add(this.camera);

    this.muzzleFlash = new THREE.PointLight(0xffaa44, 0, 5);
    this.camera.add(this.muzzleFlash);
    this.muzzleFlash.position.set(0.2, -0.2, -0.8);

    this.attachListeners();
    this.startNextWave();
    this.emitAll();
    this.loop();
  }

  private buildWorld() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff1c4, 1.1);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    this.scene.add(sun);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2, 40, 40);
    groundGeo.rotateX(-Math.PI / 2);
    const posArr = groundGeo.attributes.position;
    for (let i = 0; i < posArr.count; i++) {
      const x = posArr.getX(i);
      const z = posArr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      if (dist > 5) {
        posArr.setY(i, (Math.random() - 0.5) * 0.6);
      }
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6ab04a, flatShading: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, flatShading: true });
    const wallH = 6;
    const sides = [
      { x: 0, z: -WORLD_SIZE, w: WORLD_SIZE * 2, d: 2 },
      { x: 0, z: WORLD_SIZE, w: WORLD_SIZE * 2, d: 2 },
      { x: -WORLD_SIZE, z: 0, w: 2, d: WORLD_SIZE * 2 },
      { x: WORLD_SIZE, z: 0, w: 2, d: WORLD_SIZE * 2 },
    ];
    for (const s of sides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, wallH, s.d), wallMat);
      m.position.set(s.x, wallH / 2, s.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.obstacles.push({ mesh: m, box: new THREE.Box3().setFromObject(m) });
    }

    // Props
    for (let i = 0; i < 35; i++) {
      const type = Math.random();
      const x = (Math.random() - 0.5) * WORLD_SIZE * 1.7;
      const z = (Math.random() - 0.5) * WORLD_SIZE * 1.7;
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

      let mesh: THREE.Mesh;
      if (type < 0.4) {
        const size = 1.5 + Math.random() * 1.5;
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size, size, size),
          new THREE.MeshStandardMaterial({ color: 0xa0763d, flatShading: true })
        );
        mesh.position.set(x, size / 2, z);
      } else if (type < 0.75) {
        const size = 1 + Math.random() * 2;
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(size, 0),
          new THREE.MeshStandardMaterial({ color: 0x7d8a92, flatShading: true })
        );
        mesh.position.set(x, size * 0.6, z);
        mesh.rotation.set(Math.random(), Math.random(), Math.random());
      } else {
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.4, 2, 6),
          new THREE.MeshStandardMaterial({ color: 0x5a3a1f, flatShading: true })
        );
        trunk.position.y = 1;
        trunk.castShadow = true;
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(1.6, 3.5, 7),
          new THREE.MeshStandardMaterial({ color: 0x2e7d32, flatShading: true })
        );
        leaves.position.y = 3.5;
        leaves.castShadow = true;
        treeGroup.add(trunk);
        treeGroup.add(leaves);
        treeGroup.position.set(x, 0, z);
        this.scene.add(treeGroup);
        const box = new THREE.Box3().setFromObject(treeGroup);
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 4.5, 0.8),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        proxy.position.set(x, 2.25, z);
        this.obstacles.push({ mesh: proxy, box });
        continue;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.obstacles.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
    }
  }

  private buildPistolModel(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true })
    );
    body.position.set(0, 0, -0.3);
    g.add(body);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.7);
    g.add(barrel);
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.25, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x3a2516, flatShading: true })
    );
    grip.position.set(0, -0.18, -0.1);
    g.add(grip);
    return g;
  }

  private buildShotgunModel(): THREE.Group {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.22, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, flatShading: true })
    );
    receiver.position.set(0, 0, -0.25);
    g.add(receiver);
    // Twin barrels
    for (const offX of [-0.04, 0.04]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, flatShading: true })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(offX, 0.08, -0.62);
      g.add(barrel);
    }
    // Stock
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, flatShading: true })
    );
    stock.position.set(0, -0.02, 0.2);
    g.add(stock);
    // Grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.22, 0.13),
      new THREE.MeshStandardMaterial({ color: 0x3a2516, flatShading: true })
    );
    grip.position.set(0, -0.2, -0.05);
    g.add(grip);
    // Pump
    const pump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.25, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true })
    );
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.13, -0.55);
    g.add(pump);
    return g;
  }

  private buildAK47Model(): THREE.Group {
    const g = new THREE.Group();
    // Receiver
    const rec = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50, flatShading: true })
    );
    rec.position.set(0, 0.02, -0.1);
    g.add(rec);
    // Stock
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.15, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true })
    );
    stock.position.set(0, -0.04, 0.25);
    g.add(stock);
    // Wooden Handguard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.13, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true })
    );
    guard.position.set(0, -0.01, -0.4);
    g.add(guard);
    // Barrel
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
    );
    b.rotation.x = Math.PI / 2;
    b.position.set(0, 0.04, -0.65);
    g.add(b);
    // Banana Magazine
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.3, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xa0522d, flatShading: true })
    );
    mag.rotation.x = -0.22;
    mag.position.set(0, -0.18, -0.25);
    g.add(mag);
    // Pistol grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.16, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true })
    );
    grip.position.set(0, -0.14, 0);
    g.add(grip);
    return g;
  }

  private buildMG42Model(): THREE.Group {
    const g = new THREE.Group();
    // Heavy receiver
    const rec = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.18, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
    );
    rec.position.set(0, 0.05, -0.1);
    g.add(rec);
    // Stock flared
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, flatShading: true })
    );
    stock.position.set(0, 0.02, 0.3);
    g.add(stock);
    // Long barrel shroud
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
    );
    barrel.position.set(0, 0.08, -0.7);
    g.add(barrel);
    // Green drum magazine on side
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d4a22, flatShading: true })
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.set(-0.16, 0.04, -0.2); // stick out left
    g.add(drum);
    // Bipod folded
    const bipod = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x666666, flatShading: true })
    );
    bipod.rotation.x = Math.PI / 2;
    bipod.position.set(0, -0.02, -0.75);
    g.add(bipod);
    // Grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.18, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
    );
    grip.position.set(0, -0.13, -0.05);
    g.add(grip);
    return g;
  }

  private buildGuns() {
    this.gunGroup = new THREE.Group();
    this.pistolModel = this.buildPistolModel();
    this.shotgunModel = this.buildShotgunModel();
    this.ak47Model = this.buildAK47Model();
    this.mg42Model = this.buildMG42Model();

    this.gunGroup.add(this.pistolModel);
    this.gunGroup.add(this.shotgunModel);
    this.gunGroup.add(this.ak47Model);
    this.gunGroup.add(this.mg42Model);

    this.pistolModel.visible = true;
    this.shotgunModel.visible = false;
    this.ak47Model.visible = false;
    this.mg42Model.visible = false;

    this.gunGroup.position.set(0.28, this.gunBaseY, -0.5);
    this.gunGroup.rotation.y = -0.05;
    this.camera.add(this.gunGroup);
  }

  private attachListeners() {
    this.onResize = this.onResize.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private switchWeapon(weapon: "pistol" | "shotgun" | "ak47" | "mg42") {
    if (this.reloading) return;
    if (this.weaponSwitchTimer > 0) return;
    if (this.currentWeapon.name === weapon) return;

    this.weaponSwitchTimer = 0.35;
    if (weapon === "pistol") this.currentWeapon = this.pistolsDef;
    else if (weapon === "shotgun") this.currentWeapon = this.shotgunsDef;
    else if (weapon === "ak47") this.currentWeapon = this.ak47Def;
    else if (weapon === "mg42") this.currentWeapon = this.mg42Def;

    this.pistolModel.visible = weapon === "pistol";
    this.shotgunModel.visible = weapon === "shotgun";
    this.ak47Model.visible = weapon === "ak47";
    this.mg42Model.visible = weapon === "mg42";

    soundManager.playWeaponSwitch();
    this.cb.onWeaponChange(weapon);
    this.emitAll();
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keys[e.code] = true;
    if (e.code === "KeyR") this.startReload();
    if (e.code === "Digit1") this.switchWeapon("pistol");
    if (e.code === "Digit2") this.switchWeapon("shotgun");
    if (e.code === "Digit3") this.switchWeapon("ak47");
    if (e.code === "Digit4") this.switchWeapon("mg42");
  }
  private onKeyUp(e: KeyboardEvent) {
    this.keys[e.code] = false;
  }
  private onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sens = 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.05;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }
  private onMouseDown(e: MouseEvent) {
    if (e.button === 0) this.mouseDown = true;
  }
  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.mouseDown = false;
  }

  private startReload() {
    if (this.reloading) return;
    const w = this.currentWeapon;
    if (w.ammo === w.maxAmmo) return;
    if (w.reserve <= 0) {
      soundManager.playEmpty();
      return;
    }
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    soundManager.playReload();
  }

  private fire() {
    const w = this.currentWeapon;
    if (this.reloading || this.fireCooldown > 0 || this.weaponSwitchTimer > 0) return;
    if (w.ammo <= 0) {
      if (!this.reloading) {
        soundManager.playEmpty();
        this.startReload();
      }
      return;
    }
    w.ammo--;
    this.fireCooldown = w.fireCooldownTime;

    const isShotgun = w.name === "shotgun";
    const isAK = w.name === "ak47";
    const isMG = w.name === "mg42";

    if (isShotgun) this.gunRecoil = 0.16;
    else if (isAK) this.gunRecoil = 0.05;
    else if (isMG) this.gunRecoil = 0.10;
    else this.gunRecoil = 0.03;

    this.muzzleFlash.intensity = isShotgun ? 6 : isMG ? 5 : isAK ? 4 : 3;
    soundManager.playShoot(isShotgun);

    const baseDir = new THREE.Vector3();
    this.camera.getWorldDirection(baseDir);
    const worldPos = this.camera.getWorldPosition(new THREE.Vector3());
    const startPos = this.camera.localToWorld(new THREE.Vector3(0.2, -0.18, -1));

    for (let p = 0; p < w.pellets; p++) {
      const dir = baseDir.clone();
      if (w.spread > 0) {
        dir.x += (Math.random() - 0.5) * w.spread;
        dir.y += (Math.random() - 0.5) * w.spread;
        dir.z += (Math.random() - 0.5) * w.spread;
        dir.normalize();
      }

      // Tracer
      const bulletGeo = new THREE.SphereGeometry(isShotgun ? 0.04 : 0.05, 6, 6);
      const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
      const bullet = new THREE.Mesh(bulletGeo, bulletMat);
      bullet.position.copy(startPos);
      this.scene.add(bullet);
      this.bullets.push({
        mesh: bullet,
        velocity: dir.clone().multiplyScalar(isShotgun ? 100 : 120),
        life: isShotgun ? 0.6 : 1.2,
        isEnemy: false,
      });

      // Hitscan
      const rc = new THREE.Raycaster();
      rc.set(worldPos, dir);
      const enemyMeshes: THREE.Object3D[] = [];
      for (const e of this.enemies) if (e.alive) enemyMeshes.push(e.group);
      const hits = rc.intersectObjects(enemyMeshes, true);
      if (hits.length > 0) {
        const hit = hits[0];
        const obstacleMeshes = this.obstacles.map((o) => o.mesh);
        const obsHits = rc.intersectObjects(obstacleMeshes, false);
        if (obsHits.length > 0 && obsHits[0].distance < hit.distance) {
          // Blocked by obstacle
          continue;
        }
        let target: Enemy | null = null;
        let parent: THREE.Object3D | null = hit.object;
        while (parent) {
          for (const e of this.enemies) {
            if (e.group === parent) { target = e; break; }
          }
          if (target) break;
          parent = parent.parent;
        }
        if (target) {
          let headshot = false;
          let p2: THREE.Object3D | null = hit.object;
          while (p2) {
            if (p2.name === "head") { headshot = true; break; }
            p2 = p2.parent;
          }
          const mul = headshot ? w.headshotMul : 1;
          const dmg = w.damageBase * mul;
          target.hp -= dmg;
          target.group.scale.set(1.1, 1.1, 1.1);
          setTimeout(() => {
            if (target!.alive) target!.group.scale.set(1, 1, 1);
          }, 60);
          if (target.hp <= 0) {
            this.killEnemy(target, headshot);
          }
        }
      }
    }
    this.emitAll();
  }

  private playerTakeDamage(amt: number) {
    if (this.gameOver) return;
    this.hp -= amt;
    this.damageFlashTime = 0.4;
    soundManager.playDamage();
    if (this.hp <= 0) {
      this.hp = 0;
      this.gameOver = true;
      soundManager.stopBreathing();
      if (!this.gameOverSoundPlayed) {
        this.gameOverSoundPlayed = true;
        soundManager.stopMusic();
        soundManager.playGameOver();
        this.cb.onGameOver(this.score);
      }
    }
    this.cb.onHealthChange(this.hp);
  }

  private killEnemy(e: Enemy, headshot: boolean) {
    e.alive = false;
    const pos = e.group.position.clone();
    this.scene.remove(e.group);

    if (e.isExploder) {
      // ── Exploder death ────────────────────────────────────
      this.score += 350;
      soundManager.playExplosion();

      // Big orange flash
      const flash = new THREE.PointLight(0xff6600, 12, 18);
      flash.position.copy(pos);
      flash.position.y += 1.0;
      this.scene.add(flash);
      setTimeout(() => this.scene.remove(flash), 250);

      // 45 HP damage to player if close (within 5m radius)
      const dX = this.playerPos.x - pos.x;
      const dZ = this.playerPos.z - pos.z;
      if (Math.sqrt(dX * dX + dZ * dZ) < 5) {
        this.playerTakeDamage(45);
        this.damageFlashTime = 0.6; // longer red flash on screen
      }

      // Large orange debris cloud — 16 pieces
      for (let i = 0; i < 16; i++) {
        const sz = 0.2 + Math.random() * 0.25;
        const piece = new THREE.Mesh(
          new THREE.BoxGeometry(sz, sz, sz),
          new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? 0xff6600 : 0xffaa00,
            flatShading: true,
            emissive: 0xff3300,
            emissiveIntensity: 0.4,
          })
        );
        piece.position.copy(pos);
        piece.position.y += 0.8 + Math.random() * 0.5;
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          Math.random() * 7 + 3,
          (Math.random() - 0.5) * 10
        );
        this.scene.add(piece);
        const lifeStart = performance.now();
        const animate = () => {
          const dt = 0.016;
          vel.y -= 9.8 * dt;
          piece.position.addScaledVector(vel, dt);
          piece.rotation.x += 0.15;
          piece.rotation.z += 0.12;
          if (performance.now() - lifeStart > 1400) {
            this.scene.remove(piece);
            piece.geometry.dispose();
            (piece.material as THREE.Material).dispose();
          } else {
            requestAnimationFrame(animate);
          }
        };
        animate();
      }
    } else {
      // ── Normal kill ───────────────────────────────────────
      this.score += headshot ? 150 : 100;
      if (headshot) soundManager.playHeadshot();
      else soundManager.playKill();

      // Drop logic
      if (e.isRanged) {
        if (Math.random() < 0.15) {
          const w = this.currentWeapon;
          if (w.reserve < 500) {
            const added = Math.min(w.maxAmmo, 500 - w.reserve);
            w.reserve += added;
            this.cb.onPickup("ammo", added, w.name);
            soundManager.playPickupAmmo();
          }
        }
      } else {
        if (Math.random() < 0.12) {
          this.spawnHealthPickup(pos);
        }
      }

      // Standard 8-piece scatter
      const pieceColor = e.isRanged ? 0x3b5e2b : headshot ? 0xdd4444 : 0xaa2222;
      for (let i = 0; i < 8; i++) {
        const piece = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.3),
          new THREE.MeshStandardMaterial({ color: pieceColor, flatShading: true })
        );
        piece.position.copy(pos);
        piece.position.y += 1.2;
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 5 + 2,
          (Math.random() - 0.5) * 6
        );
        this.scene.add(piece);
        const lifeStart = performance.now();
        const animate = () => {
          const dt = 0.016;
          vel.y -= 9.8 * dt;
          piece.position.addScaledVector(vel, dt);
          piece.rotation.x += 0.1;
          piece.rotation.z += 0.1;
          if (performance.now() - lifeStart > 1200) {
            this.scene.remove(piece);
            piece.geometry.dispose();
            (piece.material as THREE.Material).dispose();
          } else {
            requestAnimationFrame(animate);
          }
        };
        animate();
      }
    }
    this.emitAll();
  }

  private spawnHealthPickup(pos: THREE.Vector3) {
    const group = new THREE.Group();
    // Green base cube
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({
        color: 0x22cc55,
        flatShading: true,
        emissive: 0x114422,
        emissiveIntensity: 0.5,
      })
    );
    group.add(base);
    // White cross — horizontal bar
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
      })
    );
    group.add(crossH);
    // White cross — vertical bar
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.32, 0.48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
      })
    );
    group.add(crossV);
    // Green glow light
    const light = new THREE.PointLight(0x33ff55, 1.5, 5);
    group.add(light);

    group.position.copy(pos);
    group.position.y = 0.6;
    this.scene.add(group);

    this.pickups.push({
      group,
      kind: "health",
      amount: 10,
      baseY: 0.6,
      spawnTime: this.clock.elapsedTime,
    });
  }

  private startNextWave() {
    this.wave++;
    this.enemiesToSpawn = 3 + this.wave * 2;
    this.spawnTimer = 0.5;
    soundManager.playWaveStart();
    this.cb.onWaveChange(this.wave, this.enemiesToSpawn + this.aliveEnemies());
  }

  private aliveEnemies() {
    return this.enemies.filter((e) => e.alive).length;
  }

  private spawnEnemy() {
    // Decide enemy type: ~20% exploder, ~32%+ ranged soldier, rest melee
    const roll = Math.random();
    const exploderChance = 0.18 + Math.min(0.10, this.wave * 0.01);
    const rangedChance   = 0.32 + Math.min(0.20, this.wave * 0.02);
    const isExploder = roll < exploderChance;
    const isRanged   = !isExploder && roll < exploderChance + rangedChance;

    const group = new THREE.Group();

    // ── Body ────────────────────────────────────────────────
    const bodyColor = isExploder ? 0xe67e22 : isRanged ? 0x3b5e2b : 0xc0392b;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      flatShading: true,
      ...(isExploder ? { emissive: 0xff4400, emissiveIntensity: 0.25 } : {}),
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 0.48), bodyMat);
    body.name = "body";
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Exploder: glowing orange point-light aura + warning barrel stripes
    if (isExploder) {
      const aura = new THREE.PointLight(0xff5500, 1.8, 4.5);
      aura.name = "exploderAura";
      aura.position.set(0, 1.0, 0);
      group.add(aura);

      // Black warning-stripe band around torso
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.12, 0.50),
        new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
      );
      stripe.position.set(0, 1.0, 0);
      group.add(stripe);
      const stripe2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.12, 0.50),
        new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
      );
      stripe2.position.set(0, 0.7, 0);
      group.add(stripe2);
    }

    // ── Head ────────────────────────────────────────────────
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({
        color: isExploder ? 0xf0a050 : 0xecc6a3,
        flatShading: true,
      })
    );
    head.name = "head";
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    // ── Tactical Helmet (soldiers only) ─────────────────────
    if (isRanged) {
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2b4a1f, flatShading: true });
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.52), helmetMat);
      dome.position.set(0, 1.95, 0);
      dome.name = "head";
      group.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.15), helmetMat);
      brim.position.set(0, 1.82, 0.25);
      brim.name = "head";
      group.add(brim);
    }

    // ── Eyes ────────────────────────────────────────────────
    // Exploders get glowing red eyes; others get black
    const eyeMat = new THREE.MeshBasicMaterial({
      color: isExploder ? 0xff2200 : 0x000000,
    });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), eyeMat);
    eyeL.position.set(-0.1, 1.8, 0.23);
    eyeL.name = "head";
    group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), eyeMat);
    eyeR.position.set(0.1, 1.8, 0.23);
    eyeR.name = "head";
    group.add(eyeR);

    // ── Arms ────────────────────────────────────────────────
    const armColor = isExploder ? 0xe67e22 : isRanged ? 0x3b5e2b : 0xc0392b;
    const armMat = new THREE.MeshStandardMaterial({ color: armColor, flatShading: true });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), armMat);
    armL.position.set(-0.45, 1.0, 0);
    armL.name = "armL";
    armL.castShadow = true;
    group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), armMat);
    armR.position.set(0.45, 1.0, 0);
    armR.name = "armR";
    armR.castShadow = true;
    group.add(armR);

    // ── Legs ────────────────────────────────────────────────
    const legColor = isExploder ? 0xc0580a : 0x2c3e50;
    const legMat = new THREE.MeshStandardMaterial({ color: legColor, flatShading: true });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat);
    legL.position.set(-0.18, 0.4, 0);
    legL.name = "legL";
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat);
    legR.position.set(0.18, 0.4, 0);
    legR.name = "legR";
    legR.castShadow = true;
    group.add(legR);

    // ── Weapon (Ranged soldiers only) ───────────────────────
    if (isRanged) {
      const eGun = new THREE.Group();
      const isAK = Math.random() < 0.5;
      if (isAK) {
        const rec = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.14, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x2c3e50, flatShading: true })
        );
        eGun.add(rec);
        const stock = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.12, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true })
        );
        stock.position.set(0, -0.04, 0.2);
        eGun.add(stock);
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.4);
        eGun.add(barrel);
        const mag = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.25, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xa0522d, flatShading: true })
        );
        mag.rotation.x = -0.2;
        mag.position.set(0, -0.15, -0.1);
        eGun.add(mag);
      } else {
        const bodyG = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.14, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true })
        );
        eGun.add(bodyG);
        const barrelG = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6),
          new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
        );
        barrelG.rotation.x = Math.PI / 2;
        barrelG.position.set(0, 0.02, -0.3);
        eGun.add(barrelG);
        const gripG = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.2, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x3a2516, flatShading: true })
        );
        gripG.position.set(0, -0.15, 0.05);
        eGun.add(gripG);
      }
      eGun.position.set(0.25, 1.25, 0.2);
      eGun.rotation.x = -Math.PI / 6;
      group.add(eGun);
    }

    // ── Spawn position ───────────────────────────────────────
    const angle = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 15;
    group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    this.scene.add(group);

    this.enemies.push({
      group,
      hp: isExploder ? 70 : 100,   // exploders are squishier
      speed: isExploder
        ? 2.6 + Math.random() * 0.6 + this.wave * 0.14  // run faster toward player
        : (isRanged ? 1.5 : 1.9) + Math.random() * 0.5 + this.wave * 0.12,
      alive: true,
      attackCooldown: 0,
      isRanged,
      isExploder,
      shootCooldown: 1.0 + Math.random() * 1.5,
      beepTimer: 0.7 + Math.random() * 0.5,
    });
  }

  private enemyShoot(e: Enemy) {
    if (this.gameOver) return;
    const start = e.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    const dir = new THREE.Vector3().subVectors(this.playerPos, start).normalize();

    // Inaccuracy
    dir.x += (Math.random() - 0.5) * 0.06;
    dir.y += (Math.random() - 0.5) * 0.06;
    dir.z += (Math.random() - 0.5) * 0.06;
    dir.normalize();

    // Red slow bullet
    const bGeo = new THREE.SphereGeometry(0.11, 4, 4);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.copy(start);
    this.scene.add(bMesh);

    this.bullets.push({
      mesh: bMesh,
      velocity: dir.clone().multiplyScalar(72), // Fast but still slightly under player speed (~120)
      life: 1.2,
      isEnemy: true,
    });

    soundManager.playShoot(false);
  }

  private collideWithObstacles(pos: THREE.Vector3) {
    for (const o of this.obstacles) {
      const box = o.box;
      const closest = new THREE.Vector3(
        Math.max(box.min.x, Math.min(pos.x, box.max.x)),
        Math.max(box.min.y, Math.min(pos.y, box.max.y)),
        Math.max(box.min.z, Math.min(pos.z, box.max.z))
      );
      const diff = new THREE.Vector3().subVectors(pos, closest);
      const dist = diff.length();
      if (dist < this.playerRadius && dist > 0.0001) {
        diff.normalize().multiplyScalar(this.playerRadius - dist);
        pos.add(diff);
      } else if (dist === 0) {
        pos.x += this.playerRadius;
      }
    }
  }

  private update(dt: number) {
    if (this.gameOver) return;

    this.weaponSwitchTimer = Math.max(0, this.weaponSwitchTimer - dt);

    // Wave logic
    if (this.enemiesToSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.enemiesToSpawn--;
        this.spawnTimer = 0.7 + Math.random() * 0.4;
        this.cb.onWaveChange(this.wave, this.enemiesToSpawn + this.aliveEnemies());
      }
    } else if (this.aliveEnemies() === 0) {
      this.score += 50 * this.wave;
      this.startNextWave();
    }

    // Player Movement
    const speed = (this.keys["ShiftLeft"] ? 8 : 5) * dt;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys["KeyW"]) move.add(forward);
    if (this.keys["KeyS"]) move.sub(forward);
    if (this.keys["KeyD"]) move.add(right);
    if (this.keys["KeyA"]) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    this.playerPos.add(move);

    const lim = WORLD_SIZE - 2;
    this.playerPos.x = Math.max(-lim, Math.min(lim, this.playerPos.x));
    this.playerPos.z = Math.max(-lim, Math.min(lim, this.playerPos.z));
    this.collideWithObstacles(this.playerPos);

    let bob = 0;
    if (move.lengthSq() > 0) {
      bob = Math.sin(this.clock.elapsedTime * 10) * 0.04;
      if (this.keys["ShiftLeft"]) {
        soundManager.startBreathing();
      } else {
        soundManager.stopBreathing();
      }
    } else {
      soundManager.stopBreathing();
    }

    this.camera.position.set(this.playerPos.x, this.playerPos.y + bob, this.playerPos.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Firing
    this.fireCooldown -= dt;
    if (this.mouseDown) this.fire();

    // Reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.currentWeapon;
        const need = w.maxAmmo - w.ammo;
        const take = Math.min(need, w.reserve);
        w.ammo += take;
        w.reserve -= take;
        this.reloading = false;
        this.emitAll();
      }
    }

    // Muzzle flash
    this.muzzleFlash.intensity *= Math.pow(0.001, dt);
    if (this.muzzleFlash.intensity < 0.01) this.muzzleFlash.intensity = 0;

    // Gun recoil & sway
    this.gunRecoil *= Math.pow(0.0001, dt);
    const swayX = Math.sin(this.clock.elapsedTime * 2) * 0.005;
    const swayY = Math.cos(this.clock.elapsedTime * 1.5) * 0.005;
    this.gunGroup.position.set(
      0.28 + swayX,
      this.gunBaseY + swayY - this.gunRecoil * 0.3,
      -0.5 + this.gunRecoil
    );
    this.gunGroup.rotation.x = this.gunRecoil * 0.5;

    // Bullets (Tracers and Hitboxes)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.life -= dt;

      if (b.isEnemy) {
        // Player hitbox collision
        const bPos = b.mesh.position;
        const dX = this.playerPos.x - bPos.x;
        const dZ = this.playerPos.z - bPos.z;
        const horizDist = Math.sqrt(dX * dX + dZ * dZ);

        // Cylinder check: radius 0.6m, height 0m to 2.2m (ground level is playerPos.y - 1.6)
        const pFeetY = this.playerPos.y - 1.6;
        if (horizDist < 0.6 && bPos.y >= pFeetY && bPos.y <= pFeetY + 2.2) {
          this.playerTakeDamage(10);
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          (b.mesh.material as THREE.Material).dispose();
          this.bullets.splice(i, 1);
          continue;
        }

        // Obstacle collision for enemy bullets (take cover)
        let blocked = false;
        for (const o of this.obstacles) {
          if (o.box.containsPoint(bPos)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          (b.mesh.material as THREE.Material).dispose();
          this.bullets.splice(i, 1);
          continue;
        }
      }

      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.bullets.splice(i, 1);
      }
    }

    // Pickups (float, rotate, expire after 15s, collect on contact)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      const age = this.clock.elapsedTime - pk.spawnTime;
      // Bob up and down
      pk.group.position.y = pk.baseY + Math.sin(this.clock.elapsedTime * 2.5) * 0.15;
      // Spin
      pk.group.rotation.y += 1.5 * dt;

      // Expire after 15 seconds — fade quickly in last second
      if (age > 14) {
        const fade = Math.max(0, 15 - age);
        pk.group.scale.setScalar(fade);
      }
      if (age > 15) {
        this.scene.remove(pk.group);
        pk.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        this.pickups.splice(i, 1);
        continue;
      }

      // Collision with player (XZ distance)
      const dX = this.playerPos.x - pk.group.position.x;
      const dZ = this.playerPos.z - pk.group.position.z;
      const horizDist = Math.sqrt(dX * dX + dZ * dZ);
      if (horizDist < 1.2) {
        if (pk.kind === "health" && this.hp < 100) {
          this.hp = Math.min(100, this.hp + pk.amount);
          soundManager.playPickupHealth();
          this.cb.onPickup("health", pk.amount);
          this.cb.onHealthChange(this.hp);
          this.scene.remove(pk.group);
          pk.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose();
              (obj.material as THREE.Material).dispose();
            }
          });
          this.pickups.splice(i, 1);
        }
      }
    }

    // Enemies AI
    const t = this.clock.elapsedTime * 6;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dir = new THREE.Vector3().subVectors(this.playerPos, e.group.position);
      dir.y = 0;
      const dist = dir.length();
      dir.normalize();
      e.group.rotation.y = Math.atan2(dir.x, dir.z);

      const legL = e.group.getObjectByName("legL");
      const legR = e.group.getObjectByName("legR");
      const armL = e.group.getObjectByName("armL");
      const armR = e.group.getObjectByName("armR");

      if (e.isExploder) {
        // ── Exploder AI ────────────────────────────────────
        // Always sprint straight toward player
        if (dist > 1.5) {
          e.group.position.addScaledVector(dir, e.speed * dt);
          if (legL && legR) {
            legL.rotation.x = Math.sin(t * 1.4) * 0.8;
            legR.rotation.x = -Math.sin(t * 1.4) * 0.8;
          }
          if (armL && armR) {
            armL.rotation.x = Math.sin(t * 1.4) * 0.5;
            armR.rotation.x = -Math.sin(t * 1.4) * 0.5;
          }
        }

        // Pulse the aura based on distance to player — closer = faster flicker
        const aura = e.group.getObjectByName("exploderAura") as THREE.PointLight | undefined;
        if (aura) {
          const pulseSpeed = Math.max(4, 20 - dist * 1.2);
          aura.intensity = 1.5 + Math.sin(this.clock.elapsedTime * pulseSpeed) * 0.8;
        }

        // Beep warning when close
        e.beepTimer -= dt;
        if (dist < 20 && e.beepTimer <= 0) {
          soundManager.playExploderBeep();
          e.beepTimer = Math.max(0.12, 0.5 - (20 - dist) * 0.018);
        }

        // Detonate on contact
        if (dist < 1.8 && e.attackCooldown <= 0) {
          e.attackCooldown = 99; // prevent double-trigger
          this.killEnemy(e, false);
        }

      } else if (e.isRanged) {
        // ── Ranged soldier AI ─────────────────────────────
        e.shootCooldown -= dt;

        let moving = false;
        if (dist > 15) {
          e.group.position.addScaledVector(dir, e.speed * dt);
          moving = true;
        } else if (dist < 8) {
          e.group.position.addScaledVector(dir, -e.speed * 0.6 * dt);
          moving = true;
        } else {
          e.group.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 2)) * 0.04;
          if (legL && legR) { legL.rotation.x = 0; legR.rotation.x = 0; }
        }
        if (moving && legL && legR) {
          legL.rotation.x = Math.sin(t) * 0.6;
          legR.rotation.x = -Math.sin(t) * 0.6;
        }
        if (armL && armR) {
          armL.rotation.x = -Math.PI / 2.5;
          armL.rotation.y = 0.2;
          armR.rotation.x = -Math.PI / 2.5;
          armR.rotation.y = -0.1;
        }
        if (e.shootCooldown <= 0 && dist <= 30) {
          e.shootCooldown = 1.4 + Math.random() * 1.6;
          this.enemyShoot(e);
        }

      } else {
        // ── Red melee AI ──────────────────────────────────
        if (dist > 1.6) {
          e.group.position.addScaledVector(dir, e.speed * dt);
          if (legL && legR) {
            legL.rotation.x = Math.sin(t) * 0.6;
            legR.rotation.x = -Math.sin(t) * 0.6;
          }
          if (armL && armR) {
            armL.rotation.x = Math.sin(t) * 0.3;
            armR.rotation.x = -Math.sin(t) * 0.3;
          }
        } else {
          if (legL && legR) { legL.rotation.x = 0; legR.rotation.x = 0; }
        }
        e.attackCooldown -= dt;
        if (dist < 1.8 && e.attackCooldown <= 0) {
          e.attackCooldown = 1.0;
          if (armL && armR) {
            armL.rotation.x = -Math.PI / 2;
            armR.rotation.x = -Math.PI / 2;
            setTimeout(() => { if (e.alive && armL && armR) { armL.rotation.x = 0; armR.rotation.x = 0; } }, 150);
          }
          this.playerTakeDamage(12);
        }
      }
    }

    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
      this.overlayMat.opacity = Math.max(0, this.damageFlashTime) * 0.7;
    } else {
      this.overlayMat.opacity = 0;
    }
  }

  private emitAll() {
    const w = this.currentWeapon;
    this.cb.onHealthChange(this.hp);
    this.cb.onScoreChange(this.score);
    this.cb.onAmmoChange(w.ammo, w.reserve);
    this.cb.onWeaponChange(w.name);
    this.cb.onWaveChange(this.wave, this.enemiesToSpawn + this.aliveEnemies());
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  requestPointerLock() {
    this.renderer.domElement.requestPointerLock();
  }

  startMusic() {
    soundManager.startMusic();
  }

  stopMusic() {
    soundManager.stopMusic();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    soundManager.stopMusic();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
