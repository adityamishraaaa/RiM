/****************************************************
 * script.js
 * Shared or mainly used by tracker.html
 ****************************************************/

/* DOM References (tracker.html) */
const stepCountEl = document.getElementById('step-count');
const distanceTraveledEl = document.getElementById('distance-traveled');
const sleepHoursEl = document.getElementById('sleep-hours');

const startSleepBtn = document.getElementById('start-sleep-btn');
const stopSleepBtn = document.getElementById('stop-sleep-btn');

// Sedentary UI (for the "Sedentary Hours" card)
const sedentaryEl = document.getElementById('sedentary-hours');

/* Variables */
let stepCount = 0;
let distanceTraveled = 0; // in km
let previousAcceleration = { x: null, y: null, z: null };
let isStepDetected = false;

// Sleep
let sleepStartTime = null;
let totalSleepHours = 0;

// Sedentary
let lastActiveTime = Date.now();
let sedentaryMinutes = 0;
let checkSedentaryIntervalId = null;
const SEDENTARY_THRESHOLD_MINUTES = 60; // e.g., 60 min = 1 hour

// Constants for step counting
const stepThreshold = 1.2;
const stepLength = 0.8; // meters

/****************************************************
 * 1) Load/Save Health Data
 ****************************************************/
function loadHealthDataFromStorage() {
  const savedStepCount = localStorage.getItem('stepCount');
  const savedDistance = localStorage.getItem('distanceTraveled');
  const savedSleepHours = localStorage.getItem('totalSleepHours');
  const savedSleepStart = localStorage.getItem('sleepStartTime');

  // Sedentary
  const savedSedentary = localStorage.getItem('sedentaryMinutes');

  if (savedStepCount !== null) {
    stepCount = parseInt(savedStepCount, 10);
    if (stepCountEl) stepCountEl.textContent = stepCount.toString();
  }
  if (savedDistance !== null) {
    distanceTraveled = parseFloat(savedDistance);
    if (distanceTraveledEl) {
      distanceTraveledEl.textContent = distanceTraveled.toFixed(2);
    }
  }
  if (savedSleepHours !== null) {
    totalSleepHours = parseFloat(savedSleepHours);
    if (sleepHoursEl) {
      sleepHoursEl.textContent = totalSleepHours.toFixed(1);
    }
  }
  if (savedSleepStart !== null) {
    sleepStartTime = new Date(savedSleepStart);
    if (sleepStartTime) {
      if (startSleepBtn) startSleepBtn.disabled = true;
      if (stopSleepBtn) stopSleepBtn.disabled = false;
    }
  }

  if (savedSedentary !== null) {
    sedentaryMinutes = parseInt(savedSedentary, 10);
    updateSedentaryUI(); // Update the display
  }
}

function saveHealthDataToStorage() {
  localStorage.setItem('stepCount', stepCount.toString());
  localStorage.setItem('distanceTraveled', distanceTraveled.toString());
  localStorage.setItem('totalSleepHours', totalSleepHours.toString());

  if (sleepStartTime) {
    localStorage.setItem('sleepStartTime', sleepStartTime.toString());
  } else {
    localStorage.removeItem('sleepStartTime');
  }

  // Sedentary
  localStorage.setItem('sedentaryMinutes', sedentaryMinutes.toString());
}

/****************************************************
 * 2) Step Counting via DeviceMotion
 ****************************************************/
// Request permission (iOS)
function requestMotionPermission() {
  if (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function'
  ) {
    DeviceMotionEvent.requestPermission()
      .then((response) => {
        if (response === 'granted') {
          window.addEventListener('devicemotion', handleMotion, true);
        } else {
          console.warn('DeviceMotion permission not granted.');
        }
      })
      .catch(console.error);
  } else {
    // No special permission needed in some browsers
    window.addEventListener('devicemotion', handleMotion, true);
  }
}

function handleMotion(event) {
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;

  const { x, y, z } = acceleration;

  // If we already have previous acceleration, compare
  if (
    previousAcceleration.x !== null &&
    previousAcceleration.y !== null &&
    previousAcceleration.z !== null
  ) {
    const deltaX = Math.abs(x - previousAcceleration.x);
    const deltaY = Math.abs(y - previousAcceleration.y);
    const deltaZ = Math.abs(z - previousAcceleration.z);

    const magnitude = deltaX + deltaY + deltaZ;
    if (magnitude > stepThreshold && !isStepDetected) {
      stepCount++;
      lastActiveTime = Date.now(); // Reset inactivity time
      updateStepUI();

      isStepDetected = true;
      setTimeout(() => {
        isStepDetected = false;
      }, 300);
    }
  }

  previousAcceleration = { x, y, z };
}

function updateStepUI() {
  if (stepCountEl) stepCountEl.textContent = stepCount.toString();
  distanceTraveled = (stepCount * stepLength) / 1000; // in km
  if (distanceTraveledEl) {
    distanceTraveledEl.textContent = distanceTraveled.toFixed(2);
  }
  saveHealthDataToStorage();
}

/****************************************************
 * 3) Sleep Tracking
 ****************************************************/
function startSleepTracking() {
  sleepStartTime = new Date();
  if (startSleepBtn) startSleepBtn.disabled = true;
  if (stopSleepBtn) stopSleepBtn.disabled = false;
  saveHealthDataToStorage();
}

function stopSleepTracking() {
  if (!sleepStartTime) return;
  const now = new Date();
  const diffMs = now - sleepStartTime;
  const diffHours = diffMs / (1000 * 60 * 60);

  totalSleepHours += diffHours;
  sleepStartTime = null;

  if (sleepHoursEl) {
    sleepHoursEl.textContent = totalSleepHours.toFixed(1);
  }
  if (startSleepBtn) startSleepBtn.disabled = false;
  if (stopSleepBtn) stopSleepBtn.disabled = true;
  saveHealthDataToStorage();
}

/****************************************************
 * 4) Sedentary Tracking
 ****************************************************/
function checkSedentaryStatus() {
  const now = Date.now();
  const diffMinutes = (now - lastActiveTime) / (1000 * 60);

  // Example: if user hasn't moved for each full minute, count that as sedentary
  // Or you can only add 1 after hitting SEDENTARY_THRESHOLD_MINUTES, etc.
  if (diffMinutes >= 1) {
    // Increment by 1 minute of sedentary for each minute that passes
    // (Simplistic approach — you'd refine this logic for partial minutes, etc.)
    sedentaryMinutes += 1;
    lastActiveTime = now; // reset so we don't keep adding
    updateSedentaryUI();
    saveHealthDataToStorage();
  }
}

function updateSedentaryUI() {
  // Convert minutes to hours for display if desired
  const hours = (sedentaryMinutes / 60).toFixed(1);
  if (sedentaryEl) {
    sedentaryEl.textContent = hours; // e.g., "3.5" hours
  }
}

/****************************************************
 * 5) Nightly Meal Popup (10 PM)
 ****************************************************/
let hasShownMealPopupToday = false;

function showMealPopup() {
  const popup = document.getElementById('meal-popup');
  if (popup) {
    popup.style.display = 'block';
  }
}

function hideMealPopup() {
  const popup = document.getElementById('meal-popup');
  if (popup) {
    popup.style.display = 'none';
  }
}

function setupNightlyMealCheck() {
  // Check time every minute
  setInterval(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // If it's exactly 22:00 (10 PM) and we haven't shown popup today
    if (hours === 18 && minutes === 30 && !hasShownMealPopupToday) {
      showMealPopup();
      hasShownMealPopupToday = true;
    }

    // Reset after midnight for next day
    if (hours === 0 && minutes === 0) {
      hasShownMealPopupToday = false;
    }
  }, 60 * 1000);
}

function handleMealPopupSubmit() {
  const breakfast = document.querySelector('input[name="breakfast"]:checked')?.value;
  const lunch = document.querySelector('input[name="lunch"]:checked')?.value;
  const dinner = document.querySelector('input[name="dinner"]:checked')?.value;

  // Store with a date key
  const todayKey = new Date().toISOString().split('T')[0]; // e.g. "2025-02-06"
  const mealData = { breakfast, lunch, dinner };
  localStorage.setItem(`mealData-${todayKey}`, JSON.stringify(mealData));

  hideMealPopup();
}

/****************************************************
 * 6) Initialize (only relevant on tracker.html)
 ****************************************************/
window.addEventListener('load', () => {
  // If these elements do not exist, we are probably not on tracker.html.
  // So let's only run tracker logic if they exist.
  if (stepCountEl && distanceTraveledEl && sleepHoursEl) {
    loadHealthDataFromStorage();

    // Set up event listeners
    if (startSleepBtn) startSleepBtn.addEventListener('click', startSleepTracking);
    if (stopSleepBtn) stopSleepBtn.addEventListener('click', stopSleepTracking);

    // Ask for motion permission
    requestMotionPermission();

    // Start checking sedentary status every minute (or your desired interval)
    checkSedentaryIntervalId = setInterval(checkSedentaryStatus, 60 * 1000);

    // Set up nightly meal popup checks
    setupNightlyMealCheck();

    // Popup "Submit" button
    const mealPopupSubmitBtn = document.getElementById('meal-popup-submit');
    if (mealPopupSubmitBtn) {
      mealPopupSubmitBtn.addEventListener('click', handleMealPopupSubmit);
    }
  }
});
