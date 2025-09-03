// 预测模型的风险评分系数（基于临床研究数据模拟）
const riskFactors = {
  portalHypertension: { yes: 0.3, no: 0 },
  macrovascularInvasion: { yes: 0.8, no: 0 },
  afpLevel: { high: 0.4, low: 0 },
  microvascularInvasion: { yes: 0.5, no: 0 },
  childPugh: { B: 0.6, A: 0 },
  resectionMargin: { narrow: 0.3, wide: 0 },
  tumorNumber: { '1': 0, '2': 0.2, '3plus': 0.5 },
  tumorSize: { small: 0, medium: 0.3, large: 0.7 }
};

// TACE治疗效果系数
const taceEffectiveness = {
  portalHypertension: { yes: 0.15, no: 0.25 },
  macrovascularInvasion: { yes: 0.1, no: 0.3 },
  afpLevel: { high: 0.15, low: 0.25 },
  microvascularInvasion: { yes: 0.15, no: 0.25 },
  childPugh: { B: 0.1, A: 0.25 },
  resectionMargin: { narrow: 0.2, wide: 0.3 },
  tumorNumber: { '1': 0.3, '2': 0.2, '3plus': 0.1 },
  tumorSize: { small: 0.3, medium: 0.2, large: 0.1 }
};

// 基础生存时间（月）
const baseSurvivalTime = 48;

// 当前语言状态
let currentLanguage = 'en'; // 默认英文

// 语言切换功能
function switchLanguage(lang) {
  const langButtons = document.querySelectorAll('.lang-btn');
  langButtons.forEach(btn => btn.classList.remove('active'));

  // 更简单的方法：直接通过按钮文本内容找到对应按钮
  langButtons.forEach(btn => {
    if ((lang === 'zh' && btn.textContent === '中文') ||
      (lang === 'en' && btn.textContent === 'English')) {
      btn.classList.add('active');
    }
  });

  currentLanguage = lang;

  // 获取所有具有双语属性的元素
  const elements = document.querySelectorAll('[data-en][data-zh]');

  elements.forEach(element => {
    if (lang === 'en') {
      element.textContent = element.getAttribute('data-en');
    } else if (lang === 'zh') {
      element.textContent = element.getAttribute('data-zh');
    }
  });

  // 更新页面标题
  const titleElement = document.querySelector('title');
  if (titleElement) {
    if (lang === 'en') {
      document.title = titleElement.getAttribute('data-en') || document.title;
    } else if (lang === 'zh') {
      document.title = titleElement.getAttribute('data-zh') || document.title;
    }
  }

  // 更新HTML语言属性
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  // 保存语言偏好到localStorage
  localStorage.setItem('preferredLanguage', lang);
}

// 初始化页面语言
function initializeLanguage() {
  // 默认使用英文，因为用户要求默认语言为英文
  const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
  switchLanguage(savedLanguage);
}

// 计算风险评分
function calculateRiskScore(formData) {
  let riskScore = 0;

  for (const [factor, value] of Object.entries(formData)) {
    if (riskFactors[factor] && riskFactors[factor][value] !== undefined) {
      riskScore += riskFactors[factor][value];
    }
  }

  return riskScore;
}

// 计算TACE效果评分
function calculateTaceEffect(formData) {
  let taceEffect = 0;
  let factors = 0;

  for (const [factor, value] of Object.entries(formData)) {
    if (taceEffectiveness[factor] && taceEffectiveness[factor][value] !== undefined) {
      taceEffect += taceEffectiveness[factor][value];
      factors++;
    }
  }

  return factors > 0 ? taceEffect / factors : 0.2; // 平均效果
}

// 计算生存时间
function calculateSurvivalTime(riskScore, withTace = false, taceEffect = 0) {
  // 基于风险评分调整生存时间
  let survivalTime = baseSurvivalTime * Math.exp(-riskScore);

  if (withTace) {
    // TACE治疗效果
    const taceMultiplier = 1 + taceEffect;
    survivalTime = survivalTime * taceMultiplier;
  }

  return Math.round(survivalTime * 10) / 10; // 保留一位小数
}

// 计算生存率
function calculateSurvivalRate(survivalTime, years) {
  const months = years * 12;
  // 使用指数衰减模型
  const rate = Math.exp(-months / survivalTime) * 100;
  return Math.max(0, Math.min(100, Math.round(rate * 10) / 10)); // 限制在0-100%之间
}

// 显示结果
function displayResults(results) {
  const resultsDiv = document.getElementById('results');
  const noResultsDiv = document.getElementById('noResults');

  // 更新数值
  document.getElementById('withTaceSurvival').textContent = results.withTace.survivalTime;
  document.getElementById('withTace3Year').textContent = results.withTace.survival3Year + '%';
  document.getElementById('withTace5Year').textContent = results.withTace.survival5Year + '%';

  document.getElementById('withoutTaceSurvival').textContent = results.withoutTace.survivalTime;
  document.getElementById('withoutTace3Year').textContent = results.withoutTace.survival3Year + '%';
  document.getElementById('withoutTace5Year').textContent = results.withoutTace.survival5Year + '%';

  document.getElementById('netBenefit').textContent = results.netBenefit.survivalTime;
  document.getElementById('netBenefit3Year').textContent = results.netBenefit.survival3Year + '%';
  document.getElementById('netBenefit5Year').textContent = results.netBenefit.survival5Year + '%';

  // 显示结果，隐藏提示
  resultsDiv.classList.remove('hidden');
  noResultsDiv.classList.add('hidden');

  // 添加动画效果
  resultsDiv.style.opacity = '0';
  setTimeout(() => {
    resultsDiv.style.transition = 'opacity 0.5s ease-in';
    resultsDiv.style.opacity = '1';
  }, 100);
}

// 验证表单
function validateForm(formData) {
  const requiredFields = [
    'portalHypertension',
    'macrovascularInvasion',
    'afpLevel',
    'microvascularInvasion',
    'childPugh',
    'resectionMargin',
    'tumorNumber',
    'tumorSize'
  ];

  for (const field of requiredFields) {
    if (!formData[field]) {
      return false;
    }
  }
  return true;
}

// 收集表单数据
function collectFormData() {
  const calculatorForm = document.getElementById('calculatorForm');
  const formData = new FormData(calculatorForm);
  const data = {};

  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }

  return data;
}

// 添加表单提交事件监听
document.addEventListener('DOMContentLoaded', function () {
  // 初始化页面语言
  initializeLanguage();

  const form = document.getElementById('calculatorForm');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // 收集表单数据
    const formData = collectFormData();

    // 验证表单
    if (!validateForm(formData)) {
      const message = currentLanguage === 'zh' ? '请填写所有必需的字段' : 'Please fill in all required fields';
      alert(message);
      return;
    }

    // 添加计算动画
    const calculateBtn = document.querySelector('.calculate-btn');
    const originalText = calculateBtn.textContent;
    const calculatingText = currentLanguage === 'zh' ? '计算中...' : 'Calculating...';
    calculateBtn.textContent = calculatingText;
    calculateBtn.disabled = true;

    // 模拟计算延迟
    setTimeout(() => {
      // 计算风险评分
      const riskScore = calculateRiskScore(formData);

      // 计算TACE效果
      const taceEffect = calculateTaceEffect(formData);

      // 计算不接受TACE治疗的结果
      const withoutTaceSurvival = calculateSurvivalTime(riskScore, false);
      const withoutTace3Year = calculateSurvivalRate(withoutTaceSurvival, 3);
      const withoutTace5Year = calculateSurvivalRate(withoutTaceSurvival, 5);

      // 计算接受TACE治疗的结果
      const withTaceSurvival = calculateSurvivalTime(riskScore, true, taceEffect);
      const withTace3Year = calculateSurvivalRate(withTaceSurvival, 3);
      const withTace5Year = calculateSurvivalRate(withTaceSurvival, 5);

      // 计算净获益
      const netBenefitSurvival = Math.round((withTaceSurvival - withoutTaceSurvival) * 10) / 10;
      const netBenefit3Year = Math.round((withTace3Year - withoutTace3Year) * 10) / 10;
      const netBenefit5Year = Math.round((withTace5Year - withoutTace5Year) * 10) / 10;

      // 组织结果
      const results = {
        withTace: {
          survivalTime: withTaceSurvival,
          survival3Year: withTace3Year,
          survival5Year: withTace5Year
        },
        withoutTace: {
          survivalTime: withoutTaceSurvival,
          survival3Year: withoutTace3Year,
          survival5Year: withoutTace5Year
        },
        netBenefit: {
          survivalTime: netBenefitSurvival >= 0 ? '+' + netBenefitSurvival : netBenefitSurvival,
          survival3Year: netBenefit3Year >= 0 ? '+' + netBenefit3Year : netBenefit3Year,
          survival5Year: netBenefit5Year >= 0 ? '+' + netBenefit5Year : netBenefit5Year
        }
      };

      // 显示结果
      displayResults(results);

      // 恢复按钮
      calculateBtn.textContent = originalText;
      calculateBtn.disabled = false;

      // 滚动到结果区域
      document.querySelector('.results-section').scrollIntoView({
        behavior: 'smooth'
      });

    }, 1000); // 1秒延迟模拟计算过程
  });

  // 添加单选按钮点击效果
  const radioOptions = document.querySelectorAll('.radio-option');
  radioOptions.forEach(option => {
    option.addEventListener('click', function () {
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;

        // 移除同组其他选项的选中状态视觉效果
        const groupName = radio.name;
        const sameGroupOptions = document.querySelectorAll(`input[name="${groupName}"]`);
        sameGroupOptions.forEach(otherRadio => {
          otherRadio.closest('.radio-option').classList.remove('selected');
        });

        // 添加当前选项的选中状态
        this.classList.add('selected');
      }
    });
  });

  // 添加输入验证提示
  const validationForm = document.getElementById('calculatorForm');
  const inputs = validationForm.querySelectorAll('input[required]');

  inputs.forEach(input => {
    input.addEventListener('change', function () {
      // 检查是否所有必需字段都已填写
      const allFilled = Array.from(inputs).every(inp => {
        const groupName = inp.name;
        return document.querySelector(`input[name="${groupName}"]:checked`);
      });

      if (allFilled) {
        document.querySelector('.calculate-btn').style.background =
          'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
      }
    });
  });
});

// 添加页面加载动画
window.addEventListener('load', function () {
  const container = document.querySelector('.container');
  container.style.opacity = '0';
  container.style.transform = 'translateY(30px)';

  setTimeout(() => {
    container.style.transition = 'all 0.8s ease-out';
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
  }, 100);
});

// 添加滚动效果
window.addEventListener('scroll', function () {
  const scrolled = window.pageYOffset;
  const rate = scrolled * -0.5;

  const header = document.querySelector('.header');
  if (header) {
    header.style.transform = `translateY(${rate}px)`;
  }
});

// 键盘快捷键支持
document.addEventListener('keydown', function (e) {
  // Ctrl+Enter 提交表单
  if (e.ctrlKey && e.key === 'Enter') {
    const submitForm = document.getElementById('calculatorForm');
    submitForm.dispatchEvent(new Event('submit'));
  }

  // ESC 清除结果
  if (e.key === 'Escape') {
    const resultsDiv = document.getElementById('results');
    const noResultsDiv = document.getElementById('noResults');

    resultsDiv.classList.add('hidden');
    noResultsDiv.classList.remove('hidden');
  }
});

// 导出结果功能
function exportResults() {
  const results = document.getElementById('results');
  if (results.classList.contains('hidden')) {
    alert('请先计算结果');
    return;
  }

  // 这里可以添加导出为PDF或打印的功能
  window.print();
}

// 重置表单功能
function resetForm() {
  const resetTargetForm = document.getElementById('calculatorForm');
  resetTargetForm.reset();

  // 隐藏结果
  const resultsDiv = document.getElementById('results');
  const noResultsDiv = document.getElementById('noResults');

  resultsDiv.classList.add('hidden');
  noResultsDiv.classList.remove('hidden');

  // 移除所有选中状态
  const radioOptions = document.querySelectorAll('.radio-option');
  radioOptions.forEach(option => {
    option.classList.remove('selected');
  });
}
