import { DEFAULT_SCENE_TUNING } from "./renderer.js";

const STORAGE_KEY = "binance-ring-rally-3d-tuning";

const COMMON_FIELDS = [
  { key: "worldScale", label: "World Scale", min: 0.2, max: 4, step: 0.05 },
  { key: "trackModelScale", label: "Track Model Scale", min: 0.2, max: 4, step: 0.05 },
  { key: "trackOffsetX", label: "Track Offset X", min: -20, max: 20, step: 0.1 },
  { key: "trackOffsetY", label: "Track Offset Y", min: -10, max: 10, step: 0.05 },
  { key: "trackOffsetZ", label: "Track Offset Z", min: -20, max: 20, step: 0.1 },
  { key: "trackRotationDeg", label: "Track Rotation Y", min: -180, max: 180, step: 1 },
  { key: "laneMajorScale", label: "Lane Major Scale", min: 0.4, max: 3.5, step: 0.02 },
  { key: "laneMinorScale", label: "Lane Minor Scale", min: 0.4, max: 3.5, step: 0.02 },
  { key: "laneGapScale", label: "Lane Gap Scale", min: 0.3, max: 3.5, step: 0.02 },
  { key: "racerOffsetX", label: "All Racers X", min: -8, max: 8, step: 0.05 },
  { key: "racerOffsetZ", label: "All Racers Z", min: -8, max: 8, step: 0.05 },
  { key: "racerScale", label: "All Racer Scale", min: 0.2, max: 4, step: 0.02 },
  { key: "racerLift", label: "All Racer Lift", min: -2, max: 4, step: 0.02 },
  { key: "startAngleDeg", label: "Base Start Angle", min: -180, max: 180, step: 1 },
  { key: "bannerOffsetX", label: "Banner X", min: -8, max: 8, step: 0.05 },
  { key: "bannerYOffset", label: "Banner Y", min: 0, max: 8, step: 0.05 },
  { key: "bannerOffsetZ", label: "Banner Z", min: -8, max: 8, step: 0.05 },
  { key: "bannerRotationDeg", label: "Banner Rot", min: -180, max: 180, step: 1 },
  { key: "bannerScale", label: "Banner Scale", min: 0.2, max: 4, step: 0.02 },
  { key: "cameraHeight", label: "Camera Height", min: 4, max: 60, step: 0.1 },
  { key: "cameraDistance", label: "Camera Distance", min: 4, max: 80, step: 0.1 },
  { key: "cameraOrbit", label: "Camera Orbit", min: 0, max: 20, step: 0.05 },
  { key: "cameraManualX", label: "Manual Cam X", min: -80, max: 80, step: 0.1 },
  { key: "cameraManualY", label: "Manual Cam Y", min: -10, max: 80, step: 0.1 },
  { key: "cameraManualZ", label: "Manual Cam Z", min: -80, max: 80, step: 0.1 },
  { key: "cameraLookX", label: "Manual Look X", min: -80, max: 80, step: 0.1 },
  { key: "cameraLookY", label: "Manual Look Y", min: -10, max: 40, step: 0.1 },
  { key: "cameraLookZ", label: "Manual Look Z", min: -80, max: 80, step: 0.1 }
];

const MODE_LABELS = {
  translate: "Move",
  rotate: "Rotate"
};

const QUICK_ACTIONS = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "up", label: "Lift +" },
  { id: "down", label: "Lift -" },
  { id: "rotateLeft", label: "Turn -" },
  { id: "rotateRight", label: "Turn +" },
  { id: "wider", label: "Wider" },
  { id: "narrower", label: "Narrower" },
  { id: "deeper", label: "Deeper" },
  { id: "shallower", label: "Shallower" },
  { id: "bigger", label: "Scale +" },
  { id: "smaller", label: "Scale -" }
];

const QUICK_STEPS = {
  move: 0.35,
  lift: 0.2,
  rotate: 3,
  stretch: 0.04,
  scale: 0.04
};

export class SceneEditor {
  constructor({ root, renderer, storageKey = STORAGE_KEY, defaultTuning = DEFAULT_SCENE_TUNING }) {
    this.renderer = renderer;
    this.storageKey = storageKey;
    this.defaultTuning = defaultTuning;
    this.targetButtonMap = new Map();
    this.quickButtonMap = new Map();
    this.fieldDefinitions = [];
    this.currentFieldSignature = "";
    this.dom = {
      fields: root.querySelector("#editorFields"),
      json: root.querySelector("#editorJson"),
      status: root.querySelector("#editorStatus"),
      modeBadge: root.querySelector("#editorModeBadge"),
      translateButton: root.querySelector("#editorTranslateButton"),
      rotateButton: root.querySelector("#editorRotateButton"),
      targetButtons: root.querySelector("#editorTargetButtons"),
      selectionSummary: root.querySelector("#editorSelectionSummary"),
      quickTitle: root.querySelector("#quickEditTitle"),
      quickCopy: root.querySelector("#quickEditCopy"),
      quickButtons: root.querySelector("#quickEditButtons"),
      copyButton: root.querySelector("#copyEditorJsonButton"),
      applyButton: root.querySelector("#applyEditorJsonButton"),
      resetButton: root.querySelector("#resetEditorButton")
    };

    this.buildTargetButtons();
    this.buildQuickButtons();
    this.bindActions();

    this.renderer.setEditorCallbacks({
      onModeChange: () => this.refreshMode(),
      onSelectionChange: (selected) => {
        this.refreshSelection();
        if (selected) {
          this.setStatus(`Editing ${selected.label}.`);
        }
      },
      onTuningChange: () => {
        this.persist();
        this.refresh();
      }
    });

    const savedTuning = loadSavedTuning(this.storageKey);
    this.renderer.setTuning(savedTuning ?? this.defaultTuning);
    this.setStatus(savedTuning ? "Loaded saved tuning." : "Using default tuning.");
    this.refresh();
  }

  buildTargetButtons() {
    this.dom.targetButtons.innerHTML = this.renderer
      .getEditableTargets()
      .map(
        (target) => `
          <button class="editor-target-button" type="button" data-target-id="${target.id}">
            ${target.label}
          </button>
        `
      )
      .join("");

    for (const button of this.dom.targetButtons.querySelectorAll("[data-target-id]")) {
      const targetId = button.dataset.targetId;
      button.addEventListener("click", () => {
        this.renderer.selectEditorTarget(targetId);
      });
      this.targetButtonMap.set(targetId, button);
    }
  }

  buildQuickButtons() {
    this.dom.quickButtons.innerHTML = QUICK_ACTIONS
      .map(
        (action) => `
          <button class="quick-edit-button" type="button" data-quick-action="${action.id}">
            ${action.label}
          </button>
        `
      )
      .join("");

    for (const button of this.dom.quickButtons.querySelectorAll("[data-quick-action]")) {
      const actionId = button.dataset.quickAction;
      button.addEventListener("click", () => {
        this.applyQuickAction(actionId);
      });
      this.quickButtonMap.set(actionId, button);
    }
  }

  buildFields(definitions) {
    this.fieldDefinitions = definitions;
    this.dom.fields.innerHTML = definitions
      .map(
        (field) => `
          <label class="editor-field">
            <span class="editor-label">${field.label}</span>
            <input
              class="editor-input"
              type="number"
              data-key="${field.key}"
              min="${field.min}"
              max="${field.max}"
              step="${field.step}"
            />
          </label>
        `
      )
      .join("");

    for (const input of this.dom.fields.querySelectorAll("[data-key]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.key;
        const value = Number(input.value);
        if (!Number.isFinite(value)) {
          return;
        }

        this.renderer.setTuning({ [key]: value });
        this.setStatus(`Updated ${getFieldLabel(key, this.fieldDefinitions)}.`);
      });
    }
  }

  bindActions() {
    this.dom.translateButton.addEventListener("click", () => {
      this.renderer.setEditorMode("translate");
      this.setStatus("Move mode active.");
    });

    this.dom.rotateButton.addEventListener("click", () => {
      this.renderer.setEditorMode("rotate");
      this.setStatus("Rotate mode active.");
    });

    this.dom.copyButton.addEventListener("click", async () => {
      this.refreshJson();
      try {
        await navigator.clipboard.writeText(this.dom.json.value);
        this.setStatus("Copied tuning JSON.");
      } catch {
        this.dom.json.focus();
        this.dom.json.select();
        this.setStatus("Select and copy the JSON manually.");
      }
    });

    this.dom.applyButton.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(this.dom.json.value);
        this.renderer.setTuning(parsed);
        this.setStatus("Applied tuning JSON.");
      } catch {
        this.setStatus("JSON parse failed.");
      }
    });

    this.dom.resetButton.addEventListener("click", () => {
      this.renderer.setTuning(this.defaultTuning);
      this.setStatus("Reset tuning to defaults.");
    });
  }

  refresh() {
    const selectedId = this.renderer.getSelectedEditorTarget()?.id ?? null;
    const nextDefinitions = getFieldDefinitions(selectedId);
    const nextSignature = nextDefinitions.map((field) => field.key).join("|");

    if (nextSignature !== this.currentFieldSignature) {
      this.buildFields(nextDefinitions);
      this.currentFieldSignature = nextSignature;
    }

    const tuning = this.renderer.getTuning();
    for (const input of this.dom.fields.querySelectorAll("[data-key]")) {
      const key = input.dataset.key;
      input.value = String(tuning[key]);
    }

    this.refreshJson();
    this.refreshMode();
    this.refreshSelection();
  }

  refreshMode() {
    const mode = this.renderer.getEditorMode();
    this.dom.modeBadge.textContent = MODE_LABELS[mode];
    this.dom.translateButton.classList.toggle("is-active", mode === "translate");
    this.dom.rotateButton.classList.toggle("is-active", mode === "rotate");
  }

  refreshSelection() {
    const selected = this.renderer.getSelectedEditorTarget();
    for (const [targetId, button] of this.targetButtonMap.entries()) {
      button.classList.toggle("is-active", selected?.id === targetId);
    }

    this.dom.selectionSummary.textContent = selected
      ? describeSelection(selected.id, selected.label, this.renderer.getTuning())
      : "Click one racer to show its red track path. Use Rotate to turn that path, scroll to stretch both axes, Shift plus scroll for major width, and Alt or Option plus scroll for minor depth.";

    this.refreshQuickEditor(selected);
  }

  refreshJson() {
    this.dom.json.value = JSON.stringify(this.renderer.getTuning(), null, 2);
  }

  persist() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.renderer.getTuning()));
  }

  setStatus(message) {
    this.dom.status.textContent = message;
  }

  refreshQuickEditor(selected) {
    const meta = getQuickEditMeta(selected?.id);
    this.dom.quickTitle.textContent = meta.title;
    this.dom.quickCopy.textContent = meta.copy;

    for (const [actionId, button] of this.quickButtonMap.entries()) {
      button.textContent = getQuickActionButtonLabel(actionId, selected?.id);
      button.disabled = !supportsQuickAction(selected?.id, actionId);
    }
  }

  applyQuickAction(actionId) {
    const selected = this.renderer.getSelectedEditorTarget();
    if (!selected) {
      this.setStatus("Select World Track or one racer first.");
      return;
    }

    const partialTuning = getQuickActionPatch(selected.id, this.renderer.getTuning(), actionId);
    if (!Object.keys(partialTuning).length) {
      this.setStatus(`${selected.label} does not use that control.`);
      return;
    }

    this.renderer.setTuning(partialTuning);
    this.setStatus(`${selected.label}: ${getQuickActionLabel(actionId, selected.id)}.`);
  }
}

function loadSavedTuning(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getFieldDefinitions(selectedId) {
  const fields = [...COMMON_FIELDS];
  const racerId = getRacerIdFromTarget(selectedId);
  if (racerId) {
    fields.push(...buildRacerFields(racerId));
  }
  if (selectedId === "startLine") {
    fields.push(
      { key: "markerOffsetX", label: "Start Line X", min: -8, max: 8, step: 0.05 },
      { key: "markerYOffset", label: "Start Line Y", min: -4, max: 4, step: 0.02 },
      { key: "markerOffsetZ", label: "Start Line Z", min: -8, max: 8, step: 0.05 },
      { key: "markerRotationDeg", label: "Start Line Rot", min: -180, max: 180, step: 1 },
      { key: "markerScale", label: "Start Line Scale", min: 0.2, max: 4, step: 0.02 }
    );
  }
  return fields;
}

function buildRacerFields(racerId) {
  return [
    { key: getRacerKey(racerId, "OffsetX"), label: `${racerId} X`, min: -8, max: 8, step: 0.05 },
    { key: getRacerKey(racerId, "OffsetZ"), label: `${racerId} Z`, min: -8, max: 8, step: 0.05 },
    { key: getRacerKey(racerId, "Lift"), label: `${racerId} Lift`, min: -2, max: 4, step: 0.02 },
    { key: getRacerKey(racerId, "Scale"), label: `${racerId} Scale`, min: 0.2, max: 4, step: 0.02 },
    { key: getRacerKey(racerId, "RotationDeg"), label: `${racerId} Track Rot`, min: -180, max: 180, step: 1 },
    { key: getRacerKey(racerId, "MajorScale"), label: `${racerId} Track Major`, min: 0.4, max: 3.5, step: 0.02 },
    { key: getRacerKey(racerId, "MinorScale"), label: `${racerId} Track Minor`, min: 0.4, max: 3.5, step: 0.02 }
  ];
}

function getFieldLabel(key, definitions) {
  return definitions.find((field) => field.key === key)?.label ?? key;
}

function getQuickEditMeta(selectedId) {
  if (selectedId === "track") {
    return {
      title: "World Track selected",
      copy: "Think of this as the whole world. Use the buttons to move, lift, rotate, widen, or scale the stadium until it matches your 3D model."
    };
  }

  const racerId = getRacerIdFromTarget(selectedId);
  if (racerId) {
    return {
      title: `${racerId} Racer selected`,
      copy: "This edits only that racer's red path. Left or right moves the path, Turn rotates it, Wider changes side width, Deeper changes front-to-back depth, and Ball minus makes the racer smaller."
    };
  }

  if (selectedId === "finishBanner") {
    return {
      title: "Finish Banner selected",
      copy: "Use the buttons to nudge the banner position, height, rotation, and scale."
    };
  }

  if (selectedId === "startLine") {
    return {
      title: "Start Line selected",
      copy: "Use the buttons to move the race stripe under the lineup, raise or lower it slightly, rotate it, or scale it wider."
    };
  }

  return {
    title: "1. Select World Track or one racer",
    copy: "Beginner mode: World Track moves the whole scene. A racer edits only that red path. You can ignore the JSON until the layout looks right."
  };
}

function supportsQuickAction(selectedId, actionId) {
  if (!selectedId) {
    return false;
  }

  if (selectedId === "track" || getRacerIdFromTarget(selectedId)) {
    return true;
  }

  if (selectedId === "startLine") {
    return !["wider", "narrower", "deeper", "shallower"].includes(actionId);
  }

  return !["wider", "narrower", "deeper", "shallower"].includes(actionId);
}

function getQuickActionPatch(selectedId, tuning, actionId) {
  if (selectedId === "track") {
    return buildAxisPatch(actionId, {
      left: "trackOffsetX",
      right: "trackOffsetX",
      front: "trackOffsetZ",
      back: "trackOffsetZ",
      up: "trackOffsetY",
      down: "trackOffsetY",
      rotateLeft: "trackRotationDeg",
      rotateRight: "trackRotationDeg",
      wider: "laneMajorScale",
      narrower: "laneMajorScale",
      deeper: "laneMinorScale",
      shallower: "laneMinorScale",
      bigger: "trackModelScale",
      smaller: "trackModelScale"
    }, tuning);
  }

  const racerId = getRacerIdFromTarget(selectedId);
  if (racerId) {
    return buildAxisPatch(actionId, {
      left: getRacerKey(racerId, "OffsetX"),
      right: getRacerKey(racerId, "OffsetX"),
      front: getRacerKey(racerId, "OffsetZ"),
      back: getRacerKey(racerId, "OffsetZ"),
      up: getRacerKey(racerId, "Lift"),
      down: getRacerKey(racerId, "Lift"),
      rotateLeft: getRacerKey(racerId, "RotationDeg"),
      rotateRight: getRacerKey(racerId, "RotationDeg"),
      wider: getRacerKey(racerId, "MajorScale"),
      narrower: getRacerKey(racerId, "MajorScale"),
      deeper: getRacerKey(racerId, "MinorScale"),
      shallower: getRacerKey(racerId, "MinorScale"),
      bigger: getRacerKey(racerId, "Scale"),
      smaller: getRacerKey(racerId, "Scale")
    }, tuning);
  }

  if (selectedId === "finishBanner") {
    return buildAxisPatch(actionId, {
      left: "bannerOffsetX",
      right: "bannerOffsetX",
      front: "bannerOffsetZ",
      back: "bannerOffsetZ",
      up: "bannerYOffset",
      down: "bannerYOffset",
      rotateLeft: "bannerRotationDeg",
      rotateRight: "bannerRotationDeg",
      bigger: "bannerScale",
      smaller: "bannerScale"
    }, tuning);
  }

  if (selectedId === "startLine") {
    return buildAxisPatch(actionId, {
      left: "markerOffsetX",
      right: "markerOffsetX",
      front: "markerOffsetZ",
      back: "markerOffsetZ",
      up: "markerYOffset",
      down: "markerYOffset",
      rotateLeft: "markerRotationDeg",
      rotateRight: "markerRotationDeg",
      bigger: "markerScale",
      smaller: "markerScale"
    }, tuning);
  }

  return {};
}

function buildAxisPatch(actionId, keys, tuning) {
  const key = keys[actionId];
  if (!key) {
    return {};
  }

  const delta = getQuickActionDelta(actionId);
  if (delta === null) {
    return {};
  }

  const limits = getQuickLimits(actionId);
  return {
    [key]: clamp(tuning[key] + delta, limits.min, limits.max)
  };
}

function getQuickActionDelta(actionId) {
  switch (actionId) {
    case "left":
      return -QUICK_STEPS.move;
    case "right":
      return QUICK_STEPS.move;
    case "front":
      return -QUICK_STEPS.move;
    case "back":
      return QUICK_STEPS.move;
    case "up":
      return QUICK_STEPS.lift;
    case "down":
      return -QUICK_STEPS.lift;
    case "rotateLeft":
      return -QUICK_STEPS.rotate;
    case "rotateRight":
      return QUICK_STEPS.rotate;
    case "wider":
      return QUICK_STEPS.stretch;
    case "narrower":
      return -QUICK_STEPS.stretch;
    case "deeper":
      return QUICK_STEPS.stretch;
    case "shallower":
      return -QUICK_STEPS.stretch;
    case "bigger":
      return QUICK_STEPS.scale;
    case "smaller":
      return -QUICK_STEPS.scale;
    default:
      return null;
  }
}

function getQuickLimits(actionId) {
  switch (actionId) {
    case "wider":
    case "narrower":
    case "deeper":
    case "shallower":
      return { min: 0.4, max: 3.5 };
    case "bigger":
    case "smaller":
      return { min: 0.2, max: 4 };
    case "rotateLeft":
    case "rotateRight":
      return { min: -180, max: 180 };
    case "up":
    case "down":
      return { min: -20, max: 20 };
    default:
      return { min: -20, max: 20 };
  }
}

function getQuickActionLabel(actionId, selectedId) {
  return getQuickActionButtonLabel(actionId, selectedId);
}

function getQuickActionButtonLabel(actionId, selectedId) {
  const racerId = getRacerIdFromTarget(selectedId);
  if (actionId === "bigger" || actionId === "smaller") {
    if (racerId) {
      return actionId === "bigger" ? "Ball +" : "Ball -";
    }

    if (selectedId === "track") {
      return actionId === "bigger" ? "World +" : "World -";
    }
  }

  return QUICK_ACTIONS.find((action) => action.id === actionId)?.label ?? actionId;
}

function describeSelection(id, label, tuning) {
  if (id === "track") {
    return `${label}: x ${formatValue(tuning.trackOffsetX)}, y ${formatValue(tuning.trackOffsetY)}, z ${formatValue(tuning.trackOffsetZ)}, rot ${formatValue(tuning.trackRotationDeg, 1)}deg, model ${formatValue(tuning.trackModelScale)}, lane major ${formatValue(tuning.laneMajorScale)}, lane minor ${formatValue(tuning.laneMinorScale)}, lane gap ${formatValue(tuning.laneGapScale)}.`;
  }

  if (id === "finishBanner") {
    return `${label}: x ${formatValue(tuning.bannerOffsetX)}, y ${formatValue(tuning.bannerYOffset)}, z ${formatValue(tuning.bannerOffsetZ)}, rot ${formatValue(tuning.bannerRotationDeg, 1)}deg, scale ${formatValue(tuning.bannerScale)}.`;
  }

  if (id === "startLine") {
    return `${label}: x ${formatValue(tuning.markerOffsetX)}, y ${formatValue(tuning.markerYOffset)}, z ${formatValue(tuning.markerOffsetZ)}, rot ${formatValue(tuning.markerRotationDeg, 1)}deg, scale ${formatValue(tuning.markerScale)}.`;
  }

  const racerId = getRacerIdFromTarget(id);
  if (racerId) {
    return `${label}: x ${formatValue(tuning[getRacerKey(racerId, "OffsetX")])}, y ${formatValue(tuning[getRacerKey(racerId, "Lift")])}, z ${formatValue(tuning[getRacerKey(racerId, "OffsetZ")])}, rot ${formatValue(tuning[getRacerKey(racerId, "RotationDeg")], 1)}deg, major ${formatValue(tuning[getRacerKey(racerId, "MajorScale")])}, minor ${formatValue(tuning[getRacerKey(racerId, "MinorScale")])}, scale ${formatValue(tuning[getRacerKey(racerId, "Scale")])}.`;
  }

  return label;
}

function formatValue(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRacerIdFromTarget(targetId) {
  return targetId?.startsWith("racer:") ? targetId.slice(6) : null;
}

function getRacerKey(racerId, suffix) {
  return `${racerId.toLowerCase()}${suffix}`;
}
