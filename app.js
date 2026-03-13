// Antenna Creator Application

// Main application state
const antennaData = {
  azimuth: [], // XY plane
  elevationXZ: [], // XZ plane
  elevationYZ: [], // YZ plane
  minGain: -50,
  maxGain: 10,
};

// Plane visibility state
const planeVisibility = {
  azimuth: true,
  elevationXZ: true,
  elevationYZ: false, // Hidden by default
};

// AP Model state
const apModel = {
  type: "disc", // Current selected model type
  show: true,
};

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
};

// Currently active pane
let activePane = null;

// Currently open dropdown menu
let activeDropdown = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
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

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-button")) {
      closeAllDropdowns();
    }
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
      const plane = e.target.dataset.plane;
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
      const plane = e.target.dataset.plane;
      const direction = e.target.dataset.direction;
      rotatePattern(plane, direction);
    });
  });

  // Swap buttons
  document.querySelectorAll(".swap-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const plane = e.target.dataset.plane;
      const target = e.target.dataset.target;
      swapPatterns(plane, target);
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

  // Ground plane height slider
  document.getElementById("ground-height").addEventListener("input", (e) => {
    worldOrientation.groundPlaneZ = parseFloat(e.target.value);
    document.getElementById("ground-height-value").textContent = e.target.value;
    redraw3D();
  });

  // Min gain slider
  document.getElementById("min-gain").addEventListener("input", (e) => {
    const newMin = parseInt(e.target.value);
    // Ensure min doesn't exceed max
    if (newMin >= antennaData.maxGain) {
      e.target.value = antennaData.maxGain - 5;
      return;
    }
    antennaData.minGain = newMin;
    document.getElementById("min-gain-value").textContent = newMin + " dB";
    redrawAll();
  });

  // Max gain slider
  document.getElementById("max-gain").addEventListener("input", (e) => {
    const newMax = parseInt(e.target.value);
    // Ensure max doesn't go below min
    if (newMax <= antennaData.minGain) {
      e.target.value = antennaData.minGain + 5;
      return;
    }
    antennaData.maxGain = newMax;
    document.getElementById("max-gain-value").textContent = newMax + " dB";
    redrawAll();
  });

  // Plane visibility checkboxes
  document.getElementById("show-azimuth").addEventListener("change", (e) => {
    planeVisibility.azimuth = e.target.checked;
    redraw3D();
  });
  document
    .getElementById("show-elevation-xz")
    .addEventListener("change", (e) => {
      planeVisibility.elevationXZ = e.target.checked;
      redraw3D();
    });
  document
    .getElementById("show-elevation-yz")
    .addEventListener("change", (e) => {
      planeVisibility.elevationYZ = e.target.checked;
      redraw3D();
    });

  // 3D canvas mouse interaction
  const canvas3d = document.getElementById("canvas-3d");
  canvas3d.addEventListener("mousedown", start3DDrag);
  canvas3d.addEventListener("mousemove", drag3D);
  canvas3d.addEventListener("mouseup", end3DDrag);
  canvas3d.addEventListener("mouseleave", end3DDrag);

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
    antennaData[dataKey] = data;
    // Make sure plane is visible when loading new data
    planeVisibility[dataKey] = true;
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
  const data = antennaData[dataKey];
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
  antennaData[dataKey] = rotatedData;

  // Redraw
  redrawAll();
}

// Swap two patterns between planes
function swapPatterns(plane1, plane2) {
  const dataKey1 = planeToDataKey(plane1);
  const dataKey2 = planeToDataKey(plane2);

  // Swap the data arrays
  const tempData = antennaData[dataKey1];
  antennaData[dataKey1] = antennaData[dataKey2];
  antennaData[dataKey2] = tempData;

  // Enable visibility for the target plane (plane2)
  planeVisibility[dataKey2] = true;

  // Update checkbox to reflect visibility
  const checkboxId = `show-${plane2}`;
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = true;
  }

  // Redraw
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
  antennaData.azimuth = azimuthData;

  // Generate sample elevation pattern (typical dipole-like)
  const elevationXZData = [];
  for (let angle = 0; angle < 360; angle += 10) {
    // Dipole-like pattern: strong at horizon, null at top/bottom
    const rad = (angle * Math.PI) / 180;
    const gain = 5 * Math.abs(Math.cos(rad));
    elevationXZData.push({ angle, gain: gain - 2 });
  }
  antennaData.elevationXZ = elevationXZData;

  // Similar pattern for YZ
  const elevationYZData = [];
  for (let angle = 0; angle < 360; angle += 10) {
    const rad = (angle * Math.PI) / 180;
    const gain = 5 * Math.abs(Math.cos(rad));
    elevationYZData.push({ angle, gain: gain - 2 });
  }
  antennaData.elevationYZ = elevationYZData;
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
  // Azimuth (XY) rotates around Z axis - use Z color (blue)
  drawPolarChart("azimuth-chart", antennaData.azimuth, axisColors.z, "X", "Y");
  // Elevation XZ rotates around Y axis - use Y color (green)
  drawPolarChart(
    "elevation-xz-chart",
    antennaData.elevationXZ,
    axisColors.y,
    "X",
    "Z",
  );
  // Elevation YZ rotates around X axis - use X color (red)
  drawPolarChart(
    "elevation-yz-chart",
    antennaData.elevationYZ,
    axisColors.x,
    "Y",
    "Z",
  );
}

// 2D Polar Chart Drawing
function drawPolarChart(canvasId, data, color, axis1Label, axis2Label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width === 0 || height === 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2 - 30;

  // Clear canvas - light background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const minGain = antennaData.minGain;
  const maxGain = antennaData.maxGain;
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

  // Positive axis1 (right, 0°)
  ctx.strokeStyle = axis1Color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + maxRadius + 3, centerY);
  ctx.stroke();
  ctx.fillStyle = axis1Color;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`+${axis1Label}`, centerX + maxRadius + 6, centerY + 4);

  // Positive axis2 (up)
  ctx.strokeStyle = axis2Color;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - maxRadius - 3);
  ctx.stroke();
  ctx.fillStyle = axis2Color;
  ctx.textAlign = "center";
  ctx.fillText(`+${axis2Label}`, centerX, centerY - maxRadius - 8);

  // Draw antenna pattern
  if (data.length > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= data.length; i++) {
      const point = data[i % data.length];
      const normalizedGain = (point.gain - minGain) / gainRange;
      const radius = Math.max(0, normalizedGain) * maxRadius;
      const rad = ((point.angle - 90) * Math.PI) / 180;
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
  const rx = (antennaOrientation.rotationX * Math.PI) / 180;
  const ry = (antennaOrientation.rotationY * Math.PI) / 180;
  const rz = (antennaOrientation.rotationZ * Math.PI) / 180;

  // Apply rotations: Z first, then X, then Y (Euler angles)
  // Rotation around Z axis
  let x1 = localX * Math.cos(rz) - localY * Math.sin(rz);
  let y1 = localX * Math.sin(rz) + localY * Math.cos(rz);
  let z1 = localZ;

  // Rotation around X axis
  let x2 = x1;
  let y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
  let z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);

  // Rotation around Y axis
  let x3 = x2 * Math.cos(ry) + z2 * Math.sin(ry);
  let y3 = y2;
  let z3 = -x2 * Math.sin(ry) + z2 * Math.cos(ry);

  return { x: x3, y: y3, z: z3 };
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

  // Draw AP model (before antenna patterns so patterns appear on top)
  drawAPModel(ctx, projectAntennaToScreen);

  const minGain = antennaData.minGain;
  const maxGain = antennaData.maxGain;
  const gainRange = maxGain - minGain;

  // Helper to convert gain to radius (0 to 1)
  function gainToRadius(gain) {
    return Math.max(0, (gain - minGain) / gainRange);
  }

  // Draw Azimuth pattern (XY plane in physics coords, Z=0)
  // Rotates around Z axis - use Z color (blue)
  if (planeVisibility.azimuth && antennaData.azimuth.length > 0) {
    ctx.strokeStyle = axisColors.z;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= antennaData.azimuth.length; i++) {
      const point = antennaData.azimuth[i % antennaData.azimuth.length];
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
  if (planeVisibility.elevationXZ && antennaData.elevationXZ.length > 0) {
    ctx.strokeStyle = axisColors.y;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= antennaData.elevationXZ.length; i++) {
      const point = antennaData.elevationXZ[i % antennaData.elevationXZ.length];
      const r = gainToRadius(point.gain);
      const rad = (point.angle * Math.PI) / 180;

      // Physics X-Z plane: X toward viewer, Z up
      const physX = r * Math.cos(rad);
      const physZ = r * Math.sin(rad);
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
  if (planeVisibility.elevationYZ && antennaData.elevationYZ.length > 0) {
    ctx.strokeStyle = axisColors.x;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= antennaData.elevationYZ.length; i++) {
      const point = antennaData.elevationYZ[i % antennaData.elevationYZ.length];
      const r = gainToRadius(point.gain);
      const rad = (point.angle * Math.PI) / 180;

      // Physics Y-Z plane: Y to right, Z up
      const physY = r * Math.cos(rad);
      const physZ = r * Math.sin(rad);
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
function exportData() {
  let output = "# Antenna Pattern Export\n";
  output += "# Generated by Antenna Creator\n\n";

  output += "## Azimuth (XY Plane)\n";
  output += "Angle,Gain(dBi)\n";
  for (const point of antennaData.azimuth) {
    output += `${point.angle},${point.gain.toFixed(2)}\n`;
  }

  output += "\n## Elevation XZ Plane\n";
  output += "Angle,Gain(dBi)\n";
  for (const point of antennaData.elevationXZ) {
    output += `${point.angle},${point.gain.toFixed(2)}\n`;
  }

  output += "\n## Elevation YZ Plane\n";
  output += "Angle,Gain(dBi)\n";
  for (const point of antennaData.elevationYZ) {
    output += `${point.angle},${point.gain.toFixed(2)}\n`;
  }

  // Create download
  const blob = new Blob([output], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "antenna-pattern.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
