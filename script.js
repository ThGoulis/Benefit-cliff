  /* ============================================================
     ΥΠΟΛΟΓΙΣΤΙΚΟΣ ΠΥΡΗΝΑΣ
     Μισθολογική λογική βασισμένη στο σύστημα 14 μισθών (ΕΦΚΑ,
     προοδευτική κλίμακα φόρου, φορολογική έκπτωση). Η ηλικία είναι
     μεταβλητή ανά άτομο (young25 / young30 / standard) και επιλέγει
     ανάμεσα στις τρεις κλίμακες παρακάτω· δεν επηρεάζει ΕΦΚΑ ή έκπτωση.
     ============================================================ */

  const EFKA_RATE = 0.1337; // "Τυπικός εργαζόμενος" — personal-finance-dashboard

  const TAX_BRACKETS_BY_AGE = {
    standard: [
      { limit: 10000, rate: 0.09 },
      { limit: 20000, rate: 0.20 },
      { limit: 30000, rate: 0.26 },
      { limit: 40000, rate: 0.34 },
      { limit: 60000, rate: 0.39 },
      { limit: Infinity, rate: 0.44 }
    ],
    young30: [ // 26-30 ετών: 9% flat έως 20.000€, μετά ίδιο με τη βασική κλίμακα
      { limit: 20000, rate: 0.09 },
      { limit: 30000, rate: 0.26 },
      { limit: 40000, rate: 0.34 },
      { limit: 60000, rate: 0.39 },
      { limit: Infinity, rate: 0.44 }
    ],
    young25: [ // έως 25 ετών: μηδενικός φόρος έως 20.000€, μετά ίδιο με τη βασική κλίμακα
      { limit: 20000, rate: 0.00 },
      { limit: 30000, rate: 0.26 },
      { limit: 40000, rate: 0.34 },
      { limit: 60000, rate: 0.39 },
      { limit: Infinity, rate: 0.44 }
    ]
  };

  const HOUSEHOLDS = {
    single:  { label: 'άγαμος/η χωρίς παιδιά', extraAdults: 0, minors: 0, hasSpouse: false, children: 0, baseCredit: 777 },
    couple0: { label: 'ζευγάρι χωρίς παιδιά',   extraAdults: 1, minors: 0, hasSpouse: true,  children: 0, baseCredit: 777 },
    couple1: { label: 'ζευγάρι με 1 παιδί',    extraAdults: 1, minors: 1, hasSpouse: true,  children: 1, baseCredit: 810 },
    couple2: { label: 'ζευγάρι με 2 παιδιά',   extraAdults: 1, minors: 2, hasSpouse: true,  children: 2, baseCredit: 900 }
  };

  function annualTax(annualTaxable, ageBracket){
    const brackets = TAX_BRACKETS_BY_AGE[ageBracket] || TAX_BRACKETS_BY_AGE.standard;
    let tax = 0, prev = 0;
    for(const b of brackets){
      if(annualTaxable > prev){
        tax += (Math.min(annualTaxable, b.limit) - prev) * b.rate;
        prev = b.limit;
      } else break;
    }
    return tax;
  }

  function effectiveTaxCredit(baseCredit, annualTaxable){
    if(annualTaxable <= 12000) return baseCredit;
    const reduction = 20 * (annualTaxable - 12000) / 1000;
    return Math.max(baseCredit - reduction, 0);
  }

  function a21ChildAmount(category, children){
    // category: 1,2,3 or 0 (εκτός ορίου)
    const perFirstTwo = { 1: 70, 2: 42, 3: 28 }[category] || 0;
    if(children <= 0) return 0;
    if(children === 1) return perFirstTwo;
    return perFirstTwo * 2; // v1 υποστηρίζει μέχρι 2 παιδιά
  }

  // Επίδομα ενοικίου — εισοδηματικό κριτήριο.
  function rentBenefit(annualTaxable, h){
    const extraMembers = h.extraAdults + h.minors;
    const incomeLimit = Math.min(7000 + 3500 * extraMembers, 21000);
    if(annualTaxable > incomeLimit) return 0;
    return Math.min(70 + 35 * extraMembers, 210);
  }

  /* ----------------------------------------------------------
     Περιουσιακά κριτήρια (ΕΕΕ + επίδομα ενοικίου)
     Ακίνητη περιουσία και καταθέσεις είναι κοινές για όλο το
     νοικοκυριό — αν οποιοδήποτε όριο ξεπερνιέται, το αντίστοιχο
     επίδομα μηδενίζεται εντελώς, ανεξάρτητα από το εισόδημα.
     Δεν μοντελοποιούνται: αντικειμενική δαπάνη ΙΧ/δικύκλων (ΕΕΕ),
     περιουσιακό τεκμήριο τόκων (και τα δύο) — απλοποιήσεις.
     ---------------------------------------------------------- */
  function eeeRealEstateLimit(totalMembers){
    return Math.min(90000 + 15000 * (totalMembers - 1), 150000);
  }
  function eeeDepositLimit(totalMembers){
    if(totalMembers <= 1) return 4800;
    return Math.min(4800 + 2400 + 1200 * (totalMembers - 2), 14400);
  }
  function rentRealEstateLimit(totalMembers){
    return Math.min(120000 + 15000 * (totalMembers - 1), 180000);
  }
  function rentDepositLimit(totalMembers){
    return Math.min(7000 + 3500 * (totalMembers - 1), 21000);
  }

  /* ----------------------------------------------------------
     Κοινωνικό Οικιακό Τιμολόγιο (ΚΟΤ Β — βασική κατηγορία μόνο).
     Ακίνητη περιουσία: ίδιο πλαφόν με το επίδομα ενοικίου (120k+15k/
     μέλος, μέγιστο 180k). Καταθέσεις: ίδιο όριο με το ίδιο το
     εισοδηματικό κριτήριο του ΚΟΤ (9k-18k ανάλογα σύνθεση).
     Δεν μοντελοποιούνται: προσαύξηση ορίου εισοδήματος για ΑΜΕΑ 67%+
     (+8.000€) ή μηχανική υποστήριξη (+15.000€), ΚΟΤ Α (υψηλότερη
     έκπτωση, ευάλωτες ομάδες), ΚΟΤ Γ (πολύτεκνοι), και το προσαυξημένο
     όριο κατανάλωσης (1.900kWh/4μηνο αντί 1.400) για ήδη-δικαιούχους ΕΕΕ.
     ---------------------------------------------------------- */
  function kotIncomeLimit(h){
    return Math.min(9000 + 4500 * h.extraAdults + 2250 * h.minors, 27000);
  }
  function kotBenefit(annualTaxable, h, propertyValue, deposits, consumptionKwh){
    const limit = kotIncomeLimit(h);
    if(annualTaxable > limit) return { amount: 0, blockedByAssets: false };
    const totalMembers = h.extraAdults + h.minors + 1;
    const assetsOk = propertyValue <= rentRealEstateLimit(totalMembers) && deposits <= limit;
    if(!assetsOk) return { amount: 0, blockedByAssets: true };
    const cappedKwh = Math.min(consumptionKwh || 0, 350);
    return { amount: cappedKwh * 0.045, blockedByAssets: false };
  }

  // Υπολογίζει φόρο/ΕΦΚΑ για ΕΝΑ άτομο. Η φορολογική έκπτωση περνάει μόνο
  // στο άτομο 1 (baseCredit>0) — το άτομο 2 παίρνει πάντα baseCredit=0,
  // όπως στην πράξη επιλέγεται σε ποιον από τους δύο συζύγους αποδίδεται.
  function computeIndividual(grossMonthly, baseCredit, ageBracket){
    const numPayments = 14;
    const ss = grossMonthly * EFKA_RATE;
    const taxableMonthly = Math.max(grossMonthly - ss, 0);
    const annualTaxable = taxableMonthly * numPayments;
    const grossAnnualTax = annualTax(annualTaxable, ageBracket);
    const usedCredit = effectiveTaxCredit(baseCredit, annualTaxable);
    const annualTaxAfterCredit = Math.max(grossAnnualTax - usedCredit, 0);
    const monthlyTax = annualTaxAfterCredit / numPayments;
    const netMonthly = Math.max(grossMonthly - ss - monthlyTax, 0);
    return { netMonthly, taxableMonthly };
  }

  function computeAt(grossMonthly, householdKey, spouseGrossMonthly, age1, age2, propertyValue, deposits, kwh){
    const h = HOUSEHOLDS[householdKey];
    const totalMembers = h.extraAdults + h.minors + 1;
    propertyValue = propertyValue || 0;
    deposits = deposits || 0;

    const p1 = computeIndividual(grossMonthly, h.baseCredit, age1);
    let netMonthly = p1.netMonthly;
    let combinedTaxableMonthly = p1.taxableMonthly;

    if(h.hasSpouse){
      const p2 = computeIndividual(spouseGrossMonthly || 0, 0, age2);
      netMonthly += p2.netMonthly;
      combinedTaxableMonthly += p2.taxableMonthly;
    }

    const annualTaxable = combinedTaxableMonthly * 14;

    // ΕΕΕ — βασίζεται στο συνολικό φορολογητέο εισόδημα νοικοκυριού
    const guaranteed = Math.min(250 + h.extraAdults * 125 + h.minors * 75, 1125);
    let eee = guaranteed - combinedTaxableMonthly;
    eee = eee < 10 ? 0 : Math.min(eee, guaranteed);
    const eeeAssetsOk = propertyValue <= eeeRealEstateLimit(totalMembers) && deposits <= eeeDepositLimit(totalMembers);
    const eeeBlockedByAssets = eee > 0 && !eeeAssetsOk;
    if(!eeeAssetsOk) eee = 0;

    // Α21
    const coeff = 1 + (h.hasSpouse ? 0.5 : 0) + h.children * 0.25;
    const equivalentAnnual = annualTaxable / coeff;
    let category = 0;
    if(equivalentAnnual <= 6000) category = 1;
    else if(equivalentAnnual <= 10000) category = 2;
    else if(equivalentAnnual <= 15000) category = 3;
    const a21 = a21ChildAmount(category, h.children);

    // Επίδομα ενοικίου
    let rent = rentBenefit(annualTaxable, h);
    const rentAssetsOk = propertyValue <= rentRealEstateLimit(totalMembers) && deposits <= rentDepositLimit(totalMembers);
    const rentBlockedByAssets = rent > 0 && !rentAssetsOk;
    if(!rentAssetsOk) rent = 0;

    // ΚΟΤ
    const kotResult = kotBenefit(annualTaxable, h, propertyValue, deposits, kwh);
    const kot = kotResult.amount;
    const kotBlockedByAssets = kotResult.blockedByAssets;

    return {
      netMonthly, eee, a21, rent, kot, category, eeeBlockedByAssets, rentBlockedByAssets, kotBlockedByAssets,
      total: netMonthly + eee + a21 + rent + kot
    };
  }

  /* ============================================================
     ΔΙΑΓΡΑΜΜΑ
     Το viewBox αλλάζει ανάλογα με το πλάτος οθόνης — σε mobile
     χρησιμοποιούμε στενότερο/ψηλότερο viewBox ώστε το ίδιο διαθέσιμο
     πλάτος σε pixels να αντιστοιχεί σε λιγότερες εσωτερικές μονάδες,
     άρα κείμενο/γραμμές να ερμηνεύονται σε μεγαλύτερο πραγματικό
     μέγεθος αντί να σμικρύνονται μαζί με όλο το πλέγμα.
     ============================================================ */

  const MIN_GROSS = 200, MAX_GROSS = 3500, STEP = 10;

  const LAYOUTS = {
    desktop: { vbW: 800, vbH: 300, x0: 40, x1: 770, y0: 40, y1: 260 },
    mobile:  { vbW: 420, vbH: 340, x0: 34, x1: 400, y0: 26, y1: 288 }
  };
  let PLOT_X0, PLOT_X1, PLOT_Y0, PLOT_Y1, LAYOUT;

  const svg = document.getElementById('curveSvg');
  const chromeLayer = document.getElementById('chromeLayer');
  const curvePath = document.getElementById('curvePath');
  const cliffLayer = document.getElementById('cliffLayer');
  const marker = document.getElementById('movingMarker');
  const slider = document.getElementById('incomeSlider');
  const householdSelect = document.getElementById('householdSelect');
  const spouseIncomeField = document.getElementById('spouseIncomeField');
  const spouseIncomeInput = document.getElementById('spouseIncome');
  const ageSelect1 = document.getElementById('ageSelect1');
  const spouseAgeField = document.getElementById('spouseAgeField');
  const ageSelect2 = document.getElementById('ageSelect2');
  const axisLabel = document.getElementById('axisLabel');

  const grossReadout = document.getElementById('grossReadout');
  const netReadout = document.getElementById('netReadout');
  const deltaReadout = document.getElementById('deltaReadout');
  const e1Readout = document.getElementById('e1Readout');

  const eeeAmountEl = document.getElementById('eeeAmount');
  const eeeStatusEl = document.getElementById('eeeStatus');
  const eeeDotEl = document.getElementById('eeeDot');
  const a21AmountEl = document.getElementById('a21Amount');
  const a21StatusEl = document.getElementById('a21Status');
  const a21DotEl = document.getElementById('a21Dot');
  const rentAmountEl = document.getElementById('rentAmount');
  const rentStatusEl = document.getElementById('rentStatus');
  const rentDotEl = document.getElementById('rentDot');
  const kotAmountEl = document.getElementById('kotAmount');
  const kotStatusEl = document.getElementById('kotStatus');
  const kotDotEl = document.getElementById('kotDot');
  const benefitTotalAmountEl = document.getElementById('benefitTotalAmount');

  let samples = [];      // { gross, total, eee, a21, netMonthly }
  let yMin = 0, yMax = 1;
  let lastTotal = null;
  let yMaxLabelEl = null, yMinLabelEl = null;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const fmt = n => Math.round(n).toLocaleString('el-GR') + ' €';
  const xFor = gross => PLOT_X0 + (gross - MIN_GROSS) / (MAX_GROSS - MIN_GROSS) * (PLOT_X1 - PLOT_X0);
  const yFor = total => PLOT_Y1 - (total - yMin) / (yMax - yMin) * (PLOT_Y1 - PLOT_Y0);
  const spouseGross = () => parseFormatted(spouseIncomeInput.value);
  const propertyValueInput = document.getElementById('propertyValue');
  const depositsValueInput = document.getElementById('depositsValue');
  const getPropertyValue = () => parseFormatted(propertyValueInput.value);
  const getDeposits = () => parseFormatted(depositsValueInput.value);
  const kwhValueInput = document.getElementById('kwhValue');
  const getKwh = () => parseFloat(kwhValueInput.value) || 0;

  // Τα πεδία μισθού συζύγου/περιουσίας/καταθέσεων είναι text inputs που
  // εμφανίζουν χιλιάδες με τελεία (π.χ. "90.000") — το parseFormatted
  // αφαιρεί οτιδήποτε δεν είναι ψηφίο πριν μετατρέψει σε αριθμό, ώστε η
  // τελεία να μην μπερδευτεί με δεκαδικό διαχωριστικό.
  function parseFormatted(str){
    const digits = (str || '').replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function formatFieldValue(el){
    const digits = el.value.replace(/\D/g, '');
    el.value = digits ? Number(digits).toLocaleString('el-GR') : '';
  }

  function debounce(fn, delay){
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }
  const debouncedRebuild = debounce(() => rebuildAll(), 250);

  [spouseIncomeInput, propertyValueInput, depositsValueInput].forEach(el => {
    el.addEventListener('input', () => {
      formatFieldValue(el);
      debouncedRebuild();
    });
  });
  kwhValueInput.addEventListener('input', debouncedRebuild);

  function isMobileViewport(){
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function svgEl(tag, attrs){
    const el = document.createElementNS(SVGNS, tag);
    for(const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // Χτίζει πλέγμα/άξονες/ετικέτες μέσα στο chromeLayer, σύμφωνα με το
  // τρέχον LAYOUT — καλείται ξανά κάθε φορά που αλλάζει το viewport.
  function buildChrome(){
    chromeLayer.innerHTML = '';

    const steps = 4;
    for(let i = 1; i <= steps; i++){
      const y = PLOT_Y0 + (PLOT_Y1 - PLOT_Y0) * i / (steps + 1);
      chromeLayer.appendChild(svgEl('line', { class: 'grid-line', x1: PLOT_X0, y1: y.toFixed(1), x2: PLOT_X1, y2: y.toFixed(1) }));
    }
    chromeLayer.appendChild(svgEl('line', { class: 'axis-line', x1: PLOT_X0, y1: PLOT_Y1, x2: PLOT_X1, y2: PLOT_Y1 }));
    chromeLayer.appendChild(svgEl('line', { class: 'axis-line', x1: PLOT_X0, y1: PLOT_Y0, x2: PLOT_X0, y2: PLOT_Y1 }));

    const fs = LAYOUT.vbW < 600 ? 13 : 10.5; // μεγαλύτερη γραμματοσειρά στο στενό viewBox
    const capY = PLOT_Y1 + (LAYOUT.vbW < 600 ? 22 : 18);
    const minLbl = svgEl('text', { class: 'chart-caption-text', x: PLOT_X0, y: capY, style: `font-size:${fs}px` });
    minLbl.textContent = '200€';
    chromeLayer.appendChild(minLbl);

    const maxLbl = svgEl('text', { class: 'chart-caption-text', x: PLOT_X1, y: capY, 'text-anchor': 'end', style: `font-size:${fs}px` });
    maxLbl.textContent = '3.500€';
    chromeLayer.appendChild(maxLbl);

    const titleLbl = svgEl('text', { class: 'chart-caption-text', x: (PLOT_X0 + PLOT_X1) / 2, y: capY + 14, 'text-anchor': 'middle', style: `font-size:${fs}px` });
    titleLbl.textContent = 'Μεικτό μηνιαίο εισόδημα';
    chromeLayer.appendChild(titleLbl);

    yMaxLabelEl = svgEl('text', { class: 'chart-caption-text', x: PLOT_X0 - 6, y: PLOT_Y0 + 4, 'text-anchor': 'end', style: `font-size:${fs}px` });
    chromeLayer.appendChild(yMaxLabelEl);
    yMinLabelEl = svgEl('text', { class: 'chart-caption-text', x: PLOT_X0 - 6, y: PLOT_Y1, 'text-anchor': 'end', style: `font-size:${fs}px` });
    chromeLayer.appendChild(yMinLabelEl);
  }

  function applyLayout(){
    LAYOUT = isMobileViewport() ? LAYOUTS.mobile : LAYOUTS.desktop;
    svg.setAttribute('viewBox', `0 0 ${LAYOUT.vbW} ${LAYOUT.vbH}`);
    PLOT_X0 = LAYOUT.x0; PLOT_X1 = LAYOUT.x1; PLOT_Y0 = LAYOUT.y0; PLOT_Y1 = LAYOUT.y1;
    buildChrome();
  }

  function rebuildSamples(){
    const key = householdSelect.value;
    const sg = spouseGross();
    const age1 = ageSelect1.value, age2 = ageSelect2.value;
    const pv = getPropertyValue(), dep = getDeposits(), kwh = getKwh();
    samples = [];
    for(let g = MIN_GROSS; g <= MAX_GROSS; g += STEP){
      const r = computeAt(g, key, sg, age1, age2, pv, dep, kwh);
      samples.push({ gross: g, ...r });
    }
    const totals = samples.map(s => s.total);
    const rawMin = Math.min(...totals), rawMax = Math.max(...totals);
    const pad = (rawMax - rawMin) * 0.08 || 20;
    yMin = Math.max(0, rawMin - pad);
    yMax = rawMax + pad;
  }

  function drawCurve(){
    const d = samples.map((s, i) => (i === 0 ? 'M' : 'L') + xFor(s.gross).toFixed(1) + ',' + yFor(s.total).toFixed(1)).join(' ');
    curvePath.setAttribute('d', d);

    yMaxLabelEl.textContent = fmt(yMax);
    yMinLabelEl.textContent = fmt(yMin);

    // εντοπισμός γκρεμών (απότομες πτώσεις ανάμεσα σε διαδοχικά δείγματα)
    cliffLayer.innerHTML = '';
    for(let i = 1; i < samples.length; i++){
      const drop = samples[i - 1].total - samples[i].total;
      if(drop > 8){
        const xMid = (xFor(samples[i - 1].gross) + xFor(samples[i].gross)) / 2;
        const yTop = Math.min(yFor(samples[i - 1].total), yFor(samples[i].total));

        const line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('class', 'drop-line');
        line.setAttribute('x1', xMid); line.setAttribute('x2', xMid);
        line.setAttribute('y1', PLOT_Y0); line.setAttribute('y2', PLOT_Y1);
        cliffLayer.appendChild(line);

        const tri = document.createElementNS(SVGNS, 'polygon');
        tri.setAttribute('class', 'hazard-tri');
        const ty = Math.max(PLOT_Y0 + 14, yTop - 14);
        tri.setAttribute('points', `${xMid},${ty} ${xMid + 8},${ty + 14} ${xMid - 8},${ty + 14}`);
        cliffLayer.appendChild(tri);
      }
    }
  }

  function render(showDelta){
    const gross = parseFloat(slider.value);
    const h = HOUSEHOLDS[householdSelect.value];
    const sg = spouseGross();
    const r = computeAt(gross, householdSelect.value, sg, ageSelect1.value, ageSelect2.value, getPropertyValue(), getDeposits(), getKwh());

    marker.setAttribute('cx', xFor(gross));
    marker.setAttribute('cy', yFor(r.total));

    grossReadout.textContent = fmt(gross);
    netReadout.textContent = fmt(r.total);
    e1Readout.textContent = fmt((gross + (h.hasSpouse ? sg : 0)) * 14);

    if(showDelta && lastTotal !== null){
      const delta = Math.round(r.total - lastTotal);
      deltaReadout.textContent = (delta >= 0 ? '+' : '') + delta + ' €';
      deltaReadout.classList.toggle('drop-color', delta < 0);
    } else {
      // Παράμετρος άλλαξε (νοικοκυριό/σύζυγος), όχι το slider — δεν είναι
      // πραγματικό "βήμα" εισοδήματος, άρα δεν δείχνουμε ψευδή μεταβολή.
      deltaReadout.textContent = '—';
      deltaReadout.classList.remove('drop-color');
    }
    lastTotal = r.total;

    eeeAmountEl.textContent = fmt(r.eee);
    eeeStatusEl.textContent = r.eeeBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (r.eee > 0 ? 'Ενεργό' : 'Ανενεργό');
    eeeDotEl.className = 'status-dot ' + (r.eee > 0 ? 'active' : 'off');

    const a21Labels = { 0: 'Εκτός ορίου', 1: '1η κατηγορία', 2: '2η κατηγορία', 3: '3η κατηγορία' };
    a21AmountEl.textContent = fmt(r.a21);
    a21StatusEl.textContent = a21Labels[r.category];
    a21DotEl.className = 'status-dot ' + (r.category === 0 ? 'off' : r.category === 3 ? 'warn' : 'active');

    rentAmountEl.textContent = fmt(r.rent);
    rentStatusEl.textContent = r.rentBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (r.rent > 0 ? 'Ενεργό' : 'Εκτός ορίου');
    rentDotEl.className = 'status-dot ' + (r.rent > 0 ? 'active' : 'off');

    kotAmountEl.textContent = fmt(r.kot);
    kotStatusEl.textContent = r.kotBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (r.kot > 0 ? 'Ενεργό' : 'Εκτός ορίου');
    kotDotEl.className = 'status-dot ' + (r.kot > 0 ? 'active' : 'off');

    benefitTotalAmountEl.textContent = fmt(Math.round(r.eee) + Math.round(r.a21) + Math.round(r.rent) + Math.round(r.kot));
  }

  function update(){ render(true); }

  function rebuildAll(){
    const h = HOUSEHOLDS[householdSelect.value];
    axisLabel.textContent = h.label;
    spouseIncomeField.style.display = h.hasSpouse ? '' : 'none';
    spouseAgeField.style.display = h.hasSpouse ? '' : 'none';
    rebuildSamples();
    drawCurve();
    render(false);
  }

  slider.addEventListener('input', update);
  householdSelect.addEventListener('change', rebuildAll);
  ageSelect1.addEventListener('change', rebuildAll);
  ageSelect2.addEventListener('change', rebuildAll);

  applyLayout();
  rebuildAll();

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wasMobile = LAYOUT === LAYOUTS.mobile;
      if(wasMobile !== isMobileViewport()){
        applyLayout();
        rebuildAll();
      }
    }, 150);
  });

  const themeToggle = document.getElementById('themeToggle');
  const ttIcon = themeToggle.querySelector('.tt-icon');
  const ttLabel = themeToggle.querySelector('.tt-label');

  function setTheme(dark){
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeToggle.setAttribute('aria-pressed', String(dark));
    ttIcon.textContent = dark ? '☀' : '☾';
    ttLabel.textContent = dark ? 'Φωτεινό θέμα' : 'Σκούρο θέμα';
  }

  setTheme(true);
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
  });

  document.getElementById('introCloseBtn').addEventListener('click', () => {
    document.getElementById('introCard').style.display = 'none';
  });
