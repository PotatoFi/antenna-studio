// Antenna Creator Application

// Create a new radio with default state
function createRadio(name) {
  return {
    name: name,
    antennaData: {
      azimuth: [],
      elevationXZ: [],
      elevationYZ: [],
      minGain: -50,
      maxGain: 10,
    },
    planeVisibility: {
      azimuth: true,
      elevationXZ: true,
      elevationYZ: false,
    },
  };
}

// Main application state — multiple radios
const radios = [
  createRadio("2.4 GHz"),
  createRadio("5 GHz"),
  createRadio("6 GHz"),
];
let activeRadioIndex = 0;

// Convenience accessors for the active radio
function getAntennaData() {
  return radios[activeRadioIndex].antennaData;
}
function getPlaneVisibility() {
  return radios[activeRadioIndex].planeVisibility;
}

// AP Model state
const apModel = {
  type: "disc", // Current selected model type
  show: true,
  logoPosition: "center", // none | center | top | bottom | lowerLeft | lowerRight | upperLeft | upperRight
};

// Formfactors that can display a face logo (flat/disc-like forms)
const logoCapableModels = new Set([
  "disc",
  "squircle",
  "hospitality",
  "can",
  "patch",
  "flat",
]);

// Logo color — medium grey, matches model outline
const logoColor = "oklch(60% 0 0)";

// Stroke-font glyphs for the "ACME" logo. Each glyph is an array of polylines
// (a polyline is a list of [x, y] points) on a normalized 0..1 grid where
// x is the reading direction (left to right) and y is letter height
// (0 = baseline, 1 = top). Straight segments only.
const logoGlyphs = {
  A: [
    [[0, 0], [0.5, 1], [1, 0]],
    [[0.2, 0.4], [0.8, 0.4]],
  ],
  C: [
    [[1, 1], [0, 1], [0, 0], [1, 0]],
  ],
  M: [
    [[0, 0], [0, 1], [0.5, 0.4], [1, 1], [1, 0]],
  ],
  E: [
    [[1, 1], [0, 1], [0, 0], [1, 0]],
    [[0, 0.5], [0.7, 0.5]],
  ],
};
const logoText = "ACME";

// AP Model colors using oklch
const apColors = {
  top: "oklch(97% 0 0)", // Brightest face
  side: "oklch(85% 0 0)", // Medium shade for sides
  bottom: "oklch(75% 0 0)", // Darkest face
  outline: "oklch(60% 0 0)", // Outline color
};

// Axis and pattern colors - consistent everywhere
// Each axis color matches the pattern that rotates around that axis
// Using hex format to support transparency (append "33" for 20% opacity)
const axisColors = {
  x: "#e04040", // Red - YZ pattern rotates around X
  y: "#40b040", // Green - XZ pattern rotates around Y
  z: "#4080e0", // Blue - XY/Azimuth pattern rotates around Z
};

// AP Model definitions - vertices and faces for each type
// All models are defined in antenna-local coordinates
// Z is "out" from mounting surface, X is beam direction
const apModelDefinitions = {
  none: {
    name: "None",
    vertices: [],
    faces: [],
  },
  disc: {
    name: "Disc",
    // Flat cylinder, typical ceiling AP like a smoke detector
    // Radius ~0.15, height ~0.04
    generate: function () {
      const radius = 0.15;
      const height = 0.04;
      const segments = 16;
      const vertices = [];
      const faces = [];

      // Generate circle vertices for top and bottom
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push({ x, y, z: 0 }); // Bottom circle
        vertices.push({ x, y, z: height }); // Top circle
      }

      // Top face (single polygon)
      const topFace = [];
      for (let i = 0; i < segments; i++) {
        topFace.push(i * 2 + 1);
      }
      faces.push({ indices: topFace, color: apColors.top, type: "top" });

      // Side faces (quads as two triangles each)
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push({
          indices: [i * 2, next * 2, next * 2 + 1, i * 2 + 1],
          color: apColors.side,
          type: "side",
        });
      }

      // Bottom face
      const bottomFace = [];
      for (let i = segments - 1; i >= 0; i--) {
        bottomFace.push(i * 2);
      }
      faces.push({
        indices: bottomFace,
        color: apColors.bottom,
        type: "bottom",
      });

      return { vertices, faces };
    },
  },
  squircle: {
    name: "Squircle",
    // Rounded square, typical modern ceiling AP
    generate: function () {
      const size = 0.14;
      const height = 0.035;
      const cornerRadius = 0.04;
      const vertices = [];
      const faces = [];

      // Generate squircle outline
      const points = [];
      const cornerSegments = 4;

      // Four corners with rounded edges
      const corners = [
        { cx: size - cornerRadius, cy: size - cornerRadius },
        { cx: -size + cornerRadius, cy: size - cornerRadius },
        { cx: -size + cornerRadius, cy: -size + cornerRadius },
        { cx: size - cornerRadius, cy: -size + cornerRadius },
      ];

      corners.forEach((corner, cornerIdx) => {
        for (let i = 0; i <= cornerSegments; i++) {
          const angle =
            (cornerIdx * Math.PI) / 2 + (i / cornerSegments) * (Math.PI / 2);
          const x = corner.cx + Math.cos(angle) * cornerRadius;
          const y = corner.cy + Math.sin(angle) * cornerRadius;
          points.push({ x, y });
        }
      });

      // Create vertices for top and bottom
      points.forEach((p) => {
        vertices.push({ x: p.x, y: p.y, z: 0 });
        vertices.push({ x: p.x, y: p.y, z: height });
      });

      const numPoints = points.length;

      // Top face
      const topFace = [];
      for (let i = 0; i < numPoints; i++) {
        topFace.push(i * 2 + 1);
      }
      faces.push({ indices: topFace, color: apColors.top, type: "top" });

      // Side faces
      for (let i = 0; i < numPoints; i++) {
        const next = (i + 1) % numPoints;
        faces.push({
          indices: [i * 2, next * 2, next * 2 + 1, i * 2 + 1],
          color: apColors.side,
          type: "side",
        });
      }

      // Bottom face
      const bottomFace = [];
      for (let i = numPoints - 1; i >= 0; i--) {
        bottomFace.push(i * 2);
      }
      faces.push({
        indices: bottomFace,
        color: apColors.bottom,
        type: "bottom",
      });

      return { vertices, faces };
    },
  },
  hospitality: {
    name: "Hospitality",
    // Wall-mounted rectangular box with ports on bottom
    generate: function () {
      const width = 0.12;
      const height = 0.18;
      const depth = 0.035;
      const vertices = [
        // Front face (Z+)
        { x: -width, y: -height, z: depth },
        { x: width, y: -height, z: depth },
        { x: width, y: height, z: depth },
        { x: -width, y: height, z: depth },
        // Back face (Z-)
        { x: -width, y: -height, z: 0 },
        { x: width, y: -height, z: 0 },
        { x: width, y: height, z: 0 },
        { x: -width, y: height, z: 0 },
      ];
      const faces = [
        { indices: [0, 1, 2, 3], color: apColors.top, type: "front" },
        { indices: [5, 4, 7, 6], color: apColors.bottom, type: "back" },
        { indices: [4, 0, 3, 7], color: apColors.side, type: "left" },
        { indices: [1, 5, 6, 2], color: apColors.side, type: "right" },
        { indices: [3, 2, 6, 7], color: apColors.side, type: "top" },
        { indices: [4, 5, 1, 0], color: apColors.bottom, type: "bottom" },
      ];
      return { vertices, faces };
    },
  },
  can: {
    name: "Can",
    // Outdoor AP, wide short cylinder
    generate: function () {
      const radius = 0.16;
      const height = 0.18;
      const segments = 12;
      const vertices = [];
      const faces = [];

      const halfHeight = height / 2;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push({ x, y, z: -halfHeight });
        vertices.push({ x, y, z: halfHeight });
      }

      // Top face
      const topFace = [];
      for (let i = 0; i < segments; i++) {
        topFace.push(i * 2 + 1);
      }
      faces.push({ indices: topFace, color: apColors.top, type: "top" });

      // Side faces
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push({
          indices: [i * 2, next * 2, next * 2 + 1, i * 2 + 1],
          color: apColors.side,
          type: "side",
        });
      }

      // Bottom face
      const bottomFace = [];
      for (let i = segments - 1; i >= 0; i--) {
        bottomFace.push(i * 2);
      }
      faces.push({
        indices: bottomFace,
        color: apColors.bottom,
        type: "bottom",
      });

      return { vertices, faces };
    },
  },
  patch: {
    name: "Patch Panel",
    // Flat rectangular panel, wall-mounted
    generate: function () {
      const width = 0.2;
      const height = 0.2;
      const depth = 0.025;
      const vertices = [
        { x: -width, y: -height, z: depth },
        { x: width, y: -height, z: depth },
        { x: width, y: height, z: depth },
        { x: -width, y: height, z: depth },
        { x: -width, y: -height, z: 0 },
        { x: width, y: -height, z: 0 },
        { x: width, y: height, z: 0 },
        { x: -width, y: height, z: 0 },
      ];
      const faces = [
        { indices: [0, 1, 2, 3], color: apColors.top, type: "front" },
        { indices: [5, 4, 7, 6], color: apColors.bottom, type: "back" },
        { indices: [4, 0, 3, 7], color: apColors.side, type: "left" },
        { indices: [1, 5, 6, 2], color: apColors.side, type: "right" },
        { indices: [3, 2, 6, 7], color: apColors.side, type: "top" },
        { indices: [4, 5, 1, 0], color: apColors.bottom, type: "bottom" },
      ];
      return { vertices, faces };
    },
  },
  dipole: {
    name: "Dipole",
    // Vertical dipole antenna - thin cylinder
    generate: function () {
      const radius = 0.015;
      const height = 0.4;
      const segments = 8;
      const vertices = [];
      const faces = [];

      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push({ x, y, z: -height / 2 });
        vertices.push({ x, y, z: height / 2 });
      }

      // Top cap
      const topFace = [];
      for (let i = 0; i < segments; i++) {
        topFace.push(i * 2 + 1);
      }
      faces.push({ indices: topFace, color: apColors.top, type: "top" });

      // Side faces
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push({
          indices: [i * 2, next * 2, next * 2 + 1, i * 2 + 1],
          color: apColors.side,
          type: "side",
        });
      }

      // Bottom cap
      const bottomFace = [];
      for (let i = segments - 1; i >= 0; i--) {
        bottomFace.push(i * 2);
      }
      faces.push({
        indices: bottomFace,
        color: apColors.bottom,
        type: "bottom",
      });

      return { vertices, faces };
    },
  },
  tube: {
    name: "Tube",
    // Tubular radome antenna - longer thin cylinder
    generate: function () {
      const radius = 0.03;
      const height = 0.5;
      const segments = 10;
      const vertices = [];
      const faces = [];

      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push({ x, y, z: 0 });
        vertices.push({ x, y, z: height });
      }

      // Top dome (simplified as flat)
      const topFace = [];
      for (let i = 0; i < segments; i++) {
        topFace.push(i * 2 + 1);
      }
      faces.push({ indices: topFace, color: apColors.top, type: "top" });

      // Side faces
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push({
          indices: [i * 2, next * 2, next * 2 + 1, i * 2 + 1],
          color: apColors.side,
          type: "side",
        });
      }

      // Bottom
      const bottomFace = [];
      for (let i = segments - 1; i >= 0; i--) {
        bottomFace.push(i * 2);
      }
      faces.push({
        indices: bottomFace,
        color: apColors.bottom,
        type: "bottom",
      });

      return { vertices, faces };
    },
  },
  flat: {
    name: "Flat",
    // Table-top router like WRT54G
    generate: function () {
      const width = 0.15;
      const depth = 0.12;
      const height = 0.035;
      const vertices = [
        { x: -width, y: -depth, z: 0 },
        { x: width, y: -depth, z: 0 },
        { x: width, y: depth, z: 0 },
        { x: -width, y: depth, z: 0 },
        { x: -width, y: -depth, z: height },
        { x: width, y: -depth, z: height },
        { x: width, y: depth, z: height },
        { x: -width, y: depth, z: height },
      ];
      const faces = [
        { indices: [4, 5, 6, 7], color: apColors.top, type: "top" },
        { indices: [0, 3, 2, 1], color: apColors.bottom, type: "bottom" },
        { indices: [0, 1, 5, 4], color: apColors.side, type: "front" },
        { indices: [2, 3, 7, 6], color: apColors.side, type: "back" },
        { indices: [3, 0, 4, 7], color: apColors.side, type: "left" },
        { indices: [1, 2, 6, 5], color: apColors.side, type: "right" },
      ];
      return { vertices, faces };
    },
  },
  standing: {
    name: "Standing",
    // Upright device like a PlayStation 5 or tower router
    generate: function () {
      const width = 0.06;
      const depth = 0.15;
      const height = 0.3;
      const vertices = [
        { x: -width, y: -depth, z: 0 },
        { x: width, y: -depth, z: 0 },
        { x: width, y: depth, z: 0 },
        { x: -width, y: depth, z: 0 },
        { x: -width, y: -depth, z: height },
        { x: width, y: -depth, z: height },
        { x: width, y: depth, z: height },
        { x: -width, y: depth, z: height },
      ];
      const faces = [
        { indices: [4, 5, 6, 7], color: apColors.top, type: "top" },
        { indices: [0, 3, 2, 1], color: apColors.bottom, type: "bottom" },
        { indices: [0, 1, 5, 4], color: apColors.side, type: "front" },
        { indices: [2, 3, 7, 6], color: apColors.side, type: "back" },
        { indices: [3, 0, 4, 7], color: apColors.side, type: "left" },
        { indices: [1, 2, 6, 5], color: apColors.side, type: "right" },
      ];
      return { vertices, faces };
    },
  },
  standingRotated: {
    name: "Standing (Rotated)",
    // Upright device rotated 90° around Z axis
    generate: function () {
      const width = 0.15;
      const depth = 0.06;
      const height = 0.3;
      const vertices = [
        { x: -width, y: -depth, z: 0 },
        { x: width, y: -depth, z: 0 },
        { x: width, y: depth, z: 0 },
        { x: -width, y: depth, z: 0 },
        { x: -width, y: -depth, z: height },
        { x: width, y: -depth, z: height },
        { x: width, y: depth, z: height },
        { x: -width, y: depth, z: height },
      ];
      const faces = [
        { indices: [4, 5, 6, 7], color: apColors.top, type: "top" },
        { indices: [0, 3, 2, 1], color: apColors.bottom, type: "bottom" },
        { indices: [0, 1, 5, 4], color: apColors.side, type: "front" },
        { indices: [2, 3, 7, 6], color: apColors.side, type: "back" },
        { indices: [3, 0, 4, 7], color: apColors.side, type: "left" },
        { indices: [1, 2, 6, 5], color: apColors.side, type: "right" },
      ];
      return { vertices, faces };
    },
  },
  box: {
    name: "Box",
    // Generic rectangular box AP
    generate: function () {
      const width = 0.1;
      const depth = 0.1;
      const height = 0.05;
      const vertices = [
        { x: -width, y: -depth, z: 0 },
        { x: width, y: -depth, z: 0 },
        { x: width, y: depth, z: 0 },
        { x: -width, y: depth, z: 0 },
        { x: -width, y: -depth, z: height },
        { x: width, y: -depth, z: height },
        { x: width, y: depth, z: height },
        { x: -width, y: depth, z: height },
      ];
      const faces = [
        { indices: [4, 5, 6, 7], color: apColors.top, type: "top" },
        { indices: [0, 3, 2, 1], color: apColors.bottom, type: "bottom" },
        { indices: [0, 1, 5, 4], color: apColors.side, type: "front" },
        { indices: [2, 3, 7, 6], color: apColors.side, type: "back" },
        { indices: [3, 0, 4, 7], color: apColors.side, type: "left" },
        { indices: [1, 2, 6, 5], color: apColors.side, type: "right" },
      ];
      return { vertices, faces };
    },
  },
};

// World orientation - FIXED, never changes
// Z is "up", ground plane is below the antenna
const worldOrientation = {
  groundPlaneZ: -1.5, // Ground plane Z position (below antenna at z=0)
};

// Antenna orientation - local coordinate system that can be rotated
// X is the beam direction, Z points "out" from mounting surface
const antennaOrientation = {
  rotationX: 180, // Ceiling mount default: Z points down toward floor
  rotationY: 0, // Yaw rotation around world Z axis
  rotationZ: 0, // Roll rotation
  mountType: "ceiling", // 'ceiling' | 'wall' | 'table'
};

// 3D view state
const view3D = {
  rotationX: -30,
  rotationY: 45,
  zoom: 1.0,
  minZoom: 0.25,
  maxZoom: 4.0,
  isDragging: false,
  isZooming: false,
  lastMouseX: 0,
  lastMouseY: 0,
  showWorldAxes: true,
  showAntennaAxes: true,
  showPhiLabels: false,
  showThetaLabels: false,
  showZenithLabels: false,
  downtilt: 0, // Display-only Y-axis rotation (degrees)
  azimuthDirection: 0, // Display-only world Z-axis rotation (degrees)
  roll: 0, // Display-only local Z-axis rotation (degrees)
};

// Currently active pane
let activePane = null;

// Currently open dropdown menu
let activeDropdown = null;

// Radio tab management
function switchToRadio(index) {
  if (index < 0 || index >= radios.length) return;
  activeRadioIndex = index;
  renderRadioTabs();
  syncUIToActiveRadio();
  redrawAll();
}

function syncUIToActiveRadio() {
  const ad = getAntennaData();
  const pv = getPlaneVisibility();

  // Sync gain sliders
  const minSlider = document.getElementById("min-gain");
  const maxSlider = document.getElementById("max-gain");
  if (minSlider) {
    minSlider.value = ad.minGain;
    document.getElementById("min-gain-value").textContent = ad.minGain + " dB";
  }
  if (maxSlider) {
    maxSlider.value = ad.maxGain;
    document.getElementById("max-gain-value").textContent = ad.maxGain + " dB";
  }

  // Sync plane visibility checkboxes
  const azCheck = document.getElementById("show-azimuth");
  const xzCheck = document.getElementById("show-elevation-xz");
  const yzCheck = document.getElementById("show-elevation-yz");
  if (azCheck) azCheck.checked = pv.azimuth;
  if (xzCheck) xzCheck.checked = pv.elevationXZ;
  if (yzCheck) yzCheck.checked = pv.elevationYZ;
}

function addRadio(name) {
  radios.push(createRadio(name || `Radio ${radios.length + 1}`));
  switchToRadio(radios.length - 1);
}

function removeRadio(index) {
  if (radios.length <= 1) return; // Must keep at least one
  radios.splice(index, 1);
  if (activeRadioIndex >= radios.length) {
    activeRadioIndex = radios.length - 1;
  }
  renderRadioTabs();
  syncUIToActiveRadio();
  redrawAll();
}

function renameRadio(index, newName) {
  if (index >= 0 && index < radios.length) {
    radios[index].name = newName;
    renderRadioTabs();
  }
}

function renderRadioTabs() {
  const container = document.getElementById("radio-tabs");
  if (!container) return;

  container.innerHTML = "";

  radios.forEach((radio, i) => {
    const tab = document.createElement("button");
    tab.className = "radio-tab" + (i === activeRadioIndex ? " active" : "");
    tab.textContent = radio.name;
    tab.addEventListener("click", () => switchToRadio(i));

    // Double-click to rename
    tab.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "radio-tab-input";
      input.value = radio.name;
      tab.textContent = "";
      tab.appendChild(input);
      input.focus();
      input.select();

      function finishRename() {
        const val = input.value.trim();
        if (val) renameRadio(i, val);
        else renderRadioTabs();
      }
      input.addEventListener("blur", finishRename);
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") input.blur();
        if (ke.key === "Escape") {
          input.value = radio.name;
          input.blur();
        }
      });
    });

    // Right-click to remove
    tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (radios.length > 1) {
        removeRadio(i);
      }
    });

    container.appendChild(tab);
  });

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "radio-tab radio-tab-add";
  addBtn.textContent = "+";
  addBtn.title = "Add a radio band";
  addBtn.addEventListener("click", () => {
    showAddRadioPrompt();
  });
  container.appendChild(addBtn);
}

function showAddRadioPrompt() {
  const name = prompt("Enter radio band name:", "Bluetooth");
  if (name && name.trim()) {
    addRadio(name.trim());
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
  renderRadioTabs();
  loadSampleData();
  resizeCanvas3D();
});

function initializeEventListeners() {
  // Toolbar buttons - Edit and View toggle panes
  document.getElementById("edit-btn").addEventListener("click", () => {
    closeAllDropdowns();
    togglePane("edit-pane", "edit-btn");
  });

  document.getElementById("view-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("view-menu", "view-btn");
  });

  // Dropdown menu buttons
  document.getElementById("mount-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("mount-menu", "mount-btn");
  });

  document.getElementById("model-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("model-menu", "model-btn");
  });

  document.getElementById("orientation-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("orientation-menu", "orientation-btn");
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-button")) {
      closeAllDropdowns();
    }
  });

  // Import button — opens file dialog
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });

  document
    .getElementById("import-file-input")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => importAntennaFile(ev.target.result);
      reader.readAsText(file);
      e.target.value = ""; // reset so same file can be re-imported
    });

  // Drag-and-drop import onto the whole window
  const dropOverlay = document.getElementById("drop-overlay");

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropOverlay.classList.add("visible");
  });

  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) {
      dropOverlay.classList.remove("visible");
    }
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dropOverlay.classList.remove("visible");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importAntennaFile(ev.target.result);
    reader.readAsText(file);
  });

  // Export button
  document.getElementById("export-btn").addEventListener("click", exportData);

  // Zoom buttons
  document.getElementById("zoom-in-btn").addEventListener("click", () => {
    setZoom(view3D.zoom * 1.25);
  });

  document.getElementById("zoom-out-btn").addEventListener("click", () => {
    setZoom(view3D.zoom / 1.25);
  });

  // Mount type radio buttons
  document.querySelectorAll('input[name="mount-type"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      setMountType(e.target.value);
    });
  });

  // AP model radio buttons
  document.querySelectorAll('input[name="ap-model"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      apModel.type = e.target.value;
      redraw3D();
    });
  });

  // AP logo position radio buttons
  document
    .querySelectorAll('input[name="ap-logo-position"]')
    .forEach((radio) => {
      radio.addEventListener("change", (e) => {
        apModel.logoPosition = e.target.value;
        redraw3D();
      });
    });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Don't trigger hotkeys when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    if (e.key === "Escape") {
      // Close dropdowns first, then panes
      if (activeDropdown) {
        closeAllDropdowns();
      } else if (activePane) {
        closeAllPanes();
      }
    }

    // Camera orientation hotkeys
    if (e.key === "1") {
      // View along X axis (looking at YZ plane)
      view3D.rotationX = 0;
      view3D.rotationY = 90;
      redraw3D();
    } else if (e.key === "2") {
      // View along Y axis (looking down at XZ plane)
      view3D.rotationX = -90;
      view3D.rotationY = 0;
      redraw3D();
    } else if (e.key === "3") {
      // View along Z axis (looking at XY plane)
      view3D.rotationX = 0;
      view3D.rotationY = 0;
      redraw3D();
    }
  });

  // Paste CSV buttons - read directly from clipboard
  document.querySelectorAll(".paste-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const plane = e.currentTarget.dataset.plane;
      try {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          pastePatternFromClipboard(plane, text);
        }
      } catch (err) {
        console.error("Failed to read clipboard:", err);
      }
    });
  });

  // Rotate buttons
  document.querySelectorAll(".rotate-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const plane = e.currentTarget.dataset.plane;
      const direction = e.currentTarget.dataset.direction;
      rotatePattern(plane, direction);
    });
  });

  // Flip buttons
  document.querySelectorAll(".flip-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const plane = e.currentTarget.dataset.plane;
      const axis = e.currentTarget.dataset.axis;
      flipPattern(plane, axis);
    });
  });

  // Swap buttons
  document.querySelectorAll(".swap-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const plane = e.currentTarget.dataset.plane;
      const target = e.currentTarget.dataset.target;
      swapPatterns(plane, target);
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const plane = e.currentTarget.dataset.plane;
      deletePattern(plane);
    });
  });

  // 3D controls
  document
    .getElementById("show-ground-plane")
    .addEventListener("change", redraw3D);

  // World/Antenna axes toggles
  document.getElementById("show-world-axes").addEventListener("change", (e) => {
    view3D.showWorldAxes = e.target.checked;
    redraw3D();
  });

  document
    .getElementById("show-antenna-axes")
    .addEventListener("change", (e) => {
      view3D.showAntennaAxes = e.target.checked;
      redraw3D();
    });

  document
    .getElementById("show-phi-labels")
    .addEventListener("change", (e) => {
      view3D.showPhiLabels = e.target.checked;
      redrawAll();
    });

  document
    .getElementById("show-theta-labels")
    .addEventListener("change", (e) => {
      view3D.showThetaLabels = e.target.checked;
      redrawAll();
    });

  document
    .getElementById("show-zenith-labels")
    .addEventListener("change", (e) => {
      view3D.showZenithLabels = e.target.checked;
      redrawAll();
    });

  // Ground plane height slider
  document.getElementById("ground-height").addEventListener("input", (e) => {
    worldOrientation.groundPlaneZ = parseFloat(e.target.value);
    document.getElementById("ground-height-value").textContent = e.target.value;
    redraw3D();
  });

  // Downtilt slider (display-only Y-axis rotation)
  document.getElementById("view-downtilt").addEventListener("input", (e) => {
    view3D.downtilt = parseFloat(e.target.value);
    document.getElementById("view-downtilt-value").textContent = e.target.value + "°";
    redraw3D();
  });

  // Azimuth / Direction slider (display-only world Z-axis rotation)
  document.getElementById("view-azimuth-direction").addEventListener("input", (e) => {
    view3D.azimuthDirection = parseFloat(e.target.value);
    document.getElementById("view-azimuth-direction-value").textContent = e.target.value + "°";
    redraw3D();
  });

  // Roll slider (display-only local Z-axis rotation)
  document.getElementById("view-roll").addEventListener("input", (e) => {
    view3D.roll = -parseFloat(e.target.value);
    document.getElementById("view-roll-value").textContent = e.target.value + "°";
    redraw3D();
  });

  // Min gain slider
  document.getElementById("min-gain").addEventListener("input", (e) => {
    const newMin = parseInt(e.target.value);
    // Ensure min doesn't exceed max
    if (newMin >= getAntennaData().maxGain) {
      e.target.value = getAntennaData().maxGain - 5;
      return;
    }
    getAntennaData().minGain = newMin;
    document.getElementById("min-gain-value").textContent = newMin + " dB";
    redrawAll();
  });

  // Max gain slider
  document.getElementById("max-gain").addEventListener("input", (e) => {
    const newMax = parseInt(e.target.value);
    // Ensure max doesn't go below min
    if (newMax <= getAntennaData().minGain) {
      e.target.value = getAntennaData().minGain + 5;
      return;
    }
    getAntennaData().maxGain = newMax;
    document.getElementById("max-gain-value").textContent = newMax + " dB";
    redrawAll();
  });

  // Plane visibility checkboxes
  document.getElementById("show-azimuth").addEventListener("change", (e) => {
    getPlaneVisibility().azimuth = e.target.checked;
    redraw3D();
  });
  document
    .getElementById("show-elevation-xz")
    .addEventListener("change", (e) => {
      getPlaneVisibility().elevationXZ = e.target.checked;
      redraw3D();
    });
  document
    .getElementById("show-elevation-yz")
    .addEventListener("change", (e) => {
      getPlaneVisibility().elevationYZ = e.target.checked;
      redraw3D();
    });

  // 3D canvas mouse interaction
  const canvas3d = document.getElementById("canvas-3d");
  canvas3d.addEventListener("mousedown", start3DDrag);
  canvas3d.addEventListener("mousemove", drag3D);
  canvas3d.addEventListener("mouseup", end3DDrag);
  canvas3d.addEventListener("mouseleave", end3DDrag);
  canvas3d.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // Normalize across deltaMode: pixel (0), line (1), page (2)
      const raw =
        e.deltaMode === 1
          ? e.deltaY * 20
          : e.deltaMode === 2
            ? e.deltaY * 300
            : e.deltaY;
      const sensitivity = e.ctrlKey ? 0.015 : 0.005;
      setZoom(view3D.zoom * (1 - raw * sensitivity));
    },
    { passive: false },
  );

  // Resize handler for 3D canvas
  window.addEventListener("resize", resizeCanvas3D);
}

// Pane toggle functions
function togglePane(paneId, btnId) {
  const rightPane = document.getElementById("right-pane");
  const paneContent = document.getElementById(paneId);
  const btn = document.getElementById(btnId);

  if (paneContent.classList.contains("visible")) {
    // Close this pane
    paneContent.classList.remove("visible");
    btn.classList.remove("active");
    rightPane.classList.remove("visible");
    activePane = null;
    resizeCanvas3D();
  } else {
    // Hide any other pane content (but keep container open if switching)
    document.querySelectorAll(".pane-content.visible").forEach((pane) => {
      pane.classList.remove("visible");
    });
    document.querySelectorAll(".tool-menu .button.active").forEach((b) => {
      b.classList.remove("active");
    });

    // Open this pane
    rightPane.classList.add("visible");
    paneContent.classList.add("visible");
    btn.classList.add("active");
    activePane = paneId;

    resizeCanvas3D();

    // If opening edit pane, redraw polar charts
    if (paneId === "edit-pane") {
      redrawPolarCharts();
    }
  }
}

function closeAllPanes() {
  const rightPane = document.getElementById("right-pane");
  document.querySelectorAll(".pane-content.visible").forEach((pane) => {
    pane.classList.remove("visible");
  });
  document.querySelectorAll(".tool-menu .button.active").forEach((btn) => {
    btn.classList.remove("active");
  });
  rightPane.classList.remove("visible");
  activePane = null;
  resizeCanvas3D();
}

// Dropdown toggle functions
function toggleDropdown(menuId, btnId) {
  const menu = document.getElementById(menuId);
  const btn = document.getElementById(btnId);

  if (menu.classList.contains("visible")) {
    closeAllDropdowns();
  } else {
    closeAllDropdowns();
    menu.classList.add("visible");
    btn.classList.add("active");
    activeDropdown = menuId;
  }
}

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu.visible").forEach((menu) => {
    menu.classList.remove("visible");
  });
  document
    .querySelectorAll(".dropdown-button .button.active")
    .forEach((btn) => {
      btn.classList.remove("active");
    });
  activeDropdown = null;
}

function planeToDataKey(plane) {
  switch (plane) {
    case "azimuth":
      return "azimuth";
    case "elevation-xz":
      return "elevationXZ";
    case "elevation-yz":
      return "elevationYZ";
    default:
      return plane;
  }
}

// Resize 3D canvas to fill its container
function resizeCanvas3D() {
  const canvas = document.getElementById("canvas-3d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  redraw3D();
}

// CSV Parsing
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  const data = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Support comma, semicolon, or tab separation
    const parts = trimmed.split(/[,;\t]+/);
    if (parts.length >= 2) {
      const angle = parseFloat(parts[0]);
      const gain = parseFloat(parts[1]);
      if (!isNaN(angle) && !isNaN(gain)) {
        data.push({ angle, gain });
      }
    }
  }

  // Sort by angle
  data.sort((a, b) => a.angle - b.angle);
  return data;
}

function pastePatternFromClipboard(plane, csvText) {
  const dataKey = planeToDataKey(plane);
  const data = parseCSV(csvText);

  if (data.length > 0) {
    getAntennaData()[dataKey] = data;
    // Make sure plane is visible when loading new data
    getPlaneVisibility()[dataKey] = true;
    // Update checkbox to reflect visibility
    const checkboxId = `show-${plane}`;
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
      checkbox.checked = true;
    }
    redrawAll();
  }
}

// Rotate a pattern by 90 degrees
function rotatePattern(plane, direction, degrees = 90) {
  const dataKey = planeToDataKey(plane);
  const ad = getAntennaData();
  const data = ad[dataKey];
  if (!data || data.length === 0) return;

  // Calculate rotation amount
  const rotationAmount = direction === "cw" ? degrees : -degrees;

  // Rotate all angles
  const rotatedData = data.map((point) => {
    let newAngle = point.angle + rotationAmount;
    // Normalize to 0-360 range
    while (newAngle < 0) newAngle += 360;
    while (newAngle >= 360) newAngle -= 360;
    return { angle: newAngle, gain: point.gain };
  });

  // Sort by angle
  rotatedData.sort((a, b) => a.angle - b.angle);

  // Update the data
  ad[dataKey] = rotatedData;

  // Redraw
  redrawAll();
}

// Flip a pattern around an axis (mirror it)
// axis: "first" = flip around the first axis of the plane (e.g. X for XY)
//       "second" = flip around the second axis of the plane (e.g. Y for XY)
// Flipping around the first axis: angle -> (360 - angle) % 360
// Flipping around the second axis: angle -> (180 - angle + 360) % 360
function flipPattern(plane, axis) {
  const dataKey = planeToDataKey(plane);
  const ad = getAntennaData();
  const data = ad[dataKey];
  if (!data || data.length === 0) return;

  const flippedData = data.map((point) => {
    let newAngle;
    if (axis === "first") {
      newAngle = (360 - point.angle) % 360;
    } else {
      newAngle = (((180 - point.angle) % 360) + 360) % 360;
    }
    return { angle: newAngle, gain: point.gain };
  });

  flippedData.sort((a, b) => a.angle - b.angle);
  ad[dataKey] = flippedData;
  redrawAll();
}

// Swap two patterns between planes
function swapPatterns(plane1, plane2) {
  const dataKey1 = planeToDataKey(plane1);
  const dataKey2 = planeToDataKey(plane2);

  // Swap the data arrays
  const ad = getAntennaData();
  const tempData = ad[dataKey1];
  ad[dataKey1] = ad[dataKey2];
  ad[dataKey2] = tempData;

  // Enable visibility for the target plane (plane2)
  getPlaneVisibility()[dataKey2] = true;

  // Update checkbox to reflect visibility
  const checkboxId = `show-${plane2}`;
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = true;
  }

  // Redraw
  redrawAll();
}

// Delete a pattern from a plane
function deletePattern(plane) {
  const dataKey = planeToDataKey(plane);
  getAntennaData()[dataKey] = [];
  getPlaneVisibility()[dataKey] = false;

  const checkboxId = `show-${plane}`;
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) checkbox.checked = false;

  redrawAll();
}

// Load sample data for demonstration
function loadSampleData() {
  // Generate sample omnidirectional-like pattern for azimuth
  const azimuthData = [];
  for (let angle = 0; angle < 360; angle += 10) {
    // Slight variation to make it interesting
    const gain = 5 + Math.sin(((angle * Math.PI) / 180) * 2) * 2;
    azimuthData.push({ angle, gain });
  }
  const ad = getAntennaData();
  ad.azimuth = azimuthData;

  // Generate sample elevation pattern (typical dipole-like)
  // theta=0 is zenith (+Z), theta=90 is horizon — peak at horizon for a dipole
  const elevationXZData = [];
  for (let angle = 0; angle < 360; angle += 10) {
    const rad = (angle * Math.PI) / 180;
    const gain = 5 * Math.abs(Math.sin(rad));
    elevationXZData.push({ angle, gain: gain - 2 });
  }
  ad.elevationXZ = elevationXZData;

  // Similar pattern for YZ
  const elevationYZData = [];
  for (let angle = 0; angle < 360; angle += 10) {
    const rad = (angle * Math.PI) / 180;
    const gain = 5 * Math.abs(Math.sin(rad));
    elevationYZData.push({ angle, gain: gain - 2 });
  }
  ad.elevationYZ = elevationYZData;
}

function redrawAll() {
  redrawPolarCharts();
  redraw3D();
}

// Resize polar chart canvases to match their display size
function resizePolarCharts() {
  const chartIds = [
    "azimuth-chart",
    "elevation-xz-chart",
    "elevation-yz-chart",
  ];
  const dpr = window.devicePixelRatio || 1;

  for (const id of chartIds) {
    const canvas = document.getElementById(id);
    if (!canvas) continue;

    const rect = canvas.getBoundingClientRect();
    const size = Math.floor(rect.width);

    if (size > 0) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
    }
  }
}

function redrawPolarCharts() {
  resizePolarCharts();
  const ad = getAntennaData();
  // Azimuth (XY) rotates around Z axis - use Z color (blue).
  // Axis labels match the chart's drawing convention: angle=0 plots at top
  // (which is +X in physical space), angle=90 plots at left (+Y). Viewed
  // from +Z (top-down view), so the chart stays right-handed.
  drawPolarChart("azimuth-chart", ad.azimuth, axisColors.z, "Y", "X", "azimuth");
  // Elevation XZ rotates around Y axis - use Y color (green)
  drawPolarChart("elevation-xz-chart", ad.elevationXZ, axisColors.y, "X", "Z", "elevationXZ");
  // Elevation YZ rotates around X axis - use X color (red)
  drawPolarChart("elevation-yz-chart", ad.elevationYZ, axisColors.x, "Y", "Z", "elevationYZ");
}

// 2D Polar Chart Drawing
function drawPolarChart(canvasId, data, color, axis1Label, axis2Label, planeKind) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width === 0 || height === 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const sphereLabelsOn =
    view3D.showPhiLabels || view3D.showThetaLabels || view3D.showZenithLabels;
  // Reserve more padding when spherical labels are visible so they don't clip.
  const chartPadding = planeKind && sphereLabelsOn ? 54 : 30;
  const maxRadius = Math.min(width, height) / 2 - chartPadding;

  // Clear canvas - light background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const minGain = getAntennaData().minGain;
  const maxGain = getAntennaData().maxGain;
  const gainRange = maxGain - minGain;

  // Draw gain circles
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  const gainSteps = 4;
  for (let i = 0; i <= gainSteps; i++) {
    const radius = (i / gainSteps) * maxRadius;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    if (i > 0) {
      const gainValue = minGain + (i / gainSteps) * gainRange;
      ctx.fillStyle = "#999";
      ctx.font = "9px sans-serif";
      ctx.fillText(
        `${gainValue.toFixed(0)}`,
        centerX + 3,
        centerY - radius - 2,
      );
    }
  }

  // Draw angle lines every 45 degrees
  for (let angle = 0; angle < 360; angle += 45) {
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = centerX + Math.cos(rad) * maxRadius;
    const y = centerY + Math.sin(rad) * maxRadius;

    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  // Draw axis arrows and labels
  const axis1Color = axisColors[axis1Label.toLowerCase()];
  const axis2Color = axisColors[axis2Label.toLowerCase()];

  // Positive axis1 (left)
  ctx.strokeStyle = axis1Color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX - maxRadius - 3, centerY);
  ctx.stroke();
  ctx.fillStyle = axis1Color;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`+${axis1Label}`, centerX - maxRadius - 6, centerY + 4);

  // Positive axis2 (up)
  ctx.strokeStyle = axis2Color;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - maxRadius - 3);
  ctx.stroke();
  ctx.fillStyle = axis2Color;
  ctx.textAlign = "center";
  ctx.fillText(`+${axis2Label}`, centerX, centerY - maxRadius - 8);

  // Draw spherical-coord labels at the four cardinal positions where data
  // angles 0/90/180/270 plot. Each plane shows only the labels relevant to it.
  if (planeKind && sphereLabelsOn) {
    const labelMaps = {
      azimuth: {
        top: { phi: "Phi 0", theta: "Theta 90" },
        left: { phi: "Phi 90", theta: "Theta 90" },
        bottom: { phi: "Phi 180", theta: "Theta 90" },
        right: { phi: "Phi 270", theta: "Theta 90" },
      },
      elevationXZ: {
        top: { theta: "Theta 0", zenith: "Zenith" },
        left: { phi: "Phi 0", theta: "Theta 90" },
        bottom: { theta: "Theta 180", zenith: "Nadir" },
        right: { phi: "Phi 180", theta: "Theta 90" },
      },
      elevationYZ: {
        top: { theta: "Theta 0", zenith: "Zenith" },
        left: { phi: "Phi 90", theta: "Theta 90" },
        bottom: { theta: "Theta 180", zenith: "Nadir" },
        right: { phi: "Phi 270", theta: "Theta 90" },
      },
    };
    const map = labelMaps[planeKind];
    if (map) {
      const lineHeight = 14;
      ctx.fillStyle = "#666";
      ctx.font = "bold 12px sans-serif";

      const positions = {
        top: { x: centerX, y: centerY - maxRadius - 22, dy: -lineHeight, align: "center" },
        right: { x: centerX + maxRadius + 6, y: centerY + 18, dy: lineHeight, align: "left" },
        bottom: { x: centerX, y: centerY + maxRadius + 22, dy: lineHeight, align: "center" },
        left: { x: centerX - maxRadius - 6, y: centerY + 18, dy: lineHeight, align: "right" },
      };

      for (const dir of ["top", "right", "bottom", "left"]) {
        const spec = map[dir];
        const lines = [];
        if (view3D.showPhiLabels && spec.phi) lines.push(spec.phi);
        if (view3D.showThetaLabels && spec.theta) lines.push(spec.theta);
        if (view3D.showZenithLabels && spec.zenith) lines.push(spec.zenith);
        if (lines.length === 0) continue;

        const p = positions[dir];
        ctx.textAlign = p.align;
        lines.forEach((line, i) => {
          ctx.fillText(line, p.x, p.y + i * p.dy);
        });
      }
    }
  }

  // Draw antenna pattern
  if (data.length > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= data.length; i++) {
      const point = data[i % data.length];
      const normalizedGain = (point.gain - minGain) / gainRange;
      const radius = Math.max(0, normalizedGain) * maxRadius;
      const rad = ((-point.angle - 90) * Math.PI) / 180;
      const x = centerX + Math.cos(rad) * radius;
      const y = centerY + Math.sin(rad) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.stroke();

    // Fill with transparency
    ctx.fillStyle = color + "33";
    ctx.fill();
  }
}

// 3D Coordinate Transformation Functions

// Transform a point from antenna-local coordinates to world coordinates
function antennaToWorld(localX, localY, localZ) {
  // Apply display-only roll in antenna-local frame (Z rotation) before downtilt
  const rl = (view3D.roll * Math.PI) / 180;
  let lx = localX * Math.cos(rl) - localY * Math.sin(rl);
  let ly = localX * Math.sin(rl) + localY * Math.cos(rl);
  let lz = localZ;

  // Apply display-only downtilt in antenna-local frame (X rotation) before mount rotation
  // Note: local X in code maps to visual Y on screen (axes are swapped in drawing)
  const dt = (view3D.downtilt * Math.PI) / 180;
  let dx = lx;
  let dy = ly * Math.cos(dt) - lz * Math.sin(dt);
  let dz = ly * Math.sin(dt) + lz * Math.cos(dt);
  lx = dx;
  ly = dy;
  lz = dz;

  const rx = (antennaOrientation.rotationX * Math.PI) / 180;
  const ry = (antennaOrientation.rotationY * Math.PI) / 180;
  const rz = (antennaOrientation.rotationZ * Math.PI) / 180;

  // Apply rotations: Z first, then X, then Y (Euler angles)
  // Rotation around Z axis
  let x1 = lx * Math.cos(rz) - ly * Math.sin(rz);
  let y1 = lx * Math.sin(rz) + ly * Math.cos(rz);
  let z1 = lz;

  // Rotation around X axis
  let x2 = x1;
  let y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
  let z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);

  // Rotation around Y axis
  let x3 = x2 * Math.cos(ry) + z2 * Math.sin(ry);
  let y3 = y2;
  let z3 = -x2 * Math.sin(ry) + z2 * Math.cos(ry);

  // Apply display-only roll around world Z axis (after mount rotation)
  const roll = (view3D.azimuthDirection * Math.PI) / 180;
  let x4 = x3 * Math.cos(roll) - y3 * Math.sin(roll);
  let y4 = x3 * Math.sin(roll) + y3 * Math.cos(roll);
  let z4 = z3;

  return { x: x4, y: y4, z: z4 };
}

// Set antenna mount type preset
// Per Timo: Z-axis points "out" from mounting surface, X-axis is beam direction
function setMountType(type) {
  switch (type) {
    case "ceiling":
      // Z points down (toward floor), X is beam direction in horizontal plane
      antennaOrientation.rotationX = 180;
      antennaOrientation.rotationY = 0;
      antennaOrientation.rotationZ = 0;
      break;
    case "wall":
      // Z points horizontally out from wall, X is beam direction
      antennaOrientation.rotationX = 90;
      antennaOrientation.rotationY = 0;
      antennaOrientation.rotationZ = 0;
      break;
    case "table":
      // Z points up (toward ceiling), X is beam direction in horizontal plane
      antennaOrientation.rotationX = 0;
      antennaOrientation.rotationY = 0;
      antennaOrientation.rotationZ = 0;
      break;
    default:
      antennaOrientation.rotationX = 0;
      antennaOrientation.rotationY = 0;
      antennaOrientation.rotationZ = 0;
  }
  antennaOrientation.mountType = type;
  redraw3D();
}

// Draw AP Model
function drawAPModel(ctx, projectAntennaToScreen) {
  if (apModel.type === "none") return;

  const modelDef = apModelDefinitions[apModel.type];
  if (!modelDef) return;

  // Get or generate model geometry
  let geometry;
  if (modelDef.generate) {
    geometry = modelDef.generate();
  } else {
    geometry = {
      vertices: modelDef.vertices || [],
      faces: modelDef.faces || [],
    };
  }

  if (geometry.vertices.length === 0) return;

  // Project all vertices to screen coordinates
  const projectedVertices = geometry.vertices.map((v) => {
    return projectAntennaToScreen(v.x, v.y, v.z);
  });

  // Calculate face depths for sorting (painter's algorithm)
  const facesWithDepth = geometry.faces.map((face, index) => {
    let avgDepth = 0;
    face.indices.forEach((i) => {
      avgDepth += projectedVertices[i].z;
    });
    avgDepth /= face.indices.length;
    return { face, index, avgDepth };
  });

  // Sort faces back-to-front (smaller depth = farther away = draw first)
  facesWithDepth.sort((a, b) => a.avgDepth - b.avgDepth);

  // Draw faces
  for (const { face } of facesWithDepth) {
    if (face.indices.length < 3) continue;

    ctx.beginPath();
    const firstVertex = projectedVertices[face.indices[0]];
    ctx.moveTo(firstVertex.x, firstVertex.y);

    for (let i = 1; i < face.indices.length; i++) {
      const vertex = projectedVertices[face.indices[i]];
      ctx.lineTo(vertex.x, vertex.y);
    }
    ctx.closePath();

    // Fill with face color
    ctx.fillStyle = face.color;
    ctx.fill();

    // Draw outline
    ctx.strokeStyle = apColors.outline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw the face logo on top of the model faces
  drawAPLogo(ctx, projectAntennaToScreen, geometry);
}

// Draw "ACME" logo on the top face of the AP model.
// The logo lies in the local XY plane at the model's top face, with the top
// of the letters pointing toward the visual X axis.
function drawAPLogo(ctx, projectAntennaToScreen, geometry) {
  if (apModel.logoPosition === "none") return;
  if (!logoCapableModels.has(apModel.type)) return;
  if (!geometry || geometry.vertices.length === 0) return;

  // Model extents: top-face height and XY footprint
  let topZ = -Infinity;
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const v of geometry.vertices) {
    if (v.z > topZ) topZ = v.z;
    maxAbsX = Math.max(maxAbsX, Math.abs(v.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(v.y));
  }
  const footprint = Math.min(maxAbsX, maxAbsY) || 0.15;
  const logoZ = topZ + 0.001; // lift slightly above the face to avoid z-fighting

  // Back-face cull: skip the logo if the top face points away from the camera.
  // Compare projected depth of a point above the face vs. one below it.
  const above = projectAntennaToScreen(0, 0, topZ + 0.05);
  const below = projectAntennaToScreen(0, 0, topZ - 0.05);
  if (above.z < below.z) return; // top face faces away from viewer

  // Glyph layout in local XY. Note: the drawing swaps local X/Y on screen
  // (see antennaToWorld), so to put the text top on the visual X axis we map
  // glyph height to local Y and the reading direction to local X.
  const glyphH = footprint * 0.25; // letter height (maps to local Y)
  const glyphW = glyphH * 0.7; // letter width (maps to local X)
  const gap = glyphW * 0.4; // spacing between letters
  const totalW = logoText.length * glyphW + (logoText.length - 1) * gap;

  // Center offset of the whole word in the reading direction
  const startV = -totalW / 2;

  // Position offset of the logo block within the face.
  // "Top/Bottom" shift along the text-height axis (the visual X axis);
  // "Left/Right" shift along the reading axis.
  const off = footprint * 0.45;
  let offHeight = 0; // toward top of letters
  let offRead = 0; // along reading direction
  switch (apModel.logoPosition) {
    case "top":
      offHeight = off;
      break;
    case "bottom":
      offHeight = -off;
      break;
    case "upperLeft":
      offHeight = off;
      offRead = off;
      break;
    case "upperRight":
      offHeight = off;
      offRead = -off;
      break;
    case "lowerLeft":
      offHeight = -off;
      offRead = off;
      break;
    case "lowerRight":
      offHeight = -off;
      offRead = -off;
      break;
    case "center":
    default:
      break;
  }

  ctx.strokeStyle = logoColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let c = 0; c < logoText.length; c++) {
    const glyph = logoGlyphs[logoText[c]];
    if (!glyph) continue;
    // Reading position of this glyph's left edge
    const vBase = startV + c * (glyphW + gap);

    for (const polyline of glyph) {
      ctx.beginPath();
      for (let p = 0; p < polyline.length; p++) {
        const [gx, gy] = polyline[p];
        // gy (height) → local Y so the text top points along the visual X axis;
        // gx (reading) → local X (drawing swaps local X/Y on screen).
        const localY = (gy - 0.5) * glyphH + offHeight;
        const localX = -(vBase + gx * glyphW) + offRead;
        const pt = projectAntennaToScreen(localX, localY, logoZ);
        if (p === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }
}

// 3D Rendering
function redraw3D() {
  const canvas = document.getElementById("canvas-3d");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas - light background
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const scale = (Math.min(width, height) / 5) * view3D.zoom;

  const showGroundPlane = document.getElementById("show-ground-plane").checked;

  // Convert camera rotation to radians
  const camRotX = (view3D.rotationX * Math.PI) / 180;
  const camRotY = (view3D.rotationY * Math.PI) / 180;

  // Project world coordinates to screen
  // Physics/ISO convention: Z up, X toward viewer (down-left), Y to the right (down-right)
  function projectWorldToScreen(worldX, worldY, worldZ) {
    // Rotate around world Z axis (horizontal pan)
    const x1 = worldX * Math.cos(camRotY) - worldY * Math.sin(camRotY);
    const y1 = worldX * Math.sin(camRotY) + worldY * Math.cos(camRotY);
    const z1 = worldZ;

    // Rotate around X axis (vertical tilt)
    const y2 = y1 * Math.cos(camRotX) - z1 * Math.sin(camRotX);
    const z2 = y1 * Math.sin(camRotX) + z1 * Math.cos(camRotX);

    // Orthographic projection - Z maps to screen Y (inverted)
    return {
      x: centerX + x1 * scale,
      y: centerY - z2 * scale,
      z: y2, // depth for potential sorting
    };
  }

  // Project antenna-local coordinates to screen
  function projectAntennaToScreen(localX, localY, localZ) {
    const world = antennaToWorld(localX, localY, localZ);
    return projectWorldToScreen(world.x, world.y, world.z);
  }

  function drawGroundAndAxes() {
    // Draw ground plane (in world coordinates, at groundPlaneZ)
    if (showGroundPlane) {
      const groundZ = worldOrientation.groundPlaneZ;
      const gridSize = 2.0;
      const gridSteps = 8;

      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 1;

      for (let i = -gridSteps; i <= gridSteps; i++) {
        const t = (i / gridSteps) * gridSize;

        // Lines parallel to X axis (along Y direction)
        const p1 = projectWorldToScreen(-gridSize, t, groundZ);
        const p2 = projectWorldToScreen(gridSize, t, groundZ);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Lines parallel to Y axis (along X direction)
        const p3 = projectWorldToScreen(t, -gridSize, groundZ);
        const p4 = projectWorldToScreen(t, gridSize, groundZ);
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }

      // Draw ground plane outline
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 2;
      const corners = [
        projectWorldToScreen(-gridSize, -gridSize, groundZ),
        projectWorldToScreen(gridSize, -gridSize, groundZ),
        projectWorldToScreen(gridSize, gridSize, groundZ),
        projectWorldToScreen(-gridSize, gridSize, groundZ),
      ];
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Draw world axes (solid lines, at back corner of ground plane)
    // Physics/ISO convention: X toward viewer (down-left), Y to the right (down-right), Z up
    if (view3D.showWorldAxes) {
      const groundZ = worldOrientation.groundPlaneZ;
      const gridSize = 2.0;
      const axisLength = 1.0;

      // Position axes at back corner (-gridSize, -gridSize, groundZ)
      const cornerX = -gridSize;
      const cornerY = -gridSize;
      const origin = projectWorldToScreen(cornerX, cornerY, groundZ);

      ctx.lineWidth = 3;

      // X axis (red) - toward viewer (down-left in isometric view)
      ctx.strokeStyle = axisColors.x;
      const xEnd = projectWorldToScreen(cornerX, cornerY + axisLength, groundZ);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(xEnd.x, xEnd.y);
      ctx.stroke();
      ctx.fillStyle = axisColors.x;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("X", xEnd.x + 8, xEnd.y + 4);

      // Y axis (green) - to the right (down-right in isometric view)
      ctx.strokeStyle = axisColors.y;
      const yEnd = projectWorldToScreen(cornerX + axisLength, cornerY, groundZ);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(yEnd.x, yEnd.y);
      ctx.stroke();
      ctx.fillStyle = axisColors.y;
      ctx.fillText("Y", yEnd.x + 8, yEnd.y + 4);

      // Z axis (blue) - up
      ctx.strokeStyle = axisColors.z;
      const zEnd = projectWorldToScreen(cornerX, cornerY, groundZ + axisLength);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(zEnd.x, zEnd.y);
      ctx.stroke();
      ctx.fillStyle = axisColors.z;
      ctx.fillText("Z", zEnd.x + 8, zEnd.y + 4);
    }
  }

  // Arrow direction — hoisted so drawAzimuthArrow() can close over them.
  const az = (view3D.azimuthDirection * Math.PI) / 180;
  const fwdX = Math.sin(az);
  const fwdY = -Math.cos(az);
  const sideX = Math.cos(az);
  const sideY = Math.sin(az);
  const arrowMidDist = 0.8 + 0.2 + 0.08; // axisLength + 0.2 offset + half arrowLen

  // Depth-sort ground plane, arrow, and AP model together (painter's algorithm).
  // drawAPModel sorts its own faces internally; use the world-origin depth (0) as its sort key.
  const drawables = [
    { depth: projectWorldToScreen(0, 0, worldOrientation.groundPlaneZ).z, draw: drawGroundAndAxes },
    { depth: projectWorldToScreen(fwdX * arrowMidDist, fwdY * arrowMidDist, 0).z, draw: drawAzimuthArrow },
    { depth: 0, draw: () => drawAPModel(ctx, projectAntennaToScreen) },
  ];
  drawables.sort((a, b) => a.depth - b.depth);
  for (const { draw } of drawables) draw();

  const ad = getAntennaData();
  const pv = getPlaneVisibility();
  const minGain = ad.minGain;
  const maxGain = ad.maxGain;
  const gainRange = maxGain - minGain;

  // Helper to convert gain to radius (0 to 1)
  function gainToRadius(gain) {
    return Math.max(0, (gain - minGain) / gainRange);
  }

  // Draw Azimuth pattern (XY plane in physics coords, Z=0)
  // Rotates around Z axis - use Z color (blue)
  if (pv.azimuth && ad.azimuth.length > 0) {
    ctx.strokeStyle = axisColors.z;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= ad.azimuth.length; i++) {
      const point = ad.azimuth[i % ad.azimuth.length];
      const r = gainToRadius(point.gain);
      const rad = (point.angle * Math.PI) / 180;

      // Physics X-Y plane: X toward viewer, Y to right
      // Internal: X (physics) = +Y (internal), Y (physics) = +X (internal)
      const physX = r * Math.cos(rad);
      const physY = r * Math.sin(rad);
      const localX = physY; // internal X = physics Y
      const localY = physX; // internal Y = physics X
      const localZ = 0;

      const p = projectAntennaToScreen(localX, localY, localZ);

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = axisColors.z + "33";
    ctx.fill();
  }

  // Draw Elevation XZ pattern (X-Z plane in physics coords, Y=0)
  // Rotates around Y axis - use Y color (green)
  if (pv.elevationXZ && ad.elevationXZ.length > 0) {
    ctx.strokeStyle = axisColors.y;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= ad.elevationXZ.length; i++) {
      const point = ad.elevationXZ[i % ad.elevationXZ.length];
      const r = gainToRadius(point.gain);
      const rad = (point.angle * Math.PI) / 180;

      // Physics X-Z plane: X toward viewer, Z up
      // theta=0 along +Z, theta=90 along +X (standard spherical convention)
      const physX = r * Math.sin(rad);
      const physZ = r * Math.cos(rad);
      const localX = 0; // physics Y = 0, so internal X = 0
      const localY = physX; // internal Y = physics X
      const localZ = physZ;

      const p = projectAntennaToScreen(localX, localY, localZ);

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = axisColors.y + "33";
    ctx.fill();
  }

  // Draw Elevation YZ pattern (Y-Z plane in physics coords, X=0)
  // Rotates around X axis - use X color (red)
  if (pv.elevationYZ && ad.elevationYZ.length > 0) {
    ctx.strokeStyle = axisColors.x;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= ad.elevationYZ.length; i++) {
      const point = ad.elevationYZ[i % ad.elevationYZ.length];
      const r = gainToRadius(point.gain);
      const rad = (point.angle * Math.PI) / 180;

      // Physics Y-Z plane: Y to right, Z up
      // theta=0 along +Z, theta=90 along +Y (standard spherical convention)
      const physY = r * Math.sin(rad);
      const physZ = r * Math.cos(rad);
      const localX = physY; // internal X = physics Y
      const localY = 0; // physics X = 0, so internal Y = 0
      const localZ = physZ;

      const p = projectAntennaToScreen(localX, localY, localZ);

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = axisColors.x + "33";
    ctx.fill();
  }

  // Draw antenna axes (dashed lines, showing antenna local orientation)
  // Physics/ISO convention: X is beam direction, Y is side, Z is "out" from mount
  if (view3D.showAntennaAxes) {
    const axisLength = 0.8;
    const origin = projectAntennaToScreen(0, 0, 0);

    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 2;

    // X axis (red) - beam direction (toward viewer in default orientation)
    ctx.strokeStyle = axisColors.x;
    const xEnd = projectAntennaToScreen(0, axisLength, 0);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();
    ctx.fillStyle = axisColors.x;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("X", xEnd.x + 8, xEnd.y + 4);

    // Y axis (green) - side (to the right in default orientation)
    ctx.strokeStyle = axisColors.y;
    const yEnd = projectAntennaToScreen(axisLength, 0, 0);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();
    ctx.fillStyle = axisColors.y;
    ctx.fillText("Y", yEnd.x + 8, yEnd.y + 4);

    // Z axis (blue) - "out" from mounting surface
    ctx.strokeStyle = axisColors.z;
    const zEnd = projectAntennaToScreen(0, 0, axisLength);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();
    ctx.fillStyle = axisColors.z;
    ctx.fillText("Z", zEnd.x + 8, zEnd.y + 4);

    ctx.setLineDash([]); // Reset to solid lines
  }

  // Draw spherical-coord labels in antenna-local coords.
  // Theta is the polar angle from +Z; phi is the azimuthal angle in the XY plane from +X.
  // In local coords, internal X = physics Y and internal Y = physics X (see pattern rendering),
  // so phi=0 (+physX) is at +localY and phi=90 (+physY) is at +localX.
  if (view3D.showPhiLabels || view3D.showThetaLabels || view3D.showZenithLabels) {
    const r = 1.3;
    const lineHeight = 14;
    ctx.fillStyle = "#666";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";

    const anchors = [
      { local: [0, 0, r], phi: null, theta: "Theta 0", zenith: "Zenith" },
      { local: [0, 0, -r], phi: null, theta: "Theta 180", zenith: "Nadir" },
      { local: [0, r, 0], phi: "Phi 0", theta: "Theta 90", zenith: null },
      { local: [r, 0, 0], phi: "Phi 90", theta: "Theta 90", zenith: null },
      { local: [0, -r, 0], phi: "Phi 180", theta: "Theta 90", zenith: null },
      { local: [-r, 0, 0], phi: "Phi 270", theta: "Theta 90", zenith: null },
    ];

    for (const a of anchors) {
      const lines = [];
      if (view3D.showPhiLabels && a.phi) lines.push(a.phi);
      if (view3D.showThetaLabels && a.theta) lines.push(a.theta);
      if (view3D.showZenithLabels && a.zenith) lines.push(a.zenith);
      if (lines.length === 0) continue;

      const pos = projectAntennaToScreen(a.local[0], a.local[1], a.local[2]);
      lines.forEach((line, i) => {
        ctx.fillText(line, pos.x + 6, pos.y + 4 + i * lineHeight);
      });
    }
  }

  // Draw azimuth north arrow (always flat on the horizontal plane, unaffected by downtilt/roll).
  // az/fwdX/fwdY/sideX/sideY are hoisted above for depth sorting.
  function drawAzimuthArrow() {
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const axisLength = 0.8;
    const arrowStart = axisLength + 0.2;
    const arrowLen = 0.16;
    const tipDist = arrowStart + arrowLen;
    const baseDist = arrowStart;
    const notchDist = arrowStart + arrowLen * 0.2;
    const hw = 0.09;

    const tip = projectWorldToScreen(fwdX * tipDist, fwdY * tipDist, 0);
    const baseL = projectWorldToScreen(
      fwdX * baseDist - sideX * hw, fwdY * baseDist - sideY * hw, 0);
    const baseR = projectWorldToScreen(
      fwdX * baseDist + sideX * hw, fwdY * baseDist + sideY * hw, 0);
    const notch = projectWorldToScreen(fwdX * notchDist, fwdY * notchDist, 0);

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(baseR.x, baseR.y);
    ctx.lineTo(notch.x, notch.y);
    ctx.lineTo(baseL.x, baseL.y);
    ctx.closePath();
    ctx.fillStyle = "#3a7fd5";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

}

// 3D Mouse interaction
function start3DDrag(e) {
  // Don't start dragging if clicking on UI elements
  if (e.target.closest(".tool-menu") || e.target.closest(".right-pane")) {
    return;
  }

  if (e.shiftKey) {
    view3D.isZooming = true;
  } else {
    view3D.isDragging = true;
  }
  view3D.lastMouseX = e.clientX;
  view3D.lastMouseY = e.clientY;
}

function drag3D(e) {
  if (!view3D.isDragging && !view3D.isZooming) return;

  const deltaX = e.clientX - view3D.lastMouseX;
  const deltaY = e.clientY - view3D.lastMouseY;

  if (view3D.isZooming) {
    // Shift+drag: zoom based on vertical movement
    const zoomFactor = 1 - deltaY * 0.005;
    setZoom(view3D.zoom * zoomFactor);
  } else {
    // Normal drag: rotate
    view3D.rotationY -= deltaX * 0.5;
    view3D.rotationX -= deltaY * 0.5;

    // Clamp X rotation
    view3D.rotationX = Math.max(-90, Math.min(90, view3D.rotationX));
    redraw3D();
  }

  view3D.lastMouseX = e.clientX;
  view3D.lastMouseY = e.clientY;
}

function end3DDrag() {
  view3D.isDragging = false;
  view3D.isZooming = false;
}

function setZoom(newZoom) {
  view3D.zoom = Math.max(view3D.minZoom, Math.min(view3D.maxZoom, newZoom));
  redraw3D();
}

// Export functionality
// Convert legacy elevation angles (0=horizon, 90=zenith) to theta convention
// (0=zenith, 90=horizon). theta = (90 - oldAngle + 360) % 360.
function convertLegacyElevationAngles(data) {
  return data.map((point) => ({
    angle: ((90 - point.angle) % 360 + 360) % 360,
    gain: point.gain,
  })).sort((a, b) => a.angle - b.angle);
}

function importAntennaFile(text) {
  const lines = text.split("\n");
  let section = null;
  let importedMountType = null;
  let importedFormfactor = null;
  let importedLogoPosition = null;
  let importedName = null;

  // Detect format version. Files without an explicit version are legacy (v1)
  // and need elevation-angle conversion. Look for "# Format Version,N" line.
  let formatVersion = 1;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(/^#\s*Format\s+Version\s*,\s*(\d+)/i);
    if (m) {
      formatVersion = parseInt(m[1], 10);
      break;
    }
  }
  const needsLegacyConversion = formatVersion < 2;

  // Detect multi-radio format by looking for "## Radio:" headers
  const isMultiRadio = lines.some((l) => l.trim().startsWith("## Radio:"));

  if (isMultiRadio) {
    // Multi-radio format
    const importedRadios = [];
    let currentRadio = null;
    let currentPlane = null;
    let currentLines = [];

    function flushPlane() {
      if (currentRadio && currentPlane && currentLines.length > 0) {
        let data = parseCSV(currentLines.join("\n"));
        if (
          needsLegacyConversion &&
          (currentPlane === "elevationXZ" || currentPlane === "elevationYZ")
        ) {
          data = convertLegacyElevationAngles(data);
        }
        if (data.length > 0) {
          currentRadio.antennaData[currentPlane] = data;
          currentRadio.planeVisibility[currentPlane] = true;
        }
      }
      currentPlane = null;
      currentLines = [];
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("## Antenna Properties")) {
        flushPlane();
        section = "properties";
        currentRadio = null;
      } else if (line.startsWith("## Radio:")) {
        flushPlane();
        section = "radio";
        const radioName = line.slice("## Radio:".length).trim();
        currentRadio = createRadio(radioName);
        importedRadios.push(currentRadio);
      } else if (
        line.startsWith("### Azimuth") ||
        line.startsWith("## Azimuth")
      ) {
        flushPlane();
        currentPlane = "azimuth";
      } else if (
        line.startsWith("### Elevation XZ") ||
        line.startsWith("## Elevation XZ")
      ) {
        flushPlane();
        currentPlane = "elevationXZ";
      } else if (
        line.startsWith("### Elevation YZ") ||
        line.startsWith("## Elevation YZ")
      ) {
        flushPlane();
        currentPlane = "elevationYZ";
      } else if (line.startsWith("#")) {
        // Skip other comment lines
      } else if (line.startsWith("Angle,")) {
        // Skip column header rows
      } else if (section === "properties") {
        if (line.startsWith("Name,")) {
          importedName = line.slice(5).trim();
        } else if (line.startsWith("Mounting Type,")) {
          importedMountType = line.split(",")[1]?.trim();
        } else if (line.startsWith("Formfactor,")) {
          importedFormfactor = line.split(",")[1]?.trim();
        } else if (line.startsWith("Logo Position,")) {
          importedLogoPosition = line.split(",")[1]?.trim();
        }
      } else if (currentRadio && line.startsWith("Min Gain,")) {
        const val = parseFloat(line.split(",")[1]);
        if (!isNaN(val)) currentRadio.antennaData.minGain = val;
      } else if (currentRadio && line.startsWith("Max Gain,")) {
        const val = parseFloat(line.split(",")[1]);
        if (!isNaN(val)) currentRadio.antennaData.maxGain = val;
      } else if (currentPlane) {
        currentLines.push(line);
      }
    }
    flushPlane();

    // Replace radios array
    if (importedRadios.length > 0) {
      radios.length = 0;
      importedRadios.forEach((r) => radios.push(r));
      activeRadioIndex = 0;
      renderRadioTabs();
    }
  } else {
    // Legacy single-radio format — import into active radio
    const sectionLines = { azimuth: [], elevationXZ: [], elevationYZ: [] };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("## Azimuth")) {
        section = "azimuth";
      } else if (line.startsWith("## Elevation XZ")) {
        section = "elevationXZ";
      } else if (line.startsWith("## Elevation YZ")) {
        section = "elevationYZ";
      } else if (line.startsWith("## Antenna Properties")) {
        section = "properties";
      } else if (line.startsWith("#")) {
        // Skip comment lines
      } else if (line.startsWith("Angle,")) {
        // Skip column header rows
      } else if (section === "properties") {
        if (line.startsWith("Name,")) {
          importedName = line.slice(5).trim();
        } else if (line.startsWith("Mounting Type,")) {
          importedMountType = line.split(",")[1]?.trim();
        } else if (line.startsWith("Formfactor,")) {
          importedFormfactor = line.split(",")[1]?.trim();
        } else if (line.startsWith("Logo Position,")) {
          importedLogoPosition = line.split(",")[1]?.trim();
        }
      } else if (section && section !== "properties") {
        sectionLines[section].push(line);
      }
    }

    // Parse and apply plane data to active radio
    for (const [key, csvLines] of Object.entries(sectionLines)) {
      if (csvLines.length > 0) {
        let data = parseCSV(csvLines.join("\n"));
        if (
          needsLegacyConversion &&
          (key === "elevationXZ" || key === "elevationYZ")
        ) {
          data = convertLegacyElevationAngles(data);
        }
        if (data.length > 0) {
          getAntennaData()[key] = data;
          getPlaneVisibility()[key] = true;
          const planeId =
            key === "azimuth"
              ? "azimuth"
              : key === "elevationXZ"
                ? "elevation-xz"
                : "elevation-yz";
          const checkbox = document.getElementById(`show-${planeId}`);
          if (checkbox) checkbox.checked = true;
        }
      }
    }
  }

  // Restore name
  if (importedName !== null) {
    document.getElementById("antenna-name").value = importedName;
  }

  // Apply mounting type
  if (importedMountType) {
    setMountType(importedMountType);
    const r = document.querySelector(
      `input[name="mount-type"][value="${importedMountType}"]`,
    );
    if (r) r.checked = true;
  }

  // Apply formfactor by reverse-looking up the name
  if (importedFormfactor) {
    const matchedKey = Object.entries(apModelDefinitions).find(
      ([, def]) => def.name === importedFormfactor,
    )?.[0];
    if (matchedKey) {
      apModel.type = matchedKey;
      const r = document.querySelector(
        `input[name="ap-model"][value="${matchedKey}"]`,
      );
      if (r) r.checked = true;
    }
  }

  // Apply logo position
  if (importedLogoPosition) {
    apModel.logoPosition = importedLogoPosition;
    const r = document.querySelector(
      `input[name="ap-logo-position"][value="${importedLogoPosition}"]`,
    );
    if (r) r.checked = true;
  }

  syncUIToActiveRadio();
  redrawAll();
}

const ANTENNA_FORMAT_VERSION = 2;

function exportData() {
  let output = "# Antenna Pattern Export\n";
  output += "# Generated by Antenna Studio\n";
  output += `# Format Version,${ANTENNA_FORMAT_VERSION}\n\n`;

  const antennaName = document.getElementById("antenna-name").value.trim();

  output += "## Antenna Properties\n";
  if (antennaName) output += `Name,${antennaName}\n`;
  output += `Mounting Type,${antennaOrientation.mountType}\n`;
  const modelName = apModelDefinitions[apModel.type]?.name ?? apModel.type;
  output += `Formfactor,${modelName}\n`;
  output += `Logo Position,${apModel.logoPosition}\n`;

  // Export each radio
  for (const radio of radios) {
    const ad = radio.antennaData;
    output += `\n## Radio: ${radio.name}\n`;
    output += `Min Gain,${ad.minGain}\n`;
    output += `Max Gain,${ad.maxGain}\n`;

    if (ad.azimuth.length > 0) {
      output += "\n### Azimuth (XY Plane)\n";
      output += "Angle,Gain(dBi)\n";
      for (const point of ad.azimuth) {
        output += `${point.angle},${point.gain.toFixed(2)}\n`;
      }
    }

    if (ad.elevationXZ.length > 0) {
      output += "\n### Elevation XZ Plane\n";
      output += "Angle,Gain(dBi)\n";
      for (const point of ad.elevationXZ) {
        output += `${point.angle},${point.gain.toFixed(2)}\n`;
      }
    }

    if (ad.elevationYZ.length > 0) {
      output += "\n### Elevation YZ Plane\n";
      output += "Angle,Gain(dBi)\n";
      for (const point of ad.elevationYZ) {
        output += `${point.angle},${point.gain.toFixed(2)}\n`;
      }
    }
  }

  // Create download
  const blob = new Blob([output], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = antennaName
    ? antennaName.replace(/[^a-z0-9_\-]/gi, "_")
    : "antenna-pattern";
  a.download = `${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
