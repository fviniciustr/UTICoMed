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

  /**
   * Desenha traçado com barra apagadora fosforescente sem ctx.shadowBlur (halo em 2 passadas GPU-friendly)
   */
  function drawSweepTrace(ctx, {
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
    topY = 2 * dpr,
    botY = 0,
    glow = true
  }) {
    const drawSlice = (start, end, alpha, widthScale, isBright) => {
      if (end - start < 2) return;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Preenchimento opcional sob a curva (Ventilador)
      if (fillColor) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(toX(start), baseY);
        for (let i = start; i < end; i++) ctx.lineTo(toX(i), toY(buf[i]));
        ctx.lineTo(toX(end - 1), baseY);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      // Constrói o caminho uma única vez para halo + núcleo
      ctx.beginPath();
      for (let i = start; i < end; i++) {
        const x = toX(i);
        const y = toY(buf[i]);
        if (i === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Passada 1: halo fosforescente leve sem shadowBlur (5-10x mais rápido na GPU)
      if (glow) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * (isBright ? 0.24 : 0.14);
        ctx.lineWidth = (lineWidth * widthScale + (isBright ? 3.8 : 2.6)) * dpr;
        ctx.stroke();
      }

      // Passada 2: traço principal nítido
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth * widthScale * dpr;
      ctx.stroke();
      ctx.restore();
    };

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

    // Barra vertical de varredura + ponto luminoso trifásico na ponta
    const headIdx = (cursor - 1 + len) % len;
    const hx = toX(headIdx);
    const hy = toY(buf[headIdx]);
    ctx.save();
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
    ctx.arc(hx, hy, 5.5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.2 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 1.8 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.Sweep = { getDpr, resizeCanvas, drawGrid, drawSweepTrace };
})(window);
