// Antenna Tracer — trace a pattern from a datasheet image into a plane.
//
// Runs as a full-screen overlay on top of the studio. Everything lives inside
// this IIFE so the tracer's state (canvas, points, image, ...) can't collide
// with app.js globals. The only exports are openTracer() / closeTracer(); the
// result is handed back through app.js's setPattern().
//
// Tracer angles put 0° at the top of the image and increase clockwise. The
// studio's polar charts also put 0° at the top but increase counter-clockwise,
// so applying a trace mirrors the angles — the result looks the same in the
// Edit pane chart as it did on the image.

(() => {
  const overlay = document.getElementById("tracer-overlay");
  const canvasColumn = document.getElementById("tracer-canvas-column");
  const planeLabel = document.getElementById("tracer-plane-label");
  const canvas = document.getElementById("tracer-canvas");
  const ctx = canvas.getContext("2d");
  const imageUpload = document.getElementById("tracer-image-upload");
  const innerGainInput = document.getElementById("tracer-inner-gain");
  const outerGainInput = document.getElementById("tracer-outer-gain");
  const applyBtn = document.getElementById("tracer-apply");
  const copyCSVBtn = document.getElementById("tracer-copy-csv");
  const copyStatus = document.getElementById("tracer-copy-status");
  const resetControlPointsBtn = document.getElementById("tracer-reset-points");
  const xPositionSlider = document.getElementById("tracer-x-position");
  const yPositionSlider = document.getElementById("tracer-y-position");
  const scaleSlider = document.getElementById("tracer-scale");
  const widthSlider = document.getElementById("tracer-width");
  const innerCircleSizeSlider = document.getElementById("tracer-inner-circle");
  const outerCircleSizeSlider = document.getElementById("tracer-outer-circle");
  const xPositionValue = document.getElementById("tracer-x-position-value");
  const yPositionValue = document.getElementById("tracer-y-position-value");
  const scaleValue = document.getElementById("tracer-scale-value");
  const widthValue = document.getElementById("tracer-width-value");
  const innerCircleSizeValue = document.getElementById(
    "tracer-inner-circle-value",
  );
  const outerCircleSizeValue = document.getElementById(
    "tracer-outer-circle-value",
  );
  const angleIntervalSelect = document.getElementById("tracer-angle-interval");
  const interpolationSelect = document.getElementById("tracer-interpolation");

  // Plane the overlay was opened for ("azimuth" | "elevation-xz" |
  // "elevation-yz"), or null while closed.
  let targetPlane = null;

  const CANVAS_SIZE = 2000;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  let image = null;
  let imageFileName = null;
  let imageScale = 1;
  let imageWidth = 1;
  let center = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
  let canvasWidth = CANVAS_SIZE;
  let canvasHeight = CANVAS_SIZE;
  let chartScale = 1;
  let displayCenterX = CANVAS_SIZE / 2;
  let displayCenterY = CANVAS_SIZE / 2;
  let imageX = CANVAS_SIZE / 2;
  let imageY = CANVAS_SIZE / 2;
  let circles = [{ radius: 50 }, { radius: 300 }];
  let points = [];
  let angleInterval = 1;
  let interpolationMethod = "natural-cubic";
  let controlledPointIndices = new Set();
  let breakPointIndices = new Set();

  const MAX_RADIUS_MULTIPLIER = 1.5;

  let zoomLevel = 1,
    panX = 0,
    panY = 0,
    zoomSensitivity = 0.2,
    minZoom = 0.5,
    maxZoom = 60;
  const CLOSE_ZOOM_THRESHOLD = 5,
    CLOSE_ZOOM_SCALE = 0.25,
    VERY_CLOSE_ZOOM_THRESHOLD = 20,
    VERY_CLOSE_ZOOM_SCALE = 0.1,
    POINT_CLICK_THRESHOLD = 15;
  let panSensitivityMin = 0.5,
    panSensitivityMax = 1.5;
  xPositionSlider.max = CANVAS_SIZE;
  yPositionSlider.max = CANVAS_SIZE;
  xPositionSlider.value = imageX;
  yPositionSlider.value = imageY;
  xPositionValue.value = imageX;
  yPositionValue.value = imageY;
  let isZooming = false,
    zoomStart = null,
    initialZoom = 1,
    zoomCenterX,
    zoomCenterY;
  let isMouseDown = false,
    isSpacebarDown = false,
    isBKeyDown = false,
    lockX,
    lockY;
  let selectedControlPointIndex = -1,
    lastZoomTime = 0,
    hoveredPointIndex = -1;
  const CLICK_DELAY_AFTER_ZOOM = 200;

  function getMaxRadius() {
    return circles[1].radius * MAX_RADIUS_MULTIPLIER;
  }

  function resizeCanvas() {
    if (!targetPlane) return; // column has no size while the overlay is hidden
    canvasWidth = canvasColumn.clientWidth;
    canvasHeight = canvasColumn.clientHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    chartScale = Math.min(canvasWidth, canvasHeight) / CANVAS_SIZE;

    displayCenterX = canvasWidth / 2;
    displayCenterY = canvasHeight / 2;

    zoomLevel = 1;
    panX = 0;
    panY = 0;
    requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left,
        mouseY = e.clientY - rect.top;
      const canvasX = (mouseX / rect.width) * CANVAS_SIZE,
        canvasY = (mouseY / rect.height) * CANVAS_SIZE;
      const zoom = Math.exp((-e.deltaY * zoomSensitivity) / 100);
      const newZoomLevel = Math.max(
        minZoom,
        Math.min(zoomLevel * zoom, maxZoom),
      );
      const zoomFactor = newZoomLevel / zoomLevel;
      panX = canvasX - (canvasX - panX) * zoomFactor;
      panY = canvasY - (canvasY - panY) * zoomFactor;
      zoomLevel = newZoomLevel;
    } else {
      const zoomRange = maxZoom - minZoom;
      const zoomFactor = (zoomLevel - minZoom) / zoomRange;
      const panSpeed =
        panSensitivityMin +
        (panSensitivityMax - panSensitivityMin) * zoomFactor;
      panX -= e.deltaX * panSpeed;
      panY -= e.deltaY * panSpeed;
    }
    requestAnimationFrame(draw);
  });
  canvas.addEventListener(
    "mousewheel",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );

  function initializeControlledPoints() {
    controlledPointIndices.clear();
    breakPointIndices.clear();
    const totalPoints = Math.round(360 / angleInterval);
    const controlIntervalPoints = Math.max(2, Math.round(15 / angleInterval));
    for (let i = 0; i < totalPoints; i += controlIntervalPoints) {
      controlledPointIndices.add(i);
    }
  }

  function initializePoints() {
    points = [];
    const totalPoints = Math.round(360 / angleInterval);
    for (let i = 0; i < totalPoints; i++) {
      const angle = (i * angleInterval * Math.PI) / 180;
      points.push({
        x: center.x + Math.sin(angle) * circles[1].radius,
        y: center.y - Math.cos(angle) * circles[1].radius,
      });
    }
    initializeControlledPoints();
    interpolatePoints();
  }

  function isControlledPoint(index) {
    return controlledPointIndices.has(index);
  }

  function linearInterpolate(p0, p1, p2, p3, t) {
    return p1 + t * (p2 - p1);
  }

  function computeNaturalCubicSpline(controlPoints, closed) {
    const n = controlPoints.length;
    if (n < 2) return null;
    const angles = controlPoints.map((p) => p.angle);
    const distances = controlPoints.map((p) => p.distance);
    const isBreak = controlPoints.map((p) => p.isBreak || false);
    const h = [];
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      let diff = angles[next] - angles[i];
      if (diff <= 0) diff += 360;
      h.push(diff);
    }
    const M = new Array(n).fill(0);
    if (n > 2 && closed) {
      const maxIter = 200,
        tolerance = 0.00001;
      for (let iter = 0; iter < maxIter; iter++) {
        let maxChange = 0;
        for (let i = 0; i < n; i++) {
          if (isBreak[i]) {
            M[i] = 0;
            continue;
          }
          const prev = (i - 1 + n) % n,
            next = (i + 1) % n;
          const hPrev = h[prev],
            hCurr = h[i];
          const rhs =
            6 *
            ((distances[next] - distances[i]) / hCurr -
              (distances[i] - distances[prev]) / hPrev);
          const diag = 2 * (hPrev + hCurr);
          if (diag === 0) continue;
          const newM = (rhs - hPrev * M[prev] - hCurr * M[next]) / diag;
          maxChange = Math.max(maxChange, Math.abs(newM - M[i]));
          M[i] = newM;
        }
        if (maxChange < tolerance) break;
      }
    }
    return { angles, distances, h, M, closed, n };
  }

  function evaluateNaturalCubicSpline(spline, angle) {
    if (!spline) return null;
    const { angles, distances, h, M, n } = spline;
    if (n < 2) return null;

    let segIdx = n - 1;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      let start = angles[i],
        end = angles[next];
      if (end <= start) end += 360;
      let testAngle = angle;
      if (testAngle < start) testAngle += 360;
      if (testAngle >= start && testAngle < end) {
        segIdx = i;
        break;
      }
    }

    const i = segIdx,
      next = (i + 1) % n;
    let t = angle - angles[i];
    if (t < 0) t += 360;
    const hi = h[i];
    if (hi <= 0) return distances[i];
    const tRev = hi - t;

    const result =
      (M[i] * tRev * tRev * tRev + M[next] * t * t * t) / (6 * hi) +
      (distances[i] / hi - (M[i] * hi) / 6) * tRev +
      (distances[next] / hi - (M[next] * hi) / 6) * t;

    if (isNaN(result) || !isFinite(result)) return distances[i];
    return result;
  }

  function catmullRomInterpolate(p0, p1, p2, p3, t) {
    const t2 = t * t,
      t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  }

  function interpolatePoints() {
    const totalPoints = points.length;
    const maxRadius = getMaxRadius();
    const controlPoints = [];
    for (let i = 0; i < totalPoints; i++) {
      if (isControlledPoint(i)) {
        const distance = Math.hypot(
          points[i].x - center.x,
          points[i].y - center.y,
        );
        controlPoints.push({
          index: i,
          angle: i * angleInterval,
          distance,
          isBreak: breakPointIndices.has(i),
        });
      }
    }
    if (controlPoints.length < 2) return;
    controlPoints.sort((a, b) => a.angle - b.angle);
    const numControl = controlPoints.length;

    let naturalSpline = null;
    if (interpolationMethod === "natural-cubic") {
      naturalSpline = computeNaturalCubicSpline(controlPoints, true);
    }

    for (let i = 0; i < totalPoints; i++) {
      if (!isControlledPoint(i)) {
        const pointAngle = i * angleInterval;

        if (interpolationMethod === "natural-cubic" && naturalSpline) {
          const interpolatedDistance = evaluateNaturalCubicSpline(
            naturalSpline,
            pointAngle,
          );
          if (interpolatedDistance !== null) {
            const clampedDistance = Math.max(
              0,
              Math.min(interpolatedDistance, maxRadius),
            );
            const angle = (i * angleInterval * Math.PI) / 180;
            points[i] = {
              x: center.x + Math.sin(angle) * clampedDistance,
              y: center.y - Math.cos(angle) * clampedDistance,
            };
          }
          continue;
        }

        let p1Idx = numControl - 1;
        for (let j = 0; j < numControl; j++) {
          if (controlPoints[j].angle > pointAngle) {
            p1Idx = (j - 1 + numControl) % numControl;
            break;
          }
        }
        const p2Idx = (p1Idx + 1) % numControl;
        const p1 = controlPoints[p1Idx],
          p2 = controlPoints[p2Idx];
        const isWrapSegment = p2.angle < p1.angle;
        if (isWrapSegment && (p1.isBreak || p2.isBreak)) continue;

        let segmentSpan = p2.angle - p1.angle;
        if (segmentSpan <= 0) segmentSpan += 360;
        let posInSegment = pointAngle - p1.angle;
        if (posInSegment < 0) posInSegment += 360;
        const t = segmentSpan > 0 ? posInSegment / segmentSpan : 0;

        if (interpolationMethod === "straight") {
          const p1Point = points[p1.index];
          const p2Point = points[p2.index];
          const angleRad = (pointAngle * Math.PI) / 180;

          const dirX = Math.sin(angleRad);
          const dirY = -Math.cos(angleRad);

          const ax = p1Point.x - center.x;
          const ay = p1Point.y - center.y;

          const bx = p2Point.x - p1Point.x;
          const by = p2Point.y - p1Point.y;

          const denom = bx * dirY - by * dirX;
          let distance;

          if (Math.abs(denom) > 0.0001) {
            const tLine = (ay * dirX - ax * dirY) / denom;
            const intersectX = p1Point.x + tLine * bx;
            const intersectY = p1Point.y + tLine * by;

            const dot =
              (intersectX - center.x) * dirX + (intersectY - center.y) * dirY;
            distance =
              dot > 0
                ? Math.hypot(intersectX - center.x, intersectY - center.y)
                : 0;
          } else {
            distance = p1.distance + t * (p2.distance - p1.distance);
          }

          const clampedDist = Math.max(0, Math.min(distance, maxRadius));
          points[i] = {
            x: center.x + dirX * clampedDist,
            y: center.y + dirY * clampedDist,
          };
          continue;
        }

        const p0Idx = (p1Idx - 1 + numControl) % numControl,
          p3Idx = (p2Idx + 1) % numControl;
        const useP1ForP0 = p1.isBreak,
          useP2ForP3 = p2.isBreak;
        const p0 = useP1ForP0 ? p1 : controlPoints[p0Idx],
          p3 = useP2ForP3 ? p2 : controlPoints[p3Idx];

        let interpolatedDistance;
        switch (interpolationMethod) {
          case "linear":
            interpolatedDistance = linearInterpolate(
              p0.distance,
              p1.distance,
              p2.distance,
              p3.distance,
              t,
            );
            break;
          case "catmull-rom":
          default:
            interpolatedDistance = catmullRomInterpolate(
              p0.distance,
              p1.distance,
              p2.distance,
              p3.distance,
              t,
            );
            break;
        }
        const clampedDistance = Math.max(
          0,
          Math.min(interpolatedDistance, maxRadius),
        );
        const angle = (i * angleInterval * Math.PI) / 180;
        points[i] = {
          x: center.x + Math.sin(angle) * clampedDistance,
          y: center.y - Math.cos(angle) * clampedDistance,
        };
      }
    }
  }

  function drawImage() {
    if (image) {
      ctx.save();
      // Scale from the crosshair center
      ctx.translate(center.x, center.y);
      ctx.scale(imageWidth, 1);
      ctx.translate(imageX - center.x, imageY - center.y);
      ctx.scale(imageScale, imageScale);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      ctx.restore();
    }
  }

  function drawCircles() {
    circles.forEach((circle) => {
      ctx.beginPath();
      ctx.arc(center.x, center.y, circle.radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
      ctx.stroke();
    });
  }

  function drawPoints() {
    if (points.length === 0) return;
    let lineWidth, pointRadius;
    if (zoomLevel > VERY_CLOSE_ZOOM_THRESHOLD) {
      lineWidth = 2 * VERY_CLOSE_ZOOM_SCALE;
      pointRadius = 3 * VERY_CLOSE_ZOOM_SCALE;
    } else if (zoomLevel > CLOSE_ZOOM_THRESHOLD) {
      lineWidth = 2 * CLOSE_ZOOM_SCALE;
      pointRadius = 3 * CLOSE_ZOOM_SCALE;
    } else {
      lineWidth = 2;
      pointRadius = 3;
    }

    ctx.beginPath();
    ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "white";
    ctx.lineWidth = lineWidth * 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "#00BFFF";
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    const maxRadius = getMaxRadius();
    points.forEach((point, index) => {
      const isControlled = isControlledPoint(index),
        isBreakPoint = breakPointIndices.has(index),
        isHovered = index === hoveredPointIndex;
      const angle = (index * angleInterval * Math.PI) / 180;
      const outerX = center.x + Math.sin(angle) * maxRadius,
        outerY = center.y - Math.cos(angle) * maxRadius;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(outerX, outerY);
      if (isBreakPoint)
        ctx.strokeStyle = isHovered
          ? "rgba(255, 140, 0, 0.6)"
          : "rgba(255, 140, 0, 0.3)";
      else if (isControlled)
        ctx.strokeStyle = isHovered
          ? "rgba(0, 191, 255, 0.6)"
          : "rgba(0, 191, 255, 0.3)";
      else
        ctx.strokeStyle = isHovered
          ? "rgba(136, 136, 136, 0.5)"
          : "rgba(136, 136, 136, 0.2)";
      ctx.lineWidth = isHovered ? lineWidth * 0.3 : lineWidth * 0.125;
      ctx.stroke();

      const currentRadius = isControlled ? pointRadius : pointRadius * 0.5,
        hoverScale = isHovered ? 1.3 : 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, currentRadius * hoverScale, 0, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = lineWidth * 0.075;
      ctx.stroke();

      let baseColor = isBreakPoint
        ? "#FF8C00"
        : isControlled
          ? "#00BFFF"
          : "#888888";
      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        currentRadius * 0.67 * hoverScale,
        0,
        2 * Math.PI,
      );
      ctx.fillStyle = isHovered ? "white" : baseColor;
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = lineWidth * 0.3;
        ctx.stroke();
      }
    });
  }

  function drawAngleMarkers() {
    const angles = [0, 90, 180, 270],
      outerRadius = circles[1].radius,
      tickLength = 10,
      labelOffset = 25;
    angles.forEach((angle) => {
      const radian = ((angle - 90) * Math.PI) / 180,
        cos = Math.cos(radian),
        sin = Math.sin(radian);
      ctx.beginPath();
      ctx.moveTo(center.x + cos * outerRadius, center.y + sin * outerRadius);
      ctx.lineTo(
        center.x + cos * (outerRadius + tickLength),
        center.y + sin * (outerRadius + tickLength),
      );
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "black";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${angle}°`,
        center.x + cos * (outerRadius + labelOffset),
        center.y + sin * (outerRadius + labelOffset),
      );
    });
  }

  function drawCrosshair() {
    ctx.beginPath();
    ctx.moveTo(center.x - circles[1].radius, center.y);
    ctx.lineTo(center.x + circles[1].radius, center.y);
    ctx.moveTo(center.x, center.y - circles[1].radius);
    ctx.lineTo(center.x, center.y + circles[1].radius);
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw() {
    ctx.save();
    ctx.fillStyle = "#F9F9FA";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.translate(displayCenterX + panX, displayCenterY + panY);
    ctx.scale(chartScale * zoomLevel, chartScale * zoomLevel);
    ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);

    drawImage();
    drawCircles();
    drawCrosshair();
    drawAngleMarkers();
    drawPoints();
    ctx.restore();
  }

  imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0],
      reader = new FileReader();
    if (!file) return;
    imageFileName = file.name;
    reader.onload = (event) => {
      image = new Image();
      image.onload = () => draw();
      image.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Listen on the whole overlay and stop propagation, so the studio's
  // document-level handlers don't show their drop overlay or try to import the
  // image as an antenna pattern file.
  overlay.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  overlay.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      imageFileName = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        image = new Image();
        image.onload = () => draw();
        image.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } else if (file && file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (event) => loadProjectFromJSON(event.target.result);
      reader.readAsText(file);
    }
  });

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const internalX =
      (canvasX - displayCenterX - panX) / (chartScale * zoomLevel) +
      CANVAS_SIZE / 2;
    const internalY =
      (canvasY - displayCenterY - panY) / (chartScale * zoomLevel) +
      CANVAS_SIZE / 2;
    return { x: internalX, y: internalY };
  }

  function findClickedPointIndex(mousePos, onlyControlled, onlyUncontrolled) {
    const threshold = POINT_CLICK_THRESHOLD / zoomLevel;
    let closestIndex = -1,
      closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const controlled = isControlledPoint(i);
      if (onlyControlled && !controlled) continue;
      if (onlyUncontrolled && controlled) continue;
      const dist = Math.hypot(
        points[i].x - mousePos.x,
        points[i].y - mousePos.y,
      );
      if (dist < threshold && dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const clickedIndex = findClickedPointIndex(getMousePos(e), true, false);
    if (clickedIndex >= 0 && controlledPointIndices.size > 2) {
      controlledPointIndices.delete(clickedIndex);
      breakPointIndices.delete(clickedIndex);
      interpolatePoints();
      draw();
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) return;
    const mousePos = getMousePos(e);
    const clickedPointIndex =
      hoveredPointIndex >= 0
        ? hoveredPointIndex
        : findClickedPointIndex(mousePos, false, false);

    if (
      isBKeyDown &&
      clickedPointIndex >= 0 &&
      isControlledPoint(clickedPointIndex)
    ) {
      if (breakPointIndices.has(clickedPointIndex))
        breakPointIndices.delete(clickedPointIndex);
      else breakPointIndices.add(clickedPointIndex);
      interpolatePoints();
      draw();
      e.preventDefault();
      return;
    }

    if (e.shiftKey) {
      isZooming = true;
      zoomStart = { x: e.clientX, y: e.clientY };
      initialZoom = zoomLevel;
      const rect = canvas.getBoundingClientRect();
      zoomCenterX = e.clientX - rect.left - displayCenterX;
      zoomCenterY = e.clientY - rect.top - displayCenterY;
      e.preventDefault();
    } else if (!isSpacebarDown) {
      if (
        e.altKey &&
        clickedPointIndex >= 0 &&
        isControlledPoint(clickedPointIndex)
      ) {
        points[clickedPointIndex] = {
          x: center.x,
          y: center.y,
        };
        interpolatePoints();
        draw();
        e.preventDefault();
        return;
      }
      if (clickedPointIndex >= 0) {
        if (isControlledPoint(clickedPointIndex)) {
          isMouseDown = true;
          selectedControlPointIndex = clickedPointIndex;
          updatePointFromMouseEvent(e);
        } else {
          controlledPointIndices.add(clickedPointIndex);
          interpolatePoints();
          draw();
        }
        e.preventDefault();
        return;
      }
      isMouseDown = true;
      const { x, y } = mousePos,
        dx = x - center.x,
        dy = y - center.y;
      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += 2 * Math.PI;
      const angleDegrees = (angle * 180) / Math.PI;
      let nearestControlIndex = -1,
        nearestDist = Infinity;
      controlledPointIndices.forEach((idx) => {
        let diff = Math.abs(angleDegrees - idx * angleInterval);
        if (diff > 180) diff = 360 - diff;
        if (diff < nearestDist) {
          nearestDist = diff;
          nearestControlIndex = idx;
        }
      });
      selectedControlPointIndex = nearestControlIndex;
      updatePointFromMouseEvent(e);
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isZooming) {
      const dy = e.clientY - zoomStart.y,
        distance = Math.abs(dy),
        zoomFactor = 1 + distance / 100;
      const oldZoom = zoomLevel;
      zoomLevel = dy > 0 ? initialZoom * zoomFactor : initialZoom / zoomFactor;
      zoomLevel = Math.max(minZoom, Math.min(zoomLevel, maxZoom));
      const zoomRatio = zoomLevel / oldZoom;
      panX = zoomCenterX - (zoomCenterX - panX) * zoomRatio;
      panY = zoomCenterY - (zoomCenterY - panY) * zoomRatio;
      requestAnimationFrame(draw);
    } else if (isMouseDown) {
      updatePointFromMouseEvent(e);
    } else if (isSpacebarDown) {
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      if (lockX === undefined) {
        lockX = mouseX - panX;
        lockY = mouseY - panY;
      } else {
        panX = mouseX - lockX;
        panY = mouseY - lockY;
        requestAnimationFrame(draw);
      }
    } else {
      const mousePos = getMousePos(e);
      let newHoveredIndex = findClickedPointIndex(mousePos, false, false);
      if (newHoveredIndex < 0) {
        const dx = mousePos.x - center.x,
          dy = mousePos.y - center.y;
        const distFromCenter = Math.hypot(dx, dy);
        if (distFromCenter > 20 && distFromCenter < getMaxRadius() * 1.2) {
          let angle = Math.atan2(dx, -dy);
          if (angle < 0) angle += 2 * Math.PI;
          const angleDegrees = (angle * 180) / Math.PI;
          let nearestControlIndex = -1,
            nearestDist = Infinity;
          controlledPointIndices.forEach((idx) => {
            let diff = Math.abs(angleDegrees - idx * angleInterval);
            if (diff > 180) diff = 360 - diff;
            if (diff < nearestDist) {
              nearestDist = diff;
              nearestControlIndex = idx;
            }
          });
          newHoveredIndex = nearestControlIndex;
        }
      }
      if (newHoveredIndex !== hoveredPointIndex) {
        hoveredPointIndex = newHoveredIndex;
        requestAnimationFrame(draw);
      }
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (isZooming) {
      isZooming = false;
      lastZoomTime = Date.now();
    }
    isMouseDown = false;
    selectedControlPointIndex = -1;
  });
  canvas.addEventListener("mouseleave", () => {
    isMouseDown = false;
    isZooming = false;
    selectedControlPointIndex = -1;
    hoveredPointIndex = -1;
    requestAnimationFrame(draw);
  });

  function updatePointFromMouseEvent(e) {
    if (selectedControlPointIndex < 0) return;
    const { x, y } = getMousePos(e);
    const distance = Math.hypot(x - center.x, y - center.y);
    const constrainedRadius = Math.min(getMaxRadius(), distance);
    const constrainedAngle =
      (selectedControlPointIndex * angleInterval * Math.PI) / 180;
    points[selectedControlPointIndex] = {
      x: center.x + Math.sin(constrainedAngle) * constrainedRadius,
      y: center.y - Math.cos(constrainedAngle) * constrainedRadius,
    };
    interpolatePoints();
    draw();
  }

  // Key handlers are registered on window in the capture phase so that, while
  // the overlay is open, they run before (and hide keys from) the studio's
  // document-level hotkeys. While closed they do nothing.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!targetPlane) return;
      e.stopPropagation();

      if (e.key === "Escape") {
        closeTracer();
        return;
      }

      // Leave typing and native slider/select arrows alone
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      handleTracerKeydown(e);
    },
    true,
  );

  function handleTracerKeydown(e) {
    if (e.code === "Space") {
      e.preventDefault();
      if (!isSpacebarDown) {
        isSpacebarDown = true;
        canvas.style.cursor = "grabbing";
      }
    }

    if (e.key.toLowerCase() === "b") isBKeyDown = true;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "ArrowUp") {
        imageY--;
        yPositionSlider.value = imageY;
        yPositionValue.value = imageY;
      }
      if (e.key === "ArrowDown") {
        imageY++;
        yPositionSlider.value = imageY;
        yPositionValue.value = imageY;
      }
      if (e.key === "ArrowRight") {
        imageX++;
        xPositionSlider.value = imageX;
        xPositionValue.value = imageX;
      }
      if (e.key === "ArrowLeft") {
        imageX--;
        xPositionSlider.value = imageX;
        xPositionValue.value = imageX;
      }
    }

    if (e.key.toLowerCase() === "q") {
      circles[1].radius++;
      outerCircleSizeSlider.value = circles[1].radius;
      outerCircleSizeValue.value = circles[1].radius;
    }
    if (e.key.toLowerCase() === "a") {
      circles[1].radius--;
      outerCircleSizeSlider.value = circles[1].radius;
      outerCircleSizeValue.value = circles[1].radius;
    }
    if (e.key.toLowerCase() === "w") {
      circles[0].radius++;
      innerCircleSizeSlider.value = circles[0].radius;
      innerCircleSizeValue.value = circles[0].radius;
    }
    if (e.key.toLowerCase() === "s") {
      circles[0].radius--;
      innerCircleSizeSlider.value = circles[0].radius;
      innerCircleSizeValue.value = circles[0].radius;
    }
    if (e.key.toLowerCase() === "e") {
      let newWidth = Math.min(120, parseInt(widthSlider.value) + 1);
      widthSlider.value = newWidth;
      widthValue.value = newWidth;
      imageWidth = newWidth / 100;
    }
    if (e.key.toLowerCase() === "d") {
      let newWidth = Math.max(80, parseInt(widthSlider.value) - 1);
      widthSlider.value = newWidth;
      widthValue.value = newWidth;
      imageWidth = newWidth / 100;
    }
    if (e.key.toLowerCase() === "c") copyCSVBtn.click();
    draw();
  }

  window.addEventListener(
    "keyup",
    (e) => {
      if (!targetPlane) return;
      e.stopPropagation();
      if (e.code === "Space") {
        isSpacebarDown = false;
        canvas.style.cursor = "default";
        lockX = undefined;
        lockY = undefined;
      }
      if (e.key.toLowerCase() === "b") isBKeyDown = false;
    },
    true,
  );

  // Convert the traced points to gain values, in tracer angles (0° at the top
  // of the image, increasing clockwise). Gain is linear in radius between the
  // inner and outer reference circles, extrapolated outside them, and blended
  // toward the projected center gain inside the inner circle.
  function computeTrace() {
    const innerGain = parseFloat(innerGainInput.value),
      outerGain = parseFloat(outerGainInput.value);
    const innerRadius = circles[0].radius,
      outerRadius = circles[1].radius;
    const slope = (outerGain - innerGain) / (outerRadius - innerRadius);
    const centerGain = innerGain - slope * innerRadius;
    return points.map((point, index) => {
      const angle = index * angleInterval;
      const radius = Math.hypot(point.x - center.x, point.y - center.y);
      let gain;
      if (radius <= innerRadius) {
        gain = centerGain + (radius / innerRadius) * (innerGain - centerGain);
      } else {
        gain = innerGain + (radius - innerRadius) * slope;
      }
      return { angle, gain };
    });
  }

  // Write the trace into the target plane of the active radio/element.
  // Angles are mirrored into the studio's counter-clockwise convention; gains
  // are rounded to the same 2 decimals the clipboard export used.
  applyBtn.addEventListener("click", () => {
    const data = computeTrace().map(({ angle, gain }) => ({
      angle: (360 - angle) % 360,
      gain: parseFloat(gain.toFixed(2)),
    }));
    data.sort((a, b) => a.angle - b.angle);
    setPattern(targetPlane, data);
    closeTracer();
  });

  // Clipboard export is kept for use outside the studio, so it keeps the
  // tracer's raw clockwise angles.
  copyCSVBtn.addEventListener("click", () => {
    let csv = "Angle (degrees)\tGain (dBi)\n";
    computeTrace().forEach(({ angle, gain }) => {
      csv += `${angle}\t${gain.toFixed(2)}\n`;
    });
    navigator.clipboard.writeText(csv).then(
      () => {
        copyStatus.style.display = "inline";
        setTimeout(() => (copyStatus.style.display = "none"), 2000);
      },
      (err) => {
        console.error("Could not copy text: ", err);
        alert("Failed to copy to clipboard.");
      },
    );
  });

  xPositionSlider.addEventListener("input", updateImagePosition);
  yPositionSlider.addEventListener("input", updateImagePosition);
  scaleSlider.addEventListener("input", updateImageScale);
  widthSlider.addEventListener("input", updateImageWidth);
  innerCircleSizeSlider.addEventListener("input", updateInnerCircleSize);
  outerCircleSizeSlider.addEventListener("input", updateOuterCircleSize);
  xPositionValue.addEventListener("input", updateImagePosition);
  yPositionValue.addEventListener("input", updateImagePosition);
  scaleValue.addEventListener("input", updateImageScale);
  widthValue.addEventListener("input", updateImageWidth);
  innerCircleSizeValue.addEventListener("input", updateInnerCircleSize);
  outerCircleSizeValue.addEventListener("input", updateOuterCircleSize);
  angleIntervalSelect.addEventListener("change", (e) => {
    angleInterval = parseFloat(e.target.value);
    initializePoints();
    draw();
  });
  interpolationSelect.addEventListener("change", (e) => {
    interpolationMethod = e.target.value;
    interpolatePoints();
    requestAnimationFrame(draw);
  });
  resetControlPointsBtn.addEventListener("click", () => {
    initializePoints();
    draw();
  });

  function updateImagePosition() {
    imageX = parseInt(xPositionSlider.value);
    imageY = parseInt(yPositionSlider.value);
    xPositionValue.value = imageX;
    yPositionValue.value = imageY;
    draw();
  }
  function updateImageScale() {
    imageScale = parseInt(scaleSlider.value) / 100;
    scaleValue.value = scaleSlider.value;
    draw();
  }
  function updateImageWidth() {
    imageWidth = parseInt(widthSlider.value) / 100;
    widthValue.value = widthSlider.value;
    draw();
  }
  function updateInnerCircleSize() {
    circles[0].radius = parseInt(innerCircleSizeSlider.value);
    innerCircleSizeValue.value = circles[0].radius;
    draw();
  }
  function updateOuterCircleSize() {
    circles[1].radius = parseInt(outerCircleSizeSlider.value);
    outerCircleSizeValue.value = circles[1].radius;
    draw();
  }

  document
    .getElementById("tracer-load-project-btn")
    .addEventListener("click", () => {
      document.getElementById("tracer-load-project").click();
    });

  function loadProjectFromJSON(json) {
    const state = JSON.parse(json);

    angleInterval = state.angleInterval;
    angleIntervalSelect.value = String(state.angleInterval);

    interpolationMethod = state.interpolationMethod;
    interpolationSelect.value = state.interpolationMethod;

    circles[0].radius = state.innerCircleRadius;
    innerCircleSizeSlider.value = state.innerCircleRadius;
    innerCircleSizeValue.value = state.innerCircleRadius;

    circles[1].radius = state.outerCircleRadius;
    outerCircleSizeSlider.value = state.outerCircleRadius;
    outerCircleSizeValue.value = state.outerCircleRadius;

    innerGainInput.value = state.innerGain;
    outerGainInput.value = state.outerGain;

    imageX = state.imageX;
    imageY = state.imageY;
    xPositionSlider.value = state.imageX;
    yPositionSlider.value = state.imageY;
    xPositionValue.value = state.imageX;
    yPositionValue.value = state.imageY;

    scaleSlider.value = state.imageScale;
    scaleValue.value = state.imageScale;
    imageScale = state.imageScale / 100;

    widthSlider.value = state.imageWidth;
    widthValue.value = state.imageWidth;
    imageWidth = state.imageWidth / 100;

    controlledPointIndices = new Set(state.controlledPointIndices);
    breakPointIndices = new Set(state.breakPointIndices);
    points = state.points.map((p) => ({ x: p.x, y: p.y }));

    draw();
  }

  document
    .getElementById("tracer-save-project")
    .addEventListener("click", () => {
      const state = {
        version: 1,
        imageX,
        imageY,
        imageScale: parseInt(scaleSlider.value),
        imageWidth: parseInt(widthSlider.value),
        innerCircleRadius: circles[0].radius,
        outerCircleRadius: circles[1].radius,
        innerGain: parseFloat(innerGainInput.value),
        outerGain: parseFloat(outerGainInput.value),
        angleInterval,
        interpolationMethod,
        controlledPointIndices: Array.from(controlledPointIndices),
        breakPointIndices: Array.from(breakPointIndices),
        points: points.map((p) => ({ x: p.x, y: p.y })),
      };
      const baseName = imageFileName
        ? imageFileName.replace(/\.[^.]+$/, "")
        : "antenna-tracer-project";
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  document
    .getElementById("tracer-load-project")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => loadProjectFromJSON(event.target.result);
      reader.readAsText(file);
      e.target.value = "";
    });

  // Open the overlay for a plane. Tracer state (image, points, circles) is kept
  // between openings, so a trace can be reopened and adjusted before reapplying.
  function openTracer(plane) {
    targetPlane = plane;
    planeLabel.textContent = TRACER_PLANE_NAMES[plane] || plane;
    overlay.classList.add("visible");
    resizeCanvas();
  }

  function closeTracer() {
    targetPlane = null;
    overlay.classList.remove("visible");
    isMouseDown = false;
    isZooming = false;
    isSpacebarDown = false;
    isBKeyDown = false;
  }

  const TRACER_PLANE_NAMES = {
    azimuth: "Azimuth (XY)",
    "elevation-xz": "Elevation (XZ)",
    "elevation-yz": "Elevation (YZ)",
  };

  document
    .getElementById("tracer-close")
    .addEventListener("click", closeTracer);

  initializePoints();

  window.openTracer = openTracer;
  window.closeTracer = closeTracer;
})();
