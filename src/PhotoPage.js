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

/** Returns true for solid light-blue pixels used as the placeholder area. */
function isLightBlue(r, g, b, a) {
  if (a !== undefined && a < 200) return false; // skip transparent pixels
  // Covers shades like #ADD8E6 (173,216,230), #87CEEB (135,206,235),
  // #B0C4DE (176,196,222), #87CEFA (135,206,250)
  return (
    b > 140 &&
    g > 120 &&
    r < 220 &&
    b >= g - 50 &&
    b > r + 20 &&
    g > r
  );
}

/** Scan imageData for the bounding rectangle of all light-blue pixels. */
function detectLightBlueRect(imageData, width, height) {
  const d = imageData.data;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isLightBlue(d[i], d[i + 1], d[i + 2], d[i + 3])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Draw img into (dx, dy, dw, dh) with "cover" crop — fills the box, centred. */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth  || img.width;
  const ih = img.naturalHeight || img.height;
  const imgAspect = iw / ih;
  const boxAspect = dw / dh;

  let sx, sy, sw, sh;
  if (imgAspect > boxAspect) {
    sh = ih;
    sw = sh * boxAspect;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = sw / boxAspect;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Composite userPhotoDataURL into the light-blue area of the template image.
 * Returns a PNG data-URL of the result.
 */
async function compositeImages(userPhotoDataURL, templateURL) {
  // 1. Load the template
  const templateImg = await loadImage(templateURL);
  const W = templateImg.naturalWidth  || templateImg.width;
  const H = templateImg.naturalHeight || templateImg.height;

  // 2. Draw template to an offscreen canvas so we can read pixels
  const detectCanvas = document.createElement('canvas');
  detectCanvas.width  = W;
  detectCanvas.height = H;
  const detectCtx = detectCanvas.getContext('2d');
  detectCtx.drawImage(templateImg, 0, 0);

  // 3. Find the light-blue placeholder rectangle
  const imgData = detectCtx.getImageData(0, 0, W, H);
  const rect = detectLightBlueRect(imgData, W, H);

  if (!rect || rect.width < 10 || rect.height < 10) {
    throw new Error(
      'Could not detect the light-blue photo area in the template. ' +
      'Make sure template.png has a solid light-blue rectangle.'
    );
  }

  // 4. Build a "mask" version of the template: light-blue pixels → transparent
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width  = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.drawImage(templateImg, 0, 0);

  const maskData = maskCtx.getImageData(0, 0, W, H);
  const md = maskData.data;
  for (let i = 0; i < md.length; i += 4) {
    if (isLightBlue(md[i], md[i + 1], md[i + 2], md[i + 3])) {
      md[i + 3] = 0; // make transparent
    }
  }
  maskCtx.putImageData(maskData, 0, 0);

  // 5. Composite onto output canvas:
  //    a) Draw user photo (cover-cropped) into the detected rect
  //    b) Draw the masked template on top  → photo shows through the hole
  const outCanvas = document.createElement('canvas');
  outCanvas.width  = W;
  outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d');

  const userImg = await loadImage(userPhotoDataURL);

  outCtx.save();
  outCtx.beginPath();
  outCtx.rect(rect.x, rect.y, rect.width, rect.height);
  outCtx.clip();
  drawImageCover(outCtx, userImg, rect.x, rect.y, rect.width, rect.height);
  outCtx.restore();

  outCtx.drawImage(maskCanvas, 0, 0);

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

  const savePicture = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href     = resultImage;
    a.download = `photo_${Date.now()}.png`;
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
            <button onClick={goHome}      className="photo-btn-secondary">Home</button>
            <button onClick={savePicture} className="photo-btn">Save Picture</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoPage;
