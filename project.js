// Antenna Studio projects (.antstudio)
//
// A project is a ZIP archive:
//   project.json  — all studio state plus per-plane tracer state (authoritative)
//   patterns.csv  — the regular CSV export, for convenience; ignored on open
//   images/…      — trace images, original bytes
//
// The ZIP code below is a minimal reader/writer on top of the browser's
// built-in CompressionStream / DecompressionStream ("deflate-raw"), so the
// project stays dependency-free. It handles what it writes plus ordinary
// zips from other tools (stored or deflated entries, no ZIP64/encryption).

const PROJECT_FORMAT = "antenna-studio-project";
const PROJECT_VERSION = 1;

// --- ZIP ---

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// files: [{ name, data: Uint8Array, compress: boolean }] -> Uint8Array.
// Images are already compressed, so callers store them as-is.
async function createZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();
  const FLAG_UTF8 = 0x0800;

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const method = file.compress ? 8 : 0;
    const body = file.compress
      ? await pipeBytes(file.data, new CompressionStream("deflate-raw"))
      : file.data;
    const crc = crc32(file.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, FLAG_UTF8, true);
    local.setUint16(8, method, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra length

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, FLAG_UTF8, true);
    central.setUint16(10, method, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, name.length, true);
    // extra, comment, disk, internal/external attributes all 0
    central.setUint32(42, offset, true);

    localParts.push(new Uint8Array(local.buffer), name, body);
    centralParts.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + body.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...localParts, ...centralParts, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// Uint8Array -> Map(name -> Uint8Array). Sizes and offsets come from the
// central directory, so entries written with data descriptors (e.g. by macOS
// Finder) read fine.
async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End of central directory: last 22 bytes plus an optional comment
  let endPos = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endPos = i;
      break;
    }
  }
  if (endPos < 0) throw new Error("Not a valid ZIP archive");

  const count = view.getUint16(endPos + 10, true);
  let pos = view.getUint32(endPos + 16, true);
  if (pos === 0xffffffff) throw new Error("ZIP64 archives are not supported");

  const decoder = new TextDecoder();
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error("Corrupt ZIP central directory");
    }
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(
      bytes.subarray(pos + 46, pos + 46 + nameLength),
    );
    pos += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue; // directory
    if (flags & 0x1) throw new Error(`${name} is encrypted`);

    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      data = await pipeBytes(raw, new DecompressionStream("deflate-raw"));
    } else {
      throw new Error(`${name} uses unsupported compression (${method})`);
    }
    if (crc32(data) !== crc) throw new Error(`${name} is corrupt (CRC)`);
    entries.set(name, data);
  }
  return entries;
}

// --- Project state ---

// view3D fields that belong in a project. Drag state and zoom limits don't.
const PROJECT_VIEW_KEYS = [
  "rotationX",
  "rotationY",
  "zoom",
  "showWorldAxes",
  "showAntennaAxes",
  "showPhiLabels",
  "showThetaLabels",
  "showZenithLabels",
  "showTraceImages",
  "downtilt",
  "azimuthDirection",
  "roll",
];

// Build project.json, plus the trace images to store alongside it. Each
// trace's image is written to its own path (radio, element and plane in the
// name keep it unique) and the trace refers to it by that path.
function serializeProject() {
  const view = {};
  for (const key of PROJECT_VIEW_KEYS) view[key] = view3D[key];
  view.showGroundPlane = document.getElementById("show-ground-plane").checked;

  const imageFiles = [];
  const serializedRadios = radios.map((radio, r) => ({
    name: radio.name,
    minGain: radio.minGain,
    maxGain: radio.maxGain,
    planeVisibility: { ...radio.planeVisibility },
    activeElementIndex: radio.activeElementIndex,
    elements: radio.elements.map((el, e) => {
      const traces = {};
      for (const [dataKey, trace] of Object.entries(el.traces)) {
        const { imageBlob, ...rest } = trace;
        const safeName = trace.imageFileName.replace(/[^a-z0-9._\-]/gi, "_");
        const path = `images/${r + 1}-${e + 1}-${dataKey}-${safeName}`;
        imageFiles.push({ path, blob: imageBlob });
        // imageSize lets the unsaved-changes check notice a replaced image
        traces[dataKey] = { ...rest, image: path, imageSize: imageBlob.size };
      }
      return {
        name: el.name,
        azimuth: el.azimuth,
        elevationXZ: el.elevationXZ,
        elevationYZ: el.elevationYZ,
        traces,
      };
    }),
  }));

  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    generator: "Antenna Studio",
    name: document.getElementById("antenna-name").value.trim(),
    apModel: { type: apModel.type, logoPosition: apModel.logoPosition },
    antennaOrientation: { ...antennaOrientation },
    worldOrientation: { ...worldOrientation },
    view,
    activeRadioIndex,
    radios: serializedRadios,
  };
  return { project, imageFiles };
}

async function saveProject() {
  try {
    const encoder = new TextEncoder();
    const { project, imageFiles } = serializeProject();
    const files = [
      {
        name: "project.json",
        data: encoder.encode(JSON.stringify(project, null, 2)),
        compress: true,
      },
      {
        name: "patterns.csv",
        data: encoder.encode(buildCSVExport()),
        compress: true,
      },
    ];
    for (const { path, blob } of imageFiles) {
      files.push({
        name: path,
        data: new Uint8Array(await blob.arrayBuffer()),
        compress: false,
      });
    }

    const zip = await createZip(files);
    downloadBlob(
      new Blob([zip], { type: "application/zip" }),
      `${getExportBaseName()}.antstudio`,
    );
    markProjectClean();
  } catch (err) {
    console.error("Failed to save project:", err);
    alert(`Could not save project: ${err.message}`);
  }
}

// Keep only well-formed {angle, gain} points
function cleanPattern(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((p) => p && Number.isFinite(p.angle) && Number.isFinite(p.gain))
    .map((p) => ({ angle: p.angle, gain: p.gain }))
    .sort((a, b) => a.angle - b.angle);
}

// Turn saved traces back into live ones: each trace's image path becomes the
// image Blob. A trace whose image is missing is dropped (the tracer only keeps
// traces that have an image); its applied pattern is unaffected.
function restoreTraces(savedTraces, entries) {
  const traces = {};
  for (const [dataKey, saved] of Object.entries(savedTraces || {})) {
    const data = saved && entries.get(saved.image);
    if (!data) {
      console.warn(`Trace image ${saved && saved.image} is missing`);
      continue;
    }
    const { image, imageSize, ...rest } = saved;
    const ext = image.split(".").pop().toLowerCase();
    traces[dataKey] = {
      ...rest,
      imageFileName: saved.imageFileName || image,
      imageBlob: new Blob([data], { type: IMAGE_TYPES[ext] || "" }),
    };
  }
  return traces;
}

const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// Replace all studio state with a project. Everything is read and validated
// before any state is touched, so a bad file leaves the current project as it
// was.
async function openProject(bytes) {
  const entries = await readZip(bytes);
  const json = entries.get("project.json");
  if (!json) throw new Error("project.json is missing");

  const project = JSON.parse(new TextDecoder().decode(json));
  if (project.format !== PROJECT_FORMAT) {
    throw new Error("Not an Antenna Studio project");
  }
  if (project.version > PROJECT_VERSION) {
    throw new Error(
      `Project version ${project.version} is newer than this Antenna Studio supports (${PROJECT_VERSION})`,
    );
  }
  if (!Array.isArray(project.radios) || project.radios.length === 0) {
    throw new Error("Project has no radios");
  }

  const newRadios = project.radios.map((saved, i) => {
    const radio = createRadio(saved.name || `Radio ${i + 1}`);
    if (Number.isFinite(saved.minGain)) radio.minGain = saved.minGain;
    if (Number.isFinite(saved.maxGain)) radio.maxGain = saved.maxGain;
    Object.assign(radio.planeVisibility, saved.planeVisibility);
    const savedElements = Array.isArray(saved.elements) ? saved.elements : [];
    if (savedElements.length > 0) {
      radio.elements = savedElements.map((savedEl, j) => {
        const el = createElement(savedEl.name || `Element ${j + 1}`);
        el.azimuth = cleanPattern(savedEl.azimuth);
        el.elevationXZ = cleanPattern(savedEl.elevationXZ);
        el.elevationYZ = cleanPattern(savedEl.elevationYZ);
        el.traces = restoreTraces(savedEl.traces, entries);
        return el;
      });
    }
    const active = saved.activeElementIndex;
    radio.activeElementIndex =
      Number.isInteger(active) && active >= 0 && active < radio.elements.length
        ? active
        : 0;
    return radio;
  });

  // --- Apply ---
  radios.length = 0;
  newRadios.forEach((r) => radios.push(r));
  const activeIndex = project.activeRadioIndex;
  activeRadioIndex =
    Number.isInteger(activeIndex) &&
    activeIndex >= 0 &&
    activeIndex < radios.length
      ? activeIndex
      : 0;

  Object.assign(apModel, project.apModel);
  Object.assign(antennaOrientation, project.antennaOrientation);
  Object.assign(worldOrientation, project.worldOrientation);
  const view = project.view || {};
  for (const key of PROJECT_VIEW_KEYS) {
    if (key in view) view3D[key] = view[key];
  }

  document.getElementById("antenna-name").value = project.name || "";
  document.getElementById("show-ground-plane").checked =
    view.showGroundPlane !== false;
  syncUIFromState();
}

// Push the shared (non-radio) state into the dropdown controls, then let the
// radio-level sync and redraw handle the rest.
function syncUIFromState() {
  const check = (selector) => {
    const input = document.querySelector(selector);
    if (input) input.checked = true;
  };
  check(`input[name="mount-type"][value="${antennaOrientation.mountType}"]`);
  check(`input[name="ap-model"][value="${apModel.type}"]`);
  check(`input[name="ap-logo-position"][value="${apModel.logoPosition}"]`);

  document.getElementById("show-world-axes").checked = view3D.showWorldAxes;
  document.getElementById("show-antenna-axes").checked = view3D.showAntennaAxes;
  document.getElementById("show-phi-labels").checked = view3D.showPhiLabels;
  document.getElementById("show-theta-labels").checked = view3D.showThetaLabels;
  document.getElementById("show-zenith-labels").checked =
    view3D.showZenithLabels;
  document.getElementById("show-trace-images").checked =
    view3D.showTraceImages;

  const setSlider = (id, value, label) => {
    document.getElementById(id).value = value;
    document.getElementById(`${id}-value`).textContent = label;
  };
  setSlider(
    "ground-height",
    worldOrientation.groundPlaneZ,
    String(worldOrientation.groundPlaneZ),
  );
  setSlider("view-downtilt", view3D.downtilt, `${view3D.downtilt}°`);
  setSlider(
    "view-azimuth-direction",
    view3D.azimuthDirection,
    `${view3D.azimuthDirection}°`,
  );
  // The roll slider is stored negated (see its input handler in app.js)
  setSlider("view-roll", -view3D.roll, `${-view3D.roll}°`);

  renderRadioTabs();
  renderElementTabs();
  syncUIToActiveRadio();
  redrawAll();
}

// Open a dropped or picked file: ZIP-signature files are projects, anything
// else goes through the CSV importer.
async function openFile(file) {
  if (isProjectDirty() && !confirm("Discard unsaved changes?")) return;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (!isZip) {
    importAntennaFile(new TextDecoder().decode(bytes));
    return;
  }

  try {
    await openProject(bytes);
    markProjectClean();
  } catch (err) {
    console.error("Failed to open project:", err);
    alert(`Could not open ${file.name}: ${err.message}`);
  }
}

// --- Unsaved changes ---
//
// Rather than flagging every edit, compare the serialized project against a
// snapshot taken at the last save/open. Camera angle and zoom are left out:
// looking around isn't an edit.

let cleanSnapshot = null;

function projectSnapshot() {
  const { project } = serializeProject();
  delete project.view.rotationX;
  delete project.view.rotationY;
  delete project.view.zoom;
  return JSON.stringify(project);
}

function markProjectClean() {
  cleanSnapshot = projectSnapshot();
}

function isProjectDirty() {
  return cleanSnapshot !== null && projectSnapshot() !== cleanSnapshot;
}

// Runs after app.js's DOMContentLoaded setup (registered first)
document.addEventListener("DOMContentLoaded", markProjectClean);

window.addEventListener("beforeunload", (e) => {
  if (isProjectDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
