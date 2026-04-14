import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/controls/TransformControls.js";
import { COINS, MARKET_MODEL_LINKS, RACER_MODEL_LIBRARY, TRACK_LOOP_METERS } from "./config.js";

const DEFAULT_TRACK_LAYOUT = {
  lanes: [
    { major: 11.6, minor: 8.6, y: 0.12 },
    { major: 10.0, minor: 7.2, y: 0.12 },
    { major: 8.4, minor: 5.8, y: 0.12 },
    { major: 6.8, minor: 4.4, y: 0.12 }
  ],
  markerMinor: 8.8
};

const EDITOR_TARGET_IDS = {
  track: "track",
  startLine: "startLine",
  finishBanner: "finishBanner"
};

const RACER_RADIUS = 0.82;
const TRACK_MODEL_URL = new URL("../assets/race-track.glb", import.meta.url).href;
const CUSTOM_RACER_MODELS = buildCustomRacerModels();
const COIN_LOGO_URLS = {
  BTC: new URL("../assets/coin-logos/btc.svg", import.meta.url).href,
  ETH: new URL("../assets/coin-logos/eth.svg", import.meta.url).href,
  SOL: new URL("../assets/coin-logos/sol.png", import.meta.url).href,
  DOGE: new URL("../assets/coin-logos/doge.svg", import.meta.url).href,
  XRP: new URL("../assets/coin-logos/xrp.svg", import.meta.url).href,
  TRX: new URL("../assets/coin-logos/trx.svg", import.meta.url).href,
  BNB: new URL("../assets/coin-logos/bnb.svg", import.meta.url).href,
  ADA: new URL("../assets/coin-logos/ada.svg", import.meta.url).href,
  SUI: new URL("../assets/coin-logos/sui.png", import.meta.url).href,
  LTC: new URL("../assets/coin-logos/ltc.svg", import.meta.url).href
};
const SHOWCASE_IMAGE_URLS = {
  BTC: new URL("../assets/icons/bull-face-side.png", import.meta.url).href,
  ETH: new URL("../assets/icons/wolf-side.png", import.meta.url).href,
  SOL: new URL("../assets/icons/stag-side.png", import.meta.url).href,
  DOGE: new URL("../assets/icons/shiba-inu-side.png", import.meta.url).href,
  XRP: new URL("../assets/icons/alpaca-side.png", import.meta.url).href,
  TRX: new URL("../assets/icons/cow-side.png", import.meta.url).href,
  BNB: new URL("../assets/icons/deer-side.png", import.meta.url).href,
  ADA: new URL("../assets/icons/donkey-side.png", import.meta.url).href,
  SUI: new URL("../assets/icons/horse-side.png", import.meta.url).href,
  LTC: new URL("../assets/icons/white-horse-side.png", import.meta.url).href
};
const SHOWCASE_IMAGE_TRANSFORMS = {
  BTC: { top: "44%", width: "490px", left: "50%" },
  ETH: { top: "44%", width: "480px", left: "50%" },
  SOL: { top: "44%", width: "510px", left: "50%" },
  DOGE: { top: "44%", width: "510px", left: "50%" },
  XRP: { top: "44%", width: "480px", left: "50%" },
  TRX: { top: "44%", width: "490px", left: "50%" },
  BNB: { top: "44%", width: "510px", left: "50%" },
  ADA: { top: "44%", width: "470px", left: "50%" },
  SUI: { top: "44%", width: "470px", left: "50%" },
  LTC: { top: "44%", width: "470px", left: "50%" }
};
const CAMERA_START_1 = {
  cameraManualX: 7.0505845441953605,
  cameraManualY: 1.2027189268974998,
  cameraManualZ: -3.811029813064591,
  cameraLookX: 6.6435703714011805,
  cameraLookY: 1.187181974857135,
  cameraLookZ: -3.832702637748281
};
const CAMERA_START_2 = {
  cameraManualX: 2.557579480268028,
  cameraManualY: 2.0343454801638514,
  cameraManualZ: -10.541234644163538,
  cameraLookX: 0.11581494484259193,
  cameraLookY: 1.767551905677441,
  cameraLookZ: -7.4828555746306415
};
const CAMERA_START_1_RIGHT = shiftCameraPoseRight(CAMERA_START_1, 1.35);
const START_CAMERA_ANIMATION_1 = {
  from: CAMERA_START_1,
  via: CAMERA_START_1_RIGHT,
  to: CAMERA_START_2,
  durationSec: 5,
  firstLegRatio: 0.32
};
const START_RACER_ANIMATION_DURATION_SEC = 3;
const SELECTED_TRACK_POINTS = 96;
const START_LINE_BASE_LENGTH_MULTIPLIER = 1.075;
const START_LINE_GEOMETRY_HEIGHT = 0.1;
const START_TO_BEHIND_BLEND_MS = 1200;
const WINNER_REVEAL_DELAY_MS = 3000;
const HIDDEN_TRACK_NODE_PATTERNS = [/^Goal_Post$/i];
const BACKGROUND_RING_RADIUS = 52;

export const DEFAULT_SCENE_TUNING = {
  worldScale: 1,
  trackModelScale: 1,
  trackOffsetX: 0,
  trackOffsetY: 0,
  trackOffsetZ: 0,
  trackRotationDeg: 0,
  laneMajorScale: 1,
  laneMinorScale: 1,
  laneGapScale: 1,
  racerOffsetX: 0,
  racerOffsetZ: 0,
  racerScale: 1,
  racerLift: 0,
  startAngleDeg: -90,
  ...buildPerRacerDefaults(),
  markerOffsetX: 0.5121930629132748,
  markerYOffset: -0.17696128784627585,
  markerOffsetZ: -2.8181183997686308,
  markerRotationDeg: 0,
  markerScale: 0.8671875542922561,
  bannerOffsetX: -0.46340519736423347,
  bannerYOffset: 5.087475670434923,
  bannerOffsetZ: -2.387209749243821,
  bannerRotationDeg: 0,
  bannerScale: 2.802752154316061,
  cameraHeight: 18,
  cameraDistance: 23,
  cameraOrbit: 1.8,
  ...CAMERA_START_1
};

export class ThreeRaceRenderer {
  constructor({
    container,
    coins,
    onSelectRacer,
    useCustomModels = true,
    showBallAnchors = false,
    enableEditorInteractions = true
  }) {
    this.container = container;
    this.coins = coins;
    this.useCustomModels = useCustomModels;
    this.showBallAnchors = showBallAnchors;
    this.enableEditorInteractions = enableEditorInteractions;
    this.cameraFocusPresets = ["auto", "overview", ...this.coins.map((coin) => coin.id)];
    this.onSelectRacer = onSelectRacer;
    this.tuning = { ...DEFAULT_SCENE_TUNING };
    this.baseTrackLayout = cloneTrackLayout(DEFAULT_TRACK_LAYOUT);
    this.trackLayout = cloneTrackLayout(DEFAULT_TRACK_LAYOUT);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    this.camera.position.set(0, 18, 23);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (window.getComputedStyle(this.container).position === "static") {
      this.container.style.position = "relative";
    }
    this.container.appendChild(this.renderer.domElement);
    this.markerOverlay = document.createElement("div");
    this.markerOverlay.style.position = "absolute";
    this.markerOverlay.style.inset = "0";
    this.markerOverlay.style.pointerEvents = "none";
    this.markerOverlay.style.zIndex = "4";
    this.container.appendChild(this.markerOverlay);
    this.winnerShowcaseOverlay = document.createElement("div");
    this.winnerShowcaseOverlay.style.position = "absolute";
    this.winnerShowcaseOverlay.style.left = "50%";
    this.winnerShowcaseOverlay.style.top = "62%";
    this.winnerShowcaseOverlay.style.width = "720px";
    this.winnerShowcaseOverlay.style.height = "720px";
    this.winnerShowcaseOverlay.style.transform = "translate(-50%, -50%)";
    this.winnerShowcaseOverlay.style.overflow = "visible";
    this.winnerShowcaseOverlay.style.pointerEvents = "none";
    this.winnerShowcaseOverlay.style.zIndex = "11";
    this.winnerShowcaseOverlay.style.display = "none";
    this.container.appendChild(this.winnerShowcaseOverlay);
    this.winnerShowcaseImage = document.createElement("img");
    this.winnerShowcaseImage.alt = "";
    this.winnerShowcaseImage.draggable = false;
    this.winnerShowcaseImage.style.position = "absolute";
    this.winnerShowcaseImage.style.left = "50%";
    this.winnerShowcaseImage.style.top = "44%";
    this.winnerShowcaseImage.style.width = "490px";
    this.winnerShowcaseImage.style.maxWidth = "none";
    this.winnerShowcaseImage.style.height = "auto";
    this.winnerShowcaseImage.style.transform = "translate(-50%, -50%)";
    this.winnerShowcaseImage.style.objectFit = "contain";
    this.winnerShowcaseImage.style.filter = "drop-shadow(0 28px 40px rgba(0,0,0,0.35))";
    this.winnerShowcaseOverlay.appendChild(this.winnerShowcaseImage);
    this.winnerShowcaseScene = new THREE.Scene();
    this.winnerShowcaseCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    this.winnerShowcaseCamera.position.set(0, 3.4, 1.55);
    this.winnerShowcaseCamera.lookAt(0, 2.7, 0);
    this.winnerShowcaseRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.winnerShowcaseRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.winnerShowcaseRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.winnerShowcaseRenderer.setClearColor(0x000000, 0);
    this.winnerShowcaseRenderer.domElement.style.width = "100%";
    this.winnerShowcaseRenderer.domElement.style.height = "100%";
    this.winnerShowcaseRenderer.domElement.style.display = "none";
    this.winnerShowcaseRenderer.domElement.style.transform = "scale(6)";
    this.winnerShowcaseRenderer.domElement.style.transformOrigin = "center center";
    this.winnerShowcaseOverlay.appendChild(this.winnerShowcaseRenderer.domElement);
    this.winnerShowcaseRoot = new THREE.Group();
    this.winnerShowcaseRoot.scale.setScalar(10);
    this.winnerShowcaseRoot.position.y = -4.5;
    this.winnerShowcaseScene.add(this.winnerShowcaseRoot);
    this.winnerShowcaseLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.winnerShowcaseScene.add(this.winnerShowcaseLight);
    this.winnerShowcaseKeyLight = new THREE.DirectionalLight(0xfff0c9, 1.3);
    this.winnerShowcaseKeyLight.position.set(4, 8, 6);
    this.winnerShowcaseScene.add(this.winnerShowcaseKeyLight);
    this.winnerShowcaseFillLight = new THREE.DirectionalLight(0xb7d6ff, 0.65);
    this.winnerShowcaseFillLight.position.set(-5, 4, 2);
    this.winnerShowcaseScene.add(this.winnerShowcaseFillLight);
    this.winnerShowcaseModel = null;
    this.winnerShowcaseWinnerId = null;

    this.raycaster = new THREE.Raycaster();
    this.surfaceRaycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.surfaceProbe = new THREE.Vector3();
    this.surfaceDirection = new THREE.Vector3(0, -1, 0);
    this.selectionBounds = new THREE.Box3();
    this.racerGroundBounds = new THREE.Box3();
    this.defaultMarkerPosition = new THREE.Vector3();
    this.defaultBannerPosition = new THREE.Vector3();

    this.racerMeshes = new Map();
    this.racerMarkerDots = new Map();
    this.racerEditorHandles = new Map();
    this.racerHandleDefaults = new Map();
    this.fallbackSurfaceTargets = [];
    this.modelSurfaceTargets = [];
    this.colliderSurfaceTargets = [];
    this.trackSurfaceTargets = [];
    this.trackSurfaceCeilingY = Infinity;

    this.editorCallbacks = {};
    this.editorTargets = new Map();
    this.editorHitTargets = [];
    this.modelEditorHitTargets = [];
    this.editorMode = "translate";
    this.selectedEditorTargetId = null;
    this.editorDragging = false;
    this.isSyncingEditorChange = false;
    this.isSyncingManualCamera = false;
    this.previousRenderTimeSec = null;
    this.cameraMode = "behind";
    this.cameraFocusPreset = "auto";
    this.markersVisible = true;
    this.activeCameraAnimation = null;
    this.lastCameraLookTarget = new THREE.Vector3(
      this.tuning.cameraLookX,
      this.tuning.cameraLookY,
      this.tuning.cameraLookZ
    );

    this.buildScene();
    this.handleResize();

    window.addEventListener("resize", this.handleResize);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  getTuning() {
    return { ...this.tuning };
  }

  setTuning(partialTuning) {
    this.tuning = {
      ...this.tuning,
      ...sanitizeTuning(partialTuning)
    };
    this.applyTuning();
    if (this.cameraMode === "manual") {
      this.syncManualCameraControlsFromTuning();
    }
    this.emitTuningChange();
  }

  resetTuning() {
    this.tuning = { ...DEFAULT_SCENE_TUNING };
    this.applyTuning();
    if (this.cameraMode === "manual") {
      this.syncManualCameraControlsFromTuning();
    }
    this.emitTuningChange();
  }

  setEditorCallbacks(callbacks) {
    this.editorCallbacks = {
      ...this.editorCallbacks,
      ...callbacks
    };
    this.emitModeChange();
    this.emitSelectionChange();
    this.emitTuningChange();
  }

  getEditableTargets() {
    return [
      { id: EDITOR_TARGET_IDS.track, label: "World Track" },
      { id: EDITOR_TARGET_IDS.startLine, label: "Start Line" },
      ...this.coins.map((coin) => ({
        id: getRacerTargetId(coin.id),
        label: `${coin.id} Racer`
      }))
    ];
  }

  getSelectedEditorTarget() {
    const selected = this.editorTargets.get(this.selectedEditorTargetId);
    return selected ? { id: selected.id, label: selected.label } : null;
  }

  getEditorMode() {
    return this.editorMode;
  }

  getCameraMode() {
    return this.cameraMode;
  }

  getCameraFocusPreset() {
    return this.cameraFocusPreset;
  }

  getMarkerVisibility() {
    return this.markersVisible;
  }

  setMarkerVisibility(visible) {
    this.markersVisible = Boolean(visible);
    if (!this.markersVisible) {
      for (const markerDot of this.racerMarkerDots.values()) {
        markerDot.style.display = "none";
      }
    }
    return this.markersVisible;
  }

  toggleMarkerVisibility() {
    return this.setMarkerVisibility(!this.markersVisible);
  }

  setCameraFocusPreset(preset) {
    if (!this.cameraFocusPresets.includes(preset)) {
      return this.cameraFocusPreset;
    }

    this.cameraFocusPreset = preset;
    if (preset === "overview") {
      this.setCameraMode("overview");
    } else {
      this.setCameraMode("behind");
    }
    return this.cameraFocusPreset;
  }

  cycleCameraFocusPreset() {
    const currentIndex = this.cameraFocusPresets.indexOf(this.cameraFocusPreset);
    const nextPreset = this.cameraFocusPresets[(currentIndex + 1) % this.cameraFocusPresets.length];
    return this.setCameraFocusPreset(nextPreset);
  }

  setCameraMode(mode) {
    if (!["overview", "behind", "manual"].includes(mode)) {
      return this.cameraMode;
    }

    this.cameraMode = mode;
    if (this.cameraMode === "manual") {
      this.captureCurrentCameraAsManual();
      this.syncManualCameraControlsFromTuning();
    }
    this.updateCameraInteractionState();
    return this.cameraMode;
  }

  toggleCameraMode() {
    if (this.activeCameraAnimation) {
      this.stopCameraAnimation(false);
    }

    const modes = ["overview", "behind", "manual"];
    const currentIndex = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(currentIndex + 1) % modes.length];
    if (this.cameraMode === "manual") {
      this.captureCurrentCameraAsManual();
      this.syncManualCameraControlsFromTuning();
    }
    this.updateCameraInteractionState();
    return this.cameraMode;
  }

  playStartAnimation1() {
    this.cameraMode = "manual";
    this.activeCameraAnimation = {
      ...START_CAMERA_ANIMATION_1,
      startedAtSec: performance.now() / 1000
    };
    this.applyCameraPose(START_CAMERA_ANIMATION_1.from);
    this.updateCameraInteractionState();
  }

  setEditorMode(mode) {
    if (mode !== "translate" && mode !== "rotate") {
      return;
    }

    this.editorMode = mode;
    this.transformControls.setMode(mode);
    this.emitModeChange();
  }

  selectEditorTarget(id) {
    const nextTarget = this.editorTargets.get(id);
    if (!nextTarget) {
      this.selectedEditorTargetId = null;
      this.transformControls.detach();
      this.transformControls.enabled = false;
      this.transformControls.getHelper().visible = false;
      this.editorSelectionHelper.visible = false;
      this.updateCameraInteractionState();
      this.emitSelectionChange();
      return;
    }

    this.selectedEditorTargetId = id;
    this.transformControls.attach(nextTarget.object);
    this.updateCameraInteractionState();
    this.updateEditorSelectionVisual();
    this.emitSelectionChange();
  }

  buildScene() {
    this.trackRoot = new THREE.Group();
    this.fallbackTrackGroup = new THREE.Group();
    this.trackModelRoot = new THREE.Group();
    this.trackColliderGroup = new THREE.Group();
    this.trackModelRoot.visible = false;
    this.selectedTrackLine = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xd62f2f,
        transparent: true,
        opacity: 0.95
      })
    );
    this.selectedTrackLine.visible = false;

    this.trackRoot.add(this.fallbackTrackGroup);
    this.trackRoot.add(this.trackModelRoot);
    this.trackRoot.add(this.trackColliderGroup);
    this.scene.add(this.trackRoot);
    this.scene.add(this.selectedTrackLine);
    this.buildBackground();

    const ambient = new THREE.AmbientLight(0xffffff, 1.05);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff0c9, 1.1);
    keyLight.position.set(10, 18, 8);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb7d6ff, 0.45);
    fillLight.position.set(-10, 8, -12);
    this.scene.add(fillLight);

    this.buildFallbackTrack();
    this.buildTrackColliders();
    this.buildTrackMarkers();
    this.buildRacers();
    this.buildEditorControls();
    this.buildCameraControls();
    this.applyTuning();
    this.loadTrackModel();
  }

  buildBackground() {
    this.scene.background = createSkyTexture();
    this.scene.fog = new THREE.Fog(0x0a1020, 42, 110);

    this.backgroundGroup = new THREE.Group();
    this.scene.add(this.backgroundGroup);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(90, 80),
      new THREE.MeshStandardMaterial({
        color: 0x0b1320,
        roughness: 1,
        metalness: 0
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.9;
    this.backgroundGroup.add(floor);

    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(18, 40, 96),
      new THREE.MeshBasicMaterial({
        color: 0x2dc6ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide
      })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = -0.75;
    this.backgroundGroup.add(glowRing);

    const mountainRing = new THREE.Group();
    const ridgeConfigs = [
      { radius: BACKGROUND_RING_RADIUS + 4, count: 15, baseY: 5.5, color: 0x25344b, depth: 4.2 },
      { radius: BACKGROUND_RING_RADIUS + 11, count: 18, baseY: 8.5, color: 0x1a2538, depth: 5.6 }
    ];
    ridgeConfigs.forEach((ridge, ridgeIndex) => {
      for (let index = 0; index < ridge.count; index += 1) {
        const progress = index / ridge.count;
        const angle = progress * Math.PI * 2 + ridgeIndex * 0.08;
        const width = 6 + pseudoRandom(index * 9.7 + ridgeIndex * 3.1) * 7;
        const height = ridge.baseY + pseudoRandom(index * 14.9 + ridgeIndex * 5.3) * 10;
        const peak = new THREE.Mesh(
          new THREE.ConeGeometry(width, height, 5),
          new THREE.MeshStandardMaterial({
            color: ridge.color,
            roughness: 1,
            metalness: 0
          })
        );
        peak.position.set(
          Math.cos(angle) * ridge.radius,
          height * 0.5 - 0.8,
          Math.sin(angle) * ridge.radius
        );
        peak.rotation.y = angle + pseudoRandom(index * 2.7) * 0.8;
        peak.scale.z = ridge.depth;
        mountainRing.add(peak);
      }
    });
    this.backgroundGroup.add(mountainRing);

    const rocks = new THREE.Group();
    for (let index = 0; index < 26; index += 1) {
      const angle = (index / 26) * Math.PI * 2 + pseudoRandom(index * 1.7) * 0.22;
      const radius = 24 + pseudoRandom(index * 7.1) * 18;
      const size = 0.9 + pseudoRandom(index * 5.9) * 2.8;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        new THREE.MeshStandardMaterial({
          color: 0x3a4555,
          roughness: 1,
          metalness: 0
        })
      );
      rock.position.set(
        Math.cos(angle) * radius,
        size * 0.55 - 0.8,
        Math.sin(angle) * radius
      );
      rock.rotation.set(
        pseudoRandom(index * 3.3) * 0.7,
        pseudoRandom(index * 8.6) * Math.PI,
        pseudoRandom(index * 11.4) * 0.4
      );
      rock.scale.set(
        1.3 + pseudoRandom(index * 4.2) * 1.8,
        0.8 + pseudoRandom(index * 6.7) * 1.3,
        1 + pseudoRandom(index * 9.1) * 1.6
      );
      rocks.add(rock);
    }
    this.backgroundGroup.add(rocks);

    const lightPosts = new THREE.Group();
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const post = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 8, 12),
        new THREE.MeshStandardMaterial({ color: 0x26344f, roughness: 0.8 })
      );
      pole.position.y = 4;
      post.add(pole);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0xffe6a8,
          transparent: true,
          opacity: 0.9
        })
      );
      lamp.position.y = 8.3;
      post.add(lamp);

      post.position.set(Math.cos(angle) * 29, -0.7, Math.sin(angle) * 29);
      lightPosts.add(post);
    }
    this.backgroundGroup.add(lightPosts);

  }

  buildEditorControls() {
    if (!this.enableEditorInteractions) {
      this.editorSelectionHelper = new THREE.Box3Helper(this.selectionBounds, 0xf0bf58);
      this.editorSelectionHelper.visible = false;
      this.scene.add(this.editorSelectionHelper);

      this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
      this.transformControls.enabled = false;
      const helper = this.transformControls.getHelper();
      helper.visible = false;
      this.scene.add(helper);
      return;
    }

    this.editorTargets.set(EDITOR_TARGET_IDS.track, {
      id: EDITOR_TARGET_IDS.track,
      label: "World Track",
      object: this.trackRoot
    });
    this.editorTargets.set(EDITOR_TARGET_IDS.startLine, {
      id: EDITOR_TARGET_IDS.startLine,
      label: "Start Line",
      object: this.startLine
    });

    this.editorSelectionHelper = new THREE.Box3Helper(this.selectionBounds, 0xf0bf58);
    this.editorSelectionHelper.visible = false;
    this.scene.add(this.editorSelectionHelper);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode(this.editorMode);
    this.transformControls.setSize(0.85);
    this.transformControls.enabled = false;
    this.transformControls.addEventListener("change", this.handleTransformControlsChange);
    this.transformControls.addEventListener("dragging-changed", this.handleDraggingChanged);
    this.transformControls.addEventListener("objectChange", this.handleEditorObjectChange);
    const helper = this.transformControls.getHelper();
    helper.visible = false;
    this.scene.add(helper);
  }

  buildWorldCenterMarker() {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.22, 40),
      new THREE.MeshBasicMaterial({
        color: 0x30c48d,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const xBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.03, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xf06750, transparent: true, opacity: 0.95 })
    );
    group.add(xBar);

    const zBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.95 })
    );
    group.add(zBar);

    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2c7, transparent: true, opacity: 0.92 })
    );
    pin.position.y = 0.26;
    group.add(pin);

    group.renderOrder = 10;
    return group;
  }

  buildCameraControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enabled = false;
    this.orbitControls.enableDamping = false;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.target.copy(this.lastCameraLookTarget);
    this.orbitControls.addEventListener("change", this.handleOrbitControlsChange);
  }

  buildFallbackTrack() {
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 0.8, 48),
      new THREE.MeshStandardMaterial({ color: 0xd8c9a5, roughness: 1 })
    );
    ground.position.y = -0.5;
    this.fallbackTrackGroup.add(ground);
    this.fallbackSurfaceTargets.push(ground);
    this.registerEditorHitTarget(ground, EDITOR_TARGET_IDS.track);

    const infield = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 3.9, 0.45, 48),
      new THREE.MeshStandardMaterial({ color: 0x29493d, roughness: 1 })
    );
    infield.position.y = -0.1;
    this.fallbackTrackGroup.add(infield);
    this.fallbackSurfaceTargets.push(infield);
    this.registerEditorHitTarget(infield, EDITOR_TARGET_IDS.track);

    for (const laneDef of DEFAULT_TRACK_LAYOUT.lanes) {
      const laneMesh = new THREE.Mesh(
        new THREE.TorusGeometry(laneDef.major, 0.58, 28, 180),
        new THREE.MeshStandardMaterial({
          color: 0x22453a,
          roughness: 0.9,
          metalness: 0.1,
          emissive: 0x142c24,
          emissiveIntensity: 0.12
        })
      );
      laneMesh.rotation.x = Math.PI / 2;
      laneMesh.scale.z = laneDef.minor / laneDef.major;
      this.fallbackTrackGroup.add(laneMesh);
      this.fallbackSurfaceTargets.push(laneMesh);
      this.registerEditorHitTarget(laneMesh, EDITOR_TARGET_IDS.track);

      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(laneDef.major, 0.05, 10, 180),
        new THREE.MeshStandardMaterial({ color: 0xf0bf58, roughness: 0.4 })
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.5;
      trim.scale.z = laneDef.minor / laneDef.major;
      this.fallbackTrackGroup.add(trim);
      this.registerEditorHitTarget(trim, EDITOR_TARGET_IDS.track);
    }
  }

  buildTrackMarkers() {
    const checkerTexture = createCheckerTexture();
    this.startLine = new THREE.Mesh(
      new THREE.BoxGeometry(1, START_LINE_GEOMETRY_HEIGHT, 0.45),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: checkerTexture,
        roughness: 0.82,
        metalness: 0.04
      })
    );
    this.startLine.visible = true;
    this.startLine.receiveShadow = true;
    this.registerEditorHitTarget(this.startLine, EDITOR_TARGET_IDS.startLine);
    this.scene.add(this.startLine);

    this.finishBanner = new THREE.Object3D();
    this.finishBanner.visible = false;
    this.scene.add(this.finishBanner);
  }

  buildTrackColliders() {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    material.colorWrite = false;

    this.colliderSurfaceTargets = DEFAULT_TRACK_LAYOUT.lanes.map((_, index) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.5, 16, 160), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.name = `track-collider-${index}`;
      this.trackColliderGroup.add(mesh);
      return mesh;
    });
  }

  buildRacers() {
    this.coins.forEach((coin, index) => {
      const root = new THREE.Group();
      root.userData = { racerId: coin.id };
      this.scene.add(root);

      const material = new THREE.MeshStandardMaterial({
        color: coin.three,
        roughness: 0.3,
        metalness: 0.12,
        emissive: coin.three,
        emissiveIntensity: 0.18,
        transparent: this.showBallAnchors,
        opacity: this.showBallAnchors ? 0.36 : 1
      });
      const visual = new THREE.Mesh(new THREE.SphereGeometry(RACER_RADIUS, 24, 24), material);
      visual.position.y = RACER_RADIUS;
      root.add(visual);

      const pickMesh = createRacerPickMesh(coin.id);
      root.add(pickMesh);
      this.registerEditorHitTarget(pickMesh, getRacerTargetId(coin.id));

      const selectionMarker = createSelectionMarker();
      selectionMarker.visible = false;
      root.add(selectionMarker);

      const markerDot = document.createElement("div");
      markerDot.style.position = "absolute";
      markerDot.style.width = "36px";
      markerDot.style.height = "36px";
      markerDot.style.marginLeft = "-18px";
      markerDot.style.marginTop = "-18px";
      markerDot.style.borderRadius = "999px";
      markerDot.style.background = "rgba(12, 21, 26, 0.9)";
      markerDot.style.border = "2px solid rgba(255, 248, 230, 0.9)";
      markerDot.style.boxShadow = "0 8px 18px rgba(0, 0, 0, 0.22)";
      markerDot.style.display = "none";
      markerDot.style.overflow = "hidden";
      markerDot.style.padding = "4px";
      const markerImage = document.createElement("img");
      markerImage.src = COIN_LOGO_URLS[coin.id] ?? "";
      markerImage.alt = `${coin.id} logo`;
      markerImage.style.width = "100%";
      markerImage.style.height = "100%";
      markerImage.style.objectFit = "contain";
      markerImage.style.display = "block";
      markerDot.appendChild(markerImage);
      this.markerOverlay.appendChild(markerDot);
      this.racerMarkerDots.set(coin.id, markerDot);

      const handle = new THREE.Object3D();
      handle.userData = { racerId: coin.id };
      this.scene.add(handle);
      this.racerEditorHandles.set(coin.id, handle);
      this.editorTargets.set(getRacerTargetId(coin.id), {
        id: getRacerTargetId(coin.id),
        label: `${coin.id} Racer`,
        object: handle
      });

      this.racerMeshes.set(coin.id, {
        mesh: root,
        visual,
        anchorBall: visual,
        model: null,
        selectionMarker,
        markerAnchorLocal: new THREE.Vector3(0, RACER_RADIUS * 1.9, 0),
        laneIndex: index,
        highlightMaterials: [material],
        animationMixer: null,
        animationActions: {},
        currentAnimationAction: null,
        currentAnimationRole: null,
        visualHeadingOffset: CUSTOM_RACER_MODELS[coin.id]?.headingOffset ?? 0
      });

      if (this.useCustomModels && CUSTOM_RACER_MODELS[coin.id]) {
        this.loadRacerModel(coin.id, CUSTOM_RACER_MODELS[coin.id].url);
      }
    });
  }

  loadRacerModel(racerId, modelUrl) {
    const entry = this.racerMeshes.get(racerId);
    if (!entry) {
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });

        normalizeRacerModel(model, CUSTOM_RACER_MODELS[racerId]?.scaleMultiplier ?? 1);

        if (!this.showBallAnchors && entry.visual?.parent === entry.mesh) {
          entry.mesh.remove(entry.visual);
        }

        const localBounds = new THREE.Box3().setFromObject(model);
        if (Number.isFinite(localBounds.max.y)) {
          entry.markerAnchorLocal.set(
            (localBounds.min.x + localBounds.max.x) / 2,
            localBounds.max.y,
            (localBounds.min.z + localBounds.max.z) / 2
          );
        }

        entry.mesh.add(model);
        entry.model = model;
        entry.visual = this.showBallAnchors ? entry.anchorBall ?? model : model;
        entry.highlightMaterials = this.showBallAnchors
          ? [...collectEmissiveMaterials(model), ...(entry.anchorBall ? [entry.anchorBall.material] : [])]
          : collectEmissiveMaterials(model);
        entry.animationMixer = null;
        entry.animationActions = {};
        entry.currentAnimationAction = null;
        entry.currentAnimationRole = null;

        const clips = selectPreferredRacerClips(gltf.animations);
        if (clips.idle || clips.start || clips.run) {
          entry.animationMixer = new THREE.AnimationMixer(model);
          entry.animationActions = buildRacerAnimationActions(entry.animationMixer, clips);
          setRacerAnimationRole(entry, "idle");
        }
      },
      undefined,
      () => {}
    );
  }

  loadTrackModel() {
    const loader = new GLTFLoader();

    loader.load(
      TRACK_MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });

        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());

        if (size.z > size.x) {
          model.rotation.y = Math.PI / 2;
          box = new THREE.Box3().setFromObject(model);
          size = box.getSize(new THREE.Vector3());
        }

        const fitScale = 26 / Math.max(size.x, size.z, 1);
        model.scale.setScalar(fitScale);

        box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;

        box = new THREE.Box3().setFromObject(model);
        model.position.y -= box.min.y;

        box = new THREE.Box3().setFromObject(model);
        size = box.getSize(new THREE.Vector3());

        this.baseTrackLayout = inferTrackLayout(size);
        hideTrackDecorations(model);

        this.trackModelRoot.clear();
        this.unregisterModelHitTargets();
        this.trackModelRoot.add(model);
        this.trackModelRoot.visible = true;
        this.fallbackTrackGroup.visible = false;
        this.trackModel = model;
        this.modelSurfaceTargets = [];
        model.traverse((child) => {
          if (child.isMesh && !child.userData.skipTrackInteractions) {
            this.modelSurfaceTargets.push(child);
            this.registerModelHitTarget(child);
          }
        });

        this.applyTuning();
      },
      undefined,
      () => {
        this.unregisterModelHitTargets();
        this.trackModel = null;
        this.trackModelRoot.visible = false;
        this.fallbackTrackGroup.visible = true;
        this.baseTrackLayout = cloneTrackLayout(DEFAULT_TRACK_LAYOUT);
        this.applyTuning();
      }
    );
  }

  applyTuning() {
    const tuning = this.tuning;
    const overallTrackScale = tuning.worldScale * tuning.trackModelScale;
    const rotation = THREE.MathUtils.degToRad(tuning.trackRotationDeg);

    this.trackRoot.scale.setScalar(overallTrackScale);
    this.trackRoot.rotation.y = rotation;
    this.trackRoot.position.set(tuning.trackOffsetX, tuning.trackOffsetY, tuning.trackOffsetZ);

    this.trackLayout = deriveTrackLayout(this.baseTrackLayout, tuning, overallTrackScale);
    this.updateTrackColliders();
    this.trackSurfaceTargets = this.colliderSurfaceTargets;
    this.updateSurfaceCeiling();
    this.updateMarkers();
    this.updateEditorSelectionVisual();
    this.updateCameraInteractionState();
  }

  updateSurfaceCeiling() {
    const activeTrack = this.colliderSurfaceTargets.length ? this.trackColliderGroup : this.trackModel ? this.trackModelRoot : this.fallbackTrackGroup;
    const box = new THREE.Box3().setFromObject(activeTrack);
    this.trackSurfaceCeilingY = box.max.y + 0.05;
  }

  updateTrackColliders() {
    if (!this.colliderSurfaceTargets.length) {
      return;
    }

    const colliderLayout = deriveTrackLayout(this.baseTrackLayout, this.tuning, 1);
    const laneGap =
      colliderLayout.lanes.length > 1
        ? Math.abs(colliderLayout.lanes[0].major - colliderLayout.lanes[1].major)
        : 1;
    const colliderRadius = clamp(laneGap * 0.42, 0.24, 0.78);

    this.colliderSurfaceTargets.forEach((mesh, index) => {
      const lane = colliderLayout.lanes[index] ?? colliderLayout.lanes.at(-1);
      mesh.geometry.dispose();
      mesh.geometry = buildStadiumTubeGeometry(lane.major, lane.minor, colliderRadius);
      mesh.position.y = lane.y - colliderRadius;
      mesh.scale.set(1, 1, 1);
    });
  }

  updateMarkers() {
    const outerLane = this.trackLayout.lanes[0];
    const innerLane = this.trackLayout.lanes[this.trackLayout.lanes.length - 1];
    const worldScale = this.tuning.worldScale;
    const startProgress = normalizeProgress((this.tuning.startAngleDeg + 90) / 360);
    const outerStartPoint = getStadiumLocalPointAtProgress(
      startProgress,
      outerLane.major,
      outerLane.minor
    );
    const innerStartPoint = getStadiumLocalPointAtProgress(
      startProgress,
      innerLane.major,
      innerLane.minor
    );
    const nextStartPoint = getStadiumLocalPointAtProgress(
      startProgress + 0.0025,
      outerLane.major,
      outerLane.minor
    );
    const outerWorldPoint = transformTrackPoint(
      outerStartPoint.x,
      outerStartPoint.z,
      this.tuning.trackOffsetX,
      this.tuning.trackOffsetZ,
      this.tuning.trackRotationDeg
    );
    const innerWorldPoint = transformTrackPoint(
      innerStartPoint.x,
      innerStartPoint.z,
      this.tuning.trackOffsetX,
      this.tuning.trackOffsetZ,
      this.tuning.trackRotationDeg
    );
    const nextWorldPoint = transformTrackPoint(
      nextStartPoint.x,
      nextStartPoint.z,
      this.tuning.trackOffsetX,
      this.tuning.trackOffsetZ,
      this.tuning.trackRotationDeg
    );
    const startLineCenter = {
      x: (outerWorldPoint.x + innerWorldPoint.x) * 0.5,
      z: (outerWorldPoint.z + innerWorldPoint.z) * 0.5
    };
    const startLineLength = Math.max(
      Math.hypot(outerWorldPoint.x - innerWorldPoint.x, outerWorldPoint.z - innerWorldPoint.z) * 1.08,
      1
    );
    const startLineHeading = Math.atan2(
      nextWorldPoint.x - outerWorldPoint.x,
      nextWorldPoint.z - outerWorldPoint.z
    );
    const markerPoint = transformTrackPoint(
      0,
      -this.trackLayout.markerMinor,
      this.tuning.trackOffsetX,
      this.tuning.trackOffsetZ,
      this.tuning.trackRotationDeg
    );
    const markerSurfaceY = this.getTrackSurfaceY(
      startLineCenter.x,
      startLineCenter.z,
      this.tuning.trackOffsetY + outerLane.y
    );
    const baseRotation = THREE.MathUtils.degToRad(this.tuning.trackRotationDeg);
    const startLineThickness = START_LINE_GEOMETRY_HEIGHT * worldScale * this.tuning.markerScale;
    const startLineHalfHeight = startLineThickness * 0.5;

    this.defaultMarkerPosition.set(
      startLineCenter.x,
      markerSurfaceY + startLineHalfHeight,
      startLineCenter.z
    );
    this.defaultBannerPosition.set(markerPoint.x, markerSurfaceY, markerPoint.z);

    this.startLine.scale.set(
      startLineLength * this.tuning.markerScale,
      worldScale * this.tuning.markerScale,
      worldScale * this.tuning.markerScale
    );
    this.startLine.rotation.y =
      startLineHeading + THREE.MathUtils.degToRad(this.tuning.markerRotationDeg);
    this.startLine.position.set(
      startLineCenter.x + this.tuning.markerOffsetX * worldScale,
      this.defaultMarkerPosition.y + this.tuning.markerYOffset * worldScale,
      startLineCenter.z + this.tuning.markerOffsetZ * worldScale
    );

    this.finishBanner.scale.set(
      worldScale * this.tuning.bannerScale,
      worldScale * this.tuning.bannerScale,
      worldScale * this.tuning.bannerScale
    );
    this.finishBanner.rotation.y =
      baseRotation + THREE.MathUtils.degToRad(this.tuning.bannerRotationDeg);
    this.finishBanner.position.set(
      markerPoint.x + this.tuning.bannerOffsetX * worldScale,
      markerSurfaceY + this.tuning.bannerYOffset * worldScale,
      markerPoint.z + this.tuning.bannerOffsetZ * worldScale
    );
  }

  render(engine, timeSec) {
    const state = engine.state;
    const ranking = engine.getRanking();
    const leader = ranking[0];
    const nowWallMs = Date.now();
    const worldScale = this.tuning.worldScale;
    const startProgress = normalizeProgress((this.tuning.startAngleDeg + 90) / 360);
    const deltaSec =
      this.previousRenderTimeSec === null ? 1 / 60 : Math.min(Math.max(timeSec - this.previousRenderTimeSec, 0), 0.1);
    this.previousRenderTimeSec = timeSec;
    let packCenterX = 0;
    let packCenterY = 0;
    let packCenterZ = 0;
    let packForwardX = 0;
    let packForwardZ = 0;
    let racerCount = 0;
    let leaderPose = null;
    const racerPoses = new Map();
    const animationRole = getRacerAnimationRole(state);

    state.racers.forEach((racer) => {
      const entry = this.racerMeshes.get(racer.id);
      const racerTuning = getRacerTuning(this.tuning, racer.id);
      const progress = (racer.distanceMeters / TRACK_LOOP_METERS) % 1;
      const lane = this.trackLayout.lanes[entry.laneIndex];
      const pathCenterX =
        this.tuning.trackOffsetX + (this.tuning.racerOffsetX + racerTuning.offsetX) * worldScale;
      const pathCenterZ =
        this.tuning.trackOffsetZ + (this.tuning.racerOffsetZ + racerTuning.offsetZ) * worldScale;
      const pathRotationDeg = this.tuning.trackRotationDeg + racerTuning.rotationDeg;
      const laneMajor = lane.major * racerTuning.majorScale;
      const laneMinor = lane.minor * racerTuning.minorScale;
      const localPoint = getStadiumLocalPointAtProgress(
        startProgress + progress,
        laneMajor,
        laneMinor
      );
      const nextLocalPoint = getStadiumLocalPointAtProgress(
        startProgress + progress + 0.0025,
        laneMajor,
        laneMinor
      );
      const worldPoint = transformTrackPoint(
        localPoint.x,
        localPoint.z,
        pathCenterX,
        pathCenterZ,
        pathRotationDeg
      );
      const nextWorldPoint = transformTrackPoint(
        nextLocalPoint.x,
        nextLocalPoint.z,
        pathCenterX,
        pathCenterZ,
        pathRotationDeg
      );
      const racerWorldX = worldPoint.x;
      const racerWorldZ = worldPoint.z;
      const baseMeshScale = worldScale * this.tuning.racerScale * racerTuning.scale;
      const winnerLocked = Boolean(state.winnerId) && racer.id === state.winnerId;
      const meshScale = baseMeshScale;
      const surfaceY = this.getTrackSurfaceY(
        racerWorldX,
        racerWorldZ,
        this.tuning.trackOffsetY + lane.y
      );
      const racerBaseY = surfaceY + (this.tuning.racerLift + racerTuning.lift) * worldScale;
      const heading = Math.atan2(
        nextWorldPoint.x - worldPoint.x,
        nextWorldPoint.z - worldPoint.z
      );

      entry.mesh.scale.setScalar(meshScale);
      entry.mesh.rotation.y = heading + entry.visualHeadingOffset;
      entry.mesh.position.set(racerWorldX, racerBaseY, racerWorldZ);
      if (entry.selectionMarker) {
        entry.selectionMarker.visible = false;
      }
      this.updateRacerMarkerDot(racer.id, entry);

      setRacerHighlight(
        entry,
        winnerLocked
          ? 0.45
          : racer.id === state.selectedRacerId
            ? 0.34
            : 0.18
      );

      setRacerAnimationRole(entry, animationRole);
      if (entry.currentAnimationAction) {
        entry.currentAnimationAction.timeScale =
          animationRole === "run"
            ? clamp(engine.getEffectiveSpeedFactor(racer), 0.1, 3.2)
            : animationRole === "start"
              ? 1.15
              : 1;
        entry.animationMixer?.update(deltaSec);
      }

      entry.mesh.updateMatrixWorld(true);
      const groundedRacerY = this.getGroundSnappedRacerY(entry, racerBaseY);
      if (Math.abs(groundedRacerY - entry.mesh.position.y) > 0.0001) {
        entry.mesh.position.y = groundedRacerY;
        entry.mesh.updateMatrixWorld(true);
      }

      packCenterX += racerWorldX;
      packCenterY += entry.mesh.position.y;
      packCenterZ += racerWorldZ;
      packForwardX += nextWorldPoint.x - worldPoint.x;
      packForwardZ += nextWorldPoint.z - worldPoint.z;
      racerCount += 1;

      if (leader && racer.id === leader.id) {
        leaderPose = {
          x: racerWorldX,
          y: entry.mesh.position.y,
          z: racerWorldZ,
          heading
        };
      }
      racerPoses.set(racer.id, {
        x: racerWorldX,
        y: entry.mesh.position.y,
        z: racerWorldZ,
        heading
      });

      const handle = this.racerEditorHandles.get(racer.id);
      const racerTargetId = getRacerTargetId(racer.id);
      this.racerHandleDefaults.set(racer.id, {
        x: pathCenterX,
        y: entry.mesh.position.y,
        z: pathCenterZ,
        rotationY: THREE.MathUtils.degToRad(pathRotationDeg)
      });

      if (!(this.editorDragging && this.selectedEditorTargetId === racerTargetId)) {
        handle.position.set(
          pathCenterX,
          entry.mesh.position.y,
          pathCenterZ
        );
        handle.rotation.y = THREE.MathUtils.degToRad(pathRotationDeg);
      }
    });

    const behindPose = this.getBehindPackCameraPose({
      packCenterX,
      packCenterY,
      packCenterZ,
      packForwardX,
      packForwardZ,
      racerCount,
      leaderPose,
      focusPose: this.getFocusedRacerPose(racerPoses),
      trackedSpeedFactor: leader ? engine.getEffectiveSpeedFactor(leader) : 1,
      worldScale
    });
    const prepActive = state.prepStarted && !state.raceStarted;
    const nowWallSec = nowWallMs / 1000;
    const prepAnimation = prepActive
      ? {
          ...START_CAMERA_ANIMATION_1,
          startedAtSec: state.prepStartedAtWallMs / 1000,
          durationSec: state.cameraIntroDurationMs / 1000
        }
      : null;
    const prepTargetPose = prepActive ? START_CAMERA_ANIMATION_1.to : null;
    const prepIntroActive =
      prepActive &&
      state.cameraIntroDurationMs > 0 &&
      nowWallMs - state.prepStartedAtWallMs < state.cameraIntroDurationMs;
    const winnerRevealActive =
      Boolean(leaderPose) &&
      state.raceFinished &&
      state.raceFinishedAtWallMs > 0 &&
      nowWallMs - state.raceFinishedAtWallMs >= WINNER_REVEAL_DELAY_MS;
    const raceStartBlendActive =
      state.raceStarted &&
      !state.raceFinished &&
      Boolean(behindPose) &&
      nowWallMs - state.raceStartedAtWallMs < START_TO_BEHIND_BLEND_MS;
    const raceStartBlendProgress = easeInOut(
      clamp(
        (nowWallMs - state.raceStartedAtWallMs) / Math.max(START_TO_BEHIND_BLEND_MS, 1),
        0,
        1
      )
    );

    if (winnerRevealActive) {
      this.applyWinnerRevealCamera(leaderPose, worldScale);
    } else if (prepActive && prepTargetPose) {
      this.applyCameraPose(
        prepIntroActive && prepAnimation
          ? getAnimatedCameraPose(prepAnimation, nowWallSec)
          : prepTargetPose
      );
    } else if (raceStartBlendActive && behindPose) {
      this.applyCameraPose(
        lerpCameraPose(START_CAMERA_ANIMATION_1.to, behindPose, raceStartBlendProgress)
      );
    } else if (this.activeCameraAnimation) {
      const animatedPose = getAnimatedCameraPose(this.activeCameraAnimation, timeSec);
      this.applyCameraPose(animatedPose);

      if (animatedPose.complete) {
        this.stopCameraAnimation(true);
      }
    } else if (this.cameraMode === "manual") {
      this.applyCameraPose(this.getManualCameraPose());
    } else if (this.cameraMode === "behind" && behindPose) {
      this.applyCameraPose(behindPose);
    } else {
      this.applyCameraPose(this.getOverviewCameraPose(timeSec, worldScale));
    }

    if (leader) {
      const leaderEntry = this.racerMeshes.get(leader.id);
      setRacerHighlight(leaderEntry, 0.24, true);
    }

    this.updateSelectedTrackLine();

    if (this.selectedEditorTargetId) {
      this.updateEditorSelectionVisual();
    }

    this.renderer.render(this.scene, this.camera);
    this.renderWinnerShowcase(timeSec);
  }

  setWinnerShowcase(winnerId) {
    if (!winnerId) {
      this.winnerShowcaseWinnerId = null;
      this.winnerShowcaseOverlay.style.display = "none";
      this.winnerShowcaseImage.src = "";
      this.clearWinnerShowcaseModel();
      return;
    }

    if (this.winnerShowcaseWinnerId === winnerId) {
      this.winnerShowcaseOverlay.style.display = "block";
      return;
    }

    this.winnerShowcaseWinnerId = winnerId;
    this.winnerShowcaseOverlay.style.display = "block";
    this.winnerShowcaseImage.src = SHOWCASE_IMAGE_URLS[winnerId] ?? SHOWCASE_IMAGE_URLS.BTC;
    const showcaseTransform = SHOWCASE_IMAGE_TRANSFORMS[winnerId] ?? SHOWCASE_IMAGE_TRANSFORMS.BTC;
    this.winnerShowcaseImage.style.top = showcaseTransform.top;
    this.winnerShowcaseImage.style.width = showcaseTransform.width;
    this.winnerShowcaseImage.style.left = showcaseTransform.left;
  }

  renderWinnerShowcase(timeSec) {
    if (!this.winnerShowcaseWinnerId) {
      return;
    }
    this.winnerShowcaseImage.style.transform = "translate(-50%, -50%)";
  }

  rebuildWinnerShowcaseModel(winnerId) {
    this.clearWinnerShowcaseModel();
    const entry = this.racerMeshes.get(winnerId);
    const source = entry?.model ?? entry?.visual ?? entry?.mesh ?? null;
    if (!source) {
      return;
    }

    const clone = source.clone(true);
    normalizeShowcaseModel(clone);
    clone.userData.baseRotationY = getWinnerShowcaseBaseRotation(winnerId);
    this.winnerShowcaseRoot.add(clone);
    this.winnerShowcaseModel = clone;
  }

  clearWinnerShowcaseModel() {
    if (!this.winnerShowcaseModel) {
      return;
    }
    this.winnerShowcaseRoot.remove(this.winnerShowcaseModel);
    disposeObject3D(this.winnerShowcaseModel);
    this.winnerShowcaseModel = null;
  }

  updateSelectedTrackLine() {
    const racerId = getRacerIdFromTarget(this.selectedEditorTargetId);
    if (!racerId) {
      this.selectedTrackLine.visible = false;
      return;
    }

    const entry = this.racerMeshes.get(racerId);
    if (!entry) {
      this.selectedTrackLine.visible = false;
      return;
    }

    const lane = this.trackLayout.lanes[entry.laneIndex];
    const worldScale = this.tuning.worldScale;
    const racerTuning = getRacerTuning(this.tuning, racerId);
    const pathCenterX =
      this.tuning.trackOffsetX + (this.tuning.racerOffsetX + racerTuning.offsetX) * worldScale;
    const pathCenterZ =
      this.tuning.trackOffsetZ + (this.tuning.racerOffsetZ + racerTuning.offsetZ) * worldScale;
    const pathRotationDeg = this.tuning.trackRotationDeg + racerTuning.rotationDeg;
    const laneMajor = lane.major * racerTuning.majorScale;
    const laneMinor = lane.minor * racerTuning.minorScale;
    const points = [];

    for (let index = 0; index < SELECTED_TRACK_POINTS; index += 1) {
      const localPoint = getStadiumLocalPointAtProgress(
        index / SELECTED_TRACK_POINTS,
        laneMajor,
        laneMinor
      );
      const worldPoint = transformTrackPoint(
        localPoint.x,
        localPoint.z,
        pathCenterX,
        pathCenterZ,
        pathRotationDeg
      );
      points.push(
        new THREE.Vector3(
          worldPoint.x,
          this.getTrackSurfaceY(worldPoint.x, worldPoint.z, this.tuning.trackOffsetY + lane.y) +
            0.03 * worldScale,
          worldPoint.z
        )
      );
    }

    this.selectedTrackLine.geometry.setFromPoints(points);
    this.selectedTrackLine.visible = true;
  }

  getTrackSurfaceY(x, z, fallbackY) {
    if (!this.trackSurfaceTargets.length) {
      return fallbackY;
    }

    this.surfaceProbe.set(x, this.trackSurfaceCeilingY + 20, z);
    this.surfaceRaycaster.set(this.surfaceProbe, this.surfaceDirection);
    const intersections = this.surfaceRaycaster.intersectObjects(this.trackSurfaceTargets, false);

    for (const hit of intersections) {
      if (hit.point.y <= this.trackSurfaceCeilingY) {
        return hit.point.y;
      }
    }

    return fallbackY;
  }

  getGroundSnappedRacerY(entry, targetGroundY) {
    if (!entry?.visual) {
      return targetGroundY;
    }

    this.racerGroundBounds.setFromObject(entry.visual);
    if (!Number.isFinite(this.racerGroundBounds.min.y)) {
      return targetGroundY;
    }

    return entry.mesh.position.y + (targetGroundY - this.racerGroundBounds.min.y);
  }

  dispose = () => {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("wheel", this.handleWheel);
    this.orbitControls.removeEventListener("change", this.handleOrbitControlsChange);
    this.orbitControls.dispose();
    this.transformControls.removeEventListener("change", this.handleTransformControlsChange);
    this.transformControls.removeEventListener("dragging-changed", this.handleDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.handleEditorObjectChange);
    this.transformControls.dispose();
    this.renderer.dispose();
    this.winnerShowcaseRenderer.dispose();
    this.clearWinnerShowcaseModel();
    this.winnerShowcaseOverlay?.remove();
    this.markerOverlay?.remove();
  };

  handleResize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  updateRacerMarkerDot(racerId, entry) {
    const markerDot = this.racerMarkerDots.get(racerId);
    if (!markerDot) {
      return;
    }

    if (!this.markersVisible) {
      markerDot.style.display = "none";
      return;
    }

    const anchorPoint = this.getRacerMarkerAnchor(entry);
    const projected = anchorPoint.project(this.camera);
    if (projected.z < -1 || projected.z > 1) {
      markerDot.style.display = "none";
      return;
    }

    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * width;
    const anchorY = (-projected.y * 0.5 + 0.5) * height;
    const y = anchorY - 144;

    markerDot.style.display = "block";
    markerDot.style.left = `${x}px`;
    markerDot.style.top = `${y}px`;
  }

  getRacerMarkerAnchor(entry) {
    const source = entry.model ?? entry.visual ?? entry.mesh;
    if (!source?.localToWorld) {
      return entry.mesh.position.clone();
    }

    return source.localToWorld(entry.markerAnchorLocal.clone());
  }

  handlePointerDown = (event) => {
    if (!this.enableEditorInteractions) {
      return;
    }

    if (this.cameraMode === "manual") {
      return;
    }

    if (this.transformControls.axis) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(this.editorHitTargets, false);
    const selectedObject = intersections[0]?.object;
    const editorTargetId = selectedObject?.userData?.editorTargetId;
    if (!editorTargetId) {
      return;
    }

    this.selectEditorTarget(editorTargetId);

    if (selectedObject.userData.racerId) {
      this.onSelectRacer(selectedObject.userData.racerId);
    }
  };

  handleDraggingChanged = (event) => {
    this.editorDragging = event.value;
    this.updateCameraInteractionState();
  };

  handleWheel = (event) => {
    if (!this.enableEditorInteractions) {
      return;
    }

    if (this.cameraMode === "manual") {
      return;
    }

    if (!this.selectedEditorTargetId) {
      return;
    }

    event.preventDefault();
    const wheelFactor = Math.exp(-event.deltaY * 0.0015);
    const partialTuning = this.getScaleAdjustmentFromWheel(wheelFactor, event);
    if (!Object.keys(partialTuning).length) {
      return;
    }

    this.setTuning(partialTuning);
  };

  handleTransformControlsChange = () => {
    if (this.selectedEditorTargetId) {
      this.updateEditorSelectionVisual();
    }
  };

  handleOrbitControlsChange = () => {
    if (this.cameraMode !== "manual" || this.isSyncingManualCamera) {
      return;
    }

    this.lastCameraLookTarget.copy(this.orbitControls.target);
    this.tuning = {
      ...this.tuning,
      cameraManualX: this.camera.position.x,
      cameraManualY: this.camera.position.y,
      cameraManualZ: this.camera.position.z,
      cameraLookX: this.orbitControls.target.x,
      cameraLookY: this.orbitControls.target.y,
      cameraLookZ: this.orbitControls.target.z
    };
    this.emitTuningChange();
  };

  handleEditorObjectChange = () => {
    if (!this.selectedEditorTargetId || this.isSyncingEditorChange) {
      return;
    }

    const partialTuning = this.getTuningFromSelectedTarget();
    if (!Object.keys(partialTuning).length) {
      return;
    }

    this.tuning = {
      ...this.tuning,
      ...sanitizeTuning(partialTuning)
    };

    this.isSyncingEditorChange = true;
    this.applyTuning();
    this.isSyncingEditorChange = false;
    this.emitTuningChange();
  };

  getTuningFromSelectedTarget() {
    const worldScale = Math.max(this.tuning.worldScale, 0.0001);

    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.track) {
      return {
        trackOffsetX: this.trackRoot.position.x,
        trackOffsetY: this.trackRoot.position.y,
        trackOffsetZ: this.trackRoot.position.z,
        trackRotationDeg: normalizeDegrees(THREE.MathUtils.radToDeg(this.trackRoot.rotation.y))
      };
    }

    const racerId = getRacerIdFromTarget(this.selectedEditorTargetId);
    if (racerId) {
      const handle = this.racerEditorHandles.get(racerId);
      const defaults = this.racerHandleDefaults.get(racerId);
      if (!handle || !defaults) {
        return {};
      }

      return {
        [getRacerKey(racerId, "OffsetX")]: (handle.position.x - defaults.x) / worldScale,
        [getRacerKey(racerId, "Lift")]: (handle.position.y - defaults.y) / worldScale,
        [getRacerKey(racerId, "OffsetZ")]: (handle.position.z - defaults.z) / worldScale,
        [getRacerKey(racerId, "RotationDeg")]: normalizeDegrees(
          THREE.MathUtils.radToDeg(handle.rotation.y - defaults.rotationY)
        )
      };
    }

    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.startLine) {
      return {
        markerOffsetX: (this.startLine.position.x - this.defaultMarkerPosition.x) / worldScale,
        markerYOffset: (this.startLine.position.y - this.defaultMarkerPosition.y) / worldScale,
        markerOffsetZ: (this.startLine.position.z - this.defaultMarkerPosition.z) / worldScale,
        markerRotationDeg: normalizeDegrees(
          THREE.MathUtils.radToDeg(this.startLine.rotation.y) - this.tuning.trackRotationDeg
        )
      };
    }

    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.finishBanner) {
      return {
        bannerOffsetX: (this.finishBanner.position.x - this.defaultBannerPosition.x) / worldScale,
        bannerYOffset: (this.finishBanner.position.y - this.defaultBannerPosition.y) / worldScale,
        bannerOffsetZ: (this.finishBanner.position.z - this.defaultBannerPosition.z) / worldScale,
        bannerRotationDeg: normalizeDegrees(
          THREE.MathUtils.radToDeg(this.finishBanner.rotation.y) - this.tuning.trackRotationDeg
        )
      };
    }

    return {};
  }

  getScaleAdjustmentFromWheel(wheelFactor, event) {
    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.track) {
      return {
        trackModelScale: clamp(this.tuning.trackModelScale * wheelFactor, 0.2, 4)
      };
    }

    const racerId = getRacerIdFromTarget(this.selectedEditorTargetId);
    if (racerId) {
      const racerTuning = getRacerTuning(this.tuning, racerId);
      const adjustMajor = event.shiftKey;
      const adjustMinor = event.altKey || event.metaKey;
      const next = {};

      if (adjustMajor) {
        next[getRacerKey(racerId, "MajorScale")] = clamp(
          racerTuning.majorScale * wheelFactor,
          0.4,
          3.5
        );
      }

      if (adjustMinor) {
        next[getRacerKey(racerId, "MinorScale")] = clamp(
          racerTuning.minorScale * wheelFactor,
          0.4,
          3.5
        );
      }

      return next;
    }

    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.startLine) {
      return {
        markerScale: clamp(this.tuning.markerScale * wheelFactor, 0.2, 4)
      };
    }

    if (this.selectedEditorTargetId === EDITOR_TARGET_IDS.finishBanner) {
      return {
        bannerScale: clamp(this.tuning.bannerScale * wheelFactor, 0.2, 4)
      };
    }

    return {};
  }

  updateEditorSelectionVisual() {
    const selected = this.editorTargets.get(this.selectedEditorTargetId);
    if (!selected) {
      this.editorSelectionHelper.visible = false;
      return;
    }

    const racerId = getRacerIdFromTarget(selected.id);
    if (racerId) {
      const entry = this.racerMeshes.get(racerId);
      if (!entry) {
        this.editorSelectionHelper.visible = false;
        return;
      }
      this.selectionBounds.setFromObject(entry.mesh);
      this.editorSelectionHelper.visible = !this.selectionBounds.isEmpty();
      return;
    }

    this.selectionBounds.setFromObject(selected.object);
    this.editorSelectionHelper.visible = !this.selectionBounds.isEmpty();
  }

  updateCameraInteractionState() {
    if (!this.orbitControls || !this.transformControls) {
      return;
    }

    const manualCameraActive = this.cameraMode === "manual";
    const cameraAnimationActive = Boolean(this.activeCameraAnimation);
    this.orbitControls.enabled = manualCameraActive && !this.editorDragging && !cameraAnimationActive;
    this.transformControls.enabled =
      !manualCameraActive && !cameraAnimationActive && Boolean(this.selectedEditorTargetId);
    this.transformControls.getHelper().visible =
      !manualCameraActive && !cameraAnimationActive && Boolean(this.selectedEditorTargetId);
  }

  syncManualCameraControlsFromTuning() {
    if (!this.orbitControls) {
      return;
    }

    this.isSyncingManualCamera = true;
    this.camera.position.set(
      this.tuning.cameraManualX,
      this.tuning.cameraManualY,
      this.tuning.cameraManualZ
    );
    this.orbitControls.target.set(
      this.tuning.cameraLookX,
      this.tuning.cameraLookY,
      this.tuning.cameraLookZ
    );
    this.lastCameraLookTarget.copy(this.orbitControls.target);
    this.orbitControls.update();
    this.isSyncingManualCamera = false;
  }

  captureCurrentCameraAsManual() {
    this.tuning = {
      ...this.tuning,
      cameraManualX: this.camera.position.x,
      cameraManualY: this.camera.position.y,
      cameraManualZ: this.camera.position.z,
      cameraLookX: this.lastCameraLookTarget.x,
      cameraLookY: this.lastCameraLookTarget.y,
      cameraLookZ: this.lastCameraLookTarget.z
    };
    this.emitTuningChange();
  }

  applyCameraPose(pose) {
    this.camera.position.set(pose.cameraManualX, pose.cameraManualY, pose.cameraManualZ);
    this.lastCameraLookTarget.set(pose.cameraLookX, pose.cameraLookY, pose.cameraLookZ);
    this.camera.lookAt(this.lastCameraLookTarget);
  }

  getManualCameraPose() {
    return {
      cameraManualX: this.tuning.cameraManualX,
      cameraManualY: this.tuning.cameraManualY,
      cameraManualZ: this.tuning.cameraManualZ,
      cameraLookX: this.tuning.cameraLookX,
      cameraLookY: this.tuning.cameraLookY,
      cameraLookZ: this.tuning.cameraLookZ
    };
  }

  getOverviewCameraPose(timeSec, worldScale) {
    const centerX = this.tuning.trackOffsetX;
    const centerZ = this.tuning.trackOffsetZ;
    const orbit =
      this.selectedEditorTargetId || this.editorDragging ? 0 : this.tuning.cameraOrbit;

    return {
      cameraManualX: centerX + Math.sin(timeSec * 0.12) * orbit * worldScale,
      cameraManualY: this.tuning.trackOffsetY + this.tuning.cameraHeight * worldScale,
      cameraManualZ: centerZ + this.tuning.cameraDistance * worldScale,
      cameraLookX: centerX,
      cameraLookY: this.tuning.trackOffsetY + 0.5 * worldScale,
      cameraLookZ: centerZ
    };
  }

  getBehindPackCameraPose({
    packCenterX,
    packCenterY,
    packCenterZ,
    packForwardX,
    packForwardZ,
    racerCount,
    leaderPose,
    focusPose,
    trackedSpeedFactor,
    worldScale
  }) {
    if (!racerCount) {
      return null;
    }

    const averageX = packCenterX / racerCount;
    const averageY = packCenterY / racerCount;
    const averageZ = packCenterZ / racerCount;
    const forwardVector = new THREE.Vector2(packForwardX, packForwardZ);
    const trackedPose = focusPose ?? leaderPose;

    if (forwardVector.lengthSq() < 0.0001 && trackedPose) {
      forwardVector.set(Math.sin(trackedPose.heading), Math.cos(trackedPose.heading));
    }

    if (forwardVector.lengthSq() < 0.0001) {
      forwardVector.set(0, 1);
    }

    forwardVector.normalize();

    const followX = trackedPose?.x ?? averageX;
    const followY = trackedPose?.y ?? averageY;
    const followZ = trackedPose?.z ?? averageZ;
    const speedBoost = clamp((trackedSpeedFactor ?? 1) - 1, 0, 2.4);
    const behindDistance = (clamp(this.tuning.cameraDistance * 0.24, 4.8, 6.8) + speedBoost * 1.4) * worldScale;
    const behindHeight = (clamp(this.tuning.cameraHeight * 0.16, 2.8, 4.2) + speedBoost * 0.35) * worldScale;
    const lookAhead = (6.8 + speedBoost * 4.5) * worldScale;
    const lookHeight = 0.9 * worldScale;
    const lookOriginX = trackedPose?.x ?? averageX;
    const lookOriginY = trackedPose?.y ?? averageY;
    const lookOriginZ = trackedPose?.z ?? averageZ;

    return {
      cameraManualX: followX - forwardVector.x * behindDistance,
      cameraManualY: followY + behindHeight,
      cameraManualZ: followZ - forwardVector.y * behindDistance,
      cameraLookX: lookOriginX + forwardVector.x * lookAhead,
      cameraLookY: lookOriginY + lookHeight,
      cameraLookZ: lookOriginZ + forwardVector.y * lookAhead
    };
  }

  getFocusedRacerPose(racerPoses) {
    if (!this.coins.some((coin) => coin.id === this.cameraFocusPreset)) {
      return null;
    }

    return racerPoses.get(this.cameraFocusPreset) ?? null;
  }

  applyWinnerRevealCamera(leaderPose, worldScale) {
    const forwardX = Math.sin(leaderPose.heading);
    const forwardZ = Math.cos(leaderPose.heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const frontDistance = 3.4 * worldScale;
    const sideOffset = 0.35 * worldScale;
    const cameraHeight = 1.45 * worldScale;
    const lookHeight = 1.15 * worldScale;

    this.camera.position.set(
      leaderPose.x + forwardX * frontDistance + rightX * sideOffset,
      leaderPose.y + cameraHeight,
      leaderPose.z + forwardZ * frontDistance + rightZ * sideOffset
    );
    this.lastCameraLookTarget.set(
      leaderPose.x,
      leaderPose.y + lookHeight,
      leaderPose.z
    );
    this.camera.lookAt(this.lastCameraLookTarget);
  }

  stopCameraAnimation(commitEndPose) {
    if (!this.activeCameraAnimation) {
      return;
    }

    const finalPose = commitEndPose
      ? this.activeCameraAnimation.to
      : {
          cameraManualX: this.camera.position.x,
          cameraManualY: this.camera.position.y,
          cameraManualZ: this.camera.position.z,
          cameraLookX: this.lastCameraLookTarget.x,
          cameraLookY: this.lastCameraLookTarget.y,
          cameraLookZ: this.lastCameraLookTarget.z
        };

    this.activeCameraAnimation = null;
    this.tuning = {
      ...this.tuning,
      ...finalPose
    };
    this.syncManualCameraControlsFromTuning();
    this.emitTuningChange();
    this.updateCameraInteractionState();
  }

  registerEditorHitTarget(object, targetId) {
    object.userData.editorTargetId = targetId;
    this.editorHitTargets.push(object);
  }

  registerModelHitTarget(object) {
    object.userData.editorTargetId = EDITOR_TARGET_IDS.track;
    this.modelEditorHitTargets.push(object);
    this.editorHitTargets.push(object);
  }

  unregisterModelHitTargets() {
    if (!this.modelEditorHitTargets.length) {
      return;
    }

    const modelHitTargetSet = new Set(this.modelEditorHitTargets);
    this.editorHitTargets = this.editorHitTargets.filter((object) => !modelHitTargetSet.has(object));
    this.modelEditorHitTargets = [];
  }

  emitTuningChange() {
    this.editorCallbacks.onTuningChange?.(this.getTuning());
  }

  emitSelectionChange() {
    this.editorCallbacks.onSelectionChange?.(this.getSelectedEditorTarget());
  }

  emitModeChange() {
    this.editorCallbacks.onModeChange?.(this.editorMode);
  }
}

function inferTrackLayout(size) {
  const outerMajor = size.x * 0.35;
  const outerMinor = size.z * 0.28;
  const laneGap = Math.max(0.75, Math.min(size.x, size.z) * 0.05);
  const laneY = Math.max(0.12, size.y * 0.06);

  return {
    lanes: Array.from({ length: 4 }, (_, index) => ({
      major: Math.max(3.2, outerMajor - laneGap * index),
      minor: Math.max(2.0, outerMinor - laneGap * index),
      y: laneY
    })),
    markerMinor: outerMinor + 0.45
  };
}

function deriveTrackLayout(baseLayout, tuning, overallTrackScale) {
  const outerBase = baseLayout.lanes[0];

  return {
    lanes: baseLayout.lanes.map((baseLane) => {
      const majorDelta = outerBase.major - baseLane.major;
      const minorDelta = outerBase.minor - baseLane.minor;
      return {
        major:
          (outerBase.major - majorDelta * tuning.laneGapScale) *
          tuning.laneMajorScale *
          overallTrackScale,
        minor:
          (outerBase.minor - minorDelta * tuning.laneGapScale) *
          tuning.laneMinorScale *
          overallTrackScale,
        y: baseLane.y * overallTrackScale
      };
    }),
    markerMinor: baseLayout.markerMinor * tuning.laneMinorScale * overallTrackScale
  };
}

function transformTrackPoint(localX, localZ, offsetX, offsetZ, rotationDeg) {
  const rotation = THREE.MathUtils.degToRad(rotationDeg);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: localX * cos - localZ * sin + offsetX,
    z: localX * sin + localZ * cos + offsetZ
  };
}

function buildStadiumTubeGeometry(major, minor, tubeRadius) {
  const curve = new THREE.CatmullRomCurve3(
    buildStadiumCurvePoints(major, minor, 72),
    true,
    "centripetal"
  );

  return new THREE.TubeGeometry(curve, 180, tubeRadius, 12, true);
}

function createRacerPickMesh(racerId) {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  material.colorWrite = false;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(RACER_RADIUS * 1.18, 20, 20),
    material
  );
  mesh.position.y = RACER_RADIUS;
  mesh.userData = { racerId };
  return mesh;
}

function createSelectionMarker() {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(RACER_RADIUS * 0.18, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  marker.visible = true;
  marker.renderOrder = 20;
  return marker;
}


function normalizeRacerModel(model, scaleMultiplier = 1) {
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());

  if (size.z > size.x) {
    model.rotation.y = Math.PI / 2;
    box = new THREE.Box3().setFromObject(model);
    size = box.getSize(new THREE.Vector3());
  }

  const fitScale = ((RACER_RADIUS * 2.1) / Math.max(size.x, size.y, size.z, 1)) * scaleMultiplier;
  model.scale.setScalar(fitScale);

  box = new THREE.Box3().setFromObject(model);
  const center = getModelFootprintCenter(model, box, size) ?? box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
}

function normalizeShowcaseModel(model) {
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const fitScale = 2400 / maxDimension;
  model.scale.setScalar(fitScale);

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry?.dispose) {
      child.geometry.dispose();
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else if (child.material?.dispose) {
      child.material.dispose();
    }
  });
}

function getWinnerShowcaseBaseRotation(winnerId) {
  return {
    BTC: 0.0,
    ETH: 1.05,
    SOL: 1.2,
    DOGE: 0.95,
    XRP: 1.1,
    TRX: 1.0,
    BNB: 1.15,
    ADA: 1.25,
    SUI: 1.35,
    LTC: 1.35
  }[winnerId] ?? 1.1;
}

function getModelFootprintCenter(model, box, size) {
  const floorThreshold = box.min.y + Math.max(size.y * 0.18, 0.02);
  const footprintMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const footprintMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const vertex = new THREE.Vector3();
  let pointCount = 0;

  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) {
      return;
    }

    const positions = child.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      if (vertex.y > floorThreshold) {
        continue;
      }

      footprintMin.min(vertex);
      footprintMax.max(vertex);
      pointCount += 1;
    }
  });

  if (!pointCount) {
    return null;
  }

  return new THREE.Vector3(
    (footprintMin.x + footprintMax.x) * 0.5,
    box.min.y,
    (footprintMin.z + footprintMax.z) * 0.5
  );
}

function getAnimatedCameraPose(animation, timeSec) {
  const elapsedSec = Math.max(0, timeSec - animation.startedAtSec);
  const rawProgress = clamp(elapsedSec / animation.durationSec, 0, 1);
  const firstLegRatio = clamp(animation.firstLegRatio ?? 0.5, 0.1, 0.9);
  const waypoint = animation.via ?? animation.to;
  const pose =
    rawProgress <= firstLegRatio
      ? lerpCameraPose(animation.from, waypoint, easeInOut(rawProgress / firstLegRatio))
      : lerpCameraPose(
          waypoint,
          animation.to,
          easeInOut((rawProgress - firstLegRatio) / Math.max(1 - firstLegRatio, 0.0001))
        );

  return {
    ...pose,
    complete: rawProgress >= 1
  };
}

function lerpCameraPose(from, to, progress) {
  return {
    cameraManualX: THREE.MathUtils.lerp(from.cameraManualX, to.cameraManualX, progress),
    cameraManualY: THREE.MathUtils.lerp(from.cameraManualY, to.cameraManualY, progress),
    cameraManualZ: THREE.MathUtils.lerp(from.cameraManualZ, to.cameraManualZ, progress),
    cameraLookX: THREE.MathUtils.lerp(from.cameraLookX, to.cameraLookX, progress),
    cameraLookY: THREE.MathUtils.lerp(from.cameraLookY, to.cameraLookY, progress),
    cameraLookZ: THREE.MathUtils.lerp(from.cameraLookZ, to.cameraLookZ, progress)
  };
}

function shiftCameraPoseRight(pose, distance) {
  const forward = new THREE.Vector3(
    pose.cameraLookX - pose.cameraManualX,
    0,
    pose.cameraLookZ - pose.cameraManualZ
  );

  if (forward.lengthSq() < 0.0001) {
    return { ...pose };
  }

  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  return {
    cameraManualX: pose.cameraManualX + right.x * distance,
    cameraManualY: pose.cameraManualY,
    cameraManualZ: pose.cameraManualZ + right.z * distance,
    cameraLookX: pose.cameraLookX + right.x * distance,
    cameraLookY: pose.cameraLookY,
    cameraLookZ: pose.cameraLookZ + right.z * distance
  };
}

function createCheckerTexture() {
  const size = 256;
  const cellsX = 16;
  const cellsY = 4;
  const cellWidth = size / cellsX;
  const cellHeight = size / cellsY;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  for (let row = 0; row < cellsY; row += 1) {
    for (let column = 0; column < cellsX; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? "#111111" : "#f7f3e8";
      context.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#060914");
  gradient.addColorStop(0.38, "#14203a");
  gradient.addColorStop(0.68, "#223153");
  gradient.addColorStop(1, "#4f5d73");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 140; index += 1) {
    const x = pseudoRandom(index * 4.17) * canvas.width;
    const y = pseudoRandom(index * 8.23) * canvas.height * 0.72;
    const radius = 0.4 + pseudoRandom(index * 11.91) * 1.8;
    const alpha = 0.18 + pseudoRandom(index * 16.3) * 0.45;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pseudoRandom(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function easeInOut(progress) {
  const clamped = clamp(progress, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function collectEmissiveMaterials(root) {
  const materials = [];
  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    meshMaterials.forEach((material) => {
      if (material && "emissiveIntensity" in material) {
        materials.push(material);
      }
    });
  });

  return materials;
}

function hideTrackDecorations(root) {
  const nodesToRemove = [];
  root.traverse((child) => {
    const name = child.name ?? "";
    if (HIDDEN_TRACK_NODE_PATTERNS.some((pattern) => pattern.test(name))) {
      nodesToRemove.push(child);
    }
  });

  nodesToRemove.forEach((node) => {
    node.traverse((descendant) => {
      descendant.visible = false;
      descendant.userData.skipTrackInteractions = true;
    });
    if (node.parent) {
      node.parent.remove(node);
    }
  });
}

function setRacerHighlight(entry, intensity, preserveHigher = false) {
  for (const material of entry?.highlightMaterials ?? []) {
    material.emissiveIntensity = preserveHigher
      ? Math.max(material.emissiveIntensity, intensity)
      : intensity;
  }
}

function selectPreferredRacerClips(clips) {
  if (!clips?.length) {
    return { idle: null, start: null, run: null };
  }

  return {
    idle: findNamedClip(clips, [
      "Idle",
      "AnimalArmature|Idle",
      "Idle_2",
      "AnimalArmature|Idle_2",
      "Idle_Headlow",
      "AnimalArmature|Idle_Headlow",
      "Idle_2_HeadLow",
      "AnimalArmature|Idle_2_HeadLow"
    ]),
    start: findNamedClip(clips, [
      "Gallop",
      "AnimalArmature|Gallop",
      "Walk",
      "AnimalArmature|Walk",
      "Gallop_Jump",
      "AnimalArmature|Gallop_Jump",
      "Jump_toIdle",
      "AnimalArmature|Jump_toIdle",
      "Jump_ToIdle",
      "AnimalArmature|Jump_ToIdle"
    ]),
    run: findNamedClip(clips, [
      "Gallop",
      "AnimalArmature|Gallop",
      "Walk",
      "AnimalArmature|Walk",
      "Idle",
      "AnimalArmature|Idle"
    ])
  };
}

function findNamedClip(clips, preferredNames) {
  for (const name of preferredNames) {
    const clip = clips.find((entry) => entry.name === name);
    if (clip) {
      return clip;
    }
  }

  return (
    clips.find((entry) => /idle/i.test(entry.name) && !/hitreact/i.test(entry.name)) ??
    clips.find((entry) => /walk/i.test(entry.name)) ??
    clips.find((entry) => /gallop/i.test(entry.name) && !/jump/i.test(entry.name)) ??
    clips[0] ??
    null
  );
}

function buildRacerAnimationActions(mixer, clips) {
  const actions = {};
  for (const [role, clip] of Object.entries(clips)) {
    if (!clip) {
      continue;
    }

    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.clampWhenFinished = false;
    action.setLoop(THREE.LoopRepeat, Infinity);
    actions[role] = action;
  }

  if (!actions.start) {
    actions.start = actions.run ?? actions.idle ?? null;
  }
  if (!actions.run) {
    actions.run = actions.start ?? actions.idle ?? null;
  }
  if (!actions.idle) {
    actions.idle = actions.start ?? actions.run ?? null;
  }

  return actions;
}

function setRacerAnimationRole(entry, role) {
  const nextAction =
    entry.animationActions?.[role] ??
    entry.animationActions?.run ??
    entry.animationActions?.idle ??
    null;

  if (!nextAction || entry.currentAnimationAction === nextAction) {
    entry.currentAnimationRole = role;
    return;
  }

  const previousAction = entry.currentAnimationAction;
  previousAction?.fadeOut(0.2);
  nextAction.reset().fadeIn(previousAction ? 0.2 : 0).play();
  entry.currentAnimationAction = nextAction;
  entry.currentAnimationRole = role;
}

function getRacerAnimationRole(state) {
  if (!state.raceStarted) {
    return "idle";
  }

  if (state.visualRaceComplete) {
    return "idle";
  }

  const elapsedSec = Math.max(0, (Date.now() - state.raceStartedAtWallMs) / 1000);
  return elapsedSec < START_RACER_ANIMATION_DURATION_SEC ? "start" : "run";
}

function buildStadiumCurvePoints(major, minor, pointCount) {
  return Array.from({ length: pointCount }, (_, index) => {
    const point = getStadiumLocalPointAtProgress(index / pointCount, major, minor);
    return new THREE.Vector3(point.x, 0, point.z);
  });
}

function getStadiumLocalPointAtProgress(progress, major, minor) {
  const turnRadius = Math.max(minor, 0.1);
  const halfStraight = Math.max(major - turnRadius, 0);
  const topStraight = halfStraight;
  const fullStraight = halfStraight * 2;
  const arcLength = Math.PI * turnRadius;
  const loopLength = topStraight + arcLength + fullStraight + arcLength + topStraight;
  let distance = normalizeProgress(progress) * loopLength;

  if (distance <= topStraight) {
    return { x: distance, z: -turnRadius };
  }

  distance -= topStraight;
  if (distance <= arcLength) {
    const angle = -Math.PI / 2 + distance / turnRadius;
    return {
      x: halfStraight + Math.cos(angle) * turnRadius,
      z: Math.sin(angle) * turnRadius
    };
  }

  distance -= arcLength;
  if (distance <= fullStraight) {
    return { x: halfStraight - distance, z: turnRadius };
  }

  distance -= fullStraight;
  if (distance <= arcLength) {
    const angle = Math.PI / 2 + distance / turnRadius;
    return {
      x: -halfStraight + Math.cos(angle) * turnRadius,
      z: Math.sin(angle) * turnRadius
    };
  }

  distance -= arcLength;
  return { x: -halfStraight + distance, z: -turnRadius };
}

function cloneTrackLayout(layout) {
  return {
    lanes: layout.lanes.map((lane) => ({ ...lane })),
    markerMinor: layout.markerMinor
  };
}

function sanitizeTuning(value) {
  const next = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    let targetKey = key;
    if (!(targetKey in DEFAULT_SCENE_TUNING) && targetKey.endsWith("AngleDeg")) {
      const rotationKey = `${targetKey.slice(0, -8)}RotationDeg`;
      if (rotationKey in DEFAULT_SCENE_TUNING) {
        targetKey = rotationKey;
      }
    }

    if (!(targetKey in DEFAULT_SCENE_TUNING)) {
      continue;
    }

    const numeric = Number(entry);
    if (Number.isFinite(numeric)) {
      next[targetKey] = numeric;
    }
  }
  return next;
}

function normalizeDegrees(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function normalizeProgress(value) {
  return ((value % 1) + 1) % 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRacerTargetId(racerId) {
  return `racer:${racerId}`;
}

function getRacerIdFromTarget(targetId) {
  return targetId?.startsWith("racer:") ? targetId.slice(6) : null;
}

function getRacerKey(racerId, suffix) {
  return `${racerId.toLowerCase()}${suffix}`;
}

function buildCustomRacerModels() {
  const models = {};

  Object.values(MARKET_MODEL_LINKS).forEach((marketLinks) => {
    Object.entries(marketLinks).forEach(([tokenId, modelKey]) => {
      const model = RACER_MODEL_LIBRARY[modelKey];
      if (!model || models[tokenId]) {
        return;
      }

      models[tokenId] = {
        url: new URL(`../assets/${model.asset}`, import.meta.url).href,
        headingOffset: model.headingOffset ?? -Math.PI / 2,
        scaleMultiplier: model.scaleMultiplier ?? 1
      };
    });
  });

  return models;
}

function buildPerRacerDefaults() {
  const racerDefaults = {
    BTC: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.12139097979866686,
      Scale: 0.34,
      RotationDeg: 0,
      MajorScale: 1.3448803876711752,
      MinorScale: 1.5658095449844573
    },
    ETH: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.47,
      RotationDeg: 0,
      MajorScale: 1.42,
      MinorScale: 1.8200000000000003
    },
    SOL: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    },
    DOGE: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06416150061094567,
      Scale: 0.05,
      RotationDeg: 0,
      MajorScale: 1.661130565705538,
      MinorScale: 2.758409631330628
    },
    XRP: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.42,
      MinorScale: 1.82
    },
    TRX: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    },
    BNB: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    },
    ADA: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    },
    SUI: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    },
    LTC: {
      OffsetX: -0.008102738778875601,
      OffsetZ: 0.09236270202076502,
      Lift: -0.06,
      Scale: 0.42,
      RotationDeg: 0,
      MajorScale: 1.52,
      MinorScale: 2.24
    }
  };

  const tokenIds = [...new Set(Object.values(MARKET_MODEL_LINKS).flatMap((marketLinks) => Object.keys(marketLinks)))];

  return Object.fromEntries(
    tokenIds.flatMap((tokenId) => {
      const defaults = racerDefaults[tokenId] ?? {};
      return [
        [getRacerKey(tokenId, "OffsetX"), defaults.OffsetX ?? 0],
        [getRacerKey(tokenId, "OffsetZ"), defaults.OffsetZ ?? 0],
        [getRacerKey(tokenId, "Lift"), defaults.Lift ?? 0],
        [getRacerKey(tokenId, "Scale"), defaults.Scale ?? 1],
        [getRacerKey(tokenId, "RotationDeg"), defaults.RotationDeg ?? 0],
        [getRacerKey(tokenId, "MajorScale"), defaults.MajorScale ?? 1],
        [getRacerKey(tokenId, "MinorScale"), defaults.MinorScale ?? 1]
      ];
    })
  );
}

function getRacerTuning(tuning, racerId) {
  return {
    offsetX: tuning[getRacerKey(racerId, "OffsetX")] ?? 0,
    offsetZ: tuning[getRacerKey(racerId, "OffsetZ")] ?? 0,
    lift: tuning[getRacerKey(racerId, "Lift")] ?? 0,
    scale: tuning[getRacerKey(racerId, "Scale")] ?? 1,
    rotationDeg:
      tuning[getRacerKey(racerId, "RotationDeg")] ??
      tuning[getRacerKey(racerId, "AngleDeg")] ??
      0,
    majorScale: tuning[getRacerKey(racerId, "MajorScale")] ?? 1,
    minorScale: tuning[getRacerKey(racerId, "MinorScale")] ?? 1
  };
}
