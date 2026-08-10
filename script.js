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

  // Το νοικοκυριό δεν είναι πια ονομαστικός πίνακας — χτίζεται δυναμικά από
  // δύο ανεξάρτητες επιλογές: υπάρχει σύζυγος/σύντροφος, και πόσα παιδιά.
  // Η μονογονεϊκή κατάσταση προκύπτει μόνη της (χωρίς σύζυγο + παιδιά≥1),
  // δεν είναι ξεχωριστή επιλογή. Έτσι 3, 4, 5+ παιδιά δουλεύουν ήδη χωρίς
  // να χρειάζεται ποτέ νέα "σύνθεση" να προστεθεί χειροκίνητα.
  function buildHousehold(hasSpouse, children){
    children = Math.max(0, children || 0);
    const isSingleParent = !hasSpouse && children >= 1;
    return {
      extraAdults: hasSpouse ? 1 : 0,
      minors: children,
      hasSpouse: hasSpouse,
      children: children,
      isSingleParent: isSingleParent
    };
  }

  // Φορολογική έκπτωση βάσης (άρθρο 16 ν.4172/2013, τρέχουσα εκδοχή — επιβεβαιωμένη
  // μέσω taxheaven.gr, 2026). Γραμμένη γενικά ώστε να δουλεύει ήδη για 3+ παιδιά
  // αν προστεθούν νέες συνθέσεις αργότερα, όχι μόνο για τις σημερινές 0-2.
  function taxCreditBase(children){
    if(children <= 0) return 777;
    if(children === 1) return 900;
    if(children === 2) return 1120;
    if(children === 3) return 1340;
    if(children === 4) return 1580;
    if(children === 5) return 1780;
    return 1780 + 220 * (children - 5);
  }

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
    // category: 1,2,3 or 0 (εκτός ορίου). 1ο+2ο τέκνο: βασικό ποσό το καθένα.
    // 3ο και κάθε επόμενο: διπλάσιο ποσό το καθένα (άρθρο 214 ν.4512/2018).
    const perChild = { 1: 70, 2: 42, 3: 28 }[category] || 0;
    if(children <= 0) return 0;
    const firstTwo = Math.min(children, 2) * perChild;
    const rest = Math.max(0, children - 2) * perChild * 2;
    return firstTwo + rest;
  }

  // Επίδομα ενοικίου — εισοδηματικό κριτήριο. Σε μονογονεϊκή οικογένεια με
  // τουλάχιστον 1 ανήλικο, το εισοδηματικό όριο (όχι το ποσό) παίρνει
  // επιπλέον +3.500€ (πηγή: oikogeneia.gov.gr) — στην πράξη αυτό εξισώνει
  // το όριο μονογονεϊκής+Ν παιδιών με του ζευγαριού+Ν παιδιών.
  function rentBenefit(annualTaxable, h){
    const extraMembers = h.extraAdults + h.minors;
    const monoBoost = (h.isSingleParent && h.minors >= 1) ? 3500 : 0;
    const incomeLimit = Math.min(7000 + 3500 * extraMembers + monoBoost, 21000);
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
     Το εισοδηματικό όριο είναι βασισμένο στη ΘΕΣΗ του μέλους, όχι στο
     αν είναι ενήλικας/ανήλικος — το 2ο μέλος (όποιο κι αν είναι, σύζυγος
     ή παιδί) προσθέτει πάντα 4.500€, κάθε επόμενο 2.250€. Αυτό ταιριάζει
     με την πηγή που δείχνει "2 ενήλικες" και "μονογονεϊκή με 1 παιδί" να
     έχουν το ΙΔΙΟ όριο (13.500€) — άρα δεν χρειάζεται ειδικός κλάδος για
     μονογονεϊκές, μόνο σωστός γενικός τύπος.
     Δεν μοντελοποιούνται: προσαύξηση ορίου εισοδήματος για ΑΜΕΑ 67%+
     (+8.000€) ή μηχανική υποστήριξη (+15.000€), ΚΟΤ Α (υψηλότερη
     έκπτωση, ευάλωτες ομάδες), ΚΟΤ Γ (πολύτεκνοι), και το προσαυξημένο
     όριο κατανάλωσης (1.900kWh/4μηνο αντί 1.400) για ήδη-δικαιούχους ΕΕΕ.
     ---------------------------------------------------------- */
  function kotIncomeLimit(h){
    const n = h.extraAdults + h.minors + 1;
    if(n <= 1) return 9000;
    return Math.min(9000 + 4500 + 2250 * (n - 2), 27000);
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

  function computeAt(grossMonthly, h, spouseGrossMonthly, age1, age2, propertyValue, deposits, kwh){
    const totalMembers = h.extraAdults + h.minors + 1;
    propertyValue = propertyValue || 0;
    deposits = deposits || 0;

    const p1 = computeIndividual(grossMonthly, taxCreditBase(h.children), age1);
    let netMonthly = p1.netMonthly;
    let combinedTaxableMonthly = p1.taxableMonthly;

    if(h.hasSpouse){
      const p2 = computeIndividual(spouseGrossMonthly || 0, 0, age2);
      netMonthly += p2.netMonthly;
      combinedTaxableMonthly += p2.taxableMonthly;
    }

    const annualTaxable = combinedTaxableMonthly * 14;

    // ΕΕΕ — βασίζεται στο συνολικό φορολογητέο εισόδημα νοικοκυριού.
    // Ποσά (216€ βάση, +108€/ενήλικο, +54€/ανήλικο, μέγιστο 972€/μήνα) και
    // μέγιστο εξαμηνιαίο εισόδημα 5.832€ επιβεβαιωμένα από oikogeneia.gov.gr
    // (Υπουργείο Κοινωνικής Συνοχής και Οικογένειας, ενημέρωση 21/1/2026).
    // Σε μονογονεϊκή οικογένεια, το μεγαλύτερο σε ηλικία ανήλικο λογίζεται
    // ως ενήλικας — μετράει στα 108€, όχι στα 54€.
    let eeeExtraAdults = h.extraAdults, eeeMinors = h.minors;
    if(h.isSingleParent && h.minors >= 1){
      eeeExtraAdults += 1;
      eeeMinors -= 1;
    }
    const guaranteed = Math.min(216 + eeeExtraAdults * 108 + eeeMinors * 54, 972);
    let eee = guaranteed - combinedTaxableMonthly;
    eee = eee < 10 ? 0 : Math.min(eee, guaranteed);
    const eeeAssetsOk = propertyValue <= eeeRealEstateLimit(totalMembers) && deposits <= eeeDepositLimit(totalMembers);
    const eeeBlockedByAssets = eee > 0 && !eeeAssetsOk;
    if(!eeeAssetsOk) eee = 0;

    // Α21 — σε μονογονεϊκή οικογένεια το 1ο τέκνο έχει στάθμιση 0,5 αντί
    // για 0,25 (άρθρο 214 ν.4512/2018, όπως τροποποιήθηκε).
    const coeff = h.isSingleParent
      ? 1 + (h.children >= 1 ? 0.5 + Math.max(0, h.children - 1) * 0.25 : 0)
      : 1 + (h.hasSpouse ? 0.5 : 0) + h.children * 0.25;
    const equivalentAnnual = annualTaxable / coeff;
    let category = 0;
    if(equivalentAnnual <= 6000) category = 1;
    else if(equivalentAnnual <= 10000) category = 2;
    else if(equivalentAnnual <= 15000) category = 3;
    const a21 = a21ChildAmount(category, h.children);

    // Επίδομα ενοικίου — +35€ πάγια προσαύξηση μονογονεϊκότητας πριν το πλαφόν,
    // μόνο όταν το νοικοκυριό είναι ήδη εντός εισοδηματικού ορίου.
    let rent = rentBenefit(annualTaxable, h);
    if(rent > 0 && h.isSingleParent) rent = Math.min(rent + 35, 210);
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

  const MIN_GROSS = 200, MAX_GROSS = 4000, STEP = 10;

  const LAYOUTS = {
    desktop: { vbW: 800, vbH: 300, x0: 40, x1: 770, y0: 40, y1: 260 },
    mobile:  { vbW: 420, vbH: 340, x0: 34, x1: 400, y0: 26, y1: 288 }
  };
  let PLOT_X0, PLOT_X1, PLOT_Y0, PLOT_Y1, LAYOUT;

  const svg = document.getElementById('curveSvg');
  const chromeLayer = document.getElementById('chromeLayer');
  const curvePath = document.getElementById('curvePath');
  const cliffLayer = document.getElementById('cliffLayer');
  const referenceLayer = document.getElementById('referenceLayer');
  const marker = document.getElementById('movingMarker');
  const referenceIncomeInput = document.getElementById('referenceIncomeInput');
  let referenceGross = 900;
  let offsetGross = 0;
  function getEffectiveGross(){
    return Math.min(MAX_GROSS, Math.max(MIN_GROSS, referenceGross + offsetGross));
  }
  const adultsSingleBtn = document.getElementById('adultsSingleBtn');
  const adultsCoupleBtn = document.getElementById('adultsCoupleBtn');
  const childButtons = document.querySelectorAll('.child-btn');
  const monoParentTag = document.getElementById('monoParentTag');
  let hasSpouseState = true;
  let childrenState = 2;
  function getCurrentHousehold(){ return buildHousehold(hasSpouseState, childrenState); }
  const basicFieldsGrid = document.getElementById('basicFieldsGrid');
  const spouseIncomeField = document.getElementById('spouseIncomeField');
  const spouseIncomeInput = document.getElementById('spouseIncome');
  const ageSelect1 = document.getElementById('ageSelect1');
  const spouseAgeField = document.getElementById('spouseAgeField');
  const ageSelect2 = document.getElementById('ageSelect2');
  const axisLabel = document.getElementById('axisLabel');

  const netReadout = document.getElementById('netReadout');
  const netDeltaEl = document.getElementById('netDelta');
  const e1Readout = document.getElementById('e1Readout');
  const e1DeltaEl = document.getElementById('e1Delta');
  const whatifResetBtn = document.getElementById('whatifResetBtn');
  const whatifCustomInput = document.getElementById('whatifCustomInput');
  const whatifCustomBtn = document.getElementById('whatifCustomBtn');

  const eeeAmountEl = document.getElementById('eeeAmount');
  const eeeStatusEl = document.getElementById('eeeStatus');
  const eeeDotEl = document.getElementById('eeeDot');
  const eeeAfterAmountEl = document.getElementById('eeeAfterAmount');
  const eeeDiffAmountEl = document.getElementById('eeeDiffAmount');
  const a21AmountEl = document.getElementById('a21Amount');
  const a21StatusEl = document.getElementById('a21Status');
  const a21DotEl = document.getElementById('a21Dot');
  const a21AfterAmountEl = document.getElementById('a21AfterAmount');
  const a21DiffAmountEl = document.getElementById('a21DiffAmount');
  const rentAmountEl = document.getElementById('rentAmount');
  const rentStatusEl = document.getElementById('rentStatus');
  const rentDotEl = document.getElementById('rentDot');
  const rentAfterAmountEl = document.getElementById('rentAfterAmount');
  const rentDiffAmountEl = document.getElementById('rentDiffAmount');
  const kotAmountEl = document.getElementById('kotAmount');
  const kotStatusEl = document.getElementById('kotStatus');
  const kotDotEl = document.getElementById('kotDot');
  const kotAfterAmountEl = document.getElementById('kotAfterAmount');
  const kotDiffAmountEl = document.getElementById('kotDiffAmount');
  const breakdownTable = document.getElementById('breakdownTable');
  const afterColHeaderEl = document.getElementById('afterColHeader');
  const benefitTotalAmountEl = document.getElementById('benefitTotalAmount');
  const benefitTotalAfterAmountEl = document.getElementById('benefitTotalAfterAmount');
  const summaryInsightEl = document.getElementById('summaryInsight');
  const livePreviewBar = document.getElementById('livePreviewBar');
  const livePreviewText = document.getElementById('livePreviewText');
  const summaryNetEl = document.getElementById('summaryNet');
  const summaryBenefitsEl = document.getElementById('summaryBenefits');
  const summaryTotalEl = document.getElementById('summaryTotal');
  const summaryRiskEl = document.getElementById('summaryRisk');
  const summaryNextLossEl = document.getElementById('summaryNextLoss');
  const whatifButtons = document.querySelectorAll('.whatif-btn:not(.whatif-btn-reset)');

  let samples = [];      // { gross, total, eee, a21, netMonthly }
  let yMin = 0, yMax = 1;
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
    maxLbl.textContent = '4.000€';
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
    const h = getCurrentHousehold();
    const sg = spouseGross();
    const age1 = ageSelect1.value, age2 = ageSelect2.value;
    const pv = getPropertyValue(), dep = getDeposits(), kwh = getKwh();
    samples = [];
    for(let g = MIN_GROSS; g <= MAX_GROSS; g += STEP){
      const r = computeAt(g, h, sg, age1, age2, pv, dep, kwh);
      samples.push({ gross: g, ...r });
    }
    const totals = samples.map(s => s.total);
    const rawMin = Math.min(...totals), rawMax = Math.max(...totals);
    const pad = (rawMax - rawMin) * 0.08 || 20;
    yMin = Math.max(0, rawMin - pad);
    yMax = rawMax + pad;
  }

  // Ψάχνει μπροστά από το τρέχον σημείο (μέσα στα ήδη υπολογισμένα samples)
  // για τον πρώτο γκρεμό — ίδιο κατώφλι (>8€) με αυτό που σχεδιάζει η καμπύλη.
  function findNextCliff(currentGross){
    for(let i = 1; i < samples.length; i++){
      if(samples[i].gross <= currentGross) continue;
      const drop = samples[i - 1].total - samples[i].total;
      if(drop > 8){
        return { distance: samples[i].gross - currentGross, dropAmount: drop };
      }
    }
    return null;
  }

  // Επιστρέφει το άθροισμα ΕΕΕ+Α21+ενοίκιο+ΚΟΤ σε ένα δεδομένο μεικτό
  // εισόδημα (από τα ήδη υπολογισμένα samples) — χρειάζεται ξεχωριστά από
  // το συνολικό ποσό, ώστε η κανονική προοδευτικότητα του φόρου να μην
  // περνάει ως "απώλεια επιδόματος" στο insight/ρίσκο.
  function benefitsAtGross(targetGross){
    const clamped = Math.max(MIN_GROSS, Math.min(MAX_GROSS, targetGross));
    let idx = Math.round((clamped - MIN_GROSS) / STEP);
    idx = Math.max(0, Math.min(samples.length - 1, idx));
    const s = samples[idx];
    return s.eee + s.a21 + s.rent + s.kot;
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

  // Κοινή συνάρτηση σοβαρότητας — τη χρησιμοποιούν και το executive summary
  // (στο πραγματικό εισόδημα αναφοράς) και η sticky γραμμή προεπισκόπησης
  // (στο ελάχιστο εισόδημα), ώστε να μη δείχνουν ποτέ αντιφατικά πράγματα.
  function computeSeverity(gross){
    const nextCliff = findNextCliff(gross);
    const benefitsNow = benefitsAtGross(gross);
    const benefitsPlus100 = benefitsAtGross(gross + 100);
    const benefitDelta100 = benefitsPlus100 - benefitsNow;
    const cliffImminent = nextCliff && nextCliff.distance <= 100;
    const cliffNear = nextCliff && nextCliff.distance <= 400;
    let severity;
    if(cliffImminent || benefitDelta100 <= -40) severity = 'high';
    else if(cliffNear || benefitDelta100 <= -10) severity = 'medium';
    else severity = 'low';
    return { severity, nextCliff, benefitsNow, benefitDelta100, cliffImminent };
  }

  function render(){
    const h = getCurrentHousehold();
    const sg = spouseGross();
    const age1 = ageSelect1.value, age2 = ageSelect2.value;
    const pv = getPropertyValue(), dep = getDeposits(), kwh = getKwh();

    const refGross = referenceGross;
    const effGross = getEffectiveGross();
    const hasOffset = Math.round(effGross) !== Math.round(refGross);

    const rRef = computeAt(refGross, h, sg, age1, age2, pv, dep, kwh);
    const rEff = hasOffset ? computeAt(effGross, h, sg, age1, age2, pv, dep, kwh) : rRef;

    // Ο κινούμενος δείκτης δείχνει το υποθετικό σημείο (αναφορά+offset) —
    // η διακεκομμένη γραμμή αναφοράς μένει σταθερή στο πραγματικό εισόδημα.
    marker.setAttribute('cx', xFor(effGross));
    marker.setAttribute('cy', yFor(rEff.total));

    netReadout.textContent = fmt(rRef.total);
    e1Readout.textContent = fmt((refGross + (h.hasSpouse ? sg : 0)) * 14);

    function setDelta(el, deltaVal){
      el.classList.remove('drop-color', 'gain-color', 'warn-color');
      if(!hasOffset || Math.round(deltaVal) === 0){
        el.textContent = '';
        return;
      }
      const rounded = Math.round(deltaVal);
      el.textContent = (rounded >= 0 ? '+' : '') + rounded + ' €';
      el.classList.add(rounded > 0 ? 'gain-color' : 'drop-color');
    }
    setDelta(netDeltaEl, rEff.total - rRef.total);
    setDelta(e1DeltaEl, (effGross - refGross) * 14);

    function setDiffCell(el, refVal, effVal){
      el.classList.remove('gain-color', 'drop-color');
      if(!hasOffset){ el.textContent = ''; return; }
      const diff = Math.round(effVal) - Math.round(refVal);
      el.textContent = (diff >= 0 ? '+' : '') + diff + ' €';
      if(diff !== 0) el.classList.add(diff > 0 ? 'gain-color' : 'drop-color');
    }

    // --- Πίνακας ανάλυσης: "Ποσό" = στο πραγματικό σου εισόδημα,
    //     "Μετά" = στο υποθετικό σενάριο (μόνο αν διαφέρει) ---
    eeeAmountEl.textContent = fmt(rRef.eee);
    eeeStatusEl.textContent = rRef.eeeBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (rRef.eee > 0 ? 'Ενεργό' : 'Ανενεργό');
    eeeDotEl.className = 'status-dot ' + (rRef.eee > 0 ? 'active' : 'off');
    eeeAfterAmountEl.textContent = hasOffset ? fmt(rEff.eee) : '';
    setDiffCell(eeeDiffAmountEl, rRef.eee, rEff.eee);

    const a21Labels = { 0: 'Εκτός ορίου', 1: '1η κατηγορία', 2: '2η κατηγορία', 3: '3η κατηγορία' };
    a21AmountEl.textContent = fmt(rRef.a21);
    a21StatusEl.textContent = a21Labels[rRef.category];
    a21DotEl.className = 'status-dot ' + (rRef.category === 0 ? 'off' : rRef.category === 3 ? 'warn' : 'active');
    a21AfterAmountEl.textContent = hasOffset ? fmt(rEff.a21) : '';
    setDiffCell(a21DiffAmountEl, rRef.a21, rEff.a21);

    rentAmountEl.textContent = fmt(rRef.rent);
    rentStatusEl.textContent = rRef.rentBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (rRef.rent > 0 ? 'Ενεργό' : 'Εκτός ορίου');
    rentDotEl.className = 'status-dot ' + (rRef.rent > 0 ? 'active' : 'off');
    rentAfterAmountEl.textContent = hasOffset ? fmt(rEff.rent) : '';
    setDiffCell(rentDiffAmountEl, rRef.rent, rEff.rent);

    kotAmountEl.textContent = fmt(rRef.kot);
    kotStatusEl.textContent = rRef.kotBlockedByAssets ? 'Εκτός περιουσιακών ορίων' : (rRef.kot > 0 ? 'Ενεργό' : 'Εκτός ορίου');
    kotDotEl.className = 'status-dot ' + (rRef.kot > 0 ? 'active' : 'off');
    kotAfterAmountEl.textContent = hasOffset ? fmt(rEff.kot) : '';
    setDiffCell(kotDiffAmountEl, rRef.kot, rEff.kot);

    breakdownTable.classList.toggle('has-offset', hasOffset);
    if(hasOffset){
      const offsetRounded = Math.round(effGross - refGross);
      afterColHeaderEl.textContent = 'Μετά (' + (offsetRounded >= 0 ? '+' : '') + offsetRounded + '€)';
    }

    benefitTotalAmountEl.textContent = fmt(Math.round(rRef.eee) + Math.round(rRef.a21) + Math.round(rRef.rent) + Math.round(rRef.kot));

    benefitTotalAfterAmountEl.classList.remove('gain-color', 'drop-color');
    if(hasOffset){
      const refBenefitsSum = Math.round(rRef.eee) + Math.round(rRef.a21) + Math.round(rRef.rent) + Math.round(rRef.kot);
      const effBenefitsSum = Math.round(rEff.eee) + Math.round(rEff.a21) + Math.round(rEff.rent) + Math.round(rEff.kot);
      benefitTotalAfterAmountEl.textContent = fmt(effBenefitsSum);
      benefitTotalAfterAmountEl.classList.add(effBenefitsSum >= refBenefitsSum ? 'gain-color' : 'drop-color');
    } else {
      benefitTotalAfterAmountEl.textContent = '';
    }

    // --- Executive summary — πάντα στο πραγματικό σου εισόδημα (αναφορά),
    //     ανεξάρτητα από όποιο "τι θα γινόταν" εξερευνάς αυτή τη στιγμή ---
    const benefitsSum = Math.round(rRef.eee) + Math.round(rRef.a21) + Math.round(rRef.rent) + Math.round(rRef.kot);
    summaryNetEl.textContent = fmt(rRef.netMonthly);
    summaryBenefitsEl.textContent = fmt(benefitsSum);
    summaryTotalEl.textContent = fmt(rRef.total);

    const { severity, nextCliff, benefitsNow, benefitDelta100, cliffImminent } = computeSeverity(refGross);

    const severityClass = { high: 'drop-color', medium: 'warn-color', low: 'gain-color' }[severity];
    const riskLabel = { high: 'Υψηλό', medium: 'Μέτριο', low: 'Χαμηλό' }[severity];

    summaryRiskEl.classList.remove('gain-color', 'warn-color', 'drop-color');
    summaryRiskEl.textContent = riskLabel;
    summaryRiskEl.classList.add(severityClass);

    summaryNextLossEl.classList.remove('gain-color', 'warn-color', 'drop-color');
    summaryNextLossEl.textContent = nextCliff ? `+${nextCliff.distance}€ → -${Math.round(nextCliff.dropAmount)}€` : 'Κανένας κοντινός';
    summaryNextLossEl.classList.add(severityClass);

    summaryInsightEl.classList.remove('gain-color', 'warn-color', 'drop-color');
    summaryInsightEl.classList.add(severityClass);
    if(cliffImminent){
      summaryInsightEl.textContent = `Προσοχή: σε ${nextCliff.distance}€ ακόμα μεικτό, χάνεις ${Math.round(nextCliff.dropAmount)}€ σε επίδομα.`;
    } else if(benefitDelta100 <= -40){
      summaryInsightEl.textContent = `Η επόμενη αύξηση μισθού μειώνει τα επιδόματά σου κατά περίπου ${Math.round(-benefitDelta100)}€ ανά 100€ αύξησης.`;
    } else if(benefitDelta100 <= -10){
      summaryInsightEl.textContent = `Μέρος της αύξησης μισθού αντισταθμίζεται από μικρή μείωση επιδομάτων εδώ (περίπου ${Math.round(-benefitDelta100)}€ ανά 100€).`;
    } else if(benefitsNow > 0 || nextCliff){
      summaryInsightEl.textContent = `Τα επιδόματά σου παραμένουν σταθερά σε αυτό το εύρος — καμία άμεση απώλεια.`;
    } else {
      summaryInsightEl.textContent = `Δεν υπάρχει ενεργό επίδομα σε αυτό το εισόδημα — η αύξηση μισθού μειώνεται μόνο από φόρο/εισφορές, όχι από απώλεια επιδόματος.`;
    }
  }

  function updateLivePreview(){
    const h = getCurrentHousehold();
    const sg = spouseGross();
    const r = computeAt(referenceGross, h, sg, ageSelect1.value, ageSelect2.value, getPropertyValue(), getDeposits(), getKwh());
    const { severity } = computeSeverity(referenceGross);

    livePreviewBar.classList.remove('medium', 'high');
    if(severity === 'medium') livePreviewBar.classList.add('medium');
    else if(severity === 'high') livePreviewBar.classList.add('high');

    const label = householdLabel(h);
    livePreviewText.innerHTML = `${label}, στο εισόδημά σου: <span class="num">${fmt(r.total)}</span> συνολικά`;
  }

  function householdLabel(h){
    if(h.children === 0) return h.hasSpouse ? 'ζευγάρι χωρίς παιδιά' : 'άγαμος/η χωρίς παιδιά';
    const childText = h.children === 1 ? '1 παιδί' : (h.children >= 5 ? '5+ παιδιά' : h.children + ' παιδιά');
    return (h.isSingleParent ? 'μονογονεϊκή' : 'ζευγάρι') + ' με ' + childText;
  }

  // Στατική, διακεκομμένη γραμμή στο πραγματικό εισόδημα του χρήστη —
  // σταθερή, ανεξάρτητη από όποιο "τι θα γινόταν" εξερευνά κανείς.
  function drawReferenceLine(){
    referenceLayer.innerHTML = '';
    const x = xFor(referenceGross);

    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('class', 'reference-line');
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.setAttribute('y1', PLOT_Y0); line.setAttribute('y2', PLOT_Y1);
    referenceLayer.appendChild(line);

    const label = document.createElementNS(SVGNS, 'text');
    label.setAttribute('class', 'reference-label');
    label.setAttribute('x', x);
    label.setAttribute('y', PLOT_Y0 - 6);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = 'ΕΣΥ';
    referenceLayer.appendChild(label);
  }

  function rebuildAll(){
    const h = getCurrentHousehold();
    axisLabel.textContent = householdLabel(h);
    spouseIncomeField.style.display = h.hasSpouse ? '' : 'none';
    spouseAgeField.style.display = h.hasSpouse ? '' : 'none';
    basicFieldsGrid.style.display = h.hasSpouse ? '' : 'none';
    monoParentTag.style.display = h.isSingleParent ? '' : 'none';
    offsetGross = 0;
    rebuildSamples();
    updateLivePreview();
    drawCurve();
    drawReferenceLine();
    render();
  }

  referenceIncomeInput.addEventListener('input', () => {
    formatFieldValue(referenceIncomeInput);
    referenceGross = Math.min(MAX_GROSS, Math.max(MIN_GROSS, parseFormatted(referenceIncomeInput.value)));
    rebuildAll();
  });

  whatifResetBtn.addEventListener('click', () => {
    offsetGross = 0;
    render();
  });

  adultsSingleBtn.addEventListener('click', () => {
    hasSpouseState = false;
    adultsSingleBtn.classList.add('selected');
    adultsCoupleBtn.classList.remove('selected');
    rebuildAll();
  });
  adultsCoupleBtn.addEventListener('click', () => {
    hasSpouseState = true;
    adultsCoupleBtn.classList.add('selected');
    adultsSingleBtn.classList.remove('selected');
    rebuildAll();
  });
  childButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      childrenState = parseInt(btn.dataset.count, 10) || 0;
      childButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      rebuildAll();
    });
  });
  ageSelect1.addEventListener('change', rebuildAll);
  ageSelect2.addEventListener('change', rebuildAll);

  whatifButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseFloat(btn.dataset.amount) || 0;
      const clampedEffective = Math.min(MAX_GROSS, Math.max(MIN_GROSS, referenceGross + offsetGross + amount));
      offsetGross = clampedEffective - referenceGross;
      render();
    });
  });

  function applyCustomWhatif(){
    const amount = parseFloat(whatifCustomInput.value.replace(',', '.'));
    if(!amount || isNaN(amount)) return;
    const clampedEffective = Math.min(MAX_GROSS, Math.max(MIN_GROSS, referenceGross + offsetGross + amount));
    offsetGross = clampedEffective - referenceGross;
    whatifCustomInput.value = '';
    render();
  }
  whatifCustomBtn.addEventListener('click', applyCustomWhatif);
  whatifCustomInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') applyCustomWhatif();
  });

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
  const THEME_KEY = 'chartis-eisodimatos-theme';

  function setTheme(dark, save){
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeToggle.setAttribute('aria-pressed', String(dark));
    ttIcon.textContent = dark ? '☀' : '☾';
    ttLabel.textContent = dark ? 'Φωτεινό θέμα' : 'Σκούρο θέμα';
    if(save){
      try{ localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); }catch(e){}
    }
  }

  let initialDark = true;
  try{
    const saved = localStorage.getItem(THEME_KEY);
    if(saved === 'light') initialDark = false;
  }catch(e){}
  setTheme(initialDark, false);

  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark, true);
  });

  const introCard = document.getElementById('introCard');
  const INTRO_DISMISSED_KEY = 'chartis-eisodimatos-intro-dismissed';

  try{
    if(localStorage.getItem(INTRO_DISMISSED_KEY) === '1') introCard.style.display = 'none';
  }catch(e){}

  document.getElementById('introCloseBtn').addEventListener('click', () => {
    introCard.style.display = 'none';
    try{ localStorage.setItem(INTRO_DISMISSED_KEY, '1'); }catch(e){}
  });
