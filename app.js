/**
 * Orquestrador da Interface UTI Sim (Monitor Multiparamétrico + Ventilador Mecânico)
 */
(function () {
  'use strict';

  const {
    SCENARIOS,
    ECG_RHYTHMS,
    ECG_RHYTHM_MAP,
    IV_DRUGS,
    IV_DRUG_MAP,
    O2_DEVICES,
    O2_DEVICE_MAP,
    BOLUS_DRUGS,
    BOLUS_DRUG_MAP,
    SCENARIO_PHARMA,
    PhysiologyEngine,
    MedicalAudio,
    MultiparameterMonitor,
    VivoGoldCardioverter,
    SamtronicIcatuPump,
    SeamatySG1,
    SlidePresentation,
    Superpowers
  } = window.ICUSim;

  // Cache de elementos DOM + diffing de texto (elimina ~70 getElementById a cada 120ms)
  const _domCache = new Map();
  const _txtCache = new Map();
  const $id = (id) => {
    let el = _domCache.get(id);
    if (el === undefined) {
      el = document.getElementById(id);
      _domCache.set(id, el);
    }
    return el;
  };
  const $txt = (id, val) => {
    const s = String(val);
    if (_txtCache.get(id) === s) return;
    const el = $id(id);
    if (el) {
      el.textContent = s;
      _txtCache.set(id, s);
    }
  };
  let superpowers = null;
  const _svg = (inner, sz = 20, vb = 24, sw = 1.85) => `<svg viewBox="0 0 ${vb} ${vb}" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  const engine = new PhysiologyEngine();
  const audio = new MedicalAudio();
  const monitor = new MultiparameterMonitor(engine, audio);
  monitor.keepSamplingInStandby = true;
  function handleCrossDeviceShock(res, energyJ) {
    if (res && res.delivered) {
      monitor.triggerShockArtifact(energyJ);
      if (hamC1Panel && hamC1Panel.onDefibShock) hamC1Panel.onDefibShock(res, energyJ);
    }
    refreshScenarioUI();
  }
  const vivoGold = VivoGoldCardioverter ? new VivoGoldCardioverter(engine, monitor, audio, handleCrossDeviceShock) : null;
  monitor.onBeat = (vit, isPvc) => {
    if (vivoGold && vivoGold.onMonitorBeat) vivoGold.onMonitorBeat(vit, isPvc);
  };
  const icatuPump = SamtronicIcatuPump ? new SamtronicIcatuPump(engine, IV_DRUGS, IV_DRUG_MAP, audio, () => { updateNumericUI(); }, { pumpIndex: 0, idSuffix: '', chassisId: 'icatuChassis' }) : null;
  const icatuPump2 = SamtronicIcatuPump ? new SamtronicIcatuPump(engine, IV_DRUGS, IV_DRUG_MAP, audio, () => { updateNumericUI(); }, { pumpIndex: 1, idSuffix: '2', chassisId: 'icatuChassis2' }) : null;
  const sg1Analyzer = SeamatySG1 ? new SeamatySG1(engine, audio, (m) => addLog(m)) : null;
  const presentationEl = document.getElementById('presentationApp');
  const simulatorEl = document.getElementById('simulatorApp');

  if (simulatorEl) {
    simulatorEl.addEventListener('pointerdown', () => audio._ensureContext(), { passive: true });
    simulatorEl.addEventListener('click', (e) => {
      const devBtn = e.target.closest('.mindray-chassis button, #hamC1Chassis button, #vgChassis button, .icatu-chassis button, #sg1Chassis button');
      if (devBtn) {
        audio.playUiClick('_auto');
      }
    });
    simulatorEl.addEventListener('change', (e) => {
      if (e.target.closest('.mindray-chassis select, #hamC1Chassis select, #vgChassis select, .icatu-chassis select, #sg1Chassis select')) {
        audio.playUiClick('soft');
      }
    });
  }
  let simulatorActive = false;

  let isFrozen = false;
  let lastFrameTime = performance.now();
  let lastUiUpdate = 0;

  // ================= LOG CLÍNICO =================
  const eventLogEl = document.getElementById('eventLog');
  function addLog(message) {
    if (superpowers) superpowers.recordEvent(message);
    if (!eventLogEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const li = document.createElement('li');
    li.innerHTML = `<span class="ev-time">[${hh}:${mm}:${ss}]</span><span>${escapeHtml(message)}</span>`;
    eventLogEl.prepend(li);
    while (eventLogEl.children.length > 30) {
      eventLogEl.removeChild(eventLogEl.lastChild);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  engine.onLog = addLog;

  // ================= ELEMENTOS DA INTERFACE =================
  const severityBadge = document.getElementById('severityBadge');
  const scenarioSubtitle = document.getElementById('scenarioSubtitle');
  const scenarioGuidance = document.getElementById('scenarioGuidance');
  const alarmBox = document.getElementById('alarmBox');
  const alarmText = document.getElementById('alarmText');

  // Botões contextuais de emergência
  const btnDecompress = document.getElementById('btnDecompress');
  const btnDefib = document.getElementById('btnDefib');
  const btnCprToggle = document.getElementById('btnCprToggle');
  const btnPericardiocentesis = document.getElementById('btnPericardiocentesis');
  const btnThrombolysis = document.getElementById('btnThrombolysis');
  const btnPronePosition = document.getElementById('btnPronePosition');
  const btnActiveWarming = document.getElementById('btnActiveWarming');
  const btnSyncCardioversion = document.getElementById('btnSyncCardioversion');
  const btnTransfusion = document.getElementById('btnTransfusion');
  const btnActiveCooling = document.getElementById('btnActiveCooling');
  const btnTranscutPacer = document.getElementById('btnTranscutPacer');
  const btnOsmotherapy = document.getElementById('btnOsmotherapy');
  const btnHydrocortisone = document.getElementById('btnHydrocortisone');
  const btnInsulinDrip = document.getElementById('btnInsulinDrip');
  const btnUterotonic = document.getElementById('btnUterotonic');

  // ================= CONTROLES DO VENTILADOR (HAMILTON-C1) & STANDBY =================
  let hamStandby = false;
  let mrStandby = false;
  let mrKnobAngle = 0;

  function syncVentControlsUI() {
    if (hamC1Panel) hamC1Panel.syncUI();
  }

  function setHamStandby(next) {
    hamStandby = Boolean(next);
    if (engine.vent) engine.vent.standby = hamStandby;
    audio.playUiClick(hamStandby ? 'powerOff' : 'powerOn');
    addLog(hamStandby ? 'HAMILTON-C1 colocado em Standby' : 'HAMILTON-C1 ligado e ventilando');
    if (hamC1Panel) hamC1Panel.syncUI();
    if (vivoGold) vivoGold.syncUI();
  }

  function setMrStandby(next) {
    mrStandby = next;
    document.getElementById('mrStandbyOverlay').classList.toggle('hidden', !mrStandby);
    document.getElementById('mrPowerBtn').classList.toggle('off', mrStandby);
    monitor.setStandby(mrStandby);
    audio.playUiClick(mrStandby ? 'powerOff' : 'powerOn');
    addLog(mrStandby ? 'Mindray iMEC 15 em modo Standby' : 'Mindray iMEC 15 ligado');
  }

  function triggerHoldInsp() {
    if (hamStandby) return;
    audio.playUiClick('maneuver');
    engine.vent.holdInspTimer = 2.2;
    addLog('Pausa Inspiratória (2s) acionada para medir Pressão de Platô');
  }
  function triggerHoldExp() {
    if (hamStandby) return;
    audio.playUiClick('maneuver');
    engine.vent.holdExpTimer = 2.2;
    addLog('Pausa Expiratória (2s) acionada para quantificar Auto-PEEP');
  }
  function triggerO2Flush() {
    if (hamStandby) return;
    audio.playUiClick('maneuver');
    engine.vent.o2FlushTimer = 120;
    addLog('Enriquecimento O₂ a 100% ativado por 2 minutos');
    syncVentControlsUI();
  }

  // ================= CENÁRIOS & STATUS DO PACIENTE =================
  const SCENARIO_ICONS = [
    {
      id: 'stable',
      shortTitle: '1. Estável',
      tag: 'Leve',
      svg: _svg('<path class="sc-svg-primary" d="M12 20.5s-6.8-4.2-6.8-10A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 6.8 3c0 5.8-6.8 10-6.8 10z"/><path class="sc-svg-accent" d="M6.8 12h2.2l1.2-2.8 1.6 5.2 1.3-2.4h3.9"/><circle class="sc-svg-accent" cx="18.2" cy="5.5" r="2.2" fill="currentColor" stroke="none"/>')
    },
    {
      id: 'asthma',
      shortTitle: '2. Asma',
      tag: 'Mod.',
      svg: _svg('<path class="sc-svg-primary" d="M10 3v6L6.2 13.8V19M14 3v6l3.8 4.8V19"/><path class="sc-svg-accent" d="M3 11.5h4.2M5.4 9.8L7.2 11.5 5.4 13.2M21 11.5h-4.2M18.6 9.8l-1.8 1.7 1.8 1.7"/><path class="sc-svg-accent" d="M8.5 17.5c1-1.2 2.2-1.2 3.5 0s2.5 1.2 3.5 0"/>')
    },
    {
      id: 'ards',
      shortTitle: '3. SDRA',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10c.7 0 1-.4 1-1.2V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14c-.7 0-1-.4-1-1.2V10"/><circle class="sc-svg-accent" cx="7.4" cy="17.6" r="1" fill="currentColor" stroke="none"/><circle class="sc-svg-accent" cx="16.6" cy="17.6" r="1" fill="currentColor" stroke="none"/><path class="sc-svg-accent" d="M6.2 15.2h3.2M14.6 15.2h3.2"/>',20,24,1.8)
    },
    {
      id: 'septic_shock',
      shortTitle: '4. Choque',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M6 4v16M18 4v16M3 12h2M19 12h2"/><path class="sc-svg-accent" d="M6 11.5c2.5-1.5 9.5-1.5 12 0"/><path class="sc-svg-accent" d="M12 6.5v10.5M9.2 14.2L12 17.2l2.8-3"/>')
    },
    {
      id: 'pulmonary_edema',
      shortTitle: '5. Edema Pulm.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10c.7 0 1-.4 1-1.2V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14c-.7 0-1-.4-1-1.2V10"/><path class="sc-svg-accent" d="M5.4 17.5c1-.8 2 .8 3.2 0M15.4 17.5c1-.8 2 .8 3.2 0"/><circle class="sc-svg-accent" cx="8.2" cy="15" r="0.8" fill="currentColor" stroke="none"/><circle class="sc-svg-accent" cx="15.8" cy="15" r="0.8" fill="currentColor" stroke="none"/>',20,24,1.8)
    },
    {
      id: 'pneumothorax',
      shortTitle: '6. Pneumotór.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v18M10 11c-1.5 0-2.5 2-2.5 4.5S8.5 19 10 19zM4.5 6.5C3 9 3 17 5 20M12 10c2 0 3.5 1.8 4.8 3.5 1.2 1.5 2.2 3 2.2 5a2.3 2.3 0 0 1-2.3 2.5H14V10"/><path class="sc-svg-accent" d="M5.2 11l3.2 1.5-3.2 1.5M5.2 15.8l3.2 1.2-3.2 1.2"/>',20,24,1.8)
    },
    {
      id: 'opioid_apnea',
      shortTitle: '7. TCE/Apneia',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M8 14a5.5 5.5 0 1 1 8.5-4.6A4.5 4.5 0 0 1 18 14.5V17H6v-2.5"/><path class="sc-svg-accent" d="M4 20h16M8.8 10h2.2M13 10h2.2M9.5 13h5"/>',20,24,1.8)
    },
    {
      id: 'cardiac_arrest',
      shortTitle: '8. PCR (FV)',
      tag: 'Emerg.',
      svg: _svg('<path class="sc-svg-primary" d="M12 20.8s-6.8-4.3-6.8-10.2A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 6.8 3.1c0 5.9-6.8 10.2-6.8 10.2z"/><path class="sc-svg-accent" d="M13.2 8.2L10.3 12h3.1l-2.3 4.2"/>')
    },
    {
      id: 'copd_exacerbation',
      shortTitle: '9. DPOC',
      tag: 'Mod.',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v6M12 9c-2.5 0-4.5 1.8-5.8 3.8-1 1.5-1.5 3.3-1.2 5.2a2.5 2.5 0 0 0 2.5 2h2.8V9M12 9c2.5 0 4.5 1.8 5.8 3.8 1 1.5 1.5 3.3 1.2 5.2a2.5 2.5 0 0 1-2.5 2h-2.8V9"/><path class="sc-svg-accent" d="M6.8 14.5h3M14.2 14.5h3M7.5 17.2h2M14.5 17.2h2"/>',20,24,1.8)
    },
    {
      id: 'pulmonary_embolism',
      shortTitle: '10. TEP Mac.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14V10"/><circle class="sc-svg-accent" cx="15.5" cy="14.5" r="2" fill="currentColor" stroke="none"/><path class="sc-svg-accent" d="M6 12l2.5 2.5M8.5 12L6 14.5"/>',20,24,1.8)
    },
    {
      id: 'dka_acidosis',
      shortTitle: '11. Cetoac.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3c-3.5 4.8-6 8.4-6 12a6 6 0 0 0 12 0c0-3.6-2.5-7.2-6-12z"/><path class="sc-svg-accent" d="M9.5 15h5M12 12.5v5"/>',20,24,1.8)
    },
    {
      id: 'anaphylaxis',
      shortTitle: '12. Anafil.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M12 3l8 16H4z"/><path class="sc-svg-accent" d="M12 9.5v4.2"/><circle class="sc-svg-accent" cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>',20,24,1.8)
    },
    {
      id: 'cardiogenic_shock',
      shortTitle: '13. Cardiog.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M12 20.5s-6.8-4.2-6.8-10A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 6.8 3c0 5.8-6.8 10-6.8 10z"/><path class="sc-svg-accent" d="M7.5 12h2.3l1.2-3.2h2.2l1.1 3.2h2.2"/>')
    },
    {
      id: 'cardiac_tamponade',
      shortTitle: '14. Tampon.',
      tag: 'Crítico',
      svg: _svg('<circle class="sc-svg-primary" cx="12" cy="12" r="8.5"/><path class="sc-svg-accent" d="M12 16.2s-4-2.5-4-5.8a2.4 2.4 0 0 1 4-1.8 2.4 2.4 0 0 1 4 1.8c0 3.3-4 5.8-4 5.8z"/>',20,24,1.8)
    },
    {
      id: 'afib_rvr',
      shortTitle: '15. FA Alta',
      tag: 'Mod.',
      svg: _svg('<path class="sc-svg-primary" d="M2.5 14h2.5l1.5-5 1.5 7 1.8-6 1.5 4h2.2l1.6-7 1.7 8 1.5-4H21.5"/><path class="sc-svg-accent" d="M18 5.5l1.5 2-1.5 2"/>')
    },
    {
      id: 'vtach_unstable',
      shortTitle: '16. TV Inst.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M2 13l2.5-6 3 11 3-11 3 11 3-11 3 11 2.5-6"/>',20,24,1.9)
    },
    {
      id: 'hyperkalemia_avb',
      shortTitle: '17. BAV 3º',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M2.5 13h3.5a1.5 1.5 0 0 1 2.2 0H12l1.5-6 1.8 10 1.4-4h4.8"/><circle class="sc-svg-accent" cx="12" cy="6" r="1.4" fill="currentColor" stroke="none"/>')
    },
    {
      id: 'hypothermia_brady',
      shortTitle: '18. Hipoterm.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path class="sc-svg-accent" d="M10 5l2 2 2-2M10 19l2-2 2 2"/>',20,24,1.8)
    },
    {
      id: 'hemorrhagic_shock',
      shortTitle: '19. Hemorr.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M12 3.5c-3.5 4.8-5.8 8.2-5.8 11.5a5.8 5.8 0 0 0 11.6 0c0-3.3-2.3-6.7-5.8-11.5z"/><path class="sc-svg-accent" d="M9 15.5h6"/>')
    },
    {
      id: 'hypertensive_crisis',
      shortTitle: '20. Emerg. PA',
      tag: 'Grave',
      svg: _svg('<circle class="sc-svg-primary" cx="12" cy="12" r="8"/><path class="sc-svg-accent" d="M12 16V8M8.8 11.2L12 8l3.2 3.2"/>')
    },
    {
      id: 'status_epilepticus',
      shortTitle: '21. Mal Epil.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M7.5 14a5.2 5.2 0 1 1 9-3.6A4.2 4.2 0 0 1 18 15v2H6v-2"/><path class="sc-svg-accent" d="M13 7l-2.5 4h3L11 15"/>',20,24,1.8)
    },
    {
      id: 'svt_unstable',
      shortTitle: '22. TSV',
      tag: 'Mod.',
      svg: _svg('<path class="sc-svg-primary" d="M2 13h3l1.5-7 1.5 10 1.5-10 1.5 10 1.5-10 1.5 10 1.5-7h6"/>')
    },
    {
      id: 'pea_arrest',
      shortTitle: '23. PCR (AESP)',
      tag: 'Emerg.',
      svg: _svg('<path class="sc-svg-primary" d="M3 13h4l1.5-4.5 2 8 1.5-3.5H21"/><path class="sc-svg-accent" d="M15 6l4 4M19 6l-4 4"/>')
    },
    {
      id: 'ards_prone_severe',
      shortTitle: '24. SDRA Extr.',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14V10"/><path class="sc-svg-accent" d="M6 14.5h3.5M14.5 14.5H18M6 17.5h3.5M14.5 17.5H18"/>',20,24,1.8)
    },
    {
      id: 'stemi_anterior',
      shortTitle: '25. IAMCSST',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M2 15h4l2-9 2.5 11 1.5-7h4.5c1.5 0 2.5 1.5 3 5H22"/><path class="sc-svg-accent" d="M12 5h5M14.5 3v4"/>',20,24,1.8)
    },
    {
      id: 'torsades_qt',
      shortTitle: '26. Torsades',
      tag: 'PCR',
      svg: _svg('<path class="sc-svg-primary" d="M2 12l2-3 2 6 2-9 2 12 2-6 2 3 2-8 2 11 2-6 2 2"/>',20,24,1.8)
    },
    {
      id: 'wpw_preexcited',
      shortTitle: '27. WPW',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M2 15h5l3-9 2 12 2-6 3 3h5"/><path class="sc-svg-accent" d="M7 15l3-4"/>',20,24,1.8)
    },
    {
      id: 'tce_cushing',
      shortTitle: '28. Cushing',
      tag: 'Crítico',
      svg: _svg('<path class="sc-svg-primary" d="M9 4a5 5 0 0 0-4 8 4 4 0 0 0 2 7h10a4 4 0 0 0 2-7 5 5 0 0 0-4-8z"/><path class="sc-svg-accent" d="M12 8v6M9.5 10.5L12 8l2.5 2.5"/>',20,24,1.8)
    },
    {
      id: 'neurogenic_shock',
      shortTitle: '29. Neurog.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v18M8 7h8M8 12h8M8 17h8"/><path class="sc-svg-accent" d="M6 12l-2 2M18 12l2 2"/>',20,24,1.8)
    },
    {
      id: 'betablocker_od',
      shortTitle: '30. Intox. BB',
      tag: 'Crítico',
      svg: _svg('<rect class="sc-svg-primary" x="4" y="8" width="16" height="8" rx="4" transform="rotate(-30 12 12)"/><path class="sc-svg-accent" d="M10 8.5l4 7"/>',20,24,1.8)
    },
    {
      id: 'thyroid_storm',
      shortTitle: '31. Tireotóx.',
      tag: 'Grave',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v10a4 4 0 1 0 4 4 4 4 0 0 0-4-4"/><path class="sc-svg-accent" d="M16 5l2-1M17 9h2.5M6 7l2 1"/>',20,24,1.8)
    },
    {
      id: 'myasthenic_crisis',
      shortTitle: '32. Miastên.',
      tag: 'Mod.',
      svg: _svg('<path class="sc-svg-primary" d="M4 17c2.5-3 5-4.5 8-4.5s5.5 1.5 8 4.5"/><path class="sc-svg-accent" d="M12 4v6M9.5 7.5L12 10l2.5-2.5"/>',20,24,1.8)
    },
    {
      id: 'myxedema_coma',
      shortTitle: '33. Mixedema',
      tag: 'Endóc.',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v10a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 13"/><path class="sc-svg-accent" d="M16.5 6.5l3 3M19.5 6.5l-3 3M18 5v6"/>',20,24,1.8)
    },
    {
      id: 'adrenal_crisis',
      shortTitle: '34. Adrenal',
      tag: 'Endóc.',
      svg: _svg('<path class="sc-svg-primary" d="M8.5 7c-2.5 0-4.5 2.2-4.5 5s2 5 4.5 5c1.5 0 2.5-.8 2.5-2.5v-5C11 7.8 10 7 8.5 7zM15.5 7c2.5 0 4.5 2.2 4.5 5s-2 5-4.5 5c-1.5 0-2.5-.8-2.5-2.5v-5c0-1.7 1-2.5 2.5-2.5z"/><path class="sc-svg-accent" d="M6.5 5l2-2 2 2M13.5 5l2-2 2 2"/>',20,24,1.8)
    },
    {
      id: 'hhs_hyperosmolar',
      shortTitle: '35. EHH Osm.',
      tag: 'Endóc.',
      svg: _svg('<path class="sc-svg-primary" d="M12 3s-5.5 6.4-5.5 10.5a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3 12 3z"/><path class="sc-svg-accent" d="M9.5 13.5h5M12 11v5"/>',20,24,1.8)
    },
    {
      id: 'pheochromocytoma_crisis',
      shortTitle: '36. Feocrom.',
      tag: 'Endóc.',
      svg: _svg('<path class="sc-svg-primary" d="M13 2L4.5 13.5h6L9.5 22 19.5 10h-6z"/><path class="sc-svg-accent" d="M3 7h4M17 17h4"/>',20,24,1.8)
    },
    {
      id: 'eclampsia_hellp',
      shortTitle: '37. Eclâmps.',
      tag: 'Obstet.',
      svg: _svg('<circle class="sc-svg-primary" cx="12" cy="11" r="6"/><path class="sc-svg-primary" d="M12 17v4M9.5 19.5h5"/><path class="sc-svg-accent" d="M12.5 7.5L10 11.5h2.5L11.5 14.5"/>',20,24,1.8)
    },
    {
      id: 'postpartum_hemorrhage',
      shortTitle: '38. HPP Mac.',
      tag: 'Obstet.',
      svg: _svg('<path class="sc-svg-primary" d="M12 3s-5 5.8-5 9.8a5 5 0 0 0 10 0C17 8.8 12 3 12 3z"/><path class="sc-svg-accent" d="M6 19.5c2 1.2 4 1.5 6 1.5s4-.3 6-1.5"/>',20,24,1.8)
    },
    {
      id: 'amniotic_embolism',
      shortTitle: '39. Emb. Amn.',
      tag: 'Obstet.',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14V10"/><circle class="sc-svg-accent" cx="12" cy="14.5" r="2.2"/>',20,24,1.8)
    },
    {
      id: 'peripartum_cardiomyopathy',
      shortTitle: '40. CM Perip.',
      tag: 'Obstet.',
      svg: _svg('<path class="sc-svg-primary" d="M12 20.5s-7-4.5-7-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7 3.3c0 5.7-7 10.2-7 10.2z"/><path class="sc-svg-accent" d="M8.5 13h2l1-2.5 1.5 4 1-1.5h1.5"/>',20,24,1.8)
    }
  ];

  // Ícones SVG vetoriais médicos para os 18 botões de intervenção + Bolus EV (mesmo estilo dos cenários clínicos)
  const INTERVENTION_ICONS = {
    btnFluidBolus: _svg('<path class="sc-svg-primary" d="M7 5h10a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2zM10 3h4M12 18v3"/><path class="sc-svg-accent" d="M12 8.5v5M9.5 11h5"/>',36,24,1.85),
    btnBronchodilator: _svg('<path class="sc-svg-primary" d="M9 4h6v7.5L11.5 15H6v-3.5L9 9.5V4zM9 7.5h6"/><path class="sc-svg-accent" d="M16.5 12.5h2.5M17 15.5l2.2 1.2M17 9.5l2.2-1.2"/>',36,24,1.85),
    btnSuctionRecruit: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3.2 1.5-4.5 3-1.4 1.6-2.5 3.3-2.5 5.5A2.3 2.3 0 0 0 7.3 21H10V10M12 10c2 0 3.2 1.5 4.5 3 1.4 1.6 2.5 3.3 2.5 5.5a2.3 2.3 0 0 1-2.3 2.5H14V10"/><path class="sc-svg-accent" d="M6.5 15.5l-2 0M17.5 15.5l2 0M12 5.5l-1.5 1.5M12 5.5l1.5 1.5"/>',36,24,1.85),
    btnDecompress: _svg('<path class="sc-svg-primary" d="M5 7c0-2 2-3 4-3h6c2 0 4 1 4 3v10c0 2-2 3-4 3H9c-2 0-4-1-4-3V7z"/><path class="sc-svg-accent" d="M12 12l7-7M15.5 5H19v3.5M8.5 12h3"/>',36,24,1.85),
    btnDefib: _svg('<path class="sc-svg-primary" d="M12 20.5s-7-4.5-7-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7 3.3c0 5.7-7 10.2-7 10.2z"/><path class="sc-svg-accent" d="M13 8.5L10 13h2.8l-1.3 4 3.5-4.8h-2.8z"/>',36,24,1.85),
    btnCprToggle: _svg('<path class="sc-svg-primary" d="M12 20s-6.5-4.1-6.5-9.2A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 6.5 3c0 5.1-6.5 9.2-6.5 9.2z"/><path class="sc-svg-accent" d="M12 2.5v4.5M9.8 5.2L12 7.4l2.2-2.2"/>',36,24,1.85),
    btnPericardiocentesis: _svg('<path class="sc-svg-primary" d="M12 19.5c-4.5-2.6-6.5-5.6-6.5-9a4 4 0 0 1 6.5-3 4 4 0 0 1 6.5 3c0 3.4-2 6.4-6.5 9z"/><path class="sc-svg-accent" d="M4.5 19.5l6.2-6.2M3.5 17.5l3 3"/>',36,24,1.85),
    btnThrombolysis: _svg('<path class="sc-svg-primary" d="M3 9h18M3 15h18"/><circle class="sc-svg-accent" cx="12" cy="12" r="2.2"/><path class="sc-svg-accent" d="M7.5 12h1.5M15 12h1.5M12 6.5V4M12 20v-2.5"/>',36,24,1.85),
    btnPronePosition: _svg('<path class="sc-svg-primary" d="M4 15.5h16M5.5 15.5v3M18.5 15.5v3M6 12.5h9.5a2 2 0 0 1 2 2v1H6z"/><path class="sc-svg-accent" d="M8 6.5a6.5 6.5 0 0 1 8.5 1M16.5 4.8v2.8h-2.8"/>',36,24,1.85),
    btnActiveWarming: _svg('<path class="sc-svg-primary" d="M10 4a2 2 0 0 1 4 0v8.3a3.8 3.8 0 1 1-4 0V4z"/><path class="sc-svg-accent" d="M12 15.5v-5M17.5 7c1 1.2 1 2.4 0 3.6M20 5.5c1.2 1.7 1.2 3.5 0 5.2"/>',36,24,1.85),
    btnSyncCardioversion: _svg('<path class="sc-svg-primary" d="M4.5 12a7.5 7.5 0 0 1 13.4-4.6M19.5 12a7.5 7.5 0 0 1-13.4 4.6"/><path class="sc-svg-primary" d="M18.2 4.5v3.2H15M5.8 19.5v-3.2H9"/><path class="sc-svg-accent" d="M8 12.5h2l1.2-3.5 1.8 6 1.2-2.5H16"/>',36,24,1.85),
    btnTransfusion: _svg('<path class="sc-svg-primary" d="M12 3s-5.5 6.4-5.5 10.6a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3 12 3z"/><path class="sc-svg-accent" d="M12 10.5v5M9.5 13h5"/>',36,24,1.85),
    btnActiveCooling: _svg('<path class="sc-svg-primary" d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path class="sc-svg-accent" d="M10 5l2 2 2-2M10 19l2-2 2 2M5.5 10.5l2.5-.5-.5-2.5M18.5 13.5l-2.5.5.5 2.5"/>',36,24,1.85),
    btnTranscutPacer: _svg('<path class="sc-svg-primary" d="M2.5 14h4l1-9v12l2.5-6 1.5 3h3l1-9v12l2.5-6 1.5 3h2"/><circle class="sc-svg-accent" cx="7.5" cy="4.2" r="1.2"/><circle class="sc-svg-accent" cx="15.5" cy="4.2" r="1.2"/>',36,24,1.85),
    btnOsmotherapy: _svg('<path class="sc-svg-primary" d="M9.5 4.5a4.5 4.5 0 0 0-4 6.6A3.8 3.8 0 0 0 8 18.5h8a3.8 3.8 0 0 0 2.5-7.4 4.5 4.5 0 0 0-4-6.6 3.5 3.5 0 0 0-5 0z"/><path class="sc-svg-accent" d="M12 14.5v-6M9.5 12l2.5 2.5 2.5-2.5"/>',36,24,1.85),
    btnHydrocortisone: _svg('<rect class="sc-svg-primary" x="4.5" y="8" width="15" height="8" rx="4" transform="rotate(-35 12 12)"/><path class="sc-svg-accent" d="M9.8 9.2l4.4 5.6M17.5 4.5v3M16 6h3"/>',36,24,1.85),
    btnInsulinDrip: _svg('<path class="sc-svg-primary" d="M18.5 3.5l2 2M15.5 4.5l4 4M7.5 12.5l8-8 4 4-8 8-4.5 1 0.5-5zM4 20l3-3"/><path class="sc-svg-accent" d="M11 9l2 2M9 11l2 2"/>',36,24,1.85),
    btnUterotonic: _svg('<path class="sc-svg-primary" d="M12 19v-5.5c0-3.5-3-6.5-6.5-6.5C4.2 7 3.5 8 4 9.2M12 13.5c0-3.5 3-6.5 6.5-6.5 1.3 0 2 1 1.5 2.2M8.5 10.5a3.5 3.5 0 0 0 7 0"/><path class="sc-svg-accent" d="M6.5 14.5l2.5-1.5M17.5 14.5l-2.5-1.5"/>',36,24,1.85)
  };

  Object.entries(INTERVENTION_ICONS).forEach(([id, markup]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const slot = btn.querySelector('.int-ico, .bolus-ico');
    if (slot) slot.innerHTML = markup;
  });

  const SEVERITY_STATUS_ICONS = {
    stable: _svg('<circle cx="8" cy="8" r="6"/><path d="M5.2 8.2l2 2 3.8-4"/>',12,16,2.0),
    moderate: _svg('<circle cx="8" cy="8" r="6"/><path d="M8 5v3.5"/><circle cx="8" cy="11.2" r="0.8" fill="currentColor" stroke="none"/>',12,16,2.0),
    severe: _svg('<path d="M8 2.2l6.2 11H1.8z"/><path d="M8 6.4v3.2"/><circle cx="8" cy="11.5" r="0.7" fill="currentColor" stroke="none"/>',12,16,2.0),
    critical: _svg('<path d="M9.4 2L4.2 9h3.4l-1 5L11.8 7H8.4z"/>',12,16,2.0)
  };

  const ALARM_STATUS_ICONS = {
    ok: _svg('<path d="M2.5 9.5h3l1.5-3.8 2.2 7.2 1.6-3.4h4.7"/>',15,18,1.9),
    warning: _svg('<path d="M9 2.5L16 14.8H2z"/><path d="M9 7v3.6"/><circle cx="9" cy="12.8" r="0.8" fill="currentColor" stroke="none"/>',15,18,1.9),
    critical: _svg('<circle cx="9" cy="9" r="6.8"/><path d="M9 5.2v4.3"/><circle cx="9" cy="12.2" r="0.9" fill="currentColor" stroke="none"/>',15,18,1.9),
    arrest: _svg('<path d="M10.5 2L4.5 10h4L7.5 16l6-8h-4z"/>',15,18,1.9)
  };

  const AIRWAY_BADGE_ICONS = {
    on: _svg('<path d="M10.5 2v6.5a2.5 2.5 0 0 1-2.5 2.5H4"/><ellipse cx="9.2" cy="10.8" rx="1.7" ry="1.2"/>',12,16,1.8),
    off: _svg('<circle cx="8" cy="5.5" r="2.3"/><path d="M4.5 13.5c.8-2 2.1-3 3.5-3s2.7 1 3.5 3"/>',12,16,1.8)
  };

  function resetEquipmentOnScenarioChange() {
    if (isFrozen) {
      isFrozen = false;
      const btnFrz = document.getElementById('btnFreeze');
      if (btnFrz) {
        btnFrz.setAttribute('aria-pressed', 'false');
        btnFrz.textContent = '❄';
        btnFrz.title = 'Congelar traçados para inspeção';
      }
      monitor.setFrozen(false);
    }
    if (hamStandby) {
      hamStandby = false;
      if (engine.vent) engine.vent.standby = false;
    }
    monitor.clearBuffers();
    if (hamC1Panel && hamC1Panel.clearBuffers) hamC1Panel.clearBuffers();
    if (icatuPump && icatuPump.resetUI) icatuPump.resetUI();
    if (icatuPump2 && icatuPump2.resetUI) icatuPump2.resetUI();
    if (vivoGold && vivoGold.resetUI) vivoGold.resetUI();
    if (sg1Analyzer && sg1Analyzer.resetUI) sg1Analyzer.resetUI();
  }

  function renderStatusButtonSet(containerId, compact) {
    const gridEl = document.getElementById(containerId);
    if (!gridEl) return;
    if (gridEl.children.length !== SCENARIO_ICONS.length) {
      gridEl.innerHTML = SCENARIO_ICONS.map((item) => {
        const scObj = SCENARIOS[item.id];
        const sev = scObj ? scObj.severity : 'stable';
        const tip = escapeHtmlAttr(scObj ? `${scObj.name} — ${scObj.subtitle}` : item.shortTitle);
        const cls = compact ? `pat-status-btn sev-${sev}` : `scenario-tile sev-${sev}`;
        const cleanLabel = item.shortTitle.replace(/^\d+\.\s*/, '');
        const labelHtml = compact
          ? `<span class="pat-status-lbl">${cleanLabel}</span>`
          : `<span class="scenario-tile-text"><strong>${item.shortTitle}</strong><small>${item.tag}</small></span>`;
        return `
          <button type="button" class="${cls}" data-scenario-id="${item.id}" title="${tip}" aria-pressed="false">
            <span class="sc-status-dot" aria-hidden="true"></span>
            <span class="scenario-tile-icon" aria-hidden="true">${item.svg}</span>
            ${labelHtml}
          </button>`;
      }).join('');
    }
    if (!gridEl.dataset.statusWired) {
      gridEl.dataset.statusWired = '1';
      gridEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-scenario-id]');
        if (!btn) return;
        audio.playUiClick('soft');
        engine.loadScenario(btn.dataset.scenarioId);
        resetEquipmentOnScenarioChange();
        refreshScenarioUI();
      });
    }
  }

  function ensureScenarioGridRendered() {
    renderStatusButtonSet('scenarioGrid', false);
    renderStatusButtonSet('patientStatusBtns', true);
  }

  if (severityBadge && !severityBadge.dataset.wired) {
    severityBadge.dataset.wired = '1';
    severityBadge.addEventListener('click', () => {
      const levels = ['stable', 'moderate', 'severe', 'critical'];
      const curSev = (engine.scenario && engine.scenario.severity) || 'stable';
      const nextSev = levels[(levels.indexOf(curSev) + 1) % levels.length];
      const candidates = SCENARIO_ICONS.filter((item) => {
        const obj = SCENARIOS[item.id];
        return obj && obj.severity === nextSev;
      });
      if (!candidates.length) return;
      audio.playUiClick('soft');
      engine.loadScenario(candidates[0].id);
      resetEquipmentOnScenarioChange();
      refreshScenarioUI();
    });
  }

  function refreshScenarioUI() {
    ensureScenarioGridRendered();
    const sc = engine.scenario;
    ['scenarioGrid', 'patientStatusBtns'].forEach((cid) => {
      const container = document.getElementById(cid);
      if (!container) return;
      container.querySelectorAll('[data-scenario-id]').forEach((tile) => {
        const isActive = tile.dataset.scenarioId === sc.id;
        tile.classList.toggle('active', isActive);
        tile.setAttribute('aria-pressed', String(isActive));
      });
    });
    const sevIcon = SEVERITY_STATUS_ICONS[sc.severity] || SEVERITY_STATUS_ICONS.stable;
    if (severityBadge) {
      severityBadge.innerHTML = `<span class="sev-pill-icon" aria-hidden="true">${sevIcon}</span><span>${sc.severityLabel}</span>`;
      severityBadge.className = `severity-pill ${sc.severity}`;
    }
    if (scenarioSubtitle) scenarioSubtitle.textContent = sc.subtitle;
    if (scenarioGuidance) scenarioGuidance.textContent = sc.guidance;

    document.getElementById('fluidCount').textContent = engine.interventions.fluidBoluses;
    const _noraEl = document.getElementById('noraValue');
    if (_noraEl) _noraEl.textContent = engine.interventions.noraDose.toFixed(2);
    document.getElementById('metaPatient').textContent = engine.patient.label;

    if (btnDecompress) btnDecompress.classList.toggle('urgent', Boolean(engine.patient.pneumothoraxActive));
    const showArrestBtns = (engine.patient.arrested && !engine.interventions.roscAchieved) || engine.cardiac.rhythm === 'vtach';
    if (btnDefib) btnDefib.classList.toggle('urgent', showArrestBtns);
    if (btnCprToggle) {
      btnCprToggle.classList.toggle('urgent', showArrestBtns);
      btnCprToggle.setAttribute('aria-pressed', String(engine.interventions.cprActive));
    }

    syncRhythmUI();
    syncPhysiologyModalInputs();
    syncVentControlsUI();
    if (typeof syncAirwayO2AndPharmaUI === 'function') syncAirwayO2AndPharmaUI();
    if (vivoGold) vivoGold.syncUI();
    if (icatuPump) icatuPump.syncUI();
    if (icatuPump2) icatuPump2.syncUI();
    if (sg1Analyzer) sg1Analyzer.syncUI();
    if (hamC1Panel) hamC1Panel.syncUI();
    if (typeof syncAuscultationUI === 'function') syncAuscultationUI();
  }

  // ================= VIA AÉREA (ACOPLAMENTO VM), OXIGENOTERAPIA & FÁRMACOS =================
  const O2_DEVICE_ICONS = {
    room_air: {
      badge: '21%',
      svg: _svg('<path class="sc-svg-primary" d="M12 3v7M12 10c-2 0-3 1.5-4.5 3C6 14.5 5 16 5 18.5A2.5 2.5 0 0 0 7.5 21H10c.8 0 1-.5 1-1.3V10M12 10c2 0 3 1.5 4.5 3 1.5 1.5 2.5 3 2.5 5.5a2.5 2.5 0 0 1-2.5 2.5H14c-.8 0-1-.5-1-1.3V10"/><path class="sc-svg-accent" d="M3 7h4M17 7h4"/>',36,24,1.85)
    },
    nasal_cannula: {
      badge: '24–44%',
      svg: _svg('<path class="sc-svg-primary" d="M7 11c-2.5 1-3 3-3 5.5 0 2 1.8 3.5 5 4.5l3 1M17 11c2.5 1 3 3 3 5.5 0 2-1.8 3.5-5 4.5l-3 1M12 22v-1"/><rect class="sc-svg-primary" x="7" y="9.5" width="10" height="3" rx="1.5"/><path class="sc-svg-accent" d="M9.5 5v4.5M14.5 5v4.5"/>',36,24,1.85)
    },
    venturi: {
      badge: '24–50%',
      svg: _svg('<path class="sc-svg-primary" d="M7 5c1-1.5 9-1.5 10 0l1.5 6c.2 1.8-2 3.2-6.5 3.2S5.3 12.8 5.5 11L7 5zM12 18.7V22"/><rect class="sc-svg-accent" x="10" y="14.2" width="4" height="4.5" rx="1"/><path class="sc-svg-accent" d="M8.5 16.5h1.5M14 16.5h1.5"/>',36,24,1.85)
    },
    hudson_mask: {
      badge: '40–60%',
      svg: _svg('<path class="sc-svg-primary" d="M6.5 6.5C8 4 16 4 17.5 6.5l1.3 5.8c.3 2.5-2.6 4.7-6.8 4.7s-7.1-2.2-6.8-4.7l1.3-5.8zM12 17v5"/><circle class="sc-svg-accent" cx="9.2" cy="10.5" r="1"/><circle class="sc-svg-accent" cx="14.8" cy="10.5" r="1"/><path class="sc-svg-accent" d="M4.2 9.5L6 10M19.8 9.5L18 10"/>',36,24,1.85)
    },
    non_rebreather: {
      badge: '85–95%',
      svg: _svg('<path class="sc-svg-primary" d="M7 4.5c1.5-1.5 8.5-1.5 10 0l1 4.5c.2 1.8-2.3 3-6 3s-6.2-1.2-6-3l1-4.5zM12 14.2c2.8 0 4.8 1.8 4.8 4.2A3.6 3.6 0 0 1 13.2 22h-2.4a3.6 3.6 0 0 1-3.6-3.6c0-2.4 2-4.2 4.8-4.2z"/><rect class="sc-svg-accent" x="10.2" y="12" width="3.6" height="2.2" rx="0.6"/><path class="sc-svg-accent" d="M12 16.5v3.2M10.4 18.1h3.2"/>',36,24,1.85)
    },
    hfnc: {
      badge: 'CNAF',
      svg: _svg('<rect class="sc-svg-primary" x="7" y="7" width="10" height="3.2" rx="1.5"/><path class="sc-svg-primary" d="M7 8.6C4.8 9.2 4.5 11.5 6 13.5L9 15.5"/><rect class="sc-svg-primary" x="8.5" y="14.5" width="7" height="6.5" rx="1.4"/><path class="sc-svg-accent" d="M9.5 3.5v3.5M14.5 3.5v3.5M9.5 18.2c.8-.7 1.7.7 2.5 0s1.7.7 2.5 0"/>',36,24,1.85)
    },
    niv: {
      badge: 'BiPAP',
      svg: _svg('<rect class="sc-svg-primary" x="6" y="4" width="12" height="12.5" rx="4.5"/><path class="sc-svg-primary" d="M6 8H3M18 8h3M6 13H3.5M18 13h2.5M12 12.7v6.8a2 2 0 0 0 2 2h3"/><circle class="sc-svg-accent" cx="12" cy="10.5" r="2.3"/>',36,24,1.85)
    },
    bvm: {
      badge: '100%',
      svg: _svg('<path class="sc-svg-primary" d="M3 10.5c1-2.5 3-3.5 4.5-2.5l1.5 2v4l-1.5 2C6 17 4 16 3 13.5zM20.1 12H22"/><ellipse class="sc-svg-primary" cx="15.8" cy="12" rx="4.3" ry="3.4"/><rect class="sc-svg-accent" x="9" y="10.2" width="2.5" height="3.6" rx="0.6"/><path class="sc-svg-accent" d="M14 12h3.6"/>',36,24,1.85)
    },
    ett_vm: {
      badge: 'VM TOT',
      svg: _svg('<path class="sc-svg-primary" d="M15 4v9a4 4 0 0 1-4 4H6M12 4v8a1.5 1.5 0 0 1-1.5 1.5H6M11 4h6"/><ellipse class="sc-svg-accent" cx="13.5" cy="15.5" rx="2.6" ry="1.8"/><path class="sc-svg-accent" d="M4 13.5v4.5"/>',36,24,1.85)
    }
  };

  function ensureO2DeviceGridRendered() {
    if (!O2_DEVICES) return;
    const html = O2_DEVICES.map((d) => {
      const meta = O2_DEVICE_ICONS[d.id] || O2_DEVICE_ICONS.room_air;
      return `
        <button type="button" class="o2-dev-tile" data-o2-device="${d.id}" title="${d.name} — ${d.desc}">
          <span class="o2-tile-icon" aria-hidden="true">${meta.svg}</span>
          <span class="o2-tile-text">
            <strong>${d.shortName}</strong>
            <small class="mono">${meta.badge}</small>
          </span>
        </button>`;
    }).join('');
    ['o2DeviceGrid', 'c1O2DeviceGrid'].forEach((id) => {
      const gridEl = document.getElementById(id);
      if (!gridEl) return;
      if (gridEl.children.length !== O2_DEVICES.length) {
        gridEl.innerHTML = html;
      }
      if (!gridEl.dataset.wired) {
        gridEl.dataset.wired = '1';
        gridEl.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-o2-device]');
          if (!btn) return;
          audio.playUiClick('soft');
          engine.setO2Device(btn.dataset.o2Device);
          syncAirwayO2AndPharmaUI();
        });
      }
    });
  }

  function syncAirwayO2AndPharmaUI() {
    ensureO2DeviceGridRendered();
    const connected = Boolean(engine.airway && engine.airway.connectedToVent);
    const o2Info = engine.getEffectiveO2Info();
    const dev = O2_DEVICE_MAP && O2_DEVICE_MAP[engine.airway ? engine.airway.o2Device : 'room_air'];

    const badge = document.getElementById('airwayStatusBadge');
    const c1Badge = document.getElementById('c1AirwayStatusBadge');
    const btnToggle = document.getElementById('btnVentConnectToggle');
    const c1DiscOverlay = document.getElementById('c1DisconnectedOverlay');
    const o2Box = document.getElementById('o2TherapyBox');

    const airwayIcon = connected ? AIRWAY_BADGE_ICONS.on : AIRWAY_BADGE_ICONS.off;
    if (badge) {
      badge.innerHTML = `<span class="airway-pill-icon" aria-hidden="true">${airwayIcon}</span><span>${connected ? 'EM VM (TOT)' : 'SEM VM'}</span>`;
      badge.className = `airway-pill ${connected ? 'on' : 'off'}`;
    }
    if (c1Badge) {
      c1Badge.innerHTML = `<span class="airway-pill-icon" aria-hidden="true">${airwayIcon}</span><span>${connected ? 'EM VM (TOT)' : 'SEM VM • FORA DA VM'}</span>`;
      c1Badge.className = `airway-pill ${connected ? 'on' : 'off'}`;
    }
    if (btnToggle) {
      btnToggle.setAttribute('aria-pressed', String(connected));
      btnToggle.innerHTML = `<span class="o2-cta-ico" aria-hidden="true">${O2_DEVICE_ICONS.ett_vm.svg}</span><span>${connected ? 'Extubar / Desacoplar da VM' : 'Intubar & Acoplar à VM'}</span>`;
    }
    const c1ConnEl = document.getElementById('c1VentConnectBtn');
    if (c1ConnEl) {
      const ico = c1ConnEl.querySelector('.o2-cta-ico');
      if (ico && !ico.innerHTML) ico.innerHTML = O2_DEVICE_ICONS.ett_vm.svg;
    }
    if (c1DiscOverlay) c1DiscOverlay.classList.toggle('hidden', connected);
    if (o2Box) o2Box.classList.toggle('vm-active', connected);

    const activeMeta = connected ? O2_DEVICE_ICONS.ett_vm : O2_DEVICE_ICONS[dev ? dev.id : 'room_air'] || O2_DEVICE_ICONS.room_air;
    if (activeMeta) {
      ['o2ActiveIcon', 'c1O2ActiveIcon'].forEach((id) => {
        const iconEl = document.getElementById(id);
        if (iconEl) iconEl.innerHTML = activeMeta.svg;
      });
    }

    if (dev) {
      ['o2DeviceGrid', 'c1O2DeviceGrid'].forEach((id) => {
        const gridEl = document.getElementById(id);
        if (!gridEl) return;
        gridEl.querySelectorAll('[data-o2-device]').forEach((tile) => {
          tile.classList.toggle('active', !connected && tile.dataset.o2Device === dev.id);
        });
      });

      const hasRange = !connected && dev.flowMax > dev.flowMin;
      ['o2EffectiveFio2', 'c1O2EffectiveFio2'].forEach((id) => {
        const fio2El = document.getElementById(id);
        if (fio2El) fio2El.textContent = connected ? `VM: FiO₂ ${engine.vent.fio2Set}%` : `FiO₂ ${o2Info.fio2}%`;
      });
      ['o2FlowRow', 'c1O2FlowRow'].forEach((id) => {
        const flowRowEl = document.getElementById(id);
        if (flowRowEl) flowRowEl.classList.toggle('hidden', !hasRange);
      });
      ['o2FlowRange', 'c1O2FlowRange'].forEach((id) => {
        const rangeEl = document.getElementById(id);
        if (rangeEl && hasRange) {
          rangeEl.min = dev.flowMin;
          rangeEl.max = dev.flowMax;
          rangeEl.step = dev.flowStep || 1;
          rangeEl.value = engine.airway.o2Flow;
        }
      });
      ['o2FlowVal', 'c1O2FlowVal'].forEach((id) => {
        const valEl = document.getElementById(id);
        if (valEl) valEl.textContent = `${engine.airway.o2Flow} ${dev.flowUnit}`;
      });
      ['o2DeviceHint', 'c1O2DeviceHint'].forEach((id) => {
        const hintEl = document.getElementById(id);
        if (hintEl) hintEl.textContent = connected ? 'Paciente acoplado à VM — FiO₂ controlada no ventilador.' : dev.desc;
      });
    }

    // Recomendação farmacológica para o caso + ritmo atual
    const adv = (SCENARIO_PHARMA && SCENARIO_PHARMA[engine.scenarioId]) || (SCENARIO_PHARMA && SCENARIO_PHARMA.stable);
    if (adv) {
      const bestEl = document.getElementById('pharmaBestDrugName');
      const ratEl = document.getElementById('pharmaBestRationale');
      const avoidEl = document.getElementById('pharmaAvoidHint');

      let rhythmNote = '';
      const rId = engine.cardiac.rhythm;
      if (rId === 'de_winter' || rId === 'stemi') {
        rhythmNote = ' • ECG Isquêmico: AAS + P2Y12 + Heparina + Cateterismo';
      } else if (rId === 'hyperkalemia') {
        rhythmNote = ' • Hipercalemia: Gluconato de Cálcio 10% imediato!';
      } else if (rId === 'svt') {
        rhythmNote = ' • TPSV: Adenosina 6 mg EV em bolus rápido';
      } else if (rId === 'wpw') {
        rhythmNote = ' • WPW: Evitar bloqueadores nodais (Adenosina/Amiodarona na FA)!';
      } else if (rId === 'av_block_3' || rId === 'sinus_brady') {
        rhythmNote = ' • Bradiarritmia: Atropina 1 mg (sinusal) ou Adrenalina/MP no BAVT';
      }

      if (bestEl) bestEl.textContent = adv.bestDrug;
      if (ratEl) ratEl.textContent = adv.rationale + rhythmNote;
      if (avoidEl) avoidEl.textContent = adv.avoid;
    }
  }

  function toggleVentConnection() {
    audio.playUiClick('hw');
    engine.connectVentilator(!engine.airway.connectedToVent);
    syncAirwayO2AndPharmaUI();
    syncVentControlsUI();
    if (typeof syncAuscultationUI === 'function') syncAuscultationUI();
  }

  const btnVentConnectToggle = document.getElementById('btnVentConnectToggle');
  const c1VentConnectBtn = document.getElementById('c1VentConnectBtn');
  if (btnVentConnectToggle) btnVentConnectToggle.addEventListener('click', toggleVentConnection);
  if (c1VentConnectBtn) c1VentConnectBtn.addEventListener('click', toggleVentConnection);

  ['o2FlowRange', 'c1O2FlowRange'].forEach((id) => {
    const rngEl = document.getElementById(id);
    if (!rngEl) return;
    rngEl.addEventListener('input', (e) => {
      engine.setO2Device(engine.airway.o2Device, Number(e.target.value));
      syncAirwayO2AndPharmaUI();
    });
  });

  const ecgRhythmSelect = document.getElementById('ecgRhythmSelect');
  const ecgRhythmCriteriaEl = document.getElementById('ecgRhythmCriteria');
  const ecgRhythmGridEl = document.getElementById('ecgRhythmGrid');

  const ECG_MINI_PATHS = {
    sinus: 'M2 15 H7 Q9 11 11 15 H14 L15 17 L17 4 L19 19 L21 15 H24 Q27 9 30 15 H37 Q39 11 41 15 H44 L45 17 L47 4 L49 19 L51 15 H54 Q57 9 60 15 H62',
    sinus_tach: 'M2 15 Q4 11 6 15 H8 L9 4 L11 18 L12 15 Q14 10 16 15 H20 Q22 11 24 15 H26 L27 4 L29 18 L30 15 Q32 10 34 15 H38 Q40 11 42 15 H44 L45 4 L47 18 L48 15 Q50 10 52 15 H56 Q58 11 60 15 H62',
    sinus_brady: 'M2 15 H12 Q15 11 18 15 H22 L23 17 L25 4 L27 19 L29 15 H32 Q36 9 40 15 H62',
    afib: 'M2 15 L4 14 L6 16 L8 14 L10 15 L12 4 L14 18 L16 14 L18 16 L20 14 L22 15 L24 4 L26 18 L28 15 L31 14 L34 16 L37 14 L40 16 L43 14 L45 15 L47 4 L49 18 L51 14 L54 16 L58 14 L62 15',
    afib_rvr: 'M2 15 L5 14 L7 4 L9 18 L12 14 L14 16 L16 4 L18 18 L21 14 L24 16 L27 4 L29 18 L32 14 L34 4 L36 18 L39 15 L42 14 L44 4 L46 18 L49 15 L53 14 L55 4 L57 18 L60 14 L62 15',
    aflutter: 'M2 17 L5 11 L7 17 L10 11 L12 17 L15 11 L16 3 L18 19 L20 17 L23 11 L25 17 L28 11 L30 17 L33 11 L35 17 L37 3 L39 19 L41 17 L44 11 L46 17 L49 11 L51 17 L54 11 L56 17 L58 3 L60 19 L62 17',
    svt: 'M2 15 H5 L6 4 L8 18 L9 15 H12 L13 4 L15 18 L16 15 H19 L20 4 L22 18 L23 15 H26 L27 4 L29 18 L30 15 H33 L34 4 L36 18 L37 15 H40 L41 4 L43 18 L44 15 H47 L48 4 L50 18 L51 15 H54 L55 4 L57 18 L58 15 H62',
    wpw: 'M2 15 H7 Q9 11 11 15 L15 4 L18 18 L20 15 Q23 18 26 15 H36 Q38 11 40 15 L44 4 L47 18 L49 15 Q52 18 55 15 H62',
    av_block_1: 'M2 15 H4 Q7 10 10 15 H21 L22 17 L24 4 L26 19 L28 15 Q31 9 34 15 H38 Q41 10 44 15 H55 L56 4 L58 19 L60 15 H62',
    av_block_2_m1: 'M2 15 Q4 11 6 15 H9 L11 4 L13 18 L15 15 H20 Q22 11 24 15 H32 L34 4 L36 18 L38 15 H43 Q45 11 47 15 H62',
    av_block_2_m2: 'M2 15 Q4 11 6 15 H10 L12 4 L14 18 L16 15 H21 Q23 11 25 15 H29 L31 4 L33 18 L35 15 H41 Q43 11 45 15 H55 Q57 11 59 15 H62',
    av_block_3: 'M2 15 Q4 11 6 15 H10 L13 5 L16 19 L19 15 Q21 11 23 15 H31 Q33 11 35 15 H41 Q43 11 45 15 L48 5 L51 19 L54 15 Q56 11 58 15 H62',
    rbbb: 'M2 15 H7 Q9 11 11 15 H15 L17 5 L19 14 L22 6 L25 18 L28 15 Q31 11 34 15 H40 Q42 11 44 15 H47 L49 5 L51 14 L54 6 L57 18 L60 15 H62',
    lbbb: 'M2 15 H7 Q9 11 11 15 H14 L16 5 L19 7 L21 5 L24 18 Q28 20 32 15 H39 Q41 11 43 15 H46 L48 5 L51 7 L53 5 L56 18 Q59 20 62 15',
    vtach: 'M2 16 Q6 3 10 16 Q13 21 16 16 Q20 3 24 16 Q27 21 30 16 Q34 3 38 16 Q41 21 44 16 Q48 3 52 16 Q55 21 58 16 L62 10',
    torsades: 'M2 13 L5 10 L7 16 L10 7 L13 19 L16 5 L19 20 L22 9 L25 15 L28 11 L31 14 L34 8 L37 18 L40 4 L43 21 L46 6 L49 18 L52 10 L55 15 L58 11 L62 13',
    vf: 'M2 14 L5 9 L8 17 L11 7 L14 15 L17 11 L20 19 L23 6 L26 16 L29 10 L32 18 L35 8 L38 14 L41 19 L44 6 L47 16 L50 9 L53 18 L56 10 L59 15 L62 12',
    pea: 'M2 15 H10 L12 6 L14 18 L16 15 H36 L38 6 L40 18 L42 15 H62',
    asystole: 'M2 14 H22 L24 13.4 L26 14.3 L28 14 H62',
    stemi: 'M2 15 H8 Q10 11 12 15 H15 L17 4 L19 9 Q23 5 28 15 H36 Q38 11 40 15 H43 L45 4 L47 9 Q51 5 56 15 H62',
    de_winter: 'M2 15 H8 Q10 12 12 15 H15 L17 5 L19 19 L22 17 Q26 4 30 15 H37 Q39 12 41 15 H44 L46 5 L48 19 L51 17 Q55 4 59 15 H62',
    hyperkalemia: 'M2 15 H11 L13 17 L15 6 L17 18 L20 15 L23 3 L26 15 H39 L41 17 L43 6 L45 18 L48 15 L51 3 L54 15 H62',
    paced: 'M2 15 H11 L11.5 3 L12 17 L15 5 L18 19 Q22 20 26 15 H38 L38.5 3 L39 17 L42 5 L45 19 Q49 20 53 15 H62'
  };

  function escapeHtmlAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ensureEcgRhythmGridRendered() {
    if (!ecgRhythmGridEl || !ECG_RHYTHMS || ecgRhythmGridEl.children.length === ECG_RHYTHMS.length) return;
    ecgRhythmGridEl.innerHTML = ECG_RHYTHMS.map((r) => {
      const d = ECG_MINI_PATHS[r.id] || ECG_MINI_PATHS.sinus;
      const tone = r.shockable || r.pulseless ? 'crit' : r.stDefault !== 0 || r.category === 'Bloqueios AV' || r.category === 'Bloqueios de Ramo' ? 'warn' : 'norm';
      const tip = escapeHtmlAttr(`${r.name} — ${r.criteria}`);
      return `
        <button type="button" class="ecg-rhythm-tile tone-${tone}" data-ecg-rhythm="${r.id}" title="${tip}">
          <span class="ecg-tile-wave" aria-hidden="true">
            <svg viewBox="0 0 64 24" width="60" height="22" fill="none">
              <path d="${d}" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="ecg-tile-lbl">${r.shortLabel}</span>
        </button>`;
    }).join('');
    ecgRhythmGridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ecg-rhythm]');
      if (!btn) return;
      audio.playUiClick('soft');
      engine.setRhythm(btn.dataset.ecgRhythm);
      refreshScenarioUI();
    });
  }

  function syncRhythmUI() {
    ensureEcgRhythmGridRendered();
    const rId = engine.cardiac.rhythm || 'sinus';
    const meta = ECG_RHYTHM_MAP && ECG_RHYTHM_MAP[rId];
    if (ecgRhythmSelect && ecgRhythmSelect.value !== rId) {
      ecgRhythmSelect.value = rId;
    }
    if (ecgRhythmGridEl) {
      ecgRhythmGridEl.querySelectorAll('[data-ecg-rhythm]').forEach((tile) => {
        tile.classList.toggle('active', tile.dataset.ecgRhythm === rId);
      });
    }
    if (ecgRhythmCriteriaEl && meta) {
      ecgRhythmCriteriaEl.textContent = meta.criteria;
    }
  }

  if (ecgRhythmSelect) {
    ecgRhythmSelect.addEventListener('change', (e) => {
      audio.playUiClick('soft');
      engine.setRhythm(e.target.value);
      refreshScenarioUI();
    });
  }

  document.getElementById('btnResetScenario').addEventListener('click', () => {
    engine.loadScenario(engine.scenarioId);
    resetEquipmentOnScenarioChange();
    refreshScenarioUI();
  });

  document.getElementById('btnFluidBolus').addEventListener('click', () => {
    engine.giveFluidBolus();
    $txt('fluidCount', engine.interventions.fluidBoluses);
  });

  document.getElementById('btnBronchodilator').addEventListener('click', () => {
    engine.giveBronchodilator();
  });

  document.getElementById('btnSuctionRecruit').addEventListener('click', () => {
    engine.suctionAndRecruit();
    syncPhysiologyModalInputs();
  });

  btnDecompress.addEventListener('click', () => {
    engine.decompressChest();
    refreshScenarioUI();
  });

  btnCprToggle.addEventListener('click', () => {
    const active = engine.toggleCpr();
    btnCprToggle.setAttribute('aria-pressed', String(active));
  });

  btnDefib.addEventListener('click', () => {
    const res = engine.defibrillate({ energyJ: 200, sync: false });
    if (res && res.delivered) audio.playDefibChargeAndShock();
    handleCrossDeviceShock(res, 200);
  });

  if (btnPericardiocentesis) {
    btnPericardiocentesis.addEventListener('click', () => {
      audio.playUiClick('hw');
      engine.performPericardiocentesis();
      refreshScenarioUI();
    });
  }
  if (btnThrombolysis) {
    btnThrombolysis.addEventListener('click', () => {
      audio.playUiClick('hw');
      engine.giveThrombolysis();
      refreshScenarioUI();
    });
  }
  if (btnPronePosition) {
    btnPronePosition.addEventListener('click', () => {
      audio.playUiClick('hw');
      const on = engine.togglePronePosition();
      btnPronePosition.setAttribute('aria-pressed', String(on));
      refreshScenarioUI();
    });
  }
  if (btnActiveWarming) {
    btnActiveWarming.addEventListener('click', () => {
      audio.playUiClick('hw');
      const on = engine.toggleActiveWarming();
      btnActiveWarming.setAttribute('aria-pressed', String(on));
      refreshScenarioUI();
    });
  }
  if (btnSyncCardioversion) {
    btnSyncCardioversion.addEventListener('click', () => {
      const res = engine.defibrillate({ energyJ: 100, sync: true });
      if (res && res.delivered) audio.playDefibChargeAndShock();
      handleCrossDeviceShock(res, 100);
    });
  }
  if (btnTransfusion) {
    btnTransfusion.addEventListener('click', () => {
      audio.playUiClick('hw');
      const count = engine.giveBloodTransfusion();
      $txt('bloodCount', count);
      refreshScenarioUI();
    });
  }
  if (btnActiveCooling) {
    btnActiveCooling.addEventListener('click', () => {
      audio.playUiClick('hw');
      const on = engine.toggleActiveCooling();
      btnActiveCooling.setAttribute('aria-pressed', String(on));
      refreshScenarioUI();
    });
  }
  if (btnTranscutPacer) {
    btnTranscutPacer.addEventListener('click', () => {
      audio.playUiClick('hw');
      const on = engine.toggleQuickPacer(70);
      btnTranscutPacer.setAttribute('aria-pressed', String(on));
      if (vivoGold && vivoGold.syncPacerFromEngine) vivoGold.syncPacerFromEngine();
      refreshScenarioUI();
    });
  }
  if (btnOsmotherapy) {
    btnOsmotherapy.addEventListener('click', () => {
      audio.playUiClick('hw');
      engine.giveOsmotherapy();
      refreshScenarioUI();
    });
  }
  if (btnHydrocortisone) {
    btnHydrocortisone.addEventListener('click', () => {
      audio.playUiClick('hw');
      engine.giveHydrocortisone();
      refreshScenarioUI();
    });
  }
  if (btnInsulinDrip) {
    btnInsulinDrip.addEventListener('click', () => {
      audio.playUiClick('hw');
      const on = engine.toggleInsulinTherapy();
      btnInsulinDrip.setAttribute('aria-pressed', String(on));
      refreshScenarioUI();
    });
  }
  if (btnUterotonic) {
    btnUterotonic.addEventListener('click', () => {
      audio.playUiClick('hw');
      engine.giveUterotonicTxa();
      refreshScenarioUI();
    });
  }

  // ================= CONTROLES GLOBAIS & MONITOR =================
  const btnFreeze = document.getElementById('btnFreeze');
  btnFreeze.addEventListener('click', () => {
    isFrozen = !isFrozen;
    monitor.setFrozen(isFrozen);
    btnFreeze.setAttribute('aria-pressed', String(isFrozen));
    btnFreeze.textContent = isFrozen ? '▶' : '❄';
    btnFreeze.title = isFrozen ? 'Retomar traçados em tempo real' : 'Congelar traçados para inspeção';
    addLog(isFrozen ? 'Traçados congelados para análise' : 'Traçados retomados em tempo real');
  });

  const btnSilenceAlarm = document.getElementById('btnSilenceAlarm');
  btnSilenceAlarm.addEventListener('click', () => {
    const nextSilenced = !audio.isSilenced();
    audio.setAlarmSilenced(nextSilenced);
    btnSilenceAlarm.setAttribute('aria-pressed', String(nextSilenced));
    btnSilenceAlarm.textContent = nextSilenced ? '🔕' : '🔔';
    btnSilenceAlarm.title = nextSilenced ? 'Alarmes silenciados por 2 minutos (clique para reativar)' : 'Silenciar alarmes por 2 minutos';
  });

  const btnQrsBeep = document.getElementById('btnQrsBeep');
  btnQrsBeep.addEventListener('click', () => {
    const next = !audio.qrsEnabled;
    audio.setQrsEnabled(next);
    btnQrsBeep.setAttribute('aria-pressed', String(next));
  });

  // Ausculta Pulmonar (Estetoscópio Ao Vivo) + Botão Ligar/Desligar Sons Pulmonares
  const btnAuscultation = document.getElementById('btnAuscultation');
  const btnLungSoundsToggle = document.getElementById('btnLungSoundsToggle');
  const auscPanel = document.getElementById('auscultationPanel');
  const btnAuscToggleAudio = document.getElementById('btnAuscToggleAudio');
  const auscFindingEl = document.getElementById('auscFindingText');
  const auscMeterFillEl = document.getElementById('auscMeterFill');

  function syncAuscultationUI() {
    const active = audio.auscultationEnabled;
    const panelOpen = auscPanel ? !auscPanel.classList.contains('hidden') : false;
    if (btnAuscultation) btnAuscultation.setAttribute('aria-pressed', String(panelOpen));
    if (btnLungSoundsToggle) {
      btnLungSoundsToggle.setAttribute('aria-pressed', String(active));
      btnLungSoundsToggle.textContent = '🫁';
      btnLungSoundsToggle.title = active
        ? 'Sons pulmonares LIGADOS (clique para desligar)'
        : 'Sons pulmonares DESLIGADOS (clique para ligar)';
    }
    if (btnAuscToggleAudio) {
      btnAuscToggleAudio.setAttribute('aria-pressed', String(active));
      btnAuscToggleAudio.textContent = active
        ? '🔇 Sons Pulmonares: LIGADOS (Desligar)'
        : '🔊 Sons Pulmonares: DESLIGADOS (Ligar)';
    }
    const prof = audio.getAuscultationProfile(engine);
    if (auscFindingEl) auscFindingEl.textContent = prof.text;
  }

  function toggleLungSounds() {
    audio.playUiClick('soft');
    const next = !audio.auscultationEnabled;
    audio.setAuscultationEnabled(next);
    syncAuscultationUI();
    addLog(next ? 'Sons pulmonares LIGADOS (Ausculta ao vivo)' : 'Sons pulmonares DESLIGADOS (Silenciados)');
  }

  if (btnLungSoundsToggle) {
    btnLungSoundsToggle.addEventListener('click', toggleLungSounds);
  }

  if (btnAuscultation && auscPanel) {
    btnAuscultation.addEventListener('click', () => {
      audio.playUiClick('soft');
      const isHidden = auscPanel.classList.contains('hidden');
      if (isHidden) {
        auscPanel.classList.remove('hidden');
        if (!audio.auscultationEnabled) {
          audio.setAuscultationEnabled(true);
          addLog('Sons pulmonares LIGADOS (Ausculta ao vivo)');
        }
      } else {
        auscPanel.classList.add('hidden');
      }
      syncAuscultationUI();
    });
  }

  document.getElementById('btnCloseAuscPanel').addEventListener('click', () => {
    audio.playUiClick('soft');
    auscPanel.classList.add('hidden');
    syncAuscultationUI();
  });

  if (btnAuscToggleAudio) {
    btnAuscToggleAudio.addEventListener('click', toggleLungSounds);
  }

  document.querySelectorAll('.ausc-spot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.playUiClick('soft');
      audio.setAuscultationSite(btn.dataset.site);
      document.querySelectorAll('.ausc-spot-btn').forEach((b) => b.classList.toggle('active', b === btn));
      syncAuscultationUI();
      addLog(`Foco de ausculta: ${btn.textContent.trim()}`);
    });
  });

  document.getElementById('ecgLeadSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    monitor.setLead(val);
    const label = val === 'V5' ? 'V5' : `D${val}`;
    document.getElementById('ecgLeadTag').textContent = `${label} • 25 mm/s`;
    const waveTag = document.getElementById('ecgWaveLeadTag');
    if (waveTag) waveTag.textContent = `${val}   X1   Diagnostic`;
  });

  function triggerAnimatedNibp() {
    if (mrStandby) return;
    audio.playUiClick('nibp');
    const busyEl = document.getElementById('mrNibpBusy');
    if (busyEl) busyEl.classList.remove('hidden');
    setTimeout(() => {
      if (busyEl) busyEl.classList.add('hidden');
      engine.triggerNibp();
      audio.playUiClick('soft');
    }, 950);
  }

  document.getElementById('btnNibpMeasure').addEventListener('click', triggerAnimatedNibp);

  // Botões físicos & softkeys do Mindray iMEC 15
  document.getElementById('mrHwSilence').addEventListener('click', () => {
    audio.playUiClick('silence');
    btnSilenceAlarm.click();
  });
  document.getElementById('mrHwPause').addEventListener('click', () => {
    if (mrStandby) return;
    audio.playUiClick('silence');
    if (!audio.isSilenced()) {
      audio.setAlarmSilenced(true);
      btnSilenceAlarm.setAttribute('aria-pressed', 'true');
      btnSilenceAlarm.textContent = '🔕';
      btnSilenceAlarm.title = 'Alarmes silenciados por 2 minutos (clique para reativar)';
      addLog('Mindray iMEC 15: Pausa de alarmes ativada por 2 minutos');
    } else {
      audio.setAlarmSilenced(false);
      btnSilenceAlarm.setAttribute('aria-pressed', 'false');
      btnSilenceAlarm.textContent = '🔔';
      btnSilenceAlarm.title = 'Silenciar alarmes por 2 minutos';
      addLog('Mindray iMEC 15: Pausa de alarmes encerrada manualmente');
    }
    updateNumericUI();
  });
  document.getElementById('mrHwFreeze').addEventListener('click', () => {
    audio.playUiClick('hw');
    btnFreeze.click();
  });
  document.getElementById('mrHwNibp').addEventListener('click', triggerAnimatedNibp);
  document.getElementById('mrHwRecord').addEventListener('click', () => {
    audio.playUiClick('hw');
    document.getElementById('btnAbgModal').click();
  });
  document.getElementById('mrHwMenu').addEventListener('click', () => {
    if (mrStandby) return;
    audio.playUiClick('hw');
    document.getElementById('btnAlarmLimits').click();
    addLog('Mindray iMEC 15: Menu de Configuração & Alarmes aberto');
  });
  document.getElementById('mrBtnMainMenu').addEventListener('click', () => {
    if (mrStandby) return;
    audio.playUiClick('soft');
    focusSidebarPatientSection();
    addLog('Mindray Main Menu: Painel Paciente & Fisiologia destacado');
  });
  document.getElementById('mrPowerBtn').addEventListener('click', () => setMrStandby(!mrStandby));
  document.getElementById('mrWakeBtn').addEventListener('click', () => setMrStandby(false));

  function cycleMindrayTrimKnob(dir = 1) {
    if (mrStandby) return;
    audio.playUiClick('knob');
    mrKnobAngle += dir * 45;
    const knob = document.getElementById('mrTrimKnob');
    if (knob) knob.style.transform = `rotate(${mrKnobAngle}deg)`;
    const sel = document.getElementById('ecgLeadSelect');
    const order = ['II', 'V5', 'I'];
    const nextIdx = (order.indexOf(sel.value) + (dir > 0 ? 1 : 2)) % order.length;
    const next = order[nextIdx];
    sel.value = next;
    sel.dispatchEvent(new Event('change'));
    addLog(`Mindray Trim Knob: Derivação alterada para ${next === 'V5' ? 'V5' : 'D' + next}`);
  }

  document.getElementById('mrTrimKnob').addEventListener('click', () => cycleMindrayTrimKnob(1));
  document.getElementById('mrTrimKnob').addEventListener('wheel', (e) => {
    e.preventDefault();
    cycleMindrayTrimKnob(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // ================= MODAIS =================
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((el) => el.classList.add('hidden'));
    if (auscPanel && !auscPanel.classList.contains('hidden')) {
      auscPanel.classList.add('hidden');
      syncAuscultationUI();
    }
    closeAllHamOverlays();
    if (vivoGold && vivoGold.patientDrawerOpen) {
      vivoGold.patientDrawerOpen = false;
      vivoGold.syncUI();
    }
  });

  // Modal Gasometria Arterial
  function renderABG() {
    const abg = engine.getABG();
    const phNum = Number(abg.ph);
    const cells = [
      {
        name: 'pH (7.35–7.45)',
        val: abg.ph,
        cls: phNum < 7.20 || phNum > 7.55 ? 'critical' : phNum < 7.35 || phNum > 7.45 ? 'abnormal' : ''
      },
      {
        name: 'PaCO₂ (35–45 mmHg)',
        val: `${abg.paco2} mmHg`,
        cls: abg.paco2 > 55 || abg.paco2 < 25 ? 'critical' : abg.paco2 > 45 || abg.paco2 < 35 ? 'abnormal' : ''
      },
      {
        name: 'PaO₂ (80–100 mmHg)',
        val: `${abg.pao2} mmHg`,
        cls: abg.pao2 < 60 ? 'critical' : abg.pao2 < 80 ? 'abnormal' : ''
      },
      {
        name: 'HCO₃⁻ (22–26 mEq/L)',
        val: `${abg.hco3} mEq/L`,
        cls: Number(abg.hco3) < 16 ? 'critical' : Number(abg.hco3) < 22 || Number(abg.hco3) > 26 ? 'abnormal' : ''
      },
      {
        name: 'Relação PaO₂/FiO₂',
        val: `${abg.pf} (FiO₂ ${abg.fio2Pct}%)`,
        cls: abg.pf < 100 ? 'critical' : abg.pf < 300 ? 'abnormal' : ''
      },
      {
        name: 'Lactato (< 2.0 mmol/L)',
        val: `${abg.lactate} mmol/L`,
        cls: Number(abg.lactate) >= 4.0 ? 'critical' : Number(abg.lactate) >= 2.0 ? 'abnormal' : ''
      }
    ];

    document.getElementById('abgContent').innerHTML = cells
      .map(
        (c) => `
      <div class="abg-cell ${c.cls}">
        <div class="abg-name">${c.name}</div>
        <div class="abg-val">${c.val}</div>
      </div>`
      )
      .join('');

    // Interpretação automática e sugestão de conduta
    const analyzeFn = window.ICUSim && window.ICUSim.analyzeAcidBase;
    const abAnalysis = analyzeFn
      ? analyzeFn({
          ph: phNum,
          pco2: abg.paco2,
          hco3: abg.hco3,
          be: abg.be,
          po2: abg.pao2,
          so2: abg.sao2,
          lac: abg.lactate
        })
      : {
          interp:
            phNum < 7.35
              ? abg.paco2 > 45
                ? 'Acidose respiratória'
                : 'Acidose metabólica'
              : phNum > 7.45
              ? abg.paco2 < 35
                ? 'Alcalose respiratória'
                : 'Alcalose metabólica'
              : 'Equilíbrio ácido-base normal',
          conduct: ''
        };

    const parts = [abAnalysis.interp];
    if (abg.pf < 100) parts.push('Hipoxemia grave (P/F < 100 — padrão SDRA grave)');
    else if (abg.pf < 200) parts.push('Hipoxemia moderada (P/F 100–200)');
    else if (abg.pf < 300) parts.push('Troca gasosa comprometida (P/F < 300)');
    else parts.push('Oxigenação adequada (P/F ≥ 300)');

    document.getElementById('abgInterpretation').innerHTML =
      `<strong>Interpretação:</strong> ${parts.join(' • ')}.${abAnalysis.conduct ? `<br/><strong>Sugestão de conduta:</strong> ${abAnalysis.conduct}` : ''}`;
  }

  document.getElementById('btnAbgModal').addEventListener('click', () => {
    renderABG();
    openModal('modalABG');
    addLog('Gasometria arterial coletada');
  });
  document.getElementById('btnRefreshAbg').addEventListener('click', renderABG);

  // Modal: Guia de Ventilação Mecânica Protetora
  let modalProtIdx = 1;
  function renderProtectiveGuideModal() {
    const body = document.getElementById('protModalBody');
    const pillars = window.ICUSim.PROTECTIVE_PILLARS || [];
    const protocols = window.ICUSim.PROTECTIVE_PROTOCOLS || [];
    const active = protocols[modalProtIdx] || protocols[0];
    if (!body || !active) return;

    body.innerHTML = `
      <div class="prot-pillars-strip">
        ${pillars
          .map(
            (pil) => `
          <div class="prot-pillar-mini" title="${pil.why}">
            <strong>${pil.title}</strong>
            <span class="mono">${pil.target}</span>
            <small>${pil.why}</small>
          </div>`
          )
          .join('')}
      </div>
      <div class="prot-interactive-grid">
        <div class="prot-list">
          ${protocols
            .map(
              (item, idx) => `
            <button type="button" class="prot-item-btn ${idx === modalProtIdx ? 'active' : ''}" data-modal-prot="${idx}">
              <span class="m-sev ${item.sevClass}">${item.severity}</span>
              <strong>${item.name}</strong>
            </button>`
            )
            .join('')}
        </div>
        <div class="prot-detail-card">
          <div class="prot-detail-head">
            <div>
              <span class="m-sev ${active.sevClass}">${active.severity}</span>
              <h4>${active.name}</h4>
            </div>
            <button type="button" class="ctrl-btn accent" id="btnLoadProtScenario" data-load-sc="${active.id}">▶ Carregar Cenário</button>
          </div>
          <div class="prot-params-grid">
            <div class="prot-param"><span>Modo Preferencial</span><strong>${active.mode}</strong></div>
            <div class="prot-param"><span>Vt (Peso Predito)</span><strong class="mono">${active.vt}</strong></div>
            <div class="prot-param"><span>PEEP Indicada</span><strong class="mono">${active.peep}</strong></div>
            <div class="prot-param"><span>FR &amp; Relação I:E</span><strong class="mono">${active.frIe}</strong></div>
            <div class="prot-param"><span>Limites de Pressão</span><strong class="mono">${active.pressures}</strong></div>
            <div class="prot-param"><span>Alvos Gasométricos</span><strong class="mono">${active.gasTargets}</strong></div>
          </div>
          <div class="clinical-pearl">
            📋 <strong>Indicações &amp; Conduta:</strong> ${active.indications}
          </div>
        </div>
      </div>
    `;

    body.querySelectorAll('[data-modal-prot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiClick('soft');
        modalProtIdx = Number(btn.dataset.modalProt);
        renderProtectiveGuideModal();
      });
    });

    const loadBtn = document.getElementById('btnLoadProtScenario');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        audio.playUiClick('soft');
        engine.loadScenario(loadBtn.dataset.loadSc);
        refreshScenarioUI();
        closeModal('modalProtectiveGuide');
      });
    }
  }

  document.getElementById('btnProtectiveGuide').addEventListener('click', () => {
    audio.playUiClick('soft');
    renderProtectiveGuideModal();
    openModal('modalProtectiveGuide');
  });

  // Modal: Atlas & Seletor de Ritmos ECG
  function renderEcgAtlasModal() {
    const body = document.getElementById('ecgAtlasBody');
    if (!body || !ECG_RHYTHMS) return;
    const currentId = engine.cardiac.rhythm || 'sinus';
    const categories = [...new Set(ECG_RHYTHMS.map((r) => r.category))];

    body.innerHTML = categories
      .map((cat) => {
        const items = ECG_RHYTHMS.filter((r) => r.category === cat);
        return `
          <div class="ecg-cat-group">
            <h4 class="ecg-cat-title">${cat}</h4>
            <div class="ecg-cards-grid">
              ${items
                .map((r) => {
                  const active = r.id === currentId;
                  const badge = r.pulseless
                    ? '<span class="m-sev critical">PCR</span>'
                    : r.id === 'av_block_3' || r.id === 'vtach' || r.id === 'stemi' || r.id === 'de_winter' || r.id === 'hyperkalemia'
                    ? '<span class="m-sev severe">ALERTA</span>'
                    : r.id.startsWith('av_block') || r.id === 'rbbb' || r.id === 'lbbb' || r.id.startsWith('afib') || r.id === 'aflutter' || r.id === 'svt' || r.id === 'wpw' || r.id === 'paced'
                    ? '<span class="m-sev moderate">ARRITMIA/BLOQ</span>'
                    : '<span class="m-sev stable">BASAL</span>';
                  return `
                    <div class="ecg-rhythm-card ${active ? 'active' : ''}">
                      <div class="ecg-card-top">
                        <div>
                          ${badge}
                          <strong>${r.name}</strong>
                        </div>
                        <span class="mono ecg-hr-chip">${r.defaultHr > 0 ? r.defaultHr + ' bpm' : '0 bpm'}</span>
                      </div>
                      <p class="ecg-card-criteria">${r.criteria}</p>
                      <button type="button" class="ctrl-btn ${active ? 'ghost' : 'accent'} ecg-apply-btn" data-apply-rhythm="${r.id}">
                        ${active ? '✓ Ativo no Monitor' : '▶ Aplicar Traçado'}
                      </button>
                    </div>`;
                })
                .join('')}
            </div>
          </div>`;
      })
      .join('');

    body.querySelectorAll('[data-apply-rhythm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiClick('soft');
        engine.setRhythm(btn.dataset.applyRhythm);
        refreshScenarioUI();
        closeModal('modalEcgAtlas');
      });
    });
  }

  function openEcgAtlas() {
    audio.playUiClick('soft');
    renderEcgAtlasModal();
    openModal('modalEcgAtlas');
  }

  const btnEcgAtlas = document.getElementById('btnEcgAtlas');
  const btnOpenEcgAtlasSide = document.getElementById('btnOpenEcgAtlasSide');
  const rhythmLabelEl = document.getElementById('rhythmLabel');
    if (btnEcgAtlas) btnEcgAtlas.addEventListener('click', openEcgAtlas);
  if (btnOpenEcgAtlasSide) btnOpenEcgAtlasSide.addEventListener('click', openEcgAtlas);
  if (rhythmLabelEl) rhythmLabelEl.addEventListener('click', openEcgAtlas);

  const btnPumpIcatu = document.getElementById('btnPumpIcatu');
  const icatuChassisEl = document.getElementById('icatuChassis');
  const icatuChassis2El = document.getElementById('icatuChassis2');
  if (btnPumpIcatu && icatuChassisEl) {
    btnPumpIcatu.addEventListener('click', () => {
      audio.playUiClick('soft');
      const hidden = icatuChassisEl.classList.toggle('hidden');
      if (icatuChassis2El) icatuChassis2El.classList.toggle('hidden', hidden);
      btnPumpIcatu.classList.toggle('active', !hidden);
      if (hidden && icuGridEl && icuGridEl.classList.contains('only-pump')) {
        setDeviceLayout('50-50');
      } else if (!hidden) {
        applyDeviceSizing();
        icatuChassisEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const btnCardioverter = document.getElementById('btnCardioverter');
  const vgChassisEl = document.getElementById('vgChassis');
  if (btnCardioverter && vgChassisEl) {
    btnCardioverter.addEventListener('click', () => {
      audio.playUiClick('soft');
      const hidden = vgChassisEl.classList.toggle('hidden');
      btnCardioverter.classList.toggle('active', !hidden);
      if (hidden && icuGridEl && icuGridEl.classList.contains('only-cardio')) {
        setDeviceLayout('50-50');
      } else if (!hidden) {
        applyDeviceSizing();
        if (vivoGold) vivoGold.resize();
        vgChassisEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const btnGasSg1 = document.getElementById('btnGasSg1');
  const sg1ChassisEl = document.getElementById('sg1Chassis');
  const sideSectionSg1El = document.getElementById('sideSectionSg1');
  if (btnGasSg1 && sg1ChassisEl) {
    btnGasSg1.addEventListener('click', () => {
      audio.playUiClick('soft');
      const hidden = sg1ChassisEl.classList.toggle('hidden');
      if (sideSectionSg1El) sideSectionSg1El.classList.toggle('hidden', hidden);
      btnGasSg1.classList.toggle('active', !hidden);
      if (hidden && icuGridEl && icuGridEl.classList.contains('only-sg1')) {
        setDeviceLayout('50-50');
      } else if (!hidden) {
        const ws = document.getElementById('simWorkspace');
        const tBtn = document.getElementById('btnToggleSidebar');
        if (ws && ws.classList.contains('sidebar-collapsed')) {
          ws.classList.remove('sidebar-collapsed');
          if (tBtn) tBtn.setAttribute('aria-pressed', 'true');
        }
        applyDeviceSizing();
        if (sg1Analyzer && sg1Analyzer.resize) sg1Analyzer.resize();
        sg1ChassisEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Modal Fisiologia
  const PHYS_KNOB_ARC_LEN = 117.81;

  function renderPhysKnob(id, rawVal) {
    const dial = document.getElementById(id);
    if (!dial) return;
    const min = Number(dial.dataset.min);
    const max = Number(dial.dataset.max);
    const step = Number(dial.dataset.step) || 1;
    const clamped = Math.max(min, Math.min(max, Math.round(Number(rawVal) / step) * step));
    dial.dataset.value = String(clamped);
    dial.setAttribute('aria-valuenow', String(clamped));
    const frac = max > min ? (clamped - min) / (max - min) : 0;
    const deg = (-135 + frac * 270).toFixed(1);
    const cap = dial.querySelector('.phys-knob-cap');
    if (cap) cap.style.transform = `rotate(${deg}deg)`;
    const arc = dial.querySelector('.phys-knob-arc');
    if (arc) arc.setAttribute('stroke-dasharray', `${(frac * PHYS_KNOB_ARC_LEN).toFixed(2)} 157.08`);
    const unit = dial.dataset.unit || '';
    const valEl = document.getElementById(`${id}Val`);
    if (valEl) valEl.textContent = `${clamped}${unit}`;
  }

  function syncPhysiologyModalInputs() {
    const p = engine.patient;
    renderPhysKnob('physWeight', Math.round(p.weightKg));
    renderPhysKnob('physComp', Math.round(p.compliance));
    renderPhysKnob('physRes', Math.round(p.resistance));
    renderPhysKnob('physShunt', Math.round(p.shunt * 100));
    renderPhysKnob('physDrive', Math.round(p.intrinsicDrive));
    renderPhysKnob('physBe', Math.round(p.baseExcess));
  }

  function focusSidebarPatientSection() {
    const ws = document.getElementById('simWorkspace');
    const toggleBtn = document.getElementById('btnToggleSidebar');
    if (ws && ws.classList.contains('sidebar-collapsed')) {
      ws.classList.remove('sidebar-collapsed');
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
      applyDeviceSizing();
    }
    const sec = document.getElementById('sideSectionPatient');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      sec.classList.add('highlight-flash');
      setTimeout(() => sec.classList.remove('highlight-flash'), 900);
    }
  }

  // Toggle Menu Lateral Esquerdo
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      audio.playUiClick('soft');
      const ws = document.getElementById('simWorkspace');
      const collapsed = ws.classList.toggle('sidebar-collapsed');
      btnToggleSidebar.setAttribute('aria-pressed', String(!collapsed));
      applyDeviceSizing();
    });
  }

  // Alternância Modo Claro (Quente padrão) / Modo Escuro (Sincronizado)
  const btnThemePres = document.getElementById('btnThemePres');
  const btnThemeSim = document.getElementById('btnThemeSim');
  let currentTheme = 'light';
  try {
    currentTheme = localStorage.getItem('uticomed_warm_theme') || 'light';
  } catch (_) {}

  function applyTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    const isLight = currentTheme === 'light';
    document.body.classList.toggle('theme-light', isLight);
    const label = isLight ? '🌙 Modo Escuro' : '☀️ Modo Claro';
    if (btnThemePres) btnThemePres.textContent = label;
    if (btnThemeSim) {
      btnThemeSim.textContent = currentTheme === 'light' ? '🌙' : '☀';
      btnThemeSim.title = label;
    }
    try {
      localStorage.setItem('uticomed_warm_theme', currentTheme);
    } catch (_) {}
  }

  function toggleTheme() {
    audio.playUiClick('soft');
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  }

  if (btnThemePres) btnThemePres.addEventListener('click', toggleTheme);
  if (btnThemeSim) btnThemeSim.addEventListener('click', toggleTheme);
  applyTheme(currentTheme);

  const physKnobSetters = {};
  const bindPhys = (id, _labelId, _suffix, setter) => {
    const dial = document.getElementById(id);
    if (!dial) return;
    physKnobSetters[id] = setter;

    const applyKnobVal = (nextRaw) => {
      const min = Number(dial.dataset.min);
      const max = Number(dial.dataset.max);
      const step = Number(dial.dataset.step) || 1;
      const next = Math.max(min, Math.min(max, Math.round(nextRaw / step) * step));
      const cur = Number(dial.dataset.value);
      if (next !== cur) {
        renderPhysKnob(id, next);
        setter(next);
      }
    };

    let dragging = false;
    let startY = 0;
    let startVal = Number(dial.dataset.value || 0);

    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.focus();
      dragging = true;
      startY = e.clientY;
      startVal = Number(dial.dataset.value || 0);
      dial.classList.add('dragging');
      if (dial.setPointerCapture) dial.setPointerCapture(e.pointerId);
    });

    dial.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const min = Number(dial.dataset.min);
      const max = Number(dial.dataset.max);
      const span = Math.max(1, max - min);
      const dy = startY - e.clientY;
      const delta = (dy / 110) * span;
      applyKnobVal(startVal + delta);
    });

    const endKnobDrag = () => {
      if (!dragging) return;
      dragging = false;
      dial.classList.remove('dragging');
      audio.playUiClick('knob');
    };
    dial.addEventListener('pointerup', endKnobDrag);
    dial.addEventListener('pointercancel', endKnobDrag);

    dial.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = Number(dial.dataset.step) || 1;
      const cur = Number(dial.dataset.value || 0);
      audio.playUiClick('knob');
      applyKnobVal(cur + (e.deltaY < 0 ? step : -step));
    }, { passive: false });

    dial.addEventListener('keydown', (e) => {
      const step = Number(dial.dataset.step) || 1;
      const cur = Number(dial.dataset.value || 0);
      const min = Number(dial.dataset.min);
      const max = Number(dial.dataset.max);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        audio.playUiClick('knob');
        applyKnobVal(cur + step);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        audio.playUiClick('knob');
        applyKnobVal(cur - step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        applyKnobVal(min);
      } else if (e.key === 'End') {
        e.preventDefault();
        applyKnobVal(max);
      }
    });
  };

  document.querySelectorAll('.phys-knob-step[data-knob-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.knobTarget;
      const dir = Number(btn.dataset.knobDir) || 1;
      const dial = document.getElementById(targetId);
      const setter = physKnobSetters[targetId];
      if (!dial || !setter) return;
      const min = Number(dial.dataset.min);
      const max = Number(dial.dataset.max);
      const step = Number(dial.dataset.step) || 1;
      const cur = Number(dial.dataset.value || 0);
      const next = Math.max(min, Math.min(max, cur + dir * step));
      audio.playUiClick('knob');
      if (next !== cur) {
        renderPhysKnob(targetId, next);
        setter(next);
      }
    });
  });

  bindPhys('physWeight', 'physWeightVal', ' kg', (v) => {
    engine.patient.weightKg = v;
    engine.patient.label = `Adulto • ${v} kg (PBW)`;
    document.getElementById('metaPatient').textContent = engine.patient.label;
    syncVentControlsUI();
  });

  // Calculadora de Peso Predito (ARDSNet / Devine: Homem e Mulher)
  let pbwSex = 'M';
  let pbwHeightCm = 175;
  const pbwHeightRange = document.getElementById('pbwHeightRange');
  const pbwHeightInput = document.getElementById('pbwHeightInput');

  function calcPredictedBodyWeight(sex, heightCm) {
    const base = sex === 'F' ? 45.5 : 50.0;
    return Math.max(34, Math.min(115, base + 0.91 * (heightCm - 152.4)));
  }

  function updatePbwPreview() {
    const pbw = calcPredictedBodyWeight(pbwSex, pbwHeightCm);
    const vt6 = Math.round(pbw * 6);
    const vt4 = Math.round(pbw * 4);
    const vt8 = Math.round(pbw * 8);
    document.getElementById('pbwResultVal').textContent = `${pbw.toFixed(1)} kg`;
    document.getElementById('pbwVtTargetVal').textContent = `${vt6} mL`;
    document.getElementById('pbwVtRangeVal').textContent = `Faixa protetora (4–8 mL/kg): ${vt4}–${vt8} mL`;
    return pbw;
  }

  document.querySelectorAll('.pbw-sex-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.playUiClick('soft');
      pbwSex = btn.dataset.sex === 'F' ? 'F' : 'M';
      document.querySelectorAll('.pbw-sex-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      updatePbwPreview();
    });
  });

  function setPbwHeight(val) {
    pbwHeightCm = Math.max(140, Math.min(210, Math.round(Number(val) || 175)));
    if (pbwHeightRange) pbwHeightRange.value = pbwHeightCm;
    if (pbwHeightInput) pbwHeightInput.value = pbwHeightCm;
    updatePbwPreview();
  }

  if (pbwHeightRange) pbwHeightRange.addEventListener('input', (e) => setPbwHeight(e.target.value));
  if (pbwHeightInput) pbwHeightInput.addEventListener('input', (e) => setPbwHeight(e.target.value));

  document.getElementById('btnApplyPbw').addEventListener('click', () => {
    audio.playUiClick('soft');
    const pbw = updatePbwPreview();
    const roundedWeight = Math.round(pbw);
    const sexLabel = pbwSex === 'F' ? 'Mulher' : 'Homem';
    const protectiveVt = Math.max(200, Math.min(800, Math.round((pbw * 6) / 10) * 10));

    engine.patient.weightKg = roundedWeight;
    engine.patient.label = `${sexLabel} (${pbwHeightCm}cm) • ${roundedWeight} kg`;
    engine.vent.vtSet = protectiveVt;

    syncPhysiologyModalInputs();
    document.getElementById('metaPatient').textContent = engine.patient.label;
    syncVentControlsUI();
    addLog(`PBW aplicado: ${sexLabel}, ${pbwHeightCm} cm → ${pbw.toFixed(1)} kg (Vt alvo: ${protectiveVt} mL)`);
  });

  updatePbwPreview();
  bindPhys('physComp', 'physCompVal', ' mL/cmH₂O', (v) => (engine.patient.compliance = v));
  bindPhys('physRes', 'physResVal', ' cmH₂O/L/s', (v) => (engine.patient.resistance = v));
  bindPhys('physShunt', 'physShuntVal', '%', (v) => (engine.patient.shunt = v / 100));
  bindPhys('physDrive', 'physDriveVal', ' irpm', (v) => (engine.patient.intrinsicDrive = v));
  bindPhys('physBe', 'physBeVal', ' mEq/L', (v) => (engine.patient.baseExcess = v));

  // Modal Limites de Alarme
  document.getElementById('btnAlarmLimits').addEventListener('click', () => {
    const a = engine.alarms;
    document.getElementById('inpHrLow').value = a.hrLow;
    document.getElementById('inpHrHigh').value = a.hrHigh;
    document.getElementById('inpSpo2Low').value = a.spo2Low;
    document.getElementById('inpMapLow').value = a.mapLow;
    document.getElementById('inpEtco2Low').value = a.etco2Low;
    document.getElementById('inpEtco2High').value = a.etco2High;
    document.getElementById('inpPpeakHigh').value = a.ppeakHigh;
    document.getElementById('inpDpHigh').value = a.dpHigh;
    openModal('modalAlarms');
  });

  document.getElementById('btnSaveAlarms').addEventListener('click', () => {
    const a = engine.alarms;
    a.hrLow = Number(document.getElementById('inpHrLow').value) || 50;
    a.hrHigh = Number(document.getElementById('inpHrHigh').value) || 130;
    a.spo2Low = Number(document.getElementById('inpSpo2Low').value) || 90;
    a.mapLow = Number(document.getElementById('inpMapLow').value) || 65;
    a.etco2Low = Number(document.getElementById('inpEtco2Low').value) || 28;
    a.etco2High = Number(document.getElementById('inpEtco2High').value) || 50;
    a.ppeakHigh = Number(document.getElementById('inpPpeakHigh').value) || 35;
    a.dpHigh = Number(document.getElementById('inpDpHigh').value) || 15;

    document.getElementById('limHR').textContent = `${a.hrLow}–${a.hrHigh}`;
    document.getElementById('limSpO2').textContent = `> ${a.spo2Low}%`;
    document.getElementById('limMAP').textContent = `PAM > ${a.mapLow}`;
    document.getElementById('limEtCO2').textContent = `${a.etco2Low}–${a.etco2High}`;
    closeModal('modalAlarms');
    addLog('Limites de alarme atualizados');
  });

  // ================= ATUALIZAÇÃO NUMÉRICA PERIÓDICA =================
  const RHYTHM_NAMES = {
    sinus: 'Ritmo Sinusal Normal',
    sinus_tach: 'Taquicardia Sinusal',
    sinus_brady: 'Bradicardia Sinusal',
    afib: 'Fibrilação Atrial (FA)',
    afib_rvr: 'FA de Alta Resposta (RVR)',
    aflutter: 'Flutter Atrial (3:1)',
    svt: 'TPSV (Taqui Supra)',
    av_block_1: 'BAV de 1º Grau',
    av_block_2_m1: 'BAV 2ºG Mobitz I (Wenckebach)',
    av_block_2_m2: 'BAV 2ºG Mobitz II',
    av_block_3: 'BAV Total / 3º Grau',
    rbbb: 'Bloqueio Ramo Direito (BRD)',
    lbbb: 'Bloqueio Ramo Esquerdo (BRE)',
    vtach: 'Taquicardia Ventricular (TV)',
    torsades: 'Torsades de Pointes',
    vf: 'Fibrilação Ventricular (FV)',
    pea: 'AESP (Sem Pulso)',
    asystole: 'Assistolia',
    stemi: 'Supra de ST (IAMCSST)',
    de_winter: 'Padrão de De Winter',
    wpw: 'Síndrome de WPW (Onda Delta)',
    hyperkalemia: 'Hipercalemia (T Apiculada)',
    paced: 'Marcapasso (VVI)'
  };

  // Referências fixas fora de ID único (cacheadas 1 única vez)
  const _mrChassisEl = document.querySelector('.mindray-chassis');
  const _mrPowerLedEl = document.querySelector('.mr-bottom-bezel .mr-led.green');
  const _vgChassisEl = document.getElementById('vgChassis');
  const _c1ChassisEl = document.getElementById('hamC1Chassis');

  // Culling por Viewport (IntersectionObserver): pausa render GPU de aparelhos fora da tela
  const _visState = { mon: true, defib: true, c1: true };
  if (typeof IntersectionObserver === 'function') {
    const _io = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.target === _mrChassisEl) _visState.mon = e.isIntersecting;
        else if (e.target === _vgChassisEl) _visState.defib = e.isIntersecting;
        else if (e.target === _c1ChassisEl) _visState.c1 = e.isIntersecting;
      }
    }, { rootMargin: '80px' });
    if (_mrChassisEl) _io.observe(_mrChassisEl);
    if (_vgChassisEl) _io.observe(_vgChassisEl);
    if (_c1ChassisEl) _io.observe(_c1ChassisEl);
  }

  // ================= VENTILADOR HOSPITALAR HAMILTON-C1 & MINI PORTÁTEIS (APH / VNI) =================
  var hamC1Panel = (() => {
    const chassis = _c1ChassisEl;
    if (!chassis) return null;
    const canvas = document.getElementById('c1PawCanvas');
    const ctx = canvas ? (canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d')) : null;
    const pawBuf = new Float32Array(180);
    let bufHead = 0;
    let sampleAccum = 0;
    let currentModel = 'c1'; // 'c1' | 'mini-aph' | 'mini-vni'
    let selectedSlot = 'main'; // 'main' | 'peep' | 'fio2' | 'rr'
    let asvModeOn = true;
    let activeMenu = null; // 'modes' | 'controls' | 'alarms' | 'monitoring' | 'tools' | 'events' | 'system' | null
    let knobAngle = 0;
    let o2CylBar = 185;
    let battPct = 97;
    let nebTimer = 0;
    let actionBannerText = '';
    let actionBannerTimer = 0;
    let selfTestProgress = 0;
    let selfTestRunning = false;
    const c1Events = [];

    const setEngineVentMode = (m) => {
      engine.vent.mode = m;
      engine.vent.backupActive = false;
    };
    const setEngineVentParam = (k, val) => {
      engine.vent[k] = val;
      if (k === 'fio2Set') engine.vent.o2FlushTimer = 0;
    };

    const pushC1Event = (msg) => {
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      c1Events.unshift({ ts, msg });
      if (c1Events.length > 24) c1Events.pop();
      const ul = document.getElementById('c1EventsList');
      if (ul) ul.innerHTML = c1Events.map((ev) => `<li><b>${ev.ts}</b>${escapeHtml(ev.msg)}</li>`).join('');
    };

    const showBanner = (text, sec = 5) => {
      actionBannerText = text;
      actionBannerTimer = sec;
    };

    const MENU_TITLES = {
      modes: 'Modes • Seleção de Modo',
      controls: 'Controls • Ajustes Completos',
      alarms: 'Alarms • Limites & Ativos',
      monitoring: 'Monitoring • Mecânica Respiratória',
      tools: 'Tools • Manobras Clínicas',
      events: 'Events • Registro do Ventilador',
      system: 'System • Diagnóstico & Auto-Teste'
    };

    const openMenu = (name) => {
      const ov = document.getElementById('c1MenuOverlay');
      if (!ov) return;
      if (!name || activeMenu === name) {
        activeMenu = null;
        ov.classList.add('hidden');
      } else {
        activeMenu = name;
        ov.classList.remove('hidden');
        $txt('c1MenuTitle', MENU_TITLES[name] || name);
        ov.querySelectorAll('.c1-menu-pane').forEach((p) => {
          p.classList.toggle('hidden', p.dataset.c1Pane !== name);
        });
      }
      chassis.querySelectorAll('[data-c1-menu]').forEach((b) => {
        b.classList.toggle('active', b.dataset.c1Menu === activeMenu);
        b.classList.toggle('menu-open', b.dataset.c1Menu === activeMenu);
      });
      syncUI();
    };

    const setC1Mode = (modeKey) => {
      if (hamStandby) return;
      if (modeKey === 'ASV') {
        asvModeOn = true;
        applyAsvProtective();
      } else if (modeKey === 'NIV') {
        asvModeOn = false;
        setEngineVentMode('PSV');
        pushC1Event('Modo NIV (BiPAP/PSV) selecionado');
        addLog('HAMILTON-C1: Modo NIV (BiPAP/PSV) selecionado');
      } else {
        asvModeOn = false;
        setEngineVentMode(modeKey);
        pushC1Event(`Modo ${modeKey === 'VCV' ? '(S)CMV+' : modeKey === 'PCV' ? 'PCV+' : 'SPONT'} selecionado`);
        addLog(`HAMILTON-C1: Modo ${modeKey} selecionado`);
      }
      setSlot(selectedSlot);
      openMenu(null);
    };

    const runSelfTest = () => {
      if (selfTestRunning) return;
      selfTestRunning = true;
      selfTestProgress = 0;
      pushC1Event('Auto-Teste & Calibração iniciados');
      showBanner('AUTO-TESTE', 4.5);
    };

    const MODEL_META = {
      c1: {
        wordmark: 'HAMILTON-C1',
        chin: 'UTI HOSPITALAR • TURBINA INTERNA',
        plateTop: 'HAMILTON',
        plateSub: 'MEDICAL',
        miniBadge: 'HAMILTON-C1'
      },
      'mini-aph': {
        wordmark: 'MINI-VENT P1 • APH',
        chin: 'MINI VENTILADOR PORTÁTIL • RESGATE / TRANSPORTE',
        plateTop: 'MINI-VENT',
        plateSub: 'APH P1',
        miniBadge: 'APH • TRANSPORTE'
      },
      'mini-vni': {
        wordmark: 'MINI-VNI • BiPAP',
        chin: 'MINI VENTILADOR PORTÁTIL • SUPORTE NÃO INVASIVO',
        plateTop: 'MINI-VNI',
        plateSub: 'BiPAP / CPAP',
        miniBadge: 'VNI • PORTÁTIL'
      }
    };

    const setSlot = (slot) => {
      selectedSlot = slot;
      ['c1DialMain', 'c1DialPeep', 'c1DialO2'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('active', el.dataset.c1Slot === slot);
      });
      const lblMap = {
        main: currentModel === 'mini-vni' ? 'IPAP' : (asvModeOn && currentModel === 'c1' ? '%MinVol' : (engine.vent.mode === 'VCV' ? 'Vt' : 'Pinsp')),
        peep: currentModel === 'mini-vni' ? 'EPAP' : 'PEEP',
        fio2: 'Oxygen',
        rr: 'FR'
      };
      $txt('c1RotaryLbl', lblMap[slot] || 'Vt');
    };

    const applyAsvProtective = () => {
      const pbw = Math.max(35, engine.patient.weightKg || 70);
      const targetVt = Math.round((pbw * 6) / 10) * 10;
      const targetRr = engine.vitals && engine.vitals.ph < 7.30 ? 20 : 14;
      setEngineVentMode('VCV');
      setEngineVentParam('vtSet', targetVt);
      setEngineVentParam('rrSet', targetRr);
      asvModeOn = true;
      showBanner('ASV AUTO ✓', 4);
      pushC1Event(`ASV protetor: Vt ${targetVt} mL • FR ${targetRr}/min`);
      addLog(`HAMILTON-C1 (ASV): autoajuste protetor aplicado (Vt ${targetVt} mL • FR ${targetRr}/min para IBW ${pbw} kg)`);
      syncUI();
    };

    const adjustSlot = (dir) => {
      if (hamStandby) return;
      const v = engine.vent;
      if (selectedSlot === 'peep') {
        setEngineVentParam('peepSet', Math.max(0, Math.min(24, v.peepSet + dir)));
      } else if (selectedSlot === 'fio2') {
        setEngineVentParam('fio2Set', Math.max(21, Math.min(100, v.fio2Set + dir * 5)));
      } else if (selectedSlot === 'rr') {
        setEngineVentParam('rrSet', Math.max(6, Math.min(40, v.rrSet + dir)));
      } else {
        if (v.mode === 'VCV') {
          setEngineVentParam('vtSet', Math.max(200, Math.min(800, v.vtSet + dir * 20)));
        } else if (v.mode === 'PCV') {
          setEngineVentParam('pcSet', Math.max(6, Math.min(35, v.pcSet + dir)));
        } else {
          setEngineVentParam('psSet', Math.max(4, Math.min(30, v.psSet + dir)));
        }
      }
      audio.playUiClick('knob');
      knobAngle += dir * 24;
      const core = document.getElementById('c1RotaryCore');
      if (core) core.style.transform = `rotate(${knobAngle}deg)`;
      syncUI();
    };

    const setModel = (model) => {
      if (!MODEL_META[model]) return;
      currentModel = model;
      chassis.setAttribute('data-vent-model', model);
      chassis.querySelectorAll('.c1-model-tab').forEach((t) => {
        const active = t.dataset.c1Model === model;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      const meta = MODEL_META[model];
      $txt('c1ModelWordmark', meta.wordmark);
      $txt('c1SysModel', meta.wordmark);
      $txt('c1ChinTag', meta.chin);
      $txt('c1MiniBadge', meta.miniBadge);
      const plate = document.getElementById('c1BrandPlate');
      if (plate) plate.innerHTML = `<strong>${meta.plateTop}</strong><span>${meta.plateSub}</span>`;
      if (model === 'mini-vni' && engine.vent.mode !== 'PSV') {
        asvModeOn = false;
        setEngineVentMode('PSV');
        pushC1Event('Modelo Mini Portátil VNI/BiPAP ativado');
        addLog('Mini Ventilador Portátil VNI selecionado — modo PSV/BiPAP ativado');
      } else if (model === 'mini-aph') {
        asvModeOn = false;
        pushC1Event('Modelo Mini Portátil APH ativado');
        addLog('Mini Ventilador Portátil APH (Transporte/Resgate) selecionado');
      } else if (model === 'c1') {
        pushC1Event('Modelo HAMILTON-C1 Hospitalar ativo');
        addLog('Ventilador Hospitalar HAMILTON-C1 selecionado');
      }
      setSlot(selectedSlot);
      syncUI();
    };

    // Eventos de abas de modelo
    chassis.querySelectorAll('.c1-model-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        audio.playUiClick('soft');
        setModel(tab.dataset.c1Model);
      });
    });

    // Eventos dos 7 Menus Touch + Fechar
    chassis.querySelectorAll('[data-c1-menu]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiClick('soft');
        openMenu(btn.dataset.c1Menu);
      });
    });
    const closeBtn = document.getElementById('c1MenuClose');
    if (closeBtn) closeBtn.addEventListener('click', () => { audio.playUiClick('soft'); openMenu(null); });

    // Seleção de modo dentro do Menu Modes
    chassis.querySelectorAll('[data-c1-setmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiClick('hw');
        setC1Mode(btn.dataset.c1Setmode);
      });
    });

    // Sliders do Menu Controls
    const wireC1Slider = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => { fn(Number(el.value)); syncUI(); });
    };
    wireC1Slider('c1SlMain', (val) => {
      const m = engine.vent.mode;
      if (m === 'VCV') setEngineVentParam('vtSet', val);
      else if (m === 'PCV') setEngineVentParam('pcSet', val);
      else setEngineVentParam('psSet', val);
    });
    wireC1Slider('c1SlRr', (val) => setEngineVentParam('rrSet', val));
    wireC1Slider('c1SlPeep', (val) => setEngineVentParam('peepSet', val));
    wireC1Slider('c1SlFio2', (val) => setEngineVentParam('fio2Set', val));
    wireC1Slider('c1SlPause', (val) => setEngineVentParam('inspPausePct', val));

    // Sliders de Limites no Menu Alarms
    wireC1Slider('c1AlPpeak', (val) => { engine.alarms.ppeakHigh = val; });
    wireC1Slider('c1AlSpo2', (val) => { engine.alarms.spo2Low = val; });
    wireC1Slider('c1AlEtco2', (val) => { engine.alarms.etco2High = val; });

    // Seleção + scroll nos botões circulares touch
    chassis.querySelectorAll('[data-c1-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiClick('soft');
        setSlot(btn.dataset.c1Slot);
      });
      btn.addEventListener('wheel', (e) => {
        e.preventDefault();
        setSlot(btn.dataset.c1Slot);
        adjustSlot(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });

    // Ações de hardware e menu Tools
    chassis.querySelectorAll('[data-c1-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.c1Action;
        if (act === 'power') {
          setHamStandby(!hamStandby);
          pushC1Event(hamStandby ? 'Standby ativado' : 'Ventilação retomada');
        } else if (act === 'cycleMode') {
          if (hamStandby) return;
          audio.playUiClick('soft');
          if (asvModeOn && currentModel === 'c1') setC1Mode('PCV');
          else if (engine.vent.mode === 'VCV') setC1Mode('PCV');
          else if (engine.vent.mode === 'PCV') setC1Mode('PSV');
          else setC1Mode(currentModel === 'c1' ? 'ASV' : 'VCV');
        } else if (act === 'holdInsp' || act === 'manualBreath') {
          triggerHoldInsp();
          showBanner('HOLD INSP', 3.5);
          pushC1Event('Pausa Inspiratória (Pplatô/Cstat)');
        } else if (act === 'holdExp') {
          triggerHoldExp();
          showBanner('HOLD EXP', 3.5);
          pushC1Event('Pausa Expiratória (Auto-PEEP)');
        } else if (act === 'o2Flush') {
          triggerO2Flush();
          showBanner('O₂ 100% ATIVO', 6);
          pushC1Event('Enriquecimento O₂ 100% acionado');
        } else if (act === 'neb') {
          if (hamStandby) return;
          audio.playUiClick('maneuver');
          engine.giveBronchodilator();
          nebTimer = 8;
          showBanner('NEBULIZANDO', 8);
          pushC1Event('Nebulizador / Broncodilatador ativado');
        } else if (act === 'recruit') {
          if (hamStandby) return;
          audio.playUiClick('maneuver');
          engine.suctionAndRecruit();
          showBanner('RECRUTAMENTO', 5);
          pushC1Event('Aspiração & Recrutamento alveolar');
        } else if (act === 'toggleConnect') {
          toggleVentConnection();
          pushC1Event(engine.airway.connectedToVent ? 'TOT acoplado à VM' : 'Paciente desacoplado da VM');
        } else if (act === 'asvAuto') {
          if (hamStandby) return;
          audio.playUiClick('hw');
          applyAsvProtective();
        } else if (act === 'silence') {
          audio.playUiClick('silence');
          const silBtn = document.getElementById('btnSilenceAlarm');
          if (silBtn) silBtn.click();
          showBanner('AUDIO PAUSE 2m', 4);
          pushC1Event('Alarmes silenciados por 2 min');
        } else if (act === 'selfTest') {
          audio.playUiClick('hw');
          runSelfTest();
        }
        syncUI();
      });
    });

    // Knob Rotativo Verde Neon (scroll, arraste ou teclado)
    const knob = document.getElementById('c1RotaryKnob');
    if (knob) {
      knob.addEventListener('wheel', (e) => {
        e.preventDefault();
        adjustSlot(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });
      knob.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); adjustSlot(1); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); adjustSlot(-1); }
      });
      let dragging = false, sy = 0, sx = 0;
      knob.addEventListener('pointerdown', (e) => {
        dragging = true; sy = e.clientY; sx = e.clientX;
        knob.setPointerCapture(e.pointerId);
      });
      knob.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dy = sy - e.clientY;
        const dx = e.clientX - sx;
        const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
        if (Math.abs(delta) >= 14) {
          adjustSlot(delta > 0 ? 1 : -1);
          sy = e.clientY; sx = e.clientX;
        }
      });
      const stopDrag = () => { dragging = false; };
      knob.addEventListener('pointerup', stopDrag);
      knob.addEventListener('pointercancel', stopDrag);
    }

    // Botão da Topbar para exibir/ocultar HAMILTON-C1 & Mini Portáteis
    const btnVentC1 = document.getElementById('btnVentC1');
    if (btnVentC1) {
      btnVentC1.addEventListener('click', () => {
        audio.playUiClick('soft');
        const hidden = chassis.classList.toggle('hidden');
        btnVentC1.classList.toggle('active', !hidden);
        if (!hidden) {
          requestAnimationFrame(() => resize());
          chassis.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    let dirty = true;

    function resize() {
      if (!canvas || chassis.classList.contains('hidden')) return;
      const Sweep = window.ICUSim && window.ICUSim.Sweep;
      if (Sweep) {
        Sweep.resizeCanvas(canvas);
      } else {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth || 180;
        const h = canvas.clientHeight || 62;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      dirty = true;
    }

    function onDefibShock(res, energyJ) {
      const converted = Boolean(res && res.converted);
      const label = converted ? `ROSC ✓ (${energyJ}J)` : `CHOQUE ${energyJ}J ⚡`;
      showBanner(label, 4.5);
      pushC1Event(converted
        ? `Choque ${energyJ}J (Vivo Gold) → ROSC / Ritmo convertido`
        : `Descarga elétrica ${energyJ}J registrada no tórax`);
      dirty = true;
      syncUI();
    }

    function step(dt) {
      sampleAccum += dt;
      if (sampleAccum >= 0.035) {
        sampleAccum -= 0.035;
        if (sampleAccum > 0.07) sampleAccum = 0;
        const pawNow = (!hamStandby && engine.airway.connectedToVent) ? (engine.breath.paw || 0) : 0;
        pawBuf[bufHead] = pawNow;
        bufHead = (bufHead + 1) % pawBuf.length;
        dirty = true;
      }
      if (nebTimer > 0) nebTimer = Math.max(0, nebTimer - dt);
      if (actionBannerTimer > 0) actionBannerTimer = Math.max(0, actionBannerTimer - dt);
      if (selfTestRunning) {
        selfTestProgress = Math.min(100, selfTestProgress + dt * 26);
        const fill = $id('c1SelfTestFill');
        if (fill) fill.style.width = `${Math.round(selfTestProgress)}%`;
        $txt('c1SelfTestPct', `${Math.round(selfTestProgress)}%`);
        const phaseTxt = selfTestProgress < 35 ? 'Testando estanqueidade…'
          : selfTestProgress < 70 ? 'Calibrando sensor de fluxo…'
          : selfTestProgress < 100 ? 'Verificando célula O₂…'
          : 'Auto-Teste APROVADO ✓';
        $txt('c1SelfTestMsg', phaseTxt);
        if (selfTestProgress >= 100) {
          selfTestRunning = false;
          pushC1Event('Auto-Teste concluído: APROVADO ✓');
          showBanner('TESTE OK ✓', 3);
        }
      }
      if (!hamStandby && currentModel !== 'c1') {
        const fio2Frac = Math.max(0.21, (engine.vent.fio2Set || 40) / 100);
        o2CylBar = Math.max(15, o2CylBar - dt * 0.045 * fio2Frac);
        battPct = Math.max(12, battPct - dt * 0.008);
      }
    }

    function render() {
      if (!dirty || !ctx || !canvas || chassis.classList.contains('hidden')) return;
      if (!canvas.width || !canvas.height) resize();
      if (!canvas.width || !canvas.height) return;
      dirty = false;

      const Sweep = window.ICUSim && window.ICUSim.Sweep;
      const dpr = Sweep ? Sweep.getDpr() : Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.width;
      const ch = canvas.height;

      // Fundo opaco + grade em cache offscreen (zero reflow clientWidth/clientHeight por frame!)
      if (Sweep) {
        const gridBg = Sweep.getCachedGridCanvas(canvas, cw, ch, dpr, 1, 4, 'rgba(148, 163, 184, 0.14)', '#0d1318', null);
        ctx.drawImage(gridBg, 0, 0);
      } else {
        ctx.fillStyle = '#0d1318';
        ctx.fillRect(0, 0, cw, ch);
      }

      const len = pawBuf.length;
      const maxPaw = 42;
      const highPress = (engine.breath.lastPeakPaw || 0) > (engine.alarms.ppeakHigh || 35);
      const strokeCol = highPress ? '#f87171' : (currentModel === 'mini-vni' ? '#38bdf8' : '#fde047');
      const fillCol = highPress ? 'rgba(248, 113, 113, 0.18)' : (currentModel === 'mini-vni' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(250, 204, 21, 0.16)');
      const padB = 3 * dpr;
      const spanH = ch - 7 * dpr;
      const invLen = cw / (len - 1);
      const invPaw = spanH / maxPaw;

      let lastX = 0, lastY = ch - padB;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const idx = (bufHead + i) % len;
        let val = pawBuf[idx];
        if (val < 0) val = 0;
        else if (val > maxPaw) val = maxPaw;
        const x = i * invLen;
        const y = ch - padB - val * invPaw;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        lastX = x; lastY = y;
      }
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();

      ctx.lineTo(cw, ch);
      ctx.lineTo(0, ch);
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();

      // Ponto luminoso na ponta da onda (sweep head)
      ctx.beginPath();
      ctx.arc(lastX - dpr, lastY, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    function syncUI() {
      if (chassis.classList.contains('hidden')) return;
      const b = engine.breath;
      const v = engine.vent;
      const p = engine.patient;
      const vit = engine.vitals;
      const ventOn = !hamStandby && engine.airway.connectedToVent;
      const alarms = engine.activeAlarms || [];
      const hasCrit = alarms.some((a) => a.level === 'critical');
      const hasWarn = alarms.length > 0;

      const modeLabel = currentModel === 'mini-vni'
        ? 'NIV'
        : (currentModel === 'mini-aph' ? (v.mode === 'PSV' ? 'CPAP' : 'VC-CMV') : (asvModeOn && v.mode === 'VCV' ? 'ASV' : v.mode));

      $txt('c1ModeBadge', modeLabel);
      $txt('c1FooterMode', `${modeLabel}`);
      $txt('c1ValPpeak', ventOn ? Math.round(b.lastPeakPaw) : '--');
      $txt('c1ValMve', ventOn ? b.lastVeLmin.toFixed(1) : '--');
      $txt('c1ValVte', ventOn ? Math.round(b.lastVteMl) : '--');
      $txt('c1ValRr', Math.round(b.lastRrTotal));
      $txt('c1WavePplat', ventOn ? `Pplat ${Math.round(b.lastPlatPaw)}` : 'OFF');

      // Controles circulares touch
      if (currentModel === 'mini-vni') {
        $txt('c1DialMainVal', Math.round(v.peepSet + v.psSet));
        $txt('c1DialMainUnit', 'IPAP');
        $txt('c1DialPeepUnit', 'EPAP');
      } else if (asvModeOn && currentModel === 'c1' && v.mode === 'VCV') {
        const pbw = Math.max(40, p.weightKg || 70);
        const pctMv = Math.round(((v.vtSet * v.rrSet) / (pbw * 100)) * 100);
        $txt('c1DialMainVal', pctMv);
        $txt('c1DialMainUnit', '%MinVol');
        $txt('c1DialPeepUnit', 'PEEP');
      } else if (v.mode === 'VCV') {
        $txt('c1DialMainVal', Math.round(v.vtSet));
        $txt('c1DialMainUnit', 'Vt ml');
        $txt('c1DialPeepUnit', 'PEEP');
      } else if (v.mode === 'PCV') {
        $txt('c1DialMainVal', Math.round(v.pcSet));
        $txt('c1DialMainUnit', 'Pinsp');
        $txt('c1DialPeepUnit', 'PEEP');
      } else {
        $txt('c1DialMainVal', Math.round(v.psSet));
        $txt('c1DialMainUnit', 'Psup');
        $txt('c1DialPeepUnit', 'PEEP');
      }
      $txt('c1DialPeepVal', Math.round(v.peepSet));
      $txt('c1DialO2Val', Math.round(v.fio2Set));

      // Dynamic Lung em 4 camadas + Turbina RPM
      const dp = ventOn ? Math.max(0, Math.round(b.lastPlatPaw - (v.peepSet + b.lastAutoPeep))) : 0;
      const turbRpm = ventOn ? Math.round(14500 + (b.paw || 0) * 340 + (b.flowLs > 0 ? b.flowLs * 4200 : 0)) : 0;
      $txt('c1DlungPbw', `IBW ${Math.round(p.weightKg || 70)} kg`);
      $txt('c1DlungLeak', currentModel === 'mini-vni' ? 'Fuga 6 L/m' : 'Fuga 0%');
      $txt('c1DlungIe', ventOn ? (b.lastIeString || '1:2.0') : '--');
      $txt('c1DlungDp', `ΔP ${dp}`);
      $txt('c1DlungTurb', ventOn ? `${(turbRpm / 1000).toFixed(1)}k rpm` : '0 rpm');
      $txt('c1SysTurb', `${turbRpm.toLocaleString('pt-BR')} RPM`);
      $txt('c1SysBatt', `${Math.round(battPct)}% ${currentModel === 'c1' ? 'AC' : 'BAT'}`);
      $txt('c1StatR', Math.round(p.resistance));
      $txt('c1StatC', Math.round(p.compliance));
      $txt('c1StatCo2', Math.round(vit.etco2));
      $txt('c1StatSpo2', Math.round(vit.spo2));
      $txt('c1StatHr', Math.round(vit.hr));

      // Banner de ação temporária no Dynamic Lung (via cache $id)
      const bannerEl = $id('c1ActionBanner');
      if (bannerEl) {
        bannerEl.classList.toggle('hidden', actionBannerTimer <= 0);
        if (actionBannerTimer > 0 && bannerEl.textContent !== actionBannerText) bannerEl.textContent = actionBannerText;
      }

      // Telemetria dos Mini Ventiladores Portáteis
      $txt('c1MiniO2Bar', currentModel === 'mini-vni' ? 'Fuga 6 L/m' : `O₂ ${Math.round(o2CylBar)} bar`);
      $txt('c1MiniBatt', `BAT ${Math.round(battPct)}%`);

      // Bargraph Paw + Animação Dynamic Lung (Pulmões, Brônquios, Diafragma, Coração, Nebulização)
      const pawFill = $id('c1PawBarFill');
      if (pawFill) {
        const pct = ventOn ? Math.max(4, Math.min(100, (b.paw / 42) * 100)) : 0;
        pawFill.style.width = `${pct.toFixed(0)}%`;
      }
      const lungsG = $id('c1LungsGroup');
      if (lungsG) {
        const vtNorm = Math.max(0, Math.min(1, (b.volumeL || 0) / 0.65));
        const sc = ventOn ? (0.94 + vtNorm * 0.22) : 0.92;
        lungsG.style.transform = `scale(${sc.toFixed(3)})`;
      }
      const dlungPanel = $id('c1DlungPanel');
      if (dlungPanel) {
        dlungPanel.classList.toggle('critical', vit.spo2 < 82);
        dlungPanel.classList.toggle('hypoxia', vit.spo2 >= 82 && vit.spo2 < 90);
        dlungPanel.classList.toggle('bronchospasm', p.resistance >= 16);
        dlungPanel.classList.toggle('stiff', p.compliance <= 32);
        dlungPanel.classList.toggle('spont-trigger', ventOn && (b.phase === 'TRIGGER' || (b.lastBreathWasSpont && b.phase === 'INSP')));
        dlungPanel.classList.toggle('nebulizing', nebTimer > 0);
      }
      const heartEl = $id('c1HeartIcon');
      if (heartEl) {
        const arrested = vit.hr <= 0 || p.arrested;
        heartEl.classList.toggle('arrested', arrested);
      }

      // Lâmpada 360° da Alça + Anel do Knob P&T + LEDs + Standby
      const lamp = $id('c1AlarmLamp');
      if (lamp) {
        lamp.classList.toggle('crit', hasCrit);
        lamp.classList.toggle('warn', !hasCrit && hasWarn);
      }
      chassis.classList.toggle('c1-ventilating', ventOn);
      chassis.classList.toggle('c1-alarm-crit', hasCrit);
      chassis.classList.toggle('c1-alarm-warn', !hasCrit && hasWarn);
      const ledInsp = $id('c1LedInsp');
      if (ledInsp) ledInsp.classList.toggle('active', ventOn && (b.phase === 'INSP' || b.phase === 'PAUSE'));
      const btnPwr = $id('c1BtnPower');
      if (btnPwr) btnPwr.classList.toggle('off', hamStandby);
      const ovStandby = $id('c1StandbyOverlay');
      if (ovStandby) ovStandby.classList.toggle('hidden', !hamStandby);

      // Atualiza conteúdo do Menu Touch ativo (com diffing de assinatura — zero GC desnecessário!)
      if (activeMenu === 'modes') {
        const curKey = (currentModel === 'mini-vni') ? 'NIV' : (asvModeOn && v.mode === 'VCV' ? 'ASV' : v.mode);
        chassis.querySelectorAll('.c1-mode-card').forEach((c) => {
          c.classList.toggle('active', c.dataset.c1Setmode === curKey);
        });
      } else if (activeMenu === 'controls') {
        const slM = $id('c1SlMain');
        if (slM) {
          if (v.mode === 'VCV') {
            slM.min = 200; slM.max = 800; slM.step = 10; slM.value = Math.round(v.vtSet);
            $txt('c1SlMainLbl', 'Vt (Volume Corrente)'); $txt('c1SlMainVal', `${Math.round(v.vtSet)} ml`);
          } else if (v.mode === 'PCV') {
            slM.min = 6; slM.max = 35; slM.step = 1; slM.value = Math.round(v.pcSet);
            $txt('c1SlMainLbl', 'Pinsp (Pressão Controlada)'); $txt('c1SlMainVal', `${Math.round(v.pcSet)} cmH2O`);
          } else {
            slM.min = 4; slM.max = 30; slM.step = 1; slM.value = Math.round(v.psSet);
            $txt('c1SlMainLbl', 'Psup (Pressão de Suporte)'); $txt('c1SlMainVal', `${Math.round(v.psSet)} cmH2O`);
          }
        }
        const setSl = (id, val, txtId, txt) => {
          const el = $id(id);
          if (el) el.value = val;
          $txt(txtId, txt);
        };
        setSl('c1SlRr', Math.round(v.rrSet), 'c1SlRrVal', `${Math.round(v.rrSet)} b/min`);
        setSl('c1SlPeep', Math.round(v.peepSet), 'c1SlPeepVal', `${Math.round(v.peepSet)} cmH2O`);
        setSl('c1SlFio2', Math.round(v.fio2Set), 'c1SlFio2Val', `${Math.round(v.fio2Set)}%`);
        setSl('c1SlPause', Math.round(v.inspPausePct), 'c1SlPauseVal', `${Math.round(v.inspPausePct)}%`);
      } else if (activeMenu === 'alarms') {
        const listEl = $id('c1AlarmList');
        if (listEl) {
          const alSig = alarms.map((a) => `${a.level}:${a.msg || a.text || ''}`).join('|');
          if (listEl.dataset.sig !== alSig) {
            listEl.dataset.sig = alSig;
            listEl.innerHTML = alarms.length
              ? alarms.map((a) => `<div class="c1-alarm-item ${a.level === 'critical' ? 'crit' : 'warn'}">${a.level === 'critical' ? '🚨' : '⚠'} ${escapeHtml(a.msg || a.text || '')}</div>`).join('')
              : '<div class="c1-alarm-ok">✓ Sem alarmes ativos no momento</div>';
          }
        }
        const alPpeak = Math.round(engine.alarms.ppeakHigh || 35);
        const alSpo2 = Math.round(engine.alarms.spo2Low || 90);
        const alEtco2 = Math.round(engine.alarms.etco2High || 50);
        const elPpeak = $id('c1AlPpeak'); if (elPpeak) elPpeak.value = alPpeak;
        const elSpo2 = $id('c1AlSpo2'); if (elSpo2) elSpo2.value = alSpo2;
        const elEtco2 = $id('c1AlEtco2'); if (elEtco2) elEtco2.value = alEtco2;
        $txt('c1AlPpeakVal', `${alPpeak} cmH2O`);
        $txt('c1AlSpo2Val', `${alSpo2}%`);
        $txt('c1AlEtco2Val', `${alEtco2} mmHg`);
      } else if (activeMenu === 'monitoring') {
        const grid = $id('c1MonGrid');
        if (grid) {
          const o2 = engine.getEffectiveO2Info();
          const pf = Math.round(vit.pao2 / Math.max(0.21, o2.fio2 / 100));
          const cells = [
            ['Ppeak', `${Math.round(b.lastPeakPaw)}`, b.lastPeakPaw > 35 ? 'crit' : ''],
            ['Pplat', `${Math.round(b.lastPlatPaw)}`, b.lastPlatPaw > 30 ? 'crit' : ''],
            ['Pmean', `${Math.round(b.lastMeanPaw)}`, ''],
            ['PEEPtot', `${Math.round(v.peepSet + b.lastAutoPeep)}`, ''],
            ['AutoPEEP', `${b.lastAutoPeep.toFixed(1)}`, b.lastAutoPeep > 3 ? 'warn' : ''],
            ['ΔP', `${dp}`, dp > 15 ? 'crit' : ''],
            ['Cstat', `${Math.round(p.compliance)}`, p.compliance < 30 ? 'warn' : ''],
            ['Rinsp', `${Math.round(p.resistance)}`, p.resistance >= 18 ? 'warn' : ''],
            ['Vte', `${Math.round(b.lastVteMl)} ml`, ''],
            ['ExpMinVol', `${b.lastVeLmin.toFixed(1)} L`, ''],
            ['PaO2/FiO2', `${pf}`, pf < 150 ? 'crit' : pf < 300 ? 'warn' : ''],
            ['EtCO2', `${Math.round(vit.etco2)}`, vit.etco2 > 50 ? 'warn' : '']
          ];
          const mSig = cells.map((c) => c[1] + c[2]).join(',');
          if (grid.dataset.sig !== mSig) {
            grid.dataset.sig = mSig;
            grid.innerHTML = cells.map(([k, val, cls]) => `<div class="c1-mon-cell ${cls}"><span>${k}</span><strong>${val}</strong></div>`).join('');
          }
        }
      } else if (activeMenu === 'tools') {
        $txt('c1ToolConnLbl', engine.airway.connectedToVent ? 'Desacoplar VM' : 'Acoplar VM');
      }
    }

    function clearBuffers() {
      pawBuf.fill(0);
      bufHead = 0;
      sampleAccum = 0;
      dirty = true;
    }

    pushC1Event('HAMILTON-C1 inicializado • ASV pronto');
    setSlot('main');
    return { step, render, resize, syncUI, setModel, openMenu, clearBuffers, onDefibShock };
  })();

  // Pausa limpa de áudio e prevenção de salto de dt ao trocar de aba
  document.addEventListener('visibilitychange', () => {
    audio.setTabHidden(document.hidden);
    if (!document.hidden) lastFrameTime = performance.now();
  });

  function updateNumericUI() {
    const v = engine.vitals;
    const b = engine.breath;
    const p = engine.patient;
    const a = engine.alarms;
    const vent = engine.vent;

    // Monitor (cache + diffing)
    const isChaosOrFlat = v.rhythm === 'vf' || v.rhythm === 'asystole' || v.rhythm === 'torsades';
    const isPulseless = isChaosOrFlat || v.rhythm === 'pea';
    const cprOn = engine.interventions.cprActive;
    $txt('valHR', isChaosOrFlat ? '---' : Math.round(v.hr));
    $txt('valST', `ST: ${v.stDeviation >= 0 ? '+' : ''}${v.stDeviation.toFixed(1)} mm`);
    $txt('rhythmLabel', RHYTHM_NAMES[v.rhythm] || 'Sinusal');

    $txt('valSpO2', isPulseless && !cprOn ? '--' : Math.round(v.spo2));
    $txt('valPI', `${v.perfusionIndex.toFixed(1)}%`);
    $txt('valPulseRate', isPulseless ? (cprOn ? 'PR: 110' : 'PR: ---') : `PR: ${Math.round(v.hr)}`);
    $txt('perfusionLabel', v.perfusionIndex < 1.0 ? 'Má Perfusão!' : v.perfusionIndex < 2.0 ? 'Perfusão Reduzida' : 'Perfusão Boa');

    $txt('valBP', isPulseless && !cprOn ? '---/---' : `${Math.round(v.sbp)}/${Math.round(v.dbp)}`);
    $txt('valMAP', isPulseless && !cprOn ? '(--)' : `(${v.map})`);
    $txt('valNIBP', v.nibpSbp > 0 ? `PNI: ${v.nibpSbp}/${v.nibpDbp}` : 'PNI: ---/---');

    $txt('valEtCO2', Math.round(v.etco2));
    $txt('valRRMon', v.rrMonitor);
    $txt('valTemp', `${p.temp.toFixed(1)}°C`);
    $txt('co2ShapeLabel', p.resistance > 16 ? 'Obstrutiva (Barbatana)' : 'Platô Normal');

    // Cards com alerta visual
    $id('cardHR').classList.toggle(
      'alarming',
      isPulseless || v.rhythm === 'av_block_3' || v.rhythm === 'vtach' || v.rhythm === 'stemi' || v.rhythm === 'de_winter' || v.hr < a.hrLow || v.hr > a.hrHigh
    );
    $id('cardSpO2').classList.toggle('alarming', v.spo2 < a.spo2Low);
    $id('cardIBP').classList.toggle('alarming', v.map < a.mapLow);
    $id('cardEtCO2').classList.toggle('alarming', v.etco2 > a.etco2High || v.etco2 < a.etco2Low);

    // Estado Ventilatório + Relógio Mindray + Sincronia dos Dispositivos
    const ventConnected = Boolean(engine.airway && engine.airway.connectedToVent);
    const o2Info = engine.getEffectiveO2Info();

    const nowDt = new Date();
    const dStr = `${nowDt.getFullYear()}-${String(nowDt.getMonth() + 1).padStart(2, '0')}-${String(nowDt.getDate()).padStart(2, '0')}`;
    const tStr = `${String(nowDt.getHours()).padStart(2, '0')}:${String(nowDt.getMinutes()).padStart(2, '0')}:${String(nowDt.getSeconds()).padStart(2, '0')}`;
    $txt('mindrayClock', `${dStr} ${tStr}`);
    $txt('noraValue', engine.interventions.noraDose.toFixed(2));
    if (vivoGold) vivoGold.syncUI();
    if (icatuPump) icatuPump.syncUI();
    if (icatuPump2) icatuPump2.syncUI();
    if (sg1Analyzer) sg1Analyzer.syncUI();
    if (hamC1Panel) hamC1Panel.syncUI();

    const mrLiveDotEl = $id('mrLiveDot');
    if (_mrChassisEl) _mrChassisEl.classList.toggle('mr-operating', !mrStandby && !isFrozen);
    if (mrLiveDotEl) mrLiveDotEl.classList.toggle('live', !mrStandby && !isFrozen);
    if (_mrPowerLedEl) _mrPowerLedEl.classList.toggle('operating', !mrStandby);

    // Meta Strip
    const vtKg = b.lastVteMl / Math.max(30, p.weightKg);
    const effFio2 = o2Info.fio2 / 100;
    const pf = Math.round(v.pao2 / Math.max(0.21, effFio2));
    $txt('metaVtKg', ventConnected ? `${vtKg.toFixed(1)} mL/kg` : `Espont. ${vtKg.toFixed(1)}`);
    $txt('metaPF', pf);
    $txt('metaPH', v.ph.toFixed(2));

    const setMetaChipState = (id, status) => {
      const el = $id(id);
      if (!el) return;
      const cls = `status-${status}`;
      if (!el.classList.contains(cls)) {
        el.classList.remove('status-ok', 'status-warn', 'status-crit');
        el.classList.add(cls);
      }
    };
    setMetaChipState('metaChipVtKg', (vtKg > 8.5 || (ventConnected && vtKg < 4.0)) ? 'crit' : vtKg > 7.5 ? 'warn' : 'ok');
    setMetaChipState('metaChipPF', pf < 150 ? 'crit' : pf < 250 ? 'warn' : 'ok');
    setMetaChipState('metaChipPH', (v.ph < 7.20 || v.ph > 7.55) ? 'crit' : (v.ph < 7.32 || v.ph > 7.48) ? 'warn' : 'ok');

    // Estabilidade Clínica / Risco Progressivo de Parada Cardíaca (5H/5T) + Interações Medicamentosas
    const det = engine.deterioration || { risk: 0, causes: [], stage: 'stable' };
    const riskPct = Math.round(det.risk || 0);
    const inArrestNow = Boolean(p.arrested && !engine.interventions.roscAchieved);
    $txt('metaArrestRisk', inArrestNow ? 'EM PCR' : riskPct > 0 ? `${riskPct}%` : 'Estável');
    setMetaChipState('metaChipArrestRisk', (inArrestNow || riskPct >= 65) ? 'crit' : riskPct >= 25 ? 'warn' : 'ok');
    const riskChipEl = $id('metaChipArrestRisk');
    if (riskChipEl) {
      const tipParts = [];
      if (inArrestNow && det.lastArrestReason) tipParts.push(`Causa da PCR: ${det.lastArrestReason}`);
      else if (det.causes && det.causes.length) tipParts.push(`Fatores de risco ativos: ${det.causes.join(' • ')}`);
      else tipParts.push('Estável — sem critérios ativos de deterioração para PCR');
      if (engine.drugInteractions && engine.drugInteractions.length) {
        tipParts.push(`Interações: ${engine.drugInteractions.map((ix) => ix.tag).join(', ')}`);
      }
      const nextTitle = tipParts.join(' | ');
      if (riskChipEl.title !== nextTitle) riskChipEl.title = nextTitle;
    }

    // Faixa compacta de interações medicamentosas ativas na sidebar
    const ixStripEl = $id('drugInteractionsStrip');
    if (ixStripEl) {
      const ixs = engine.drugInteractions || [];
      const ixSig = ixs.map((ix) => `${ix.level}:${ix.tag}`).join('|');
      if (ixStripEl.dataset.sig !== ixSig) {
        ixStripEl.dataset.sig = ixSig;
        ixStripEl.classList.toggle('hidden', ixs.length === 0);
        ixStripEl.innerHTML = ixs
          .map((ix) => `<span class="drug-ix-pill ${ix.level === 'critical' ? 'crit' : 'warn'}" title="${escapeHtml(ix.msg)}">💊 ${escapeHtml(ix.tag)}</span>`)
          .join('');
      }
    }

    // Destaca botões de emergência quando indicados (sempre visíveis no Menu Clínico)
    const showArrestNow = inArrestNow || engine.cardiac.rhythm === 'vtach';
    const ivNow = engine.interventions;
    const isTamponadeNow = engine.scenarioId === 'cardiac_tamponade' && !ivNow.pericardiocentesisDone;
    const isThrombIndicated = (engine.scenarioId === 'pulmonary_embolism' || v.rhythm === 'stemi' || v.rhythm === 'de_winter') && !ivNow.thrombolysisGiven;
    const isProneIndicated = (pf < 150 || p.shunt >= 0.28) && !ivNow.proneActive;
    const isWarmIndicated = p.temp < 34.5 && !ivNow.warmingActive;
    const isSyncCardioIndicated = !inArrestNow && (v.rhythm === 'vtach' || v.rhythm === 'svt' || (v.rhythm === 'wpw' && v.hr >= 135) || (v.rhythm === 'afib_rvr' && (v.hr >= 150 || v.map < 78)) || (v.rhythm === 'aflutter' && v.map < 75));
    const isBloodIndicated = (engine.scenarioId === 'hemorrhagic_shock' || engine.scenarioId === 'postpartum_hemorrhage' || engine.scenarioId === 'amniotic_embolism' || (engine.cardiac.preload < 0.72 && v.map < 65)) && (ivNow.bloodUnits || 0) < 3;

    if (btnDecompress) btnDecompress.classList.toggle('urgent', Boolean(p.pneumothoraxActive));
    if (btnDefib) btnDefib.classList.toggle('urgent', showArrestNow);
    if (btnCprToggle) {
      btnCprToggle.classList.toggle('urgent', showArrestNow);
      btnCprToggle.setAttribute('aria-pressed', String(ivNow.cprActive));
    }
    if (btnPericardiocentesis) btnPericardiocentesis.classList.toggle('urgent', isTamponadeNow);
    if (btnThrombolysis) btnThrombolysis.classList.toggle('urgent', isThrombIndicated);
    if (btnPronePosition) {
      btnPronePosition.classList.toggle('urgent', isProneIndicated);
      btnPronePosition.setAttribute('aria-pressed', String(Boolean(ivNow.proneActive)));
    }
    if (btnActiveWarming) {
      btnActiveWarming.classList.toggle('urgent', isWarmIndicated);
      btnActiveWarming.setAttribute('aria-pressed', String(Boolean(ivNow.warmingActive)));
    }
    if (btnSyncCardioversion) btnSyncCardioversion.classList.toggle('urgent', isSyncCardioIndicated);
    if (btnTransfusion) {
      btnTransfusion.classList.toggle('urgent', isBloodIndicated);
      $txt('bloodCount', ivNow.bloodUnits || 0);
    }

    const pacerOnNow = Boolean(engine.externalPacer && engine.externalPacer.active);
    const isCoolIndicated = p.temp >= 39.2 && !ivNow.coolingActive;
    const isPacerIndicated = !inArrestNow && !pacerOnNow && (v.rhythm === 'av_block_3' || v.rhythm === 'av_block_2_m2' || (v.hr > 0 && v.hr < 48 && v.map < 68));
    const isOsmoIndicated = engine.scenarioId === 'tce_cushing' && !ivNow.osmotherapyGiven;
    const isSteroidIndicated = (engine.scenarioId === 'adrenal_crisis' || engine.scenarioId === 'myxedema_coma' || engine.scenarioId === 'anaphylaxis' || (engine.scenarioId === 'septic_shock' && v.map < 65)) && !ivNow.hydrocortisoneGiven;
    const isInsulinIndicated = (engine.scenarioId === 'dka_acidosis' || engine.scenarioId === 'hhs_hyperosmolar' || v.rhythm === 'hyperkalemia') && !ivNow.insulinActive;
    const isUterotonicIndicated = engine.scenarioId === 'postpartum_hemorrhage' && !ivNow.uterotonicGiven;

    if (btnActiveCooling) {
      btnActiveCooling.classList.toggle('urgent', isCoolIndicated);
      btnActiveCooling.setAttribute('aria-pressed', String(Boolean(ivNow.coolingActive)));
    }
    if (btnTranscutPacer) {
      btnTranscutPacer.classList.toggle('urgent', isPacerIndicated);
      btnTranscutPacer.setAttribute('aria-pressed', String(pacerOnNow));
    }
    if (btnOsmotherapy) btnOsmotherapy.classList.toggle('urgent', isOsmoIndicated);
    if (btnHydrocortisone) btnHydrocortisone.classList.toggle('urgent', isSteroidIndicated);
    if (btnInsulinDrip) {
      btnInsulinDrip.classList.toggle('urgent', isInsulinIndicated);
      btnInsulinDrip.setAttribute('aria-pressed', String(Boolean(ivNow.insulinActive)));
    }
    if (btnUterotonic) btnUterotonic.classList.toggle('urgent', isUterotonicIndicated);
    if (updateNumericUI._lastRhythm !== v.rhythm) {
      updateNumericUI._lastRhythm = v.rhythm;
      syncRhythmUI();
    }

    // Faixa de Alarmes & Som
    const alarms = engine.activeAlarms;
    let highest = null;
    if (alarms.some((al) => al.level === 'critical')) highest = 'critical';
    else if (alarms.length > 0) highest = 'warning';

    const mrAlarmLampEl = $id('mrAlarmLamp');
    if (mrAlarmLampEl) {
      mrAlarmLampEl.classList.toggle('warning', highest === 'warning');
      mrAlarmLampEl.classList.toggle('critical', highest === 'critical');
    }

    const alarmIconKey = p.arrested ? 'arrest' : (highest || 'ok');
    const alarmStatusIconEl = $id('alarmStatusIcon');
    if (alarmStatusIconEl && alarmStatusIconEl.dataset.iconKey !== alarmIconKey) {
      alarmStatusIconEl.dataset.iconKey = alarmIconKey;
      alarmStatusIconEl.innerHTML = ALARM_STATUS_ICONS[alarmIconKey] || ALARM_STATUS_ICONS.ok;
    }

    const nextAlarmCls = highest === 'critical' ? 'alarm-status critical' : highest === 'warning' ? 'alarm-status warning' : 'alarm-status ok';
    const nextAlarmMsg = highest ? alarms.map((al) => al.msg).join('  •  ') : 'Parâmetros dentro da faixa alvo — Monitorização e ventilação estáveis';
    if (alarmBox.className !== nextAlarmCls) alarmBox.className = nextAlarmCls;
    if (alarmText.textContent !== nextAlarmMsg) alarmText.textContent = nextAlarmMsg;

    audio.tickAlarms(highest);

    const silencedNow = audio.isSilenced();
    const mrSilBtn = $id('mrHwSilence');
    const mrPauseBtn = $id('mrHwPause');
    if (mrSilBtn) mrSilBtn.classList.toggle('active', silencedNow);
    if (mrPauseBtn) mrPauseBtn.classList.toggle('active', silencedNow);

    // Atualiza texto do botão silenciar quando expirar 2 min
    if (!silencedNow && btnSilenceAlarm.getAttribute('aria-pressed') === 'true') {
      btnSilenceAlarm.setAttribute('aria-pressed', 'false');
      btnSilenceAlarm.textContent = '🔔';
      btnSilenceAlarm.title = 'Silenciar alarmes por 2 minutos';
    }
  }

  // ================= EFEITO DE PARALAXE MULTICAMADAS (IDLE-SKIP) =================
  const pxLayers = Array.from(document.querySelectorAll('#parallaxBackdrop .px-layer'));
  const pxState = { targetX: 0, targetY: 0, curX: 0, curY: 0, scrollY: 0, lastScrollY: -1, dirty: true };

  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    pxState.targetX = nx * 28;
    pxState.targetY = ny * 20;
    pxState.dirty = true;
  }, { passive: true });

  window.addEventListener('scroll', () => {
    pxState.scrollY = window.scrollY || 0;
    pxState.dirty = true;
  }, { passive: true });

  function stepParallax(dt) {
    if (!pxLayers.length || !pxState.dirty) return;
    const alpha = Math.min(1, dt * 6);
    pxState.curX += (pxState.targetX - pxState.curX) * alpha;
    pxState.curY += (pxState.targetY - pxState.curY) * alpha;
    const dx = Math.abs(pxState.targetX - pxState.curX);
    const dy = Math.abs(pxState.targetY - pxState.curY);
    if (dx < 0.05 && dy < 0.05 && pxState.scrollY === pxState.lastScrollY) {
      pxState.dirty = false;
      return;
    }
    pxState.lastScrollY = pxState.scrollY;
    for (let i = 0; i < pxLayers.length; i++) {
      const layer = pxLayers[i];
      const depth = Number(layer.dataset.depth) || 0.2;
      const tx = (pxState.curX * depth).toFixed(2);
      const ty = (pxState.curY * depth - pxState.scrollY * depth * 0.45).toFixed(2);
      layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }
  }

  // ================= LOOP PRINCIPAL 60 FPS (COM VIEWPORT CULLING & SUPERPOWERS) =================
  function frameLoop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    stepParallax(dt);

    if (simulatorActive) {
      if (sg1Analyzer) sg1Analyzer.step(dt);
      if (!isFrozen) {
        engine.step(dt);
        monitor.step(dt);
        if (vivoGold) vivoGold.step(dt);
        if (hamC1Panel) hamC1Panel.step(dt);
      }
      if (superpowers) superpowers.step(dt, isFrozen);

      audio.stepAuscultation(engine, isFrozen || (hamStandby && engine.airway.connectedToVent));
      if (auscMeterFillEl) {
        auscMeterFillEl.style.width = `${Math.round(audio.auscLevel * 100)}%`;
      }

      // Renderiza somente dispositivos visíveis no viewport (zero GPU desperdiçada fora da tela)
      if (_visState.mon) monitor.render();
      if (vivoGold && _visState.defib && !isFrozen) vivoGold.render();
      if (hamC1Panel && _visState.c1 && !isFrozen) hamC1Panel.render();

      if (now - lastUiUpdate >= 120) {
        lastUiUpdate = now;
        updateNumericUI();
        if (auscPanel && !auscPanel.classList.contains('hidden')) {
          syncAuscultationUI();
        }
      }
    }

    requestAnimationFrame(frameLoop);
  }

  // ================= DIMENSIONAMENTO DO MONITOR, VENTILADOR, CARDIOVERSOR, BOMBA & ANALISADOR SG1 =================
  const icuGridEl = document.getElementById('icuGrid');
  const rangeDeviceScale = document.getElementById('rangeDeviceScale');
  const valDeviceScale = document.getElementById('valDeviceScale');
  const btnAutoFit = document.getElementById('btnAutoFit');
  const valSizeMon = document.getElementById('valSizeMon');
  const valSizeVent = document.getElementById('valSizeVent');
  const valSizeCardio = document.getElementById('valSizeCardio');
  const valSizePump = document.getElementById('valSizePump');
  const valSizePump2 = document.getElementById('valSizePump2');
  const valSizeSg1 = document.getElementById('valSizeSg1');
  let autoFitEnabled = true;
  let manualScalePct = 100;
  const deviceCustomPct = { mon: 70, vent: 70, cardio: 70, pump: 50, pump2: 50, sg1: 70 };
  let vgWidthPct = null;
  let pumpWidthPct = null;

  function clampScalePct(pct) {
    return Math.max(40, Math.min(140, Math.round(Number(pct) || 100)));
  }

  function applyDeviceSizing() {
    if (!icuGridEl) return;
    let targetH;
    let uiScale;

    if (autoFitEnabled) {
      const gridTop = Math.max(120, Math.round(icuGridEl.getBoundingClientRect().top));
      const avail = window.innerHeight - gridTop - 16;
      targetH = Math.max(460, Math.min(820, avail));
      uiScale = Math.max(0.75, Math.min(1.12, targetH / 680));
      const pct = Math.round(uiScale * 100);
      if (rangeDeviceScale) rangeDeviceScale.value = Math.max(60, Math.min(135, pct));
      if (valDeviceScale) valDeviceScale.textContent = 'Auto';
    } else {
      uiScale = manualScalePct / 100;
      targetH = Math.round(680 * uiScale);
      if (rangeDeviceScale) rangeDeviceScale.value = Math.max(60, Math.min(135, manualScalePct));
      if (valDeviceScale) valDeviceScale.textContent = `${manualScalePct}%`;
    }

    icuGridEl.style.setProperty('--device-h', `${targetH}px`);
    icuGridEl.style.setProperty('--ui-scale', uiScale.toFixed(3));

    const labelMap = { mon: valSizeMon, vent: valSizeVent, cardio: valSizeCardio, pump: valSizePump, pump2: valSizePump2, sg1: valSizeSg1 };
    const prefixMap = { mon: 'mon', vent: 'vent', cardio: 'vg', pump: 'pump', pump2: 'pump2', sg1: 'sg1' };

    ['mon', 'vent', 'cardio', 'pump', 'pump2', 'sg1'].forEach((dev) => {
      const custom = deviceCustomPct[dev];
      const devScale = custom !== null ? custom / 100 : uiScale;
      const devH = Math.max(300, Math.min(960, custom !== null ? Math.round(680 * devScale) : targetH));
      const pfx = prefixMap[dev];
      if (icuGridEl) {
        icuGridEl.style.setProperty(`--${pfx}-h`, `${devH}px`);
        icuGridEl.style.setProperty(`--${pfx}-scale`, devScale.toFixed(3));
      }
      if (labelMap[dev]) {
        labelMap[dev].textContent = custom !== null ? `${custom}%` : (autoFitEnabled ? 'Auto' : `${manualScalePct}%`);
      }
    });

    if (icuGridEl) {
      icuGridEl.style.setProperty('--vg-w', vgWidthPct !== null ? `${vgWidthPct}%` : '100%');
      icuGridEl.style.setProperty('--pump-w', pumpWidthPct !== null ? `${pumpWidthPct}%` : '100%');
      const pumpTargetScale = deviceCustomPct.pump !== null ? deviceCustomPct.pump / 100 : uiScale;
      if (icatuChassisEl && !icatuChassisEl.classList.contains('hidden')) {
        const actualPumpH = icatuChassisEl.getBoundingClientRect().height;
        if (actualPumpH > 0) {
          icuGridEl.style.setProperty('--pump-scale', Math.min(pumpTargetScale, actualPumpH / 680).toFixed(3));
        }
      }
      const pump2TargetScale = deviceCustomPct.pump2 !== null ? deviceCustomPct.pump2 / 100 : uiScale;
      if (icatuChassis2El && !icatuChassis2El.classList.contains('hidden')) {
        const actualPump2H = icatuChassis2El.getBoundingClientRect().height;
        if (actualPump2H > 0) {
          icuGridEl.style.setProperty('--pump2-scale', Math.min(pump2TargetScale, actualPump2H / 680).toFixed(3));
        }
      }
      const sg1TargetScale = deviceCustomPct.sg1 !== null ? deviceCustomPct.sg1 / 100 : uiScale;
      if (sg1ChassisEl && !sg1ChassisEl.classList.contains('hidden')) {
        const actualSg1H = sg1ChassisEl.getBoundingClientRect().height;
        if (actualSg1H > 0) {
          icuGridEl.style.setProperty('--sg1-scale', Math.min(sg1TargetScale, actualSg1H / 610).toFixed(3));
        }
      }
    }

    const allAuto =
      autoFitEnabled &&
      deviceCustomPct.mon === null &&
      deviceCustomPct.vent === null &&
      deviceCustomPct.cardio === null &&
      deviceCustomPct.pump === null &&
      deviceCustomPct.pump2 === null &&
      deviceCustomPct.sg1 === null &&
      vgWidthPct === null &&
      pumpWidthPct === null;
    if (btnAutoFit) btnAutoFit.classList.toggle('active', allAuto);

    if (simulatorActive) {
      requestAnimationFrame(() => {
        monitor.resizeAll();
        if (hamC1Panel && hamC1Panel.resize) hamC1Panel.resize();
        if (vivoGold) vivoGold.resize();
        if (sg1Analyzer && sg1Analyzer.resize) sg1Analyzer.resize();
      });
    }
  }

  function setDeviceLayout(layoutKey) {
    if (!icuGridEl) return;
    const simMainAreaEl = icuGridEl.closest('.sim-main-area');
    icuGridEl.classList.remove('only-mon', 'only-vent', 'only-pump', 'only-cardio', 'only-sg1');
    if (simMainAreaEl) {
      simMainAreaEl.classList.toggle('only-pump', layoutKey === 'only-pump');
      simMainAreaEl.classList.toggle('only-cardio', layoutKey === 'only-cardio');
      simMainAreaEl.classList.toggle('only-sg1', layoutKey === 'only-sg1');
      simMainAreaEl.classList.toggle('equal-four', layoutKey === '50-50');
    }
    document.querySelectorAll('.layout-pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.layout === layoutKey);
    });

    if (layoutKey === 'only-vent') {
      if (_c1ChassisEl && _c1ChassisEl.classList.contains('hidden')) {
        _c1ChassisEl.classList.remove('hidden');
        const btnC1 = document.getElementById('btnVentC1');
        if (btnC1) btnC1.classList.add('active');
      }
    }
    if (layoutKey === 'only-pump') {
      if (icatuChassisEl && icatuChassisEl.classList.contains('hidden')) {
        icatuChassisEl.classList.remove('hidden');
        if (icatuChassis2El) icatuChassis2El.classList.remove('hidden');
        if (btnPumpIcatu) btnPumpIcatu.classList.add('active');
      }
    }
    if (layoutKey === 'only-cardio') {
      if (vgChassisEl && vgChassisEl.classList.contains('hidden')) {
        vgChassisEl.classList.remove('hidden');
        if (btnCardioverter) btnCardioverter.classList.add('active');
      }
    }
    if (layoutKey === 'only-sg1') {
      if (sg1ChassisEl && sg1ChassisEl.classList.contains('hidden')) {
        sg1ChassisEl.classList.remove('hidden');
        if (btnGasSg1) btnGasSg1.classList.add('active');
      }
    }

    if (layoutKey === 'only-mon') {
      icuGridEl.classList.add('only-mon');
    } else if (layoutKey === 'only-vent') {
      icuGridEl.classList.add('only-vent');
    } else if (layoutKey === 'only-pump') {
      icuGridEl.classList.add('only-pump');
    } else if (layoutKey === 'only-cardio') {
      icuGridEl.classList.add('only-cardio');
    } else if (layoutKey === 'only-sg1') {
      icuGridEl.classList.add('only-sg1');
    } else if (layoutKey === '62-38') {
      icuGridEl.style.setProperty('--split-left', '62fr');
      icuGridEl.style.setProperty('--split-right', '38fr');
    } else if (layoutKey === '38-62') {
      icuGridEl.style.setProperty('--split-left', '38fr');
      icuGridEl.style.setProperty('--split-right', '62fr');
    } else {
      icuGridEl.style.setProperty('--split-left', '1fr');
      icuGridEl.style.setProperty('--split-right', '1fr');
      if (layoutKey === '50-50') {
        vgWidthPct = null;
        pumpWidthPct = null;
        applyDeviceSizing();
      }
    }

    requestAnimationFrame(() => {
      applyDeviceSizing();
      monitor.resizeAll();
      if (hamC1Panel && hamC1Panel.resize) hamC1Panel.resize();
      if (vivoGold) vivoGold.resize();
      if (sg1Analyzer && sg1Analyzer.resize) sg1Analyzer.resize();
    });
  }

  if (rangeDeviceScale) {
    rangeDeviceScale.addEventListener('input', (e) => {
      autoFitEnabled = false;
      manualScalePct = Number(e.target.value);
      deviceCustomPct.mon = null;
      deviceCustomPct.vent = null;
      deviceCustomPct.cardio = null;
      deviceCustomPct.pump = null;
      deviceCustomPct.pump2 = null;
      deviceCustomPct.sg1 = null;
      applyDeviceSizing();
    });
  }
  const btnScaleDownEl = document.getElementById('btnScaleDown');
  if (btnScaleDownEl) {
    btnScaleDownEl.addEventListener('click', () => {
      autoFitEnabled = false;
      manualScalePct = Math.max(60, (rangeDeviceScale ? Number(rangeDeviceScale.value) : manualScalePct) - 5);
      deviceCustomPct.mon = null;
      deviceCustomPct.vent = null;
      deviceCustomPct.cardio = null;
      deviceCustomPct.pump = null;
      deviceCustomPct.pump2 = null;
      deviceCustomPct.sg1 = null;
      applyDeviceSizing();
    });
  }
  const btnScaleUpEl = document.getElementById('btnScaleUp');
  if (btnScaleUpEl) {
    btnScaleUpEl.addEventListener('click', () => {
      autoFitEnabled = false;
      manualScalePct = Math.min(135, (rangeDeviceScale ? Number(rangeDeviceScale.value) : manualScalePct) + 5);
      deviceCustomPct.mon = null;
      deviceCustomPct.vent = null;
      deviceCustomPct.cardio = null;
      deviceCustomPct.pump = null;
      deviceCustomPct.pump2 = null;
      deviceCustomPct.sg1 = null;
      applyDeviceSizing();
    });
  }
  if (btnAutoFit) {
    btnAutoFit.addEventListener('click', () => {
      autoFitEnabled = true;
      deviceCustomPct.mon = null;
      deviceCustomPct.vent = null;
      deviceCustomPct.cardio = null;
      deviceCustomPct.pump = null;
      deviceCustomPct.pump2 = null;
      deviceCustomPct.sg1 = null;
      vgWidthPct = null;
      pumpWidthPct = null;
      if (icuGridEl) {
        icuGridEl.style.setProperty('--split-left', '1fr');
        icuGridEl.style.setProperty('--split-right', '1fr');
      }
      applyDeviceSizing();
    });
  }
  document.querySelectorAll('[data-dev-resize]').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.playUiClick('soft');
      const dev = btn.dataset.devResize;
      const dir = Number(btn.dataset.dir) || 1;
      const baseAutoPct = Math.round((autoFitEnabled ? Number(icuGridEl.style.getPropertyValue('--ui-scale') || 1) * 100 : manualScalePct));
      const curPct = deviceCustomPct[dev] !== null ? deviceCustomPct[dev] : baseAutoPct;
      deviceCustomPct[dev] = clampScalePct(curPct + dir * 5);
      applyDeviceSizing();
    });
  });

  // Alças de redimensionamento direto nos cantos (Monitor, Ventilador, Cardioversor, Bomba e Analisador SG1)
  document.querySelectorAll('.device-resize-handle[data-resize-target]').forEach((handle) => {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPct = 100;
    const target = handle.dataset.resizeTarget;

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const baseAutoPct = Math.round(Number(icuGridEl.style.getPropertyValue('--ui-scale') || 1) * 100);
      startPct = deviceCustomPct[target] !== null ? deviceCustomPct[target] : baseAutoPct;
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const deltaPct = Math.round(dy / 5.5);
      deviceCustomPct[target] = clampScalePct(startPct + deltaPct);

      if (Math.abs(dx) > 8 && icuGridEl && !icuGridEl.classList.contains('only-mon') && !icuGridEl.classList.contains('only-vent') && !icuGridEl.classList.contains('only-pump') && !icuGridEl.classList.contains('only-cardio') && !icuGridEl.classList.contains('only-sg1')) {
        const rect = icuGridEl.getBoundingClientRect();
        const isLeftCol = target === 'mon' || target === 'pump' || target === 'cardio';
        const rel = isLeftCol ? (e.clientX - rect.left) / Math.max(200, rect.width) : 1 - (rect.right - e.clientX) / Math.max(200, rect.width);
        const leftPct = Math.max(30, Math.min(70, Math.round(rel * 100)));
        icuGridEl.style.setProperty('--split-left', `${leftPct}fr`);
        icuGridEl.style.setProperty('--split-right', `${100 - leftPct}fr`);
      }
      applyDeviceSizing();
    });

    const stopResize = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      applyDeviceSizing();
    };
    handle.addEventListener('pointerup', stopResize);
    handle.addEventListener('pointercancel', stopResize);
  });
  document.querySelectorAll('.layout-pill').forEach((btn) => {
    btn.addEventListener('click', () => setDeviceLayout(btn.dataset.layout));
  });

  function wireSplitterDrag(splitterEl, gridEl, leftVar, rightVar, onResize) {
    if (!splitterEl || !gridEl) return;
    let draggingSplit = false;
    splitterEl.addEventListener('pointerdown', (e) => {
      draggingSplit = true;
      splitterEl.classList.add('dragging');
      splitterEl.setPointerCapture(e.pointerId);
    });
    splitterEl.addEventListener('pointermove', (e) => {
      if (!draggingSplit) return;
      const rect = gridEl.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / Math.max(200, rect.width);
      const leftPct = Math.max(30, Math.min(70, Math.round(rel * 100)));
      gridEl.style.setProperty(leftVar, `${leftPct}fr`);
      gridEl.style.setProperty(rightVar, `${100 - leftPct}fr`);
      document.querySelectorAll('.layout-pill').forEach((b) => b.classList.remove('active'));
      if (onResize) onResize();
    });
    const endDrag = () => {
      if (!draggingSplit) return;
      draggingSplit = false;
      splitterEl.classList.remove('dragging');
    };
    splitterEl.addEventListener('pointerup', endDrag);
    splitterEl.addEventListener('pointercancel', endDrag);
  }

  wireSplitterDrag(document.getElementById('icuSplitter'), icuGridEl, '--split-left', '--split-right', () => {
    monitor.resizeAll();
    if (hamC1Panel && hamC1Panel.resize) hamC1Panel.resize();
    if (vivoGold) vivoGold.resize();
  });

  function showSimulator(scenarioId) {
    if (scenarioId) {
      engine.loadScenario(scenarioId);
    }
    if (presentationEl) presentationEl.classList.add('hidden');
    if (simulatorEl) simulatorEl.classList.remove('hidden');
    simulatorActive = true;
    lastFrameTime = performance.now();
    refreshScenarioUI();
    updateNumericUI();
    applyDeviceSizing();
  }

  function showPresentation() {
    if (!presentationEl) return;
    simulatorActive = false;
    if (simulatorEl) simulatorEl.classList.add('hidden');
    presentationEl.classList.remove('hidden');
    audio.setQrsEnabled(false);
    audio.setAuscultationEnabled(false);
    if (auscPanel) auscPanel.classList.add('hidden');
    syncAuscultationUI();
    btnQrsBeep.setAttribute('aria-pressed', 'false');
  }

  const btnBackToSlidesEl = document.getElementById('btnBackToSlides');
  if (btnBackToSlidesEl) {
    btnBackToSlidesEl.addEventListener('click', showPresentation);
  }

  if (Superpowers) {
    superpowers = new Superpowers({
      engine,
      onLog: addLog,
      onStateRestored: () => {
        refreshScenarioUI();
        updateNumericUI();
      },
      setFrozen: (f) => {
        isFrozen = Boolean(f);
        monitor.setFrozen(isFrozen);
      }
    });
  }

  // Inicialização unificada: suporta Apresentação + ?modo=simulador / #simulador / #caso=...
  window.addEventListener('resize', () => {
    if (simulatorActive) {
      applyDeviceSizing();
    }
  });

  const _qs = new URLSearchParams(window.location.search);
  const _directSim =
    Boolean(window.__UTICOMED_DIRECT_SIM__) ||
    _qs.get('modo') === 'simulador' ||
    _qs.get('tela') === 'sala' ||
    window.location.hash === '#simulador' ||
    window.location.hash.startsWith('#caso=');

  if (presentationEl && typeof SlidePresentation === 'function' && !_directSim) {
    new SlidePresentation(showSimulator);
    refreshScenarioUI();
  } else {
    if (presentationEl && typeof SlidePresentation === 'function') {
      new SlidePresentation(showSimulator);
    }
    showSimulator('stable');
  }
  // API interna limpa para módulos extras (POCUS, Plantão Cego, Debriefing & Carrinho de Parada)
  window.__uticomed = {
    engine,
    audio,
    SCENARIOS,
    BOLUS_DRUGS,
    addLog,
    refreshScenarioUI,
    syncAirwayO2AndPharmaUI,
    syncPhysiologyModalInputs,
    syncRhythmUI,
    resetEquipmentOnScenarioChange,
    onScenarioChange: []
  };
  if (typeof window.ICUSim.initBedsideTools === 'function') {
    window.ICUSim.initBedsideTools(window.__uticomed);
  }

  addLog('UTICoMed v2 Otimizado — Modo offline pronto');
  requestAnimationFrame(frameLoop);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
