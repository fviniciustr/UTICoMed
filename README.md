# UTICoMed — Simulador Clínico de UTI Interativo

Simulador fisiológico multiparamétrico de Unidade de Terapia Intensiva (UTI) 100% em HTML/CSS/JS puro (zero frameworks, PWA offline).

## Acesso Online (GitHub Pages)
- **Apresentação SRI & Ventilação + Simulador:** https://fviniciustr.github.io/UTICoMed/
- **Direto no Simulador ao Vivo:** https://fviniciustr.github.io/UTICoMed/?modo=simulador

## Equipamentos Simulados
- **Monitor Multiparamétrico Mindray iMEC 15** — ECG (14+ ritmos), Pletismografia SpO₂, PAI invasiva, Capnografia EtCO₂ e PNI.
- **Ventilador Mecânico Hamilton-T1** — Modos VCV / PCV / PSV, curvas Paw/Fluxo/Volume, Loops P-V e F-V, pulmão dinâmico animado e manobras de pausa.
- **Bombas de Infusão Samtronic Icatu 4.0 (DERS)** — 2 bombas simultâneas com modos Dose/Peso, TCI (15 protocolos), PCA (7 protocolos), Rampa e Sequencial.
- **Cardioversor Bifásico Vivo Gold (CMOS Drake)** — ECG 3 canais, Cardioversão Sincronizada (SINC), Desfibrilação, DEA e Marcapasso Transcutâneo (MP).
- **Analisador de Gases Sanguíneos Seamaty SG1** — Gasometria em tempo real com bobina térmica e emissão de laudo em PDF (`%PDF-1.4` puro).
- **Ausculta Pulmonar Estéreo 2D** — Síntese em Web Audio com `StereoPannerNode` (hemitórax direito/esquerdo).

## Recursos Avançados (Barra Superior)
- **`1× / 2× / 5× / 10×`** — Aceleração temporal determinística para demonstração rápida de respostas hemodinâmicas e ácido-base.
- **`📼` Caixa-Preta & OSCE** — Gravação contínua com gráfico de tendências, **Time-Travel** (voltar o paciente a qualquer instante) e **Boletim OSCE em PDF**.
- **`🔗` Caso Clínico na URL (`#caso=...`)** — Compartilhamento de casos customizados sem servidor via `CompressionStream('deflate-raw')` + JSON.
- **`📡` Sala Multi-Tela (`BroadcastChannel`)** — Controle do paciente em uma janela (Instrutor) sincronizado ao vivo com tela limpa de projetor (`?tela=sala`).

## Build Offline Ultra-Compacto
```bash
python3 build.py
```
Gera automaticamente em `dist/` (usando `DecompressionStream('gzip')` nativo do navegador):
- `dist/UTICoMed-offline.html` (~214 KB — completo com slides, 100% offline)
- `dist/UTICoMed-simulador-offline.html` (~195 KB — direto no simulador, 100% offline)
- Atualiza o hash de cache do Service Worker (`sw.js`).
