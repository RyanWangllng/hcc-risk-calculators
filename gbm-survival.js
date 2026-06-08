let currentLanguage = 'en';

const continuousFields = ['tumor_num', 'tumor_dia', 'nlr', 'glb', 'bun', 'copy'];
const requiredFields = [
  'tumor_num',
  'tumor_dia',
  'nlr',
  'glb',
  'bun',
  'copy',
  'sex',
  'sgm',
  'afp400',
  'hpm',
  'rm',
  'mvi',
  'satellite',
  'cpsule',
  'LF50',
  'es'
];

function switchLanguage(lang) {
  const langButtons = document.querySelectorAll('.lang-btn');
  langButtons.forEach(btn => btn.classList.remove('active'));

  langButtons.forEach(btn => {
    if ((lang === 'zh' && btn.textContent === '中文') ||
      (lang === 'en' && btn.textContent === 'English')) {
      btn.classList.add('active');
    }
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
  const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
  switchLanguage(savedLanguage);
}

function collectPatientData() {
  const form = document.getElementById('gbmCalculatorForm');
  const formData = new FormData(form);
  const patient = {};

  requiredFields.forEach(field => {
    const value = formData.get(field);
    if (value === null || value === '') {
      throw new Error(currentLanguage === 'zh' ? '请填写所有必需字段' : 'Please complete all required fields');
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(currentLanguage === 'zh' ? '请输入有效数字' : 'Please enter valid numeric values');
    }

    patient[field] = numericValue;
  });

  return patient;
}

function standardizePatient(patient, model) {
  const scaled = { ...patient };

  continuousFields.forEach(field => {
    const params = model.scaling[field];
    if (!params || !Number.isFinite(params.sd) || params.sd === 0) {
      throw new Error(`Invalid scaling parameters for ${field}`);
    }

    scaled[field] = (patient[field] - params.mean) / params.sd;
  });

  return scaled;
}

function predictTree(tree, patient, varNames) {
  let nodeIndex = 0;

  while (nodeIndex >= 0) {
    const node = tree[nodeIndex];
    if (!node) {
      throw new Error(`Invalid GBM tree node index: ${nodeIndex}`);
    }

    if (node.splitVar === -1) {
      return node.prediction;
    }

    const variableName = varNames[node.splitVar];
    const value = patient[variableName];

    if (!Number.isFinite(value)) {
      nodeIndex = node.missingNode;
    } else if (value < node.splitCodePred) {
      nodeIndex = node.leftNode;
    } else {
      nodeIndex = node.rightNode;
    }
  }

  throw new Error('GBM tree traversal did not reach a terminal node');
}

function predictRiskScore(patient, model) {
  return model.trees.reduce((score, tree) => {
    return score + predictTree(tree, patient, model.varNames);
  }, model.initF);
}

function interpolateBaselineSurvival(time, baseline) {
  const times = baseline.time;
  const survival = baseline.survival;

  if (time <= times[0]) {
    return survival[0];
  }

  const lastIndex = times.length - 1;
  if (time >= times[lastIndex]) {
    return survival[lastIndex];
  }

  for (let i = 1; i < times.length; i += 1) {
    if (times[i] >= time) {
      const x0 = times[i - 1];
      const x1 = times[i];
      const y0 = survival[i - 1];
      const y1 = survival[i];
      const ratio = (time - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }

  return survival[lastIndex];
}

function calculateSurvivalProbability(riskScore, month, model) {
  const baselineSurvival = interpolateBaselineSurvival(month, model.baseline);
  return Math.pow(baselineSurvival, Math.exp(riskScore));
}

function calculateMedianSurvival(riskScore, model) {
  const riskMultiplier = Math.exp(riskScore);
  const times = model.baseline.time;
  const survival = model.baseline.survival;

  for (let i = 0; i < times.length; i += 1) {
    const patientSurvival = Math.pow(survival[i], riskMultiplier);
    if (patientSurvival <= 0.5) {
      return times[i];
    }
  }

  return null;
}

function calculateRiskGroup(riskScore, model) {
  const threshold = model.metadata.riskThreshold;
  if (riskScore > threshold) {
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

function formatRiskScore(value) {
  return value.toFixed(4);
}

function displayResults(results) {
  document.getElementById('gbmRiskScore').textContent = formatRiskScore(results.riskScore);

  const riskLevelElement = document.getElementById('gbmRiskLevel');
  riskLevelElement.textContent = currentLanguage === 'zh' ? results.riskGroup.labelZh : results.riskGroup.labelEn;
  riskLevelElement.className = `risk-badge ${results.riskGroup.level}`;
  riskLevelElement.dataset.level = results.riskGroup.level;
  riskLevelElement.dataset.labelEn = results.riskGroup.labelEn;
  riskLevelElement.dataset.labelZh = results.riskGroup.labelZh;

  document.getElementById('gbmSurvival1Year').textContent = formatProbability(results.survival1Year);
  document.getElementById('gbmSurvival3Year').textContent = formatProbability(results.survival3Year);
  document.getElementById('gbmSurvival5Year').textContent = formatProbability(results.survival5Year);

  document.getElementById('gbmResults').classList.remove('hidden');
  document.getElementById('gbmNoResults').classList.add('hidden');
}

function refreshRiskLabelLanguage() {
  const riskLevelElement = document.getElementById('gbmRiskLevel');
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

  const form = document.getElementById('gbmCalculatorForm');
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    try {
      const model = window.GbmSurvivalModel;
      if (!model) {
        throw new Error(currentLanguage === 'zh' ? '模型文件未加载' : 'Model file is not loaded');
      }

      const button = document.querySelector('.calculate-btn');
      const originalText = button.textContent;
      button.textContent = currentLanguage === 'zh' ? '计算中...' : 'Calculating...';
      button.disabled = true;

      setTimeout(() => {
        try {
          const rawPatient = collectPatientData();
          const scaledPatient = standardizePatient(rawPatient, model);
          const riskScore = predictRiskScore(scaledPatient, model);

          const results = {
            riskScore: riskScore,
            riskGroup: calculateRiskGroup(riskScore, model),
            survival1Year: calculateSurvivalProbability(riskScore, 12, model),
            survival3Year: calculateSurvivalProbability(riskScore, 36, model),
            survival5Year: calculateSurvivalProbability(riskScore, 60, model)
          };

          displayResults(results);
          document.querySelector('.results-section').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
          alert(error.message);
        } finally {
          button.textContent = originalText;
          button.disabled = false;
        }
      }, 150);
    } catch (error) {
      alert(error.message);
    }
  });
});

window.GbmSurvivalCalculator = {
  standardizePatient,
  predictRiskScore,
  calculateSurvivalProbability,
  calculateMedianSurvival,
  calculateRiskGroup
};
