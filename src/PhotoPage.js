// PhotoPage.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './PhotoPage.css';

const TEMPLATE_URL = '/picTemplate/template.png';

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Detects the photo placeholder by:
 *   1. Flood-filling from the image borders to mark all "reachable" background pixels.
 *   2. Finding connected components among enclosed (unreachable) background pixels.
 *   3. Returning the bounding box of the LARGEST such component.
 *
 * This handles templates that have multiple enclosed regions (e.g. a decorative
 * text box on the left AND a photo frame on the right) — the photo frame is
 * assumed to be the largest enclosed region.
 */
function detectPhotoArea(imageData, width, height) {
  const d = imageData.data;

  // Sample background color from the top-left corner pixel
  const bgR = d[0], bgG = d[1], bgB = d[2];
  const TOL = 35; // per-channel tolerance

  function likeBg(pi) {
    return (
      Math.abs(d[pi]     - bgR) < TOL &&
      Math.abs(d[pi + 1] - bgG) < TOL &&
      Math.abs(d[pi + 2] - bgB) < TOL
    );
  }

  // ── Step 1: BFS from all border pixels to mark reachable background ───────
  const reachable = new Uint8Array(width * height);
  const q1 = [];
  let   h1 = 0;

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const idx = y * width + x;
      if (!reachable[idx] && likeBg(idx * 4)) { reachable[idx] = 1; q1.push(idx); }
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      const idx = y * width + x;
      if (!reachable[idx] && likeBg(idx * 4)) { reachable[idx] = 1; q1.push(idx); }
    }
  }
  while (h1 < q1.length) {
    const idx = q1[h1++];
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0)         { const n = idx - 1;     if (!reachable[n] && likeBg(n * 4)) { reachable[n] = 1; q1.push(n); } }
    if (x < width - 1) { const n = idx + 1;     if (!reachable[n] && likeBg(n * 4)) { reachable[n] = 1; q1.push(n); } }
    if (y > 0)         { const n = idx - width;  if (!reachable[n] && likeBg(n * 4)) { reachable[n] = 1; q1.push(n); } }
    if (y < height - 1){ const n = idx + width;  if (!reachable[n] && likeBg(n * 4)) { reachable[n] = 1; q1.push(n); } }
  }

  // ── Step 2a: Find connected components among enclosed bg pixels ───────────
  //    Return the bounding box of the LARGEST component (= the photo frame).
  const seen = new Uint8Array(width * height);
  let best     = null;
  let bestSize = 0;

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const si = sy * width + sx;
      if (reachable[si] || seen[si] || !likeBg(si * 4)) continue;

      // BFS this component
      const cq = [si];
      seen[si] = 1;
      let ch = 0, size = 0;
      let minX = sx, maxX = sx, minY = sy, maxY = sy;

      while (ch < cq.length) {
        const idx = cq[ch++];
        const x = idx % width, y = (idx / width) | 0;
        size++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (x > 0)         { const n = idx - 1;     if (!reachable[n] && !seen[n] && likeBg(n * 4)) { seen[n] = 1; cq.push(n); } }
        if (x < width - 1) { const n = idx + 1;     if (!reachable[n] && !seen[n] && likeBg(n * 4)) { seen[n] = 1; cq.push(n); } }
        if (y > 0)         { const n = idx - width;  if (!reachable[n] && !seen[n] && likeBg(n * 4)) { seen[n] = 1; cq.push(n); } }
        if (y < height - 1){ const n = idx + width;  if (!reachable[n] && !seen[n] && likeBg(n * 4)) { seen[n] = 1; cq.push(n); } }
      }

      if (size > bestSize) {
        bestSize = size;
        best = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      }
    }
  }

  // ── Step 2b: Fallback — find the photo frame by detecting the largest region
  //    enclosed by a white/light-colored border.
  //    Strategy: flood-fill from all image edges treating bright pixels (the
  //    white frame border) as impassable walls.  Anything the fill can't reach
  //    is completely surrounded by those walls — i.e. it IS the photo interior.
  if (!best || bestSize < width * height * 0.06) {
    seen.fill(0);
    bestSize = 0;
    best = null;

    // A pixel is a "wall" if its average brightness is > 150 (sum > 450).
    // This catches the frame border (191,232,255 → sum 678) AND classic white,
    // while ignoring the dark-blue background (0,66,112 → sum 178) and the
    // medium-blue right panel (0,109,178 → sum 287).
    const isWall = (pi) => d[pi] + d[pi + 1] + d[pi + 2] > 450;

    // Flood-fill from every border pixel that is NOT a wall.
    const reach2 = new Uint8Array(width * height);
    const q2 = [];
    let h2 = 0;
    for (let x = 0; x < width; x++) {
      const t = x, b = (height - 1) * width + x;
      if (!reach2[t] && !isWall(t * 4)) { reach2[t] = 1; q2.push(t); }
      if (!reach2[b] && !isWall(b * 4)) { reach2[b] = 1; q2.push(b); }
    }
    for (let y = 1; y < height - 1; y++) {
      const l = y * width, r = y * width + width - 1;
      if (!reach2[l] && !isWall(l * 4)) { reach2[l] = 1; q2.push(l); }
      if (!reach2[r] && !isWall(r * 4)) { reach2[r] = 1; q2.push(r); }
    }
    while (h2 < q2.length) {
      const idx = q2[h2++];
      const x = idx % width, y = (idx / width) | 0;
      if (x > 0)         { const n=idx-1;     if (!reach2[n] && !isWall(n*4)) { reach2[n]=1; q2.push(n); } }
      if (x < width-1)   { const n=idx+1;     if (!reach2[n] && !isWall(n*4)) { reach2[n]=1; q2.push(n); } }
      if (y > 0)         { const n=idx-width; if (!reach2[n] && !isWall(n*4)) { reach2[n]=1; q2.push(n); } }
      if (y < height-1)  { const n=idx+width; if (!reach2[n] && !isWall(n*4)) { reach2[n]=1; q2.push(n); } }
    }

    // Find the LARGEST connected component that is: not reachable and not a wall.
    for (let sy = 0; sy < height; sy++) {
      for (let sx = 0; sx < width; sx++) {
        const si = sy * width + sx;
        if (reach2[si] || seen[si] || isWall(si * 4)) continue;

        const cq = [si];
        seen[si] = 1;
        let ch = 0, size = 0;
        let minX = sx, maxX = sx, minY = sy, maxY = sy;

        while (ch < cq.length) {
          const idx = cq[ch++];
          const x = idx % width, y = (idx / width) | 0;
          size++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;

          if (x > 0)         { const n=idx-1;     if (!reach2[n] && !seen[n] && !isWall(n*4)) { seen[n]=1; cq.push(n); } }
          if (x < width-1)   { const n=idx+1;     if (!reach2[n] && !seen[n] && !isWall(n*4)) { seen[n]=1; cq.push(n); } }
          if (y > 0)         { const n=idx-width; if (!reach2[n] && !seen[n] && !isWall(n*4)) { seen[n]=1; cq.push(n); } }
          if (y < height-1)  { const n=idx+width; if (!reach2[n] && !seen[n] && !isWall(n*4)) { seen[n]=1; cq.push(n); } }
        }

        if (size > bestSize) {
          bestSize = size;
          best = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
        }
      }
    }

    // Border thickness for step 2b: count wall pixels to the left of the
    // interior edge — stop as soon as we hit a non-wall (exterior) pixel.
    // We do this here while isWall is still in scope.
    if (best) {
      const midY2 = best.y + (best.height >> 1);
      let bt = 0;
      for (let dx = 1; dx <= 30; dx++) {
        const scanX = best.x - dx;
        if (scanX < 0) break;
        const sp = (midY2 * width + scanX) * 4;
        if (d[sp] + d[sp + 1] + d[sp + 2] <= 450) break; // hit non-wall (exterior)
        bt = dx;
      }
      best.borderThickness = bt;

      // Detect corner radius: at y=best.y (topmost interior row) scan rightward
      // from best.x.  Pixels at the rounded corners are wall pixels; the first
      // non-wall non-reach2 pixel is where the interior actually starts.
      // That offset equals the corner radius of the frame.
      let r2 = 0;
      for (let dx = 0; dx < Math.min(best.width >> 1, 80); dx++) {
        const idx = best.y * width + (best.x + dx);
        if (!reach2[idx] && !isWall(idx * 4)) { r2 = dx; break; }
      }
      best.radius = r2;
    }
  }

  // Estimate corner radius and border thickness from pixel data (step 2a path).
  if (best && best.borderThickness === undefined) {
    // Corner radius: scan top row inward until we find the first enclosed pixel
    let cornerRadius = 0;
    for (let dx = 0; dx < best.width / 2; dx++) {
      const idx = best.y * width + (best.x + dx);
      if (!reachable[idx] && likeBg(idx * 4)) { cornerRadius = dx; break; }
    }
    best.radius = cornerRadius;

    // Border thickness: scan leftward from the left interior edge (at mid-height)
    // until we reach the outer background — counts the non-background (border) pixels.
    const midY = Math.min(best.y + cornerRadius + 5, best.y + ((best.height / 2) | 0));
    let borderThick = 0;
    for (let dx = 1; dx <= 60; dx++) {
      const scanX = best.x - dx;
      if (scanX < 0) break;
      if (likeBg((midY * width + scanX) * 4)) break;
      borderThick = dx;
    }
    best.borderThickness = borderThick;
  }

  return best; // null if no enclosed region found
}

/**
 * Draw img into (dx, dy, dw, dh) with a cover crop — fills the frame fully.
 *
 * Landscape (imgAspect ≥ boxAspect): crop left/right symmetrically.
 * Portrait  (imgAspect < boxAspect): crop is biased toward the TOP (30 % from
 * top, 70 % from bottom) so the face/head stays in frame for selfies.
 */
function drawImageContain(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth  || img.width;
  const ih = img.naturalHeight || img.height;
  const imgAspect = iw / ih;
  const boxAspect = dw / dh;

  let sx, sy, sw, sh;
  if (imgAspect >= boxAspect) {
    // Landscape: cover-crop left/right, keep full height
    sh = ih; sw = sh * boxAspect; sx = (iw - sw) / 2; sy = 0;
  } else {
    // Portrait: cover-crop top/bottom, bias toward top to preserve the face
    sw = iw; sh = sw / boxAspect;
    sy = (ih - sh) * 0.3; // 30 % from top, 70 % from bottom
    sx = 0;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** Trace a rounded-rectangle path on ctx (works on all browsers). */
function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,       y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,     y,     x + r,   y,         r);
  ctx.closePath();
}

/**
 * Composite userPhotoDataURL into the photo placeholder area of the template.
 * Strategy:
 *   1. Flood-fill from the template border to find the enclosed interior region
 *      (works for templates where the photo area = same color as background,
 *       enclosed by a visible frame/border).
 *   2. If detection fails, fall back to a generous centred zone.
 *   3. Draw the full template, clearRect the placeholder area, then
 *      draw the user photo into that cleared hole.
 */
async function compositeImages(userPhotoDataURL, templateURL) {
  const templateImg = await loadImage(templateURL);
  const W = templateImg.naturalWidth  || templateImg.width;
  const H = templateImg.naturalHeight || templateImg.height;

  // ── 1. Scan template for photo area + background color ────────────────
  let rect = null;
  let bgR = 100, bgG = 0, bgB = 128; // sensible purple fallback
  try {
    const scanCanvas = document.createElement('canvas');
    scanCanvas.width  = W;
    scanCanvas.height = H;
    const scanCtx = scanCanvas.getContext('2d');
    scanCtx.drawImage(templateImg, 0, 0);
    const imgData = scanCtx.getImageData(0, 0, W, H);
    bgR = imgData.data[0]; bgG = imgData.data[1]; bgB = imgData.data[2];
    rect = detectPhotoArea(imgData, W, H);
  } catch (e) {
    console.warn('Template pixel scan failed:', e.message);
  }

  // ── 2. Fallback: centred 76 % of the template ──────────────────────────
  if (!rect || rect.width < 20 || rect.height < 20) {
    console.warn('Photo area not detected — using centre fallback.');
    const pad = 0.12;
    rect = {
      x: Math.round(W * pad), y: Math.round(H * pad),
      width: Math.round(W * (1 - 2 * pad)), height: Math.round(H * (1 - 2 * pad)),
      radius: 0, borderThickness: 0,
    };
  }

  // ── 3. Composite ────────────────────────────────────────────────────────
  const userImg = await loadImage(userPhotoDataURL);

  const outCanvas = document.createElement('canvas');
  outCanvas.width  = W;
  outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d');

  // Expand the punch area to cover the white border ring
  const baseRadius = rect.radius || 0;
  const border     = (rect.borderThickness || 0) + 2; // +2 px safety margin
  const px = Math.max(0, rect.x - border);
  const py = Math.max(0, rect.y - border);
  const pw = Math.min(W - px, rect.width  + border * 2);
  const ph = Math.min(H - py, rect.height + border * 2);
  // Ensure a visually meaningful corner radius even if detection returns a small value.
  const pr = Math.max(
    Math.min(baseRadius + border, pw / 2, ph / 2),
    Math.min(pw, ph) * 0.1   // at least 10 % of the shorter frame dimension
  );

  // (a) Draw the full template
  outCtx.drawImage(templateImg, 0, 0);

  // (b) Punch a rounded hole (includes the white border) using destination-out
  outCtx.save();
  outCtx.globalCompositeOperation = 'destination-out';
  roundedRectPath(outCtx, px, py, pw, ph, pr);
  outCtx.fill();
  outCtx.restore();

  // (c) Draw user photo *behind* the template — fills the transparent rounded hole
  outCtx.save();
  outCtx.globalCompositeOperation = 'destination-over';
  drawImageContain(outCtx, userImg, px, py, pw, ph);
  outCtx.restore();

  // (d) Inward edge fade — clip to the rounded frame hole, then draw 4 gradient
  // rects from opaque-background at each edge fading to transparent inward.
  // Fade zone is 13 % of the shorter frame dimension.
  const fadeSize = Math.min(pw, ph) * 0.13;
  const bg0 = `rgba(${bgR},${bgG},${bgB},0)`;
  const bg1 = `rgba(${bgR},${bgG},${bgB},0.92)`;
  let g;
  outCtx.save();
  roundedRectPath(outCtx, px, py, pw, ph, pr);
  outCtx.clip();
  // Top
  g = outCtx.createLinearGradient(0, py, 0, py + fadeSize);
  g.addColorStop(0, bg1); g.addColorStop(1, bg0);
  outCtx.fillStyle = g; outCtx.fillRect(px, py, pw, fadeSize);
  // Bottom
  g = outCtx.createLinearGradient(0, py + ph - fadeSize, 0, py + ph);
  g.addColorStop(0, bg0); g.addColorStop(1, bg1);
  outCtx.fillStyle = g; outCtx.fillRect(px, py + ph - fadeSize, pw, fadeSize);
  // Left
  g = outCtx.createLinearGradient(px, 0, px + fadeSize, 0);
  g.addColorStop(0, bg1); g.addColorStop(1, bg0);
  outCtx.fillStyle = g; outCtx.fillRect(px, py, fadeSize, ph);
  // Right
  g = outCtx.createLinearGradient(px + pw - fadeSize, 0, px + pw, 0);
  g.addColorStop(0, bg0); g.addColorStop(1, bg1);
  outCtx.fillStyle = g; outCtx.fillRect(px + pw - fadeSize, py, fadeSize, ph);
  outCtx.restore();

  return outCanvas.toDataURL('image/png');
}

// ─── Component ──────────────────────────────────────────────────────────────

const PhotoPage = () => {
  const navigate = useNavigate();
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // 'camera' → 'preview' → 'result'
  const [stage, setStage]               = useState('camera');
  const [capturedImage, setCapturedImage] = useState(null);
  const [resultImage,   setResultImage]   = useState(null);
  const [cameraError,   setCameraError]   = useState(null);
  const [processing,    setProcessing]    = useState(false);
  const [compositeError, setCompositeError] = useState(null);
  const [facingMode, setFacingMode]       = useState('environment'); // 'environment' = rear, 'user' = front

  // ── Camera helpers ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing) => {
    setCameraError(null);
    const mode = facing || 'environment';
    const constraints = [
      { video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true },
    ];

    for (const c of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        return; // success
      } catch (_) {
        // try next constraint
      }
    }
    setCameraError('Unable to access the camera. Please allow camera permissions and try again.');
  }, []);

  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    stopCamera();
    startCamera(next);
  }, [facingMode, stopCamera, startCamera]);

  useEffect(() => {
    if (stage === 'camera') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Actions ────────────────────────────────────────────────────────────

  const capturePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.95));
    setStage('preview');
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setResultImage(null);
    setCompositeError(null);
    setStage('camera');
  };

  const usePicture = async () => {
    setProcessing(true);
    setCompositeError(null);
    try {
      const result = await compositeImages(capturedImage, TEMPLATE_URL);
      setResultImage(result);
      setStage('result');
    } catch (err) {
      console.error('Compositing error:', err);
      setCompositeError(err.message || 'Error processing image. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const savePicture = async () => {
    if (!resultImage) return;
    const filename = `photo_${Date.now()}.png`;

    // Prefer Web Share API — on iOS Safari this shows a share sheet that
    // includes "Save Image", writing the photo directly to the Photos library.
    // On Android Chrome it also offers "Save to Photos" or similar.
    try {
      const res  = await fetch(resultImage);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Photo' });
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // user dismissed the share sheet
      // share failed — fall through to the download link
    }

    // Fallback: classic <a download> (works on desktop; saves to Files on iOS)
    const a = document.createElement('a');
    a.href     = resultImage;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const goHome = () => navigate('/');

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="photo-page">

      {/* ── STAGE 1: CAMERA ── */}
      {stage === 'camera' && (
        <div className="camera-stage">
          {cameraError ? (
            <div className="camera-error">
              <div className="camera-error-icon">📷</div>
              <p>{cameraError}</p>
              <button onClick={startCamera} className="photo-btn">Retry</button>
              <button onClick={goHome}      className="photo-btn-secondary" style={{ marginTop: 10 }}>Back to Home</button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
              />
              {/* hidden canvas for capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="camera-controls">
                <button onClick={goHome} className="photo-btn-secondary">Back</button>
                <button onClick={capturePhoto} className="capture-btn" aria-label="Take Photo">
                  <span className="capture-btn-inner" />
                </button>
                <button onClick={flipCamera} className="flip-btn" aria-label="Flip Camera">
                  🔄
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STAGE 2: PREVIEW ── */}
      {stage === 'preview' && (
        <div className="preview-stage">
          <div className="stage-header">
            <h2 className="stage-title">Review Your Photo</h2>
          </div>

          <div className="preview-image-container">
            <img src={capturedImage} alt="Captured" className="preview-image" />
          </div>

          {compositeError && (
            <div className="error-banner">{compositeError}</div>
          )}

          <div className="photo-controls">
            <button onClick={retakePhoto} className="photo-btn-secondary" disabled={processing}>
              Retake Picture
            </button>
            <button onClick={usePicture} className="photo-btn" disabled={processing}>
              {processing ? (
                <span className="spinner-label">
                  <span className="spinner" />
                  Processing…
                </span>
              ) : 'Use Picture'}
            </button>
          </div>
        </div>
      )}

      {/* ── STAGE 3: RESULT ── */}
      {stage === 'result' && (
        <div className="result-stage">
          <div className="stage-header">
            <h2 className="stage-title">Your Photo is Ready!</h2>
          </div>

          <div className="result-image-container">
            <img src={resultImage} alt="Final Result" className="result-image" />
          </div>

          <div className="photo-controls">
            <button onClick={retakePhoto} className="photo-btn-secondary">New Pic</button>
            <button onClick={savePicture} className="photo-btn">Save Picture</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoPage;
