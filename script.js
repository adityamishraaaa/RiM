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

/* Variables */
let stepCount = 0;
let distanceTraveled = 0; // in km
let previousAcceleration = { x: null, y: null, z: null };
let isStepDetected = false;

// Sleep
let sleepStartTime = null;
let totalSleepHours = 0;

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

  if (savedStepCount !== null) {
    stepCount = parseInt(savedStepCount, 10);
    if (stepCountEl) stepCountEl.textContent = stepCount.toString();
  }
  if (savedDistance !== null) {
    distanceTraveled = parseFloat(savedDistance);
    if (distanceTraveledEl) distanceTraveledEl.textContent = distanceTraveled.toFixed(2);
  }
  if (savedSleepHours !== null) {
    totalSleepHours = parseFloat(savedSleepHours);
    if (sleepHoursEl) sleepHoursEl.textContent = totalSleepHours.toFixed(1);
  }
  if (savedSleepStart !== null) {
    sleepStartTime = new Date(savedSleepStart);
    if (sleepStartTime) {
      if (startSleepBtn) startSleepBtn.disabled = true;
      if (stopSleepBtn) stopSleepBtn.disabled = false;
    }
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
    // No special permission needed for some browsers
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
  if (distanceTraveledEl) distanceTraveledEl.textContent = distanceTraveled.toFixed(2);
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

  if (sleepHoursEl) sleepHoursEl.textContent = totalSleepHours.toFixed(1);
  if (startSleepBtn) startSleepBtn.disabled = false;
  if (stopSleepBtn) stopSleepBtn.disabled = true;
  saveHealthDataToStorage();
}

/****************************************************
 * 4) Initialize (only relevant on tracker.html)
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
  }
});
