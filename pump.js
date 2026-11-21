/**
 * Bomba de Infusão Volumétrica Samtronic Icatu 4.0 (DERS)
 * Modos: Dose/Peso, Vazão×Volume, TCI (5 fármacos / 15 protocolos),
 * PCA (7 protocolos), Rampa, Bolus Intermitente, Pausa e Sequencial (até 20 etapas).
 */
(function (global) {
  'use strict';

  const ICATU_MODES = [
    { id: 'dose_peso', label: 'Dose / Peso (DERS)', tag: 'DP' },
    { id: 'vazao_vol', label: 'Vazão × Volume', tag: 'VV' },
    { id: 'tci', label: 'TCI (Alvo-Controlada • 15 Prot.)', tag: 'TCI' },
    { id: 'pca', label: 'PCA (Analgesia Paciente • 7 Prot.)', tag: 'PCA' },
    { id: 'rampa', label: 'Rampa (Subida / Platô)', tag: 'RP' },
    { id: 'bolus_int', label: 'Bolus Intermitente', tag: 'BI' },
    { id: 'pausa', label: 'Pausa Programada', tag: 'PS' },
    { id: 'sequencial', label: 'Sequencial (até 20 Etapas)', tag: 'SQ' }
  ];

  // 5 Fármacos parametrizados em TCI
  const TCI_DRUGS = [
    { id: 'dexmedetomidina', name: 'Dexmedetomidina', model: 'Hannivoort / Dyck', unit: 'ng/mL', step: 0.10, min: 0.10, max: 2.00 },
    { id: 'propofol', name: 'Propofol 1%', model: 'Marsh / Schnider', unit: 'mcg/mL', step: 0.25, min: 0.50, max: 8.00 },
    { id: 'remifentanil', name: 'Remifentanil', model: 'Minto', unit: 'ng/mL', step: 0.50, min: 0.50, max: 12.00 },
    { id: 'sufentanil', name: 'Sufentanil', model: 'Gepts', unit: 'ng/mL', step: 0.05, min: 0.05, max: 1.50 },
    { id: 'midazolam', name: 'Midazolam', model: 'Zomorodi', unit: 'ng/mL', step: 20, min: 20, max: 400 }
  ];

  // 15 Protocolos TCI (3 por fármaco parametrizado)
  const TCI_PROTOCOLS = [
    { id: 'tci_dex_1', drugId: 'dexmedetomidina', name: '1. Dexmedetomidina • Hannivoort Sedação Leve UTI', model: 'Hannivoort (Ce)', target: 0.50, unit: 'ng/mL' },
    { id: 'tci_dex_2', drugId: 'dexmedetomidina', name: '2. Dexmedetomidina • Hannivoort Despertar Cooperativo', model: 'Hannivoort (Cp)', target: 0.80, unit: 'ng/mL' },
    { id: 'tci_dex_3', drugId: 'dexmedetomidina', name: '3. Dexmedetomidina • Dyck Analgossedação em VM', model: 'Dyck (Ce)', target: 1.20, unit: 'ng/mL' },
    { id: 'tci_pro_1', drugId: 'propofol', name: '4. Propofol • Marsh Indução TIVA Adulto', model: 'Marsh (Cp)', target: 4.00, unit: 'mcg/mL' },
    { id: 'tci_pro_2', drugId: 'propofol', name: '5. Propofol • Marsh Manutenção Cirúrgica/UTI', model: 'Marsh (Ce)', target: 3.00, unit: 'mcg/mL' },
    { id: 'tci_pro_3', drugId: 'propofol', name: '6. Propofol • Schnider Idoso / Reserva Reduzida', model: 'Schnider (Ce)', target: 2.00, unit: 'mcg/mL' },
    { id: 'tci_rem_1', drugId: 'remifentanil', name: '7. Remifentanil • Minto Analgesia Basal Contínua', model: 'Minto (Ce)', target: 2.00, unit: 'ng/mL' },
    { id: 'tci_rem_2', drugId: 'remifentanil', name: '8. Remifentanil • Minto Laringoscopia / Intubação', model: 'Minto (Ce)', target: 5.00, unit: 'ng/mL' },
    { id: 'tci_rem_3', drugId: 'remifentanil', name: '9. Remifentanil • Minto Desmame / Pós-Operatório', model: 'Minto (Cp)', target: 1.20, unit: 'ng/mL' },
    { id: 'tci_suf_1', drugId: 'sufentanil', name: '10. Sufentanil • Gepts Analgesia Profunda UTI', model: 'Gepts (Ce)', target: 0.35, unit: 'ng/mL' },
    { id: 'tci_suf_2', drugId: 'sufentanil', name: '11. Sufentanil • Gepts Cardiopatia Estável', model: 'Gepts (Cp)', target: 0.50, unit: 'ng/mL' },
    { id: 'tci_suf_3', drugId: 'sufentanil', name: '12. Sufentanil • Gepts Neuro / Trauma Grave', model: 'Gepts (Ce)', target: 0.25, unit: 'ng/mL' },
    { id: 'tci_mid_1', drugId: 'midazolam', name: '13. Midazolam • Zomorodi Sedação Contínua VM', model: 'Zomorodi (Cp)', target: 120, unit: 'ng/mL' },
    { id: 'tci_mid_2', drugId: 'midazolam', name: '14. Midazolam • Zomorodi Estado de Mal Epiléptico', model: 'Zomorodi (Cp)', target: 260, unit: 'ng/mL' },
    { id: 'tci_mid_3', drugId: 'midazolam', name: '15. Midazolam • Zomorodi Ansiólise / Desmame', model: 'Zomorodi (Cp)', target: 60, unit: 'ng/mL' }
  ];

  // 7 Protocolos PCA (Analgesia Controlada pelo Paciente)
  const PCA_PROTOCOLS = [
    { id: 'pca_1', drugId: 'morfina', name: '1. Morfina Pós-Op Padrão', demand: 1.0, unit: 'mg', lockoutMin: 8, basalRate: 0.5 },
    { id: 'pca_2', drugId: 'morfina', name: '2. Morfina Idoso / Disfunção Renal', demand: 0.5, unit: 'mg', lockoutMin: 12, basalRate: 0.0 },
    { id: 'pca_3', drugId: 'fentanil', name: '3. Fentanil Pós-Op Agudo', demand: 0.4, unit: 'mcg/kg', lockoutMin: 6, basalRate: 0.5 },
    { id: 'pca_4', drugId: 'fentanil', name: '4. Fentanil UTI Ventilado', demand: 0.5, unit: 'mcg/kg', lockoutMin: 8, basalRate: 1.5 },
    { id: 'pca_5', drugId: 'morfina', name: '5. Morfina Oncologia / Dor Refratária', demand: 2.0, unit: 'mg', lockoutMin: 6, basalRate: 1.5 },
    { id: 'pca_6', drugId: 'sufentanil', name: '6. Sufentanil Analgesia Avançada', demand: 0.1, unit: 'mcg/kg', lockoutMin: 10, basalRate: 0.15 },
    { id: 'pca_7', drugId: 'remifentanil', name: '7. Remifentanil Obstétrico / Curta Ação', demand: 0.05, unit: 'mcg/kg', lockoutMin: 3, basalRate: 0.04 }
  ];

  const SAM_SECTORS = ['UTI', 'CC', 'EME', 'PED'];
  const SAM_EQUIPOS = [
    { id: 'Icaset Macro (20 gts/mL)', short: 'Icaset Macro 20' },
    { id: 'Icaset Micro (60 gts/mL)', short: 'Icaset Micro 60' },
    { id: 'Icaset Foto-protetor', short: 'Foto-protetor' }
  ];
  const MENU_TITLES = {
    main: 'MENUS SAMTRONIC ICATUS 4.0',
    modes: 'MODOS DE INFUSÃO (8)',
    tci: 'TCI • 15 PROTOCOLOS / 5 FÁRMACOS',
    pca: 'PCA • 7 PROTOCOLOS ANALGESIA',
    rampa: 'RAMPA (SUBIDA • PLATÔ • DESCIDA)',
    bolus_int: 'BOLUS INTERMITENTE',
    pausa: 'PAUSA PROGRAMADA',
    sequencial: 'SEQUENCIAL (ATÉ 20 ETAPAS)',
    vazao_vol: 'VAZÃO × VOLUME (VTBI & PURGA)',
    ders: 'BIBLIOTECA DERS • FÁRMACOS',
    occlusion: 'OCLUSÃO, SENSOR & KVO',
    config: 'CONFIGURAÇÕES GERAIS ICATUS 4.0',
    history: 'BALANÇO, SamLOG® & SISTEMA'
  };

  function formatHms(secTotal) {
    const s = Math.max(0, Math.floor(secTotal || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  class SamtronicIcatuPump {
    constructor(engine, ivDrugs, ivDrugMap, audio, onGlobalSync, options = {}) {
      this.engine = engine;
      this.ivDrugs = ivDrugs || [];
      this.ivDrugMap = ivDrugMap || {};
      this.audio = audio;
      this.onGlobalSync = onGlobalSync;

      this.pumpIndex = Number(options.pumpIndex) || 0;
      this.idSuffix = options.idSuffix || '';
      const chassisId = options.chassisId || (this.idSuffix ? `icatuChassis${this.idSuffix}` : 'icatuChassis');

      this.screen = 'home'; // 'home' | key from MENU_TITLES
      this.detailsMode = false;
      this.stepScale = 1;
      this.menuSig = '';
      this.ctxBarSig = '';
      this.seqEditIdx = 0;
      this.tciFilterDrug = 'all';
      this._elCache = new Map();

      this.chassisEl = document.getElementById(chassisId) || SamtronicIcatuPump.mountClone(chassisId, this.idSuffix, options.resizeTarget);
      this._bindEvents();
      this.syncUI();
    }

    static mountClone(chassisId, idSuffix, resizeTarget) {
      const src = document.getElementById('icatuChassis');
      if (!src || !idSuffix) return null;
      const clone = src.cloneNode(true);
      clone.id = chassisId;
      clone.setAttribute('aria-label', `Bomba de Infusão Samtronic Icatu 4.0 #${idSuffix}`);
      clone.querySelectorAll('[id]').forEach((el) => {
        el.id = `${el.id}${idSuffix}`;
      });
      const rh = clone.querySelector('[data-resize-target]');
      if (rh) rh.setAttribute('data-resize-target', resizeTarget || `pump${idSuffix}`);
      src.insertAdjacentElement('afterend', clone);
      return clone;
    }

    _el(baseId) {
      let el = this._elCache.get(baseId);
      if (el === undefined) {
        el = document.getElementById(`${baseId}${this.idSuffix}`);
        this._elCache.set(baseId, el);
      }
      return el;
    }

    get ch() {
      return (this.engine.pumps && this.engine.pumps[this.pumpIndex]) || null;
    }

    resetUI() {
      this.screen = 'home';
      this.detailsMode = false;
      this.stepScale = 1;
      this.seqEditIdx = 0;
      this.tciFilterDrug = 'all';
      this.menuSig = '';
      this.ctxBarSig = '';
      this.syncUI();
    }

    _bindEvents() {
      if (!this.chassisEl) return;

      this.chassisEl.addEventListener('click', (e) => {
        const actBtn = e.target.closest('[data-icatu-action]');
        if (actBtn) {
          if (this.audio) {
            const act = actBtn.dataset.icatuAction;
            this.audio.playUiClick(act === 'toggleRun' || act === 'bolus' || act === 'pcaDemand' ? 'hw' : act === 'silence' ? 'silence' : 'soft');
          }
          this._handleAction(actBtn.dataset.icatuAction, actBtn.dataset.icatuVal);
          return;
        }
        const mBtn = e.target.closest('[data-icatu-menu]');
        if (mBtn) {
          if (this.audio) this.audio.playUiClick('soft');
          this._handleMenuCmd(mBtn.dataset.icatuMenu, mBtn.dataset.icatuVal);
        }
      });

      this.chassisEl.addEventListener('change', (e) => {
        const ch = this.ch;
        if (!ch) return;
        if (ch.keyLocked) {
          this.engine._logPumpEvent(ch, 'Teclado bloqueado 🔒 — destrave via cadeado ou Config. Gerais');
          this.ctxBarSig = '';
          this.syncUI();
          return;
        }
        if (e.target.dataset && e.target.dataset.tciSelect) {
          this._applyTciProtocol(e.target.value);
        } else if (e.target.dataset && e.target.dataset.pcaSelect) {
          this._applyPcaProtocol(e.target.value);
        }
      });
    }

    _setInfusionMode(modeId) {
      const ch = this.ch;
      if (!ch) return;
      this.engine.setPumpConfig(this.pumpIndex, { mode: modeId, kvoActive: false });
      if (modeId === 'tci') {
        this._applyTciProtocol(ch.tciProtocolId || TCI_PROTOCOLS[0].id);
      } else if (modeId === 'pca') {
        this._applyPcaProtocol(ch.pcaProtocolId || PCA_PROTOCOLS[0].id);
      } else if (modeId === 'rampa') {
        ch.rampElapsedSec = 0;
      } else if (modeId === 'pausa') {
        ch.pauseActive = true;
        ch.pauseRemainingSec = (ch.pauseDurationMin || 15) * 60;
      } else if (modeId === 'bolus_int') {
        ch.interCountdownSec = (ch.interIntervalMin || 30) * 60;
      }
      this.menuSig = '';
      this.syncUI();
    }

    _applyTciProtocol(protoId) {
      const ch = this.ch;
      const proto = TCI_PROTOCOLS.find((p) => p.id === protoId) || TCI_PROTOCOLS[0];
      if (!ch || !proto) return;
      const prevDrug = ch.tciDrugId;
      ch.mode = 'tci';
      ch.tciProtocolId = proto.id;
      ch.tciDrugId = proto.drugId;
      ch.tciModel = proto.model;
      ch.tciTarget = proto.target;
      ch.tciUnit = proto.unit;
      ch.drugId = proto.drugId;
      if (prevDrug && prevDrug !== proto.drugId) {
        ch.tciCurrent = 0;
      }
      const d = this.ivDrugMap[proto.drugId];
      if (d) ch.rate = d.defaultRate;
      this.engine._logPumpEvent(ch, `TCI Protocolo → ${proto.name}`);
      this.menuSig = '';
      this.syncUI();
    }

    _applyPcaProtocol(protoId) {
      const ch = this.ch;
      const proto = PCA_PROTOCOLS.find((p) => p.id === protoId) || PCA_PROTOCOLS[0];
      if (!ch || !proto) return;
      ch.mode = 'pca';
      ch.pcaProtocolId = proto.id;
      ch.pcaDemandDose = proto.demand;
      ch.pcaUnit = proto.unit;
      ch.pcaLockoutMin = proto.lockoutMin;
      ch.pcaLockoutSec = 0;
      ch.drugId = proto.drugId;
      ch.rate = proto.basalRate;
      this.engine._logPumpEvent(ch, `PCA Protocolo → ${proto.name}`);
      this.menuSig = '';
      this.syncUI();
    }

    _handleAction(action) {
      const ch = this.ch;
      if (!ch) return;

      const unlockedAllowed = ['toggleMenu', 'softLeft', 'details', 'silence', 'occlusion', 'clamp'];
      if (ch.keyLocked && !unlockedAllowed.includes(action)) {
        this.engine._logPumpEvent(ch, 'Teclado bloqueado 🔒 — destrave via cadeado ou Config. Gerais');
        this.syncUI();
        if (this.onGlobalSync) this.onGlobalSync();
        return;
      }

      switch (action) {
        case 'toggleRun':
          this.engine.togglePumpChannelRun(this.pumpIndex);
          break;
        case 'up':
        case 'down': {
          const dir = action === 'up' ? 1 : -1;
          if (ch.mode === 'tci') {
            const dSpec = TCI_DRUGS.find((x) => x.id === ch.tciDrugId) || TCI_DRUGS[0];
            ch.tciTarget = Math.max(dSpec.min, Math.min(dSpec.max, Number((ch.tciTarget + dir * dSpec.step * this.stepScale).toFixed(2))));
          } else if (ch.mode === 'vazao_vol') {
            ch.directFlowMlH = Math.max(1, Math.min(400, Number(((ch.directFlowMlH || 25) + dir * 5 * this.stepScale).toFixed(1))));
          } else if (ch.mode === 'rampa') {
            ch.rampPlateauMlH = Math.max(5, Math.min(300, Math.round((ch.rampPlateauMlH || 40) + dir * 5 * this.stepScale)));
          } else if (ch.mode === 'sequencial') {
            const st = ch.seqSteps[ch.seqCurrentIdx || 0] || ch.seqSteps[0];
            if (st) st.flowMlH = Math.max(1, Math.min(300, Math.round(st.flowMlH + dir * 5 * this.stepScale)));
          } else {
            const drug = this.ivDrugMap[ch.drugId] || this.ivDrugs[0];
            const delta = dir * drug.step * this.stepScale;
            this.engine.setPumpChannelRate(this.pumpIndex, ch.rate + delta);
          }
          break;
        }
        case 'step':
          this.stepScale = this.stepScale === 1 ? 2 : this.stepScale === 2 ? 0.5 : 1;
          break;
        case 'nextProtocol':
          if (ch.mode === 'tci') {
            const idx = TCI_PROTOCOLS.findIndex((p) => p.id === ch.tciProtocolId);
            this._applyTciProtocol(TCI_PROTOCOLS[(idx + 1) % TCI_PROTOCOLS.length].id);
          } else if (ch.mode === 'pca') {
            const idx = PCA_PROTOCOLS.findIndex((p) => p.id === ch.pcaProtocolId);
            this._applyPcaProtocol(PCA_PROTOCOLS[(idx + 1) % PCA_PROTOCOLS.length].id);
          } else if (ch.mode === 'sequencial') {
            const steps = ch.seqSteps || [];
            if (steps.length > 0) {
              ch.seqCurrentIdx = ((ch.seqCurrentIdx || 0) + 1) % steps.length;
              ch.seqStepVolMl = 0;
              this.seqEditIdx = ch.seqCurrentIdx;
            }
          } else if (ch.mode === 'rampa') {
            const opts = [20, 40, 60, 80];
            ch.rampPlateauMlH = opts[(opts.indexOf(ch.rampPlateauMlH) + 1) % opts.length];
          } else if (ch.mode === 'bolus_int') {
            const opts = [15, 30, 45, 60];
            ch.interIntervalMin = opts[(opts.indexOf(ch.interIntervalMin) + 1) % opts.length];
            ch.interCountdownSec = ch.interIntervalMin * 60;
          } else if (ch.mode === 'pausa') {
            const opts = [5, 10, 15, 30];
            ch.pauseDurationMin = opts[(opts.indexOf(ch.pauseDurationMin) + 1) % opts.length];
            ch.pauseRemainingSec = ch.pauseDurationMin * 60;
          } else {
            const dIdx = this.ivDrugs.findIndex((d) => d.id === ch.drugId);
            const nextDrug = this.ivDrugs[(dIdx + 1) % this.ivDrugs.length];
            if (nextDrug) this.engine.setPumpChannelDrug(this.pumpIndex, nextDrug.id);
          }
          break;
        case 'pcaDemand':
          this.engine.triggerPcaDemand(this.pumpIndex);
          break;
        case 'togglePauseTimer':
          ch.pauseActive = !ch.pauseActive;
          if (ch.pauseActive && (!ch.pauseRemainingSec || ch.pauseRemainingSec <= 0)) {
            ch.pauseRemainingSec = (ch.pauseDurationMin || 15) * 60;
          }
          this.engine._logPumpEvent(ch, ch.pauseActive ? `Pausa cronometrada ativada (${ch.pauseDurationMin} min)` : 'Pausa encerrada manualmente');
          break;
        case 'bolus':
          this.engine.triggerPumpBolus(this.pumpIndex);
          break;
        case 'occlusion':
          this.engine.togglePumpChannelOcclusion(this.pumpIndex);
          break;
        case 'silence':
          this.engine.silencePumpChannelAlarm(this.pumpIndex);
          break;
        case 'details':
          if (this.screen === 'home') {
            this.detailsMode = !this.detailsMode;
          } else {
            this.screen = 'home';
            this.menuSig = '';
          }
          break;
        case 'softLeft':
          if (this.screen === 'home') {
            this.engine.resetPumpChannelVolume(this.pumpIndex);
          } else if (this.screen === 'main') {
            this.screen = 'home';
            this.menuSig = '';
          } else {
            this.screen = 'main';
            this.menuSig = '';
          }
          break;
        case 'toggleMenu':
          if (this.screen === 'home') {
            this.screen = 'main';
          } else {
            this.screen = 'home';
          }
          this.menuSig = '';
          break;
        case 'clamp':
          this.engine._logPumpEvent(ch, 'Samtronic Icatu 4.0: Suporte de soro travado');
          break;
        default:
          break;
      }

      this.syncUI();
      if (this.onGlobalSync) this.onGlobalSync();
    }

    _handleMenuCmd(cmd, val) {
      const ch = this.ch;
      if (!ch) return;

      const menuUnlockedAllowed = ['open', 'applyHome', 'toggleLock'];
      if (ch.keyLocked && !menuUnlockedAllowed.includes(cmd)) {
        this.engine._logPumpEvent(ch, 'Teclado bloqueado 🔒 — destrave via cadeado ou Config. Gerais');
        this.syncUI();
        if (this.onGlobalSync) this.onGlobalSync();
        return;
      }

      switch (cmd) {
        case 'open':
          this.screen = val || 'main';
          this.menuSig = '';
          break;
        case 'setMode':
          this._setInfusionMode(val);
          this.screen = ['tci', 'pca', 'rampa', 'bolus_int', 'pausa', 'sequencial'].includes(val) ? val : 'home';
          this.menuSig = '';
          break;
        case 'setSector':
          this.engine.setPumpConfig(this.pumpIndex, { sector: val });
          break;
        case 'tciDrugFilter': {
          this.tciFilterDrug = val || 'all';
          if (this.tciFilterDrug !== 'all' && ch.tciDrugId !== this.tciFilterDrug) {
            const firstProto = TCI_PROTOCOLS.find((p) => p.drugId === this.tciFilterDrug);
            if (firstProto) this._applyTciProtocol(firstProto.id);
          }
          break;
        }
        case 'tciTargetAdj': {
          const dSpec = TCI_DRUGS.find((x) => x.id === ch.tciDrugId) || TCI_DRUGS[0];
          const nextT = (ch.tciTarget || dSpec.min) + Number(val) * dSpec.step;
          ch.tciTarget = Math.max(dSpec.min, Math.min(dSpec.max, Number(nextT.toFixed(2))));
          break;
        }
        case 'tciBioAdj': {
          const [field, delta] = String(val).split(':');
          if (field === 'weight') {
            this.engine.patient.weightKg = Math.max(30, Math.min(200, (this.engine.patient.weightKg || 70) + Number(delta)));
          } else if (field === 'age') {
            ch.patientAge = Math.max(12, Math.min(99, (ch.patientAge || 48) + Number(delta)));
          } else if (field === 'height') {
            ch.patientHeightCm = Math.max(120, Math.min(210, (ch.patientHeightCm || 172) + Number(delta)));
          } else if (field === 'sex') {
            ch.patientSex = ch.patientSex === 'F' ? 'M' : 'F';
          }
          break;
        }
        case 'tciProto':
          this._applyTciProtocol(val);
          break;
        case 'pcaProto':
          this._applyPcaProtocol(val);
          break;
        case 'pcaAdj': {
          const [field, delta] = String(val).split(':');
          if (field === 'dem') ch.pcaDemandDose = Math.max(0.05, Math.min(10, Number(((ch.pcaDemandDose || 1) + Number(delta)).toFixed(2))));
          if (field === 'lock') ch.pcaLockoutMin = Math.max(1, Math.min(30, (ch.pcaLockoutMin || 8) + Number(delta)));
          if (field === 'basal') ch.rate = Math.max(0, Math.min(10, Number(((ch.rate || 0) + Number(delta)).toFixed(2))));
          break;
        }
        case 'pcaDemand':
          this.engine.triggerPcaDemand(this.pumpIndex);
          break;
        case 'rampAdj': {
          const [field, delta] = String(val).split(':');
          if (field === 'up') ch.rampUpMin = Math.max(1, Math.min(60, (ch.rampUpMin || 10) + Number(delta)));
          if (field === 'plat') ch.rampPlateauMlH = Math.max(5, Math.min(300, (ch.rampPlateauMlH || 40) + Number(delta)));
          if (field === 'down') ch.rampDownMin = Math.max(1, Math.min(60, (ch.rampDownMin || 10) + Number(delta)));
          break;
        }
        case 'interAdj': {
          const [field, delta] = String(val).split(':');
          if (field === 'vol') ch.interBolusMl = Math.max(1, Math.min(50, (ch.interBolusMl || 5) + Number(delta)));
          if (field === 'int') {
            ch.interIntervalMin = Math.max(5, Math.min(240, (ch.interIntervalMin || 30) + Number(delta)));
            ch.interCountdownSec = ch.interIntervalMin * 60;
          }
          break;
        }
        case 'pauseAdj':
          ch.pauseDurationMin = Math.max(1, Math.min(180, (ch.pauseDurationMin || 15) + Number(val)));
          ch.pauseRemainingSec = ch.pauseDurationMin * 60;
          break;
        case 'pauseToggle':
          ch.pauseActive = !ch.pauseActive;
          ch.mode = 'pausa';
          if (ch.pauseActive) ch.pauseRemainingSec = (ch.pauseDurationMin || 15) * 60;
          break;
        case 'seqAdd':
          if (ch.seqSteps.length < 20) {
            const last = ch.seqSteps[ch.seqSteps.length - 1] || { flowMlH: 20, vtbiMl: 25 };
            ch.seqSteps.push({ flowMlH: last.flowMlH, vtbiMl: last.vtbiMl });
            this.seqEditIdx = ch.seqSteps.length - 1;
            ch.mode = 'sequencial';
          }
          break;
        case 'seqRemove':
          if (ch.seqSteps.length > 1) {
            ch.seqSteps.splice(this.seqEditIdx, 1);
            this.seqEditIdx = Math.max(0, Math.min(ch.seqSteps.length - 1, this.seqEditIdx));
          }
          break;
        case 'seqFill20':
          ch.seqSteps = Array.from({ length: 20 }, (_, i) => ({
            flowMlH: 10 + (i % 5) * 10,
            vtbiMl: 20
          }));
          this.seqEditIdx = 0;
          ch.seqCurrentIdx = 0;
          ch.seqStepVolMl = 0;
          ch.mode = 'sequencial';
          this.engine._logPumpEvent(ch, 'Sequencial: 20 etapas programadas');
          break;
        case 'seqSelect':
          this.seqEditIdx = Math.max(0, Math.min(ch.seqSteps.length - 1, Number(val) || 0));
          break;
        case 'seqStepFlow': {
          const st = ch.seqSteps[this.seqEditIdx];
          if (st) st.flowMlH = Math.max(1, Math.min(300, st.flowMlH + Number(val)));
          break;
        }
        case 'seqStepVol': {
          const st = ch.seqSteps[this.seqEditIdx];
          if (st) st.vtbiMl = Math.max(1, Math.min(500, st.vtbiMl + Number(val)));
          break;
        }
        case 'vazaoAdj': {
          const [field, delta] = String(val).split(':');
          if (field === 'flow') {
            ch.directFlowMlH = Math.max(0.1, Math.min(999, Number(((ch.directFlowMlH || 25) + Number(delta)).toFixed(1))));
          } else if (field === 'vtbi') {
            const nextV = delta === '0' ? 0 : Math.max(0, Math.min(9999, (ch.vtbiMl || 0) + Number(delta)));
            this.engine.setPumpConfig(this.pumpIndex, { vtbiMl: nextV });
          } else if (field === 'bolusRate') {
            ch.bolusRateMlH = Math.max(50, Math.min(800, (ch.bolusRateMlH || 200) + Number(delta)));
          }
          break;
        }
        case 'purgeLine':
          this.engine.triggerPumpPurge(this.pumpIndex);
          break;
        case 'setDrug':
          this.engine.setPumpChannelDrug(this.pumpIndex, val);
          this.screen = 'home';
          break;
        case 'setOccLim':
          this.engine.setPumpConfig(this.pumpIndex, { occlusionLimitKpa: Math.max(20, Math.min(110, Number(val) || 55)) });
          break;
        case 'occAdj':
          this.engine.setPumpConfig(this.pumpIndex, { occlusionLimitKpa: Math.max(20, Math.min(110, (ch.occlusionLimitKpa || 55) + Number(val))) });
          break;
        case 'toggleOccTest':
          this.engine.togglePumpChannelOcclusion(this.pumpIndex);
          break;
        case 'toggleAntiBolus':
          this.engine.setPumpConfig(this.pumpIndex, { antiBolus: !ch.antiBolus });
          break;
        case 'setAirBubble':
          this.engine.setPumpConfig(this.pumpIndex, { airBubbleUl: Number(val) || 100 });
          break;
        case 'toggleDropSensor':
          this.engine.setPumpConfig(this.pumpIndex, { dropSensorOn: !ch.dropSensorOn });
          break;
        case 'kvoAdj': {
          const nextKvo = Math.max(0, Math.min(5, Number(((ch.kvoRateMlH || 0) + Number(val)).toFixed(1))));
          this.engine.setPumpConfig(this.pumpIndex, { kvoRateMlH: nextKvo });
          break;
        }
        case 'brightAdj':
          ch.brightnessPct = Math.max(40, Math.min(100, (ch.brightnessPct || 100) + Number(val)));
          break;
        case 'toggleNight':
          this.engine.setPumpConfig(this.pumpIndex, { nightMode: !ch.nightMode });
          break;
        case 'setAudio':
          this.engine.setPumpConfig(this.pumpIndex, { audioLevel: val || 'Médio' });
          break;
        case 'setLang':
          this.engine.setPumpConfig(this.pumpIndex, { language: val || 'PT-BR' });
          break;
        case 'setEquipo':
          this.engine.setPumpConfig(this.pumpIndex, { equipoType: val || SAM_EQUIPOS[0].id });
          break;
        case 'toggleLock':
          this.engine.setPumpConfig(this.pumpIndex, { keyLocked: !ch.keyLocked });
          break;
        case 'resetVol':
          this.engine.resetPumpChannelVolume(this.pumpIndex);
          break;
        case 'selfCheck':
          this.engine._logPumpEvent(ch, 'Check-up ICATUS 4.0 OK: Rotor, Sensor Ar, Gotas 3ED 4.0 e Bateria 100%');
          break;
        case 'applyHome':
          this.screen = 'home';
          break;
        default:
          break;
      }

      this.menuSig = '';
      this.syncUI();
      if (this.onGlobalSync) this.onGlobalSync();
    }

    _kvRow(label, valHtml, btnsHtml = '') {
      return `<div class="icatu-m-kv"><span>${label}</span><strong>${valHtml}</strong>${btnsHtml ? `<div>${btnsHtml}</div>` : ''}</div>`;
    }

    _buildMenuHtml() {
      const ch = this.ch;
      if (this.screen === 'main') {
        const items = [
          { target: 'tci', icon: '🎯', label: 'TCI (15 Prot.)' },
          { target: 'pca', icon: '🩺', label: 'PCA (7 Prot.)' },
          { target: 'sequencial', icon: '📋', label: `Sequencial (${ch.seqSteps.length}/20)` },
          { target: 'rampa', icon: '📈', label: 'Rampa Sub/Desc' },
          { target: 'bolus_int', icon: '⏱', label: 'Bolus Intermit.' },
          { target: 'pausa', icon: '⏸', label: 'Pausa Prog.' },
          { target: 'vazao_vol', icon: '💧', label: 'Vazão × VTBI' },
          { target: 'ders', icon: '💊', label: 'Bib. DERS' },
          { target: 'modes', icon: '🔀', label: '8 Modos' },
          { target: 'occlusion', icon: '🚨', label: 'Oclusão / KVO' },
          { target: 'config', icon: '⚙', label: 'Config. Gerais' },
          { target: 'history', icon: '📊', label: 'Balanço & Log' }
        ];
        const sectors = SAM_SECTORS.map(
          (s) => `<button type="button" class="icatu-m-pill${ch.sector === s ? ' active' : ''}" data-icatu-menu="setSector" data-icatu-val="${s}">${s}</button>`
        ).join('');
        return `
          <div class="icatu-menu-grid">
            ${items.map((it) => `<button type="button" class="icatu-m-tile" data-icatu-menu="open" data-icatu-val="${it.target}"><span>${it.icon}</span><small>${it.label}</small></button>`).join('')}
          </div>
          <div class="icatu-menu-foot-row"><span>Setor DERS:</span>${sectors}</div>
        `;
      }

      if (this.screen === 'modes') {
        return `
          <div class="icatu-menu-list">${ICATU_MODES.map(
            (m) => `<button type="button" class="icatu-m-row${ch.mode === m.id ? ' active' : ''}" data-icatu-menu="setMode" data-icatu-val="${m.id}"><span><b>${m.tag}</b> ${m.label}</span><small>${ch.mode === m.id ? '✓ Ativo' : 'Selecionar'}</small></button>`
          ).join('')}</div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Voltar à Tela</button>
          </div>
        `;
      }

      if (this.screen === 'tci') {
        const activeProto = TCI_PROTOCOLS.find((p) => p.id === ch.tciProtocolId) || TCI_PROTOCOLS[0];
        const filter = this.tciFilterDrug || 'all';
        const visibleProtos = filter === 'all' ? TCI_PROTOCOLS : TCI_PROTOCOLS.filter((p) => p.drugId === filter);
        const w = Math.round(this.engine.patient.weightKg || 70);
        const drugTabs = [
          `<button type="button" class="icatu-m-pill${filter === 'all' ? ' active' : ''}" data-icatu-menu="tciDrugFilter" data-icatu-val="all">Todos (15)</button>`,
          ...TCI_DRUGS.map(
            (d) => `<button type="button" class="icatu-m-pill${filter === d.id ? ' active' : ''}" data-icatu-menu="tciDrugFilter" data-icatu-val="${d.id}">${d.name.slice(0, 6)}</button>`
          )
        ].join('');
        return `
          <div class="icatu-menu-pills-row">${drugTabs}</div>
          <div class="icatu-bio-strip mono">
            <span>Pac: ${w}kg</span><button type="button" class="icatu-m-mini" data-icatu-menu="tciBioAdj" data-icatu-val="weight:-2">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="tciBioAdj" data-icatu-val="weight:2">+</button>
            <span>${ch.patientAge || 48}a</span><button type="button" class="icatu-m-mini" data-icatu-menu="tciBioAdj" data-icatu-val="age:-5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="tciBioAdj" data-icatu-val="age:5">+</button>
            <span>${ch.patientHeightCm || 172}cm</span><button type="button" class="icatu-m-mini" data-icatu-menu="tciBioAdj" data-icatu-val="sex">${ch.patientSex || 'M'}</button>
          </div>
          <div class="icatu-menu-list">${visibleProtos.map(
            (p) => `<button type="button" class="icatu-m-row${activeProto.id === p.id ? ' active' : ''}" data-icatu-menu="tciProto" data-icatu-val="${p.id}"><span>${p.name}</span><small>${p.target} ${p.unit}</small></button>`
          ).join('')}</div>
          <div class="icatu-menu-actions">
            <span class="mono">Alvo ${Number(ch.tciTarget || 0).toFixed(2)} ${ch.tciUnit}</span>
            <div>
              <button type="button" class="icatu-m-mini" data-icatu-menu="tciTargetAdj" data-icatu-val="-1">−</button>
              <button type="button" class="icatu-m-mini" data-icatu-menu="tciTargetAdj" data-icatu-val="1">+</button>
            </div>
            <button type="button" class="icatu-m-cta" data-icatu-menu="applyHome">Aplicar TCI</button>
          </div>
        `;
      }

      if (this.screen === 'pca') {
        return `
          <div class="icatu-menu-list">${PCA_PROTOCOLS.map(
            (p) => `<button type="button" class="icatu-m-row${ch.pcaProtocolId === p.id ? ' active' : ''}" data-icatu-menu="pcaProto" data-icatu-val="${p.id}"><span>${p.name}</span><small>${p.demand}${p.unit} • ${p.lockoutMin}m</small></button>`
          ).join('')}</div>
          <div class="icatu-menu-form compact">
            ${this._kvRow(
              'Dose Demanda / Bloqueio:',
              `${Number(ch.pcaDemandDose || 1).toFixed(2)} ${ch.pcaUnit || 'mg'} • ${ch.pcaLockoutMin || 8} min`,
              `<button type="button" class="icatu-m-mini" data-icatu-menu="pcaAdj" data-icatu-val="dem:-0.1">D−</button><button type="button" class="icatu-m-mini" data-icatu-menu="pcaAdj" data-icatu-val="dem:0.1">D+</button><button type="button" class="icatu-m-mini" data-icatu-menu="pcaAdj" data-icatu-val="lock:-1">B−</button><button type="button" class="icatu-m-mini" data-icatu-menu="pcaAdj" data-icatu-val="lock:1">B+</button>`
            )}
          </div>
          <div class="icatu-menu-actions">
            <span class="mono">Entregas: ${ch.pcaDelivered || 0}/${ch.pcaAttempts || 0}</span>
            <button type="button" class="icatu-m-cta" data-icatu-menu="pcaDemand">⊕ Bolus PCA</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'rampa') {
        return `
          <div class="icatu-menu-form">
            ${this._kvRow('Subida:', `${ch.rampUpMin || 10} min`, `<button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="up:-2">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="up:2">+</button>`)}
            ${this._kvRow('Platô:', `${ch.rampPlateauMlH || 40} mL/h`, `<button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="plat:-5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="plat:5">+</button>`)}
            ${this._kvRow('Descida:', `${ch.rampDownMin || 10} min`, `<button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="down:-2">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="rampAdj" data-icatu-val="down:2">+</button>`)}
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="setMode" data-icatu-val="rampa">Ativar Modo Rampa</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'bolus_int') {
        return `
          <div class="icatu-menu-form">
            ${this._kvRow('Volume Bolus:', `${ch.interBolusMl || 5} mL`, `<button type="button" class="icatu-m-mini" data-icatu-menu="interAdj" data-icatu-val="vol:-1">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="interAdj" data-icatu-val="vol:1">+</button>`)}
            ${this._kvRow('Intervalo:', `${ch.interIntervalMin || 30} min`, `<button type="button" class="icatu-m-mini" data-icatu-menu="interAdj" data-icatu-val="int:-5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="interAdj" data-icatu-val="int:5">+</button>`)}
            <div class="icatu-m-note mono">Próximo bolus em: ${formatHms(ch.interCountdownSec || 0)}</div>
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="setMode" data-icatu-val="bolus_int">Ativar Bolus Int.</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'pausa') {
        return `
          <div class="icatu-menu-form">
            ${this._kvRow('Duração Pausa:', `${ch.pauseDurationMin || 15} min`, `<button type="button" class="icatu-m-mini" data-icatu-menu="pauseAdj" data-icatu-val="-5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="pauseAdj" data-icatu-val="5">+</button>`)}
            <div class="icatu-m-note mono">Restante: ${formatHms(ch.pauseRemainingSec || 0)} (${ch.pauseActive ? 'PAUSANDO' : 'PRONTA'})</div>
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="pauseToggle">${ch.pauseActive ? '▶ Retomar Agora' : '⏸ Iniciar Pausa'}</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'sequencial') {
        const steps = ch.seqSteps || [];
        const selIdx = Math.max(0, Math.min(steps.length - 1, this.seqEditIdx));
        const st = steps[selIdx] || { flowMlH: 20, vtbiMl: 25 };
        const chips = steps
          .map(
            (s, i) => `<button type="button" class="icatu-seq-chip${i === selIdx ? ' selected' : ''}${i === ch.seqCurrentIdx ? ' current' : ''}" data-icatu-menu="seqSelect" data-icatu-val="${i}">${i + 1}: ${s.flowMlH}</button>`
          )
          .join('');
        return `
          <div class="icatu-seq-chips">${chips}</div>
          ${this._kvRow(
            `Etapa ${selIdx + 1}/${steps.length} (Máx 20):`,
            `${st.flowMlH} mL/h • ${st.vtbiMl} mL`,
            `<button type="button" class="icatu-m-mini" data-icatu-menu="seqStepFlow" data-icatu-val="-5">F−</button><button type="button" class="icatu-m-mini" data-icatu-menu="seqStepFlow" data-icatu-val="5">F+</button><button type="button" class="icatu-m-mini" data-icatu-menu="seqStepVol" data-icatu-val="-5">V−</button><button type="button" class="icatu-m-mini" data-icatu-menu="seqStepVol" data-icatu-val="5">V+</button>`
          )}
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="seqAdd">+ Etapa</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="seqRemove">− Etapa</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="seqFill20">20 Etapas</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'vazao_vol') {
        return `
          <div class="icatu-menu-form">
            ${this._kvRow(
              'Vazão Direta:',
              `${Number(ch.directFlowMlH || 25).toFixed(1)} mL/h`,
              `<button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="flow:-5">−5</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="flow:-1">−1</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="flow:1">+1</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="flow:5">+5</button>`
            )}
            ${this._kvRow(
              'VTBI (Vol. Alvo):',
              ch.vtbiMl > 0 ? `${ch.vtbiMl} mL` : 'Contínuo (0)',
              `<button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="vtbi:0">Cont.</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="vtbi:50">+50</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="vtbi:100">+100</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="vtbi:250">+250</button>`
            )}
            ${this._kvRow(
              'Taxa Bolus:',
              `${ch.bolusRateMlH || 200} mL/h`,
              `<button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="bolusRate:-50">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="vazaoAdj" data-icatu-val="bolusRate:50">+</button>`
            )}
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="setMode" data-icatu-val="vazao_vol">Aplicar Vazão×Vol</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="purgeLine">💨 Purgar (+2mL)</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'occlusion') {
        const occVal = ch.occlusionLimitKpa || 55;
        const airOpts = [50, 100, 250, 500].map(
          (ul) => `<button type="button" class="icatu-m-pill${(ch.airBubbleUl || 100) === ul ? ' active' : ''}" data-icatu-menu="setAirBubble" data-icatu-val="${ul}">${ul}µL</button>`
        ).join('');
        return `
          <div class="icatu-menu-form compact">
            ${this._kvRow(
              'Limite Oclusão:',
              `${occVal} kPa`,
              `<button type="button" class="icatu-m-mini${occVal === 35 ? ' active' : ''}" data-icatu-menu="setOccLim" data-icatu-val="35">Baixa</button><button type="button" class="icatu-m-mini${occVal === 55 ? ' active' : ''}" data-icatu-menu="setOccLim" data-icatu-val="55">Média</button><button type="button" class="icatu-m-mini${occVal === 80 ? ' active' : ''}" data-icatu-menu="setOccLim" data-icatu-val="80">Alta</button><button type="button" class="icatu-m-mini" data-icatu-menu="occAdj" data-icatu-val="-5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="occAdj" data-icatu-val="5">+</button>`
            )}
            ${this._kvRow(
              'Vazão KVO:',
              `${Number(ch.kvoRateMlH || 0).toFixed(1)} mL/h`,
              `<button type="button" class="icatu-m-mini" data-icatu-menu="kvoAdj" data-icatu-val="-0.5">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="kvoAdj" data-icatu-val="0.5">+</button>`
            )}
            ${this._kvRow(
              'Anti-Bolus / Gotas:',
              `${ch.antiBolus ? 'Anti-Bolus ON' : 'OFF'} • 3ED ${ch.dropSensorOn !== false ? 'ON' : 'OFF'}`,
              `<button type="button" class="icatu-m-mini${ch.antiBolus ? ' active' : ''}" data-icatu-menu="toggleAntiBolus">Anti-Bolus</button><button type="button" class="icatu-m-mini${ch.dropSensorOn !== false ? ' active' : ''}" data-icatu-menu="toggleDropSensor">Gotas</button>`
            )}
            <div class="icatu-menu-pills-row"><span>Sensor Ar:</span>${airOpts}</div>
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="toggleOccTest">${ch.occluded ? '✓ Desobstruir Linha' : '⚠ Testar Oclusão'}</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'config') {
        const audioBtns = ['Baixo', 'Médio', 'Alto'].map(
          (lvl) => `<button type="button" class="icatu-m-pill${(ch.audioLevel || 'Médio') === lvl ? ' active' : ''}" data-icatu-menu="setAudio" data-icatu-val="${lvl}">${lvl}</button>`
        ).join('');
        const langBtns = ['PT-BR', 'EN', 'ES'].map(
          (lg) => `<button type="button" class="icatu-m-pill${(ch.language || 'PT-BR') === lg ? ' active' : ''}" data-icatu-menu="setLang" data-icatu-val="${lg}">${lg}</button>`
        ).join('');
        const eqBtns = SAM_EQUIPOS.map(
          (eq) => `<button type="button" class="icatu-m-pill${(ch.equipoType || SAM_EQUIPOS[0].id) === eq.id ? ' active' : ''}" data-icatu-menu="setEquipo" data-icatu-val="${eq.id}">${eq.short}</button>`
        ).join('');
        return `
          <div class="icatu-menu-form compact">
            ${this._kvRow(
              'Brilho LCD / Noturno:',
              `${ch.brightnessPct || 100}% • ${ch.nightMode ? 'Noturno ON' : 'Dia'}`,
              `<button type="button" class="icatu-m-mini" data-icatu-menu="brightAdj" data-icatu-val="-10">−</button><button type="button" class="icatu-m-mini" data-icatu-menu="brightAdj" data-icatu-val="10">+</button><button type="button" class="icatu-m-mini${ch.nightMode ? ' active' : ''}" data-icatu-menu="toggleNight">🌙 Noturno</button>`
            )}
            <div class="icatu-menu-pills-row"><span>Som:</span>${audioBtns}<span>Idioma:</span>${langBtns}</div>
            <div class="icatu-menu-pills-row"><span>Equipo:</span>${eqBtns}</div>
          </div>
          <div class="icatu-menu-actions">
            <button type="button" class="icatu-m-cta" data-icatu-menu="toggleLock">${ch.keyLocked ? '🔓 Destravar Teclado' : '🔒 Travar Teclado'}</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="resetVol">Zerar Vol.</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      if (this.screen === 'history') {
        const events = (ch.events || []).slice(0, 6);
        const vtbiStr = ch.vtbiMl > 0 ? `${Math.max(0, ch.vtbiMl - ch.volInfMl).toFixed(1)} mL` : 'Contínuo';
        return `
          <div class="icatu-bio-strip mono">
            <span>Vol: <b>${ch.volInfMl.toFixed(1)} mL</b></span>
            <span>Rest: <b>${vtbiStr}</b></span>
            <span>Bat: <b>100% AC</b></span>
            <span>FW 4.0.12</span>
          </div>
          <div class="icatu-menu-list">${events.map(
            (ev) => `<div class="icatu-m-row log"><span>${ev.msg}</span><small class="mono">${ev.time}</small></div>`
          ).join('')}</div>
          <div class="icatu-menu-actions">
            <span class="mono">SamMANAGER® Online</span>
            <button type="button" class="icatu-m-cta" data-icatu-menu="selfCheck">✓ Autoteste</button>
            <button type="button" class="icatu-m-cta alt" data-icatu-menu="applyHome">Tela</button>
          </div>
        `;
      }

      // Library DERS (`ders` ou fallback)
      const sectorPills = SAM_SECTORS.map(
        (s) => `<button type="button" class="icatu-m-pill${ch.sector === s ? ' active' : ''}" data-icatu-menu="setSector" data-icatu-val="${s}">${s}</button>`
      ).join('');
      return `
        <div class="icatu-menu-pills-row"><span>Setor:</span>${sectorPills}</div>
        <div class="icatu-menu-list">${this.ivDrugs.map(
          (d) => `<button type="button" class="icatu-m-row${ch.drugId === d.id ? ' active' : ''}" data-icatu-menu="setDrug" data-icatu-val="${d.id}"><span>${d.name} <em class="mono">(0–${d.maxRate})</em></span><small>${d.concLabel}</small></button>`
        ).join('')}</div>
        <div class="icatu-menu-actions">
          <span class="mono">DERS Ativo • ${ch.sector || 'UTI'}</span>
          <button type="button" class="icatu-m-cta" data-icatu-menu="applyHome">Aplicar na Tela</button>
        </div>
      `;
    }

    syncUI() {
      const ch = this.ch;
      if (!ch || !this.chassisEl) return;
      const drug = this.ivDrugMap[ch.drugId] || this.ivDrugs[0];
      const flowMlH = this.engine.getPumpFlowMlH(ch);
      const modeObj = ICATU_MODES.find((m) => m.id === ch.mode) || ICATU_MODES[0];

      const setText = (id, val) => {
        const el = this._el(id);
        if (el && el.textContent !== String(val)) el.textContent = String(val);
      };

      setText('icatuModeTag', this.screen === 'home' ? modeObj.tag : 'MF');
      setText('icatuDrugTitle', this.screen === 'home' ? drug.name : (MENU_TITLES[this.screen] || 'MENU'));
      setText('icatuSectorTag', ch.sector || 'UTI');
      setText('icatuConcSub', ch.mode === 'tci' ? `${ch.tciModel || 'TCI'}` : drug.concLabel);
      setText('icatuModeSummaryChip', modeObj.label.split(' (')[0]);
      setText('icatuDoorModeTag', `ICATU 4.0 #${this.pumpIndex + 1} • ${modeObj.tag}`);

      // Leitura principal dependendo do modo
      if (ch.mode === 'tci') {
        setText('icatuMainVal', Number(ch.tciTarget || 0).toFixed(2));
        setText('icatuMainUnit', `Alvo ${ch.tciUnit || 'ng/mL'}`);
        setText('icatuHintText', `Ce/Cp: ${(ch.tciCurrent || 0).toFixed(2)} ${ch.tciUnit}`);
      } else if (ch.mode === 'vazao_vol') {
        setText('icatuMainVal', Number(ch.directFlowMlH || 25).toFixed(1));
        setText('icatuMainUnit', 'mL/h');
        setText('icatuHintText', 'Vazão Direta');
      } else if (ch.mode === 'sequencial') {
        const steps = ch.seqSteps || [];
        const curStep = steps[ch.seqCurrentIdx || 0] || { flowMlH: 0, vtbiMl: 0 };
        setText('icatuMainVal', Number(curStep.flowMlH).toFixed(1));
        setText('icatuMainUnit', 'mL/h');
        setText('icatuHintText', `Etapa ${(ch.seqCurrentIdx || 0) + 1}/${steps.length}`);
      } else if (ch.mode === 'rampa') {
        setText('icatuMainVal', flowMlH.toFixed(1));
        setText('icatuMainUnit', 'mL/h');
        setText('icatuHintText', `Platô ${ch.rampPlateauMlH || 40} mL/h`);
      } else {
        setText('icatuMainVal', ch.rate.toFixed(2));
        setText('icatuMainUnit', drug.unit);
        setText('icatuHintText', this.detailsMode ? `DERS Máx: ${drug.maxRate}` : `Passo: ${(drug.step * this.stepScale).toFixed(2)}`);
      }

      setText('icatuVolInf', `${ch.volInfMl.toFixed(1)} mL`);
      setText('icatuElapsed', formatHms(ch.elapsedSec));
      setText('icatuFlowMlh', flowMlH.toFixed(1));

      if (ch.mode === 'tci') {
        const proto = TCI_PROTOCOLS.find((p) => p.id === ch.tciProtocolId) || TCI_PROTOCOLS[0];
        setText('icatuMetaLeft', `Ce: ${(ch.tciCurrent || 0).toFixed(2)} ${ch.tciUnit}`);
        setText('icatuMetaMid', proto.name.split('•')[0].trim());
      } else if (ch.mode === 'pca') {
        setText('icatuMetaLeft', `Demanda: ${ch.pcaDemandDose}${ch.pcaUnit}`);
        setText('icatuMetaMid', ch.pcaLockoutSec > 0 ? `Bloq ${formatHms(ch.pcaLockoutSec)}` : `Entr: ${ch.pcaDelivered || 0}/${ch.pcaAttempts || 0}`);
      } else if (ch.mode === 'sequencial') {
        const st = (ch.seqSteps || [])[ch.seqCurrentIdx || 0];
        setText('icatuMetaLeft', `Etapa ${(ch.seqStepVolMl || 0).toFixed(1)}/${st ? st.vtbiMl : 0}mL`);
        setText('icatuMetaMid', `${(ch.seqSteps || []).length} Etapas`);
      } else if (ch.mode === 'bolus_int') {
        setText('icatuMetaLeft', `Bolus ${ch.interBolusMl || 5} mL`);
        setText('icatuMetaMid', `Próx ${formatHms(ch.interCountdownSec || 0)}`);
      } else if (ch.mode === 'pausa') {
        setText('icatuMetaLeft', `Pausa ${ch.pauseDurationMin || 15}m`);
        setText('icatuMetaMid', formatHms(ch.pauseRemainingSec || 0));
      } else {
        const w = Math.max(30, this.engine.patient.weightKg || 70);
        const totalMgOrMcg = ch.volInfMl * drug.concPerMl;
        setText('icatuMetaLeft', `${(totalMgOrMcg / w).toFixed(1)} ${drug.unit.split('/')[0]}/kg`);
        setText('icatuMetaMid', `${modeObj.tag} • Cont.`);
      }

      // Barra contextual rápida sem recriar <select> aberto a cada frame
      const ctxBar = this._el('icatuContextBar');
      if (ctxBar) {
        const nextCtxSig =
          ch.mode === 'tci'
            ? `tci|${ch.tciProtocolId}`
            : ch.mode === 'pca'
            ? `pca|${ch.pcaProtocolId}`
            : ch.mode === 'pausa'
            ? `pausa|${ch.pauseActive}|${Math.floor(ch.pauseRemainingSec || 0)}`
            : ch.mode === 'sequencial'
            ? `seq|${ch.seqCurrentIdx}|${(ch.seqSteps || []).length}`
            : `def|${ch.mode}`;
        if (this.ctxBarSig !== nextCtxSig) {
          this.ctxBarSig = nextCtxSig;
          if (ch.mode === 'tci') {
            ctxBar.innerHTML = `<select class="icatu-ctx-sel" data-tci-select="1" aria-label="Selecionar um dos 15 protocolos TCI">${TCI_PROTOCOLS.map((p) => `<option value="${p.id}" ${p.id === ch.tciProtocolId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>`;
          } else if (ch.mode === 'pca') {
            ctxBar.innerHTML = `<select class="icatu-ctx-sel" data-pca-select="1" aria-label="Selecionar um dos 7 protocolos PCA">${PCA_PROTOCOLS.map((p) => `<option value="${p.id}" ${p.id === ch.pcaProtocolId ? 'selected' : ''}>${p.name}</option>`).join('')}</select><button type="button" class="icatu-ctx-btn" data-icatu-action="pcaDemand">⊕ PCA</button>`;
          } else if (ch.mode === 'pausa') {
            ctxBar.innerHTML = `<span class="mono">Pausa: ${formatHms(ch.pauseRemainingSec || 0)}</span><button type="button" class="icatu-ctx-btn" data-icatu-action="togglePauseTimer">${ch.pauseActive ? '▶ Retomar' : '⏸ Pausar'}</button>`;
          } else if (ch.mode === 'sequencial') {
            ctxBar.innerHTML = `<span class="mono">Etapa ${(ch.seqCurrentIdx || 0) + 1}/${(ch.seqSteps || []).length} (Máx 20)</span><button type="button" class="icatu-ctx-btn" data-icatu-menu="open" data-icatu-val="sequencial">Editar Etapas</button>`;
          } else {
            ctxBar.innerHTML = `<button type="button" class="icatu-ctx-pill" data-icatu-menu="open" data-icatu-val="ders">💊 Fármaco</button><button type="button" class="icatu-ctx-pill" data-icatu-menu="open" data-icatu-val="modes">🔀 Modos</button><button type="button" class="icatu-ctx-pill" data-icatu-menu="open" data-icatu-val="tci">TCI (15)</button><button type="button" class="icatu-ctx-pill" data-icatu-menu="open" data-icatu-val="pca">PCA (7)</button><button type="button" class="icatu-ctx-pill" data-icatu-menu="open" data-icatu-val="sequencial">Seq (20)</button>`;
          }
        }
      }

      const now = new Date();
      setText('icatuClock', `${String(now.getHours()).padStart(2, '0')} ${String(now.getMinutes()).padStart(2, '0')}`);

      // Pressão kPa & status pill
      const kpa = Math.round(ch.pressureKpa || 0);
      setText('icatuKpaVal', kpa);
      const barsEl = this._el('icatuKpaBars');
      const bars = barsEl ? barsEl.querySelectorAll('span') : [];
      const litCount = Math.min(5, Math.ceil(kpa / 20));
      bars.forEach((bar, i) => {
        const lit = i < litCount;
        bar.className = lit ? (i >= 4 ? 'lit high' : i >= 3 ? 'lit warn' : 'lit') : '';
      });

      const statusEl = this._el('icatuStatusPill');
      if (statusEl) {
        if (ch.occluded) {
          statusEl.textContent = 'OCLUSÃO!';
          statusEl.className = 'icatu-status-pill occluded';
        } else if (ch.mode === 'pausa' && ch.pauseActive && ch.running) {
          statusEl.textContent = 'PAUSA CRON.';
          statusEl.className = 'icatu-status-pill bolus';
        } else if (ch.kvoActive && ch.running) {
          statusEl.textContent = 'KVO';
          statusEl.className = 'icatu-status-pill bolus';
        } else if (ch.bolusTimer > 0) {
          statusEl.textContent = 'BOLUS >';
          statusEl.className = 'icatu-status-pill bolus';
        } else if (ch.running) {
          statusEl.textContent = ch.mode === 'tci' ? 'TCI ATIVO' : ch.mode === 'pca' ? 'PCA ATIVA' : 'INFUNDINDO';
          statusEl.className = 'icatu-status-pill running';
        } else {
          statusEl.textContent = 'PAUSADO';
          statusEl.className = 'icatu-status-pill paused';
        }
      }

      const lcdEl = this._el('icatuLcd');
      const lockPill = this._el('icatuLockPill');
      if (lockPill) lockPill.classList.toggle('hidden', !ch.keyLocked);
      if (lcdEl) {
        lcdEl.classList.toggle('night-mode', Boolean(ch.nightMode));
        const bPct = Math.max(40, Math.min(100, ch.brightnessPct || 100));
        lcdEl.style.filter = `brightness(${((ch.nightMode ? 0.72 : 1) * bPct / 100).toFixed(2)})`;
      }

      const lcdHome = this._el('icatuLcdHome');
      const lcdMenu = this._el('icatuLcdMenu');
      if (lcdHome) lcdHome.classList.toggle('hidden', this.screen !== 'home');
      if (lcdMenu) {
        lcdMenu.classList.toggle('hidden', this.screen === 'home');
        if (this.screen !== 'home') {
          const sig = `${this.screen}|${this.tciFilterDrug}|${ch.mode}|${ch.sector}|${ch.drugId}|${ch.tciProtocolId}|${ch.tciTarget}|${this.engine.patient.weightKg}|${ch.patientAge}|${ch.patientSex}|${ch.pcaProtocolId}|${ch.pcaDemandDose}|${ch.pcaLockoutMin}|${ch.pcaDelivered}|${ch.pcaAttempts}|${ch.rampUpMin}|${ch.rampPlateauMlH}|${ch.rampDownMin}|${ch.interBolusMl}|${ch.interIntervalMin}|${ch.pauseDurationMin}|${ch.pauseActive}|${ch.directFlowMlH}|${ch.vtbiMl}|${ch.bolusRateMlH}|${ch.occlusionLimitKpa}|${ch.kvoRateMlH}|${ch.antiBolus}|${ch.airBubbleUl}|${ch.dropSensorOn}|${ch.brightnessPct}|${ch.nightMode}|${ch.audioLevel}|${ch.language}|${ch.equipoType}|${ch.keyLocked}|${ch.occluded}|${(ch.events || []).length}|${(ch.seqSteps || []).length}|${this.seqEditIdx}|${JSON.stringify(ch.seqSteps || [])}`;
          if (this.menuSig !== sig) {
            this.menuSig = sig;
            lcdMenu.innerHTML = this._buildMenuHtml();
          }
        }
      }

      setText('icatuSkLeft', this.screen === 'home' ? 'ZERAR VOL.' : '← VOLTAR');
      setText('icatuSkMid', this.screen === 'home' ? 'MENUS (12)' : 'INÍCIO');
      setText('icatuSkRight', this.screen === 'home' ? 'DETALHES' : 'FECHAR');

      const dropEnabled = ch.dropSensorOn !== false;
      const isInfusing = ((ch.running && !ch.occluded && flowMlH > 0) || (ch.bolusTimer > 0 && !ch.occluded));
      const isBolus = ch.bolusTimer > 0 && !ch.occluded;
      const animDur = Math.max(0.45, Math.min(1.5, 1.4 - Math.min(40, flowMlH) * 0.022));

      const chassis = this.chassisEl;
      const dropAnim = this._el('icatuDropAnim');
      const runLed = this._el('icatuRunLed');
      const occLed = this._el('icatuOccLed');
      const sensorBtn = this._el('icatuSensorBtn');

      if (chassis) {
        chassis.style.setProperty('--icatu-anim-dur', `${animDur.toFixed(2)}s`);
        chassis.classList.toggle('infusing', isInfusing);
        chassis.classList.toggle('bolus', isBolus);
        chassis.classList.toggle('occluding', Boolean(ch.occluded));
      }
      if (dropAnim) dropAnim.classList.toggle('infusing', isInfusing && dropEnabled);
      if (runLed) runLed.classList.toggle('active', isInfusing);
      if (occLed) occLed.classList.toggle('active', Boolean(ch.occluded));
      if (sensorBtn) {
        sensorBtn.classList.toggle('infusing', isInfusing && dropEnabled);
        sensorBtn.classList.toggle('occluding', Boolean(ch.occluded));
      }
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.SamtronicIcatuPump = SamtronicIcatuPump;
  global.ICUSim.ICATU_TCI_DRUGS = TCI_DRUGS;
  global.ICUSim.ICATU_TCI_PROTOCOLS = TCI_PROTOCOLS;
  global.ICUSim.ICATU_PCA_PROTOCOLS = PCA_PROTOCOLS;
})(window);
