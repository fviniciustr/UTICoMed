/**
 * Motor compartilhado de osciloscópio fosforescente de alta performance (Zero shadowBlur)
 * Utilizado por Monitor Multiparamétrico, Ventilador Hamilton-T1 e Cardioversor Vivo Gold
 */
(function (global) {
  'use strict';

  function getDpr() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  function resizeCanvas(canvas) {
    if (!canvas) return false;
    const dpr = getDpr();
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const nw = Math.round(rect.width * dpr);
    const nh = Math.round(rect.height * dpr);
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      return true;
    }
    return false;
  }

  function drawGrid(ctx, w, h, dpr, vCols, hRows, strokeStyle = 'rgba(148, 163, 184, 0.065)') {
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, 0.75 * dpr);
    ctx.beginPath();
    for (let c = 1; c < vCols; c++) {
      const gx = (c / vCols) * w;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
    }
    for (let r = 1; r < hRows; r++) {
      const gy = (r / hRows) * h;
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
    }
    ctx.stroke();
    ctx.restore();
  }

  const _gridCache = new WeakMap();

  function getCachedGridCanvas(canvas, w, h, dpr, vCols, hRows, strokeStyle, bgColor, refYs) {
    const refKey = refYs && refYs.length ? refYs.map((v) => Math.round(v)).join(',') : '';
    const key = `${w}x${h}:${dpr}:${vCols}:${hRows}:${bgColor}:${refKey}`;
    let entry = _gridCache.get(canvas);
    if (entry && entry.key === key) return entry.off;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d', { alpha: !bgColor });
    if (bgColor) {
      octx.fillStyle = bgColor;
      octx.fillRect(0, 0, w, h);
    }
    drawGrid(octx, w, h, dpr, vCols, hRows, strokeStyle);
    if (refYs && refYs.length) {
      octx.save();
      octx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      octx.lineWidth = Math.max(1, dpr);
      octx.setLineDash([4 * dpr, 4 * dpr]);
      octx.beginPath();
      for (let k = 0; k < refYs.length; k++) {
        const y = refYs[k];
        octx.moveTo(0, y);
        octx.lineTo(w, y);
      }
      octx.stroke();
      octx.restore();
    }
    entry = { key, off };
    _gridCache.set(canvas, entry);
    return off;
  }

  /**
   * Desenha traçado com barra apagadora fosforescente sem ctx.shadowBlur
   * Otimizado: zero closures por ponto (modo afim), subamostragem preservadora de picos QRS e halo 2-pass GPU-friendly
   */
  function drawSweepTrace(ctx, opts) {
    const {
      buf,
      len,
      cursor,
      gapSamples = 34,
      fadeLen = 50,
      tailHighlight = 26,
      color = '#00ff66',
      fillColor = null,
      baseY = 0,
      lineWidth = 2.0,
      dpr = 1,
      toX,
      toY,
      w = 0,
      h = 0,
      minVal = 0,
      invSpan = 1,
      plotH = 0,
      padY = 0,
      topY = 2 * dpr,
      botY = 0,
      glow = true
    } = opts;

    const fastAffine = !toX && !toY && w > 0 && h > 0;
    const xStep = fastAffine ? w / (len - 1) : 0;
    // Subamostragem preservadora de pico quando há mais amostras que pixels (reduz até 50% os vértices sem perder pontas de QRS)
    const decimate = fastAffine && len > w * 1.15 ? Math.max(2, Math.floor(len / (w * 0.92))) : 1;

    const mapX = (i) => (fastAffine ? i * xStep : toX(i));
    const mapY = (v) => {
      if (!fastAffine) return toY(v);
      let norm = (v - minVal) * invSpan;
      if (norm < 0.03) norm = 0.03;
      else if (norm > 0.97) norm = 0.97;
      return h - norm * plotH - padY;
    };

    const tracePath = (start, end) => {
      if (decimate <= 1) {
        for (let i = start; i < end; i++) {
          const x = mapX(i);
          const y = mapY(buf[i]);
          if (i === start) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        return;
      }
      // Preserva picos locais (ex.: onda R aguda ou espícula de marcapasso) dentro de cada janela decimate
      ctx.moveTo(mapX(start), mapY(buf[start]));
      let prevV = buf[start];
      for (let i = start + 1; i < end; i += decimate) {
        const chunkEnd = i + decimate < end ? i + decimate : end;
        let bestIdx = i;
        let bestDiff = -1;
        for (let j = i; j < chunkEnd; j++) {
          const diff = Math.abs(buf[j] - prevV);
          if (diff > bestDiff) {
            bestDiff = diff;
            bestIdx = j;
          }
        }
        prevV = buf[bestIdx];
        ctx.lineTo(mapX(bestIdx), mapY(prevV));
      }
      const last = end - 1;
      ctx.lineTo(mapX(last), mapY(buf[last]));
    };

    const drawSlice = (start, end, alpha, widthScale, isBright) => {
      if (end - start < 2) return;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (fillColor) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(mapX(start), baseY);
        tracePath(start, end);
        ctx.lineTo(mapX(end - 1), baseY);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      ctx.beginPath();
      tracePath(start, end);

      if (glow) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * (isBright ? 0.24 : 0.14);
        ctx.lineWidth = (lineWidth * widthScale + (isBright ? 3.6 : 2.4)) * dpr;
        ctx.stroke();
      }

      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth * widthScale * dpr;
      ctx.stroke();
    };

    ctx.save();
    // Segmento ativo (0 -> cursor)
    if (cursor > 1) {
      if (tailHighlight > 0 && glow) {
        const hi = Math.min(cursor, tailHighlight);
        const bodyEnd = cursor - hi + 1;
        if (bodyEnd > 1) drawSlice(0, bodyEnd, 0.94, 1.0, false);
        drawSlice(Math.max(0, cursor - hi), cursor, 1.0, 1.15, true);
      } else {
        drawSlice(0, cursor, 1.0, 1.0, false);
      }
    }

    // Segmento antigo após a barra apagadora
    const resumeIdx = cursor + gapSamples;
    if (resumeIdx < len - 1) {
      const fl = Math.min(fadeLen, len - resumeIdx - 1);
      if (fl > 2) drawSlice(resumeIdx, resumeIdx + fl, 0.32, 0.94, false);
      if (resumeIdx + fl < len - 1) drawSlice(resumeIdx + fl - 1, len, 0.68, 1.0, false);
    }

    // Barra vertical de varredura + ponto luminoso na ponta
    const headIdx = (cursor - 1 + len) % len;
    const hx = mapX(headIdx);
    const hy = mapY(buf[headIdx]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(hx, topY);
    ctx.lineTo(hx, botY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.2 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.0 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 1.7 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.Sweep = { getDpr, resizeCanvas, drawGrid, getCachedGridCanvas, drawSweepTrace };
})(window);
