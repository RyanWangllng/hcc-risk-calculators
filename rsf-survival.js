let currentLanguage = 'en';

const continuousFields = ['tumor_dia', 'ast', 'glb', 'tp', 'hb', 'neu', 'bun'];
const categoricalFields = ['afp400', 'mvi', 'es', 'sgm', 'cpsule', 'asa3', 'sex'];
const requiredFields = [...continuousFields, ...categoricalFields];

function switchLanguage(lang) {
  document.querySelectorAll('.lang-btn').forEach(button => {
    button.classList.toggle(
      'active',
      (lang === 'zh' && button.textContent === '中文') ||
      (lang === 'en' && button.textContent === 'English')
    );
  });

  currentLanguage = lang;

  document.querySelectorAll('[data-en][data-zh]').forEach(element => {
    element.textContent = element.getAttribute(lang === 'zh' ? 'data-zh' : 'data-en');
  });

  const titleElement = document.querySelector('title');
  if (titleElement) {
    document.title = titleElement.getAttribute(lang === 'zh' ? 'data-zh' : 'data-en') || document.title;
  }

  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  localStorage.setItem('preferredLanguage', lang);
  refreshRiskLabelLanguage();
}

function initializeLanguage() {
  switchLanguage(localStorage.getItem('preferredLanguage') || 'en');
}

function collectPatientData() {
  const form = document.getElementById('rsfCalculatorForm');
  const formData = new FormData(form);
  const patient = {};

  requiredFields.forEach(field => {
    const value = formData.get(field);
    if (value === null || value === '') {
      throw new Error(currentLanguage === 'zh' ? '请填写所有必需字段' : 'Please complete all required fields');
    }

    if (continuousFields.includes(field)) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        throw new Error(currentLanguage === 'zh' ? '请输入有效数字' : 'Please enter valid numeric values');
      }
      patient[field] = numericValue;
    } else {
      patient[field] = String(value);
    }
  });

  return patient;
}

function buildPatientFeatures(patient, model) {
  const features = {};

  model.continuousFields.forEach(field => {
    const value = Number(patient[field]);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid continuous value for ${field}`);
    }
    features[field] = value;
  });

  Object.entries(model.categoryLevels).forEach(([field, levels]) => {
    const levelIndex = levels.indexOf(String(patient[field]));
    if (levelIndex === -1) {
      throw new Error(`Invalid category level for ${field}`);
    }

    // ranger was trained with one-based integer encodings created by R's match().
    features[`${field}_int`] = levelIndex + 1;
  });

  return features;
}

function predictTree(tree, features, featureNames) {
  let nodeIndex = 0;

  while (true) {
    const leftNode = tree.l[nodeIndex];
    const rightNode = tree.r[nodeIndex];

    if (leftNode === undefined || rightNode === undefined) {
      throw new Error(`Invalid RSF tree node index: ${nodeIndex}`);
    }

    if (leftNode === 0 && rightNode === 0) {
      return {
        chf36: tree.h36[nodeIndex],
        chf60: tree.h60[nodeIndex],
        risk: tree.hr[nodeIndex]
      };
    }

    const featureName = featureNames[tree.v[nodeIndex]];
    const value = features[featureName];
    if (!Number.isFinite(value)) {
      throw new Error(`Missing RSF feature: ${featureName}`);
    }

    nodeIndex = value <= tree.s[nodeIndex] ? leftNode : rightNode;
  }
}

function predictRsf(features, model) {
  const totals = model.trees.reduce((sum, tree) => {
    const prediction = predictTree(tree, features, model.featureNames);
    sum.chf36 += prediction.chf36;
    sum.chf60 += prediction.chf60;
    sum.risk += prediction.risk;
    return sum;
  }, { chf36: 0, chf60: 0, risk: 0 });

  const treeCount = model.trees.length;
  const riskScore = totals.risk / treeCount;

  return {
    riskScore,
    survival3Year: Math.exp(-(totals.chf36 / treeCount)),
    survival5Year: Math.exp(-(totals.chf60 / treeCount)),
    riskGroup: calculateRiskGroup(riskScore, model)
  };
}

function calculateRiskGroup(riskScore, model) {
  if (riskScore > model.metadata.riskThreshold) {
    return {
      level: 'high-risk',
      labelEn: 'High Risk',
      labelZh: '高风险'
    };
  }

  return {
    level: 'low-risk',
    labelEn: 'Low Risk',
    labelZh: '低风险'
  };
}

function formatProbability(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function displayResults(results) {
  document.getElementById('rsfRiskScore').textContent = results.riskScore.toFixed(4);

  const riskLevelElement = document.getElementById('rsfRiskLevel');
  riskLevelElement.textContent = currentLanguage === 'zh'
    ? results.riskGroup.labelZh
    : results.riskGroup.labelEn;
  riskLevelElement.className = `risk-badge ${results.riskGroup.level}`;
  riskLevelElement.dataset.labelEn = results.riskGroup.labelEn;
  riskLevelElement.dataset.labelZh = results.riskGroup.labelZh;

  document.getElementById('rsfSurvival3Year').textContent = formatProbability(results.survival3Year);
  document.getElementById('rsfSurvival5Year').textContent = formatProbability(results.survival5Year);
  document.getElementById('rsfResults').classList.remove('hidden');
  document.getElementById('rsfNoResults').classList.add('hidden');
}

function refreshRiskLabelLanguage() {
  const riskLevelElement = document.getElementById('rsfRiskLevel');
  if (!riskLevelElement || !riskLevelElement.dataset.labelEn) {
    return;
  }

  riskLevelElement.textContent = currentLanguage === 'zh'
    ? riskLevelElement.dataset.labelZh
    : riskLevelElement.dataset.labelEn;
}

function enhanceRadioSelection() {
  document.querySelectorAll('.radio-option').forEach(option => {
    const radio = option.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      option.classList.add('selected');
    }

    option.addEventListener('click', function () {
      const selectedRadio = this.querySelector('input[type="radio"]');
      if (!selectedRadio) {
        return;
      }

      selectedRadio.checked = true;
      document.querySelectorAll(`input[name="${selectedRadio.name}"]`).forEach(otherRadio => {
        otherRadio.closest('.radio-option').classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initializeLanguage();
  enhanceRadioSelection();

  const form = document.getElementById('rsfCalculatorForm');
  if (!form) {
    return;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const button = document.querySelector('.calculate-btn');
    const originalText = button.textContent;
    button.textContent = currentLanguage === 'zh' ? '计算中...' : 'Calculating...';
    button.disabled = true;

    setTimeout(() => {
      try {
        const model = window.RsfSurvivalModel;
        if (!model) {
          throw new Error(currentLanguage === 'zh' ? '模型文件未加载' : 'Model file is not loaded');
        }

        const patient = collectPatientData();
        const features = buildPatientFeatures(patient, model);
        const results = predictRsf(features, model);
        displayResults(results);
        document.querySelector('.results-section').scrollIntoView({ behavior: 'smooth' });
      } catch (error) {
        alert(error.message);
      } finally {
        button.textContent = originalText;
        button.disabled = false;
      }
    }, 150);
  });
});

window.RsfSurvivalCalculator = {
  buildPatientFeatures,
  predictRsf,
  calculateRiskGroup
};
